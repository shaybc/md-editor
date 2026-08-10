package com.mdeditor.javaconverter;

import com.mdeditor.javaconverter.compileunit.LegacyCompileUnitFactory;
import com.mdeditor.javaconverter.compileunit.gradle.GradleCompileUnitDetector;
import com.mdeditor.javaconverter.compileunit.gradle.GradleCompileUnitScanResult;
import com.mdeditor.javaconverter.compileunit.maven.MavenCompileUnitDetector;
import com.mdeditor.javaconverter.compileunit.maven.MavenCompileUnitScanResult;
import com.mdeditor.javaconverter.compileunit.sourceset.SourceSetCompileUnitDetector;
import com.mdeditor.javaconverter.compileunit.sourceset.SourceSetScanResult;
import com.mdeditor.javaconverter.model.CompileUnit;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.jar.JarFile;
import java.util.stream.Stream;

final class ProjectScanner {
  private static final int MAX_MAVEN_OUTPUT_BYTES = 64 * 1024;
  private static final Set<String> IGNORED_DIRS = Set.of(
      ".git", ".github", ".gitlab", ".gitea", ".md-editor", ".hg", ".svn",
      ".idea", ".vscode", ".vs", ".settings", ".metadata", ".recommenders", ".externalToolBuilders",
      ".mvn", ".gradle", "node_modules", ".pnpm-store", ".yarn", ".yarn-cache", "bower_components",
      ".venv", "venv", "env", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
      ".tox", ".nox", ".ipynb_checkpoints", ".cxx", ".externalNativeBuild", "captures", ".cache",
      "target", "build", "out", "dist", "coverage", ".nyc_output", ".next", ".nuxt", ".svelte-kit",
      ".angular", ".turbo", ".parcel-cache", ".vite", "bin", "obj", "DerivedData", ".swiftpm", ".build"
  );

  private ProjectScanner() {
  }

  static ProjectModel scan(Path root) throws IOException {
    return scan(root, false, false);
  }

  static ProjectModel scan(Path root, boolean resolveMavenDependencies) throws IOException {
    return scan(root, resolveMavenDependencies, resolveMavenDependencies);
  }

  static ProjectModel scan(Path root, boolean resolveMavenDependencies, boolean includeExternalDependencies) throws IOException {
    return scan(root, resolveMavenDependencies, includeExternalDependencies, GradleDiscoveryOptions.defaults());
  }

  static ProjectModel scan(Path root, boolean resolveMavenDependencies, boolean includeExternalDependencies,
      GradleDiscoveryOptions gradleOptions) throws IOException {
    return scan(root, resolveMavenDependencies, includeExternalDependencies, gradleOptions,
        MavenDiscoveryOptions.defaults(!resolveMavenDependencies));
  }

