package com.mdeditor.javaconverter;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.jar.JarFile;
import java.util.stream.Stream;

final class ProjectScanner {
  private static final Set<String> IGNORED_DIRS = Set.of(
      ".git", ".hg", ".svn", "target", "build", "out", ".idea", ".gradle", "node_modules"
  );

  private ProjectScanner() {
  }

  static ProjectModel scan(Path root) throws IOException {
    List<String> warnings = new ArrayList<>();
    List<Path> poms = findPomFiles(root);
    LinkedHashSet<Path> sourceRoots = new LinkedHashSet<>();
    LinkedHashSet<Path> classpath = new LinkedHashSet<>();
    CompilerSettings settings = new CompilerSettings();

    if (poms.isEmpty()) {
      sourceRoots.add(root);
    } else {
      for (Path pom : poms) {
        Path moduleRoot = pom.getParent();
        Path mainSource = moduleRoot.resolve("src/main/java");
        if (Files.isDirectory(mainSource)) {
          sourceRoots.add(mainSource.toAbsolutePath().normalize());
        }
        readCompilerSettings(pom, settings, warnings);
        classpath.addAll(runMavenClasspath(pom, warnings));
        Path classes = moduleRoot.resolve("target/classes");
        if (Files.isDirectory(classes)) {
          classpath.add(classes.toAbsolutePath().normalize());
        }
      }
    }

    if (sourceRoots.isEmpty()) {
      sourceRoots.add(root);
    }
    List<Path> sourceFiles = findJavaFiles(root);
    sourceRoots.addAll(inferSourceRoots(sourceFiles));
    classpath.addAll(findLocalClasspathEntries(root, warnings));

    return new ProjectModel(
        root,
        List.copyOf(sourceRoots),
        sourceFiles,
        List.copyOf(classpath),
        settings.release,
        settings.source,
        settings.target,
        settings.encoding == null ? StandardCharsets.UTF_8.name() : settings.encoding,
        poms.size(),
        List.copyOf(warnings)
    );
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
    Path relative = root.toAbsolutePath().normalize().relativize(path.toAbsolutePath().normalize());
    for (Path segment : relative) {
      if (IGNORED_DIRS.contains(segment.toString())) {
        return true;
      }
    }
    return false;
  }

  private static void readCompilerSettings(Path pom, CompilerSettings settings, List<String> warnings) {
    try {
      Document document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(pom.toFile());
      document.getDocumentElement().normalize();
      settings.release = firstText(document, "maven.compiler.release").orElse(settings.release);
      settings.source = firstText(document, "maven.compiler.source").orElse(settings.source);
      settings.target = firstText(document, "maven.compiler.target").orElse(settings.target);
      settings.encoding = firstText(document, "project.build.sourceEncoding").orElse(settings.encoding);

      NodeList plugins = document.getElementsByTagName("plugin");
      for (int i = 0; i < plugins.getLength(); i += 1) {
        Element plugin = (Element) plugins.item(i);
        String artifactId = firstChildText(plugin, "artifactId").orElse("");
        if (!artifactId.equals("maven-compiler-plugin")) {
          continue;
        }
        settings.release = firstChildText(plugin, "release").orElse(settings.release);
        settings.source = firstChildText(plugin, "source").orElse(settings.source);
        settings.target = firstChildText(plugin, "target").orElse(settings.target);
        settings.encoding = firstChildText(plugin, "encoding").orElse(settings.encoding);
      }
    } catch (Exception error) {
      warnings.add("Could not read compiler settings from " + pom + ": " + error.getMessage());
    }
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

  private static List<Path> runMavenClasspath(Path pom, List<String> warnings) {
    try {
      Path output = Files.createTempFile("java-converter-classpath", ".txt");
      List<String> command = List.of(
          "mvn",
          "-q",
          "-f",
          pom.toString(),
          "dependency:build-classpath",
          "-Dmdep.outputFile=" + output
      );
      Process process = new ProcessBuilder(command)
          .redirectErrorStream(true)
          .start();
      boolean finished = process.waitFor(Duration.ofSeconds(60).toMillis(), TimeUnit.MILLISECONDS);
      if (!finished) {
        process.destroyForcibly();
        warnings.add("Timed out while asking Maven for classpath: " + pom);
        return List.of();
      }
      if (process.exitValue() != 0 || !Files.isRegularFile(output)) {
        warnings.add("Maven classpath extraction failed for: " + pom);
        return List.of();
      }
      String text = Files.readString(output, StandardCharsets.UTF_8).trim();
      if (text.isEmpty()) {
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
    } catch (Exception error) {
      warnings.add("Could not run Maven classpath extraction for " + pom + ": " + error.getMessage());
      return List.of();
    }
  }

  private static final class CompilerSettings {
    String release;
    String source;
    String target;
    String encoding;
  }
}
