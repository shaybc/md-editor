package com.mdeditor.javaconverter;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * Describes an indexed external JAR and its resolved runtime dependency closure.
 */
record ExternalJarModel(
    Path path,
    Map<String, List<String>> packageClasses,
    MavenArtifactCoordinate coordinate,
    List<Path> dependencyPaths,
    String dependencyResolutionSource,
    boolean dependencyFolderFallback
) {
  ExternalJarModel(Path path, Map<String, List<String>> packageClasses) {
    this(path, packageClasses, null, List.of(), "unresolved", false);
  }

  List<String> availableClasses() {
    return packageClasses.entrySet().stream()
        .flatMap(entry -> entry.getValue().stream()
            .map(className -> entry.getKey().isBlank() ? className : entry.getKey() + "." + className))
        .toList();
  }
}
