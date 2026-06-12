package com.mdeditor.javaconverter;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

record ConversionResult(
    int filesAnalyzed,
    int markdownFilesWritten,
    int localDependencyCount,
    int unresolvedCount,
    Instant startedAt,
    Instant finishedAt,
    Duration duration,
    List<String> diagnostics,
    List<String> unresolvedSymbols
) {
}
