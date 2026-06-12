package com.mdeditor.javaconverter;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

final class ConversionClock {
  private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
      .withZone(ZoneId.systemDefault());

  private ConversionClock() {
  }

  static String timestamp() {
    return FORMATTER.format(Instant.now());
  }

  static String formatInstant(Instant instant) {
    return FORMATTER.format(instant);
  }

  static String formatDuration(Duration duration) {
    long seconds = duration.toSeconds();
    long hours = seconds / 3600;
    long minutes = (seconds % 3600) / 60;
    long remainingSeconds = seconds % 60;
    if (hours > 0) {
      return "%dh %02dm %02ds".formatted(hours, minutes, remainingSeconds);
    }
    if (minutes > 0) {
      return "%dm %02ds".formatted(minutes, remainingSeconds);
    }
    return "%ds".formatted(remainingSeconds);
  }

  static void log(String message) {
    System.out.println("[" + timestamp() + "] " + message);
  }
}
