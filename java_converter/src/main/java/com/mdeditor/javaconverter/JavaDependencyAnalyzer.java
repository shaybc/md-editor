package com.mdeditor.javaconverter;

import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.ImportTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.ReturnTree;
import com.sun.source.tree.ThrowTree;
import com.sun.source.tree.Tree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.SourcePositions;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreePathScanner;
import com.sun.source.util.TreeScanner;
import com.sun.source.util.Trees;

import javax.lang.model.element.Element;
import javax.lang.model.element.ExecutableElement;
import javax.lang.model.element.TypeElement;
import javax.lang.model.type.ArrayType;
import javax.lang.model.type.DeclaredType;
import javax.lang.model.type.ExecutableType;
import javax.lang.model.type.IntersectionType;
import javax.lang.model.type.TypeKind;
import javax.lang.model.type.TypeMirror;
import javax.lang.model.type.UnionType;
import javax.lang.model.type.UnknownTypeException;
import javax.lang.model.type.WildcardType;
import javax.lang.model.util.SimpleTypeVisitor14;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticListener;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.StandardLocation;
import javax.tools.ToolProvider;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

class JavaDependencyAnalyzer {
  private static final int MAX_REPORTED_DIAGNOSTICS = 1000;
  private static final int DEFAULT_BATCH_SIZE = 500;

  /** When set (-Djavaconverter.profile=true or --profile), logs per-phase timing
   *  (parse / attribute / scan) for every batch, so a hanging file shows exactly which phase and
   *  which file range is slow. Read at call time so the --profile CLI flag (which sets the system
   *  property at startup) is honoured. */
  private static boolean profile() {
    return Boolean.getBoolean("javaconverter.profile");
  }

  private static int batchSize() {
    String configured = System.getProperty("javaconverter.batchSize");
    if (configured != null) {
      try {
        int value = Integer.parseInt(configured.trim());
        if (value > 0) {
          return value;
        }
      } catch (NumberFormatException ignored) {
      }
    }
    return DEFAULT_BATCH_SIZE;
  }


  AnalysisResult analyze(ProjectModel project) throws IOException {
    JavaCompiler compiler = requireCompiler();
    this.effectiveSourceRoots = null;
    Charset charset = Charset.forName(project.encoding());
    AnalysisDiagnostics diagnostics = new AnalysisDiagnostics();
    LinkedHashMap<Path, SourceFileModel> models = new LinkedHashMap<>();
    Map<String, Path> typeToSource = new HashMap<>();
    Map<Path, Set<String>> declaredTypesBySource = new HashMap<>();
    List<SourceFileModel> collected = new ArrayList<>();

    try (StandardJavaFileManager fileManager = compiler.getStandardFileManager(diagnostics, Locale.ROOT, charset)) {
      configureLocations(project, fileManager);
      parseProjectIndex(project, compiler, fileManager, diagnostics, models, typeToSource, declaredTypesBySource);
      for (Path sourceFile : project.sourceFiles()) {
        models.computeIfAbsent(sourceFile.toAbsolutePath().normalize(), SourceFileModel::new);
      }
      analyzeInBatches(project, compiler, fileManager, diagnostics, models, typeToSource,
          declaredTypesBySource, (model, written) -> collected.add(model), false);
    }

    List<SourceFileModel> sources = collected.stream()
        .sorted(Comparator.comparing(source -> source.file.toString()))
        .toList();
    return new AnalysisResult(sources, diagnostics.diagnostics(), diagnostics.unresolvedSymbols());
  }

  ConversionResult analyzeAndWrite(ProjectModel project, MarkdownWriter writer) throws IOException {
    Instant startedAt = Instant.now();
    JavaCompiler compiler = requireCompiler();
    this.effectiveSourceRoots = null;
    Charset charset = Charset.forName(project.encoding());
    AnalysisDiagnostics diagnostics = new AnalysisDiagnostics();
    LinkedHashMap<Path, SourceFileModel> models = new LinkedHashMap<>();
    Map<String, Path> typeToSource = new HashMap<>();
    Map<Path, Set<String>> declaredTypesBySource = new HashMap<>();
    int[] counters = new int[3];

    try (StandardJavaFileManager fileManager = compiler.getStandardFileManager(diagnostics, Locale.ROOT, charset)) {
      configureLocations(project, fileManager);
      ConversionClock.log("Indexing " + project.sourceFiles().size() + " Java files...");
      parseProjectIndex(project, compiler, fileManager, diagnostics, models, typeToSource, declaredTypesBySource);
      for (Path sourceFile : project.sourceFiles()) {
        models.computeIfAbsent(sourceFile.toAbsolutePath().normalize(), SourceFileModel::new);
      }
      analyzeInBatches(project, compiler, fileManager, diagnostics, models, typeToSource,
          declaredTypesBySource, (model, written) -> {
            try {
              writer.write(model);
            } catch (IOException error) {
              throw new UncheckedWriteException(error);
            }
            counters[1] += 1;
            counters[2] += model.dependencies.size();
            model.dependencies.clear();
            model.methods.clear();
            models.remove(model.file);
          }, true);
      counters[0] = project.sourceFiles().size();
    } catch (UncheckedWriteException wrapper) {
      throw wrapper.getCause();
    }

    Instant finishedAt = Instant.now();
    return new ConversionResult(counters[0], counters[1], counters[2], diagnostics.unresolvedCount(),
        startedAt, finishedAt, Duration.between(startedAt, finishedAt),
        diagnostics.diagnostics(), diagnostics.unresolvedSymbols());
  }