  static ProjectModel scan(Path root, boolean resolveMavenDependencies, boolean includeExternalDependencies,
      GradleDiscoveryOptions gradleOptions, MavenDiscoveryOptions mavenOptions) throws IOException {
    if (gradleOptions == null) {
      gradleOptions = GradleDiscoveryOptions.defaults();
    }
    if (mavenOptions == null) {
      mavenOptions = MavenDiscoveryOptions.defaults(!resolveMavenDependencies);
    }
    List<String> warnings = new ArrayList<>();
    ConversionClock.log("Scanning project structure: " + root.toAbsolutePath().normalize());
    ConversionClock.log("Searching for Maven project metadata...");
    List<Path> poms = findPomFiles(root);
    ConversionClock.log("Detected Maven project metadata: " + poms.size() + " pom.xml file(s)");
    ConversionClock.log("Searching for Gradle project metadata...");
    List<Path> gradleBuildFiles = discoverGradleBuildFiles(root);
    ConversionClock.log("Detected Gradle project metadata: " + gradleBuildFiles.size() + " build file(s)");
    LinkedHashSet<Path> sourceRoots = new LinkedHashSet<>();
    LinkedHashSet<Path> classpath = new LinkedHashSet<>();
    LinkedHashSet<Path> externalJarCandidates = new LinkedHashSet<>();
    CompilerSettings settings = new CompilerSettings();

    if (poms.isEmpty()) {
      sourceRoots.add(root);
    } else {
      for (Path pom : poms) {
        ConversionProgress.stage("metadata", "Reading Maven metadata");
        Path moduleRoot = pom.getParent();
        Path mainSource = moduleRoot.resolve("src/main/java");
        if (Files.isDirectory(mainSource)) {
          sourceRoots.add(mainSource.toAbsolutePath().normalize());
        }
        readCompilerSettings(pom, settings, warnings);
        List<Path> mavenClasspath = List.of();
        if (includeExternalDependencies) {
          ConversionProgress.stage("metadata", "Resolving Maven classpath");
          ConversionClock.log("Resolving Maven classpath for " + relative(root, pom));
          mavenClasspath = runMavenClasspath(pom, warnings, resolveMavenDependencies, mavenOptions);
          ConversionClock.log("Maven classpath resolved for " + relative(root, pom) + ": "
              + mavenClasspath.size() + " entries");
        }
        classpath.addAll(mavenClasspath);
        if (includeExternalDependencies) {
          ConversionClock.log("Aggregate classpath entries after " + relative(root, pom) + ": "
              + classpath.size() + " entries");
        }
        if (includeExternalDependencies) {
          externalJarCandidates.addAll(readableJars(mavenClasspath, warnings));
        }
        Path classes = moduleRoot.resolve("target/classes");
        if (Files.isDirectory(classes)) {
          classpath.add(classes.toAbsolutePath().normalize());
        }
      }
    }

    if (sourceRoots.isEmpty()) {
      sourceRoots.add(root);
    }
    ConversionClock.log("Scanning Java source files...");
    ConversionProgress.stage("scan", "Scanning Java source files");
    List<Path> sourceFiles = findJavaFiles(root);
    ConversionClock.log("Discovered " + sourceFiles.size() + " Java source file(s)");
    ConversionProgress.progress("scan", "Scanning Java source files", 0, sourceFiles.size());
    ConversionClock.log("Inferring aggregate source roots...");
    sourceRoots.addAll(inferSourceRoots(sourceFiles));
    ConversionClock.log("Scanning local classpath entries...");
    List<Path> localClasspathEntries = findLocalClasspathEntries(root, warnings);
    if (Boolean.getBoolean("javaconverter.skipLocalJarClasspath")) {
      localClasspathEntries.stream()
          .filter(path -> !Files.isRegularFile(path) || !path.getFileName().toString().endsWith(".jar"))
          .forEach(classpath::add);
    } else {
      classpath.addAll(localClasspathEntries);
    }
    if (includeExternalDependencies) {
      externalJarCandidates.addAll(localProjectJars(root, localClasspathEntries));
    }
    String encoding = settings.encoding == null ? StandardCharsets.UTF_8.name() : settings.encoding;
    List<Path> classpathList = List.copyOf(classpath);
    ConversionClock.log("Detecting Java compile units...");
    ConversionProgress.progress("metadata", "Detecting Java compile units", 0, sourceFiles.size());
    MavenCompileUnitScanResult mavenScan = MavenCompileUnitDetector.detect(
        root,
        poms,
        classpathList,
        settings.release,
        settings.source,
        settings.target,
        encoding
    );
    GradleCompileUnitScanResult gradleScan = GradleCompileUnitScanResult.empty(List.of());
    if (mavenScan.compileUnits().isEmpty() && !gradleBuildFiles.isEmpty()) {
      ConversionClock.log("Asking Gradle for evaluated Java source-set metadata...");
      ConversionProgress.progress("metadata", "Resolving Gradle source-set metadata", 0, sourceFiles.size());
      gradleScan = GradleCompileUnitDetector.detect(root, gradleOptions);
      if (gradleScan.compileUnits().isEmpty()
          && gradleOptions.failureMode() == GradleMetadataFailureMode.FAIL) {
        throw new IOException("Gradle metadata extraction failed and --on-gradle-metadata-failure=fail was requested: "
            + String.join("; ", gradleScan.warnings()));
      }
      if (gradleScan.compileUnits().isEmpty() && !gradleScan.warnings().isEmpty()) {
        ConversionClock.log("Gradle Java metadata extraction did not return usable compile units; using configured fallback.");
      } else {
        ConversionClock.log("Gradle Java metadata returned " + gradleScan.compileUnits().size()
            + " compile unit(s)");
      }
      gradleScan.compileUnits().stream()
          .flatMap(unit -> Stream.concat(unit.sourceRoots().stream(), unit.generatedSourceRoots().stream()))
          .forEach(sourceRoots::add);
      gradleScan.classpathEntries().forEach(classpath::add);
      if (includeExternalDependencies) {
        externalJarCandidates.addAll(readableJars(gradleScan.classpathEntries(), warnings));
      }
    }
    boolean gradleParseOnly = mavenScan.compileUnits().isEmpty()
        && gradleScan.compileUnits().isEmpty()
        && !gradleBuildFiles.isEmpty();
    if (gradleParseOnly) {
      warnings.add(JavaAnalysisMode.GRADLE_PARSE_ONLY);
    }
    boolean needsFallbackCompileUnitScan = mavenScan.compileUnits().isEmpty() && gradleScan.compileUnits().isEmpty();
    SourceSetScanResult sourceSetScan = needsFallbackCompileUnitScan
        ? SourceSetCompileUnitDetector.detect(
            root,
            sourceFiles,
            settings.release,
            settings.source,
            settings.target,
            encoding
        )
        : new SourceSetScanResult(List.of(), List.of());
    warnings.addAll(mavenScan.warnings());
    gradleScan.warnings().stream()
        .flatMap(warning -> warning.lines().map(String::trim).filter(line -> !line.isBlank()))
        .forEach(warnings::add);
    if (needsFallbackCompileUnitScan) {
      warnings.addAll(sourceSetScan.warnings());
    }
    List<Path> sourceRootList = List.copyOf(sourceRoots);
    classpathList = List.copyOf(classpath);
    if (includeExternalDependencies) {
      ConversionClock.log("Indexing external jars...");
      ConversionProgress.progress("external", "Indexing external jars", 0, sourceFiles.size());
    }
    ExternalJarIndex externalJarIndex = includeExternalDependencies
        ? ExternalJarIndex.scan(List.copyOf(externalJarCandidates), warnings)
        : ExternalJarIndex.empty();
    List<String> warningList = List.copyOf(warnings);
    List<CompileUnit> compileUnits = !mavenScan.compileUnits().isEmpty()
        ? logSelectedCompileUnits(root, "Maven project metadata", mavenScan.compileUnits())
        : !gradleScan.compileUnits().isEmpty()
        ? logSelectedCompileUnits(root, "Gradle project metadata", gradleScan.compileUnits())
        : sourceSetScan.compileUnits().isEmpty()
        ? logSelectedCompileUnits(root,
            gradleParseOnly ? "Gradle parse-only package-path discovery" : "package-path inference fallback",
            markParseOnlyIfNeeded(List.of(LegacyCompileUnitFactory.fromProjectScan(
            root,
            sourceRootList,
            sourceFiles,
            classpathList,
            settings.release,
            settings.source,
            settings.target,
            encoding,
            warningList
        )), gradleParseOnly))
        : logSelectedCompileUnits(root,
            gradleParseOnly ? "Gradle parse-only source-set discovery" : "explicit source root discovery",
            markParseOnlyIfNeeded(sourceSetScan.compileUnits(), gradleParseOnly));

    return new ProjectModel(
        root,
        sourceRootList,
        sourceFiles,
        classpathList,
        externalJarIndex,
        settings.release,
        settings.source,
        settings.target,
        encoding,
        poms.size(),
        gradleBuildFiles.size(),
        compileUnits,
        warningList
    );
  }

