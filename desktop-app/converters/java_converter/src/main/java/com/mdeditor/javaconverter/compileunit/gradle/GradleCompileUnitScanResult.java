package com.mdeditor.javaconverter.compileunit.gradle;

import com.mdeditor.javaconverter.model.CompileUnit;

import java.nio.file.Path;
import java.util.List;

public record GradleCompileUnitScanResult(
    List<CompileUnit> compileUnits,
    List<String> warnings,
    List<Path> classpathEntries
) {
  public GradleCompileUnitScanResult {
    compileUnits = List.copyOf(compileUnits);
    warnings = List.copyOf(warnings);
    classpathEntries = List.copyOf(classpathEntries);
  }

  public static GradleCompileUnitScanResult empty(List<String> warnings) {
    return new GradleCompileUnitScanResult(List.of(), warnings, List.of());
  }
}
