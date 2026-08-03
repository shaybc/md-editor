package com.mdeditor.javaconverter;

import com.mdeditor.javaconverter.model.CompileUnit;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

final class ReportWriter {
  static final String REPORT_JSON_FILE = "missing_dependencies_report.json";
  static final String REPORT_MARKDOWN_FILE = "missing_dependencies_report.md";
  static final String MD_EDITOR_DIR = ".md-editor";

  private ReportWriter() {
  }

  static void write(Path vault, ProjectModel project, AnalysisResult result) throws IOException {
    java.time.Instant startedAt = java.time.Instant.EPOCH;
    write(vault, project, new ConversionResult(
        result.sources().size(),
        result.sources().size(),
        result.localDependencyCount(),
        result.unresolvedCount(),
        startedAt,
        java.time.Instant.EPOCH,
        java.time.Duration.ZERO,
        result.diagnostics(),
        result.unresolvedSymbols(),
        result.sources().stream().map(SourceReportEntry::from).toList()
    ), project.root(), ConversionPerformance.empty(startedAt, startedAt));
  }

  static void write(Path vault, ProjectModel project, ConversionResult result) throws IOException {
    write(vault, project, result, project.root());
  }

  static void write(Path vault, ProjectModel project, ConversionResult result, Path sourceRootHome) throws IOException {
    write(vault, project, result, sourceRootHome,
        ConversionPerformance.empty(result.startedAt(), result.finishedAt()));
  }

  static void write(Path vault, ProjectModel project, ConversionResult result, Path sourceRootHome,
      ConversionPerformance performance) throws IOException {
    Files.createDirectories(vault.resolve(MD_EDITOR_DIR));
    writeJson(vault, project, result, sourceRootHome, performance);

    List<String> lines = new ArrayList<>();
    lines.add("# Java Converter Report");
    lines.add("");
    lines.add("- Root: " + project.root());
    lines.add("- Source root home: " + sourceRootHome);
    lines.add("- Started: " + ConversionClock.formatInstant(result.startedAt()));
    lines.add("- Finished: " + ConversionClock.formatInstant(result.finishedAt()));
    lines.add("- Analysis/write duration: " + ConversionClock.formatDuration(result.duration()));
    lines.add("- Total run duration: " + ConversionClock.formatDuration(performance.totalRun()));
    lines.add("- Source files: " + project.sourceFiles().size());
    lines.add("- Files analyzed: " + result.filesAnalyzed());
    lines.add("- Markdown files: " + result.markdownFilesWritten());
    lines.add("- Local dependencies: " + result.localDependencyCount());
    lines.add("- Unresolved symbols: " + result.unresolvedCount());
    lines.add("- Classpath entries: " + project.classpathEntries().size());
    lines.add("- Indexed external jars: " + project.externalJarIndex().jars().size());
    lines.add("- Maven modules detected: " + project.mavenModules());
    lines.add("- Gradle build files detected: " + project.gradleModules());
    lines.add("- Compile units: " + project.compileUnits().size());
    lines.add("");

    lines.add("## Performance");
    lines.add("");
    lines.add("- Project scan: " + ConversionClock.formatDuration(performance.projectScan()));
    lines.add("- Metadata write: " + ConversionClock.formatDuration(performance.metadataWrite()));
    lines.add("- Analysis and Markdown write: "
        + ConversionClock.formatDuration(performance.analysisAndMarkdownWrite()));
    lines.add("- External jar page write: " + ConversionClock.formatDuration(performance.externalJarPageWrite()));
    lines.add("- Report write: " + ConversionClock.formatDuration(performance.reportWrite()));
    lines.add("- Total run: " + ConversionClock.formatDuration(performance.totalRun()));
    lines.add("");

    appendSection(lines, "Warnings", project.warnings());
    appendSection(lines, "Unresolved Symbols", result.unresolvedSymbols());
    appendSection(lines, "Compiler Diagnostics", result.diagnostics());

    Files.writeString(vault.resolve(MD_EDITOR_DIR).resolve(REPORT_MARKDOWN_FILE), String.join("\n", lines), StandardCharsets.UTF_8);
  }

