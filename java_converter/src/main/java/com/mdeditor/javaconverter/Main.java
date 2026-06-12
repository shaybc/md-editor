package com.mdeditor.javaconverter;

import picocli.CommandLine;
import picocli.CommandLine.Command;
import picocli.CommandLine.Option;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.Callable;

@Command(name = "java_converter", mixinStandardHelpOptions = true, version = "java_converter 1.0.0")
public final class Main implements Callable<Integer> {
  @Option(names = "--root", required = true, description = "Java source or project root to analyze.")
  Path root;

  @Option(names = "--vault", required = true, description = "Destination folder for generated Markdown.")
  Path vault;

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
      description = "Files per compiler attribution batch (default 500). Larger = faster but more "
          + "memory; smaller = less memory.")
  Integer batchSize;

  @Option(names = "--profile",
      description = "Log per-phase timing (parse / attribute / scan) for every batch, so a slow or "
          + "hanging file shows which phase and which file range is taking the time.")
  boolean profile;

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
    root = root.toAbsolutePath().normalize();
    vault = vault.toAbsolutePath().normalize();

    if (!Files.isDirectory(root)) {
      System.err.println("Source root is not a directory: " + root);
      return 2;
    }

    Files.createDirectories(vault);
    if (!Files.isDirectory(vault)) {
      System.err.println("Vault path is not a directory: " + vault);
      return 2;
    }

    ConversionClock.log("Starting Java conversion");

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

    ConverterOptions options = new ConverterOptions(
        includeMethods,
        includeAccessors,
        includeSignatures,
        includeReturnCodes,
        includeExceptions,
        includePackage
    );

    ProjectModel project = ProjectScanner.scan(root);
    if (project.sourceFiles().isEmpty()) {
      System.err.println("No Java source files found under: " + root);
      return 2;
    }

    MarkdownWriter writer = new MarkdownWriter(root, vault, options);
    ConversionResult result = analyzer.analyzeAndWrite(project, writer);
    ReportWriter.write(vault, project, result);

    ConversionClock.log("Java converter summary");
    ConversionClock.log("Files analyzed: " + result.filesAnalyzed());
    ConversionClock.log("Markdown files written: " + result.markdownFilesWritten());
    ConversionClock.log("Local dependencies found: " + result.localDependencyCount());
    ConversionClock.log("Unresolved symbols count: " + result.unresolvedCount());
    ConversionClock.log("Classpath entries count: " + project.classpathEntries().size());
    ConversionClock.log("Maven modules detected: " + project.mavenModules());
    ConversionClock.log("Total conversion time: " + ConversionClock.formatDuration(result.duration()));
    return result.markdownFilesWritten() == 0 ? 1 : 0;
  }
}
