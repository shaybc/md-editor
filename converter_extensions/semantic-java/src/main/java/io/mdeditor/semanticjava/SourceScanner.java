package io.mdeditor.semanticjava;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

final class SourceScanner {
  private static final Set<String> IGNORED_DIRS = Set.of(
      ".git", ".hg", ".svn", "node_modules", "dist", "build", "coverage",
      ".next", ".nuxt", ".venv", "venv", "__pycache__", "target", "out"
  );

  private SourceScanner() {
  }

  static List<Path> findJavaFiles(Path root) throws IOException {
    try (Stream<Path> stream = Files.walk(root)) {
      return stream
          .filter(Files::isRegularFile)
          .filter(path -> path.getFileName().toString().endsWith(".java"))
          .filter(path -> !containsIgnoredDirectory(root, path))
          .sorted(Comparator.comparing(Path::toString))
          .toList();
    }
  }

  static List<Path> detectSourceRoots(Path root, List<Path> javaFiles) {
    List<Path> commonRoots = List.of(
        root.resolve("src/main/java"),
        root.resolve("src/test/java"),
        root.resolve("src/integrationTest/java")
    ).stream()
        .map(path -> path.toAbsolutePath().normalize())
        .filter(Files::isDirectory)
        .filter(candidate -> javaFiles.stream().anyMatch(file -> file.startsWith(candidate)))
        .toList();

    return commonRoots.isEmpty() ? List.of(root) : commonRoots;
  }

  private static boolean containsIgnoredDirectory(Path root, Path file) {
    Path relative = root.relativize(file);
    for (Path part : relative) {
      if (IGNORED_DIRS.contains(part.toString())) return true;
    }
    return false;
  }
}
