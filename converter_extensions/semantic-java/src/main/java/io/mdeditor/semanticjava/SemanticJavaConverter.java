package io.mdeditor.semanticjava;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.resolution.TypeSolver;
import com.github.javaparser.symbolsolver.JavaSymbolSolver;
import com.github.javaparser.symbolsolver.resolution.typesolvers.CombinedTypeSolver;
import com.github.javaparser.symbolsolver.resolution.typesolvers.JavaParserTypeSolver;
import com.github.javaparser.symbolsolver.resolution.typesolvers.ReflectionTypeSolver;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

public final class SemanticJavaConverter {
  private SemanticJavaConverter() {
  }

  public static void main(String[] args) {
    try {
      if (args.length == 1 && ("--help".equals(args[0]) || "-h".equals(args[0]))) {
        printUsage();
        return;
      }
      ConverterOptions options = ConverterOptions.parse(args);
      run(options);
    } catch (Exception error) {
      System.err.println(error.getMessage());
      System.exit(1);
    }
  }

  private static void printUsage() {
    System.out.println(String.join(System.lineSeparator(),
        "Usage: java -jar semantic-java-converter.jar --root <source-folder> --vault <destination-folder> [flags]",
        "",
        "Flags:",
        "  --include-methods",
        "  --include-accessors",
        "  --include-signatures",
        "  --include-return-codes",
        "  --include-exceptions",
        "  --include-package"
    ));
  }

  private static void run(ConverterOptions options) throws Exception {
    if (!Files.isDirectory(options.root)) {
      throw new IllegalArgumentException("Source root is not a directory: " + options.root);
    }
    Files.createDirectories(options.vault);

    List<Path> javaFiles = SourceScanner.findJavaFiles(options.root);
    List<Path> sourceRoots = SourceScanner.detectSourceRoots(options.root, javaFiles);
    JavaParser indexParser = new JavaParser(new ParserConfiguration());
    LocalTypeIndex index = LocalTypeIndex.build(indexParser, javaFiles);

    JavaParser parser = new JavaParser(parserConfiguration(sourceRoots));
    UnresolvedTypeReport unresolvedReport = new UnresolvedTypeReport();
    JavaDependencyResolver resolver = new JavaDependencyResolver(index, unresolvedReport);
    MarkdownWriter writer = new MarkdownWriter(options, index);

    for (Path file : javaFiles) {
      ParseResult<CompilationUnit> result = parser.parse(file);
      if (result.getResult().isEmpty()) {
        writer.write(file, Set.of(), List.of(), List.of("Unable to parse this Java file."));
        continue;
      }

      CompilationUnit unit = result.getResult().get();
      Set<Path> dependencies = resolver.resolveDependencies(unit, file);
      List<MethodInfo> methods = MethodExtractor.extract(unit);
      List<String> warnings = parseWarnings(result);
      writer.write(file, dependencies, methods, warnings);
    }

    String suffix = "";
    if (!unresolvedReport.isEmpty()) {
      Path reportFile = unresolvedReport.write(options.vault);
      suffix = " Unique unresolved type names: " + unresolvedReport.uniqueTypeCount()
          + ". Report: " + reportFile + ".";
    }
    System.out.println("Created " + javaFiles.size() + " markdown file(s) in " + options.vault + "." + suffix);
  }

  private static ParserConfiguration parserConfiguration(List<Path> sourceRoots) {
    CombinedTypeSolver solver = new CombinedTypeSolver();
    solver.add(new ReflectionTypeSolver(false));
    for (Path sourceRoot : sourceRoots) {
      solver.add(new JavaParserTypeSolver(sourceRoot));
    }

    return new ParserConfiguration()
        .setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_17)
        .setSymbolResolver(new JavaSymbolSolver((TypeSolver) solver));
  }

  private static List<String> parseWarnings(ParseResult<CompilationUnit> result) {
    List<String> warnings = new ArrayList<>();
    result.getProblems().forEach(problem -> warnings.add(problem.getMessage()));
    return warnings;
  }
}
