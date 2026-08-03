package com.mdeditor.javaconverter;

import java.util.List;

record AnalysisResult(
    List<SourceFileModel> sources,
    List<String> diagnostics,
    List<String> unresolvedSymbols
) {
  int localDependencyCount() {
    return sources.stream().mapToInt(source -> source.dependencies.size()).sum();
  }

  int unresolvedCount() {
    return unresolvedSymbols.size();
  }
}
