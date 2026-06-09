package io.mdeditor.semanticjava;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.TypeDeclaration;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeSet;

final class LocalTypeIndex {
  private final Map<String, Path> byQualifiedName = new HashMap<>();
  private final Map<String, TreeSet<String>> qualifiedNamesBySimpleName = new HashMap<>();
  private final Map<Path, String> primaryTypeByFile = new HashMap<>();
  private final Map<Path, String> packageByFile = new HashMap<>();
  private final Map<Path, String> kindByFile = new HashMap<>();

  static LocalTypeIndex build(JavaParser parser, List<Path> files) throws IOException {
    LocalTypeIndex index = new LocalTypeIndex();
    for (Path file : files) {
      ParseResult<CompilationUnit> result = parser.parse(file);
      if (result.getResult().isEmpty()) continue;
      CompilationUnit unit = result.getResult().get();
      String packageName = unit.getPackageDeclaration().map(pd -> pd.getNameAsString()).orElse("");
      index.packageByFile.put(file, packageName);

      List<TypeDeclaration<?>> types = new ArrayList<>();
      unit.findAll(TypeDeclaration.class).forEach(type -> types.add((TypeDeclaration<?>) type));
      Optional<TypeDeclaration<?>> primary = types.stream()
          .filter(type -> type.getParentNode().map(parent -> parent instanceof CompilationUnit).orElse(false))
          .findFirst();

      for (TypeDeclaration<?> type : types) {
        String qualifiedName = qualifiedName(packageName, type);
        index.byQualifiedName.put(qualifiedName, file);
        index.qualifiedNamesBySimpleName
            .computeIfAbsent(type.getNameAsString(), ignored -> new TreeSet<>())
            .add(qualifiedName);
        if (primary.isPresent() && primary.get() == type) {
          index.primaryTypeByFile.put(file, qualifiedName);
          index.kindByFile.put(file, typeKind(type));
        }
      }
    }
    return index;
  }

  Path fileForQualifiedName(String qualifiedName) {
    return byQualifiedName.get(qualifiedName);
  }

  boolean hasQualifiedName(String qualifiedName) {
    return byQualifiedName.containsKey(qualifiedName);
  }

  Optional<String> onlyQualifiedNameForSimpleName(String simpleName) {
    TreeSet<String> qualifiedNames = qualifiedNamesBySimpleName.get(simpleName);
    if (qualifiedNames == null || qualifiedNames.size() != 1) return Optional.empty();
    return Optional.of(qualifiedNames.first());
  }

  String packageName(Path file) {
    return packageByFile.getOrDefault(file, "");
  }

  String entityId(Path file) {
    return primaryTypeByFile.getOrDefault(file, stripJavaExtension(file.getFileName().toString()));
  }

  String entityType(Path file) {
    return "java_" + kindByFile.getOrDefault(file, "class");
  }

  private static String qualifiedName(String packageName, TypeDeclaration<?> type) {
    StringBuilder name = new StringBuilder(type.getNameAsString());
    Optional<TypeDeclaration<?>> parentType = type.findAncestor(TypeDeclaration.class).map(parent -> (TypeDeclaration<?>) parent);
    while (parentType.isPresent()) {
      name.insert(0, parentType.get().getNameAsString() + ".");
      parentType = parentType.get().findAncestor(TypeDeclaration.class).map(parent -> (TypeDeclaration<?>) parent);
    }
    return packageName.isBlank() ? name.toString() : packageName + "." + name;
  }

  private static String typeKind(TypeDeclaration<?> type) {
    if (type.isClassOrInterfaceDeclaration()) {
      return type.asClassOrInterfaceDeclaration().isInterface() ? "interface" : "class";
    }
    if (type.isEnumDeclaration()) return "enum";
    if (type.isRecordDeclaration()) return "record";
    if (type.isAnnotationDeclaration()) return "annotation";
    return "class";
  }

  private static String stripJavaExtension(String fileName) {
    return fileName.endsWith(".java") ? fileName.substring(0, fileName.length() - 5) : fileName;
  }
}
