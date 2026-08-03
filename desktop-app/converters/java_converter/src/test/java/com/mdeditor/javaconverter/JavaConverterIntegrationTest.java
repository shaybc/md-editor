package com.mdeditor.javaconverter;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import picocli.CommandLine;

import com.mdeditor.javaconverter.model.CompileUnit;
import com.mdeditor.javaconverter.model.CompileUnitOrigin;
import com.mdeditor.javaconverter.model.CompileUnitScope;
import com.sun.source.util.JavacTask;

import javax.tools.JavaCompiler;
import javax.tools.ToolProvider;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JavaConverterIntegrationTest {
  @TempDir
  Path temp;

  @Test
  void scannerCreatesLegacyCompileUnitForPlainSourceFolder() throws Exception {
    Path project = temp.resolve("plain-source-project");
    write(project, "src/app/Main.java", "package app; public class Main { Helper helper; }\n");
    write(project, "src/app/Helper.java", "package app; public class Helper {}\n");

    ProjectModel model = ProjectScanner.scan(project);

    assertEquals(1, model.compileUnits().size());
    CompileUnit unit = model.compileUnits().get(0);
    assertEquals("root", unit.id());
    assertEquals(project.getFileName().toString(), unit.displayName());
    assertEquals(CompileUnitOrigin.ROOT_SCAN, unit.origin());
    assertEquals(CompileUnitScope.MIXED, unit.scope());
    assertEquals(project.toAbsolutePath().normalize(), unit.root());
    assertEquals(null, unit.descriptorPath());
    assertEquals(model.sourceRoots(), unit.sourceRoots());
    assertEquals(List.of(), unit.generatedSourceRoots());
    assertEquals(model.sourceFiles(), unit.sourceFiles());
    assertEquals(List.of(), unit.resourceRoots());
    assertEquals(model.classpathEntries(), unit.classpathEntries());
    assertEquals(List.of(), unit.dependencyUnitIds());
    assertEquals(model.release(), unit.release());
    assertEquals(model.source(), unit.source());
    assertEquals(model.target(), unit.target());
    assertEquals(model.encoding(), unit.encoding());
    assertEquals(model.warnings(), unit.warnings());
  }

  @Test
  void scannerCreatesMavenCompileUnitForMavenStyleProject() throws Exception {
    Path project = temp.resolve("maven-style-project");
    write(project, "pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <groupId>app</groupId>
          <artifactId>maven-style-project</artifactId>
          <version>1.0.0</version>
          <properties>
            <maven.compiler.release>17</maven.compiler.release>
          </properties>
        </project>
        """);
    write(project, "src/main/java/app/Main.java", "package app; public class Main {}\n");
    write(project, "src/main/java/.github/Fake.java", "package ignored; public class Fake {}\n");

    ProjectModel model = ProjectScanner.scan(project);

    assertEquals(1, model.mavenModules());
    assertEquals(1, model.compileUnits().size());
    CompileUnit unit = model.compileUnits().get(0);
    assertEquals("maven:.:main", unit.id());
    assertEquals(CompileUnitOrigin.MAVEN, unit.origin());
    assertEquals(CompileUnitScope.MAIN, unit.scope());
    assertEquals(project.toAbsolutePath().normalize(), unit.root());
    assertEquals(project.resolve("pom.xml").toAbsolutePath().normalize(), unit.descriptorPath());
    assertEquals(List.of(project.resolve("src/main/java").toAbsolutePath().normalize()), unit.sourceRoots());
    assertEquals(model.sourceFiles(), unit.sourceFiles());
    assertEquals("17", unit.release());
    assertEquals(model.encoding(), unit.encoding());
  }

  @Test
  void scannerTreatsGradleProjectsAsParseOnlySourceSetDiscovery() throws Exception {
    Path project = temp.resolve("gradle-parse-only-project");
    write(project, "settings.gradle", "include ':api'\n");
    write(project, "build.gradle", "plugins { id 'base' }\n");
    write(project, "api/build.gradle", "plugins { id 'java' }\n");
    write(project, "api/src/main/java/api/Api.java", "package api; public class Api {}\n");
    write(project, "api/src/test/java/api/ApiTest.java", "package api; public class ApiTest {}\n");
    Path failingGradle = writeFailingGradleWrapper(project);

    ProjectModel model = ProjectScanner.scan(project, false, false,
        new GradleDiscoveryOptions(failingGradle, false, GradleMetadataFailureMode.PARSE_ONLY));

    assertEquals(2, model.gradleModules());
    assertEquals(List.of("sourceset:api/src/main/java", "sourceset:api/src/test/java"),
        model.compileUnits().stream().map(CompileUnit::id).toList());
    assertScope(model, "sourceset:api/src/main/java", CompileUnitScope.MAIN);
    assertScope(model, "sourceset:api/src/test/java", CompileUnitScope.TEST);
    assertTrue(model.compileUnits().stream()
        .allMatch(unit -> unit.warnings().contains(JavaAnalysisMode.GRADLE_PARSE_ONLY)));
    assertTrue(model.warnings().contains(JavaAnalysisMode.GRADLE_PARSE_ONLY));
    assertTrue(model.warnings().stream().anyMatch(warning -> warning.contains("simulated Gradle metadata failure")));
  }

  @Test
  void scannerLogsGradleParseOnlyDiscoveryProgress() throws Exception {
    Path project = temp.resolve("gradle-log-project");
    write(project, "api/build.gradle", "plugins { id 'java' }\n");
    write(project, "api/src/main/java/api/Api.java", "package api; public class Api {}\n");
    Path failingGradle = writeFailingGradleWrapper(project);

    String output = captureOutput(() -> ProjectScanner.scan(project, false, false,
        new GradleDiscoveryOptions(failingGradle, false, GradleMetadataFailureMode.PARSE_ONLY)));

    assertTrue(output.contains("Searching for Gradle project metadata..."));
    assertTrue(output.contains("Detected Gradle project metadata: 1 build file(s)"));
    assertTrue(output.contains("Java compile unit detection method: Gradle parse-only source-set discovery"));
    assertTrue(output.contains("Detected Java compile unit: sourceset:api/src/main/java (main) at api/src/main/java"));
  }

  @Test
  void converterWritesGradleSourcesAsParseOnlyMetadataAndReport() throws Exception {
    Path project = temp.resolve("gradle-metadata-project");
    Path vault = temp.resolve("gradle-metadata-vault");
    write(project, "build.gradle", "plugins { id 'java' }\n");
    write(project, "src/main/java/app/Main.java", "package app; import helper.Helper; public class Main { Helper helper; }\n");
    write(project, "src/main/java/helper/Helper.java", "package helper; public class Helper {}\n");
    Path failingGradle = writeFailingGradleWrapper(project);

    int[] exitCode = new int[1];
    String output = captureOutput(() -> exitCode[0] = new CommandLine(new Main()).execute(
        "--root", project.toString(),
        "--vault", vault.toString(),
        "--gradle-executable", failingGradle.toString()
    ));

    assertEquals(0, exitCode[0]);
    assertTrue(output.contains("Java compile units detected: 1"));
    String metadata = Files.readString(vault.resolve(".md-editor").resolve("_md_editor_project.json"),
        StandardCharsets.UTF_8);
    assertTrue(metadata.contains("\"detectionMethod\": \"explicit-source-root-discovery\""));
    assertTrue(metadata.contains("\"sourceset:src/main/java\""));
    assertTrue(metadata.contains("\"origin\": \"inferred\""));
    assertTrue(metadata.contains("\"fileToCompileUnitIds\""));
    assertTrue(metadata.contains("\"src/main/java/app/Main.java\""));
    String markdown = Files.readString(vault.resolve("src/main/java/app/Main.java.md"), StandardCharsets.UTF_8);
    assertTrue(markdown.contains("analysis_status: parse_only"));
    assertDependency(markdown, "src/main/java/helper/Helper.java");
    String reportJson = Files.readString(vault.resolve(".md-editor").resolve("missing_dependencies_report.json"),
        StandardCharsets.UTF_8);
    assertTrue(reportJson.contains("\"gradleBuildFilesDetected\": 1"));
    String reportMarkdown = Files.readString(vault.resolve(".md-editor").resolve("missing_dependencies_report.md"),
        StandardCharsets.UTF_8);
    assertTrue(reportMarkdown.contains("- Gradle build files detected: 1"));
  }

  @Test
  void scannerCreatesGradleCompileUnitsFromRealMetadata() throws Exception {
    Path project = temp.resolve("gradle-real-project");
    write(project, "settings.gradle", "include ':api', ':impl'\n");
    write(project, "build.gradle", "plugins { id 'base' }\n");
    write(project, "api/build.gradle", "plugins { id 'java' }\n");
    write(project, "impl/build.gradle", "plugins { id 'java' }\n");
    write(project, "api/src/main/java/api/Api.java", "package api; public class Api {}\n");
    write(project, "api/src/main/resources/api.txt", "resource\n");
    write(project, "impl/src/main/java/impl/Impl.java", "package impl; import api.Api; public class Impl { Api api; }\n");
    write(project, "impl/src/test/java/impl/ImplTest.java", "package impl; public class ImplTest {}\n");
    Path classes = project.resolve("api/build/classes/java/main");
    Files.createDirectories(classes);
    writeGradleWrapper(project,
        gradleMetadataLine(":api", project.resolve("api"), project.resolve("api/build.gradle"),
            "main",
            List.of(project.resolve("api/src/main/java")),
            List.of(),
            List.of(project.resolve("api/src/main/resources")),
            List.of(project.resolve("api/src/main/java/api/Api.java")),
            List.of(classes),
            List.of(),
            "17", "17", "17", "UTF-8"),
        gradleMetadataLine(":impl", project.resolve("impl"), project.resolve("impl/build.gradle"),
            "main",
            List.of(project.resolve("impl/src/main/java")),
            List.of(),
            List.of(),
            List.of(project.resolve("impl/src/main/java/impl/Impl.java")),
            List.of(classes),
            List.of(":api"),
            "17", "17", "17", "UTF-8"),
        gradleMetadataLine(":impl", project.resolve("impl"), project.resolve("impl/build.gradle"),
            "test",
            List.of(project.resolve("impl/src/test/java")),
            List.of(),
            List.of(),
            List.of(project.resolve("impl/src/test/java/impl/ImplTest.java")),
            List.of(classes),
            List.of(":api"),
            "17", "17", "17", "UTF-8")
    );

    ProjectModel model = ProjectScanner.scan(project);

    assertEquals(3, model.gradleModules());
    assertEquals(List.of("gradle:api:main", "gradle:impl:main", "gradle:impl:test"),
        model.compileUnits().stream().map(CompileUnit::id).toList());
    CompileUnit impl = compileUnit(model, "gradle:impl:main");
    assertEquals(CompileUnitOrigin.GRADLE, impl.origin());
    assertEquals(CompileUnitScope.MAIN, impl.scope());
    assertEquals(List.of("gradle:api:main"), impl.dependencyUnitIds());
    assertEquals(List.of(project.resolve("api/src/main/java").toAbsolutePath().normalize()),
        impl.dependencySourceRoots());
    assertEquals(List.of(classes.toAbsolutePath().normalize()), impl.classpathEntries());
    assertEquals("17", impl.release());
    assertEquals("UTF-8", impl.encoding());
    assertFalse(impl.warnings().contains(JavaAnalysisMode.GRADLE_PARSE_ONLY));
    assertTrue(model.warnings().stream().anyMatch(warning -> warning.contains("Gradle metadata extraction succeeded")));
  }

  @Test
  void explicitGradleExecutableWinsOverWrapper() throws Exception {
    Path project = temp.resolve("gradle-precedence-project");
    write(project, "build.gradle", "plugins { id 'java' }\n");
    write(project, "src/main/java/app/App.java", "package app; public class App {}\n");
    writeFailingGradleWrapper(project);
    Path explicit = writeGradleExecutable(temp.resolve("explicit-gradle"),
        gradleMetadataLine(":", project, project.resolve("build.gradle"),
            "main",
            List.of(project.resolve("src/main/java")),
            List.of(),
            List.of(),
            List.of(project.resolve("src/main/java/app/App.java")),
            List.of(),
            List.of(),
            "", "", "", "UTF-8"));

    ProjectModel model = ProjectScanner.scan(project, false, false,
        new GradleDiscoveryOptions(explicit, false, GradleMetadataFailureMode.PARSE_ONLY));

    assertEquals(List.of("gradle:.:main"), model.compileUnits().stream().map(CompileUnit::id).toList());
    assertEquals(CompileUnitOrigin.GRADLE, model.compileUnits().get(0).origin());
  }

  @Test
  void gradleUserHomeIsPassedToGradleLauncher() throws Exception {
    Path project = temp.resolve("gradle-user-home-project");
    Path userHome = temp.resolve("custom-gradle-user-home");
    write(project, "build.gradle", "plugins { id 'java' }\n");
    write(project, "src/main/java/app/App.java", "package app; public class App {}\n");
    Path executable = writeGradleExecutableRequiringUserHome(temp.resolve("gradle-user-home-executable"),
        gradleMetadataLine(":", project, project.resolve("build.gradle"),
            "main",
            List.of(project.resolve("src/main/java")),
            List.of(),
            List.of(),
            List.of(project.resolve("src/main/java/app/App.java")),
            List.of(),
            List.of(),
            "", "", "", "UTF-8"));

    ProjectModel model = ProjectScanner.scan(project, false, false,
        new GradleDiscoveryOptions(executable, false, userHome, GradleMetadataFailureMode.PARSE_ONLY));

    assertEquals(List.of("gradle:.:main"), model.compileUnits().stream().map(CompileUnit::id).toList());
    assertEquals(CompileUnitOrigin.GRADLE, model.compileUnits().get(0).origin());
  }

  @Test
  void gradleMetadataFailureCanFailConversion() throws Exception {
    Path project = temp.resolve("gradle-fail-project");
    Path vault = temp.resolve("gradle-fail-vault");
    write(project, "build.gradle", "plugins { id 'java' }\n");
    write(project, "src/main/java/app/App.java", "package app; public class App {}\n");
    Path failingGradle = writeFailingGradleWrapper(project);

    int exitCode = new CommandLine(new Main()).execute(
        "--root", project.toString(),
        "--vault", vault.toString(),
        "--gradle-executable", failingGradle.toString(),
        "--on-gradle-metadata-failure", "fail"
    );

    assertEquals(1, exitCode);
  }

  @Test
  void gradleAdaptiveAnalysisSkipsJavacForExplicitDependencies() throws Exception {
    Path project = temp.resolve("gradle-adaptive-explicit-project");
    Path sourceRoot = project.resolve("src/main/java");
    Path home = sourceRoot.resolve("app/Home.java");
    Path main = sourceRoot.resolve("app/Main.java");
    write(project, "build.gradle", "plugins { id 'java' }\n");
    write(home, "package app; public class Home { public void build() {} }\n");
    write(main, "package app; public class Main { Home home; void run() { home.build(); } }\n");
    writeGradleWrapper(project, gradleMetadataLine(":", project, project.resolve("build.gradle"),
        "main", List.of(sourceRoot), List.of(), List.of(), List.of(home, main), List.of(),
        List.of(), "17", "", "", "UTF-8"));
    int[] analyzeCalls = new int[1];
    JavaDependencyAnalyzer analyzer = new JavaDependencyAnalyzer() {
      @Override
      protected void analyzeParsedTask(JavacTask task, List<Path> chunk) throws IOException {
        analyzeCalls[0] += 1;
        super.analyzeParsedTask(task, chunk);
      }
    };

    AnalysisResult result = analyzer.analyze(ProjectScanner.scan(project));

    assertEquals(0, analyzeCalls[0], "explicit Gradle dependencies should not need javac attribution");
    SourceFileModel mainModel = sourceModel(result, main);
    assertEquals(SourceFileModel.AnalysisStatus.PARSE_ONLY, mainModel.analysisStatus);
    assertTrue(mainModel.dependencies.contains(home.toAbsolutePath().normalize()));
    assertTrue(mainModel.dependencyEvidence.stream().anyMatch(evidence ->
        evidence.dependency() != null
            && evidence.dependency().equals(home.toAbsolutePath().normalize())
            && evidence.dependencySource().equals("explicit_type")
            && evidence.confidence().equals("high")));
  }

  @Test
  void gradleAdaptiveAnalysisAttributesOnlyUncertainFiles() throws Exception {
    Path project = temp.resolve("gradle-adaptive-uncertain-project");
    Path sourceRoot = project.resolve("src/main/java");
    Path home = sourceRoot.resolve("app/Home.java");
    Path main = sourceRoot.resolve("app/Main.java");
    write(project, "build.gradle", "plugins { id 'java' }\n");
    write(home, "package app; public class Home { public void build() {} }\n");
    write(main, "package app; public class Main { void run() { var home = new Home(); home.build(); } }\n");
    writeGradleWrapper(project, gradleMetadataLine(":", project, project.resolve("build.gradle"),
        "main", List.of(sourceRoot), List.of(), List.of(), List.of(home, main), List.of(),
        List.of(), "17", "", "", "UTF-8"));
    int[] analyzeCalls = new int[1];
    JavaDependencyAnalyzer analyzer = new JavaDependencyAnalyzer() {
      @Override
      protected void analyzeParsedTask(JavacTask task, List<Path> chunk) throws IOException {
        analyzeCalls[0] += 1;
        super.analyzeParsedTask(task, chunk);
      }
    };

    AnalysisResult result = analyzer.analyze(ProjectScanner.scan(project));

    assertEquals(1, analyzeCalls[0], "only the var-using file should need javac attribution");
    SourceFileModel mainModel = sourceModel(result, main);
    assertEquals(SourceFileModel.AnalysisStatus.ANALYZED, mainModel.analysisStatus);
    assertTrue(mainModel.dependencies.contains(home.toAbsolutePath().normalize()));
  }

  @Test
  void gradleAdaptiveAnalysisTreatsStaticWildcardImportAsOwnerDependency() throws Exception {
    Path project = temp.resolve("gradle-adaptive-static-wildcard-project");
    Path sourceRoot = project.resolve("src/main/java");
    Path constants = sourceRoot.resolve("app/FreeFormConstants.java");
    Path main = sourceRoot.resolve("app/Main.java");
    write(project, "build.gradle", "plugins { id 'java' }\n");
    write(constants, "package app; public interface FreeFormConstants { int FREE_FORM_STATUS = 6; }\n");
    write(main, """
        package app;
        import static app.FreeFormConstants.*;
        public class Main {
          int status = FREE_FORM_STATUS;
        }
        """);
    writeGradleWrapper(project, gradleMetadataLine(":", project, project.resolve("build.gradle"),
        "main", List.of(sourceRoot), List.of(), List.of(), List.of(constants, main), List.of(),
        List.of(), "17", "", "", "UTF-8"));

    AnalysisResult result = new JavaDependencyAnalyzer().analyze(ProjectScanner.scan(project));

    SourceFileModel mainModel = sourceModel(result, main);
    assertTrue(mainModel.dependencies.contains(constants.toAbsolutePath().normalize()));
    assertFalse(mainModel.dependencyEvidence.stream()
        .anyMatch(evidence -> evidence.dependency() == null
            && evidence.symbol().equals("app.FreeFormConstants.*")));
    assertFalse(mainModel.unresolvedDependencies.stream()
        .anyMatch(dependency -> dependency.symbol().equals("app.FreeFormConstants.*")
            || dependency.symbol().equals("app.FreeFormConstants")));
  }

  @Test
  void gradleAdaptiveAnalysisKeepsParseOnlyDataWhenJavacFails() throws Exception {
    Path project = temp.resolve("gradle-adaptive-javac-failure-project");
    Path sourceRoot = project.resolve("src/main/java");
    Path home = sourceRoot.resolve("app/Home.java");
    Path main = sourceRoot.resolve("app/Main.java");
    Path other = sourceRoot.resolve("app/Other.java");
    write(project, "build.gradle", "plugins { id 'java' }\n");
    write(home, "package app; public class Home { public void build() {} }\n");
    write(main, "package app; public class Main { void run() { var home = new Home(); home.build(); } }\n");
    write(other, "package app; public class Other { Home home; }\n");
    writeGradleWrapper(project, gradleMetadataLine(":", project, project.resolve("build.gradle"),
        "main", List.of(sourceRoot), List.of(), List.of(), List.of(home, main, other), List.of(),
        List.of(), "17", "", "", "UTF-8"));
    int[] analyzeCalls = new int[1];
    JavaDependencyAnalyzer analyzer = new JavaDependencyAnalyzer() {
      @Override
      protected void analyzeParsedTask(JavacTask task, List<Path> chunk) {
        analyzeCalls[0] += 1;
        throw new IllegalStateException(new AssertionError("simulated javac assertion"));
      }
    };

    AnalysisResult result = analyzer.analyze(ProjectScanner.scan(project));

    assertEquals(1, analyzeCalls[0], "adaptive mode should not recursively bisect internal javac failures");
    SourceFileModel mainModel = sourceModel(result, main);
    SourceFileModel otherModel = sourceModel(result, other);
    assertEquals(SourceFileModel.AnalysisStatus.PARSE_ONLY, mainModel.analysisStatus);
    assertEquals(SourceFileModel.AnalysisStatus.PARSE_ONLY, otherModel.analysisStatus);
    assertTrue(mainModel.dependencies.contains(home.toAbsolutePath().normalize()));
    assertTrue(otherModel.dependencies.contains(home.toAbsolutePath().normalize()));
  }

  @Test
  void scannerLogsMavenCompileUnitDiscoveryProgress() throws Exception {
    Path project = temp.resolve("maven-log-project");
    write(project, "pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <groupId>app</groupId>
          <artifactId>maven-log-project</artifactId>
          <version>1.0.0</version>
        </project>
        """);
    write(project, "src/main/java/app/Main.java", "package app; public class Main {}\n");

    String output = captureOutput(() -> ProjectScanner.scan(project, false, true));

    assertTrue(output.contains("Scanning project structure: "));
    assertTrue(output.contains("Searching for Maven project metadata..."));
    assertTrue(output.contains("Detected Maven project metadata: 1 pom.xml file(s)"));
    assertTrue(output.contains("Resolving Maven classpath for pom.xml"));
    assertTrue(output.contains("Maven classpath resolved for pom.xml:"));
    assertTrue(output.contains("Aggregate classpath entries after pom.xml:"));
    assertTrue(output.contains("Reading Maven module metadata: pom.xml"));
    assertTrue(output.contains("Java compile unit detection method: Maven project metadata"));
    assertTrue(output.contains("Detected Java compile unit: maven:.:main (main) at ."));
  }

  @Test
  void scannerWarnsAndFallsBackWhenMavenReturnsEmptyClasspathForPomWithDependencies() throws Exception {
    Path project = temp.resolve("empty-classpath-with-deps-project");
    writeEmptyMavenWrapper(project);
    write(project, "pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <groupId>app</groupId>
          <artifactId>empty-classpath-with-deps-project</artifactId>
          <version>1.0.0</version>
          <dependencies>
            <dependency>
              <groupId>external</groupId>
              <artifactId>missing-lib</artifactId>
              <version>1.2.3</version>
            </dependency>
          </dependencies>
        </project>
        """);
    write(project, "src/main/java/app/Main.java", "package app; public class Main {}\n");

    ProjectModel model = ProjectScanner.scan(project, false, true);

    assertTrue(model.warnings().stream()
        .anyMatch(warning -> warning.contains("Maven classpath extraction returned 0 entries")
            && warning.contains("despite declared dependencies")));
    assertTrue(model.warnings().stream()
        .anyMatch(warning -> warning.contains("Local Maven repository fallback for empty Maven classpath returned")));
  }

  @Test
  void scannerDoesNotTimeoutWhenMavenFailureWritesLargeOutput() throws Exception {
    Path project = temp.resolve("noisy-failing-maven-project");
    writeNoisyFailingMavenWrapper(project);
    write(project, "pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <groupId>app</groupId>
          <artifactId>noisy-failing-maven-project</artifactId>
          <version>1.0.0</version>
        </project>
        """);
    write(project, "src/main/java/app/Main.java", "package app; public class Main {}\n");

    ProjectModel model = assertTimeoutPreemptively(
        Duration.ofSeconds(10),
        () -> ProjectScanner.scan(project, false, true)
    );

    assertTrue(model.warnings().stream()
        .anyMatch(warning -> warning.contains("Maven classpath extraction failed for:")));
    assertFalse(model.warnings().stream()
        .anyMatch(warning -> warning.contains("Timed out while asking Maven for classpath")));
    assertEquals(List.of("maven:.:main"), model.compileUnits().stream().map(CompileUnit::id).toList());
  }

  @Test
  void scannerAllowsEmptyMavenClasspathForPomWithoutDependencies() throws Exception {
    Path project = temp.resolve("empty-classpath-no-deps-project");
    writeEmptyMavenWrapper(project);
    write(project, "pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <groupId>app</groupId>
          <artifactId>empty-classpath-no-deps-project</artifactId>
          <version>1.0.0</version>
        </project>
        """);
    write(project, "src/main/java/app/Main.java", "package app; public class Main {}\n");

    ProjectModel model = ProjectScanner.scan(project, false, true);

    assertFalse(model.warnings().stream()
        .anyMatch(warning -> warning.contains("Maven classpath extraction returned 0 entries")));
    assertFalse(model.warnings().stream()
        .anyMatch(warning -> warning.contains("Local Maven repository fallback for empty Maven classpath returned")));
  }

  @Test
  void scannerWarnsForEmptyMavenClasspathWithParentManagedFlinkStyleDependency() throws Exception {
    Path project = temp.resolve("empty-classpath-flink-style-project");
    writeEmptyMavenWrapper(project);
    write(project, "pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <groupId>org.apache.flink</groupId>
          <artifactId>flink-parent</artifactId>
          <version>2.4-SNAPSHOT</version>
          <packaging>pom</packaging>
          <modules>
            <module>flink-formats</module>
          </modules>
        </project>
        """);
    write(project, "flink-formats/pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <parent>
            <groupId>org.apache.flink</groupId>
            <artifactId>flink-parent</artifactId>
            <version>2.4-SNAPSHOT</version>
          </parent>
          <artifactId>flink-formats</artifactId>
          <packaging>pom</packaging>
          <modules>
            <module>flink-avro</module>
          </modules>
        </project>
        """);
    write(project, "flink-formats/flink-avro/pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <parent>
            <groupId>org.apache.flink</groupId>
            <artifactId>flink-formats</artifactId>
            <version>2.4-SNAPSHOT</version>
          </parent>
          <artifactId>flink-avro</artifactId>
          <dependencies>
            <dependency>
              <groupId>org.apache.flink</groupId>
              <artifactId>flink-core</artifactId>
              <version>${project.version}</version>
              <scope>provided</scope>
            </dependency>
            <dependency>
              <groupId>org.apache.avro</groupId>
              <artifactId>avro</artifactId>
            </dependency>
          </dependencies>
        </project>
        """);
    writeEmptyMavenWrapper(project.resolve("flink-formats"));
    writeEmptyMavenWrapper(project.resolve("flink-formats/flink-avro"));
    write(project, "flink-formats/flink-avro/src/main/java/org/apache/flink/formats/avro/AvroFormat.java",
        "package org.apache.flink.formats.avro; public class AvroFormat {}\n");

    ProjectModel model = ProjectScanner.scan(project, false, true);

    assertTrue(model.warnings().stream()
        .anyMatch(warning -> warning.contains("Maven classpath extraction returned 0 entries")
            && warning.contains("flink-avro")));
    assertTrue(model.warnings().stream()
        .anyMatch(warning -> warning.contains("Local Maven repository fallback for empty Maven classpath returned")
            && warning.contains("flink-avro")));
  }

  @Test
  void scannerCreatesMavenMainAndTestUnitsDeterministically() throws Exception {
    Path project = temp.resolve("maven-main-test-project");
    write(project, "pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <groupId>app</groupId>
          <artifactId>main-test</artifactId>
          <version>1.0.0</version>
        </project>
        """);
    write(project, "src/test/java/app/MainTest.java", "package app; public class MainTest {}\n");
    write(project, "src/main/java/app/Main.java", "package app; public class Main {}\n");
    write(project, "src/integration-test/java/app/MainIT.java", "package app; public class MainIT {}\n");

    ProjectModel model = ProjectScanner.scan(project);
    List<String> ids = model.compileUnits().stream().map(CompileUnit::id).toList();

    assertEquals(List.of("maven:.:integration-test", "maven:.:main", "maven:.:test"), ids);
    assertScope(model, "maven:.:integration-test", CompileUnitScope.INTEGRATION_TEST);
    assertScope(model, "maven:.:main", CompileUnitScope.MAIN);
    assertScope(model, "maven:.:test", CompileUnitScope.TEST);
  }

  @Test
  void scannerCreatesMavenUnitsForReactorAndDependencies() throws Exception {
    Path project = temp.resolve("maven-reactor-project");
    write(project, "pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <groupId>app</groupId>
          <artifactId>parent</artifactId>
          <version>1.0.0</version>
          <packaging>pom</packaging>
          <modules>
            <module>api</module>
            <module>impl</module>
          </modules>
        </project>
        """);
    write(project, "api/pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <parent>
            <groupId>app</groupId>
            <artifactId>parent</artifactId>
            <version>1.0.0</version>
          </parent>
          <artifactId>api</artifactId>
        </project>
        """);
    write(project, "impl/pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <parent>
            <groupId>app</groupId>
            <artifactId>parent</artifactId>
            <version>1.0.0</version>
          </parent>
          <artifactId>impl</artifactId>
          <dependencies>
            <dependency>
              <groupId>app</groupId>
              <artifactId>api</artifactId>
              <version>1.0.0</version>
            </dependency>
          </dependencies>
        </project>
        """);
    write(project, "api/src/main/java/api/Api.java", "package api; public class Api {}\n");
    write(project, "impl/src/main/java/impl/Impl.java", "package impl; public class Impl {}\n");

    ProjectModel model = ProjectScanner.scan(project);
    List<String> ids = model.compileUnits().stream().map(CompileUnit::id).toList();

    assertEquals(List.of("maven:api:main", "maven:impl:main"), ids);
    assertEquals(List.of("maven:api:main"), compileUnit(model, "maven:impl:main").dependencyUnitIds());
    assertFalse(ids.contains("maven:.:main"));
  }

  @Test
  void converterUsesMavenReactorSourcesAsCompilerContextForFileDependencies() throws Exception {
    Path project = temp.resolve("flink-like-reactor");
    Path vault = temp.resolve("flink-like-vault");
    write(project, "pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <groupId>org.apache.flink</groupId>
          <artifactId>flink-parent</artifactId>
          <version>1.0.0</version>
          <packaging>pom</packaging>
          <modules>
            <module>flink-core</module>
            <module>flink-table-common</module>
            <module>flink-connector-files</module>
            <module>flink-formats/flink-avro</module>
          </modules>
        </project>
        """);
    write(project, "flink-core/pom.xml", childPom("org.apache.flink", "flink-parent", "flink-core", ""));
    write(project, "flink-table-common/pom.xml", childPom("org.apache.flink", "flink-parent", "flink-table-common", ""));
    write(project, "flink-connector-files/pom.xml", childPom("org.apache.flink", "flink-parent", "flink-connector-files", ""));
    write(project, "flink-formats/flink-avro/pom.xml", childPom("org.apache.flink", "flink-parent", "flink-avro", """
          <dependencies>
            <dependency>
              <groupId>org.apache.flink</groupId>
              <artifactId>flink-core</artifactId>
              <version>${project.version}</version>
              <scope>provided</scope>
            </dependency>
            <dependency>
              <groupId>org.apache.flink</groupId>
              <artifactId>flink-table-common</artifactId>
            </dependency>
            <dependency>
              <groupId>org.apache.flink</groupId>
              <artifactId>flink-connector-files</artifactId>
              <optional>true</optional>
            </dependency>
          </dependencies>
        """));
    write(project, "flink-core/src/main/java/org/apache/flink/core/CoreType.java",
        "package org.apache.flink.core; public class CoreType {}\n");
    write(project, "flink-table-common/src/main/java/org/apache/flink/table/common/TableType.java",
        "package org.apache.flink.table.common; public class TableType {}\n");
    write(project, "flink-connector-files/src/main/java/org/apache/flink/connector/files/FileType.java",
        "package org.apache.flink.connector.files; public class FileType {}\n");
    write(project, "flink-formats/flink-avro/src/main/java/org/apache/flink/formats/avro/AvroFormat.java", """
        package org.apache.flink.formats.avro;
        public class AvroFormat {
          private org.apache.flink.core.CoreType core;
          private org.apache.flink.table.common.TableType table;
          private org.apache.flink.connector.files.FileType file;
        }
        """);

    ProjectModel model = ProjectScanner.scan(project);
    List<String> ids = model.compileUnits().stream().map(CompileUnit::id).toList();
    assertTrue(ids.contains("maven:flink-core:main"));
    assertTrue(ids.contains("maven:flink-table-common:main"));
    assertTrue(ids.contains("maven:flink-connector-files:main"));
    CompileUnit avro = compileUnit(model, "maven:flink-formats/flink-avro:main");
    assertTrue(avro.dependencySourceRoots()
        .contains(project.resolve("flink-core/src/main/java").toAbsolutePath().normalize()));
    assertTrue(avro.dependencySourceRoots()
        .contains(project.resolve("flink-table-common/src/main/java").toAbsolutePath().normalize()));
    assertTrue(avro.dependencySourceRoots()
        .contains(project.resolve("flink-connector-files/src/main/java").toAbsolutePath().normalize()));

    int exitCode = new CommandLine(new Main()).execute(
        "--root", project.toString(),
        "--vault", vault.toString()
    );

    assertEquals(0, exitCode);
    String metadata = Files.readString(vault.resolve(".md-editor").resolve("_md_editor_project.json"),
        StandardCharsets.UTF_8);
    assertTrue(metadata.contains("\"schemaVersion\": 2"));
    assertTrue(metadata.contains("\"languages\""));
    assertTrue(metadata.contains("\"java\""));
    assertTrue(metadata.contains("\"detectionMethod\": \"maven-project-metadata\""));
    assertTrue(metadata.contains("\"compileUnits\": 4"));
    assertTrue(metadata.contains("\"compileUnitsById\""));
    assertTrue(metadata.contains("\"maven:flink-formats/flink-avro:main\""));
    assertTrue(metadata.contains("\"root\": \"flink-formats/flink-avro\""));
    assertTrue(metadata.contains("\"descriptorPath\": \"flink-formats/flink-avro/pom.xml\""));
    assertTrue(metadata.contains("\"sourceRoots\""));
    assertTrue(metadata.contains("\"flink-formats/flink-avro/src/main/java\""));
    assertTrue(metadata.contains("\"dependencySourceRoots\""));
    assertTrue(metadata.contains("\"flink-core/src/main/java\""));
    assertTrue(metadata.contains("\"dependencyUnitIds\""));
    assertTrue(metadata.contains("\"maven:flink-core:main\""));
    assertTrue(metadata.contains("\"fileToCompileUnitIds\""));
    assertTrue(metadata.contains("\"flink-formats/flink-avro/src/main/java/org/apache/flink/formats/avro/AvroFormat.java\""));
    assertTrue(metadata.contains("\"folderToCompileUnitIds\""));
    String markdown = Files.readString(vault.resolve(
        "flink-formats/flink-avro/src/main/java/org/apache/flink/formats/avro/AvroFormat.java.md"),
        StandardCharsets.UTF_8);
    assertDependency(markdown, "flink-core/src/main/java/org/apache/flink/core/CoreType.java");
    assertDependency(markdown, "flink-table-common/src/main/java/org/apache/flink/table/common/TableType.java");
    assertDependency(markdown, "flink-connector-files/src/main/java/org/apache/flink/connector/files/FileType.java");
  }

  @Test
  void scannerAddsMavenTestDependencySourcesOnlyForTestJarDependencies() throws Exception {
    Path project = temp.resolve("maven-test-jar-reactor");
    write(project, "pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <groupId>app</groupId>
          <artifactId>parent</artifactId>
          <version>1.0.0</version>
          <packaging>pom</packaging>
          <modules>
            <module>test-utils</module>
            <module>app</module>
            <module>app-without-test-jar</module>
          </modules>
        </project>
        """);
    write(project, "test-utils/pom.xml", childPom("app", "parent", "test-utils", ""));
    write(project, "app/pom.xml", childPom("app", "parent", "app", """
          <dependencies>
            <dependency>
              <groupId>app</groupId>
              <artifactId>test-utils</artifactId>
              <scope>test</scope>
              <type>test-jar</type>
            </dependency>
          </dependencies>
        """));
    write(project, "app-without-test-jar/pom.xml", childPom("app", "parent", "app-without-test-jar", """
          <dependencies>
            <dependency>
              <groupId>app</groupId>
              <artifactId>test-utils</artifactId>
              <scope>test</scope>
            </dependency>
          </dependencies>
        """));
    write(project, "test-utils/src/test/java/util/TestHelper.java",
        "package util; public class TestHelper {}\n");
    write(project, "app/src/test/java/app/AppTest.java",
        "package app; class AppTest { util.TestHelper helper; }\n");
    write(project, "app-without-test-jar/src/test/java/app/AppWithoutTestJarTest.java",
        "package app; class AppWithoutTestJarTest { util.TestHelper helper; }\n");

    ProjectModel model = ProjectScanner.scan(project);
    CompileUnit appTest = compileUnit(model, "maven:app:test");
    CompileUnit appWithoutTestJar = compileUnit(model, "maven:app-without-test-jar:test");

    assertEquals(List.of("maven:test-utils:test"), appTest.dependencyUnitIds());
    assertTrue(appTest.dependencySourceRoots()
        .contains(project.resolve("test-utils/src/test/java").toAbsolutePath().normalize()));
    assertEquals(List.of(), appWithoutTestJar.dependencyUnitIds());
    assertEquals(List.of(), appWithoutTestJar.dependencySourceRoots());
  }

  @Test
  void scannerReadsMavenCustomRootsResourcesSettingsGeneratedAndWarnings() throws Exception {
    Path project = temp.resolve("maven-custom-project");
    write(project, "pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <groupId>app</groupId>
          <artifactId>custom</artifactId>
          <version>1.0.0</version>
          <properties>
            <java.level>21</java.level>
          </properties>
          <build>
            <sourceDirectory>custom-main</sourceDirectory>
            <testSourceDirectory>custom-test</testSourceDirectory>
            <resources>
              <resource><directory>custom-resources</directory></resource>
            </resources>
            <testResources>
              <testResource><directory>custom-test-resources</directory></testResource>
            </testResources>
            <plugins>
              <plugin>
                <artifactId>maven-compiler-plugin</artifactId>
                <configuration>
                  <release>${java.level}</release>
                </configuration>
              </plugin>
            </plugins>
          </build>
        </project>
        """);
    write(project, "custom-main/app/Main.java", "package app; public class Main {}\n");
    write(project, "custom-test/app/MainTest.java", "package app; public class MainTest {}\n");
    write(project, "custom-resources/app.properties", "name=main\n");
    write(project, "custom-test-resources/test.properties", "name=test\n");
    write(project, "target/generated-sources/annotations/app/GeneratedMain.java",
        "package app; public class GeneratedMain {}\n");
    write(project, "target/generated-test-sources/annotations/app/GeneratedTest.java",
        "package app; public class GeneratedTest {}\n");
    Files.createDirectories(project.resolve("src/integration-test/java"));
    write(project, "src/main/kotlin/app/KotlinOnly.kt", "package app\nclass KotlinOnly\n");

    ProjectModel model = ProjectScanner.scan(project);
    CompileUnit main = compileUnit(model, "maven:.:main");
    CompileUnit test = compileUnit(model, "maven:.:test");

    assertEquals("21", main.release());
    assertEquals(List.of(project.resolve("custom-main").toAbsolutePath().normalize()), main.sourceRoots());
    assertEquals(List.of(project.resolve("custom-resources").toAbsolutePath().normalize()), main.resourceRoots());
    assertEquals(List.of(project.resolve("target/generated-sources/annotations").toAbsolutePath().normalize()),
        main.generatedSourceRoots());
    assertEquals(List.of(project.resolve("custom-test-resources").toAbsolutePath().normalize()), test.resourceRoots());
    assertEquals(List.of(project.resolve("target/generated-test-sources/annotations").toAbsolutePath().normalize()),
        test.generatedSourceRoots());
    assertTrue(model.warnings().stream().anyMatch(warning -> warning.contains("empty Maven Java source set")));
    assertTrue(model.warnings().stream().anyMatch(warning -> warning.contains("Kotlin source root")));
  }

  @Test
  void scannerDetectsCommonJavaSourceSetsDeterministically() throws Exception {
    Path project = temp.resolve("source-set-project");
    write(project, "src/test/java/app/MainTest.java", "package app; public class MainTest {}\n");
    write(project, "src/main/java/app/Main.java", "package app; public class Main {}\n");
    write(project, "src/integration-test/java/app/MainIT.java", "package app; public class MainIT {}\n");
    write(project, "src/it/java/app/OtherIT.java", "package app; public class OtherIT {}\n");
    write(project, "src/testFixtures/java/app/Fixture.java", "package app; public class Fixture {}\n");
    write(project, "src/jmh/java/app/JmhBench.java", "package app; public class JmhBench {}\n");
    write(project, "src/benchmark/java/app/Benchmark.java", "package app; public class Benchmark {}\n");
    write(project, "src/androidTest/java/app/AndroidTest.java", "package app; public class AndroidTest {}\n");
    write(project, "src/debug/java/app/DebugOnly.java", "package app; public class DebugOnly {}\n");
    write(project, "src/release/java/app/ReleaseOnly.java", "package app; public class ReleaseOnly {}\n");
    write(project, "src/main/java11/app/Versioned.java", "package app; public class Versioned {}\n");

    ProjectModel model = ProjectScanner.scan(project);
    List<String> ids = model.compileUnits().stream().map(CompileUnit::id).toList();

    assertEquals(ids.stream().sorted().toList(), ids);
    assertTrue(ids.contains("sourceset:src/main/java"));
    assertTrue(ids.contains("sourceset:src/test/java"));
    assertTrue(ids.contains("sourceset:src/integration-test/java"));
    assertTrue(ids.contains("sourceset:src/it/java"));
    assertTrue(ids.contains("sourceset:src/testFixtures/java"));
    assertTrue(ids.contains("sourceset:src/jmh/java"));
    assertTrue(ids.contains("sourceset:src/benchmark/java"));
    assertTrue(ids.contains("sourceset:src/androidTest/java"));
    assertTrue(ids.contains("sourceset:src/debug/java"));
    assertTrue(ids.contains("sourceset:src/release/java"));
    assertTrue(ids.contains("sourceset:src/main/java11"));
    assertScope(model, "sourceset:src/main/java", CompileUnitScope.MAIN);
    assertScope(model, "sourceset:src/test/java", CompileUnitScope.TEST);
    assertScope(model, "sourceset:src/integration-test/java", CompileUnitScope.INTEGRATION_TEST);
    assertScope(model, "sourceset:src/it/java", CompileUnitScope.INTEGRATION_TEST);
    assertScope(model, "sourceset:src/testFixtures/java", CompileUnitScope.TEST_FIXTURES);
    assertScope(model, "sourceset:src/jmh/java", CompileUnitScope.BENCHMARK);
    assertScope(model, "sourceset:src/benchmark/java", CompileUnitScope.BENCHMARK);
    assertScope(model, "sourceset:src/androidTest/java", CompileUnitScope.TEST);
    assertScope(model, "sourceset:src/debug/java", CompileUnitScope.MAIN);
    assertScope(model, "sourceset:src/release/java", CompileUnitScope.MAIN);
    assertScope(model, "sourceset:src/main/java11", CompileUnitScope.MAIN);
  }

  @Test
  void scannerLogsSourceSetCompileUnitDiscoveryProgress() throws Exception {
    Path project = temp.resolve("source-set-log-project");
    write(project, "src/main/java/app/Main.java", "package app; public class Main {}\n");

    String output = captureOutput(() -> ProjectScanner.scan(project));

    assertTrue(output.contains("Detected Maven project metadata: 0 pom.xml file(s)"));
    assertTrue(output.contains("Scanning Java source files..."));
    assertTrue(output.contains("Discovered 1 Java source file(s)"));
    assertTrue(output.contains("Detecting Java compile units..."));
    assertTrue(output.contains("Java compile unit detection method: explicit source root discovery"));
    assertTrue(output.contains("Detected Java compile unit: sourceset:src/main/java (main) at src/main/java"));
  }

  @Test
  void scannerDetectsNestedGeneratedResourceKotlinAndModuleMetadata() throws Exception {
    Path project = temp.resolve("metadata-project");
    write(project, "modules/foo/src/main/java/module-info.java", "module foo {}\n");
    write(project, "modules/foo/src/main/java/foo/Foo.java", "package foo; public class Foo {}\n");
    write(project, "modules/foo/src/main/resources/app.properties", "name=foo\n");
    write(project, "plugins/bar/src/test/java/bar/BarTest.java", "package bar; public class BarTest {}\n");
    write(project, "plugins/bar/src/test/resources/test.properties", "name=bar\n");
    write(project, "build/generated/sources/annotationProcessor/java/main/generated/GeneratedMain.java",
        "package generated; public class GeneratedMain {}\n");
    write(project, "build/generated/sources/annotationProcessor/java/test/generated/GeneratedTest.java",
        "package generated; public class GeneratedTest {}\n");
    write(project, "target/generated-test-sources/annotations/generated/GeneratedMavenTest.java",
        "package generated; public class GeneratedMavenTest {}\n");
    write(project, "src/main/kotlin/app/KotlinOnly.kt", "package app\nclass KotlinOnly\n");
    Files.createDirectories(project.resolve("src/main/java"));
    write(project, "src/Legacy.java", "public class Legacy {}\n");
    write(project, "java/TopLevel.java", "public class TopLevel {}\n");

    ProjectModel model = ProjectScanner.scan(project);

    CompileUnit fooMain = compileUnit(model, "sourceset:modules/foo/src/main/java");
    assertEquals(CompileUnitScope.MAIN, fooMain.scope());
    assertEquals(1, fooMain.resourceRoots().size());
    assertTrue(fooMain.warnings().stream().anyMatch(warning -> warning.contains("module-info.java")));
    assertEquals(CompileUnitScope.TEST, compileUnit(model, "sourceset:plugins/bar/src/test/java").scope());
    assertEquals(1, compileUnit(model, "sourceset:plugins/bar/src/test/java").resourceRoots().size());
    assertGeneratedRoot(model, "sourceset:build/generated/sources/annotationProcessor/java/main");
    assertGeneratedRoot(model, "sourceset:build/generated/sources/annotationProcessor/java/test");
    assertGeneratedRoot(model, "sourceset:target/generated-test-sources/annotations");
    assertTrue(model.warnings().stream().anyMatch(warning -> warning.contains("Kotlin source root")));
    assertTrue(model.warnings().stream().anyMatch(warning -> warning.contains("empty Java source set")));
    assertTrue(model.warnings().stream().anyMatch(warning -> warning.contains("files directly under src/")));
    assertTrue(model.warnings().stream().anyMatch(warning -> warning.contains("top-level java/")));
  }

  @Test
  void scannerFallsBackToLegacyCompileUnitWhenNoKnownSourceSetExists() throws Exception {
    Path project = temp.resolve("legacy-layout-project");
    write(project, "app/Main.java", "package app; public class Main {}\n");

    ProjectModel model = ProjectScanner.scan(project);

    assertEquals(1, model.compileUnits().size());
    assertEquals("root", model.compileUnits().get(0).id());
    assertEquals(CompileUnitOrigin.ROOT_SCAN, model.compileUnits().get(0).origin());
  }

  @Test
  void scannerLogsLegacyCompileUnitFallbackProgress() throws Exception {
    Path project = temp.resolve("legacy-log-project");
    write(project, "app/Main.java", "package app; public class Main {}\n");

    String output = captureOutput(() -> ProjectScanner.scan(project));

    assertTrue(output.contains("Java compile unit detection method: package-path inference fallback"));
    assertTrue(output.contains("Detected Java compile unit: root (mixed) at ."));
  }

  @Test
  void scannerIgnoresWorkspaceToolingDirectories() throws Exception {
    Path project = temp.resolve("ignored-tooling-project");
    write(project, "src/main/java/app/Main.java", "package app; public class Main {}\n");
    write(project, ".github/workflows/Fake.java", "package ignored; public class Fake {}\n");
    write(project, ".mvn/wrapper/Fake.java", "package ignored; public class Fake {}\n");
    write(project, ".vscode/Fake.java", "package ignored; public class Fake {}\n");
    write(project, ".idea/Fake.java", "package ignored; public class Fake {}\n");
    write(project, "src/main/java/.github/NestedFake.java", "package ignored; public class NestedFake {}\n");

    ProjectModel model = ProjectScanner.scan(project);

    assertEquals(List.of(project.resolve("src/main/java/app/Main.java").toAbsolutePath().normalize()),
        model.sourceFiles());
    assertEquals(List.of("sourceset:src/main/java"), model.compileUnits().stream().map(CompileUnit::id).toList());
  }

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

    int exitCode;
    System.setProperty("javaconverter.skipLocalJarClasspath", "true");
    try {
      exitCode = new CommandLine(new Main()).execute(
          "--root", project.toString(),
          "--vault", vault.toString(),
          "--include-methods",
          "--include-signatures",
          "--include-return-codes",
          "--include-exceptions",
          "--include-package",
          "--include-external-dependencies"
      );
    } finally {
      System.clearProperty("javaconverter.skipLocalJarClasspath");
    }

    assertEquals(0, exitCode);
    String markdown = Files.readString(vault.resolve("src/app/Main.java.md"), StandardCharsets.UTF_8);
    Path metadataDir = vault.resolve(".md-editor");
    String metadata = Files.readString(metadataDir.resolve("_md_editor_project.json"), StandardCharsets.UTF_8);
    assertTrue(metadata.contains("\"schemaVersion\": 2"));
    assertTrue(metadata.contains("\"sourceRootPath\": \"" + project.toString().replace("\\", "/") + "\""));
    assertTrue(metadata.contains("\"detectionMethod\": \"package-path-inference-fallback\""));
    assertTrue(metadata.contains("\"compileUnitsById\""));
    assertTrue(metadata.contains("\"root\""));
    assertTrue(metadata.contains("\"fileToCompileUnitIds\""));
    assertTrue(metadata.contains("\"src/app/Main.java\""));
    assertTrue(Files.exists(metadataDir.resolve("recovery")));
    assertFalse(Files.exists(vault.resolve("_md_editor_project.json")));
    assertTrue(markdown.contains("source_file: src/app/Main.java"));
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
    assertTrue(markdown.contains("## External Dependencies"));
    assertTrue(markdown.contains("[external-lib.jar](../../lib/lib/external-lib.jar.md)"));
    assertTrue(markdown.contains("`external.ExternalType`"));
    assertTrue(markdown.contains("## Package"));
    assertTrue(markdown.contains("Signature:"));
    String jarMarkdown = Files.readString(vault.resolve("lib/lib/external-lib.jar.md"), StandardCharsets.UTF_8);
    assertTrue(jarMarkdown.contains("entity_type: external_dependency"));
    assertTrue(jarMarkdown.contains("dependency_kind: jar"));
    assertTrue(jarMarkdown.contains("language: java"));
    assertTrue(jarMarkdown.contains("conversion_status: not_started"));
    assertTrue(jarMarkdown.contains("tags:\n  - external-dependency"));
    assertTrue(jarMarkdown.contains("## Used By\n\n- src/app/Main.java"));
    assertFalse(jarMarkdown.contains("](../src/app/Main.java.md)"));
    assertTrue(jarMarkdown.contains("### external"));
    assertTrue(jarMarkdown.contains("- ExternalType"));
    assertTrue(Files.exists(vault.resolve(".md-editor").resolve("missing_dependencies_report.md")));
    assertTrue(Files.exists(vault.resolve(".md-editor").resolve("missing_dependencies_report.json")));
    String reportMarkdown = Files.readString(vault.resolve(".md-editor").resolve("missing_dependencies_report.md"), StandardCharsets.UTF_8);
    assertTrue(reportMarkdown.contains("- Compile units: 1"));
    String reportJson = Files.readString(vault.resolve(".md-editor").resolve("missing_dependencies_report.json"), StandardCharsets.UTF_8);
    assertTrue(reportJson.contains("\"compileUnits\""));
    assertTrue(reportJson.contains("\"id\": \"root\""));
    assertTrue(reportJson.contains("\"origin\": \"root_scan\""));
    assertTrue(reportJson.contains("\"scope\": \"mixed\""));
    assertTrue(reportJson.contains("\"resourceRootCount\": 0"));
    assertFalse(Files.exists(vault.resolve("missing_dependencies_report.md")));
    assertFalse(Files.exists(vault.resolve("missing_dependencies_report.json")));
  }

  @Test
  void writesStructuredReportAndUnresolvedDependencySection() throws Exception {
    Path project = temp.resolve("missing-import-project");
    Path vault = temp.resolve("missing-import-vault");
    write(project, "src/app/Main.java", """
        package app;
        import missing.Client;
        import java.util.List;
        import javax.xml.parsers.DocumentBuilderFactory;
        import org.ietf.jgss.GSSContext;
        import org.w3c.dom.Document;
        import org.xml.sax.SAXException;
        import static app.FreeFormConstants.*;
        import static javax.xml.XMLConstants.XML_NS_PREFIX;
        import static missing.StaticOwner.*;
        public class Main {
          Client client;
          List<String> names;
          Document document;
          DocumentBuilderFactory factory;
          GSSContext context;
          SAXException saxException;
          String namespacePrefix = XML_NS_PREFIX;
          int freeFormStatus = FREE_FORM_STATUS;
          int missingStaticStatus = MISSING_STATIC_STATUS;
        }
        """);
    write(project, "src/app/FreeFormConstants.java",
        "package app; public interface FreeFormConstants { int FREE_FORM_STATUS = 6; }\n");

    int exitCode = new CommandLine(new Main()).execute(
        "--root", project.toString(),
        "--vault", vault.toString()
    );

    assertEquals(0, exitCode);
    String markdown = Files.readString(vault.resolve("src/app/Main.java.md"), StandardCharsets.UTF_8);
    assertTrue(markdown.contains("## Unresolved Dependencies"));
    assertTrue(markdown.contains("`missing.Client`"));
    assertDependency(markdown, "src/app/FreeFormConstants.java");
    assertFalse(markdown.contains("`java.util.List`"));

    String report = Files.readString(vault.resolve(".md-editor").resolve("missing_dependencies_report.json"), StandardCharsets.UTF_8);
    String normalizedReport = report.replace("\r\n", "\n");
    assertTrue(normalizedReport.contains("\n  \"schemaVersion\": 1"));
    assertTrue(normalizedReport.contains("\n  \"generator\": \"java_converter\""));
    assertTrue(normalizedReport.contains("\n  \"language\": \"java\""));
    assertTrue(report.contains("\"unresolvedDependencies\""));
    assertTrue(report.contains("\"externalDependencies\""));
    assertTrue(report.contains("\"symbol\": \"missing.Client\""));
    assertTrue(report.contains("\"symbol\": \"missing.StaticOwner\""));
    assertTrue(report.contains("\"kind\": \"static-owner\""));
    assertTrue(report.contains("\"staticImport\": true"));
    assertTrue(report.contains("\"wildcard\": true"));
    assertFalse(report.contains("\"symbol\": \"app.FreeFormConstants.*\""));
    assertFalse(report.contains("\"symbol\": \"missing.StaticOwner.*\""));
    assertFalse(report.contains("\"symbol\": \"java.util.List\""));
    assertFalse(report.contains("\"symbol\": \"javax.xml.parsers.DocumentBuilderFactory\""));
    assertFalse(report.contains("\"symbol\": \"javax.xml.XMLConstants\""));
    assertFalse(report.contains("\"symbol\": \"org.ietf.jgss.GSSContext\""));
    assertFalse(report.contains("\"symbol\": \"org.w3c.dom.Document\""));
    assertFalse(report.contains("\"symbol\": \"org.xml.sax.SAXException\""));
    assertFalse(report.contains("\"schemaVersion\":1"));
    assertTrue(normalizedReport.contains("\n  \"sources\": ["));
    assertTrue(normalizedReport.contains("\n  \"compileUnits\": ["));
  }

  @Test
  void reportIncludesMultipleCompileUnitsAndResourceRootCounts() throws Exception {
    Path project = temp.resolve("report-source-set-project");
    Path vault = temp.resolve("report-source-set-vault");
    write(project, "src/main/java/app/Main.java", "package app; public class Main {}\n");
    write(project, "src/main/resources/app.properties", "name=main\n");
    write(project, "src/test/java/app/MainTest.java", "package app; public class MainTest {}\n");
    write(project, "src/test/resources/test.properties", "name=test\n");

    int exitCode = new CommandLine(new Main()).execute(
        "--root", project.toString(),
        "--vault", vault.toString()
    );

    assertEquals(0, exitCode);
    String markdown = Files.readString(vault.resolve(".md-editor").resolve("missing_dependencies_report.md"), StandardCharsets.UTF_8);
    assertTrue(markdown.contains("- Compile units: 2"));
    assertTrue(markdown.contains("## Performance"));
    assertTrue(markdown.contains("- Total run: "));
    String report = Files.readString(vault.resolve(".md-editor").resolve("missing_dependencies_report.json"), StandardCharsets.UTF_8);
    assertTrue(report.contains("\"id\": \"sourceset:src/main/java\""));
    assertTrue(report.contains("\"id\": \"sourceset:src/test/java\""));
    assertTrue(report.contains("\"resourceRootCount\": 1"));
    assertTrue(report.contains("\"performance\""));
    assertTrue(report.contains("\"totalRunMillis\""));
  }

  @Test
  void reportIncludesMavenCompileUnitMetadata() throws Exception {
    Path project = temp.resolve("report-maven-project");
    Path vault = temp.resolve("report-maven-vault");
    write(project, "pom.xml", """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <groupId>app</groupId>
          <artifactId>report-maven</artifactId>
          <version>1.0.0</version>
        </project>
        """);
    write(project, "src/main/java/app/Main.java", "package app; public class Main {}\n");
    write(project, "src/main/resources/app.properties", "name=main\n");

    int exitCode = new CommandLine(new Main()).execute(
        "--root", project.toString(),
        "--vault", vault.toString()
    );

    assertEquals(0, exitCode);
    String report = Files.readString(vault.resolve(".md-editor").resolve("missing_dependencies_report.json"), StandardCharsets.UTF_8);
    assertTrue(report.contains("\"id\": \"maven:.:main\""));
    assertTrue(report.contains("\"origin\": \"maven\""));
    assertTrue(report.contains("\"descriptorPath\": \"" + project.resolve("pom.xml").toString().replace("\\", "\\\\") + "\""));
    assertTrue(report.contains("\"resourceRootCount\": 1"));
    assertTrue(report.contains("\"dependencyUnitIds\": []"));
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
    String report = Files.readString(vault.resolve(".md-editor").resolve("missing_dependencies_report.md"), StandardCharsets.UTF_8);
    assertTrue(report.contains("simulated javac crash"));
  }

  @Test
  void skipsPerFileRetryWhenCompilerHitsInternalAssertion() throws Exception {
    Path project = temp.resolve("javac-assertion-project");
    Path vault = temp.resolve("javac-assertion-vault");
    write(project, "src/app/First.java", "package app; public class First {}\n");
    int[] analyzeCalls = new int[1];

    JavaDependencyAnalyzer analyzer = new JavaDependencyAnalyzer() {
      @Override
      protected void analyzeParsedTask(JavacTask task) {
        analyzeCalls[0] += 1;
        throw new IllegalStateException(new AssertionError("simulated javac assertion"));
      }
    };

    int exitCode = Main.run(
        new String[]{"--root", project.toString(), "--vault", vault.toString()},
        analyzer
    );

    assertEquals(0, exitCode);
    assertEquals(1, analyzeCalls[0], "internal javac assertion should skip per-file retry");
    String first = Files.readString(vault.resolve("src/app/First.java.md"), StandardCharsets.UTF_8);
    assertTrue(first.contains("analysis_status: parse_only"));
    String report = Files.readString(vault.resolve(".md-editor").resolve("missing_dependencies_report.md"), StandardCharsets.UTF_8);
    assertTrue(report.contains("parse-only Java analysis"));
  }

  @Test
  void internalJavacAssertionFallbackIsScopedToCurrentCompileUnit() throws Exception {
    Path project = temp.resolve("javac-assertion-source-set-project");
    Path vault = temp.resolve("javac-assertion-source-set-vault");
    write(project, "src/main/java/app/Main.java", "package app; public class Main {}\n");
    write(project, "src/test/java/app/MainTest.java", "package app; public class MainTest { Main main; }\n");
    int[] analyzeCalls = new int[1];

    JavaDependencyAnalyzer analyzer = new JavaDependencyAnalyzer() {
      @Override
      protected void analyzeParsedTask(JavacTask task) throws IOException {
        analyzeCalls[0] += 1;
        if (analyzeCalls[0] == 1) {
          throw new IllegalStateException(new AssertionError("simulated javac assertion"));
        }
        super.analyzeParsedTask(task);
      }
    };

    int exitCode = Main.run(
        new String[]{"--root", project.toString(), "--vault", vault.toString()},
        analyzer
    );

    assertEquals(0, exitCode);
    assertEquals(2, analyzeCalls[0], "later compile units should still attempt compiler attribution");
    String main = Files.readString(vault.resolve("src/main/java/app/Main.java.md"), StandardCharsets.UTF_8);
    assertTrue(main.contains("analysis_status: parse_only"));
    String test = Files.readString(vault.resolve("src/test/java/app/MainTest.java.md"), StandardCharsets.UTF_8);
    assertTrue(test.contains("analysis_status: analyzed"), "fallback should not leak into the test source set\n" + test);
  }

  @Test
  void internalJavacFailureCanBeBisectedToSingleFile() throws Exception {
    Path project = temp.resolve("javac-bisect-project");
    Path vault = temp.resolve("javac-bisect-vault");
    write(project, "src/app/Alpha.java", "package app; public class Alpha { Gamma gamma; }\n");
    write(project, "src/app/Bad.java", "package app; public class Bad {}\n");
    write(project, "src/app/Gamma.java", "package app; public class Gamma {}\n");
    write(project, "src/app/Omega.java", "package app; public class Omega {}\n");

    JavaDependencyAnalyzer analyzer = new JavaDependencyAnalyzer() {
      @Override
      protected void analyzeParsedTask(JavacTask task, List<Path> chunk) throws IOException {
        if (chunk.stream().anyMatch(path -> path.getFileName().toString().equals("Bad.java"))) {
          throw new IllegalStateException(new AssertionError("simulated javac assertion"));
        }
        super.analyzeParsedTask(task, chunk);
      }
    };

    int exitCode = Main.run(
        new String[]{"--root", project.toString(), "--vault", vault.toString(), "--batch-size", "4",
            "--javac-error-isolation", "bisect"},
        analyzer
    );

    assertEquals(0, exitCode);
    String alpha = Files.readString(vault.resolve("src/app/Alpha.java.md"), StandardCharsets.UTF_8);
    String bad = Files.readString(vault.resolve("src/app/Bad.java.md"), StandardCharsets.UTF_8);
    String gamma = Files.readString(vault.resolve("src/app/Gamma.java.md"), StandardCharsets.UTF_8);
    assertTrue(alpha.contains("analysis_status: analyzed"), "neighbour before failing file should be analyzed\n" + alpha);
    assertDependency(alpha, "src/app/Gamma.java");
    assertTrue(bad.contains("analysis_status: parse_only"), "isolated failing file should be parse-only\n" + bad);
    assertTrue(gamma.contains("analysis_status: analyzed"), "neighbour after failing file should be analyzed\n" + gamma);
    String report = Files.readString(vault.resolve(".md-editor").resolve("missing_dependencies_report.md"), StandardCharsets.UTF_8);
    assertTrue(report.contains("Isolated internal javac failure"));
    assertFalse(report.contains("javac internal errors were already detected earlier"));
  }

  @Test
  void internalJavacFailureDoesNotMakeLaterBatchesParseOnlyInBisectMode() throws Exception {
    Path project = temp.resolve("javac-bisect-later-batches-project");
    Path vault = temp.resolve("javac-bisect-later-batches-vault");
    write(project, "src/app/Alpha.java", "package app; public class Alpha {}\n");
    write(project, "src/app/Bad.java", "package app; public class Bad {}\n");
    write(project, "src/app/Charlie.java", "package app; public class Charlie { Delta delta; }\n");
    write(project, "src/app/Delta.java", "package app; public class Delta {}\n");
    write(project, "src/app/Echo.java", "package app; public class Echo {}\n");

    JavaDependencyAnalyzer analyzer = new JavaDependencyAnalyzer() {
      @Override
      protected void analyzeParsedTask(JavacTask task, List<Path> chunk) throws IOException {
        if (chunk.stream().anyMatch(path -> path.getFileName().toString().equals("Bad.java"))) {
          throw new IllegalStateException(new AssertionError("simulated javac assertion"));
        }
        super.analyzeParsedTask(task, chunk);
      }
    };

    int exitCode = Main.run(
        new String[]{"--root", project.toString(), "--vault", vault.toString(), "--batch-size", "2",
            "--javac-error-isolation", "bisect"},
        analyzer
    );

    assertEquals(0, exitCode);
    String bad = Files.readString(vault.resolve("src/app/Bad.java.md"), StandardCharsets.UTF_8);
    String charlie = Files.readString(vault.resolve("src/app/Charlie.java.md"), StandardCharsets.UTF_8);
    assertTrue(bad.contains("analysis_status: parse_only"), "failing file should be isolated\n" + bad);
    assertTrue(charlie.contains("analysis_status: analyzed"), "later batch should still use attribution\n" + charlie);
    assertDependency(charlie, "src/app/Delta.java");
  }

  @Test
  void internalJavacFailureUsesBatchParseOnlyModeByDefault() throws Exception {
    Path project = temp.resolve("javac-default-internal-fallback-project");
    Path vault = temp.resolve("javac-default-internal-fallback-vault");
    write(project, "src/app/First.java", "package app; public class First {}\n");
    write(project, "src/app/Second.java", "package app; public class Second {}\n");
    int[] analyzeCalls = new int[1];

    JavaDependencyAnalyzer analyzer = new JavaDependencyAnalyzer() {
      @Override
      protected void analyzeParsedTask(JavacTask task, List<Path> chunk) throws IOException {
        analyzeCalls[0] += 1;
        if (analyzeCalls[0] == 1) {
          throw new IllegalStateException(new AssertionError("simulated javac assertion"));
        }
        super.analyzeParsedTask(task, chunk);
      }
    };

    int exitCode = Main.run(
        new String[]{"--root", project.toString(), "--vault", vault.toString(), "--batch-size", "1"},
        analyzer
    );

    assertEquals(0, exitCode);
    String first = Files.readString(vault.resolve("src/app/First.java.md"), StandardCharsets.UTF_8);
    String second = Files.readString(vault.resolve("src/app/Second.java.md"), StandardCharsets.UTF_8);
    assertTrue(first.contains("analysis_status: parse_only"));
    assertTrue(second.contains("analysis_status: parse_only"),
        "default mode should turn remaining batches in the compile unit parse-only\n" + second);
    String report = Files.readString(vault.resolve(".md-editor").resolve("missing_dependencies_report.md"), StandardCharsets.UTF_8);
    assertTrue(report.contains("javac internal errors were already detected earlier"));
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
    String report = Files.readString(vault.resolve(".md-editor").resolve("missing_dependencies_report.md"), StandardCharsets.UTF_8);
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
    String report = Files.readString(vault.resolve(".md-editor").resolve("missing_dependencies_report.md"), StandardCharsets.UTF_8);
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

  private static void assertScope(ProjectModel model, String id, CompileUnitScope scope) {
    assertEquals(scope, compileUnit(model, id).scope());
  }

  private static void assertGeneratedRoot(ProjectModel model, String id) {
    CompileUnit unit = compileUnit(model, id);
    assertEquals(CompileUnitScope.GENERATED, unit.scope());
    assertEquals(0, unit.sourceRoots().size());
    assertEquals(1, unit.generatedSourceRoots().size());
    assertEquals(unit.root(), unit.generatedSourceRoots().get(0));
  }

  private static CompileUnit compileUnit(ProjectModel model, String id) {
    return model.compileUnits().stream()
        .filter(unit -> unit.id().equals(id))
        .findFirst()
        .orElseThrow(() -> new AssertionError("Missing compile unit " + id + " in "
            + model.compileUnits().stream().map(CompileUnit::id).toList()));
  }

  private static String captureOutput(ThrowingRunnable action) throws Exception {
    PrintStream originalOut = System.out;
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    try (PrintStream capture = new PrintStream(output, true, StandardCharsets.UTF_8)) {
      System.setOut(capture);
      action.run();
    } finally {
      System.setOut(originalOut);
    }
    return output.toString(StandardCharsets.UTF_8);
  }

  private static void assertDependency(String markdown, String relativeSource) {
    assertTrue(markdown.contains("(" + relativeSource + ")"), "Missing dependency " + relativeSource + "\n" + markdown);
    String fileName = Path.of(relativeSource).getFileName().toString();
    assertTrue(markdown.contains("[" + fileName + "]") && markdown.contains(fileName + ".md) (" + relativeSource + ")"),
        "Dependency should link to generated Markdown for " + relativeSource + "\n" + markdown);
  }

  private static SourceFileModel sourceModel(AnalysisResult result, Path sourceFile) {
    Path normalized = sourceFile.toAbsolutePath().normalize();
    return result.sources().stream()
        .filter(source -> source.file.equals(normalized))
        .findFirst()
        .orElseThrow(() -> new AssertionError("Missing source model for " + normalized));
  }

  private static String childPom(String parentGroupId, String parentArtifactId, String artifactId, String body) {
    return """
        <project xmlns="http://maven.apache.org/POM/4.0.0">
          <modelVersion>4.0.0</modelVersion>
          <parent>
            <groupId>%s</groupId>
            <artifactId>%s</artifactId>
            <version>1.0.0</version>
          </parent>
          <artifactId>%s</artifactId>
        %s
        </project>
        """.formatted(parentGroupId, parentArtifactId, artifactId, body);
  }

  private static void write(Path root, String relative, String content) throws IOException {
    Path file = root.resolve(relative);
    Files.createDirectories(file.getParent());
    Files.writeString(file, content, StandardCharsets.UTF_8);
  }

  private static void write(Path file, String content) throws IOException {
    Files.createDirectories(file.getParent());
    Files.writeString(file, content, StandardCharsets.UTF_8);
  }

  private static Path writeFailingGradleWrapper(Path project) throws IOException {
    if (isWindows()) {
      write(project, "gradlew.bat", """
          @echo off
          echo =======================================
          echo simulated Gradle metadata failure
          exit /b 1
          """);
      return project.resolve("gradlew.bat").toAbsolutePath().normalize();
    }
    Path wrapper = project.resolve("gradlew");
    write(project, "gradlew", """
        #!/bin/sh
        echo '======================================='
        echo 'simulated Gradle metadata failure'
        exit 1
        """);
    wrapper.toFile().setExecutable(true);
    return wrapper.toAbsolutePath().normalize();
  }

  private static void writeGradleWrapper(Path project, String... metadataLines) throws IOException {
    if (isWindows()) {
      write(project, "gradlew.bat", gradleBatchScript(metadataLines));
      return;
    }
    Path wrapper = project.resolve("gradlew");
    write(project, "gradlew", gradleShellScript(metadataLines));
    wrapper.toFile().setExecutable(true);
  }

  private static Path writeGradleExecutable(Path executable, String... metadataLines) throws IOException {
    Path script = isWindows() ? executable.resolveSibling(executable.getFileName() + ".bat") : executable;
    Files.createDirectories(script.getParent());
    Files.writeString(script, isWindows() ? gradleBatchScript(metadataLines) : gradleShellScript(metadataLines),
        StandardCharsets.UTF_8);
    script.toFile().setExecutable(true);
    return script.toAbsolutePath().normalize();
  }

  private static Path writeGradleExecutableRequiringUserHome(Path executable, String... metadataLines)
      throws IOException {
    Path script = isWindows() ? executable.resolveSibling(executable.getFileName() + ".bat") : executable;
    Files.createDirectories(script.getParent());
    String content = isWindows()
        ? gradleUserHomeCheckingBatchScript(metadataLines)
        : gradleUserHomeCheckingShellScript(metadataLines);
    Files.writeString(script, content, StandardCharsets.UTF_8);
    script.toFile().setExecutable(true);
    return script.toAbsolutePath().normalize();
  }

  private static String gradleBatchScript(String... metadataLines) {
    StringBuilder script = new StringBuilder("@echo off\n");
    script.append("echo MD_EDITOR_GRADLE_METADATA_V1\n");
    for (String line : metadataLines) {
      script.append("echo ").append(line.replace("\t", "\\t")).append("\n");
    }
    script.append("echo MD_EDITOR_GRADLE_METADATA_END\n");
    script.append("exit /b 0\n");
    return script.toString();
  }

  private static String gradleUserHomeCheckingBatchScript(String... metadataLines) {
    StringBuilder script = new StringBuilder("@echo off\n");
    script.append("if \"%GRADLE_USER_HOME%\"==\"\" exit /b 2\n");
    script.append("echo MD_EDITOR_GRADLE_METADATA_V1\n");
    for (String line : metadataLines) {
      script.append("echo ").append(line.replace("\t", "\\t")).append("\n");
    }
    script.append("echo MD_EDITOR_GRADLE_METADATA_END\n");
    script.append("exit /b 0\n");
    return script.toString();
  }

  private static String gradleShellScript(String... metadataLines) {
    StringBuilder script = new StringBuilder("#!/bin/sh\n");
    script.append("echo 'MD_EDITOR_GRADLE_METADATA_V1'\n");
    for (String line : metadataLines) {
      script.append("echo '").append(line).append("'\n");
    }
    script.append("echo 'MD_EDITOR_GRADLE_METADATA_END'\n");
    script.append("exit 0\n");
    return script.toString();
  }

  private static String gradleUserHomeCheckingShellScript(String... metadataLines) {
    StringBuilder script = new StringBuilder("#!/bin/sh\n");
    script.append("if [ -z \"$GRADLE_USER_HOME\" ]; then exit 2; fi\n");
    script.append("echo 'MD_EDITOR_GRADLE_METADATA_V1'\n");
    for (String line : metadataLines) {
      script.append("echo '").append(line).append("'\n");
    }
    script.append("echo 'MD_EDITOR_GRADLE_METADATA_END'\n");
    script.append("exit 0\n");
    return script.toString();
  }

  private static String gradleMetadataLine(
      String projectPath,
      Path projectDir,
      Path buildFile,
      String sourceSetName,
      List<Path> sourceRoots,
      List<Path> generatedSourceRoots,
      List<Path> resourceRoots,
      List<Path> sourceFiles,
      List<Path> classpathEntries,
      List<String> projectDependencies,
      String release,
      String source,
      String target,
      String encoding
  ) {
    return "UNIT\t" + String.join("\t", List.of(
        b64(projectPath),
        b64(projectDir.toAbsolutePath().normalize().toString()),
        b64(buildFile.toAbsolutePath().normalize().toString()),
        b64(sourceSetName),
        b64(paths(sourceRoots)),
        b64(paths(generatedSourceRoots)),
        b64(paths(resourceRoots)),
        b64(paths(sourceFiles)),
        b64(paths(classpathEntries)),
        b64(String.join("\n", projectDependencies)),
        b64(release),
        b64(source),
        b64(target),
        b64(encoding),
        b64("")
    ));
  }

  private static String paths(List<Path> paths) {
    return paths.stream()
        .map(path -> path.toAbsolutePath().normalize().toString())
        .sorted()
        .reduce((left, right) -> left + "\n" + right)
        .orElse("");
  }

  private static String b64(String value) {
    return Base64.getEncoder().encodeToString((value == null ? "" : value).getBytes(StandardCharsets.UTF_8));
  }

  private static boolean isWindows() {
    return System.getProperty("os.name", "").toLowerCase(java.util.Locale.ROOT).contains("win");
  }

  private static void writeEmptyMavenWrapper(Path project) throws IOException {
    if (isWindows()) {
      write(project, "mvnw.cmd", """
          @echo off
          set "OUT="
          :loop
          if "%~1"=="" goto done
          set "ARG=%~1"
          if not "%ARG:-Dmdep.outputFile=%"=="%ARG%" set "OUT=%ARG:-Dmdep.outputFile=%"
          shift
          goto loop
          :done
          type nul > "%OUT%"
          exit /b 0
          """);
      return;
    }
    write(project, "mvnw", """
        #!/bin/sh
        out=""
        for arg in "$@"; do
          case "$arg" in
            -Dmdep.outputFile=*) out="${arg#-Dmdep.outputFile=}" ;;
          esac
        done
        : > "$out"
        exit 0
        """);
    project.resolve("mvnw").toFile().setExecutable(true);
  }

  private static void writeNoisyFailingMavenWrapper(Path project) throws IOException {
    if (isWindows()) {
      write(project, "mvnw.cmd", """
          @echo off
          for /L %%i in (1,1,10000) do echo simulated Maven dependency resolution failure %%i
          exit /b 1
          """);
      return;
    }
    write(project, "mvnw", """
        #!/bin/sh
        i=1
        while [ "$i" -le 10000 ]; do
          echo "simulated Maven dependency resolution failure $i"
          i=$((i + 1))
        done
        exit 1
        """);
    project.resolve("mvnw").toFile().setExecutable(true);
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

    Path jar = project.resolve("lib/external-lib.jar");
    try (JarOutputStream output = new JarOutputStream(Files.newOutputStream(jar))) {
      Path classFile = classes.resolve("external/ExternalType.class");
      output.putNextEntry(new JarEntry("external/ExternalType.class"));
      Files.copy(classFile, output);
      output.closeEntry();
    }
  }

  @FunctionalInterface
  private interface ThrowingRunnable {
    void run() throws Exception;
  }
}