  private static void writeJson(Path vault, ProjectModel project, ConversionResult result, Path sourceRootHome,
      ConversionPerformance performance) throws IOException {
    JsonBuilder json = new JsonBuilder();
    json.beginObject();
    json.nameValue("schemaVersion", 1);
    json.nameValue("generator", "java_converter");
    json.nameValue("language", "java");
    json.nameValue("root", project.root().toString());
    json.nameValue("sourceRootPath", sourceRootHome.toString().replace('\\', '/'));
    json.nameValue("vault", vault.toString());
    json.nameValue("startedAt", ConversionClock.formatInstant(result.startedAt()));
    json.nameValue("finishedAt", ConversionClock.formatInstant(result.finishedAt()));
    json.nameValue("duration", ConversionClock.formatDuration(result.duration()));
    json.name("performance").beginObject();
    json.nameValue("runStartedAt", ConversionClock.formatInstant(performance.runStartedAt()));
    json.nameValue("runFinishedAt", ConversionClock.formatInstant(performance.runFinishedAt()));
    json.nameValue("totalRun", ConversionClock.formatDuration(performance.totalRun()));
    json.nameValue("totalRunMillis", performance.totalRun().toMillis());
    json.nameValue("projectScan", ConversionClock.formatDuration(performance.projectScan()));
    json.nameValue("projectScanMillis", performance.projectScan().toMillis());
    json.nameValue("metadataWrite", ConversionClock.formatDuration(performance.metadataWrite()));
    json.nameValue("metadataWriteMillis", performance.metadataWrite().toMillis());
    json.nameValue("analysisAndMarkdownWrite",
        ConversionClock.formatDuration(performance.analysisAndMarkdownWrite()));
    json.nameValue("analysisAndMarkdownWriteMillis", performance.analysisAndMarkdownWrite().toMillis());
    json.nameValue("externalJarPageWrite", ConversionClock.formatDuration(performance.externalJarPageWrite()));
    json.nameValue("externalJarPageWriteMillis", performance.externalJarPageWrite().toMillis());
    json.nameValue("reportWrite", ConversionClock.formatDuration(performance.reportWrite()));
    json.nameValue("reportWriteMillis", performance.reportWrite().toMillis());
    json.endObject();
    json.name("counts").beginObject();
    json.nameValue("sourceFiles", project.sourceFiles().size());
    json.nameValue("filesAnalyzed", result.filesAnalyzed());
    json.nameValue("markdownFilesWritten", result.markdownFilesWritten());
    json.nameValue("localDependencies", result.localDependencyCount());
    json.nameValue("unresolvedDependencies", result.sources().stream()
        .mapToInt(source -> source.unresolvedDependencies().size()).sum());
    json.nameValue("discoveredExternalDependencies", project.externalJarIndex().jars().size());
    json.nameValue("classpathEntries", project.classpathEntries().size());
    json.nameValue("indexedExternalJars", project.externalJarIndex().jars().size());
    json.nameValue("mavenModulesDetected", project.mavenModules());
    json.nameValue("gradleBuildFilesDetected", project.gradleModules());
    json.nameValue("compileUnits", project.compileUnits().size());
    json.endObject();
    json.name("warnings").stringArray(project.warnings());
    json.name("diagnostics").stringArray(result.diagnostics());
    json.name("unresolvedSymbols").stringArray(result.unresolvedSymbols());
    json.name("compileUnits").beginArray();
    for (CompileUnit unit : project.compileUnits()) {
      json.beginObject();
      json.nameValue("id", unit.id());
      json.nameValue("displayName", unit.displayName());
      json.nameValue("origin", unit.origin().name().toLowerCase(java.util.Locale.ROOT));
      json.nameValue("scope", unit.scope().name().toLowerCase(java.util.Locale.ROOT));
      json.nameValue("root", unit.root().toString());
      json.nameValue("descriptorPath", unit.descriptorPath() == null ? "" : unit.descriptorPath().toString());
      json.nameValue("sourceRootCount", unit.sourceRoots().size());
      json.nameValue("generatedSourceRootCount", unit.generatedSourceRoots().size());
      json.nameValue("sourceFileCount", unit.sourceFiles().size());
      json.nameValue("resourceRootCount", unit.resourceRoots().size());
      json.nameValue("classpathEntryCount", unit.classpathEntries().size());
      json.name("dependencyUnitIds").stringArray(unit.dependencyUnitIds());
      json.name("java").beginObject();
      json.nameValue("release", unit.release());
      json.nameValue("source", unit.source());
      json.nameValue("target", unit.target());
      json.nameValue("encoding", unit.encoding());
      json.endObject();
      json.name("warnings").stringArray(unit.warnings());
      json.endObject();
    }
    json.endArray();
    json.name("sources").beginArray();
    for (SourceReportEntry source : result.sources().stream()
        .sorted(Comparator.comparing(entry -> entry.sourceFile().toString()))
        .toList()) {
      json.beginObject();
      json.nameValue("sourceFile", portableSourcePath(sourceRootHome, source.sourceFile()));
      json.nameValue("sourceFileAbsolute", source.sourceFile().toString());
      json.nameValue("markdownFile", markdownPath(vault, project.root(), source.sourceFile()));
      json.nameValue("language", "java");
      json.nameValue("entityType", source.entityType());
      json.nameValue("entityId", source.entityId());
      json.nameValue("packageName", source.packageName());
      json.nameValue("analysisStatus", source.analysisStatus().name().toLowerCase(java.util.Locale.ROOT));
      if (source.duplicateOf() != null) {
        json.nameValue("duplicateOf", source.duplicateOf().toString());
      }
      json.name("localDependencies").stringArray(source.localDependencies().stream()
          .sorted(Comparator.comparing(Path::toString))
          .map(Path::toString)
          .toList());
      json.name("dependencyEvidence").beginArray();
      for (DependencyEvidence evidence : source.dependencyEvidence().stream()
          .sorted(Comparator.comparing(DependencyEvidence::dependencySource)
              .thenComparing(DependencyEvidence::confidence)
              .thenComparing(value -> value.dependency() == null ? "" : value.dependency().toString())
              .thenComparing(DependencyEvidence::symbol))
          .toList()) {
        json.beginObject();
        json.nameValue("dependency", evidence.dependency() == null ? "" : evidence.dependency().toString());
        json.nameValue("symbol", evidence.symbol());
        json.nameValue("dependencySource", evidence.dependencySource());
        json.nameValue("confidence", evidence.confidence());
        json.endObject();
      }
      json.endArray();
      json.name("externalDependencies").beginArray();
      for (Map.Entry<Path, List<String>> entry : source.externalJarDependencies().entrySet().stream()
          .sorted(Map.Entry.comparingByKey(Comparator.comparing(Path::toString)))
          .toList()) {
        json.beginObject();
        json.nameValue("id", externalJarId(entry.getKey()));
        json.nameValue("kind", "jar");
        json.nameValue("language", "java");
        json.nameValue("name", entry.getKey().getFileName().toString());
        json.nameValue("version", "");
        json.nameValue("path", entry.getKey().toString());
        json.nameValue("source", entry.getKey().toString());
        json.nameValue("markdownFile", vault.resolve("lib").resolve(relativeExternalJarPath(entry.getKey()).toString() + ".md").toString());
        json.name("metadata").beginObject();
        json.name("classes").stringArray(entry.getValue());
        json.endObject();
        json.endObject();
      }
      json.endArray();
      json.name("unresolvedDependencies").beginArray();
      for (UnresolvedDependencyModel dependency : source.unresolvedDependencies()) {
        json.beginObject();
        json.nameValue("symbol", dependency.symbol());
        json.nameValue("kind", dependency.kind());
        json.nameValue("staticImport", dependency.staticImport());
        json.nameValue("wildcard", dependency.wildcard());
        json.nameValue("line", dependency.line());
        json.endObject();
      }
      json.endArray();
      json.endObject();
    }
    json.endArray();
    json.name("externalDependencies").beginArray();
    for (ExternalJarModel jar : project.externalJarIndex().jars()) {
      json.beginObject();
      json.nameValue("id", externalJarId(jar.path()));
      json.nameValue("kind", "jar");
      json.nameValue("language", "java");
      json.nameValue("name", jar.path().getFileName().toString());
      json.nameValue("version", "");
      json.nameValue("path", jar.path().toString());
      json.nameValue("source", jar.path().toString());
      json.nameValue("markdownFile", vault.resolve("lib").resolve(relativeExternalJarPath(jar.path()).toString() + ".md").toString());
      json.name("metadata").beginObject();
      json.name("packages").beginArray();
      jar.packageClasses().entrySet().stream()
          .sorted(Map.Entry.comparingByKey())
          .forEach(entry -> {
            json.beginObject();
            json.nameValue("name", entry.getKey());
            json.name("classes").stringArray(entry.getValue());
            json.endObject();
          });
      json.endArray();
      json.endObject();
      json.endObject();
    }
    json.endArray();
    json.endObject();

    Files.writeString(vault.resolve(MD_EDITOR_DIR).resolve(REPORT_JSON_FILE), json.toString(), StandardCharsets.UTF_8);
  }

