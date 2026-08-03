package com.mdeditor.javaconverter.compileunit.maven;

import com.mdeditor.javaconverter.model.CompileUnit;

import java.util.List;

public record MavenCompileUnitScanResult(List<CompileUnit> compileUnits, List<String> warnings) {
  public MavenCompileUnitScanResult {
    compileUnits = List.copyOf(compileUnits);
    warnings = List.copyOf(warnings);
  }
}
