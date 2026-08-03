package com.mdeditor.javaconverter.compileunit.gradle;

import com.mdeditor.javaconverter.GradleDiscoveryOptions;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

public final class GradleCompileUnitDetector {
  private GradleCompileUnitDetector() {
  }

  public static GradleCompileUnitScanResult detect(Path root, GradleDiscoveryOptions options) throws IOException {
    GradleMetadataRun run = GradleMetadataExtractor.extract(root.toAbsolutePath().normalize(), options);
    if (!run.successful()) {
      return GradleCompileUnitScanResult.empty(List.of(run.warning()));
    }
    return GradleCompileUnitFactory.fromMetadata(root.toAbsolutePath().normalize(), run);
  }
}
