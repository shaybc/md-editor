package com.mdeditor.javaconverter;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.jar.Attributes;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * Resolves dependencies between external JARs already present on a module classpath.
 */
final class JarDependencyResolver {
  private static final Pattern INTERNAL_CLASS_NAME =
      Pattern.compile("(?<![A-Za-z0-9_$])(?:[A-Za-z_$][A-Za-z0-9_$]*/)+[A-Za-z_$][A-Za-z0-9_$]*");

  private JarDependencyResolver() {
  }

  /**
   * Enriches indexed JARs with coordinates, dependency paths, and resolution provenance.
   */
  static List<ExternalJarModel> resolve(List<ExternalJarModel> indexedJars, List<String> warnings) {
    Map<Path, JarMetadata> metadataByPath = new LinkedHashMap<>();
    for (ExternalJarModel jar : indexedJars) {
      metadataByPath.put(jar.path(), readMetadata(jar.path(), warnings));
    }

    Map<String, Path> jarsByCoordinate = new HashMap<>();
    Map<String, Path> jarsByVersionlessCoordinate = new HashMap<>();
    metadataByPath.forEach((path, metadata) -> {
      if (metadata.coordinate() == null) return;
      jarsByCoordinate.put(metadata.coordinate().key(), path);
      jarsByVersionlessCoordinate.put(metadata.coordinate().versionlessKey(), path);
    });

    Map<String, Set<Path>> providersByClass = new HashMap<>();
    indexedJars.forEach((jar) -> jar.availableClasses().forEach(className ->
        providersByClass.computeIfAbsent(className, key -> new LinkedHashSet<>()).add(jar.path())));
    Set<Path> classpathJars = new LinkedHashSet<>(metadataByPath.keySet());

    List<ExternalJarModel> resolved = new ArrayList<>();
    for (ExternalJarModel jar : indexedJars) {
      JarMetadata metadata = metadataByPath.get(jar.path());
      LinkedHashSet<Path> dependencyPaths = new LinkedHashSet<>();
      String resolutionSource = metadata.source();
      boolean fallback = false;

      if (metadata.hasStructuredMetadata()) {
        metadata.mavenDependencies().forEach(dependency -> {
          Path provider = jarsByCoordinate.get(dependency.coordinate().key());
          if (provider == null) provider = jarsByVersionlessCoordinate.get(dependency.coordinate().versionlessKey());
          if (provider != null && !provider.equals(jar.path())) dependencyPaths.add(provider);
        });
      } else if (!metadata.manifestDependencies().isEmpty()) {
        metadata.manifestDependencies().stream()
            .filter(classpathJars::contains)
            .filter(path -> !path.equals(jar.path()))
            .forEach(dependencyPaths::add);
        resolutionSource = "manifest-class-path";
      }

      int declaredDependencyCount = dependencyPaths.size();
      dependencyPaths.addAll(resolveReferencedClassProviders(jar.path(), providersByClass, warnings));
      dependencyPaths.remove(jar.path());
      if (declaredDependencyCount == 0 && !dependencyPaths.isEmpty()) {
        resolutionSource = "bytecode-class-reference";
      }
      if (dependencyPaths.isEmpty()
          && !metadata.hasStructuredMetadata()
          && metadata.manifestDependencies().isEmpty()) {
        dependencyPaths.addAll(resolveFolderFallback(jar.path(), classpathJars));
        dependencyPaths.remove(jar.path());
        resolutionSource = "classpath-folder-fallback";
        fallback = true;
      }

      resolved.add(new ExternalJarModel(
          jar.path(),
          jar.packageClasses(),
          metadata.coordinate(),
          dependencyPaths.stream().sorted().toList(),
          resolutionSource,
          fallback
      ));
    }
    return resolved.stream().sorted(Comparator.comparing(model -> model.path().toString())).toList();
  }

