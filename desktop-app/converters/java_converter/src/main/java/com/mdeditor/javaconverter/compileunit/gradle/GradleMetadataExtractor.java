package com.mdeditor.javaconverter.compileunit.gradle;

import com.mdeditor.javaconverter.GradleDiscoveryOptions;
import com.mdeditor.javaconverter.ConversionClock;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

final class GradleMetadataExtractor {
  private static final int MAX_GRADLE_OUTPUT_BYTES = 64 * 1024 * 1024;
  private static final Duration GRADLE_TIMEOUT = Duration.ofMinutes(10);

  private GradleMetadataExtractor() {
  }

  static GradleMetadataRun extract(Path root, GradleDiscoveryOptions options) throws IOException {
    Path initScript = Files.createTempFile("md-editor-gradle-metadata", ".gradle");
    try {
      Files.writeString(initScript, initScript(), StandardCharsets.UTF_8);
      List<String> attemptedLaunchers = new ArrayList<>();
      List<String> attemptFailures = new ArrayList<>();
      boolean explicitLauncher = options.gradleExecutable() != null;
      for (String launcher : launchers(root, options)) {
        attemptedLaunchers.add(launcher);
        ConversionClock.log("Trying Gradle metadata launcher: " + launcher);
        if (options.userHome() != null) {
          ConversionClock.log("Using Gradle user home: " + options.userHome());
        }
        List<String> command = command(launcher, initScript, options);
        GradleProcessResult result = run(root, command, options);
        if (!result.started()) {
          String failure = "Could not start Gradle launcher " + launcher + ": " + outputExcerpt(result.output());
          ConversionClock.log("Gradle metadata launcher failed: " + failure);
          attemptFailures.add(failure);
          continue;
        }
        if (!result.finished()) {
          String failure = "Timed out while asking Gradle for Java metadata using " + launcher
              + outputExcerpt(result.output());
          ConversionClock.log("Gradle metadata launcher failed: " + failure);
          attemptFailures.add(failure);
          if (explicitLauncher) {
            return GradleMetadataRun.failure(failure, launcher, attemptedLaunchers);
          }
          continue;
        }
        if (result.exitCode() != 0) {
          String failure = "Gradle metadata extraction failed using " + launcher
              + " (exit " + result.exitCode() + ")" + outputExcerpt(result.output());
          ConversionClock.log("Gradle metadata launcher failed: " + failure);
          attemptFailures.add(failure);
          if (explicitLauncher) {
            return GradleMetadataRun.failure(failure, launcher, attemptedLaunchers);
          }
          continue;
        }
        try {
          List<GradleMetadataRecord> records = GradleMetadataParser.parse(result.output());
          if (records.isEmpty()) {
            String failure = "Gradle metadata extraction returned no Java source sets using " + launcher
                + outputExcerpt(result.output());
            ConversionClock.log("Gradle metadata launcher failed: " + failure);
            attemptFailures.add(failure);
            if (explicitLauncher) {
              return GradleMetadataRun.failure(failure, launcher, attemptedLaunchers);
            }
            continue;
          }
          return GradleMetadataRun.success(records, launcher, attemptedLaunchers);
        } catch (IllegalArgumentException error) {
          String failure = "Gradle metadata output was invalid using " + launcher + ": " + error.getMessage()
              + outputExcerpt(result.output());
          ConversionClock.log("Gradle metadata launcher failed: " + failure);
          attemptFailures.add(failure);
          if (explicitLauncher) {
            return GradleMetadataRun.failure(failure, launcher, attemptedLaunchers);
          }
        }
      }
      return GradleMetadataRun.failure(
          "Could not extract Gradle Java metadata."
              + "\nGradle launchers tried: " + String.join(", ", attemptedLaunchers)
              + "\nGradle launcher failures:\n- " + String.join("\n- ", attemptFailures),
          "",
          attemptedLaunchers
      );
    } finally {
      Files.deleteIfExists(initScript);
    }
  }

  private static List<String> launchers(Path root, GradleDiscoveryOptions options) {
    List<String> launchers = new ArrayList<>();
    if (options.gradleExecutable() != null) {
      launchers.add(options.gradleExecutable().toString());
    }
    Path wrapper = root.resolve(isWindows() ? "gradlew.bat" : "gradlew");
    if (Files.isRegularFile(wrapper)) {
      launchers.add(wrapper.toString());
    }
    if (isWindows()) {
      launchers.add("gradle.bat");
    } else {
      launchers.add("gradle");
    }
    return launchers.stream().distinct().toList();
  }

  private static List<String> command(String launcher, Path initScript, GradleDiscoveryOptions options) {
    List<String> command = new ArrayList<>();
    command.add(launcher);
    command.add("-q");
    if (options.offline()) {
      command.add("--offline");
    }
    command.add("--init-script");
    command.add(initScript.toString());
    command.add("mdEditorJavaMetadata");
    return command;
  }