  private static JavaCompiler requireCompiler() {
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    if (compiler == null) {
      throw new IllegalStateException("A JDK is required. ToolProvider.getSystemJavaCompiler() returned null.");
    }
    return compiler;
  }

  private static void parseProjectIndex(ProjectModel project, JavaCompiler compiler,
      StandardJavaFileManager fileManager, AnalysisDiagnostics diagnostics,
      LinkedHashMap<Path, SourceFileModel> models, Map<String, Path> typeToSource,
      Map<Path, Set<String>> declaredTypesBySource) throws IOException {
    List<Path> allFiles = project.sourceFiles();
    int total = allFiles.size();
    int batch = batchSize();
    int indexed = 0;

    for (int start = 0; start < total; start += batch) {
      int end = Math.min(start + batch, total);
      List<Path> chunk = allFiles.subList(start, end);
      try {
        Iterable<? extends JavaFileObject> units = fileManager.getJavaFileObjectsFromPaths(chunk);
        JavacTask task = (JavacTask) compiler.getTask(null, fileManager, diagnostics, compilerOptions(project), null, units);
        for (CompilationUnitTree unit : task.parse()) {
          Path source = pathFromUnit(unit).orElse(null);
          if (source == null) {
            continue;
          }
          source = source.toAbsolutePath().normalize();
          SourceFileModel model = models.computeIfAbsent(source, SourceFileModel::new);
          model.packageName = unit.getPackageName() == null ? "" : unit.getPackageName().toString();
          Set<String> declared = declaredTypesBySource.computeIfAbsent(source, key -> new LinkedHashSet<>());
          new ParseOnlyTypeIndexScanner(source, model.packageName, typeToSource, model, declared).scan(unit, null);
        }
      } catch (RuntimeException error) {
        indexChunkPerFile(project, compiler, fileManager, diagnostics, models, typeToSource, declaredTypesBySource, chunk);
      }
      indexed += chunk.size();
      if (indexed % 1000 < chunk.size() || indexed == total) {
        ConversionClock.log("Indexed " + indexed + " / " + total + " Java files...");
      }
    }
  }

  private static void indexChunkPerFile(ProjectModel project, JavaCompiler compiler,
      StandardJavaFileManager fileManager, AnalysisDiagnostics diagnostics,
      LinkedHashMap<Path, SourceFileModel> models, Map<String, Path> typeToSource,
      Map<Path, Set<String>> declaredTypesBySource, List<Path> chunk) throws IOException {
    for (Path sourceFile : chunk) {
      try {
        Iterable<? extends JavaFileObject> units = fileManager.getJavaFileObjectsFromPaths(List.of(sourceFile));
        JavacTask task = (JavacTask) compiler.getTask(null, fileManager, diagnostics, compilerOptions(project), null, units);
        for (CompilationUnitTree unit : task.parse()) {
          Path source = pathFromUnit(unit).orElse(sourceFile).toAbsolutePath().normalize();
          SourceFileModel model = models.computeIfAbsent(source, SourceFileModel::new);
          model.packageName = unit.getPackageName() == null ? "" : unit.getPackageName().toString();
          Set<String> declared = declaredTypesBySource.computeIfAbsent(source, key -> new LinkedHashSet<>());
          new ParseOnlyTypeIndexScanner(source, model.packageName, typeToSource, model, declared).scan(unit, null);
        }
      } catch (RuntimeException error) {
        SourceFileModel model = models.computeIfAbsent(sourceFile.toAbsolutePath().normalize(), SourceFileModel::new);
        model.entityId = sourceFile.getFileName().toString().replaceFirst("\\.java$", "");
        diagnostics.addWarning("Source indexing failed for " + sourceFile + ": " + error);
      }
    }
  }

  @FunctionalInterface
  private interface ModelConsumer {
    void accept(SourceFileModel model, boolean written);
  }

