package io.mdeditor.semanticjava;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.CallableDeclaration;
import com.github.javaparser.ast.body.ConstructorDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.stmt.ReturnStmt;
import com.github.javaparser.ast.stmt.ThrowStmt;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

final class MethodExtractor {
  private MethodExtractor() {
  }

  static List<MethodInfo> extract(CompilationUnit unit) {
    List<MethodInfo> methods = new ArrayList<>();
    for (TypeDeclaration<?> type : unit.findAll(TypeDeclaration.class)) {
      for (MethodDeclaration method : type.getMethods()) {
        methods.add(new MethodInfo(
            method.getNameAsString(),
            isAccessorName(method.getNameAsString()) ? "accessor" : "method",
            method.getDeclarationAsString(true, true, true),
            returnValues(method),
            exceptions(method)
        ));
      }
      for (ConstructorDeclaration constructor : type.getConstructors()) {
        methods.add(new MethodInfo(
            constructor.getNameAsString(),
            "method",
            constructor.getDeclarationAsString(true, true, true),
            List.of(),
            exceptions(constructor)
        ));
      }
    }
    return methods;
  }

  private static List<String> returnValues(CallableDeclaration<?> callable) {
    return callable.findAll(ReturnStmt.class).stream()
        .map(statement -> statement.getExpression().map(Object::toString).orElse(""))
        .filter(value -> !value.isBlank())
        .distinct()
        .toList();
  }

  private static List<String> exceptions(CallableDeclaration<?> callable) {
    Set<String> values = new LinkedHashSet<>();
    callable.getThrownExceptions().forEach(type -> values.add(type.toString()));
    callable.findAll(ThrowStmt.class).forEach(statement -> values.add(statement.getExpression().toString()));
    return List.copyOf(values);
  }

  private static boolean isAccessorName(String name) {
    return name.matches("^(get|set|is)[A-Z].*");
  }
}
