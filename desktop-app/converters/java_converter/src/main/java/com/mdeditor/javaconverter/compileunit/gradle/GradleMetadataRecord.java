package com.mdeditor.javaconverter.compileunit.gradle;

import java.nio.file.Path;
import java.util.List;

record GradleMetadataRecord(
    String projectPath,
    Path projectDir,
    Path buildFile,
    String sourceSetName,
    List<Path> sourceRoots,
    List<Path> generatedSourceRoots,
    List<Path> resourceRoots,
    List<Path> sourceFiles,
    List<Path> classpathEntries,
    List<String> projectDependencyPaths,
    String release,
    String source,
    String target,
    String encoding,
    List<String> compilerArgs
) {
}