  private void analyzeInBatches(ProjectModel project, JavaCompiler compiler,
      StandardJavaFileManager fileManager, AnalysisDiagnostics diagnostics,
      LinkedHashMap<Path, SourceFileModel> models, Map<String, Path> typeToSource,
      Map<Path, Set<String>> declaredTypesBySource, ModelConsumer consumer, boolean reportProgress) throws IOException {
    List<Path> allFiles = project.sourceFiles();
    int total = allFiles.size();
    int batch = batchSize();
    int processed = 0;

    // Identify redundant duplicate source files. A file is a duplicate when EVERY qualified
    // type it declares is canonically owned (per typeToSource / preferCanonicalSource) by a
    // DIFFERENT path -- i.e. an identical copy of the type exists elsewhere in the tree, as
    // happens when a project is checked out twice under one root (e.g. <root>\ and
    // <root>\project-main\). Co-analyzing duplicates is what makes javac's ambiguous-symbol
    // error recovery explode (the multi-minute batches seen on duplicated trees), and they add
    // no information the canonical copy doesn't already provide. We exclude them from analysis
    // and emit a stub note instead. Files that declare no types (e.g. package-info.java) are
    // never treated as duplicates. Projects with no duplication are completely unaffected:
    // every file is the canonical owner of its own types, so none are pruned.
    // Classify files that share a fully-qualified type with a canonical owner elsewhere:
    //   - IDENTICAL duplicate (same FQNs AND same content hash as the canonical): safe to
    //     exclude from analysis; it carries no information the canonical copy lacks. This is the
    //     checked-out-twice case (e.g. <root>\ and <root>\project-main\).
    //   - CONFLICTING duplicate (same FQN, DIFFERENT content): NOT excluded. Silently dropping it
    //     would lose real, distinct dependency information (legitimate multi-module / source-set
    //     overlap). It stays analyzable; the collision-free batching keeps it out of the same
    //     JavacTask as its namesake, so it attributes correctly via the sourcepath.
    List<Path> analyzable = new ArrayList<>(total);
    List<Path> duplicates = new ArrayList<>();
    Map<Path, Path> duplicateCanonical = new HashMap<>();
    for (Path file : allFiles) {
      Path normalized = file.toAbsolutePath().normalize();
      Set<String> declared = declaredTypesBySource.getOrDefault(normalized, Set.of());
      Path canonicalOwner = null;
      boolean allOwnedElsewhere = !declared.isEmpty();
      for (String type : declared) {
        Path canonical = typeToSource.get(type);
        if (canonical == null || canonical.equals(normalized)) {
          allOwnedElsewhere = false;
          break;
        }
        if (canonicalOwner == null) {
          canonicalOwner = canonical;
        } else if (!canonicalOwner.equals(canonical)) {
          // Types split across multiple canonical owners: treat as analyzable to be safe.
          allOwnedElsewhere = false;
          break;
        }
      }
      boolean identicalDuplicate = allOwnedElsewhere
          && canonicalOwner != null
          && sameContent(normalized, canonicalOwner);
      if (identicalDuplicate) {
        duplicates.add(normalized);
        duplicateCanonical.put(normalized, canonicalOwner);
      } else {
        analyzable.add(normalized);
      }
    }
    if (!duplicates.isEmpty()) {
      ConversionClock.log("Excluding " + duplicates.size() + " identical duplicate source file(s) from "
          + "analysis (same qualified types and content as a canonical copy under the root).");
      diagnostics.addWarning("Excluded " + duplicates.size() + " identical duplicate source file(s) "
          + "(same FQN and content hash as a canonical copy). Same-FQN files with DIFFERENT content "
          + "were kept and analyzed. Point --root at a single project copy to avoid duplicates entirely.");

      // Narrow the SOURCE_PATH to roots that own at least one canonical (analyzable) file.
      // A root containing only duplicate copies is dropped: leaving it on the sourcepath makes
      // javac resolve references ambiguously against two identical type copies, which is the
      // dominant cost on duplicated trees. We also drop any root that is an ANCESTOR of another
      // kept root, because an ancestor re-exposes the duplicate copies underneath it (e.g. a
      // bare <root> that contains both <root>\a\src and <root>\b\src). Roots are matched by
      // path prefix.
      List<Path> allRoots = project.sourceRoots();
      List<Path> ownsCanonicalRoots = new ArrayList<>();
      for (Path root : allRoots) {
        Path normalizedRoot = root.toAbsolutePath().normalize();
        for (Path canonical : analyzable) {
          if (canonical.startsWith(normalizedRoot)) {
            ownsCanonicalRoots.add(normalizedRoot);
            break;
          }
        }
      }
      // Drop ancestors of other kept roots, but only when every canonical file under the
      // ancestor is also covered by a more-specific kept root (so we never stop covering a
      // file that lives directly under the ancestor and nowhere else).
      List<Path> keptRoots = new ArrayList<>();
      for (Path candidate : ownsCanonicalRoots) {
        List<Path> descendants = new ArrayList<>();
        for (Path other : ownsCanonicalRoots) {
          if (!other.equals(candidate) && other.startsWith(candidate)) {
            descendants.add(other);
          }
        }
        boolean fullyCoveredByDescendants = !descendants.isEmpty();
        if (fullyCoveredByDescendants) {
          for (Path canonical : analyzable) {
            if (!canonical.startsWith(candidate)) {
              continue;
            }
            boolean covered = false;
            for (Path descendant : descendants) {
              if (canonical.startsWith(descendant)) {
                covered = true;
                break;
              }
            }
            if (!covered) {
              fullyCoveredByDescendants = false;
              break;
            }
          }
        }
        if (!fullyCoveredByDescendants) {
          keptRoots.add(candidate);
        }
      }
      if (!keptRoots.isEmpty() && keptRoots.size() < allRoots.size()) {
        this.effectiveSourceRoots = List.copyOf(keptRoots);
        ConversionClock.log("Reduced source path from " + allRoots.size() + " to " + keptRoots.size()
            + " root(s) after excluding duplicate-only and ancestor roots.");
      }
    }

    // Files still waiting to be placed in a batch, in original (sorted) order.
    List<Path> remaining = new ArrayList<>(analyzable);

    while (!remaining.isEmpty()) {
      // Build the next batch: take files in order, but never put two files that declare
      // the same qualified type into the same JavacTask. Co-compiling duplicate type
      // declarations makes javac emit "duplicate class" errors and produce error symbols,
      // which would silently drop real dependencies. Colliding files are deferred to a
      // later batch where they compile cleanly (resolving siblings via the sourcepath,
      // exactly as the original one-file-per-task code did).
      List<Path> chunk = new ArrayList<>(Math.min(batch, remaining.size()));
      Set<String> claimedTypes = new HashSet<>();
      List<Path> deferred = new ArrayList<>();

      for (Path file : remaining) {
        if (chunk.size() >= batch) {
          // Batch already full: every subsequent file is deferred unconditionally.
          deferred.add(file);
          continue;
        }
        Set<String> declared = declaredTypesBySource.getOrDefault(file, Set.of());
        boolean collides = false;
        for (String type : declared) {
          if (claimedTypes.contains(type)) {
            collides = true;
            break;
          }
        }
        if (collides) {
          deferred.add(file);
        } else {
          chunk.add(file);
          claimedTypes.addAll(declared);
        }
      }

      // Safety: a single file whose own declarations collide with itself cannot happen,
      // so chunk is always non-empty here as long as remaining is non-empty.
      long batchStart = System.currentTimeMillis();
      if (profile()) {
        ConversionClock.log("batch start: " + chunk.size() + " file(s) ["
            + chunk.get(0).getFileName() + " ... " + chunk.get(chunk.size() - 1).getFileName() + "]");
      }
      List<SourceFileModel> analyzedInOrder = analyzeBatch(project, compiler, fileManager, diagnostics, models, typeToSource, chunk);
      for (SourceFileModel model : analyzedInOrder) {
        consumer.accept(model, true);
      }
      if (profile()) {
        ConversionClock.log("batch done: " + chunk.size() + " file(s) in "
            + (System.currentTimeMillis() - batchStart) + "ms");
      }

      processed += chunk.size();
      if (reportProgress) {
        ConversionClock.log("Analyzed and wrote " + processed + " / " + total + " Java files...");
      } else if (processed % 250 < chunk.size() || processed == total) {
        System.out.println("Analyzed " + processed + " / " + total + " Java files...");
      }

      remaining = deferred;
    }

    // Emit stub output for the excluded duplicates so the output file set still mirrors the
    // input tree (and any links to them resolve). Their models carry the indexed entity
    // identity but no dependencies, since we deliberately did not analyze them.
    for (Path duplicate : duplicates) {
      SourceFileModel model = models.get(duplicate);
      if (model != null) {
        model.analysisStatus = SourceFileModel.AnalysisStatus.EXCLUDED_DUPLICATE;
        model.duplicateOf = duplicateCanonical.get(duplicate);
        consumer.accept(model, true);
      }
    }
  }

