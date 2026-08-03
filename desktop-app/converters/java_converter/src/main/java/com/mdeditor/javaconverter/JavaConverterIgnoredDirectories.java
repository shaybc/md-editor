package com.mdeditor.javaconverter;

import java.nio.file.Path;
import java.util.Set;

public final class JavaConverterIgnoredDirectories {
  public static final Set<String> WORKSPACE_TOOLING_DIRS = Set.of(
      ".git",
      ".github",
      ".gitlab",
      ".gitea",
      ".md-editor",
      ".hg",
      ".svn",
      ".idea",
      ".vscode",
      ".vs",
      ".settings",
      ".metadata",
      ".recommenders",
      ".externalToolBuilders",
      ".mvn",
      ".gradle",
      "node_modules",
      ".pnpm-store",
      ".yarn",
      ".yarn-cache",
      "bower_components",
      ".venv",
      "venv",
      "env",
      "__pycache__",
      ".pytest_cache",
      ".mypy_cache",
      ".ruff_cache",
      ".tox",
      ".nox",
      ".ipynb_checkpoints",
      ".cxx",
      ".externalNativeBuild",
      "captures",
      ".cache"
  );

  private JavaConverterIgnoredDirectories() {
  }

  public static boolean hasIgnoredSegment(Path root, Path path, Set<String> ignoredDirs) {
    Path relative = root.toAbsolutePath().normalize().relativize(path.toAbsolutePath().normalize());
    for (Path segment : relative) {
      if (ignoredDirs.contains(segment.toString())) {
        return true;
      }
    }
    return false;
  }
}
