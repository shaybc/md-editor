package com.mdeditor.javaconverter;

import java.nio.file.Path;

/** Records why the converter believes a source depends on another Java symbol. */
record DependencyEvidence(
    Path dependency,
    String symbol,
    String dependencySource,
    String confidence
) {
  DependencyEvidence {
    dependency = dependency == null ? null : dependency.toAbsolutePath().normalize();
    symbol = symbol == null ? "" : symbol;
    dependencySource = dependencySource == null ? "" : dependencySource;
    confidence = confidence == null ? "" : confidence;
  }
}
