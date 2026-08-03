package com.mdeditor.javaconverter;

import com.mdeditor.javaconverter.model.CompileUnit;
import com.mdeditor.javaconverter.model.CompileUnitOrigin;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

final class ProjectMetadataWriter {
  static final String MD_EDITOR_DIR = ".md-editor";
  static final String RECOVERY_DIR = "recovery";
  static final String PROJECT_METADATA_FILE = "_md_editor_project.json";

  private ProjectMetadataWriter() {
  }

  static void write(Path vault, Path sourceRootHome, ProjectModel project) throws IOException {
    Path metadataDir = vault.resolve(MD_EDITOR_DIR);
    Files.createDirectories(metadataDir.resolve(RECOVERY_DIR));
    String now = java.time.Instant.now().toString();
    JavaProjectIndex javaIndex = JavaProjectIndex.from(project, sourceRootHome);
    JsonBuilder json = new JsonBuilder();
    json.beginObject();
    json.nameValue("schemaVersion", 2);
    json.nameValue("type", "md-editor-generated-code-folder");
    json.nameValue("sourceRootPath", toMarkdownPath(sourceRootHome));
    json.nameValue("sourcePathMode", "relative-to-source-root");
    json.nameValue("createdAt", now);
    json.nameValue("updatedAt", now);
    json.name("languages").beginObject();
    json.name("java").beginObject();
    json.nameValue("detectionMethod", javaIndex.detectionMethod());
    json.name("counts").beginObject();
    json.nameValue("compileUnits", project.compileUnits().size());
    json.nameValue("sourceFiles", project.sourceFiles().size());
    json.nameValue("mavenModules", project.mavenModules());
    json.nameValue("gradleModules", project.gradleModules());
    json.endObject();
    writeCompileUnits(json, sourceRootHome, javaIndex.compileUnits());
    writeLookupMap(json, "fileToCompileUnitIds", javaIndex.fileToCompileUnitIds());
    writeLookupMap(json, "folderToCompileUnitIds", javaIndex.folderToCompileUnitIds());
    json.endObject();
    json.endObject();
    json.endObject();
    Files.writeString(metadataDir.resolve(PROJECT_METADATA_FILE), json.toString(), StandardCharsets.UTF_8);
  }

  private static void writeCompileUnits(JsonBuilder json, Path sourceRootHome, List<CompileUnit> compileUnits) {
    json.name("compileUnitsById").beginObject();
    for (CompileUnit unit : compileUnits) {
      json.name(unit.id()).beginObject();
      json.nameValue("id", unit.id());
      json.nameValue("displayName", unit.displayName());
      json.nameValue("origin", unit.origin().name().toLowerCase(Locale.ROOT));
      json.nameValue("scope", unit.scope().name().toLowerCase(Locale.ROOT));
      json.nameValue("root", portableSourcePath(sourceRootHome, unit.root()));
      json.nameValue("descriptorPath", unit.descriptorPath() == null ? "" : portableSourcePath(sourceRootHome, unit.descriptorPath()));
      json.name("sourceRoots").stringArray(unit.sourceRoots().stream()
          .map(root -> portableSourcePath(sourceRootHome, root))
          .toList());
      json.name("generatedSourceRoots").stringArray(unit.generatedSourceRoots().stream()
          .map(root -> portableSourcePath(sourceRootHome, root))
          .toList());
      json.name("dependencySourceRoots").stringArray(unit.dependencySourceRoots().stream()
          .map(root -> portableSourcePath(sourceRootHome, root))
          .toList());
      json.name("resourceRoots").stringArray(unit.resourceRoots().stream()
          .map(root -> portableSourcePath(sourceRootHome, root))
          .toList());
      json.name("sourceFiles").stringArray(unit.sourceFiles().stream()
          .map(file -> portableSourcePath(sourceRootHome, file))
          .toList());
      json.name("dependencyUnitIds").stringArray(unit.dependencyUnitIds());
      json.nameValue("sourceFileCount", unit.sourceFiles().size());
      json.nameValue("sourceRootCount", unit.sourceRoots().size());
      json.nameValue("generatedSourceRootCount", unit.generatedSourceRoots().size());
      json.nameValue("dependencySourceRootCount", unit.dependencySourceRoots().size());
      json.nameValue("resourceRootCount", unit.resourceRoots().size());
      json.name("java").beginObject();
      json.nameValue("release", unit.release());
      json.nameValue("source", unit.source());
      json.nameValue("target", unit.target());
      json.nameValue("encoding", unit.encoding());
      json.endObject();
      json.name("warnings").stringArray(unit.warnings());
      json.endObject();
    }
    json.endObject();
  }

