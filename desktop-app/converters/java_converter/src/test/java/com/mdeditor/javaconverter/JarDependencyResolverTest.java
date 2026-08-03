package com.mdeditor.javaconverter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class JarDependencyResolverTest {
  @TempDir
  Path temp;

  @Test
  void resolvesReferencedClassesToAnotherClasspathJar() throws Exception {
    Path lib = Files.createDirectories(temp.resolve("lib"));
    Path annotations = createJar(
        lib.resolve("jackson-annotations.jar"),
        "com/fasterxml/jackson/annotation/JsonView.class",
        "annotation"
    );
    Path databind = createJar(
        lib.resolve("jackson-databind.jar"),
        "com/fasterxml/jackson/databind/ObjectMapper.class",
        "constant com/fasterxml/jackson/annotation/JsonView constant"
    );
    List<ExternalJarModel> indexed = List.of(
        model(databind, "com.fasterxml.jackson.databind", "ObjectMapper"),
        model(annotations, "com.fasterxml.jackson.annotation", "JsonView")
    );

    List<ExternalJarModel> resolved = JarDependencyResolver.resolve(indexed, new ArrayList<>());
    ExternalJarModel resolvedDatabind = resolved.stream()
        .filter(jar -> jar.path().equals(databind.toAbsolutePath().normalize()))
        .findFirst()
        .orElseThrow();

    assertEquals("bytecode-class-reference", resolvedDatabind.dependencyResolutionSource());
    assertEquals(List.of(annotations.toAbsolutePath().normalize()), resolvedDatabind.dependencyPaths());
    assertFalse(resolvedDatabind.dependencyFolderFallback());
  }

  @Test
  void fallsBackToOtherJarsUnderNearestLibFolder() throws Exception {
    Path lib = Files.createDirectories(temp.resolve("module/lib/nested"));
    Path first = createJar(lib.resolve("first.jar"), "example/First.class", "first");
    Path second = createJar(lib.resolve("second.jar"), "example/Second.class", "second");
    List<ExternalJarModel> indexed = List.of(
        model(first, "example", "First"),
        model(second, "example", "Second")
    );

    List<ExternalJarModel> resolved = JarDependencyResolver.resolve(indexed, new ArrayList<>());
    ExternalJarModel resolvedFirst = resolved.stream()
        .filter(jar -> jar.path().equals(first.toAbsolutePath().normalize()))
        .findFirst()
        .orElseThrow();

    assertTrue(resolvedFirst.dependencyFolderFallback());
    assertEquals("classpath-folder-fallback", resolvedFirst.dependencyResolutionSource());
    assertEquals(List.of(second.toAbsolutePath().normalize()), resolvedFirst.dependencyPaths());
  }

  private static ExternalJarModel model(Path jar, String packageName, String className) {
    return new ExternalJarModel(
        jar.toAbsolutePath().normalize(),
        Map.of(packageName, List.of(className))
    );
  }

  private static Path createJar(Path path, String entryName, String content) throws IOException {
    try (JarOutputStream output = new JarOutputStream(Files.newOutputStream(path))) {
      output.putNextEntry(new JarEntry(entryName));
      output.write(content.getBytes(StandardCharsets.ISO_8859_1));
      output.closeEntry();
    }
    return path;
  }
}
