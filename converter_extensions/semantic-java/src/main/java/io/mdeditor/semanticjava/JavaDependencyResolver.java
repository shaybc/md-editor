package io.mdeditor.semanticjava;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.ClassExpr;
import com.github.javaparser.ast.expr.ObjectCreationExpr;
import com.github.javaparser.ast.ImportDeclaration;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.ReferenceType;
import com.github.javaparser.resolution.declarations.ResolvedReferenceTypeDeclaration;
import com.github.javaparser.resolution.types.ResolvedReferenceType;
import com.github.javaparser.resolution.types.ResolvedType;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

final class JavaDependencyResolver {
  private final LocalTypeIndex index;
  private final UnresolvedTypeReport unresolvedReport;
  private ImportContext importContext = ImportContext.empty();

  JavaDependencyResolver(LocalTypeIndex index, UnresolvedTypeReport unresolvedReport) {
    this.index = index;
    this.unresolvedReport = unresolvedReport;
  }

  Set<Path> resolveDependencies(CompilationUnit unit, Path currentFile) {
    Set<Path> dependencies = new LinkedHashSet<>();
    importContext = ImportContext.from(unit);

    for (Node node : unit.findAll(Node.class)) {
      resolveNode(node).ifPresent(qualifiedName -> {
        Path dependency = index.fileForQualifiedName(qualifiedName);
        if (dependency != null && !dependency.equals(currentFile)) {
          dependencies.add(dependency);
        }
      });
    }

    return dependencies;
  }

  private Optional<String> resolveNode(Node node) {
    try {
      if (node instanceof ClassOrInterfaceType type) {
        return resolveType(type.resolve());
      }
      if (node instanceof ObjectCreationExpr expression) {
        return resolveType(expression.calculateResolvedType());
      }
      if (node instanceof ClassExpr expression) {
        return resolveType(expression.getType().resolve());
      }
      if (node instanceof AnnotationExpr expression) {
        return Optional.of(expression.resolve().getQualifiedName());
      }
      if (node instanceof ReferenceType type) {
        return resolveType(type.resolve());
      }
    } catch (RuntimeException error) {
      String unresolvedName = unresolvedName(node);
      if (looksLikeTypeName(unresolvedName)) {
        unresolvedReport.add(importContext.qualify(unresolvedName));
      }
    }
    return Optional.empty();
  }

  private Optional<String> resolveType(ResolvedType type) {
    if (type.isArray()) return resolveType(type.asArrayType().getComponentType());
    if (type.isReferenceType()) return resolveType(type.asReferenceType());
    return Optional.empty();
  }

  private Optional<String> resolveType(ResolvedReferenceType type) {
    Optional<ResolvedReferenceTypeDeclaration> declaration = type.getTypeDeclaration();
    if (declaration.isEmpty()) return Optional.empty();
    return Optional.of(declaration.get().getQualifiedName());
  }

  private static String unresolvedName(Node node) {
    if (node instanceof ClassOrInterfaceType type) {
      if (isScopeOfParentType(type)) return "";
      return type.getNameWithScope();
    }
    if (node instanceof ObjectCreationExpr expression) return expression.getType().getNameWithScope();
    if (node instanceof ClassExpr expression) return expression.getType().asString();
    if (node instanceof AnnotationExpr expression) return expression.getNameAsString();
    if (node instanceof ReferenceType type) return type.asString();
    return "";
  }

  private static boolean isScopeOfParentType(ClassOrInterfaceType type) {
    return type.getParentNode()
        .filter(parent -> parent instanceof ClassOrInterfaceType parentType
            && parentType.getScope().map(scope -> scope == type).orElse(false))
        .isPresent();
  }

  private static boolean looksLikeTypeName(String typeName) {
    String normalized = typeName == null ? "" : typeName.trim();
    if (normalized.isBlank()) return false;
    int genericStart = normalized.indexOf('<');
    if (genericStart >= 0) normalized = normalized.substring(0, genericStart).trim();
    while (normalized.endsWith("[]")) normalized = normalized.substring(0, normalized.length() - 2).trim();
    int separator = normalized.lastIndexOf('.');
    String simpleName = separator >= 0 ? normalized.substring(separator + 1) : normalized;
    return !simpleName.isBlank() && Character.isUpperCase(simpleName.charAt(0));
  }

  private record ImportContext(
      String packageName,
      Map<String, String> explicitImports,
      List<String> wildcardImports
  ) {
    static ImportContext empty() {
      return new ImportContext("", Map.of(), List.of());
    }

    static ImportContext from(CompilationUnit unit) {
      Map<String, String> explicitImports = new HashMap<>();
      List<String> wildcardImports = new ArrayList<>();
      for (ImportDeclaration importDeclaration : unit.getImports()) {
        String importName = importDeclaration.getNameAsString();
        if (importDeclaration.isAsterisk()) {
          wildcardImports.add(importName);
        } else {
          int separator = importName.lastIndexOf('.');
          String simpleName = separator >= 0 ? importName.substring(separator + 1) : importName;
          explicitImports.put(simpleName, importName);
        }
      }
      String packageName = unit.getPackageDeclaration()
          .map(declaration -> declaration.getNameAsString())
          .orElse("");
      return new ImportContext(packageName, explicitImports, wildcardImports);
    }

    String qualify(String rawName) {
      String normalized = rawName == null ? "" : rawName.trim();
      if (normalized.isBlank() || normalized.contains(".")) return normalized;

      String explicitImport = explicitImports.get(normalized);
      if (explicitImport != null) return explicitImport;
      if (!packageName.isBlank()) return packageName + "." + normalized;
      if (wildcardImports.size() == 1) return wildcardImports.get(0) + "." + normalized;
      return normalized;
    }
  }
}