  private static void writeLookupMap(JsonBuilder json, String name, Map<String, List<String>> lookupMap) {
    json.name(name).beginObject();
    for (Map.Entry<String, List<String>> entry : lookupMap.entrySet()) {
      json.name(entry.getKey()).stringArray(entry.getValue());
    }
    json.endObject();
  }

  private static String toMarkdownPath(Path path) {
    return path.toString().replace('\\', '/');
  }

  private static String portableSourcePath(Path sourceRootHome, Path path) {
    Path normalized = path.toAbsolutePath().normalize();
    Path normalizedRoot = sourceRootHome.toAbsolutePath().normalize();
    if (normalized.startsWith(normalizedRoot)) {
      Path relative = normalizedRoot.relativize(normalized);
      String portable = relative.toString().replace('\\', '/');
      return portable.isBlank() ? "." : portable;
    }
    return normalized.toString().replace('\\', '/');
  }

  private record JavaProjectIndex(
      String detectionMethod,
      List<CompileUnit> compileUnits,
      Map<String, List<String>> fileToCompileUnitIds,
      Map<String, List<String>> folderToCompileUnitIds
  ) {
    static JavaProjectIndex from(ProjectModel project, Path sourceRootHome) {
      List<CompileUnit> units = project.compileUnits().stream()
          .sorted(Comparator.comparing(CompileUnit::id))
          .toList();
      Map<String, Set<String>> fileLookup = new LinkedHashMap<>();
      Map<String, Set<String>> folderLookup = new LinkedHashMap<>();
      for (CompileUnit unit : units) {
        for (Path sourceFile : unit.sourceFiles()) {
          addLookup(fileLookup, portableSourcePath(sourceRootHome, sourceFile), unit.id());
        }
        addFolderLookup(folderLookup, sourceRootHome, unit.root(), unit.id());
        for (Path sourceRoot : unit.sourceRoots()) {
          addFolderLookup(folderLookup, sourceRootHome, sourceRoot, unit.id());
        }
        for (Path sourceRoot : unit.generatedSourceRoots()) {
          addFolderLookup(folderLookup, sourceRootHome, sourceRoot, unit.id());
        }
        for (Path sourceRoot : unit.dependencySourceRoots()) {
          addFolderLookup(folderLookup, sourceRootHome, sourceRoot, unit.id());
        }
      }
      return new JavaProjectIndex(
          detectionMethod(units),
          units,
          sortedLookup(fileLookup),
          sortedLookup(folderLookup)
      );
    }

    private static String detectionMethod(List<CompileUnit> units) {
      if (units.stream().anyMatch(unit -> unit.origin() == CompileUnitOrigin.MAVEN)) {
        return "maven-project-metadata";
      }
      if (units.stream().anyMatch(unit -> unit.origin() == CompileUnitOrigin.GRADLE)) {
        return "gradle-project-metadata";
      }
      if (units.stream().anyMatch(unit -> unit.origin() == CompileUnitOrigin.INFERRED)) {
        return "explicit-source-root-discovery";
      }
      if (units.stream().anyMatch(unit -> unit.origin() == CompileUnitOrigin.ROOT_SCAN)) {
        return "package-path-inference-fallback";
      }
      return "none";
    }

    private static void addFolderLookup(Map<String, Set<String>> lookup, Path sourceRootHome, Path folder, String unitId) {
      String path = portableSourcePath(sourceRootHome, folder);
      if (!path.isBlank()) {
        addLookup(lookup, path, unitId);
      }
    }

    private static void addLookup(Map<String, Set<String>> lookup, String path, String unitId) {
      lookup.computeIfAbsent(path, ignored -> new LinkedHashSet<>()).add(unitId);
    }

    private static Map<String, List<String>> sortedLookup(Map<String, Set<String>> lookup) {
      Map<String, List<String>> sorted = new LinkedHashMap<>();
      lookup.entrySet().stream()
          .sorted(Map.Entry.comparingByKey())
          .forEach(entry -> sorted.put(entry.getKey(), entry.getValue().stream().sorted().toList()));
      return sorted;
    }
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
              quoted.append(String.format(Locale.ROOT, "\\u%04x", (int) ch));
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
