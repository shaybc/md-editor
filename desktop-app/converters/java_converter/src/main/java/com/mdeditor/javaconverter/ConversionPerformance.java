package com.mdeditor.javaconverter;

import java.time.Duration;
import java.time.Instant;

record ConversionPerformance(
    Instant runStartedAt,
    Instant runFinishedAt,
    Duration totalRun,
    Duration projectScan,
    Duration metadataWrite,
    Duration analysisAndMarkdownWrite,
    Duration externalJarPageWrite,
    Duration reportWrite
) {
  static ConversionPerformance empty(Instant startedAt, Instant finishedAt) {
    return new ConversionPerformance(
        startedAt,
        finishedAt,
        Duration.between(startedAt, finishedAt),
        Duration.ZERO,
        Duration.ZERO,
        Duration.ZERO,
        Duration.ZERO,
        Duration.ZERO
    );
  }
}
