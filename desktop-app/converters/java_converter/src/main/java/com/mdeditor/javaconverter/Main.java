package com.mdeditor.javaconverter;

import picocli.CommandLine;
import picocli.CommandLine.Command;
import picocli.CommandLine.Option;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.Callable;

@Command(name = "java_converter", mixinStandardHelpOptions = true, version = "java_converter 1.0.0")
public final class Main implements Callable<Integer> {
  @Option(names = "--root", required = true, description = "Java source or project root to analyze.")
  Path root;

  @Option(names = "--vault", required = true, description = "Destination folder for generated Markdown.")
  Path vault;

  @Option(names = "--source-root-home",
      description = "Original source root used for portable relative source_file paths. Defaults to --root.")
  Path sourceRootHome;

  @Option(names = "--include-methods")
  boolean includeMethods;

  @Option(names = "--include-accessors")
  boolean includeAccessors;

  @Option(names = "--include-signatures")
  boolean includeSignatures;

  @Option(names = "--include-return-codes")
  boolean includeReturnCodes;

  @Option(names = "--include-exceptions")
  boolean includeExceptions;

  @Option(names = "--include-package")
  boolean includePackage;

  @Option(names = "--batch-size",
      description = "Files per compiler attribution batch (default 100). Larger = faster but more "
          + "memory; smaller = less memory.")
  Integer batchSize;

  @Option(names = "--profile",
      description = "Log per-phase timing (parse / attribute / scan) for every batch, so a slow or "
          + "hanging file shows which phase and which file range is taking the time.")
  boolean profile;

  @Option(names = "--resolve-maven-dependencies",
      description = "Allow Maven to download missing dependencies and index resolved dependency jars.")
  boolean resolveMavenDependencies;

  @Option(names = "--include-external-dependencies",
      description = "Inspect external jars and include used external dependencies in generated Markdown.")
  boolean includeExternalDependencies;

  @Option(names = "--gradle-executable",
      description = "Gradle executable to use for Gradle metadata extraction. Defaults to wrapper, then PATH.")
  Path gradleExecutable;

  @Option(names = "--gradle-offline",
      description = "Pass --offline when asking Gradle for Java source-set metadata.")
  boolean gradleOffline;

  @Option(names = "--gradle-user-home",
      description = "Gradle user home to use while asking Gradle for Java source-set metadata.")
  Path gradleUserHome;

  @Option(names = "--on-gradle-metadata-failure",
      description = "Behavior when real Gradle metadata extraction fails: parse-only or fail (default parse-only).")
  String onGradleMetadataFailure = "parse-only";

  @Option(names = "--javac-error-isolation",
      description = "Behavior when javac hits an internal compiler error: batch-parse-only or bisect (default batch-parse-only).")
  String javacErrorIsolation = "batch-parse-only";

  @Option(names = "--gradle-adaptive-analysis", arity = "0..1", fallbackValue = "true",
      description = "For Gradle metadata compile units, parse first and attribute only uncertain files (default true).")
  boolean gradleAdaptiveAnalysis = true;

  public static void main(String[] args) {
    System.exit(run(args, new JavaDependencyAnalyzer()));
  }

  static int run(String[] args, JavaDependencyAnalyzer analyzer) {
    return new CommandLine(new Main(analyzer)).execute(args);
  }

  private final JavaDependencyAnalyzer analyzer;

  Main() {
    this(new JavaDependencyAnalyzer());
  }

  private Main(JavaDependencyAnalyzer analyzer) {
    this.analyzer = analyzer;
  }

