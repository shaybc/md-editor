package com.mdeditor.javaconverter.compileunit.maven;

import java.nio.file.Path;
import java.util.List;

record MavenModuleDescriptor(
    Path pom,
    Path moduleRoot,
    String groupId,
    String artifactId,
    String version,
    List<String> modules,
    List<MavenDependency> dependencies,
    Path mainSourceDirectory,
    Path testSourceDirectory,
    List<Path> mainResourceDirectories,
    List<Path> testResourceDirectories,
    String release,
    String source,
    String target,
    String encoding,
    List<String> warnings
) {
  MavenModuleDescriptor {
    modules = List.copyOf(modules);
    dependencies = List.copyOf(dependencies);
    mainResourceDirectories = List.copyOf(mainResourceDirectories);
    testResourceDirectories = List.copyOf(testResourceDirectories);
    warnings = List.copyOf(warnings);
  }

  String coordinateKey() {
    return groupId + ":" + artifactId;
  }
}

record MavenDependency(String groupId, String artifactId, String version, String scope, String type,
    String classifier, boolean optional) {
  String coordinateKey() {
    return groupId + ":" + artifactId;
  }
}

record MavenReactorUnitContext(
    String mainUnitId,
    String testUnitId,
    String integrationTestUnitId,
    List<Path> mainSourceRoots,
    List<Path> testSourceRoots,
    List<Path> integrationTestSourceRoots
) {
  MavenReactorUnitContext {
    mainSourceRoots = List.copyOf(mainSourceRoots);
    testSourceRoots = List.copyOf(testSourceRoots);
    integrationTestSourceRoots = List.copyOf(integrationTestSourceRoots);
  }
}
