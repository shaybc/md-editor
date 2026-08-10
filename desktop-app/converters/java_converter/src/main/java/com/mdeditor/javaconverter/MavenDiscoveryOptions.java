package com.mdeditor.javaconverter;

import java.nio.file.Path;

/** Maven process configuration supplied by the desktop application during project discovery. */
record MavenDiscoveryOptions(
    Path executable,
    Path settingsFile,
    boolean offline,
    Path localRepository
) {
  static MavenDiscoveryOptions defaults(boolean offline) {
    return new MavenDiscoveryOptions(null, null, offline, null);
  }
}