  @Override
  public Integer call() throws Exception {
    Instant runStartedAt = Instant.now();
    root = root.toAbsolutePath().normalize();
    vault = vault.toAbsolutePath().normalize();
    sourceRootHome = sourceRootHome == null ? root : sourceRootHome.toAbsolutePath().normalize();

    if (!Files.isDirectory(root)) {
      System.err.println("Source root is not a directory: " + root);
      return 2;
    }
    if (!Files.isDirectory(sourceRootHome)) {
      System.err.println("Source root home is not a directory: " + sourceRootHome);
      return 2;
    }

    Files.createDirectories(vault);
    if (!Files.isDirectory(vault)) {
      System.err.println("Vault path is not a directory: " + vault);
      return 2;
    }

    ConversionClock.log("Starting Java conversion");
    ConversionProgress.stage("startup", "Starting Java conversion");

    // Bridge explicit CLI knobs to the analyzer's configuration (read via system properties),
    // unless the user already set the property directly. CLI flag takes precedence when present.
    if (batchSize != null) {
      if (batchSize <= 0) {
        System.err.println("--batch-size must be a positive integer.");
        return 2;
      }
      System.setProperty("javaconverter.batchSize", Integer.toString(batchSize));
    }
    if (profile) {
      System.setProperty("javaconverter.profile", "true");
    }
    if (!JavaDependencyAnalyzer.isValidJavacErrorIsolationMode(javacErrorIsolation)) {
      System.err.println("--javac-error-isolation must be bisect or batch-parse-only.");
      return 2;
    }
    System.setProperty("javaconverter.javacErrorIsolation", javacErrorIsolation);
    System.setProperty("javaconverter.gradleAdaptiveAnalysis", Boolean.toString(gradleAdaptiveAnalysis));

    GradleMetadataFailureMode gradleFailureMode = parseGradleFailureMode(onGradleMetadataFailure);
    if (gradleFailureMode == null) {
      System.err.println("--on-gradle-metadata-failure must be parse-only or fail.");
      return 2;
    }
    GradleDiscoveryOptions gradleOptions = new GradleDiscoveryOptions(
        gradleExecutable == null ? null : gradleExecutable.toAbsolutePath().normalize(),
        gradleOffline,
        gradleUserHome == null ? null : gradleUserHome.toAbsolutePath().normalize(),
        gradleFailureMode
    );

    ConverterOptions options = new ConverterOptions(
        includeMethods,
        includeAccessors,
        includeSignatures,
        includeReturnCodes,
        includeExceptions,
        includePackage
    );

    try {
      Instant scanStartedAt = Instant.now();
      ConversionProgress.stage("scan", "Scanning project structure");
      ProjectModel project = ProjectScanner.scan(
          root,
          resolveMavenDependencies,
          includeExternalDependencies,
          gradleOptions
      );
      Instant scanFinishedAt = Instant.now();
      ConversionProgress.progress("scan", "Scanning source files", 0, project.sourceFiles().size());
      for (String warning : project.warnings()) {
        ConversionClock.log("Warning: " + warning);
      }
      if (project.sourceFiles().isEmpty()) {
        System.err.println("No Java source files found under: " + root);
        return 2;
      }

      Instant metadataStartedAt = Instant.now();
      ConversionProgress.progress("metadata", "Writing project metadata", 0, project.sourceFiles().size());
      ProjectMetadataWriter.write(vault, sourceRootHome, project);
      Instant metadataFinishedAt = Instant.now();
      MarkdownWriter writer = new MarkdownWriter(root, vault, sourceRootHome, options, project.externalJarIndex());
      Instant analysisStartedAt = Instant.now();
      ConversionProgress.progress("analysis", "Analyzing dependencies and writing Markdown", 0, project.sourceFiles().size());
      ConversionResult result = analyzer.analyzeAndWrite(project, writer);
      Instant analysisFinishedAt = Instant.now();
      Instant externalJarPagesStartedAt = Instant.now();
      ConversionProgress.progress("external", "Writing external dependency pages",
          result.markdownFilesWritten(), project.sourceFiles().size());
      writer.writeExternalJarPages();
      Instant externalJarPagesFinishedAt = Instant.now();
      Instant reportStartedAt = Instant.now();
      ConversionProgress.progress("report", "Writing conversion report",
          result.markdownFilesWritten(), project.sourceFiles().size());
      Instant runFinishedAt = Instant.now();
      ConversionPerformance performance = new ConversionPerformance(
          runStartedAt,
          runFinishedAt,
          Duration.between(runStartedAt, runFinishedAt),
          Duration.between(scanStartedAt, scanFinishedAt),
          Duration.between(metadataStartedAt, metadataFinishedAt),
          Duration.between(analysisStartedAt, analysisFinishedAt),
          Duration.between(externalJarPagesStartedAt, externalJarPagesFinishedAt),
          Duration.ZERO
      );
      ReportWriter.write(vault, project, result, sourceRootHome, performance);
      Instant reportFinishedAt = Instant.now();
      runFinishedAt = Instant.now();
      performance = new ConversionPerformance(
          runStartedAt,
          runFinishedAt,
          Duration.between(runStartedAt, runFinishedAt),
          Duration.between(scanStartedAt, scanFinishedAt),
          Duration.between(metadataStartedAt, metadataFinishedAt),
          Duration.between(analysisStartedAt, analysisFinishedAt),
          Duration.between(externalJarPagesStartedAt, externalJarPagesFinishedAt),
          Duration.between(reportStartedAt, reportFinishedAt)
      );

      ConversionClock.log("Java converter summary");
      ConversionClock.log("Files analyzed: " + result.filesAnalyzed());
      ConversionClock.log("Markdown files written: " + result.markdownFilesWritten());
      ConversionClock.log("Local dependencies found: " + result.localDependencyCount());
      ConversionClock.log("Unresolved symbols count: " + result.unresolvedCount());
      ConversionClock.log("Classpath entries count: " + project.classpathEntries().size());
      ConversionClock.log("Indexed external jars count: " + project.externalJarIndex().jars().size());
      ConversionClock.log("Maven modules detected: " + project.mavenModules());
      ConversionClock.log("Gradle build files detected: " + project.gradleModules());
      ConversionClock.log("Java compile units detected: " + project.compileUnits().size());
      result.diagnostics().stream()
          .filter(diagnostic -> diagnostic.contains("converter JVM only provides javac"))
          .findFirst()
          .ifPresent(diagnostic -> ConversionClock.log("Warning: " + diagnostic
              + ". Install/configure a matching newer JDK, then rerun the Java converter to enable javac attribution for that source set."));
      ConversionClock.log("Performance report");
      ConversionClock.log("Project scan time: " + ConversionClock.formatDuration(performance.projectScan()));
      ConversionClock.log("Metadata write time: " + ConversionClock.formatDuration(performance.metadataWrite()));
      ConversionClock.log("Analysis and Markdown write time: "
          + ConversionClock.formatDuration(performance.analysisAndMarkdownWrite()));
      ConversionClock.log("External jar page write time: "
          + ConversionClock.formatDuration(performance.externalJarPageWrite()));
      ConversionClock.log("Report write time: " + ConversionClock.formatDuration(performance.reportWrite()));
      ConversionClock.log("Total run time: " + ConversionClock.formatDuration(performance.totalRun()));
      ConversionProgress.complete(project.sourceFiles().size());
      return result.markdownFilesWritten() == 0 ? 1 : 0;
    } catch (Throwable error) {
      ConversionProgress.stage("failed", "Failed");
      ConversionClock.logException("Java conversion failed", error);
      ConversionClock.log("Total run time: " + ConversionClock.formatDuration(Duration.between(runStartedAt, Instant.now())));
      if (error instanceof Exception exception) {
        throw exception;
      }
      if (error instanceof Error fatal) {
        throw fatal;
      }
      throw new RuntimeException(error);
    }
  }

  private static GradleMetadataFailureMode parseGradleFailureMode(String value) {
    if (value == null || value.isBlank() || value.equalsIgnoreCase("parse-only")) {
      return GradleMetadataFailureMode.PARSE_ONLY;
    }
    if (value.equalsIgnoreCase("fail")) {
      return GradleMetadataFailureMode.FAIL;
    }
    return null;
  }
}
