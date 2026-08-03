package com.mdeditor.javaconverter.compileunit.maven;

import com.mdeditor.javaconverter.ConversionClock;
import com.mdeditor.javaconverter.model.CompileUnit;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class MavenCompileUnitDetector {
  private MavenCompileUnitDetector() {
  }

  public static MavenCompileUnitScanResult detect(
      Path root,
      List<Path> poms,
      List<Path> aggregateClasspath,
      String release,
      String source,
      String target,
      String encoding
  ) {
    Path normalizedRoot = root.toAbsolutePath().normalize();
    List<String> warnings = new ArrayList<>();
    List<MavenModuleDescriptor> descriptors = poms.stream()
        .sorted()
        .peek(pom -> ConversionClock.log("Reading Maven module metadata: " + relative(normalizedRoot, pom)))
        .map(pom -> MavenPomReader.read(pom, release, source, target, encoding))
        .peek(descriptor -> warnings.addAll(descriptor.warnings()))
        .toList();
    Map<String, MavenReactorUnitContext> reactorContexts = reactorContexts(normalizedRoot, descriptors);
    List<CompileUnit> units = new ArrayList<>();
    for (MavenModuleDescriptor descriptor : descriptors) {
      List<CompileUnit> moduleUnits = MavenCompileUnitFactory.fromDescriptor(
          normalizedRoot,
          descriptor,
          reactorContexts,
          aggregateClasspath,
          warnings
      );
      logReactorSourceRoots(normalizedRoot, moduleUnits);
      warnForSourceLessReactorDependencies(normalizedRoot, descriptor, reactorContexts, warnings);
      if (moduleUnits.isEmpty() && !descriptor.modules().isEmpty() && !hasAnyJavaSourceRoot(descriptor)) {
        ConversionClock.log("Skipped Maven aggregator module with no Java source sets: "
            + relative(normalizedRoot, descriptor.moduleRoot()));
        continue;
      }
      if (moduleUnits.isEmpty()) {
        ConversionClock.log("Maven module has no Java source files: "
            + relative(normalizedRoot, descriptor.moduleRoot()));
        warnings.add("Maven module has no Java source files: " + relative(normalizedRoot, descriptor.moduleRoot()));
      }
      units.addAll(moduleUnits);
    }
    return new MavenCompileUnitScanResult(
        units.stream().sorted(Comparator.comparing(CompileUnit::id)).toList(),
        warnings.stream().distinct().sorted().toList()
    );
  }

  private static Map<String, MavenReactorUnitContext> reactorContexts(Path root,
      List<MavenModuleDescriptor> descriptors) {
    Map<String, MavenReactorUnitContext> contexts = new LinkedHashMap<>();
    descriptors.stream()
        .filter(descriptor -> descriptor.groupId() != null && !descriptor.groupId().isBlank())
        .filter(descriptor -> descriptor.artifactId() != null && !descriptor.artifactId().isBlank())
        .sorted(Comparator.comparing(MavenModuleDescriptor::coordinateKey))
        .forEach(descriptor -> contexts.put(descriptor.coordinateKey(), reactorContext(root, descriptor)));
    return contexts;
  }

  private static MavenReactorUnitContext reactorContext(Path root, MavenModuleDescriptor descriptor) {
    String module = moduleId(root, descriptor.moduleRoot());
    List<Path> mainRoots = sourceRoots(descriptor.mainSourceDirectory());
    List<Path> testRoots = sourceRoots(descriptor.testSourceDirectory());
    List<Path> integrationRoots = sourceRoots(descriptor.moduleRoot().resolve("src/integration-test/java").normalize());
    return new MavenReactorUnitContext(
        mainRoots.isEmpty() ? null : "maven:" + module + ":main",
        testRoots.isEmpty() ? null : "maven:" + module + ":test",
        integrationRoots.isEmpty() ? null : "maven:" + module + ":integration-test",
        mainRoots,
        testRoots,
        integrationRoots
    );
  }

  private static List<Path> sourceRoots(Path sourceRoot) {
    Path normalized = sourceRoot.toAbsolutePath().normalize();
    return MavenCompileUnitFactory.hasJavaFiles(normalized) ? List.of(normalized) : List.of();
  }

  private static void logReactorSourceRoots(Path root, List<CompileUnit> units) {
    for (CompileUnit unit : units) {
      if (!unit.dependencySourceRoots().isEmpty()) {
        ConversionClock.log("Maven compile unit " + unit.id() + " receives "
            + unit.dependencySourceRoots().size() + " same-repo Maven dependency source root(s): "
            + unit.dependencySourceRoots().stream().map(path -> relative(root, path)).toList());
      }
    }
  }

  private static void warnForSourceLessReactorDependencies(Path root, MavenModuleDescriptor descriptor,
      Map<String, MavenReactorUnitContext> reactorContexts, List<String> warnings) {
    for (MavenDependency dependency : descriptor.dependencies()) {
      MavenReactorUnitContext context = reactorContexts.get(dependency.coordinateKey());
      if (context == null) {
        continue;
      }
      if (context.mainSourceRoots().isEmpty()
          && context.testSourceRoots().isEmpty()
          && context.integrationTestSourceRoots().isEmpty()) {
        warnings.add("Maven dependency " + dependency.coordinateKey() + " from "
            + relative(root, descriptor.pom()) + " matched a reactor module with no Java source roots.");
      }
    }
  }

  private static boolean hasAnyJavaSourceRoot(MavenModuleDescriptor descriptor) {
    return Files.isDirectory(descriptor.mainSourceDirectory())
        || Files.isDirectory(descriptor.testSourceDirectory())
        || Files.isDirectory(descriptor.moduleRoot().resolve("src/integration-test/java"));
  }

  private static String moduleId(Path root, Path moduleRoot) {
    String relative = relative(root, moduleRoot);
    return relative.isBlank() ? "." : relative;
  }

  private static String relative(Path root, Path path) {
    Path normalizedRoot = root.toAbsolutePath().normalize();
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