  private static List<Path> discoverGradleBuildFiles(Path root) throws IOException {
    Path normalizedRoot = root.toAbsolutePath().normalize();
    try (Stream<Path> stream = Files.walk(normalizedRoot)) {
      return stream
          .filter(Files::isRegularFile)
          .filter(ProjectScanner::isGradleBuildFile)
          .filter(path -> !JavaConverterIgnoredDirectories.hasIgnoredSegment(
              normalizedRoot,
              path,
              JavaConverterIgnoredDirectories.WORKSPACE_TOOLING_DIRS
          ))
          .map(path -> path.toAbsolutePath().normalize())
          .sorted()
          .toList();
    }
  }

  private static boolean isGradleBuildFile(Path path) {
    String name = path.getFileName().toString();
    return name.equals("build.gradle") || name.equals("build.gradle.kts");
  }

  private static List<CompileUnit> logSelectedCompileUnits(Path root, String method, List<CompileUnit> compileUnits) {
    ConversionClock.log("Java compile unit detection method: " + method);
    for (CompileUnit unit : compileUnits) {
      ConversionClock.log("Detected Java compile unit: " + unit.id() + " ("
          + unit.scope().name().toLowerCase(java.util.Locale.ROOT).replace('_', '-') + ") at "
          + relative(root, unit.root()));
    }
    return compileUnits;
  }

  private static List<CompileUnit> markParseOnlyIfNeeded(List<CompileUnit> compileUnits, boolean parseOnly) {
    if (!parseOnly) {
      return compileUnits;
    }
    return compileUnits.stream()
        .map(ProjectScanner::markParseOnly)
        .toList();
  }

  private static CompileUnit markParseOnly(CompileUnit unit) {
    List<String> warnings = new ArrayList<>(unit.warnings());
    if (!warnings.contains(JavaAnalysisMode.GRADLE_PARSE_ONLY)) {
      warnings.add(JavaAnalysisMode.GRADLE_PARSE_ONLY);
    }
    return new CompileUnit(
        unit.id(),
        unit.displayName(),
        unit.origin(),
        unit.scope(),
        unit.root(),
        unit.descriptorPath(),
        unit.sourceRoots(),
        unit.generatedSourceRoots(),
        unit.dependencySourceRoots(),
        unit.sourceFiles(),
        unit.resourceRoots(),
        unit.classpathEntries(),
        unit.dependencyUnitIds(),
        unit.release(),
        unit.source(),
        unit.target(),
        unit.encoding(),
        warnings
    );
  }

