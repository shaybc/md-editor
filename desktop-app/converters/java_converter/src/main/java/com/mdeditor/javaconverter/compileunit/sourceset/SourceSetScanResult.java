package com.mdeditor.javaconverter.compileunit.sourceset;

import com.mdeditor.javaconverter.model.CompileUnit;

import java.util.List;

public record SourceSetScanResult(List<CompileUnit> compileUnits, List<String> warnings) {
  public SourceSetScanResult {
    compileUnits = List.copyOf(compileUnits);
    warnings = List.copyOf(warnings);
  }
}
