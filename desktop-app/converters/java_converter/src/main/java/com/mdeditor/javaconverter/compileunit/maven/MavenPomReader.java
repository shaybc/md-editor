package com.mdeditor.javaconverter.compileunit.maven;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class MavenPomReader {
  private MavenPomReader() {
  }

  static MavenModuleDescriptor read(Path pom, String fallbackRelease, String fallbackSource, String fallbackTarget,
      String fallbackEncoding) {
    List<String> warnings = new ArrayList<>();
    Path moduleRoot = pom.toAbsolutePath().normalize().getParent();
    try {
      Document document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(pom.toFile());
      document.getDocumentElement().normalize();
      Element project = document.getDocumentElement();
      Map<String, String> properties = readProperties(document);

      String groupId = firstDirectChildText(project, "groupId")
          .or(() -> firstNestedText(project, "parent", "groupId"))
          .orElse("");
      String artifactId = firstDirectChildText(project, "artifactId").orElse("");
      String version = firstDirectChildText(project, "version")
          .or(() -> firstNestedText(project, "parent", "version"))
          .orElse("");
      addProjectProperties(properties, groupId, artifactId, version);

      return new MavenModuleDescriptor(
          pom.toAbsolutePath().normalize(),
          moduleRoot,
          resolveProperties(groupId, properties, pom, warnings),
          resolveProperties(artifactId, properties, pom, warnings),
          resolveProperties(version, properties, pom, warnings),
          readModules(document, properties, pom, warnings),
          readDependencies(document, properties, pom, warnings),
          readSingleBuildPath(document, "sourceDirectory", properties, pom, warnings)
              .map(moduleRoot::resolve).map(Path::normalize).orElse(moduleRoot.resolve("src/main/java").normalize()),
          readSingleBuildPath(document, "testSourceDirectory", properties, pom, warnings)
              .map(moduleRoot::resolve).map(Path::normalize).orElse(moduleRoot.resolve("src/test/java").normalize()),
          readResourceDirectories(document, "resources", properties, pom, warnings,
              moduleRoot.resolve("src/main/resources").normalize()),
          readResourceDirectories(document, "testResources", properties, pom, warnings,
              moduleRoot.resolve("src/test/resources").normalize()),
          compilerSetting(document, "release", "maven.compiler.release", properties, pom, warnings).orElse(fallbackRelease),
          compilerSetting(document, "source", "maven.compiler.source", properties, pom, warnings).orElse(fallbackSource),
          compilerSetting(document, "target", "maven.compiler.target", properties, pom, warnings).orElse(fallbackTarget),
          compilerSetting(document, "encoding", "project.build.sourceEncoding", properties, pom, warnings)
              .orElse(fallbackEncoding == null ? StandardCharsets.UTF_8.name() : fallbackEncoding),
          warnings
      );
    } catch (Exception error) {
      warnings.add("Could not read Maven compile unit metadata from " + pom + ": " + error.getMessage());
      return new MavenModuleDescriptor(
          pom.toAbsolutePath().normalize(),
          moduleRoot,
          "",
          "",
          "",
          List.of(),
          List.of(),
          moduleRoot.resolve("src/main/java").normalize(),
          moduleRoot.resolve("src/test/java").normalize(),
          List.of(moduleRoot.resolve("src/main/resources").normalize()),
          List.of(moduleRoot.resolve("src/test/resources").normalize()),
          fallbackRelease,
          fallbackSource,
          fallbackTarget,
          fallbackEncoding == null ? StandardCharsets.UTF_8.name() : fallbackEncoding,
          warnings
      );
    }
  }

  private static List<String> readModules(Document document, Map<String, String> properties, Path pom,
      List<String> warnings) {
    List<String> modules = new ArrayList<>();
    for (Element module : directChildren(firstElement(document, "modules").orElse(null), "module")) {
      String value = resolveProperties(module.getTextContent().trim(), properties, pom, warnings);
      if (!value.isBlank()) {
        modules.add(value);
      }
    }
    return modules.stream().sorted().toList();
  }

  private static List<MavenDependency> readDependencies(Document document, Map<String, String> properties, Path pom,
      List<String> warnings) {
    List<MavenDependency> dependencies = new ArrayList<>();
    NodeList nodes = document.getElementsByTagName("dependency");
    for (int i = 0; i < nodes.getLength(); i += 1) {
      Element dependency = (Element) nodes.item(i);
      if (!isProjectDependency(dependency)) {
        continue;
      }
      String groupId = resolvedChildText(dependency, "groupId", properties, pom, warnings).orElse("");
      String artifactId = resolvedChildText(dependency, "artifactId", properties, pom, warnings).orElse("");
      String version = resolvedChildText(dependency, "version", properties, pom, warnings).orElse("");
      String scope = resolvedChildText(dependency, "scope", properties, pom, warnings).orElse("compile");
      String type = resolvedChildText(dependency, "type", properties, pom, warnings).orElse("jar");
      String classifier = resolvedChildText(dependency, "classifier", properties, pom, warnings).orElse("");
      boolean optional = resolvedChildText(dependency, "optional", properties, pom, warnings)
          .map(Boolean::parseBoolean)
          .orElse(false);
      if (!groupId.isBlank() && !artifactId.isBlank()) {
        dependencies.add(new MavenDependency(groupId, artifactId, version, scope, type, classifier, optional));
      }
    }
    return dependencies;
  }

  private static Optional<Path> readSingleBuildPath(Document document, String tag, Map<String, String> properties,
      Path pom, List<String> warnings) {
    return firstText(document, tag)
        .map(value -> resolveProperties(value, properties, pom, warnings))
        .filter(value -> !value.isBlank())
        .map(Path::of);
  }

  private static List<Path> readResourceDirectories(Document document, String containerTag,
      Map<String, String> properties, Path pom, List<String> warnings, Path defaultDirectory) {
    Optional<Element> container = firstElement(document, containerTag);
    if (container.isEmpty()) {
      return List.of(defaultDirectory);
    }
    List<Path> directories = new ArrayList<>();
    for (Element resource : directChildren(container.get(), containerTag.equals("resources") ? "resource" : "testResource")) {
      Optional<String> directory = firstChildText(resource, "directory")
          .map(value -> resolveProperties(value, properties, pom, warnings))
          .filter(value -> !value.isBlank());
      directory.map(Path::of).map(path -> pom.getParent().resolve(path).normalize()).ifPresent(directories::add);
    }
    return directories.stream().distinct().sorted().toList();
  }

  private static Optional<String> compilerSetting(Document document, String pluginTag, String propertyTag,
      Map<String, String> properties, Path pom, List<String> warnings) {
    Optional<String> fromProperty = firstText(document, propertyTag)
        .map(value -> resolveProperties(value, properties, pom, warnings))
        .filter(value -> !value.isBlank());
    Optional<String> fromPlugin = compilerPlugin(document)
        .flatMap(plugin -> resolvedChildText(plugin, pluginTag, properties, pom, warnings))
        .filter(value -> !value.isBlank());
    return fromPlugin.or(() -> fromProperty);
  }

  private static Optional<Element> compilerPlugin(Document document) {
    NodeList plugins = document.getElementsByTagName("plugin");
    for (int i = 0; i < plugins.getLength(); i += 1) {
      Element plugin = (Element) plugins.item(i);
      if (firstChildText(plugin, "artifactId").orElse("").equals("maven-compiler-plugin")) {
        return Optional.of(plugin);
      }
    }
    return Optional.empty();
  }

  private static Map<String, String> readProperties(Document document) {
    Map<String, String> properties = new HashMap<>();
    Optional<Element> propertiesElement = firstElement(document, "properties");
    if (propertiesElement.isEmpty()) {
      return properties;
    }
    NodeList children = propertiesElement.get().getChildNodes();
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

  private static void addProjectProperties(Map<String, String> properties, String groupId, String artifactId,
      String version) {
    properties.put("project.groupId", groupId);
    properties.put("pom.groupId", groupId);
    properties.put("project.artifactId", artifactId);
    properties.put("pom.artifactId", artifactId);
    properties.put("project.version", version);
    properties.put("pom.version", version);
    properties.put("project.build.sourceEncoding", properties.getOrDefault("project.build.sourceEncoding", ""));
  }

  private static Optional<String> resolvedChildText(Element element, String tag, Map<String, String> properties,
      Path pom, List<String> warnings) {
    return firstChildText(element, tag).map(value -> resolveProperties(value, properties, pom, warnings));
  }

  private static String resolveProperties(String value, Map<String, String> properties, Path pom,
      List<String> warnings) {
    String resolved = value == null ? "" : value.trim();
    for (int pass = 0; pass < 8; pass += 1) {
      Matcher matcher = Pattern.compile("\\$\\{([^}]+)}|@([^@\\s]+)@").matcher(resolved);
      StringBuffer buffer = new StringBuffer();
      boolean changed = false;
      while (matcher.find()) {
        String propertyName = matcher.group(1) != null ? matcher.group(1) : matcher.group(2);
        String replacement = properties.get(propertyName);
        if (replacement == null || replacement.isBlank()) {
          warnings.add("Unresolved Maven property in compile unit metadata from " + pom + ": " + matcher.group(0));
          continue;
        }
        matcher.appendReplacement(buffer, Matcher.quoteReplacement(replacement));
        changed = true;
      }
      matcher.appendTail(buffer);
      resolved = buffer.toString();
      if (!changed) {
        break;
      }
    }
    if (Pattern.compile("\\$\\{[^}]+}|@[^@\\s]+@").matcher(resolved).find()) {
      warnings.add("Skipping unresolved Maven compile unit metadata from " + pom + ": " + value);
      return "";
    }
    return resolved.trim();
  }

  private static boolean isProjectDependency(Element dependency) {
    Node parent = dependency.getParentNode();
    if (!(parent instanceof Element dependencies) || !dependencies.getTagName().equals("dependencies")) {
      return false;
    }
    Node owner = dependencies.getParentNode();
    return owner instanceof Element ownerElement
        && (ownerElement.getTagName().equals("project") || ownerElement.getTagName().equals("profile"));
  }

  private static Optional<Element> firstElement(Document document, String tag) {
    NodeList nodes = document.getElementsByTagName(tag);
    if (nodes.getLength() == 0) {
      return Optional.empty();
    }
    return Optional.of((Element) nodes.item(0));
  }

  private static List<Element> directChildren(Element element, String tag) {
    if (element == null) {
      return List.of();
    }
    List<Element> result = new ArrayList<>();
    NodeList children = element.getChildNodes();
    for (int i = 0; i < children.getLength(); i += 1) {
      if (children.item(i) instanceof Element child && child.getTagName().equals(tag)) {
        result.add(child);
      }
    }
    return result;
  }

  private static Optional<String> firstText(Document document, String tag) {
    NodeList nodes = document.getElementsByTagName(tag);
    if (nodes.getLength() == 0) {
      return Optional.empty();
    }
    return Optional.ofNullable(nodes.item(0).getTextContent()).map(String::trim).filter(value -> !value.isEmpty());
  }

  private static Optional<String> firstNestedText(Element element, String containerTag, String childTag) {
    for (Element container : directChildren(element, containerTag)) {
      Optional<String> value = firstChildText(container, childTag);
      if (value.isPresent()) {
        return value;
      }
    }
    return Optional.empty();
  }

  private static Optional<String> firstDirectChildText(Element element, String tag) {
    return directChildren(element, tag).stream()
        .findFirst()
        .map(Node::getTextContent)
        .map(String::trim)
        .filter(value -> !value.isEmpty());
  }

  private static Optional<String> firstChildText(Element element, String tag) {
    NodeList nodes = element.getElementsByTagName(tag);
    if (nodes.getLength() == 0) {
      return Optional.empty();
    }
    return Optional.ofNullable(nodes.item(0).getTextContent()).map(String::trim).filter(value -> !value.isEmpty());
  }
}
