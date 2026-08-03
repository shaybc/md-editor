package com.mdeditor.javaconverter;

public final class ConversionProgress {
  private static final String PREFIX = "::md-progress";

  private ConversionProgress() {
  }

  static void stage(String stage, String stageLabel) {
    emit(stage, stageLabel, -1, -1, null, -1, -1, null);
  }

  static void progress(String stage, String stageLabel, int completed, int total) {
    emit(stage, stageLabel, completed, total, null, -1, -1, null);
  }

  static void progress(String stage, String stageLabel, int completed, int total,
      String currentUnit, int currentUnitCompleted, int currentUnitTotal, String currentFile) {
    emit(stage, stageLabel, completed, total, currentUnit, currentUnitCompleted, currentUnitTotal, currentFile);
  }

  static void unit(String stage, String stageLabel,
      String currentUnit, int currentUnitCompleted, int currentUnitTotal, String currentFile) {
    emit(stage, stageLabel, -1, -1, currentUnit, currentUnitCompleted, currentUnitTotal, currentFile);
  }

  static void complete(int total) {
    emit("complete", "Complete", total, total, null, -1, -1, null);
  }

  private static void emit(String stage, String stageLabel, int completed, int total,
      String currentUnit, int currentUnitCompleted, int currentUnitTotal, String currentFile) {
    StringBuilder json = new StringBuilder();
    json.append('{');
    appendString(json, "stage", stage);
    appendString(json, "stageLabel", stageLabel);
    if (completed >= 0) {
      appendNumber(json, "completed", completed);
    }
    if (total >= 0) {
      appendNumber(json, "total", total);
    }
    appendString(json, "currentUnit", currentUnit);
    if (currentUnitCompleted >= 0) {
      appendNumber(json, "currentUnitCompleted", currentUnitCompleted);
    }
    if (currentUnitTotal >= 0) {
      appendNumber(json, "currentUnitTotal", currentUnitTotal);
    }
    appendString(json, "currentFile", currentFile);
    json.append('}');
    System.out.println(PREFIX + json);
  }

  private static void appendString(StringBuilder json, String name, String value) {
    if (value == null || value.isBlank()) {
      return;
    }
    appendCommaIfNeeded(json);
    json.append('"').append(escape(name)).append("\":\"").append(escape(value)).append('"');
  }

  private static void appendNumber(StringBuilder json, String name, int value) {
    appendCommaIfNeeded(json);
    json.append('"').append(escape(name)).append("\":").append(value);
  }

  private static void appendCommaIfNeeded(StringBuilder json) {
    if (json.length() > 1) {
      json.append(',');
    }
  }

  private static String escape(String value) {
    StringBuilder escaped = new StringBuilder(value.length());
    for (int index = 0; index < value.length(); index += 1) {
      char ch = value.charAt(index);
      switch (ch) {
        case '"' -> escaped.append("\\\"");
        case '\\' -> escaped.append("\\\\");
        case '\b' -> escaped.append("\\b");
        case '\f' -> escaped.append("\\f");
        case '\n' -> escaped.append("\\n");
        case '\r' -> escaped.append("\\r");
        case '\t' -> escaped.append("\\t");
        default -> {
          if (ch < 0x20) {
            escaped.append("\\u%04x".formatted((int) ch));
          } else {
            escaped.append(ch);
          }
        }
      }
    }
    return escaped.toString();
  }
}
