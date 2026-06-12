package com.mdeditor.javaconverter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

final class ReportWriter {
  private ReportWriter() {
  }

  static void write(Path vault, ProjectModel project, AnalysisResult result) throws IOException {
    write(vault, project, new ConversionResult(
        result.sources().size(),
        result.sources().size(),
        result.localDependencyCount(),
        result.unresolvedCount(),
        java.time.Instant.EPOCH,
        java.time.Instant.EPOCH,
        java.time.Duration.ZERO,
        result.diagnostics(),
        result.unresolvedSymbols()
    ));
  }

  static void write(Path vault, ProjectModel project, ConversionResult result) throws IOException {
    List<String> lines = new ArrayList<>();
    lines.add("# Java Converter Report");
    lines.add("");
    lines.add("- Root: " + project.root());
    lines.add("- Started: " + ConversionClock.formatInstant(result.startedAt()));
    lines.add("- Finished: " + ConversionClock.formatInstant(result.finishedAt()));
    lines.add("- Duration: " + ConversionClock.formatDuration(result.duration()));
    lines.add("- Source files: " + project.sourceFiles().size());
    lines.add("- Files analyzed: " + result.filesAnalyzed());
    lines.add("- Markdown files: " + result.markdownFilesWritten());
    lines.add("- Local dependencies: " + result.localDependencyCount());
    lines.add("- Unresolved symbols: " + result.unresolvedCount());
    lines.add("- Classpath entries: " + project.classpathEntries().size());
    lines.add("- Maven modules detected: " + project.mavenModules());
    lines.add("");

    appendSection(lines, "Warnings", project.warnings());
    appendSection(lines, "Unresolved Symbols", result.unresolvedSymbols());
    appendSection(lines, "Compiler Diagnostics", result.diagnostics());

    Files.writeString(vault.resolve("_java_converter_report.md"), String.join("\n", lines), StandardCharsets.UTF_8);
  }

  private static void appendSection(List<String> lines, String title, List<String> values) {
    lines.add("## " + title);
    lines.add("");
    if (values.isEmpty()) {
      lines.add("None.");
    } else {
      values.forEach(value -> lines.add("- " + value));
    }
    lines.add("");
  }
}
