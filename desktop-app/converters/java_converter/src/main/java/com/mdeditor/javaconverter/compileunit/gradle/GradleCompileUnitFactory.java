package com.mdeditor.javaconverter.compileunit.gradle;

import com.mdeditor.javaconverter.model.CompileUnit;
import com.mdeditor.javaconverter.model.CompileUnitOrigin;
import com.mdeditor.javaconverter.model.CompileUnitScope;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;

final class GradleCompileUnitFactory {
  private GradleCompileUnitFactory() {
  }

  static GradleCompileUnitScanResult fromMetadata(Path projectRoot, GradleMetadataRun run) {
    List<String> warnings = new ArrayList<>();
    Map<String, GradleMetadataRecord> mainRecordsByProject = new LinkedHashMap<>();
    Map<RecordKey, String> idsByRecord = new LinkedHashMap<>();
    for (GradleMetadataRecord record : run.records()) {
      RecordKey key = new RecordKey(record.projectPath(), record.sourceSetName());
      idsByRecord.put(key, id(record));
      if (record.sourceSetName().equals("main")) {
        mainRecordsByProject.put(record.projectPath(), record);
      }
    }

    List<CompileUnit> units = new ArrayList<>();
    LinkedHashSet<Path> classpathEntries = new LinkedHashSet<>();
    int dependencyCount = 0;
    for (GradleMetadataRecord record : run.records()) {
      List<Path> sourceFiles = existingJavaFiles(record.sourceFiles());
      if (sourceFiles.isEmpty()) {
        warnings.add("Detected empty Gradle Java source set with no .java files: "
            + record.projectPath() + ":" + record.sourceSetName());
        continue;
      }
      classpathEntries.addAll(record.classpathEntries());
      List<String> dependencyUnitIds = new ArrayList<>();
      LinkedHashSet<Path> dependencySourceRoots = new LinkedHashSet<>();
      for (String dependencyProjectPath : record.projectDependencyPaths()) {
        GradleMetadataRecord dependencyMain = mainRecordsByProject.get(dependencyProjectPath);
        if (dependencyMain == null) {
          continue;
        }
        dependencyUnitIds.add(id(dependencyMain));
        dependencySourceRoots.addAll(dependencyMain.sourceRoots());
        dependencySourceRoots.addAll(dependencyMain.generatedSourceRoots());
      }
      dependencyCount += dependencyUnitIds.size();
      List<String> unitWarnings = new ArrayList<>();
      if (sourceFiles.stream().anyMatch(path -> path.getFileName().toString().equals("module-info.java"))) {
        unitWarnings.add("Detected module-info.java in Gradle unit " + record.projectPath() + ":"
            + record.sourceSetName() + "; JPMS metadata is recorded but analysis behavior is unchanged.");
      }
      units.add(new CompileUnit(
          id(record),
          displayName(record),
          CompileUnitOrigin.GRADLE,
          scope(record.sourceSetName()),
          record.projectDir(),
          record.buildFile(),
          existingDirectories(record.sourceRoots()),
          existingDirectories(record.generatedSourceRoots()),
          dependencySourceRoots.stream().filter(Files::isDirectory).sorted().toList(),
          sourceFiles,
          existingDirectories(record.resourceRoots()),
          record.classpathEntries().stream()
              .filter(path -> Files.isDirectory(path) || Files.isRegularFile(path))
              .sorted()
              .toList(),
          dependencyUnitIds.stream().distinct().sorted().toList(),
          record.release(),
          record.source(),
          record.target(),
          record.encoding(),
          unitWarnings
      ));
    }
    warnings.add("Gradle metadata extraction succeeded using " + run.launcher() + ": " + units.size()
        + " Java source set(s), " + classpathEntries.size() + " classpath entries, "
        + dependencyCount + " project dependency link(s).");
    return new GradleCompileUnitScanResult(
        units.stream().sorted(Comparator.comparing(CompileUnit::id)).toList(),
        warnings,
        classpathEntries.stream()
            .filter(path -> Files.isDirectory(path) || Files.isRegularFile(path))
            .sorted()
            .toList()
    );
  }

  private static List<Path> existingJavaFiles(List<Path> sourceFiles) {
    return sourceFiles.stream()
        .filter(Files::isRegularFile)
        .filter(path -> path.getFileName().toString().endsWith(".java"))
        .sorted()
        .toList();
  }

  private static List<Path> existingDirectories(List<Path> paths) {
    return paths.stream()
        .filter(Files::isDirectory)
        .sorted()
        .toList();
  }

  private static String id(GradleMetadataRecord record) {
    return "gradle:" + moduleId(record.projectPath()) + ":" + record.sourceSetName();
  }

  private static String moduleId(String projectPath) {
    if (projectPath == null || projectPath.isBlank() || projectPath.equals(":")) {
      return ".";
    }
    return projectPath.replaceFirst("^:", "").replace(':', '/');
  }

  private static String displayName(GradleMetadataRecord record) {
    return moduleId(record.projectPath()) + " [" + record.sourceSetName() + "]";
  }

  private static CompileUnitScope scope(String sourceSetName) {
    String normalized = sourceSetName == null ? "" : sourceSetName.toLowerCase(Locale.ROOT).replace('_', '-');
    if (normalized.equals("main")) {
      return CompileUnitScope.MAIN;
    }
    if (normalized.equals("test-fixtures") || normalized.equals("testfixtures")) {
      return CompileUnitScope.TEST_FIXTURES;
    }
    if (normalized.contains("integration") && normalized.contains("test")) {
      return CompileUnitScope.INTEGRATION_TEST;
    }
    if (normalized.contains("benchmark")) {
      return CompileUnitScope.BENCHMARK;
    }
    if (normalized.contains("generated")) {
      return CompileUnitScope.GENERATED;
    }
    if (normalized.contains("test")) {
      return CompileUnitScope.TEST;
    }
    return CompileUnitScope.UNKNOWN;
  }

  private record RecordKey(String projectPath, String sourceSetName) {
  }
}