  private static List<Path> localProjectJars(Path root, List<Path> classpathEntries) {
    Path normalizedRoot = root.toAbsolutePath().normalize();
    return readableJars(classpathEntries, new ArrayList<>()).stream()
        .filter(path -> path.startsWith(normalizedRoot))
        .sorted()
        .toList();
  }

  private static List<Path> readableJars(List<Path> paths, List<String> warnings) {
    List<Path> jars = new ArrayList<>();
    for (Path path : paths) {
      if (!Files.isRegularFile(path) || !path.getFileName().toString().endsWith(".jar")) {
        continue;
      }
      Path jar = path.toAbsolutePath().normalize();
      if (isReadableJar(jar, warnings)) {
        jars.add(jar);
      }
    }
    return jars;
  }

  private static List<Path> findPomFiles(Path root) throws IOException {
    LinkedHashSet<Path> poms = new LinkedHashSet<>();
    Optional<Path> ancestorPom = findAncestorPom(root);
    if (ancestorPom.isPresent()) {
      poms.add(ancestorPom.get());
      if (!ancestorPom.get().getParent().equals(root.toAbsolutePath().normalize())) {
        return List.copyOf(poms);
      }
    }

    try (Stream<Path> stream = Files.walk(root)) {
      stream
          .filter(path -> path.getFileName().toString().equals("pom.xml"))
          .filter(path -> !hasIgnoredSegment(root, path))
          .map(path -> path.toAbsolutePath().normalize())
          .sorted()
          .forEach(poms::add);
    }
    return List.copyOf(poms);
  }

  private static Optional<Path> findAncestorPom(Path root) {
    Path current = root;
    while (current != null) {
      Path pom = current.resolve("pom.xml");
      if (Files.isRegularFile(pom)) {
        return Optional.of(pom.toAbsolutePath().normalize());
      }
      current = current.getParent();
    }
    return Optional.empty();
  }

  private static List<Path> findJavaFiles(Path root) throws IOException {
    try (Stream<Path> stream = Files.walk(root)) {
      return stream
          .filter(Files::isRegularFile)
          .filter(path -> path.getFileName().toString().endsWith(".java"))
          .filter(path -> !hasIgnoredSegment(root, path))
          .map(path -> path.toAbsolutePath().normalize())
          .sorted()
          .toList();
    }
  }

  private static List<Path> inferSourceRoots(List<Path> sourceFiles) {
    LinkedHashSet<Path> roots = new LinkedHashSet<>();
    Pattern packagePattern = Pattern.compile("(?m)^\\s*package\\s+([\\w.]+)\\s*;");
    for (Path sourceFile : sourceFiles) {
      try {
        String content = Files.readString(sourceFile, StandardCharsets.UTF_8);
        Matcher matcher = packagePattern.matcher(content);
        if (!matcher.find()) {
          roots.add(sourceFile.getParent());
          continue;
        }
        Path root = sourceFile.getParent();
        String[] parts = matcher.group(1).split("\\.");
        for (int i = 0; i < parts.length && root != null; i += 1) {
          root = root.getParent();
        }
        if (root != null) {
          roots.add(root.toAbsolutePath().normalize());
        }
      } catch (IOException ignored) {
        // A later compiler diagnostic/report entry will cover unreadable files.
      }
    }
    return List.copyOf(roots);
  }

  private static List<Path> findLocalClasspathEntries(Path root, List<String> warnings) throws IOException {
    try (Stream<Path> stream = Files.walk(root)) {
      List<Path> candidates = stream
          .filter(path -> Files.isRegularFile(path) && path.getFileName().toString().endsWith(".jar")
              || Files.isDirectory(path) && path.getFileName().toString().equals("classes"))
          .filter(path -> !hasIgnoredSegment(root, path))
          .map(path -> path.toAbsolutePath().normalize())
          .sorted()
          .toList();
      List<Path> result = new ArrayList<>();
      for (Path candidate : candidates) {
        if (Files.isDirectory(candidate) || isReadableJar(candidate, warnings)) {
          result.add(candidate);
        }
      }
      return result;
    }
  }

  private static boolean isReadableJar(Path jar, List<String> warnings) {
    try (JarFile ignored = new JarFile(jar.toFile(), false)) {
      return true;
    } catch (IOException error) {
      warnings.add("Skipped invalid jar on classpath: " + jar + " (" + error.getMessage() + ")");
      return false;
    }
  }

  private static boolean hasIgnoredSegment(Path root, Path path) {
    return JavaConverterIgnoredDirectories.hasIgnoredSegment(root, path, IGNORED_DIRS);
  }

  private static String relative(Path root, Path path) {
    Path normalizedRoot = root.toAbsolutePath().normalize();
    Path normalizedPath = path.toAbsolutePath().normalize();
    if (normalizedPath.equals(normalizedRoot)) {
      return ".";
    }
    if (normalizedPath.startsWith(normalizedRoot)) {
      return normalizedRoot.relativize(normalizedPath).toString().replace('\\', '/');
    }
    return normalizedPath.toString().replace('\\', '/');
  }