  private List<SourceFileModel> analyzeBatch(ProjectModel project, JavaCompiler compiler,
      StandardJavaFileManager fileManager, AnalysisDiagnostics diagnostics,
      LinkedHashMap<Path, SourceFileModel> models, Map<String, Path> typeToSource, List<Path> chunk) throws IOException {
    Iterable<? extends JavaFileObject> units = fileManager.getJavaFileObjectsFromPaths(chunk);
    JavacTask task = (JavacTask) compiler.getTask(null, fileManager, diagnostics, compilerOptions(project), null, units);

    long parseStart = System.currentTimeMillis();
    List<CompilationUnitTree> compilationUnits = new ArrayList<>();
    try {
      for (CompilationUnitTree unit : task.parse()) {
        compilationUnits.add(unit);
      }
      long parseMs = System.currentTimeMillis() - parseStart;
      if (profile()) {
        ConversionClock.log("  parse: " + chunk.size() + " file(s) in " + parseMs + "ms");
      }

      // Attribution (task.analyze) is the expensive phase. Log before so a hang is visible with
      // the exact file range still being attributed.
      long analyzeStart = System.currentTimeMillis();
      if (profile()) {
        ConversionClock.log("  attributing " + chunk.size() + " file(s): "
            + chunk.get(0).getFileName() + " ... " + chunk.get(chunk.size() - 1).getFileName());
      }
      analyzeParsedTask(task);
      if (profile()) {
        ConversionClock.log("  analyze: " + chunk.size() + " file(s) in "
            + (System.currentTimeMillis() - analyzeStart) + "ms");
      }
    } catch (RuntimeException error) {
      // A batch failed to attribute as a unit (hard compiler error). Retry each file in its own
      // task so a single bad file cannot suppress dependency extraction for its neighbours; the
      // per-file path records a precise "Compiler attribution failed for <file>" warning.
      if (chunk.size() == 1) {
        return List.of(analyzeSingleFile(project, compiler, fileManager, diagnostics, models, typeToSource, chunk.get(0)));
      }
      if (profile()) {
        ConversionClock.log("  batch attribution error, retrying " + chunk.size() + " file(s) per-file: " + error);
      }
      return analyzeChunkPerFile(project, compiler, fileManager, diagnostics, models, typeToSource, chunk);
    }

    long scanStart = System.currentTimeMillis();
    Trees trees = Trees.instance(task);
    Map<Path, SourceFileModel> analyzedBySource = new HashMap<>();
    for (CompilationUnitTree unit : compilationUnits) {
      Path source = pathFromUnit(unit).orElse(null);
      if (source == null) {
        continue;
      }
      source = source.toAbsolutePath().normalize();
      SourceFileModel model = models.computeIfAbsent(source, SourceFileModel::new);
      model.packageName = unit.getPackageName() == null ? "" : unit.getPackageName().toString();
      new DependencyScanner(trees, source, typeToSource, model).scan(unit, null);
      model.dependencies.remove(source);
      analyzedBySource.put(source, model);
    }
    if (profile()) {
      ConversionClock.log("  scan: " + compilationUnits.size() + " unit(s) in "
          + (System.currentTimeMillis() - scanStart) + "ms");
    }

    List<SourceFileModel> ordered = new ArrayList<>(chunk.size());
    for (Path sourceFile : chunk) {
      Path normalized = sourceFile.toAbsolutePath().normalize();
      SourceFileModel model = analyzedBySource.get(normalized);
      if (model == null) {
        model = models.get(normalized);
      }
      if (model != null) {
        ordered.add(model);
      }
    }
    return ordered;
  }

