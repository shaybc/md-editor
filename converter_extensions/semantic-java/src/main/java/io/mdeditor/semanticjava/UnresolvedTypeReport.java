package io.mdeditor.semanticjava;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;

final class UnresolvedTypeReport {
  private final TreeSet<String> typeNames = new TreeSet<>();
  private final TreeMap<String, TreeSet<String>> packageNames = new TreeMap<>();

  void add(String typeName) {
    String normalized = normalize(typeName);
    if (normalized.isBlank()) return;
    typeNames.add(normalized);

    int separator = normalized.lastIndexOf('.');
    if (separator <= 0 || separator >= normalized.length() - 1) return;
    String packageName = normalized.substring(0, separator);
    String simpleName = normalized.substring(separator + 1);
    packageNames.computeIfAbsent(packageName, ignored -> new TreeSet<>()).add(simpleName);
  }

  int uniqueTypeCount() {
    return typeNames.size();
  }

  boolean isEmpty() {
    return typeNames.isEmpty();
  }

  Path write(Path vault) throws IOException {
    Path reportFile = vault.resolve("_semantic-java-unresolved-types.md");
    StringBuilder markdown = new StringBuilder();
    markdown.append("# Semantic Java Unresolved Types\n\n");
    markdown.append("Unique unresolved type names: ").append(typeNames.size()).append("\n\n");

    markdown.append("## Packages\n\n");
    if (packageNames.isEmpty()) {
      markdown.append("No package-qualified unresolved types were detected.\n\n");
    } else {
      for (Map.Entry<String, TreeSet<String>> entry : packageNames.entrySet()) {
        markdown.append("- ").append(entry.getKey())
            .append(" (").append(entry.getValue().size()).append(" type")
            .append(entry.getValue().size() == 1 ? "" : "s").append(")\n");
      }
      markdown.append("\n");
    }

    markdown.append("## Types\n\n");
    for (String typeName : typeNames) {
      markdown.append("- `").append(typeName).append("`\n");
    }

    Files.writeString(reportFile, markdown.toString(), StandardCharsets.UTF_8);
    return reportFile;
  }

  private static String normalize(String typeName) {
    String normalized = typeName == null ? "" : typeName.trim();
    while (normalized.endsWith("[]")) {
      normalized = normalized.substring(0, normalized.length() - 2).trim();
    }
    int genericStart = normalized.indexOf('<');
    if (genericStart >= 0) {
      normalized = normalized.substring(0, genericStart).trim();
    }
    return normalized;
  }
}
