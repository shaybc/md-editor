package com.mdeditor.javaconverter.compileunit.sourceset;

import com.mdeditor.javaconverter.JavaConverterIgnoredDirectories;
import com.mdeditor.javaconverter.model.CompileUnit;
import com.mdeditor.javaconverter.model.CompileUnitOrigin;
import com.mdeditor.javaconverter.model.CompileUnitScope;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;

public final class SourceSetCompileUnitDetector {
  private static final Set<String> SKIPPED_DIRS = Set.of(
      ".git", ".github", ".gitlab", ".gitea", ".md-editor", ".hg", ".svn",
      ".idea", ".vscode", ".vs", ".settings", ".metadata", ".recommenders", ".externalToolBuilders",
      ".mvn", ".gradle", "node_modules", ".pnpm-store", ".yarn", ".yarn-cache", "bower_components",
      ".venv", "venv", "env", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
      ".tox", ".nox", ".ipynb_checkpoints", ".cxx", ".externalNativeBuild", "captures", ".cache",
      "out", "dist", "coverage", ".nyc_output", ".next", ".nuxt", ".svelte-kit", ".angular",
      ".turbo", ".parcel-cache", ".vite", "bin", "obj", "DerivedData", ".swiftpm", ".build"
  );
  private static final Set<String> SOURCE_SET_PARENTS = Set.of("src");
  private static final Set<String> GENERATED_PARENTS = Set.of("generated-source", "generated-sources");
  private static final Set<String> GENERATED_TEST_PARENTS = Set.of("generated-test-source", "generated-test-sources");

  private SourceSetCompileUnitDetector() {
  }

  public static SourceSetScanResult detect(
      Path root,
      List<Path> aggregateSourceFiles,
      String release,
      String source,
      String target,
      String encoding
  ) throws IOException {
    Path normalizedRoot = root.toAbsolutePath().normalize();
    List<String> warnings = new ArrayList<>();
    Map<Path, UnitBuilder> units = new LinkedHashMap<>();

    for (Path sourceFile : aggregateSourceFiles) {
      SourceRootMatch match = matchSourceRoot(normalizedRoot, sourceFile);
      if (match != null) {
        units.computeIfAbsent(match.root(), unitRoot ->
            new UnitBuilder(normalizedRoot, unitRoot, match.scope(), false)).sourceFiles.add(sourceFile);
      }
    }

    List<Path> knownEmptySourceRoots = new ArrayList<>();
    scanProject(normalizedRoot, warnings, units, knownEmptySourceRoots);
    for (Path emptyRoot : knownEmptySourceRoots.stream().distinct().sorted().toList()) {
      if (!units.containsKey(emptyRoot)) {
        warnings.add("Detected empty Java source set with no .java files: " + relative(normalizedRoot, emptyRoot));
      }
    }
    warnForNonStandardLayouts(normalizedRoot, warnings, aggregateSourceFiles);

    List<CompileUnit> compileUnits = units.values().stream()
        .filter(unit -> !unit.sourceFiles.isEmpty())
        .map(unit -> unit.toCompileUnit(release, source, target, encoding))
        .sorted(Comparator.comparing(CompileUnit::id))
        .toList();
    compileUnits.stream()
        .flatMap(unit -> unit.warnings().stream())
        .filter(warning -> !warnings.contains(warning))
        .forEach(warnings::add);
    return new SourceSetScanResult(compileUnits, warnings);
  }

  private static void scanProject(Path root, List<String> warnings, Map<Path, UnitBuilder> units,
      List<Path> knownEmptySourceRoots) throws IOException {
    try (Stream<Path> stream = Files.walk(root)) {
      for (Path path : stream
          .filter(path -> !path.equals(root))
          .filter(path -> !hasSkippedSegment(root, path))
          .sorted()
          .toList()) {
        if (Files.isDirectory(path)) {
          inspectDirectory(root, path.toAbsolutePath().normalize(), warnings, units, knownEmptySourceRoots);
        } else if (Files.isRegularFile(path) && path.getFileName().toString().endsWith(".java")) {
          inspectGeneratedJavaFile(root, path.toAbsolutePath().normalize(), units);
        }
      }
    }
  }

