package com.mdeditor.javaconverter;

import com.mdeditor.javaconverter.model.CompileUnit;

/** Shared analysis-mode markers carried on compile units. */
final class JavaAnalysisMode {
  static final String GRADLE_PARSE_ONLY =
      "Gradle build files detected, but real Gradle metadata could not be extracted; using parse-only Java analysis.";

  private JavaAnalysisMode() {
  }

  static boolean isParseOnly(CompileUnit unit) {
    return unit.warnings().contains(GRADLE_PARSE_ONLY);
  }
}