  // Source roots used for the SOURCE_PATH during the analyze phase. Narrowed to exclude roots
  // that contain only duplicate (non-canonical) files, which otherwise make javac resolve
  // every reference ambiguously against two identical copies. Null until computed.
  private volatile List<Path> effectiveSourceRoots;

  private List<SourceFileModel> analyzeChunkPerFile(ProjectModel project, JavaCompiler compiler,
      StandardJavaFileManager fileManager, AnalysisDiagnostics diagnostics,
      LinkedHashMap<Path, SourceFileModel> models, Map<String, Path> typeToSource, List<Path> chunk) throws IOException {
    List<SourceFileModel> ordered = new ArrayList<>(chunk.size());
    for (Path sourceFile : chunk) {
      SourceFileModel model = analyzeSingleFile(project, compiler, fileManager, diagnostics, models, typeToSource, sourceFile);
      if (model != null) {
        ordered.add(model);
      }
    }
    return ordered;
  }

  /**
   * Terminal per-file analyzer: one JavacTask, blocking, preserving the original
   * "Compiler attribution failed for <file>" diagnostics for files that hit a hard compiler error.
   */
  private SourceFileModel analyzeSingleFile(ProjectModel project, JavaCompiler compiler,
      StandardJavaFileManager fileManager, AnalysisDiagnostics diagnostics,
      LinkedHashMap<Path, SourceFileModel> models, Map<String, Path> typeToSource, Path sourceFile) throws IOException {
    Iterable<? extends JavaFileObject> units = fileManager.getJavaFileObjectsFromPaths(List.of(sourceFile));
    JavacTask task = (JavacTask) compiler.getTask(null, fileManager, diagnostics, compilerOptions(project), null, units);

    if (profile()) {
      ConversionClock.log("    per-file attribute: " + sourceFile.getFileName());
    }
    List<CompilationUnitTree> compilationUnits = new ArrayList<>();
    for (CompilationUnitTree unit : task.parse()) {
      compilationUnits.add(unit);
    }
    try {
      analyzeParsedTask(task);
    } catch (RuntimeException error) {
      diagnostics.addWarning("Compiler attribution failed for " + sourceFile + ": " + error);
      SourceFileModel failed = models.get(sourceFile.toAbsolutePath().normalize());
      if (failed != null) {
        failed.analysisStatus = SourceFileModel.AnalysisStatus.FAILED;
      }
      return failed;
    }

    SourceFileModel analyzedModel = null;
    Trees trees = Trees.instance(task);
    for (CompilationUnitTree unit : compilationUnits) {
      Path source = pathFromUnit(unit).orElse(null);
      if (source == null) {
        continue;
      }
      source = source.toAbsolutePath().normalize();
      SourceFileModel model = models.computeIfAbsent(source, SourceFileModel::new);
      model.packageName = unit.getPackageName() == null ? "" : unit.getPackageName().toString();
      new DependencyScanner(trees, source, typeToSource, model).scan(unit, null);
      model.dependencies.remove(source);
      analyzedModel = model;
    }
    return analyzedModel == null ? models.get(sourceFile.toAbsolutePath().normalize()) : analyzedModel;
  }

