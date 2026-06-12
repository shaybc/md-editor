package com.mdeditor.javaconverter;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import picocli.CommandLine;

import com.sun.source.util.JavacTask;

import javax.tools.JavaCompiler;
import javax.tools.ToolProvider;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JavaConverterIntegrationTest {
  @TempDir
  Path temp;

  @Test
  void resolvesCompilerBackedLocalDependenciesWithoutTextFalsePositives() throws Exception {
    Path project = temp.resolve("project");
    Path vault = temp.resolve("vault");
    createExternalJar(project);

    write(project, "src/app/Main.java", """
        package app;

        import app.unused.Unused;
        import app.wild.*;
        import external.ExternalType;
        import java.util.List;
        import static app.StaticUtil.name;

        @Marker
        public class Main extends Base implements Contract {
          private Same same;
          private UsedWildcard wildcard;
          private List<NestedHolder.Inner> nested;
          private ExternalType external;

          public Returned run(Param param) throws LocalException {
            String text = "CommentOnly";
            // CommentOnly should not be a dependency.
            name();
            return new Returned();
          }
        }
        """);
    write(project, "src/app/Same.java", "package app; public class Same {}\n");
    write(project, "src/app/CommentOnly.java", "package app; public class CommentOnly {}\n");
    write(project, "src/app/Base.java", "package app; public class Base {}\n");
    write(project, "src/app/Contract.java", "package app; public interface Contract {}\n");
    write(project, "src/app/Marker.java", "package app; public @interface Marker {}\n");
    write(project, "src/app/StaticUtil.java", "package app; public class StaticUtil { public static String name() { return \"\"; } }\n");
    write(project, "src/app/NestedHolder.java", "package app; public class NestedHolder { public static class Inner {} }\n");
    write(project, "src/app/Returned.java", "package app; public class Returned {}\n");
    write(project, "src/app/Param.java", "package app; public class Param {}\n");
    write(project, "src/app/LocalException.java", "package app; public class LocalException extends Exception {}\n");
    write(project, "src/app/wild/UsedWildcard.java", "package app.wild; public class UsedWildcard {}\n");
    write(project, "src/app/wild/UnusedWildcard.java", "package app.wild; public class UnusedWildcard {}\n");
    write(project, "src/app/unused/Unused.java", "package app.unused; public class Unused {}\n");

    int exitCode = new CommandLine(new Main()).execute(
        "--root", project.toString(),
        "--vault", vault.toString(),
        "--include-methods",
        "--include-signatures",
        "--include-return-codes",
        "--include-exceptions",
        "--include-package"
    );

    assertEquals(0, exitCode);
    String markdown = Files.readString(vault.resolve("src/app/Main.java.md"), StandardCharsets.UTF_8);
    assertDependency(markdown, "src/app/Same.java");
    assertDependency(markdown, "src/app/wild/UsedWildcard.java");
    assertDependency(markdown, "src/app/Base.java");
    assertDependency(markdown, "src/app/Contract.java");
    assertDependency(markdown, "src/app/Marker.java");
    assertDependency(markdown, "src/app/StaticUtil.java");
    assertDependency(markdown, "src/app/NestedHolder.java");
    assertDependency(markdown, "src/app/Returned.java");
    assertDependency(markdown, "src/app/Param.java");
    assertDependency(markdown, "src/app/LocalException.java");
    assertFalse(markdown.contains("(src/app/CommentOnly.java)"));
    assertFalse(markdown.contains("(src/app/wild/UnusedWildcard.java)"));
    assertFalse(markdown.contains("(src/app/unused/Unused.java)"));
    assertFalse(markdown.contains("ExternalType.java"));
    assertTrue(markdown.contains("## Package"));
    assertTrue(markdown.contains("Signature:"));
    assertTrue(Files.exists(vault.resolve("_java_converter_report.md")));
  }

  @Test
  void writesReportAndContinuesWhenCompilerAttributionFails() throws Exception {
    Path project = temp.resolve("partial-project");
    Path vault = temp.resolve("partial-vault");
    write(project, "src/app/Good.java", "package app; public class Good { Other other; }\n");
    write(project, "src/app/Other.java", "package app; public class Other {}\n");

    JavaDependencyAnalyzer analyzer = new JavaDependencyAnalyzer() {
      @Override
      protected void analyzeParsedTask(JavacTask task) {
        throw new IllegalStateException("simulated javac crash");
      }
    };

    int exitCode = Main.run(
        new String[]{"--root", project.toString(), "--vault", vault.toString()},
        analyzer
    );

    assertEquals(0, exitCode);
    assertTrue(Files.exists(vault.resolve("src/app/Good.java.md")));
    String report = Files.readString(vault.resolve("_java_converter_report.md"), StandardCharsets.UTF_8);
    assertTrue(report.contains("simulated javac crash"));
  }

  @Test
  void skipsInvalidJarsWhenBuildingFallbackClasspath() throws Exception {
    Path project = temp.resolve("invalid-jar-project");
    Path vault = temp.resolve("invalid-jar-vault");
    write(project, "src/app/Main.java", "package app; public class Main { Other other; }\n");
    write(project, "src/app/Other.java", "package app; public class Other {}\n");
    Path invalidJar = project.resolve("src/test/resources/empty.jar");
    Files.createDirectories(invalidJar.getParent());
    Files.write(invalidJar, new byte[0]);

    int exitCode = new CommandLine(new Main()).execute(
        "--root", project.toString(),
        "--vault", vault.toString()
    );

    assertEquals(0, exitCode);
    String markdown = Files.readString(vault.resolve("src/app/Main.java.md"), StandardCharsets.UTF_8);
    assertDependency(markdown, "src/app/Other.java");
    String report = Files.readString(vault.resolve("_java_converter_report.md"), StandardCharsets.UTF_8);
    assertTrue(report.contains("Skipped invalid jar on classpath"));
  }

  @Test
  void duplicateQualifiedSourceDoesNotBecomeSelfDependency() throws Exception {
    Path project = temp.resolve("duplicate-project");
    Path vault = temp.resolve("duplicate-vault");
    String main = "package app; public class Main { Helper helper; Main self; }\n";
    String helper = "package app; public class Helper {}\n";
    write(project, "src/app/Main.java", main);
    write(project, "src/app/Helper.java", helper);
    write(project, "duplicate/src/app/Main.java", main);
    write(project, "duplicate/src/app/Helper.java", helper);

    int exitCode = new CommandLine(new Main()).execute(
        "--root", project.toString(),
        "--vault", vault.toString()
    );

    assertEquals(0, exitCode);
    String markdown = Files.readString(vault.resolve("src/app/Main.java.md"), StandardCharsets.UTF_8);
    assertDependency(markdown, "src/app/Helper.java");
    assertFalse(markdown.contains("(duplicate/src/app/Main.java)"));
    assertFalse(markdown.contains("(src/app/Main.java)"));
  }

  @Test
  void fileWithCompilerErrorIsMarkedFailedNotSilentlyEmptied() throws Exception {
    Path project = temp.resolve("failed-project");
    Path vault = temp.resolve("failed-vault");
    write(project, "src/app/Main.java", "package app; public class Main { Helper helper; }\n");
    write(project, "src/app/Helper.java", "package app; public class Helper {}\n");

    // Force attribution to throw, exercising the per-file fallback + FAILED marking.
    JavaDependencyAnalyzer analyzer = new JavaDependencyAnalyzer() {
      @Override
      protected void analyzeParsedTask(JavacTask task) {
        throw new IllegalStateException("simulated attribution error");
      }
    };

    int exitCode = Main.run(
        new String[]{"--root", project.toString(), "--vault", vault.toString()},
        analyzer
    );

    assertEquals(0, exitCode);
    String markdown = Files.readString(vault.resolve("src/app/Main.java.md"), StandardCharsets.UTF_8);
    // A file whose analysis failed must be clearly marked, never a silent empty result.
    assertTrue(markdown.contains("analysis_status: failed"),
        "Failed file must carry analysis_status: failed\n" + markdown);
    String report = Files.readString(vault.resolve("_java_converter_report.md"), StandardCharsets.UTF_8);
    assertTrue(report.contains("simulated attribution error"), "Report should record the failure");
  }

  @Test
  void conflictingDuplicateWithDifferentContentIsAnalyzedNotExcluded() throws Exception {
    Path project = temp.resolve("conflict-project");
    Path vault = temp.resolve("conflict-vault");
    // Same FQN app.Main in two roots, but DIFFERENT content/dependencies.
    write(project, "a/app/Main.java", "package app; public class Main { Helper helper; }\n");
    write(project, "a/app/Helper.java", "package app; public class Helper {}\n");
    write(project, "b/app/Main.java", "package app; public class Main { Other other; }\n");
    write(project, "b/app/Other.java", "package app; public class Other {}\n");

    int exitCode = new CommandLine(new Main()).execute(
        "--root", project.toString(),
        "--vault", vault.toString()
    );

    assertEquals(0, exitCode);
    // Neither copy may be silently excluded; both must be analyzed.
    String aMain = Files.readString(vault.resolve("a/app/Main.java.md"), StandardCharsets.UTF_8);
    String bMain = Files.readString(vault.resolve("b/app/Main.java.md"), StandardCharsets.UTF_8);
    assertTrue(aMain.contains("analysis_status: analyzed"), "conflicting dup A must be analyzed\n" + aMain);
    assertTrue(bMain.contains("analysis_status: analyzed"), "conflicting dup B must be analyzed\n" + bMain);
    // Each must keep its own distinct dependency.
    assertTrue(aMain.contains("(a/app/Helper.java)") || bMain.contains("(a/app/Helper.java)"),
        "Helper dependency lost for conflicting duplicate");
  }

  @Test
  void identicalDuplicateIsExcludedAndMarkedButCanonicalKeepsDependencies() throws Exception {
    Path project = temp.resolve("identical-project");
    Path vault = temp.resolve("identical-vault");
    String main = "package app; public class Main { Helper helper; }\n";
    String helper = "package app; public class Helper {}\n";
    write(project, "a/app/Main.java", main);
    write(project, "a/app/Helper.java", helper);
    write(project, "b/app/Main.java", main);
    write(project, "b/app/Helper.java", helper);

    int exitCode = new CommandLine(new Main()).execute(
        "--root", project.toString(),
        "--vault", vault.toString()
    );

    assertEquals(0, exitCode);
    // One side is canonical (analyzed, keeps deps); the other is an excluded duplicate (marked).
    String aMain = Files.readString(vault.resolve("a/app/Main.java.md"), StandardCharsets.UTF_8);
    String bMain = Files.readString(vault.resolve("b/app/Main.java.md"), StandardCharsets.UTF_8);
    boolean aCanonical = aMain.contains("analysis_status: analyzed");
    String canonical = aCanonical ? aMain : bMain;
    String duplicate = aCanonical ? bMain : aMain;
    assertTrue(canonical.contains("(a/app/Helper.java)") || canonical.contains("(b/app/Helper.java)"),
        "Canonical copy must keep its dependency\n" + canonical);
    // The duplicate side still gets output (mirrors the input tree) and is clearly marked.
    assertTrue(duplicate.contains("analysis_status: excluded_duplicate"),
        "Duplicate side must be marked excluded_duplicate\n" + duplicate);
  }

  @Test
  void resolvesModernJavaConstructs() throws Exception {
    Path project = temp.resolve("modern-project");
    Path vault = temp.resolve("modern-vault");
    write(project, "src/app/Shape.java", "package app; public sealed interface Shape permits Circle, Square {}\n");
    write(project, "src/app/Circle.java", "package app; public record Circle(double radius) implements Shape {}\n");
    write(project, "src/app/Square.java", "package app; public record Square(double side) implements Shape {}\n");
    write(project, "src/app/Geometry.java",
        "package app;\n"
        + "import java.util.List;\n"
        + "import java.util.function.Function;\n"
        + "public class Geometry {\n"
        + "  public List<Shape> shapes() { return List.of(new Circle(1), new Square(2)); }\n"
        + "  public Function<Circle, Double> area() { return Circle::radius; }\n"  // method ref
        + "  public Shape pick() { return shapes().stream().filter(s -> s instanceof Circle).findFirst().orElse(null); }\n" // lambda
        + "}\n");

    int exitCode = new CommandLine(new Main()).execute(
        "--root", project.toString(),
        "--vault", vault.toString()
    );

    assertEquals(0, exitCode);
    String geometry = Files.readString(vault.resolve("src/app/Geometry.java.md"), StandardCharsets.UTF_8);
    assertDependency(geometry, "src/app/Shape.java");
    assertDependency(geometry, "src/app/Circle.java");
    assertDependency(geometry, "src/app/Square.java");
    String circle = Files.readString(vault.resolve("src/app/Circle.java.md"), StandardCharsets.UTF_8);
    assertDependency(circle, "src/app/Shape.java");
  }

  @Test
  void batchSizeOfOneStillProducesCorrectDependencies() throws Exception {
    Path project = temp.resolve("batch1-project");
    Path vault = temp.resolve("batch1-vault");
    write(project, "src/app/A.java", "package app; public class A { B b; C c; }\n");
    write(project, "src/app/B.java", "package app; public class B { A a; }\n");
    write(project, "src/app/C.java", "package app; public class C {}\n");

    int exitCode = new CommandLine(new Main()).execute(
        "--root", project.toString(),
        "--vault", vault.toString(),
        "--batch-size", "1"
    );

    assertEquals(0, exitCode);
    String aMarkdown = Files.readString(vault.resolve("src/app/A.java.md"), StandardCharsets.UTF_8);
    assertDependency(aMarkdown, "src/app/B.java");
    assertDependency(aMarkdown, "src/app/C.java");
  }

  @Test
  void resolvesMavenCompilerPropertiesBeforeCallingJavac() throws Exception {
    Path project = temp.resolve("property-project");
    Path vault = temp.resolve("property-vault");
    write(project, "pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <groupId>app</groupId>
          <artifactId>property-project</artifactId>
          <version>1.0.0</version>
          <properties>
            <target.java.version>17</target.java.version>
          </properties>
          <build>
            <plugins>
              <plugin>
                <artifactId>maven-compiler-plugin</artifactId>
                <configuration>
                  <source>@target.java.version@</source>
                  <target>${target.java.version}</target>
                </configuration>
              </plugin>
            </plugins>
          </build>
        </project>
        """);
    write(project, "src/main/java/app/Main.java", "package app; public class Main { Helper helper; }\n");
    write(project, "src/main/java/app/Helper.java", "package app; public class Helper {}\n");

    int exitCode = new CommandLine(new Main()).execute(
        "--root", project.toString(),
        "--vault", vault.toString()
    );

    assertEquals(0, exitCode);
    String markdown = Files.readString(vault.resolve("src/main/java/app/Main.java.md"), StandardCharsets.UTF_8);
    assertDependency(markdown, "src/main/java/app/Helper.java");
    assertFalse(markdown.contains("${target.java.version}"));
    assertFalse(markdown.contains("@target.java.version@"));
  }

  private static void assertDependency(String markdown, String relativeSource) {
    assertTrue(markdown.contains("(" + relativeSource + ")"), "Missing dependency " + relativeSource + "\n" + markdown);
    String fileName = Path.of(relativeSource).getFileName().toString();
    assertTrue(markdown.contains("[" + fileName + "]") && markdown.contains(fileName + ".md) (" + relativeSource + ")"),
        "Dependency should link to generated Markdown for " + relativeSource + "\n" + markdown);
  }

  private static void write(Path root, String relative, String content) throws IOException {
    Path file = root.resolve(relative);
    Files.createDirectories(file.getParent());
    Files.writeString(file, content, StandardCharsets.UTF_8);
  }

  private static void createExternalJar(Path project) throws IOException {
    Path externalRoot = project.getParent().resolve("external-lib");
    Path source = externalRoot.resolve("external/ExternalType.java");
    Path classes = project.resolve("lib/classes");
    Files.createDirectories(source.getParent());
    Files.createDirectories(classes);
    Files.writeString(source, "package external; public class ExternalType {}\n", StandardCharsets.UTF_8);

    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    int exitCode = compiler.run(null, null, null, "-d", classes.toString(), source.toString());
    assertEquals(0, exitCode);
  }
}
