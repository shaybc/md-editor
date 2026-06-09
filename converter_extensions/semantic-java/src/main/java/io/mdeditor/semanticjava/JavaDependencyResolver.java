package io.mdeditor.semanticjava;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.ClassExpr;
import com.github.javaparser.ast.expr.ObjectCreationExpr;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.ReferenceType;
import com.github.javaparser.resolution.declarations.ResolvedReferenceTypeDeclaration;
import com.github.javaparser.resolution.types.ResolvedReferenceType;
import com.github.javaparser.resolution.types.ResolvedType;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;

final class JavaDependencyResolver {
  private final LocalTypeIndex index;
  private int unresolvedCount;

  JavaDependencyResolver(LocalTypeIndex index) {
    this.index = index;
  }

  Set<Path> resolveDependencies(CompilationUnit unit, Path currentFile) {
    Set<Path> dependencies = new LinkedHashSet<>();
    unresolvedCount = 0;

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

  int unresolvedCount() {
    return unresolvedCount;
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
      unresolvedCount += 1;
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
}