  protected void analyzeParsedTask(JavacTask task) throws IOException {
    task.analyze();
  }

  private void configureLocations(ProjectModel project, StandardJavaFileManager fileManager) throws IOException {
    if (!project.classpathEntries().isEmpty()) {
      fileManager.setLocationFromPaths(StandardLocation.CLASS_PATH, project.classpathEntries());
    }
    List<Path> roots = effectiveSourceRoots != null ? effectiveSourceRoots : project.sourceRoots();
    if (!roots.isEmpty()) {
      fileManager.setLocationFromPaths(StandardLocation.SOURCE_PATH, roots);
    }
  }

  private static List<String> compilerOptions(ProjectModel project) {
    List<String> options = new ArrayList<>();
    options.add("-proc:none");
    options.add("-Xlint:none");
    if (project.release() != null && !project.release().isBlank()) {
      options.add("--release");
      options.add(project.release());
    } else {
      if (project.source() != null && !project.source().isBlank()) {
        options.add("-source");
        options.add(project.source());
      }
      if (project.target() != null && !project.target().isBlank()) {
        options.add("-target");
        options.add(project.target());
      }
    }
    return options;
  }

  /**
   * True if two files have identical content. Compares size first (cheap reject), then bytes.
   * On any I/O error returns false (conservative: treat as NOT identical, so we keep and analyze
   * rather than silently dropping). Result is used only to decide whether a same-FQN file is a
   * safe-to-exclude exact copy versus a conflicting copy that must be analyzed.
   */
  private static boolean sameContent(Path a, Path b) {
    try {
      if (Files.size(a) != Files.size(b)) {
        return false;
      }
      return java.util.Arrays.equals(Files.readAllBytes(a), Files.readAllBytes(b));
    } catch (IOException error) {
      return false;
    }
  }

  private static Optional<Path> pathFromUnit(CompilationUnitTree unit) {
    try {
      URI uri = unit.getSourceFile().toUri();
      if ("file".equalsIgnoreCase(uri.getScheme())) {
        return Optional.of(Path.of(uri));
      }
    } catch (Exception ignored) {
    }
    return Optional.empty();
  }

  private static String formatDiagnostic(Diagnostic<? extends JavaFileObject> diagnostic) {
    String source = diagnostic.getSource() == null ? "" : diagnostic.getSource().getName();
    return diagnostic.getKind() + " " + source + ":" + diagnostic.getLineNumber() + " " + diagnostic.getMessage(Locale.ROOT);
  }

  private static boolean isUnresolvedDiagnostic(Diagnostic<? extends JavaFileObject> diagnostic) {
    String message = diagnostic.getMessage(Locale.ROOT).toLowerCase(Locale.ROOT);
    return diagnostic.getKind() == Diagnostic.Kind.ERROR
        && (message.contains("cannot find symbol") || message.contains("package") && message.contains("does not exist"));
  }

  private static final class UncheckedWriteException extends RuntimeException {
    UncheckedWriteException(IOException cause) {
      super(cause);
    }
    @Override
    public synchronized IOException getCause() {
      return (IOException) super.getCause();
    }
  }

  private static final class AnalysisDiagnostics implements DiagnosticListener<JavaFileObject> {
    private final List<String> diagnostics = new ArrayList<>();
    private final List<String> unresolvedSymbols = new ArrayList<>();
    private int diagnosticCount;
    private int unresolvedCount;

    @Override
    public synchronized void report(Diagnostic<? extends JavaFileObject> diagnostic) {
      diagnosticCount += 1;
      boolean unresolved = isUnresolvedDiagnostic(diagnostic);
      if (unresolved) {
        unresolvedCount += 1;
      }
      String formatted = formatDiagnostic(diagnostic);
      if (diagnostics.size() < MAX_REPORTED_DIAGNOSTICS) {
        diagnostics.add(formatted);
      }
      if (unresolved && unresolvedSymbols.size() < MAX_REPORTED_DIAGNOSTICS) {
        unresolvedSymbols.add(formatted);
      }
    }

