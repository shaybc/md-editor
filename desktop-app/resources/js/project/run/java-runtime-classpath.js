// Runtime classpath resolution for Standard Java, Maven, and Gradle projects.
(function(global) {
  "use strict";

  /**
   * Register Java runtime classpath resolution.
   * @param {object} app Application module registry.
   * @param {object} deps Build-path, build-tool, runtime, and filesystem dependencies.
   * @returns {object} Runtime classpath API.
   */
  function registerMarkdownViewerJavaRuntimeClasspath(app, deps = {}) {
    const CLASSPATH_MARKER = "MD_EDITOR_RUNTIME_CLASSPATH=";

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      const base = normalizePath(parent);
      const value = normalizePath(child);
      if (/^[A-Za-z]:\//.test(value) || value.startsWith("/")) return value;
      return `${base}/${value.replace(/^\/+/, "")}`;
    }

    function separator() {
      return String(deps.osName || global.NL_OS || "Windows").toLowerCase() === "windows" ? ";" : ":";
    }

    function unique(values) {
      return Array.from(new Set((values || []).map(normalizePath).filter(Boolean)));
    }

    function getFilesystem() {
      return (deps.Neutralino || global.Neutralino)?.filesystem || null;
    }

    function getOperatingSystem() {
      return (deps.Neutralino || global.Neutralino)?.os || null;
    }

    async function removeFile(path) {
      try {
        await getFilesystem()?.remove?.(path);
      } catch (_error) {
        // Temporary resolver files are already clean when they do not exist.
      }
    }

    async function createMetadataDirectory(projectPath) {
      try {
        await getFilesystem()?.createDirectory?.(joinPath(projectPath, ".md-editor"));
      } catch (_error) {
        // Existing metadata directories are valid.
      }
    }

    function applyJavaEnvironment(command, runtime) {
      return deps.projectRuntime?.applyToCommand?.(command, runtime, deps.osName || global.NL_OS) || command;
    }

    async function runInspection(command, cwd, runtime) {
      const result = await getOperatingSystem()?.execCommand?.(applyJavaEnvironment(command, runtime), { cwd });
      if (Number(result?.exitCode) !== 0) {
        const error = new Error(result?.stdErr || result?.stdOut || "Runtime classpath resolution failed.");
        error.result = result;
        throw error;
      }
      return String(result?.stdOut || "") + String(result?.stdErr || "");
    }

    async function resolveStandardClasspath(projectPath, configuration) {
      const profile = configuration.javacProfile || {};
      const output = deps.compiler?.resolveStoredPath?.(
        projectPath,
        profile.outputMode === "classes" ? profile.outputPath || "classes" : profile.sourceFolders?.[0] || configuration.sourceFolders?.[0] || "classes"
      );
      const entries = (deps.buildPath?.getOrderedLibraryEntries?.(configuration) || [])
        .map((entry) => deps.buildPath.resolveStoredPath(projectPath, entry.path));
      return unique([output, ...entries]);
    }

    async function resolveMavenClasspath(projectPath, configuration, runtime, modulePath) {
      const targetPath = joinPath(projectPath, modulePath || "");
      const detected = await deps.mavenDetection.detectProjectForTarget(projectPath, targetPath, deps.osName);
      if (!detected?.hasPom) throw new Error("A Maven project is required to resolve the Java runtime classpath.");
      await createMetadataDirectory(detected.projectRoot);
      const outputPath = joinPath(detected.projectRoot, `.md-editor/run-maven-classpath-${Date.now()}.txt`);
      const relativeOutput = `.md-editor/${normalizePath(outputPath).split("/").pop()}`;
      const command = deps.mavenCommand.buildGoalsCommand({
        runner: detected.runner,
        commandLine: `-q dependency:build-classpath -Dmdep.outputAbsoluteArtifactFilename=true -Dmdep.outputFile="${relativeOutput}"`
      });
      try {
        await runInspection(command, detected.projectRoot, runtime);
        const dependencyText = await getFilesystem()?.readFile?.(outputPath) || "";
        return {
          entries: unique([joinPath(detected.projectRoot, "target/classes"), ...String(dependencyText).trim().split(separator())]),
          mavenProject: detected
        };
      } finally {
        await removeFile(outputPath);
      }
    }

    function createGradleInitScript() {
      return [
        "allprojects { project ->",
        "  def taskName = 'mdEditorPrintRuntimeClasspath'",
        "  if (project.tasks.findByName(taskName) == null) {",
        "    project.tasks.register(taskName) {",
        "      doLast {",
        "        def sourceSets = project.extensions.findByName('sourceSets')",
        "        if (sourceSets == null) throw new GradleException('Java source sets are unavailable for ' + project.path)",
        `        println '${CLASSPATH_MARKER}' + sourceSets.main.runtimeClasspath.asPath`,
        "      }",
        "    }",
        "  }",
        "}"
      ].join("\n") + "\n";
    }

    async function resolveGradleClasspath(projectPath, configuration, runtime, gradlePath) {
      const detected = await deps.gradleDetection.detectProject(
        projectPath,
        deps.osName,
        configuration.sourceFolders,
        deps.getGradleLauncherSettings?.(configuration.gradle) || {}
      );
      if (!detected?.hasGradleProject) throw new Error("A Gradle project is required to resolve the Java runtime classpath.");
      if (detected.runnerError) throw new Error(detected.runnerError);
      await createMetadataDirectory(projectPath);
      const initPath = joinPath(projectPath, `.md-editor/run-gradle-classpath-${Date.now()}.gradle`);
      await getFilesystem()?.writeFile?.(initPath, createGradleInitScript());
      const normalizedProjectPath = String(gradlePath || "").trim().replace(/^:+|:+$/g, "");
      const task = normalizedProjectPath ? `:${normalizedProjectPath}:mdEditorPrintRuntimeClasspath` : "mdEditorPrintRuntimeClasspath";
      const options = detected.launcherSettings || {};
      const parts = [detected.runner, "--console=plain", "--no-daemon"];
      if (options.offline === true) parts.push("--offline");
      if (options.userHome) parts.push("--gradle-user-home", `"${options.userHome}"`);
      parts.push("--init-script", `"${initPath}"`, task);
      try {
        const output = await runInspection(parts.join(" "), detected.projectRoot, runtime);
        const line = output.split(/\r?\n/).find((value) => value.startsWith(CLASSPATH_MARKER));
        if (!line) throw new Error("Gradle did not report the main runtime classpath.");
        return {
          entries: unique(line.slice(CLASSPATH_MARKER.length).split(separator())),
          gradleProject: detected
        };
      } finally {
        await removeFile(initPath);
      }
    }

    /**
     * Resolve the effective runtime classpath for one Java Application configuration.
     * @param {string} projectPath Open project root.
     * @param {object} runConfiguration Java Application configuration.
     * @param {object} buildConfiguration Java Build Path configuration.
     * @param {object} runtime Resolved project JDK runtime.
     * @returns {Promise<object>} Classpath string, entries, and detected build-tool context.
     */
    async function resolve(projectPath, runConfiguration, buildConfiguration, runtime) {
      const override = String(runConfiguration.java?.classpathOverride || "").trim();
      if (override) return { classpath: override, entries: override.split(separator()) };
      const buildSystem = String(buildConfiguration.buildSystem || "javac");
      let result;
      if (buildSystem === "maven") {
        result = await resolveMavenClasspath(projectPath, buildConfiguration, runtime, runConfiguration.java?.modulePath);
      } else if (buildSystem === "gradle") {
        result = await resolveGradleClasspath(projectPath, buildConfiguration, runtime, runConfiguration.java?.modulePath);
      } else {
        result = { entries: await resolveStandardClasspath(projectPath, buildConfiguration) };
      }
      return { ...result, classpath: unique(result.entries).join(separator()) };
    }

    const api = { CLASSPATH_MARKER, createGradleInitScript, resolve };
    app.registerModule?.("javaRuntimeClasspath", api);
    return api;
  }

  global.registerMarkdownViewerJavaRuntimeClasspath = registerMarkdownViewerJavaRuntimeClasspath;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJavaRuntimeClasspath };
  }
})(typeof window !== "undefined" ? window : globalThis);
