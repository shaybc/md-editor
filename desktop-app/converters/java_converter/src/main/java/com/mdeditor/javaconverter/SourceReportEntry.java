package com.mdeditor.javaconverter;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

record SourceReportEntry(
    Path sourceFile,
    String entityType,
    String entityId,
    String packageName,
    SourceFileModel.AnalysisStatus analysisStatus,
    Path duplicateOf,
    List<Path> localDependencies,
    List<DependencyEvidence> dependencyEvidence,
    Map<Path, List<String>> externalJarDependencies,
    List<UnresolvedDependencyModel> unresolvedDependencies
) {
  static SourceReportEntry from(SourceFileModel source) {
    return new SourceReportEntry(
        source.file,
        source.entityType,
        source.entityId,
        source.packageName,
        source.analysisStatus,
        source.duplicateOf,
        source.dependencies.stream().toList(),
        source.dependencyEvidence.stream().toList(),
        source.externalJarDependencies.entrySet().stream()
            .collect(java.util.stream.Collectors.toMap(
                Map.Entry::getKey,
                entry -> entry.getValue().stream().sorted().toList(),
                (left, right) -> left,
                java.util.LinkedHashMap::new
            )),
        source.unresolvedDependencies.stream().toList()
    );
  }
}
