package com.mdeditor.javaconverter.model;

import java.nio.file.Path;
import java.util.List;

public record CompileUnit(
    String id,
    String displayName,
    CompileUnitOrigin origin,
    CompileUnitScope scope,
    Path root,
    Path descriptorPath,
    List<Path> sourceRoots,
    List<Path> generatedSourceRoots,
    List<Path> dependencySourceRoots,
    List<Path> sourceFiles,
    List<Path> resourceRoots,
    List<Path> classpathEntries,
    List<String> dependencyUnitIds,
    String release,
    String source,
    String target,
    String encoding,
    List<String> warnings
) {
  public CompileUnit {
    sourceRoots = List.copyOf(sourceRoots);
    generatedSourceRoots = List.copyOf(generatedSourceRoots);
    dependencySourceRoots = List.copyOf(dependencySourceRoots);
    sourceFiles = List.copyOf(sourceFiles);
    resourceRoots = List.copyOf(resourceRoots);
    classpathEntries = List.copyOf(classpathEntries);
    dependencyUnitIds = List.copyOf(dependencyUnitIds);
    warnings = List.copyOf(warnings);
  }
}
