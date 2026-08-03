package com.mdeditor.javaconverter;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class SourceFileModel {
  /** Outcome of dependency analysis for this file. Surfaced in the Markdown frontmatter so a
   *  file whose analysis was skipped is never mistaken for one that genuinely has no
   *  dependencies. */
  enum AnalysisStatus {
    /** Fully attributed and scanned; dependencies/methods are complete. */
    ANALYZED,
    /** Attribution exceeded the time budget and was skipped; dependencies are incomplete. */
    TIMED_OUT,
    /** Attribution threw a compiler error; dependencies may be incomplete. */
    FAILED,
    /** Compiler attribution was skipped; parse-only import dependencies may be incomplete. */
    PARSE_ONLY,
    /** Excluded because an identical copy (same FQN, same content hash) is analyzed elsewhere. */
    EXCLUDED_DUPLICATE
  }

  final Path file;
  String packageName = "";
  String entityType = "java_class";
  String entityId = "";
  final Set<Path> dependencies = new LinkedHashSet<>();
  final Map<Path, Set<String>> externalJarDependencies = new LinkedHashMap<>();
  final Map<String, Set<Path>> externalClassProviders = new LinkedHashMap<>();
  final List<UnresolvedDependencyModel> unresolvedDependencies = new ArrayList<>();
  final Set<DependencyEvidence> dependencyEvidence = new LinkedHashSet<>();
  final List<MethodInfo> methods = new ArrayList<>();
  AnalysisStatus analysisStatus = AnalysisStatus.ANALYZED;
  /** For EXCLUDED_DUPLICATE: the canonical file whose analysis this file mirrors. */
  Path duplicateOf;

  SourceFileModel(Path file) {
    this.file = file;
  }

  void addExternalJarDependency(ExternalJarModel jar, String qualifiedClassName) {
    if (jar == null || qualifiedClassName == null || qualifiedClassName.isBlank()) {
      return;
    }
    Path jarPath = jar.path();
    externalJarDependencies.computeIfAbsent(jarPath, key -> new LinkedHashSet<>()).add(qualifiedClassName);
    externalClassProviders.computeIfAbsent(qualifiedClassName, key -> new LinkedHashSet<>()).add(jarPath);
  }

  void addDependencyEvidence(Path dependency, String symbol, String dependencySource, String confidence) {
    if (dependency != null && !dependency.equals(file)) {
      dependencies.add(dependency);
    }
    dependencyEvidence.add(new DependencyEvidence(dependency, symbol, dependencySource, confidence));
  }

  void addUnresolvedDependency(UnresolvedDependencyModel dependency) {
    if (dependency == null || dependency.symbol() == null || dependency.symbol().isBlank()) {
      return;
    }
    boolean alreadyRecorded = unresolvedDependencies.stream().anyMatch(existing ->
        existing.symbol().equals(dependency.symbol())
            && existing.kind().equals(dependency.kind())
            && existing.staticImport() == dependency.staticImport()
            && existing.wildcard() == dependency.wildcard()
            && existing.line() == dependency.line());
    if (!alreadyRecorded) {
      unresolvedDependencies.add(dependency);
    }
  }
}
