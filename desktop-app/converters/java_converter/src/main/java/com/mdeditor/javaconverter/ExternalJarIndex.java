package com.mdeditor.javaconverter;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

final class ExternalJarIndex {
  private final List<ExternalJarModel> jars;
  private final Map<String, List<ExternalJarModel>> classProviders;
  private final Set<String> packages;

  private ExternalJarIndex(List<ExternalJarModel> jars, Map<String, List<ExternalJarModel>> classProviders,
      Set<String> packages) {
    this.jars = jars;
    this.classProviders = classProviders;
    this.packages = packages;
  }

  static ExternalJarIndex empty() {
    return new ExternalJarIndex(List.of(), Map.of(), Set.of());
  }

  static ExternalJarIndex scan(List<Path> jarPaths, List<String> warnings) {
    List<ExternalJarModel> jars = new ArrayList<>();
    Map<String, List<ExternalJarModel>> providers = new HashMap<>();
    Set<String> packages = new LinkedHashSet<>();

    for (Path jarPath : jarPaths) {
      try {
        ExternalJarModel jar = readJar(jarPath);
        jars.add(jar);
        packages.addAll(jar.packageClasses().keySet());
        jar.availableClasses().forEach(className ->
            providers.computeIfAbsent(className, key -> new ArrayList<>()).add(jar));
      } catch (IOException error) {
        warnings.add("Could not index external jar: " + jarPath + " (" + error.getMessage() + ")");
      }
    }

    jars = new ArrayList<>(JarDependencyResolver.resolve(jars, warnings));
    jars.sort(Comparator.comparing(jar -> jar.path().toString()));
    providers.replaceAll((key, value) -> value.stream()
        .sorted(Comparator.comparing(jar -> jar.path().toString()))
        .toList());
    return new ExternalJarIndex(List.copyOf(jars), Map.copyOf(providers), Set.copyOf(packages));
  }

  List<ExternalJarModel> jars() {
    return jars;
  }

  List<ExternalJarModel> providersFor(String qualifiedClassName) {
    return classProviders.getOrDefault(qualifiedClassName, List.of());
  }

  boolean hasPackage(String packageName) {
    return packageName != null && packages.contains(packageName);
  }

  private static ExternalJarModel readJar(Path jarPath) throws IOException {
    Map<String, Set<String>> packageClasses = new LinkedHashMap<>();
    try (JarFile jar = new JarFile(jarPath.toFile(), false)) {
      var entries = jar.entries();
      while (entries.hasMoreElements()) {
        JarEntry entry = entries.nextElement();
        if (entry.isDirectory() || !entry.getName().endsWith(".class")) {
          continue;
        }
        String className = toQualifiedClassName(entry.getName());
        if (className.isBlank() || className.equals("module-info") || className.endsWith(".module-info")) {
          continue;
        }
        int lastDot = className.lastIndexOf('.');
        String packageName = lastDot < 0 ? "" : className.substring(0, lastDot);
        String simpleName = lastDot < 0 ? className : className.substring(lastDot + 1);
        packageClasses.computeIfAbsent(packageName, key -> new LinkedHashSet<>()).add(simpleName);
      }
    }
    Map<String, List<String>> sortedPackages = new LinkedHashMap<>();
    packageClasses.entrySet().stream()
        .sorted(Map.Entry.comparingByKey())
        .forEach(entry -> sortedPackages.put(entry.getKey(), entry.getValue().stream().sorted().toList()));
    return new ExternalJarModel(jarPath.toAbsolutePath().normalize(), Map.copyOf(sortedPackages));
  }

  private static String toQualifiedClassName(String entryName) {
    return entryName
        .replace('/', '.')
        .replace('\\', '.')
        .replace('$', '.')
        .replaceFirst("\\.class$", "");
  }
}