  private static void readCompilerSettings(Path pom, CompilerSettings settings, List<String> warnings) {
    try {
      Document document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(pom.toFile());
      document.getDocumentElement().normalize();
      Map<String, String> properties = readProperties(document);
      settings.release = resolvedText(document, "maven.compiler.release", properties, pom, warnings).orElse(settings.release);
      settings.source = resolvedText(document, "maven.compiler.source", properties, pom, warnings).orElse(settings.source);
      settings.target = resolvedText(document, "maven.compiler.target", properties, pom, warnings).orElse(settings.target);
      settings.encoding = resolvedText(document, "project.build.sourceEncoding", properties, pom, warnings).orElse(settings.encoding);

      NodeList plugins = document.getElementsByTagName("plugin");
      for (int i = 0; i < plugins.getLength(); i += 1) {
        Element plugin = (Element) plugins.item(i);
        String artifactId = firstChildText(plugin, "artifactId").orElse("");
        if (!artifactId.equals("maven-compiler-plugin")) {
          continue;
        }
        settings.release = resolvedChildText(plugin, "release", properties, pom, warnings).orElse(settings.release);
        settings.source = resolvedChildText(plugin, "source", properties, pom, warnings).orElse(settings.source);
        settings.target = resolvedChildText(plugin, "target", properties, pom, warnings).orElse(settings.target);
        settings.encoding = resolvedChildText(plugin, "encoding", properties, pom, warnings).orElse(settings.encoding);
      }
    } catch (Exception error) {
      warnings.add("Could not read compiler settings from " + pom + ": " + error.getMessage());
    }
  }

  private static Map<String, String> readProperties(Document document) {
    Map<String, String> properties = new HashMap<>();
    NodeList nodes = document.getElementsByTagName("properties");
    if (nodes.getLength() == 0) {
      return properties;
    }

    NodeList children = nodes.item(0).getChildNodes();
    for (int i = 0; i < children.getLength(); i += 1) {
      if (children.item(i) instanceof Element element) {
        String value = element.getTextContent();
        if (value != null && !value.trim().isEmpty()) {
          properties.put(element.getTagName(), value.trim());
        }
      }
    }
    return properties;
  }

  private static Optional<String> resolvedText(Document document, String tag, Map<String, String> properties, Path pom, List<String> warnings) {
    return firstText(document, tag).map(value -> resolveProperties(value, properties, pom, warnings));
  }

  private static Optional<String> resolvedChildText(Element element, String tag, Map<String, String> properties, Path pom, List<String> warnings) {
    return firstChildText(element, tag).map(value -> resolveProperties(value, properties, pom, warnings));
  }

  private static String resolveProperties(String value, Map<String, String> properties, Path pom, List<String> warnings) {
    String resolved = value;
    for (int pass = 0; pass < 8; pass += 1) {
      Matcher matcher = Pattern.compile("\\$\\{([^}]+)}|@([^@\\s]+)@").matcher(resolved);
      StringBuffer buffer = new StringBuffer();
      boolean changed = false;
      while (matcher.find()) {
        String propertyName = matcher.group(1) != null ? matcher.group(1) : matcher.group(2);
        String replacement = properties.get(propertyName);
        if (replacement == null) {
          warnings.add("Unresolved Maven property in compiler setting from " + pom + ": " + matcher.group(0));
          continue;
        }
        matcher.appendReplacement(buffer, Matcher.quoteReplacement(replacement));
        changed = true;
      }
      matcher.appendTail(buffer);
      resolved = buffer.toString();
      if (!changed) break;
    }
    if (Pattern.compile("\\$\\{[^}]+}|@[^@\\s]+@").matcher(resolved).find()) {
      warnings.add("Skipping unresolved compiler setting from " + pom + ": " + value);
      return "";
    }
    return resolved.trim();
  }

  private static Optional<String> firstText(Document document, String tag) {
    NodeList nodes = document.getElementsByTagName(tag);
    if (nodes.getLength() == 0) {
      return Optional.empty();
    }
    return Optional.ofNullable(nodes.item(0).getTextContent()).map(String::trim).filter(value -> !value.isEmpty());
  }

  private static Optional<String> firstChildText(Element element, String tag) {
    NodeList nodes = element.getElementsByTagName(tag);
    if (nodes.getLength() == 0) {
      return Optional.empty();
    }
    return Optional.ofNullable(nodes.item(0).getTextContent()).map(String::trim).filter(value -> !value.isEmpty());
  }