  private static void inspectDirectory(Path root, Path directory, List<String> warnings,
      Map<Path, UnitBuilder> units, List<Path> knownEmptySourceRoots) {
    DirectorySourceSet sourceSet = sourceSetDirectory(root, directory);
    if (sourceSet != null) {
      if (SourceSetPattern.isKnownJavaRoot(sourceSet.sourceSetName(), sourceSet.languageRoot())
          && !containsJavaFile(directory)) {
        knownEmptySourceRoots.add(directory);
      } else if (SourceSetPattern.isKotlinRoot(sourceSet.languageRoot())) {
        warnings.add("Detected Kotlin source root outside Java converter scope: " + relative(root, directory));
      }
    }
    attachResourceRoot(root, directory, units);
  }

  private static void inspectGeneratedJavaFile(Path root, Path javaFile, Map<Path, UnitBuilder> units) {
    Path generatedRoot = generatedRoot(root, javaFile).orElse(null);
    if (generatedRoot == null) {
      return;
    }
    units.computeIfAbsent(generatedRoot, unitRoot ->
        new UnitBuilder(root, unitRoot, CompileUnitScope.GENERATED, true)).sourceFiles.add(javaFile);
  }

  private static void attachResourceRoot(Path root, Path directory, Map<Path, UnitBuilder> units) {
    DirectorySourceSet sourceSet = sourceSetDirectory(root, directory);
    if (sourceSet == null || !sourceSet.languageRoot().equals("resources")) {
      return;
    }
    String expected = SourceSetPattern.resourceRootFor(sourceSet.sourceSetName());
    if (expected.isBlank()) {
      return;
    }
    Path javaRoot = directory.getParent().resolve("java").toAbsolutePath().normalize();
    UnitBuilder builder = units.get(javaRoot);
    if (builder != null) {
      builder.resourceRoots.add(directory);
    }
  }

  private static SourceRootMatch matchSourceRoot(Path root, Path sourceFile) {
    Path normalized = sourceFile.toAbsolutePath().normalize();
    Path relative = safeRelative(root, normalized).orElse(null);
    if (relative == null) {
      return null;
    }
    for (int i = 0; i + 2 < relative.getNameCount(); i += 1) {
      if (!SOURCE_SET_PARENTS.contains(relative.getName(i).toString())) {
        continue;
      }
      String sourceSetName = relative.getName(i + 1).toString();
      String languageRoot = relative.getName(i + 2).toString();
      Optional<CompileUnitScope> scope = SourceSetPattern.javaScope(sourceSetName, languageRoot);
      if (scope.isPresent()) {
        return new SourceRootMatch(root.resolve(relative.subpath(0, i + 3)).normalize(), scope.get());
      }
    }
    return null;
  }

  private static Optional<Path> generatedRoot(Path root, Path sourceFile) {
    Path relative = safeRelative(root, sourceFile).orElse(null);
    if (relative == null) {
      return Optional.empty();
    }
    for (int i = 0; i + 2 < relative.getNameCount(); i += 1) {
      String parent = relative.getName(i).toString();
      if (GENERATED_PARENTS.contains(parent) || GENERATED_TEST_PARENTS.contains(parent)) {
        return Optional.of(root.resolve(generatedSubpath(relative, i)).normalize());
      }
      if (parent.equals("generated") && i + 1 < relative.getNameCount() - 1) {
        String next = relative.getName(i + 1).toString();
        if (next.equals("source") || next.equals("sources")) {
          return Optional.of(root.resolve(generatedSubpath(relative, i + 1)).normalize());
        }
      }
    }
    return Optional.empty();
  }

  private static Path generatedSubpath(Path relative, int generatedIndex) {
    int endExclusive = Math.min(relative.getNameCount() - 1, generatedIndex + 2);
    for (int i = generatedIndex + 1; i < relative.getNameCount() - 1; i += 1) {
      if (relative.getName(i).toString().equals("java")) {
        endExclusive = Math.min(relative.getNameCount() - 1, i + 2);
        break;
      }
    }
    return relative.subpath(0, endExclusive);
  }