  private static GradleProcessResult run(Path root, List<String> command, GradleDiscoveryOptions options) {
    Path processOutput = null;
    try {
      processOutput = Files.createTempFile("md-editor-gradle-output", ".log");
      ProcessBuilder processBuilder = new ProcessBuilder(command)
          .directory(root.toFile())
          .redirectErrorStream(true)
          .redirectOutput(processOutput.toFile());
      configureGradleEnvironment(processBuilder, options);
      Process process = processBuilder.start();
      boolean finished = process.waitFor(GRADLE_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
      if (!finished) {
        process.destroyForcibly();
        process.waitFor(Duration.ofSeconds(5).toMillis(), TimeUnit.MILLISECONDS);
        return new GradleProcessResult(true, false, -1, readOutput(processOutput));
      }
      return new GradleProcessResult(true, true, process.exitValue(), readOutput(processOutput));
    } catch (IOException error) {
      return new GradleProcessResult(false, false, -1, error.getMessage());
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      return new GradleProcessResult(true, false, -1, error.getMessage());
    } finally {
      if (processOutput != null) {
        try {
          Files.deleteIfExists(processOutput);
        } catch (IOException ignored) {
          // Windows may keep the redirected stream briefly; the temp file is harmless.
        }
      }
    }
  }

  private static String readOutput(Path output) throws IOException {
    if (output == null || !Files.isRegularFile(output)) {
      return "";
    }
    long outputSize = Files.size(output);
    if (outputSize > MAX_GRADLE_OUTPUT_BYTES) {
      try (InputStream input = Files.newInputStream(output)) {
        return new String(input.readNBytes(MAX_GRADLE_OUTPUT_BYTES), StandardCharsets.UTF_8).trim()
            + System.lineSeparator()
            + "MD_EDITOR_GRADLE_OUTPUT_TRUNCATED after " + MAX_GRADLE_OUTPUT_BYTES + " bytes of "
            + outputSize + " bytes";
      }
    }
    return Files.readString(output, StandardCharsets.UTF_8).trim();
  }

  private static String outputExcerpt(String output) {
    if (output == null || output.isBlank()) {
      return "";
    }
    List<String> lines = output.lines()
        .map(String::trim)
        .filter(line -> !line.isBlank())
        .filter(line -> !line.chars().allMatch(ch -> ch == '=' || ch == '-' || Character.isWhitespace(ch)))
        .filter(line -> !line.equals(GradleMetadataParser.START))
        .filter(line -> !line.equals(GradleMetadataParser.END))
        .limit(12)
        .toList();
    if (lines.isEmpty()) {
      lines = output.lines()
          .map(String::trim)
          .filter(line -> !line.isBlank())
          .limit(12)
          .toList();
    }
    if (lines.isEmpty()) {
      return "";
    }
    return " Output: " + String.join(" / ", lines);
  }

  private static boolean isWindows() {
    return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
  }

  private static void configureGradleEnvironment(ProcessBuilder processBuilder, GradleDiscoveryOptions options) {
    String javaHome = System.getProperty("java.home", "").trim();
    Map<String, String> environment = processBuilder.environment();
    if (!javaHome.isBlank()) {
      environment.put("JAVA_HOME", javaHome);

      Path javaBin = Path.of(javaHome, "bin");
      String pathKey = environment.keySet().stream()
          .filter(key -> key.equalsIgnoreCase("PATH"))
          .findFirst()
          .orElse("PATH");
      String existingPath = environment.getOrDefault(pathKey, "");
      environment.put(pathKey, javaBin + (existingPath.isBlank() ? "" : java.io.File.pathSeparator + existingPath));
    }
    if (options.userHome() != null) {
      environment.put("GRADLE_USER_HOME", options.userHome().toString());
    }
  }

  private static String initScript() {
    return """
        import java.util.Base64
        import org.gradle.api.artifacts.ProjectDependency
        import org.gradle.api.tasks.SourceSetContainer
        import org.gradle.api.tasks.compile.JavaCompile

        gradle.rootProject { metadataRootProject ->
          metadataRootProject.tasks.register('mdEditorJavaMetadata') {
            doLast {
              def diagnostics = []
              def enc = { value ->
                Base64.encoder.encodeToString(((value == null) ? '' : value.toString()).getBytes('UTF-8'))
              }
              def diag = { message ->
                diagnostics.add(message == null ? '' : message.toString())
              }
              def safe = { label, fallback, action ->
                try {
                  def value = action()
                  return value == null ? fallback : value
                } catch (Throwable error) {
                  diag(label + ': ' + error.class.name + ': ' + (error.message ?: ''))
                  return fallback
                }
              }
              def asFiles = { label, value ->
                safe(label, [], {
                  if (value == null) {
                    return []
                  }
                  if (value instanceof File) {
                    return [value]
                  }
                  if (value.respondsTo('getFiles')) {
                    return value.files
                  }
                  if (value instanceof Iterable) {
                    return value.findAll { it instanceof File }
                  }
                  return []
                })
              }
              def joinFiles = { label, files ->
                asFiles(label, files).findAll { it != null }.collect { it.absolutePath }.unique().sort().join('\\n')
              }
              def joinStrings = { values ->
                values.findAll { it != null && it.toString().trim() }.collect { it.toString() }.unique().sort().join('\\n')
              }
              println 'MD_EDITOR_GRADLE_METADATA_V1'
              allprojects.each { p ->
                def sourceSets = p.extensions.findByType(SourceSetContainer)
                if (sourceSets == null) {
                  return
                }
                sourceSets.each { sourceSet ->
                  def compileTask = safe(p.path + ':' + sourceSet.name + ':compileTask', null, {
                    p.tasks.findByName(sourceSet.getCompileJavaTaskName())
                  })
                  def options = compileTask instanceof JavaCompile ? compileTask.options : compileTask?.options
                  def javaExtension = p.extensions.findByName('java')
                  def release = ''
                  release = safe(p.path + ':' + sourceSet.name + ':release', '', {
                    release = options?.release?.present ? options.release.get().toString() : ''
                  })
                  def sourceCompatibility = ''
                  def targetCompatibility = ''
                  def compatibility = safe(p.path + ':' + sourceSet.name + ':javaCompatibility', ['', ''], {
                    sourceCompatibility = javaExtension?.sourceCompatibility?.toString() ?: ''
                    targetCompatibility = javaExtension?.targetCompatibility?.toString() ?: ''
                    return [sourceCompatibility, targetCompatibility]
                  })
                  sourceCompatibility = compatibility[0]
                  targetCompatibility = compatibility[1]
                  def encoding = ''
                  encoding = safe(p.path + ':' + sourceSet.name + ':encoding', '', {
                    encoding = options?.encoding ?: ''
                  })
                  def compilerArgs = []
                  compilerArgs = safe(p.path + ':' + sourceSet.name + ':compilerArgs', [], {
                    compilerArgs = options?.compilerArgs ?: []
                  })
                  def generated = []
                  generated = safe(p.path + ':' + sourceSet.name + ':generatedSources', [], {
                    def generatedDir = options?.generatedSourceOutputDirectory
                    if (generatedDir != null && generatedDir.present) {
                      generated.add(generatedDir.get().asFile)
                    }
                    return generated
                  })
                  def dependencyProjects = []
                  dependencyProjects = safe(p.path + ':' + sourceSet.name + ':projectDependencies', [], {
                    def configuration = p.configurations.findByName(sourceSet.compileClasspathConfigurationName)
                    if (configuration != null) {
                      dependencyProjects = configuration.allDependencies
                        .findAll { it instanceof ProjectDependency }
                        .collect { it.dependencyProject.path }
                    }
                    return dependencyProjects
                  })
                  def sourceFiles = safe(p.path + ':' + sourceSet.name + ':sourceFiles', [], {
                    sourceSet.java.files.findAll { it.name.endsWith('.java') }
                  })
                  def fields = [
                    p.path,
                    p.projectDir.absolutePath,
                    p.buildFile?.absolutePath ?: '',
                    sourceSet.name,
                    joinFiles(p.path + ':' + sourceSet.name + ':sourceRoots', sourceSet.java.srcDirs),
                    joinFiles(p.path + ':' + sourceSet.name + ':generatedSourceRoots', generated),
                    joinFiles(p.path + ':' + sourceSet.name + ':resourceRoots', sourceSet.resources.srcDirs),
                    joinFiles(p.path + ':' + sourceSet.name + ':sourceFiles', sourceFiles),
                    joinFiles(p.path + ':' + sourceSet.name + ':compileClasspath', sourceSet.compileClasspath),
                    joinStrings(dependencyProjects),
                    release,
                    sourceCompatibility,
                    targetCompatibility,
                    encoding,
                    joinStrings(compilerArgs)
                  ]
                  println 'UNIT\\t' + fields.collect(enc).join('\\t')
                }
              }
              diagnostics.unique().sort().take(200).each { diagnostic ->
                println 'DIAG\\t' + enc(diagnostic)
              }
              println 'MD_EDITOR_GRADLE_METADATA_END'
            }
          }
        }
        """;
  }

  private record GradleProcessResult(boolean started, boolean finished, int exitCode, String output) {
  }
}