  private static List<Path> runMavenClasspath(Path pom, List<String> warnings, boolean resolveMavenDependencies,
      MavenDiscoveryOptions mavenOptions) {
    Path output = null;
    List<String> attemptedLaunchers = new ArrayList<>();
    try {
      output = Files.createTempFile("java-converter-classpath", ".txt");
      for (List<String> command : mavenClasspathCommands(pom, output, mavenOptions)) {
        attemptedLaunchers.add(command.get(0));
        MavenRunResult result = runMavenCommand(command);
        if (!result.started()) {
          continue;
        }
        if (!result.finished()) {
          warnings.add("Timed out while asking Maven for classpath: " + pom + " using " + command.get(0)
              + firstOutputLine(result.output()));
          return List.of();
        }
        if (result.exitCode() != 0 || !Files.isRegularFile(output)) {
          List<Path> fallbackClasspath = resolveLocalMavenRepositoryClasspath(pom, warnings);
          if (!fallbackClasspath.isEmpty()) {
            warnings.add("Maven classpath plugin failed for: " + pom + " using " + command.get(0)
                + "; used local Maven repository fallback with " + fallbackClasspath.size() + " jar(s).");
            return fallbackClasspath;
          }
          String hint = resolveMavenDependencies ? "" : " (use --resolve-maven-dependencies to download missing artifacts)";
          warnings.add("Maven classpath extraction failed for: " + pom + " using " + command.get(0) + hint
              + firstOutputLine(result.output()));
          return List.of();
        }
        String text = Files.readString(output, StandardCharsets.UTF_8).trim();
        if (text.isEmpty()) {
          if (hasDeclaredProjectDependencies(pom, warnings)) {
            warnings.add("Maven classpath extraction returned 0 entries for " + pom
                + " despite declared dependencies using " + command.get(0) + ".");
            List<Path> fallbackClasspath = resolveLocalMavenRepositoryClasspath(pom, warnings);
            warnings.add("Local Maven repository fallback for empty Maven classpath returned "
                + fallbackClasspath.size() + " jar(s): " + pom);
            if (!fallbackClasspath.isEmpty()) {
              return fallbackClasspath;
            }
          }
          return List.of();
        }
        String separator = System.getProperty("path.separator");
        List<Path> paths = new ArrayList<>();
        for (String entry : text.split(java.util.regex.Pattern.quote(separator))) {
          if (!entry.isBlank()) {
            paths.add(Path.of(entry).toAbsolutePath().normalize());
          }
        }
        return paths;
      }
      List<Path> fallbackClasspath = resolveLocalMavenRepositoryClasspath(pom, warnings);
      if (!fallbackClasspath.isEmpty()) {
        warnings.add("Could not run Maven classpath extraction for " + pom
            + "; used local Maven repository fallback with " + fallbackClasspath.size() + " jar(s).");
        return fallbackClasspath;
      }
      warnings.add("Could not run Maven classpath extraction for " + pom
          + ": no Maven launcher worked. Tried: " + String.join(", ", attemptedLaunchers));
    } catch (Exception error) {
      warnings.add("Could not run Maven classpath extraction for " + pom + ": " + error.getMessage());
    } finally {
      if (output != null) {
        try {
          Files.deleteIfExists(output);
        } catch (IOException ignored) {
          // The temporary file is harmless if Windows still has a handle open briefly.
        }
      }
    }
    return List.of();
  }

  private static List<List<String>> mavenClasspathCommands(Path pom, Path output, MavenDiscoveryOptions options) {
    List<List<String>> commands = new ArrayList<>();
    if (options.executable() != null) {
      commands.add(mavenClasspathCommand(options.executable().toString(), pom, output, options));
      return commands;
    }
    Path moduleRoot = pom.getParent();
    if (moduleRoot != null) {
      Path wrapper = moduleRoot.resolve(isWindows() ? "mvnw.cmd" : "mvnw");
      if (Files.isRegularFile(wrapper)) {
        commands.add(mavenClasspathCommand(wrapper.toString(), pom, output, options));
      }
    }
    addMavenHomeCommand(commands, "MAVEN_HOME", pom, output, options);
    addMavenHomeCommand(commands, "M2_HOME", pom, output, options);
    if (isWindows()) {
      commands.add(mavenClasspathCommand("mvn.cmd", pom, output, options));
    }
    commands.add(mavenClasspathCommand("mvn", pom, output, options));
    return commands;
  }

  private static void addMavenHomeCommand(List<List<String>> commands, String envName, Path pom, Path output,
      MavenDiscoveryOptions options) {
    String home = System.getenv(envName);
    if (home == null || home.isBlank()) {
      return;
    }
    Path launcher = Path.of(home, "bin", isWindows() ? "mvn.cmd" : "mvn");
    if (Files.isRegularFile(launcher)) {
      commands.add(mavenClasspathCommand(launcher.toString(), pom, output, options));
    }
  }

