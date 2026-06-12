package com.mdeditor.javaconverter;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;

final class MarkdownWriter {
  private final Path root;
  private final Path vault;
  private final ConverterOptions options;

  MarkdownWriter(Path root, Path vault, ConverterOptions options) {
    this.root = root;
    this.vault = vault;
    this.options = options;
  }

  void write(SourceFileModel source) throws IOException {
    Path relativeSource = root.relativize(source.file);
    Path outputFile = vault.resolve(relativeSource.toString() + ".md");
    Files.createDirectories(outputFile.getParent());

    List<String> lines = new java.util.ArrayList<>();
    lines.add("---");
    lines.add("entity_type: " + yamlScalar(source.entityType));
    lines.add("entity_id: " + yamlScalar(source.entityId));
    lines.add("conversion_status: not_started");
    lines.add("analysis_status: " + analysisStatusScalar(source));
    lines.add("shared: false");
    lines.add("source_file: " + yamlScalar(source.file.toString()));
    lines.add("source_hash: " + sha256(source.file));
    lines.add("---");
    lines.add("");
    lines.add("# " + toMarkdownPath(relativeSource));
    lines.add("");
    lines.add("Source: " + markdownLink(outputFile, source.file));
    lines.add("");
    lines.add("## Dependencies");
    lines.add("");

    List<Path> dependencies = source.dependencies.stream()
        .sorted(Comparator.comparing(Path::toString))
        .toList();
    switch (source.analysisStatus) {
      case TIMED_OUT -> lines.add("> [!warning] Dependency analysis was skipped for this file "
          + "(compiler attribution timed out). The dependency list below may be incomplete.");
      case FAILED -> lines.add("> [!warning] Dependency analysis failed for this file "
          + "(compiler error). The dependency list below may be incomplete.");
      case EXCLUDED_DUPLICATE -> {
        String target = source.duplicateOf == null ? "another copy under the root"
            : toMarkdownPath(root.relativize(source.duplicateOf));
        lines.add("> [!note] This file is an identical duplicate (same fully-qualified types and "
            + "content) of " + target + ", which was analyzed instead. See that file for dependencies.");
      }
      case ANALYZED -> { /* no banner */ }
    }
    if (source.analysisStatus == SourceFileModel.AnalysisStatus.TIMED_OUT
        || source.analysisStatus == SourceFileModel.AnalysisStatus.FAILED
        || source.analysisStatus == SourceFileModel.AnalysisStatus.EXCLUDED_DUPLICATE) {
      lines.add("");
    }
    if (dependencies.isEmpty()) {
      lines.add("No local code dependencies found.");
    } else {
      for (Path dependency : dependencies) {
        Path relativeDependency = root.relativize(dependency);
        Path dependencyOutputFile = outputFileFor(dependency);
        lines.add("- " + markdownLink(outputFile, dependencyOutputFile, dependency.getFileName().toString())
            + " (" + toMarkdownPath(relativeDependency) + ")");
      }
    }

    lines.add("");
    appendMethodDocumentation(lines, source);
    Files.writeString(outputFile, String.join("\n", lines), StandardCharsets.UTF_8);
  }

  private void appendMethodDocumentation(List<String> lines, SourceFileModel source) {
    if (options.includePackage() && !source.packageName.isBlank()) {
      lines.add("## Package");
      lines.add("");
      lines.add(source.packageName);
      lines.add("");
    }

    List<MethodInfo> visibleMethods = source.methods.stream()
        .filter(method -> options.includeMethods() || options.includeAccessors() && method.kind().equals("accessor"))
        .toList();
    if (visibleMethods.isEmpty()) {
      return;
    }

    lines.add("## Code Members");
    lines.add("");
    for (MethodInfo method : visibleMethods) {
      lines.add("### " + method.name());
      lines.add("");
      if (options.includeAccessors()) {
        lines.add("Type: " + method.kind());
        lines.add("");
      }
      if (options.includeSignatures()) {
        lines.add("Signature:");
        lines.add("");
        lines.add("```text");
        lines.add(method.signature());
        lines.add("```");
        lines.add("");
      }
      if (options.includeReturnCodes()) {
        lines.add("Return codes:");
        lines.add("");
        if (method.returnCodes().isEmpty()) {
          lines.add("- None detected");
        } else {
          method.returnCodes().forEach(returnCode -> lines.add("- " + returnCode));
        }
        lines.add("");
      }
      if (options.includeExceptions()) {
        lines.add("Exceptions:");
        lines.add("");
        if (method.exceptions().isEmpty()) {
          lines.add("- None detected");
        } else {
          method.exceptions().forEach(exception -> lines.add("- " + exception));
        }
        lines.add("");
      }
    }
  }

  private Path outputFileFor(Path sourceFile) {
    Path relativeSource = root.relativize(sourceFile);
    return vault.resolve(relativeSource.toString() + ".md");
  }

  private static String markdownLink(Path fromFile, Path toFile) {
    return markdownLink(fromFile, toFile, toMarkdownPath(toFile));
  }

  private static String markdownLink(Path fromFile, Path toFile, String label) {
    Path relative;
    try {
      relative = fromFile.getParent().relativize(toFile);
    } catch (IllegalArgumentException error) {
      relative = toFile;
    }
    String href = encodeUriPath(toMarkdownPath(relative));
    return "[" + label + "](" + href + ")";
  }

  private static String encodeUriPath(String path) {
    try {
      return new URI(null, null, path, null).toASCIIString();
    } catch (Exception error) {
      return path.replace(" ", "%20");
    }
  }

  private static String sha256(Path file) throws IOException {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(Files.readAllBytes(file)));
    } catch (Exception error) {
      throw new IOException("Could not hash " + file, error);
    }
  }

  private static String yamlScalar(String value) {
    return value == null ? "" : value;
  }

  private static String analysisStatusScalar(SourceFileModel source) {
    return switch (source.analysisStatus) {
      case ANALYZED -> "analyzed";
      case TIMED_OUT -> "timed_out";
      case FAILED -> "failed";
      case EXCLUDED_DUPLICATE -> "excluded_duplicate";
    };
  }

  private static String toMarkdownPath(Path path) {
    return path.toString().replace('\\', '/');
  }
}
