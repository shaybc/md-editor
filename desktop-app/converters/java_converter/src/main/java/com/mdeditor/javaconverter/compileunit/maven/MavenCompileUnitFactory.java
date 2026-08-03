package com.mdeditor.javaconverter.compileunit.maven;

import com.mdeditor.javaconverter.JavaConverterIgnoredDirectories;
import com.mdeditor.javaconverter.model.CompileUnit;
import com.mdeditor.javaconverter.model.CompileUnitOrigin;
import com.mdeditor.javaconverter.model.CompileUnitScope;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

final class MavenCompileUnitFactory {
  private MavenCompileUnitFactory() {
  }

  static List<CompileUnit> fromDescriptor(
      Path projectRoot,
      MavenModuleDescriptor descriptor,
      Map<String, MavenReactorUnitContext> reactorContexts,
      List<Path> aggregateClasspath,
      List<String> warnings
  ) {
    List<CompileUnit> units = new ArrayList<>();
    createUnit(projectRoot, descriptor, CompileUnitScope.MAIN, "main", descriptor.mainSourceDirectory(),
        descriptor.mainResourceDirectories(), generatedRoots(descriptor.moduleRoot().resolve("target/generated-sources")),
        classpathFor(descriptor, aggregateClasspath, false), reactorDependencies(descriptor, reactorContexts, CompileUnitScope.MAIN),
        reactorSourceRoots(descriptor, reactorContexts, CompileUnitScope.MAIN),
        warnings).ifPresent(units::add);
    createUnit(projectRoot, descriptor, CompileUnitScope.TEST, "test", descriptor.testSourceDirectory(),
        descriptor.testResourceDirectories(), generatedRoots(descriptor.moduleRoot().resolve("target/generated-test-sources")),
        classpathFor(descriptor, aggregateClasspath, true), reactorDependencies(descriptor, reactorContexts, CompileUnitScope.TEST),
        reactorSourceRoots(descriptor, reactorContexts, CompileUnitScope.TEST),
        warnings).ifPresent(units::add);
    Path integrationRoot = descriptor.moduleRoot().resolve("src/integration-test/java").normalize();
    Path integrationResourceRoot = descriptor.moduleRoot().resolve("src/integration-test/resources").normalize();
    createUnit(projectRoot, descriptor, CompileUnitScope.INTEGRATION_TEST, "integration-test", integrationRoot,
        List.of(integrationResourceRoot), List.of(), classpathFor(descriptor, aggregateClasspath, true),
        reactorDependencies(descriptor, reactorContexts, CompileUnitScope.INTEGRATION_TEST),
        reactorSourceRoots(descriptor, reactorContexts, CompileUnitScope.INTEGRATION_TEST), warnings).ifPresent(units::add);
    return units.stream().sorted(Comparator.comparing(CompileUnit::id)).toList();
  }