  private static List<String> mavenClasspathCommand(String launcher, Path pom, Path output,
      MavenDiscoveryOptions options) {
    List<String> command = new ArrayList<>();
    command.add(launcher);
    command.add("-q");
    if (options.settingsFile() != null) {
      command.add("--settings");
      command.add(options.settingsFile().toString());
    }
    if (options.offline()) {
      command.add("-o");
    }
    if (options.localRepository() != null) {
      command.add("-Dmaven.repo.local=" + options.localRepository());
    }
    command.add("-f");
    command.add(pom.toString());
    command.add("org.apache.maven.plugins:maven-dependency-plugin:3.8.1:build-classpath");
    command.add("-Dmdep.outputFile=" + output);
    return command;
  }

  private static MavenRunResult runMavenCommand(List<String> command) {
    Path processOutput = null;
    try {
      processOutput = Files.createTempFile("java-converter-maven-output", ".log");
      Process process = new ProcessBuilder(command)
          .redirectErrorStream(true)
          .redirectOutput(processOutput.toFile())
          .start();
      boolean finished = process.waitFor(Duration.ofSeconds(60).toMillis(), TimeUnit.MILLISECONDS);
      if (!finished) {
        process.destroyForcibly();
        process.waitFor(Duration.ofSeconds(5).toMillis(), TimeUnit.MILLISECONDS);
        String output = readMavenOutput(processOutput);
        return new MavenRunResult(true, false, -1, output);
      }
      String output = readMavenOutput(processOutput);
      return new MavenRunResult(true, true, process.exitValue(), output);
    } catch (IOException error) {
      return new MavenRunResult(false, false, -1, error.getMessage());
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      return new MavenRunResult(true, false, -1, error.getMessage());
    } finally {
      if (processOutput != null) {
        try {
          Files.deleteIfExists(processOutput);
        } catch (IOException ignored) {
          // The temporary file is harmless if Windows still has a handle open briefly.
        }
      }
    }
  }

  private static String readMavenOutput(Path processOutput) throws IOException {
    if (processOutput == null || !Files.isRegularFile(processOutput)) {
      return "";
    }
    try (InputStream input = Files.newInputStream(processOutput)) {
      return new String(input.readNBytes(MAX_MAVEN_OUTPUT_BYTES), StandardCharsets.UTF_8).trim();
    }
  }

  private static String firstOutputLine(String output) {
    if (output == null || output.isBlank()) {
      return "";
    }
    return " (" + output.lines().findFirst().orElse("").trim() + ")";
  }

  private static List<Path> resolveLocalMavenRepositoryClasspath(Path pom, List<String> warnings) {
    LinkedHashSet<Path> jars = new LinkedHashSet<>();
    try {
      collectLocalMavenPomClasspath(pom, jars, new LinkedHashSet<>(), warnings, 0);
    } catch (Exception error) {
      warnings.add("Local Maven repository fallback failed for " + pom + ": " + error.getMessage());
    }
    return List.copyOf(jars);
  }

  private static void collectLocalMavenPomClasspath(Path pom, LinkedHashSet<Path> jars, Set<String> seen,
      List<String> warnings, int depth) {
    if (depth > 64 || !Files.isRegularFile(pom)) {
      return;
    }
    for (MavenDependency dependency : readProjectDependencies(pom, warnings)) {
      String key = dependency.groupId() + ":" + dependency.artifactId() + ":" + dependency.version();
      if (!seen.add(key)) {
        continue;
      }
      String baseName = dependency.artifactId() + "-" + dependency.version();
      for (Path repository : mavenLocalRepositories()) {
        Path artifactDir = repository
            .resolve(dependency.groupId().replace('.', '/'))
            .resolve(dependency.artifactId())
            .resolve(dependency.version());
        Path jar = artifactDir.resolve(baseName + ".jar");
        if (!dependency.type().equals("pom") && Files.isRegularFile(jar)) {
          jars.add(jar.toAbsolutePath().normalize());
        }
        Path dependencyPom = artifactDir.resolve(baseName + ".pom");
        collectLocalMavenPomClasspath(dependencyPom, jars, seen, warnings, depth + 1);
      }
    }
  }

  private static List<MavenDependency> readProjectDependencies(Path pom, List<String> warnings) {
    try {
      Document document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(pom.toFile());
      document.getDocumentElement().normalize();
      Map<String, String> properties = readProperties(document);
      addProjectProperties(document.getDocumentElement(), properties);

      List<MavenDependency> dependencies = new ArrayList<>();
      NodeList nodes = document.getElementsByTagName("dependency");
      for (int i = 0; i < nodes.getLength(); i += 1) {
        Element dependency = (Element) nodes.item(i);
        if (!isRuntimeDependencyElement(dependency)) {
          continue;
        }
        String scope = resolvedChildText(dependency, "scope", properties, pom, warnings).orElse("compile");
        if (scope.equals("import") || scope.equals("system")) {
          continue;
        }
        String groupId = resolvedChildText(dependency, "groupId", properties, pom, warnings).orElse("");
        String artifactId = resolvedChildText(dependency, "artifactId", properties, pom, warnings).orElse("");
        String version = resolvedChildText(dependency, "version", properties, pom, warnings).orElse("");
        String type = resolvedChildText(dependency, "type", properties, pom, warnings).orElse("jar");
        if (groupId.isBlank() || artifactId.isBlank() || version.isBlank()) {
          continue;
        }
        dependencies.add(new MavenDependency(groupId, artifactId, version, type));
      }
      return dependencies;
    } catch (Exception error) {
      warnings.add("Could not read Maven dependency metadata from " + pom + ": " + error.getMessage());
      return List.of();
    }
  }

