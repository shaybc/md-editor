package com.mdeditor.javaconverter;

import java.nio.file.Path;
import java.util.List;

record ProjectModel(
    Path root,
    List<Path> sourceRoots,
    List<Path> sourceFiles,
    List<Path> classpathEntries,
    String release,
    String source,
    String target,
    String encoding,
    int mavenModules,
    List<String> warnings
) {
}
