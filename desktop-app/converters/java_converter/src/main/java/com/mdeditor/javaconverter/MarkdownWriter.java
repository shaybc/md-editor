package com.mdeditor.javaconverter;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class MarkdownWriter {
  private final Path root;
  private final Path vault;
  private final Path sourceRootHome;
  private final ConverterOptions options;
  private final Map<Path, ExternalJarModel> externalJarsByPath;
  private final Map<Path, ExternalJarUsage> externalJarUsages = new LinkedHashMap<>();

  MarkdownWriter(Path root, Path vault, Path sourceRootHome, ConverterOptions options,
      ExternalJarIndex externalJarIndex) {
    this.root = root;
    this.vault = vault;
    this.sourceRootHome = sourceRootHome;
    this.options = options;
    this.externalJarsByPath = externalJarIndex.jars().stream()
        .collect(java.util.stream.Collectors.toMap(
            ExternalJarModel::path,
            jar -> jar,
            (left, right) -> left,
            LinkedHashMap::new
        ));
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
    lines.add("source_file: " + yamlScalar(portableSourcePath(source.file)));
    lines.add("source_hash: " + sha256(source.file));
    lines.add("---");
    lines.add("");
    lines.add("# " + toMarkdownPath(relativeSource));
    lines.add("");
    lines.add("Source: `" + portableSourcePath(source.file) + "`");
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
      case PARSE_ONLY -> lines.add("> [!warning] Compiler attribution was not completed for this file. "
          + "Dependencies are based on parse-only Java syntax and may miss inferred symbol uses.");
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
        || source.analysisStatus == SourceFileModel.AnalysisStatus.PARSE_ONLY
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

    appendDependencyEvidence(lines, source, outputFile);
    appendExternalDependencies(lines, source, outputFile);
    appendUnresolvedDependencies(lines, source);

    lines.add("");
    appendMethodDocumentation(lines, source);
    Files.writeString(outputFile, String.join("\n", lines), StandardCharsets.UTF_8);
  }

  void writeExternalJarPages() throws IOException {
    expandExternalJarDependencyUsages();
    for (ExternalJarUsage usage : externalJarUsages.values().stream()
        .sorted(Comparator.comparing(value -> value.jar.path().toString()))
        .toList()) {
      writeExternalJarPage(usage);
    }
  }

  private void appendExternalDependencies(List<String> lines, SourceFileModel source, Path outputFile) {
    if (source.externalJarDependencies.isEmpty()) {
      return;
    }

    lines.add("");
    lines.add("## External Dependencies");
    lines.add("");

    source.externalJarDependencies.entrySet().stream()
        .sorted(Map.Entry.comparingByKey(Comparator.comparing(Path::toString)))
        .forEach(entry -> {
          Path jarPath = entry.getKey();
          ExternalJarUsage usage = externalJarUsages.computeIfAbsent(jarPath,
              key -> new ExternalJarUsage(externalJarsByPath.getOrDefault(
                  jarPath,
                  new ExternalJarModel(jarPath, Map.of())
              )));
          usage.usedBy.add(source.file);
          usage.usedClasses.addAll(entry.getValue());

          Path jarOutputFile = outputFileForExternalJar(jarPath);
          lines.add("- " + markdownLink(outputFile, jarOutputFile, jarPath.getFileName().toString()));
          entry.getValue().stream().sorted().forEach(className -> {
            Set<Path> providers = source.externalClassProviders.getOrDefault(className, Set.of());
            String ambiguous = providers.size() > 1
                ? " _(ambiguous provider: " + providers.stream()
                    .map(path -> path.getFileName().toString())
                    .sorted()
                    .reduce((left, right) -> left + ", " + right)
                    .orElse("") + ")_"
                : "";
            lines.add("  - `" + className + "`" + ambiguous);
          });
        });
  }

  private void appendDependencyEvidence(List<String> lines, SourceFileModel source, Path outputFile) {
    if (source.dependencyEvidence.isEmpty()) {
      return;
    }

    lines.add("");
    lines.add("## Dependency Evidence");
    lines.add("");
    source.dependencyEvidence.stream()
        .sorted(Comparator.comparing(DependencyEvidence::confidence)
            .thenComparing(DependencyEvidence::dependencySource)
            .thenComparing(evidence -> evidence.dependency() == null ? "" : evidence.dependency().toString())
            .thenComparing(DependencyEvidence::symbol))
        .forEach(evidence -> {
          String target = evidence.dependency() == null
              ? "`" + evidence.symbol() + "`"
              : markdownLink(outputFile, outputFileFor(evidence.dependency()),
                  evidence.dependency().getFileName().toString());
          String symbol = evidence.symbol().isBlank() ? "" : " `" + evidence.symbol() + "`";
          lines.add("- " + target + symbol + " (" + evidence.dependencySource()
              + ", " + evidence.confidence() + " confidence)");
        });
  }

  private void appendUnresolvedDependencies(List<String> lines, SourceFileModel source) {
    if (source.unresolvedDependencies.isEmpty()) {
      return;
    }

    lines.add("");
    lines.add("## Unresolved Dependencies");
    lines.add("");
    source.unresolvedDependencies.stream()
        .sorted(Comparator.comparing(UnresolvedDependencyModel::symbol)
            .thenComparing(UnresolvedDependencyModel::kind)
            .thenComparingLong(UnresolvedDependencyModel::line))
        .forEach(dependency -> {
          String detail = dependency.kind().replace('-', ' ');
          if (dependency.wildcard()) {
            detail += ", wildcard";
          }
          if (dependency.staticImport()) {
            detail += ", static";
          }
          String line = dependency.line() > 0 ? ", line " + dependency.line() : "";
          lines.add("- `" + dependency.symbol() + "` (missing " + detail + line + ")");
        });
  }


  private void expandExternalJarDependencyUsages() {
    List<Path> pending = new ArrayList<>(externalJarUsages.keySet());
    Set<Path> visited = new LinkedHashSet<>();
    while (!pending.isEmpty()) {
      Path jarPath = pending.remove(0);
      if (!visited.add(jarPath)) continue;
      ExternalJarModel jar = externalJarsByPath.get(jarPath);
      if (jar == null) continue;
      for (Path dependencyPath : jar.dependencyPaths()) {
        ExternalJarModel dependency = externalJarsByPath.get(dependencyPath);
        if (dependency == null) continue;
        externalJarUsages.computeIfAbsent(dependencyPath, key -> new ExternalJarUsage(dependency));
        pending.add(dependencyPath);
      }
    }
  }

  private void writeExternalJarPage(ExternalJarUsage usage) throws IOException {
    Path jarPath = usage.jar.path();
    Path outputFile = outputFileForExternalJar(jarPath);
    Files.createDirectories(outputFile.getParent());

    List<String> lines = new ArrayList<>();
    lines.add("---");
    lines.add("entity_type: external_dependency");
    lines.add("entity_id: " + yamlScalar(entityIdForExternalJar(jarPath)));
    lines.add("dependency_kind: jar");
    lines.add("language: java");
    lines.add("conversion_status: not_started");
    lines.add("shared: false");
    if (usage.jar.coordinate() != null) {
      lines.add("maven_coordinate: " + yamlScalar(usage.jar.coordinate().key()));
    }
    lines.add("dependency_resolution: " + yamlScalar(usage.jar.dependencyResolutionSource()));
    lines.add("dependency_folder_fallback: " + usage.jar.dependencyFolderFallback());
    lines.add("source_file: " + yamlScalar(jarPath.toString()));
    lines.add("source_hash: " + sha256(jarPath));
    lines.add("tags:");
    lines.add("  - external-dependency");
    lines.add("---");
    lines.add("");
    lines.add("# " + jarPath.getFileName());
    lines.add("");
    lines.add("Type: External JAR");
    lines.add("");
    lines.add("Source file: `" + jarPath + "`");
    lines.add("");
    lines.add("## Used By");
    lines.add("");
    if (usage.usedBy.isEmpty()) {
      lines.add("None.");
    } else {
      usage.usedBy.stream()
          .sorted(Comparator.comparing(Path::toString))
          .map(this::relativeToRoot)
          .forEach(relativeSource -> lines.add("- " + toMarkdownPath(relativeSource)));
    }
    lines.add("");
    lines.add("## Runtime Dependencies");
    lines.add("");
    List<Path> runtimeDependencies = usage.jar.dependencyPaths().stream()
        .filter(externalJarsByPath::containsKey)
        .sorted()
        .toList();
    if (runtimeDependencies.isEmpty()) {
      lines.add("None.");
    } else {
      runtimeDependencies.forEach(dependencyPath -> lines.add("- " + markdownLink(
          outputFile,
          outputFileForExternalJar(dependencyPath),
          dependencyPath.getFileName().toString()
      )));
    }
    lines.add("");
    lines.add("## Used Classes");
    lines.add("");

    Map<String, List<String>> classesByPackage = usedClassesByPackage(usage.usedClasses);
    if (classesByPackage.isEmpty()) {
      lines.add("None.");
    } else {
      classesByPackage.forEach((packageName, classes) -> {
        lines.add("### " + (packageName.isBlank() ? "(default package)" : packageName));
        lines.add("");
        classes.forEach(className -> lines.add("- " + className));
        lines.add("");
      });
      if (!lines.isEmpty() && lines.get(lines.size() - 1).isBlank()) {
        lines.remove(lines.size() - 1);
      }
    }

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

  private String portableSourcePath(Path sourceFile) {
    Path normalized = sourceFile.toAbsolutePath().normalize();
    if (normalized.startsWith(sourceRootHome)) {
      return toMarkdownPath(sourceRootHome.relativize(normalized));
    }
    return toMarkdownPath(normalized);
  }

  private Path outputFileForExternalJar(Path jarPath) {
    return vault.resolve("lib").resolve(relativeExternalJarPath(jarPath).toString() + ".md");
  }

  private Path relativeToRoot(Path file) {
    Path normalized = file.toAbsolutePath().normalize();
    if (normalized.startsWith(root)) {
      return root.relativize(normalized);
    }
    return normalized.getFileName();
  }

  private Path relativeExternalJarPath(Path jarPath) {
    Path normalized = jarPath.toAbsolutePath().normalize();
    Path mavenRelative = relativeToMavenRepository(normalized);
    if (mavenRelative != null) {
      return Path.of("maven").resolve(mavenRelative);
    }
    if (normalized.startsWith(root)) {
      return root.relativize(normalized);
    }
    String hash = Integer.toHexString(normalized.toString().hashCode());
    return Path.of("external").resolve(hash + "-" + normalized.getFileName());
  }

  private static Path relativeToMavenRepository(Path path) {
    for (int i = 0; i < path.getNameCount() - 1; i += 1) {
      if (path.getName(i).toString().equals(".m2") && path.getName(i + 1).toString().equals("repository")) {
        return path.subpath(i + 2, path.getNameCount());
      }
    }
    return null;
  }

  private String entityIdForExternalJar(Path jarPath) {
    return "lib." + toMarkdownPath(relativeExternalJarPath(jarPath))
        .replaceAll("[^A-Za-z0-9._-]+", ".")
        .replace('/', '.')
        .replaceAll("\\.+", ".")
        .replaceAll("^\\.|\\.$", "");
  }

  private static Map<String, List<String>> usedClassesByPackage(Set<String> classes) {
    Map<String, List<String>> result = new LinkedHashMap<>();
    classes.stream().sorted().forEach(className -> {
      int lastDot = className.lastIndexOf('.');
      String packageName = lastDot < 0 ? "" : className.substring(0, lastDot);
      String simpleName = lastDot < 0 ? className : className.substring(lastDot + 1);
      result.computeIfAbsent(packageName, key -> new ArrayList<>()).add(simpleName);
    });
    return result;
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
      case PARSE_ONLY -> "parse_only";
      case EXCLUDED_DUPLICATE -> "excluded_duplicate";
    };
  }

  private static String toMarkdownPath(Path path) {
    return path.toString().replace('\\', '/');
  }

  private static final class ExternalJarUsage {
    final ExternalJarModel jar;
    final Set<Path> usedBy = new LinkedHashSet<>();
    final Set<String> usedClasses = new LinkedHashSet<>();

    ExternalJarUsage(ExternalJarModel jar) {
      this.jar = jar;
    }
  }
}
