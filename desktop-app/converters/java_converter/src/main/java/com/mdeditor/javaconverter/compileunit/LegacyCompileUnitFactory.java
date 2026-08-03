package com.mdeditor.javaconverter.compileunit;

import com.mdeditor.javaconverter.model.CompileUnit;
import com.mdeditor.javaconverter.model.CompileUnitOrigin;
import com.mdeditor.javaconverter.model.CompileUnitScope;

import java.nio.file.Path;
import java.util.List;

public final class LegacyCompileUnitFactory {
  private LegacyCompileUnitFactory() {
  }

  public static CompileUnit fromProjectScan(
      Path root,
      List<Path> sourceRoots,
      List<Path> sourceFiles,
      List<Path> classpathEntries,
      String release,
      String source,
      String target,
      String encoding,
      List<String> warnings
  ) {
    String displayName = root.getFileName() == null ? "Root project" : root.getFileName().toString();
    if (displayName.isBlank()) {
      displayName = "Root project";
    }
    return new CompileUnit(
        "root",
        displayName,
        CompileUnitOrigin.ROOT_SCAN,
        CompileUnitScope.MIXED,
        root,
        null,
        sourceRoots,
        List.of(),
        List.of(),
        sourceFiles,
        List.of(),
        classpathEntries,
        List.of(),
        release,
        source,
        target,
        encoding,
        warnings
    );
  }
}
