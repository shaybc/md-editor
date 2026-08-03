package com.mdeditor.javaconverter.compileunit.sourceset;

import com.mdeditor.javaconverter.model.CompileUnitScope;

import java.util.List;
import java.util.Optional;

record SourceSetPattern(String sourceSetName, String languageRoot, CompileUnitScope scope) {
  private static final List<SourceSetPattern> JAVA_PATTERNS = List.of(
      new SourceSetPattern("main", "java", CompileUnitScope.MAIN),
      new SourceSetPattern("test", "java", CompileUnitScope.TEST),
      new SourceSetPattern("integration-test", "java", CompileUnitScope.INTEGRATION_TEST),
      new SourceSetPattern("it", "java", CompileUnitScope.INTEGRATION_TEST),
      new SourceSetPattern("testFixtures", "java", CompileUnitScope.TEST_FIXTURES),
      new SourceSetPattern("benchmark", "java", CompileUnitScope.BENCHMARK),
      new SourceSetPattern("jmh", "java", CompileUnitScope.BENCHMARK),
      new SourceSetPattern("androidTest", "java", CompileUnitScope.TEST),
      new SourceSetPattern("debug", "java", CompileUnitScope.MAIN),
      new SourceSetPattern("release", "java", CompileUnitScope.MAIN)
  );

  static Optional<CompileUnitScope> javaScope(String sourceSetName, String languageRoot) {
    if (sourceSetName.equals("main") && languageRoot.matches("java\\d+")) {
      return Optional.of(CompileUnitScope.MAIN);
    }
    return JAVA_PATTERNS.stream()
        .filter(pattern -> pattern.sourceSetName.equals(sourceSetName))
        .filter(pattern -> pattern.languageRoot.equals(languageRoot))
        .map(SourceSetPattern::scope)
        .findFirst();
  }

  static boolean isKnownJavaRoot(String sourceSetName, String languageRoot) {
    return javaScope(sourceSetName, languageRoot).isPresent();
  }

  static boolean isKotlinRoot(String languageRoot) {
    return languageRoot.equals("kotlin");
  }

  static String resourceRootFor(String sourceSetName) {
    return switch (sourceSetName) {
      case "main" -> "resources";
      case "test" -> "resources";
      case "integration-test" -> "resources";
      case "it" -> "resources";
      case "testFixtures" -> "resources";
      case "benchmark" -> "resources";
      case "jmh" -> "resources";
      case "androidTest" -> "resources";
      case "debug" -> "resources";
      case "release" -> "resources";
      default -> "";
    };
  }
}
