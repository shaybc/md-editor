package com.mdeditor.javaconverter.compileunit.gradle;

import java.util.List;

record GradleMetadataRun(
    boolean successful,
    List<GradleMetadataRecord> records,
    String warning,
    String launcher,
    List<String> attemptedLaunchers
) {
  static GradleMetadataRun success(List<GradleMetadataRecord> records, String launcher, List<String> attemptedLaunchers) {
    return new GradleMetadataRun(true, List.copyOf(records), "", launcher, List.copyOf(attemptedLaunchers));
  }

  static GradleMetadataRun failure(String warning, String launcher, List<String> attemptedLaunchers) {
    return new GradleMetadataRun(false, List.of(), warning, launcher, List.copyOf(attemptedLaunchers));
  }
}
