package io.mdeditor.semanticjava;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;

final class MarkdownWriter {
  private final ConverterOptions options;
  private final LocalTypeIndex index;

  MarkdownWriter(ConverterOptions options, LocalTypeIndex index) {
    this.options = options;
    this.index = index;
  }

  void write(Path sourceFile, Set<Path> dependencies, List<MethodInfo> methods, List<String> warnings)
      throws IOException {
    Path relativeSource = options.root.relativize(sourceFile);
    Path outputFile = options.vault.resolve(relativeSource.toString() + ".md");
    Files.createDirectories(outputFile.getParent());

    StringBuilder markdown = new StringBuilder();
    appendFrontmatter(markdown, sourceFile);
    markdown.append("\n# ").append(markdownPath(relativeSource)).append("\n\n");
    markdown.append("Source: ").append(markdownLink(outputFile, sourceFile)).append("\n\n");
    appendDependencies(markdown, outputFile, dependencies);
    appendWarnings(markdown, warnings);
    appendMethodDocumentation(markdown, sourceFile, methods);

    Files.writeString(outputFile, markdown.toString(), StandardCharsets.UTF_8);
  }

  private void appendFrontmatter(StringBuilder markdown, Path sourceFile) throws IOException {
    markdown.append("---\n");
    markdown.append("entity_type: ").append(index.entityType(sourceFile)).append("\n");
    markdown.append("entity_id: ").append(index.entityId(sourceFile)).append("\n");
    markdown.append("conversion_status: not_started\n");
    markdown.append("shared: false\n");
    markdown.append("source_file: ").append(sourceFile).append("\n");
    markdown.append("source_hash: ").append(sha256(sourceFile)).append("\n");
    markdown.append("---\n");
  }

  private void appendDependencies(StringBuilder markdown, Path outputFile, Set<Path> dependencies) {
    markdown.append("## Dependencies\n\n");
    if (dependencies.isEmpty()) {
      markdown.append("No local code dependencies found.\n\n");
      return;
    }

    dependencies.stream()
        .sorted(Comparator.comparing(Path::toString))
        .forEach(dependency -> {
          Path relativeDependency = options.root.relativize(dependency);
          markdown.append("- ")
              .append(markdownLink(outputFile, dependency))
              .append(" (")
              .append(markdownPath(relativeDependency))
              .append(")\n");
        });
    markdown.append("\n");
  }

  private void appendWarnings(StringBuilder markdown, List<String> warnings) {
    if (warnings.isEmpty()) return;
    markdown.append("## Converter Warnings\n\n");
    warnings.forEach(warning -> markdown.append("- ").append(warning).append("\n"));
    markdown.append("\n");
  }

  private void appendMethodDocumentation(StringBuilder markdown, Path sourceFile, List<MethodInfo> methods) {
    String packageName = index.packageName(sourceFile);
    if (options.includePackage && !packageName.isBlank()) {
      markdown.append("## Package\n\n").append(packageName).append("\n\n");
    }
    if (!options.includeMethods && !options.includeAccessors) return;

    List<MethodInfo> visible = methods.stream()
        .filter(method -> ("accessor".equals(method.kind()) ? options.includeAccessors : options.includeMethods))
        .toList();
    if (visible.isEmpty()) return;

    markdown.append("## Members\n\n");
    for (MethodInfo method : visible) {
      markdown.append("### ").append(method.name()).append("\n\n");
      markdown.append("Type: ").append(method.kind()).append("\n\n");
      if (options.includeSignatures) {
        markdown.append("Signature:\n\n```java\n")
            .append(method.signature())
            .append("\n```\n\n");
      }
      if (options.includeReturnCodes && !method.returnValues().isEmpty()) {
        markdown.append("Returns:\n\n");
        method.returnValues().forEach(value -> markdown.append("- `").append(value).append("`\n"));
        markdown.append("\n");
      }
      if (options.includeExceptions && !method.exceptions().isEmpty()) {
        markdown.append("Exceptions:\n\n");
        method.exceptions().forEach(value -> markdown.append("- `").append(value).append("`\n"));
        markdown.append("\n");
      }
    }
  }

  private static String markdownLink(Path fromFile, Path toFile) {
    Path relative = fromFile.getParent().relativize(toFile);
    String href = encodeMarkdownHref(markdownPath(relative));
    return "[" + markdownPath(toFile) + "](" + href + ")";
  }

  private static String encodeMarkdownHref(String path) {
    try {
      return new URI(null, null, path, null).toASCIIString();
    } catch (URISyntaxException error) {
      return path.replace(" ", "%20");
    }
  }

  private static String markdownPath(Path path) {
    return path.toString().replace('\\', '/');
  }

  private static String sha256(Path file) throws IOException {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(Files.readAllBytes(file)));
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException(error);
    }
  }
}