    synchronized void addWarning(String warning) {
      diagnosticCount += 1;
      if (diagnostics.size() < MAX_REPORTED_DIAGNOSTICS) {
        diagnostics.add(warning);
      }
    }

    synchronized int unresolvedCount() {
      return unresolvedCount;
    }

    synchronized List<String> diagnostics() {
      if (diagnosticCount <= MAX_REPORTED_DIAGNOSTICS) {
        return List.copyOf(diagnostics);
      }
      List<String> result = new ArrayList<>(diagnostics);
      result.add("Diagnostics truncated at " + MAX_REPORTED_DIAGNOSTICS + " entries.");
      return result;
    }

    synchronized List<String> unresolvedSymbols() {
      if (unresolvedCount <= MAX_REPORTED_DIAGNOSTICS) {
        return List.copyOf(unresolvedSymbols);
      }
      List<String> result = new ArrayList<>(unresolvedSymbols);
      result.add("Unresolved symbols truncated at " + MAX_REPORTED_DIAGNOSTICS + " entries.");
      return result;
    }
  }

  private static final class ParseOnlyTypeIndexScanner extends TreeScanner<Void, Void> {
    private final Path source;
    private final String packageName;
    private final Map<String, Path> typeToSource;
    private final SourceFileModel model;
    private final Set<String> declaredTypes;
    private final List<String> typeStack = new ArrayList<>();
    private boolean entitySet;

    ParseOnlyTypeIndexScanner(Path source, String packageName, Map<String, Path> typeToSource,
        SourceFileModel model, Set<String> declaredTypes) {
      this.source = source;
      this.packageName = packageName;
      this.typeToSource = typeToSource;
      this.model = model;
      this.declaredTypes = declaredTypes;
    }

    @Override
    public Void visitClass(ClassTree node, Void unused) {
      String simpleName = node.getSimpleName().toString();
      if (simpleName.isBlank()) {
        return super.visitClass(node, unused);
      }
      typeStack.add(simpleName);
      String qualifiedName = qualifiedName();
      typeToSource.merge(qualifiedName, source, ParseOnlyTypeIndexScanner::preferCanonicalSource);
      if (declaredTypes != null) {
        declaredTypes.add(qualifiedName);
      }
      if (!entitySet) {
        model.entityType = "java_" + entityKind(node);
        model.entityId = qualifiedName;
        entitySet = true;
      }
      try {
        return super.visitClass(node, unused);
      } finally {
        typeStack.remove(typeStack.size() - 1);
      }
    }

    private String qualifiedName() {
      String localName = String.join(".", typeStack);
      return packageName == null || packageName.isBlank() ? localName : packageName + "." + localName;
    }

    private static String entityKind(ClassTree node) {
      if (node.getKind() == Tree.Kind.INTERFACE) return "interface";
      if (node.getKind() == Tree.Kind.ENUM) return "enum";
      if (node.getKind() == Tree.Kind.RECORD) return "record";
      if (node.getKind() == Tree.Kind.ANNOTATION_TYPE) return "interface";
      return "class";
    }

    private static Path preferCanonicalSource(Path existing, Path candidate) {
      int existingNameCount = existing.getNameCount();
      int candidateNameCount = candidate.getNameCount();
      if (candidateNameCount != existingNameCount) {
        return candidateNameCount < existingNameCount ? candidate : existing;
      }
      return candidate.toString().compareTo(existing.toString()) < 0 ? candidate : existing;
    }
  }

  private static final class DependencyScanner extends TreePathScanner<Void, Void> {
    private final Trees trees;
    private final SourcePositions positions;
    private final Path source;
    private final Map<String, Path> typeToSource;
    private final SourceFileModel model;
    private final Set<String> seenMethods = new LinkedHashSet<>();

    DependencyScanner(Trees trees, Path source, Map<String, Path> typeToSource, SourceFileModel model) {
      this.trees = trees;
      this.positions = trees.getSourcePositions();
      this.source = source;
      this.typeToSource = typeToSource;
      this.model = model;
    }

    @Override
    public Void scan(Tree tree, Void unused) {
      if (tree != null) {
        TreePath path = getCurrentPath() == null && tree instanceof CompilationUnitTree unit
            ? new TreePath(unit)
            : new TreePath(getCurrentPath(), tree);
        addElement(trees.getElement(path));
        addType(trees.getTypeMirror(path));
      }
      return super.scan(tree, unused);
    }

    @Override
    public Void visitImport(ImportTree node, Void unused) {
      return null;
    }

    @Override
    public Void visitMethod(MethodTree node, Void unused) {
      MethodInfo method = methodInfo(node);
      if (method != null && seenMethods.add(method.signature())) {
        model.methods.add(method);
      }
      return super.visitMethod(node, unused);
    }