  private static Optional<CompileUnit> createUnit(
      Path projectRoot,
      MavenModuleDescriptor descriptor,
      CompileUnitScope scope,
      String sourceSetName,
      Path sourceRoot,
      List<Path> resourceRoots,
      List<Path> generatedSourceRoots,
      List<Path> classpathEntries,
      List<String> dependencyUnitIds,
      List<Path> dependencySourceRoots,
      List<String> projectWarnings
  ) {
    Path normalizedSourceRoot = sourceRoot.toAbsolutePath().normalize();
    List<Path> sourceFiles = javaFiles(normalizedSourceRoot);
    if (sourceFiles.isEmpty()) {
      if (Files.isDirectory(normalizedSourceRoot)) {
        projectWarnings.add("Detected empty Maven Java source set with no .java files: "
            + relative(projectRoot, normalizedSourceRoot));
      }
      return Optional.empty();
    }
    List<String> unitWarnings = new ArrayList<>();
    if (sourceFiles.stream().anyMatch(path -> path.getFileName().toString().equals("module-info.java"))) {
      unitWarnings.add("Detected module-info.java in Maven unit " + relative(projectRoot, normalizedSourceRoot)
          + "; JPMS metadata is recorded but analysis behavior is unchanged.");
    }
    warnForKotlinSibling(projectRoot, descriptor, sourceSetName, projectWarnings);
    return Optional.of(new CompileUnit(
        "maven:" + moduleId(projectRoot, descriptor.moduleRoot()) + ":" + sourceSetName,
        displayName(projectRoot, descriptor, sourceSetName),
        CompileUnitOrigin.MAVEN,
        scope,
        descriptor.moduleRoot(),
        descriptor.pom(),
        List.of(normalizedSourceRoot),
        generatedSourceRoots,
        dependencySourceRoots,
        sourceFiles,
        resourceRoots.stream()
            .map(path -> path.toAbsolutePath().normalize())
            .filter(Files::isDirectory)
            .sorted()
            .toList(),
        classpathEntries,
        dependencyUnitIds,
        descriptor.release(),
        descriptor.source(),
        descriptor.target(),
        descriptor.encoding(),
        unitWarnings
    ));
  }

  private static List<Path> javaFiles(Path sourceRoot) {
    if (!Files.isDirectory(sourceRoot)) {
      return List.of();
    }
    try (Stream<Path> stream = Files.walk(sourceRoot)) {
      return stream
          .filter(Files::isRegularFile)
          .filter(path -> path.getFileName().toString().endsWith(".java"))
          .filter(path -> !JavaConverterIgnoredDirectories.hasIgnoredSegment(
              sourceRoot,
              path,
              JavaConverterIgnoredDirectories.WORKSPACE_TOOLING_DIRS
          ))
          .map(path -> path.toAbsolutePath().normalize())
          .sorted()
          .toList();
    } catch (IOException ignored) {
      return List.of();
    }
  }

  private static List<Path> generatedRoots(Path parent) {
    if (!Files.isDirectory(parent)) {
      return List.of();
    }
    try (Stream<Path> stream = Files.list(parent)) {
      return stream
          .filter(Files::isDirectory)
          .map(path -> path.toAbsolutePath().normalize())
          .filter(path -> !javaFiles(path).isEmpty())
          .sorted()
          .toList();
    } catch (IOException ignored) {
      return List.of();
    }
  }

  private static List<Path> classpathFor(MavenModuleDescriptor descriptor, List<Path> aggregateClasspath,
      boolean includeTestOutput) {
    LinkedHashSet<Path> classpath = new LinkedHashSet<>();
    Path classes = descriptor.moduleRoot().resolve("target/classes").toAbsolutePath().normalize();
    Path testClasses = descriptor.moduleRoot().resolve("target/test-classes").toAbsolutePath().normalize();
    if (Files.isDirectory(classes)) {
      classpath.add(classes);
    }
    if (includeTestOutput && Files.isDirectory(testClasses)) {
      classpath.add(testClasses);
    }
    aggregateClasspath.stream()
        .map(path -> path.toAbsolutePath().normalize())
        .filter(path -> path.startsWith(descriptor.moduleRoot()) || Files.isRegularFile(path))
        .sorted()
        .forEach(classpath::add);
    return List.copyOf(classpath);
  }

  static boolean hasJavaFiles(Path sourceRoot) {
    return !javaFiles(sourceRoot.toAbsolutePath().normalize()).isEmpty();
  }

  private static List<String> reactorDependencies(MavenModuleDescriptor descriptor,
      Map<String, MavenReactorUnitContext> reactorContexts, CompileUnitScope scope) {
    LinkedHashSet<String> ids = new LinkedHashSet<>();
    for (MavenDependency dependency : descriptor.dependencies()) {
      MavenReactorUnitContext context = reactorContexts.get(dependency.coordinateKey());
      if (context == null || ignoredScope(dependency)) {
        continue;
      }
      if (includeMainDependency(scope, dependency) && context.mainUnitId() != null) {
        ids.add(context.mainUnitId());
      }
      if (includeTestDependency(scope, dependency) && context.testUnitId() != null) {
        ids.add(context.testUnitId());
      }
    }
    return ids.stream().sorted().toList();
  }