  private static boolean hasDeclaredProjectDependencies(Path pom, List<String> warnings) {
    try {
      Document document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(pom.toFile());
      document.getDocumentElement().normalize();
      NodeList nodes = document.getElementsByTagName("dependency");
      for (int i = 0; i < nodes.getLength(); i += 1) {
        Element dependency = (Element) nodes.item(i);
        if (!isRuntimeDependencyElement(dependency)) {
          continue;
        }
        String scope = firstChildText(dependency, "scope").orElse("compile");
        if (scope.equals("import") || scope.equals("system")) {
          continue;
        }
        String groupId = firstChildText(dependency, "groupId").orElse("");
        String artifactId = firstChildText(dependency, "artifactId").orElse("");
        if (!groupId.isBlank() && !artifactId.isBlank()) {
          return true;
        }
      }
    } catch (Exception error) {
      warnings.add("Could not inspect Maven dependency declarations from " + pom + ": " + error.getMessage());
    }
    return false;
  }

  private static void addProjectProperties(Element project, Map<String, String> properties) {
    firstDirectChildText(project, "groupId").ifPresent(value -> {
      properties.put("project.groupId", value);
      properties.put("pom.groupId", value);
    });
    firstDirectChildText(project, "artifactId").ifPresent(value -> {
      properties.put("project.artifactId", value);
      properties.put("pom.artifactId", value);
    });
    firstDirectChildText(project, "version").ifPresent(value -> {
      properties.put("project.version", value);
      properties.put("pom.version", value);
    });
  }

  private static boolean isRuntimeDependencyElement(Element dependency) {
    Node parent = dependency.getParentNode();
    if (!(parent instanceof Element dependencies) || !dependencies.getTagName().equals("dependencies")) {
      return false;
    }
    Node owner = dependencies.getParentNode();
    if (!(owner instanceof Element ownerElement)) {
      return false;
    }
    String ownerTag = ownerElement.getTagName();
    return ownerTag.equals("project") || ownerTag.equals("profile");
  }

  private static Optional<String> firstDirectChildText(Element element, String tag) {
    NodeList children = element.getChildNodes();
    for (int i = 0; i < children.getLength(); i += 1) {
      if (children.item(i) instanceof Element child && child.getTagName().equals(tag)) {
        return Optional.ofNullable(child.getTextContent()).map(String::trim).filter(value -> !value.isEmpty());
      }
    }
    return Optional.empty();
  }

  private static List<Path> mavenLocalRepositories() {
    LinkedHashSet<Path> repositories = new LinkedHashSet<>();
    String configuredRepository = System.getProperty("maven.repo.local", "");
    if (!configuredRepository.isBlank()) repositories.add(Path.of(configuredRepository).toAbsolutePath().normalize());
    addMavenRepositoryCandidates(repositories, System.getProperty("user.home", ""));
    addMavenRepositoryCandidates(repositories, System.getenv("USERPROFILE"));
    addMavenRepositoryCandidates(repositories, System.getenv("MAVEN_USER_HOME"));
    return List.copyOf(repositories);
  }

  private static void addMavenRepositoryCandidates(LinkedHashSet<Path> repositories, String home) {
    if (home == null || home.isBlank()) {
      return;
    }
    Path homePath = Path.of(home).toAbsolutePath().normalize();
    Path settings = homePath.resolve(".m2").resolve("settings.xml");
    if (Files.isRegularFile(settings)) {
      try {
        Document document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(settings.toFile());
        Optional<String> localRepository = firstText(document, "localRepository");
        localRepository.ifPresent(value -> repositories.add(Path.of(value).toAbsolutePath().normalize()));
      } catch (Exception ignored) {
        // Fall back to Maven's default local repository below.
      }
    }
    repositories.add(homePath.resolve(".m2").resolve("repository"));
  }

  private static boolean isWindows() {
    return System.getProperty("os.name", "").toLowerCase(java.util.Locale.ROOT).contains("win");
  }

  private static final class CompilerSettings {
    String release;
    String source;
    String target;
    String encoding;
  }

  private record MavenRunResult(boolean started, boolean finished, int exitCode, String output) {
  }

  private record MavenDependency(String groupId, String artifactId, String version, String type) {
  }
}