  private static String externalJarId(Path jarPath) {
    return "external:java:jar:" + jarPath.toString()
        .replace('\\', '/')
        .replaceAll("[^A-Za-z0-9._:/-]+", "-");
  }

  private static String markdownPath(Path vault, Path root, Path sourceFile) {
    return vault.resolve(root.relativize(sourceFile).toString() + ".md").toString();
  }

  private static String portableSourcePath(Path sourceRootHome, Path sourceFile) {
    Path normalized = sourceFile.toAbsolutePath().normalize();
    Path normalizedRoot = sourceRootHome.toAbsolutePath().normalize();
    if (normalized.startsWith(normalizedRoot)) {
      return normalizedRoot.relativize(normalized).toString().replace('\\', '/');
    }
    return normalized.toString().replace('\\', '/');
  }

  private static Path relativeExternalJarPath(Path jarPath) {
    Path normalized = jarPath.toAbsolutePath().normalize();
    Path userHome = Path.of(System.getProperty("user.home", "")).toAbsolutePath().normalize();
    Path mavenRepository = userHome.resolve(".m2").resolve("repository").normalize();
    if (normalized.startsWith(mavenRepository)) {
      return mavenRepository.relativize(normalized);
    }
    Path parent = normalized.getParent();
    if (parent != null && parent.getFileName() != null) {
      return parent.getFileName().resolve(normalized.getFileName());
    }
    return normalized.getFileName();
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

  private static final class JsonBuilder {
    private final StringBuilder builder = new StringBuilder();
    private final List<Boolean> firstStack = new ArrayList<>();
    private int indentLevel;
    private boolean expectingNamedValue;

    JsonBuilder beginObject() {
      beforeValue();
      builder.append("{");
      firstStack.add(true);
      indentLevel += 1;
      return this;
    }

    JsonBuilder endObject() {
      indentLevel -= 1;
      boolean wasFirst = firstStack.remove(firstStack.size() - 1);
      if (!wasFirst) {
        newlineAndIndent();
      }
      builder.append("}");
      return this;
    }

    JsonBuilder beginArray() {
      beforeValue();
      builder.append("[");
      firstStack.add(true);
      indentLevel += 1;
      return this;
    }

    JsonBuilder endArray() {
      indentLevel -= 1;
      boolean wasFirst = firstStack.remove(firstStack.size() - 1);
      if (!wasFirst) {
        newlineAndIndent();
      }
      builder.append("]");
      return this;
    }

    JsonBuilder name(String name) {
      beforeValue();
      builder.append(quote(name)).append(": ");
      expectingNamedValue = true;
      return this;
    }

    JsonBuilder nameValue(String name, String value) {
      name(name);
      builder.append(quote(value));
      expectingNamedValue = false;
      return this;
    }

    JsonBuilder nameValue(String name, int value) {
      name(name);
      builder.append(value);
      expectingNamedValue = false;
      return this;
    }

    JsonBuilder nameValue(String name, long value) {
      name(name);
      builder.append(value);
      expectingNamedValue = false;
      return this;
    }

    JsonBuilder nameValue(String name, boolean value) {
      name(name);
      builder.append(value);
      expectingNamedValue = false;
      return this;
    }

    JsonBuilder stringArray(List<String> values) {
      beginArray();
      for (String value : values) {
        beforeValue();
        builder.append(quote(value));
      }
      endArray();
      return this;
    }

    private void beforeValue() {
      if (expectingNamedValue) {
        expectingNamedValue = false;
        return;
      }
      if (firstStack.isEmpty()) {
        return;
      }
      int index = firstStack.size() - 1;
      if (firstStack.get(index)) {
        firstStack.set(index, false);
      } else {
        builder.append(",");
      }
      newlineAndIndent();
    }

    private void newlineAndIndent() {
      builder.append(System.lineSeparator());
      builder.append("  ".repeat(Math.max(0, indentLevel)));
    }

    private static String quote(String value) {
      String source = value == null ? "" : value;
      StringBuilder quoted = new StringBuilder("\"");
      for (int index = 0; index < source.length(); index += 1) {
        char ch = source.charAt(index);
        switch (ch) {
          case '\\' -> quoted.append("\\\\");
          case '"' -> quoted.append("\\\"");
          case '\b' -> quoted.append("\\b");
          case '\f' -> quoted.append("\\f");
          case '\n' -> quoted.append("\\n");
          case '\r' -> quoted.append("\\r");
          case '\t' -> quoted.append("\\t");
          default -> {
            if (ch < 0x20) {
              quoted.append(String.format(java.util.Locale.ROOT, "\\u%04x", (int) ch));
            } else {
              quoted.append(ch);
            }
          }
        }
      }
      return quoted.append("\"").toString();
    }

    @Override
    public String toString() {
      return builder.toString() + System.lineSeparator();
    }
  }
}