  private static DirectorySourceSet sourceSetDirectory(Path root, Path directory) {
    Path relative = safeRelative(root, directory).orElse(null);
    if (relative == null) {
      return null;
    }
    for (int i = 0; i + 2 < relative.getNameCount(); i += 1) {
      if (relative.getName(i).toString().equals("src") && i + 3 == relative.getNameCount()) {
        return new DirectorySourceSet(relative.getName(i + 1).toString(), relative.getName(i + 2).toString());
      }
    }
    return null;
  }

  private static void warnForNonStandardLayouts(Path root, List<String> warnings, List<Path> aggregateSourceFiles) {
    boolean srcDirectJava = aggregateSourceFiles.stream()
        .anyMatch(file -> safeRelative(root, file).map(relative ->
            relative.getNameCount() >= 2
                && relative.getName(0).toString().equals("src")
                && !relative.getName(1).toString().equals("main")
                && !relative.getName(1).toString().equals("test")
                && file.getParent().endsWith(root.resolve("src"))).orElse(false));
    if (srcDirectJava) {
      warnings.add("Detected non-standard Java layout with files directly under src/; using legacy compile unit fallback if no known source sets are found.");
    }
    Path topLevelJava = root.resolve("java");
    if (Files.isDirectory(topLevelJava) && containsJavaFile(topLevelJava)) {
      warnings.add("Detected non-standard top-level java/ source layout; using legacy compile unit fallback if no known source sets are found.");
    }
  }

  private static boolean containsJavaFile(Path directory) {
    try (Stream<Path> stream = Files.walk(directory)) {
      return stream.anyMatch(path -> Files.isRegularFile(path) && path.getFileName().toString().endsWith(".java"));
    } catch (IOException ignored) {
      return false;
    }
  }

  private static boolean hasSkippedSegment(Path root, Path path) {
    return safeRelative(root, path).isEmpty()
        || JavaConverterIgnoredDirectories.hasIgnoredSegment(root, path, SKIPPED_DIRS);
  }

  private static Optional<Path> safeRelative(Path root, Path path) {
    Path normalizedRoot = root.toAbsolutePath().normalize();
    Path normalizedPath = path.toAbsolutePath().normalize();
    if (!normalizedPath.startsWith(normalizedRoot)) {
      return Optional.empty();
    }
    return Optional.of(normalizedRoot.relativize(normalizedPath));
  }

  private static String relative(Path root, Path path) {
    return safeRelative(root, path)
        .map(relative -> relative.toString().replace('\\', '/'))
        .orElseGet(() -> path.toString().replace('\\', '/'));
  }

  private static final class UnitBuilder {
    private final Path projectRoot;
    private final Path unitRoot;
    private final CompileUnitScope scope;
    private final boolean generated;
    private final LinkedHashSet<Path> sourceFiles = new LinkedHashSet<>();
    private final LinkedHashSet<Path> resourceRoots = new LinkedHashSet<>();

    UnitBuilder(Path projectRoot, Path unitRoot, CompileUnitScope scope, boolean generated) {
      this.projectRoot = projectRoot;
      this.unitRoot = unitRoot;
      this.scope = scope;
      this.generated = generated;
    }

    CompileUnit toCompileUnit(String release, String source, String target, String encoding) {
      List<String> warnings = new ArrayList<>();
      if (sourceFiles.stream().anyMatch(file -> file.getFileName().toString().equals("module-info.java"))) {
        warnings.add("Detected module-info.java in " + relative(projectRoot, unitRoot)
            + "; JPMS metadata is recorded but analysis behavior is unchanged.");
      }
      return new CompileUnit(
          "sourceset:" + relative(projectRoot, unitRoot),
          relative(projectRoot, unitRoot),
          CompileUnitOrigin.INFERRED,
          scope,
          unitRoot,
          null,
          generated ? List.of() : List.of(unitRoot),
          generated ? List.of(unitRoot) : List.of(),
          List.of(),
          sourceFiles.stream().sorted().toList(),
          resourceRoots.stream().sorted().toList(),
          List.of(),
          List.of(),
          release,
          source,
          target,
          encoding,
          warnings
      );
    }
  }

  private record SourceRootMatch(Path root, CompileUnitScope scope) {
  }

  private record DirectorySourceSet(String sourceSetName, String languageRoot) {
  }
}
