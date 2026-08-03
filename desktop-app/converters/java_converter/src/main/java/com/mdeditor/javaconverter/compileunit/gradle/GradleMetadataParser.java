package com.mdeditor.javaconverter.compileunit.gradle;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

final class GradleMetadataParser {
  static final String START = "MD_EDITOR_GRADLE_METADATA_V1";
  static final String END = "MD_EDITOR_GRADLE_METADATA_END";

  private GradleMetadataParser() {
  }

  static List<GradleMetadataRecord> parse(String output) {
    List<GradleMetadataRecord> records = new ArrayList<>();
    boolean inMetadata = false;
    for (String line : output.lines().toList()) {
      String trimmed = line.trim();
      if (trimmed.equals(START)) {
        inMetadata = true;
        continue;
      }
      if (trimmed.equals(END)) {
        break;
      }
      if (!inMetadata || trimmed.isBlank()) {
        continue;
      }
      String normalized = line.replace("\\t", "\t");
      if (normalized.startsWith("UNIT ") && !normalized.startsWith("UNIT\t")) {
        normalized = "UNIT\t" + normalized.substring("UNIT ".length()).stripLeading();
      }
      if (normalized.startsWith("UNIT\t")) {
        records.add(parseUnit(normalized));
      }
    }
    return records;
  }

  private static GradleMetadataRecord parseUnit(String line) {
    String[] parts = line.contains("\t")
        ? line.split("\t", -1)
        : line.split("\\s+", -1);
    if (parts.length != 16) {
      throw new IllegalArgumentException("Invalid Gradle metadata UNIT field count: " + parts.length);
    }
    return new GradleMetadataRecord(
        decode(parts[1]),
        path(decode(parts[2])),
        path(decode(parts[3])),
        decode(parts[4]),
        paths(decode(parts[5])),
        paths(decode(parts[6])),
        paths(decode(parts[7])),
        paths(decode(parts[8])),
        paths(decode(parts[9])),
        strings(decode(parts[10])),
        decode(parts[11]),
        decode(parts[12]),
        decode(parts[13]),
        decode(parts[14]),
        strings(decode(parts[15]))
    );
  }

  private static String decode(String value) {
    if (value == null || value.isBlank()) {
      return "";
    }
    return new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8);
  }

  private static Path path(String value) {
    return value == null || value.isBlank() ? null : Path.of(value).toAbsolutePath().normalize();
  }

  private static List<Path> paths(String value) {
    return strings(value).stream()
        .map(Path::of)
        .map(path -> path.toAbsolutePath().normalize())
        .toList();
  }

  private static List<String> strings(String value) {
    if (value == null || value.isBlank()) {
      return List.of();
    }
    return value.lines()
        .map(String::trim)
        .filter(line -> !line.isBlank())
        .distinct()
        .sorted()
        .toList();
  }
}
