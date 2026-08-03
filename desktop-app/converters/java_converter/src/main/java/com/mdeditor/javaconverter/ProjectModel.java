package com.mdeditor.javaconverter;

import com.mdeditor.javaconverter.model.CompileUnit;

import java.nio.file.Path;
import java.util.List;

record ProjectModel(
    Path root,
    List<Path> sourceRoots,
    List<Path> sourceFiles,
    List<Path> classpathEntries,
    ExternalJarIndex externalJarIndex,
    String release,
    String source,
    String target,
    String encoding,
    int mavenModules,
    int gradleModules,
    List<CompileUnit> compileUnits,
    List<String> warnings
) {
}
