package com.mdeditor.javaconverter;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
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
    /** Excluded because an identical copy (same FQN, same content hash) is analyzed elsewhere. */
    EXCLUDED_DUPLICATE
  }

  final Path file;
  String packageName = "";
  String entityType = "java_class";
  String entityId = "";
  final Set<Path> dependencies = new LinkedHashSet<>();
  final List<MethodInfo> methods = new ArrayList<>();
  AnalysisStatus analysisStatus = AnalysisStatus.ANALYZED;
  /** For EXCLUDED_DUPLICATE: the canonical file whose analysis this file mirrors. */
  Path duplicateOf;

  SourceFileModel(Path file) {
    this.file = file;
  }
}