  private static JarMetadata readMetadata(Path jarPath, List<String> warnings) {
    MavenArtifactCoordinate coordinate = null;
    List<MavenDependency> dependencies = List.of();
    List<Path> manifestDependencies = List.of();
    boolean structured = false;
    String source = "unresolved";

    try (JarFile jar = new JarFile(jarPath.toFile(), false)) {
      JarEntry propertiesEntry = jar.stream()
          .filter(entry -> entry.getName().startsWith("META-INF/maven/"))
          .filter(entry -> entry.getName().endsWith("/pom.properties"))
          .findFirst()
          .orElse(null);
      if (propertiesEntry != null) {
        Properties properties = new Properties();
        try (InputStream input = jar.getInputStream(propertiesEntry)) {
          properties.load(input);
        }
        coordinate = coordinate(
            properties.getProperty("groupId"),
            properties.getProperty("artifactId"),
            properties.getProperty("version")
        );
      }

      JarEntry pomEntry = jar.stream()
          .filter(entry -> entry.getName().startsWith("META-INF/maven/"))
          .filter(entry -> entry.getName().endsWith("/pom.xml"))
          .findFirst()
          .orElse(null);
      if (pomEntry != null) {
        try (InputStream input = jar.getInputStream(pomEntry)) {
          MavenPom pom = readPom(input);
          if (coordinate == null) coordinate = pom.coordinate();
          dependencies = pom.dependencies();
          structured = true;
          source = "embedded-maven-pom";
        }
      }

      if (jar.getManifest() != null) {
        String classPath = jar.getManifest().getMainAttributes().getValue(Attributes.Name.CLASS_PATH);
        if (classPath != null && !classPath.isBlank()) {
          Path parent = jarPath.getParent();
          manifestDependencies = Pattern.compile("\\s+").splitAsStream(classPath.trim())
              .map(parent::resolve)
              .map(path -> path.toAbsolutePath().normalize())
              .toList();
        }
      }
    } catch (Exception error) {
      warnings.add("Could not inspect JAR dependency metadata: " + jarPath + " (" + error.getMessage() + ")");
    }

    if (!structured) {
      Path pomPath = findCompanionPom(jarPath, coordinate);
      if (pomPath != null) {
        try (InputStream input = Files.newInputStream(pomPath)) {
          MavenPom pom = readPom(input);
          if (coordinate == null) coordinate = pom.coordinate();
          dependencies = pom.dependencies();
          structured = true;
          source = pomPath.getParent().equals(jarPath.getParent())
              ? "companion-maven-pom"
              : "local-maven-repository-pom";
        } catch (Exception error) {
          warnings.add("Could not read JAR companion POM: " + pomPath + " (" + error.getMessage() + ")");
        }
      }
    }

    return new JarMetadata(coordinate, dependencies, manifestDependencies, structured, source);
  }

  private static Path findCompanionPom(Path jarPath, MavenArtifactCoordinate coordinate) {
    String fileName = jarPath.getFileName().toString().replaceFirst("\\.jar$", ".pom");
    Path besideJar = jarPath.resolveSibling(fileName);
    if (Files.isRegularFile(besideJar)) return besideJar;
    if (coordinate == null) return null;
    for (Path repository : localMavenRepositories()) {
      Path artifactFolder = repository.resolve(coordinate.groupId().replace('.', '/'))
          .resolve(coordinate.artifactId())
          .resolve(coordinate.version());
      Path pom = artifactFolder.resolve(coordinate.artifactId() + "-" + coordinate.version() + ".pom");
      if (Files.isRegularFile(pom)) return pom;
    }
    return null;
  }

  private static List<Path> localMavenRepositories() {
    LinkedHashSet<Path> repositories = new LinkedHashSet<>();
    String explicit = System.getProperty("maven.repo.local", "");
    if (!explicit.isBlank()) repositories.add(Path.of(explicit).toAbsolutePath().normalize());
    String userHome = System.getProperty("user.home", "");
    if (!userHome.isBlank()) repositories.add(Path.of(userHome, ".m2", "repository").toAbsolutePath().normalize());
    return List.copyOf(repositories);
  }