    private MethodInfo methodInfo(MethodTree node) {
      String name = node.getName().toString();
      if (name.equals("<init>")) {
        name = model.entityId.substring(model.entityId.lastIndexOf('.') + 1);
      }
      String signature = compactSignature(signatureText(node));
      if (signature.isBlank()) {
        signature = node.toString().split("\\{", 2)[0].trim();
      }
      ReturnAndThrowScanner scanner = new ReturnAndThrowScanner();
      scanner.scan(node.getBody(), null);
      return new MethodInfo(name, isAccessorName(name) ? "accessor" : "method", signature,
          List.copyOf(scanner.returns), List.copyOf(scanner.exceptions));
    }

    private String signatureText(MethodTree node) {
      CompilationUnitTree unit = getCurrentPath().getCompilationUnit();
      long start = positions.getStartPosition(unit, node);
      long end = node.getBody() == null
          ? positions.getEndPosition(unit, node)
          : positions.getStartPosition(unit, node.getBody());
      if (start < 0 || end < start) {
        return "";
      }
      try {
        CharSequence content = unit.getSourceFile().getCharContent(true);
        return content.subSequence((int) start, (int) end).toString();
      } catch (IOException error) {
        return "";
      }
    }

    private void addElement(Element element) {
      if (element == null) {
        return;
      }
      Element current = element;
      if (current instanceof ExecutableElement executable) {
        addType(executable.getReturnType());
        executable.getParameters().forEach(parameter -> addType(parameter.asType()));
        executable.getThrownTypes().forEach(this::addType);
      }
      while (current != null && !(current instanceof TypeElement)) {
        addType(current.asType());
        current = current.getEnclosingElement();
      }
      if (current instanceof TypeElement typeElement) {
        addTypeElement(typeElement);
      }
    }

    private void addType(TypeMirror mirror) {
      if (mirror == null || mirror.getKind() == TypeKind.NONE || mirror.getKind() == TypeKind.VOID) {
        return;
      }
      try {
        mirror.accept(new SimpleTypeVisitor14<Void, Void>() {
        @Override
        protected Void defaultAction(TypeMirror type, Void unused) {
          return null;
        }
        @Override
        public Void visitDeclared(DeclaredType type, Void unused) {
          Element element = type.asElement();
          if (element instanceof TypeElement typeElement) {
            addTypeElement(typeElement);
          }
          type.getTypeArguments().forEach(DependencyScanner.this::addType);
          return null;
        }
        @Override
        public Void visitArray(ArrayType type, Void unused) {
          addType(type.getComponentType());
          return null;
        }
        @Override
        public Void visitExecutable(ExecutableType type, Void unused) {
          addType(type.getReturnType());
          type.getParameterTypes().forEach(DependencyScanner.this::addType);
          type.getThrownTypes().forEach(DependencyScanner.this::addType);
          type.getTypeVariables().forEach(DependencyScanner.this::addType);
          return null;
        }
        @Override
        public Void visitWildcard(WildcardType type, Void unused) {
          addType(type.getExtendsBound());
          addType(type.getSuperBound());
          return null;
        }
        @Override
        public Void visitUnion(UnionType type, Void unused) {
          type.getAlternatives().forEach(DependencyScanner.this::addType);
          return null;
        }
        @Override
        public Void visitIntersection(IntersectionType type, Void unused) {
          type.getBounds().forEach(DependencyScanner.this::addType);
          return null;
        }
        }, null);
      } catch (UnknownTypeException ignored) {
      }
    }

    private void addTypeElement(TypeElement typeElement) {
      String qualifiedName = typeElement.getQualifiedName().toString();
      Path dependency = typeToSource.get(qualifiedName);
      if (dependency != null && !dependency.equals(source) && !qualifiedName.equals(model.entityId)) {
        model.dependencies.add(dependency);
      }
    }
  }

  private static final class ReturnAndThrowScanner extends TreeScanner<Void, Void> {
    private final Set<String> returns = new LinkedHashSet<>();
    private final Set<String> exceptions = new LinkedHashSet<>();

    @Override
    public Void visitReturn(ReturnTree node, Void unused) {
      returns.add(node.getExpression() == null ? "void" : node.getExpression().toString());
      return super.visitReturn(node, unused);
    }

    @Override
    public Void visitThrow(ThrowTree node, Void unused) {
      exceptions.add(node.getExpression() == null ? "unknown" : node.getExpression().toString());
      return super.visitThrow(node, unused);
    }
  }

  private static String compactSignature(String signature) {
    return signature.replaceAll("\\s+", " ").replaceAll("\\s*\\{\\s*$", "").trim();
  }

  private static boolean isAccessorName(String name) {
    return name.matches("^(get|set|is)[A-Z_].*");
  }
}