  private static List<Path> reactorSourceRoots(MavenModuleDescriptor descriptor,
      Map<String, MavenReactorUnitContext> reactorContexts, CompileUnitScope scope) {
    LinkedHashSet<Path> roots = new LinkedHashSet<>();
    for (MavenDependency dependency : descriptor.dependencies()) {
      MavenReactorUnitContext context = reactorContexts.get(dependency.coordinateKey());
      if (context == null || ignoredScope(dependency)) {
        continue;
      }
      if (includeMainDependency(scope, dependency)) {
        roots.addAll(context.mainSourceRoots());
      }
      if (includeTestDependency(scope, dependency)) {
        roots.addAll(context.testSourceRoots());
      }
    }
    return roots.stream().sorted().toList();
  }

  private static boolean includeMainDependency(CompileUnitScope scope, MavenDependency dependency) {
    String dependencyScope = normalizedScope(dependency);
    if (scope == CompileUnitScope.MAIN) {
      return dependencyScope.equals("compile")
          || dependencyScope.equals("provided")
          || dependencyScope.equals("runtime")
          || dependencyScope.isBlank();
    }
    return dependencyScope.equals("compile")
        || dependencyScope.equals("provided")
        || dependencyScope.equals("runtime")
        || dependencyScope.equals("test")
        || dependencyScope.isBlank();
  }

  private static boolean includeTestDependency(CompileUnitScope scope, MavenDependency dependency) {
    if (scope == CompileUnitScope.MAIN || !normalizedScope(dependency).equals("test")) {
      return false;
    }
    return "test-jar".equalsIgnoreCase(dependency.type())
        || "tests".equalsIgnoreCase(dependency.classifier());
  }

  private static boolean ignoredScope(MavenDependency dependency) {
    String scope = normalizedScope(dependency);
    return scope.equals("import") || scope.equals("system");
  }

  private static String normalizedScope(MavenDependency dependency) {
    return dependency.scope() == null ? "" : dependency.scope().trim().toLowerCase(java.util.Locale.ROOT);
  }

  private static void warnForKotlinSibling(Path projectRoot, MavenModuleDescriptor descriptor, String sourceSetName,
      List<String> warnings) {
    Path kotlinRoot = descriptor.moduleRoot().resolve("src").resolve(sourceSetName).resolve("kotlin").normalize();
    if (Files.isDirectory(kotlinRoot)) {
      warnings.add("Detected Kotlin source root outside Java converter scope: " + relative(projectRoot, kotlinRoot));
    }
  }

  private static String moduleId(Path projectRoot, Path moduleRoot) {
    String relative = relative(projectRoot, moduleRoot);
    return relative.isBlank() ? "." : relative;
  }

  private static String displayName(Path projectRoot, MavenModuleDescriptor descriptor, String sourceSetName) {
    String module = moduleId(projectRoot, descriptor.moduleRoot());
    String artifact = descriptor.artifactId() == null || descriptor.artifactId().isBlank()
        ? module
        : descriptor.artifactId();
    return artifact + " [" + sourceSetName + "]";
  }

  private static String relative(Path projectRoot, Path path) {
    Path normalizedRoot = projectRoot.toAbsolutePath().normalize();
    Path normalizedPath = path.toAbsolutePath().normalize();
    if (normalizedPath.equals(normalizedRoot)) {
      return ".";
    }
    if (normalizedPath.startsWith(normalizedRoot)) {
      return normalizedRoot.relativize(normalizedPath).toString().replace('\\', '/');
    }
    return normalizedPath.toString().replace('\\', '/');
  }
}
