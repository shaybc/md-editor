package com.mdeditor.javaconverter;

import java.nio.file.Path;

public record GradleDiscoveryOptions(
    Path gradleExecutable,
    boolean offline,
    Path userHome,
    GradleMetadataFailureMode failureMode
) {
  public static GradleDiscoveryOptions defaults() {
    return new GradleDiscoveryOptions(null, false, null, GradleMetadataFailureMode.PARSE_ONLY);
  }

  public GradleDiscoveryOptions(Path gradleExecutable, boolean offline, GradleMetadataFailureMode failureMode) {
    this(gradleExecutable, offline, null, failureMode);
  }

  public GradleDiscoveryOptions {
    if (failureMode == null) {
      failureMode = GradleMetadataFailureMode.PARSE_ONLY;
    }
  }
}
