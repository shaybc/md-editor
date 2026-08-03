package com.mdeditor.javaconverter;

/**
 * Identifies one Maven artifact version discovered from JAR or repository metadata.
 */
record MavenArtifactCoordinate(
    String groupId,
    String artifactId,
    String version
) {
  String key() {
    return groupId + ":" + artifactId + ":" + version;
  }

  String versionlessKey() {
    return groupId + ":" + artifactId;
  }
}