  private static MavenPom readPom(InputStream input) throws Exception {
    var factory = DocumentBuilderFactory.newInstance();
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    var document = factory.newDocumentBuilder().parse(input);
    Element project = document.getDocumentElement();
    MavenArtifactCoordinate projectCoordinate = coordinate(
        directChildText(project, "groupId"),
        directChildText(project, "artifactId"),
        directChildText(project, "version")
    );
    List<MavenDependency> dependencies = new ArrayList<>();
    NodeList dependencyNodes = project.getElementsByTagName("dependency");
    for (int index = 0; index < dependencyNodes.getLength(); index += 1) {
      if (!(dependencyNodes.item(index) instanceof Element dependency)) continue;
      String scope = directChildText(dependency, "scope");
      String optional = directChildText(dependency, "optional");
      String type = directChildText(dependency, "type");
      if ("test".equals(scope) || "true".equalsIgnoreCase(optional)
          || (!type.isBlank() && !"jar".equals(type))) {
        continue;
      }
      MavenArtifactCoordinate dependencyCoordinate = coordinate(
          directChildText(dependency, "groupId"),
          directChildText(dependency, "artifactId"),
          directChildText(dependency, "version")
      );
      if (dependencyCoordinate != null) dependencies.add(new MavenDependency(dependencyCoordinate));
    }
    return new MavenPom(projectCoordinate, List.copyOf(dependencies));
  }

  private static String directChildText(Element parent, String name) {
    NodeList children = parent.getChildNodes();
    for (int index = 0; index < children.getLength(); index += 1) {
      Node child = children.item(index);
      if (child instanceof Element element && element.getTagName().equals(name)) {
        return element.getTextContent().trim();
      }
    }
    return "";
  }

  private static MavenArtifactCoordinate coordinate(String groupId, String artifactId, String version) {
    if (groupId == null || artifactId == null || version == null
        || groupId.isBlank() || artifactId.isBlank() || version.isBlank()
        || version.contains("${")) {
      return null;
    }
    return new MavenArtifactCoordinate(groupId.trim(), artifactId.trim(), version.trim());
  }

  private static Set<Path> resolveReferencedClassProviders(
      Path jarPath,
      Map<String, Set<Path>> providersByClass,
      List<String> warnings
  ) {
    LinkedHashSet<Path> dependencies = new LinkedHashSet<>();
    try (JarFile jar = new JarFile(jarPath.toFile(), false)) {
      Enumeration<JarEntry> entries = jar.entries();
      while (entries.hasMoreElements()) {
        JarEntry entry = entries.nextElement();
        if (entry.isDirectory() || !entry.getName().endsWith(".class")) continue;
        try (InputStream input = jar.getInputStream(entry)) {
          ByteArrayOutputStream output = new ByteArrayOutputStream();
          input.transferTo(output);
          String constants = output.toString(StandardCharsets.ISO_8859_1);
          Matcher matcher = INTERNAL_CLASS_NAME.matcher(constants);
          while (matcher.find()) {
            String className = matcher.group().replace('/', '.').replace('$', '.');
            dependencies.addAll(providersByClass.getOrDefault(className, Set.of()));
          }
        }
      }
    } catch (IOException error) {
      warnings.add("Could not inspect JAR class references: " + jarPath + " (" + error.getMessage() + ")");
    }
    return dependencies;
  }

  private static Set<Path> resolveFolderFallback(Path jarPath, Set<Path> classpathJars) {
    Path fallbackRoot = nearestLibFolder(jarPath);
    LinkedHashSet<Path> result = new LinkedHashSet<>();
    classpathJars.stream()
        .filter(candidate -> fallbackRoot == null
            ? candidate.getParent().equals(jarPath.getParent())
            : candidate.startsWith(fallbackRoot))
        .sorted()
        .forEach(result::add);
    return result;
  }

  private static Path nearestLibFolder(Path jarPath) {
    Path current = jarPath.getParent();
    while (current != null) {
      Path name = current.getFileName();
      if (name != null && name.toString().equalsIgnoreCase("lib")) return current;
      current = current.getParent();
    }
    return null;
  }

  private record MavenDependency(MavenArtifactCoordinate coordinate) {
  }

  private record MavenPom(MavenArtifactCoordinate coordinate, List<MavenDependency> dependencies) {
  }

  private record JarMetadata(
      MavenArtifactCoordinate coordinate,
      List<MavenDependency> mavenDependencies,
      List<Path> manifestDependencies,
      boolean hasStructuredMetadata,
      String source
  ) {
  }
}
