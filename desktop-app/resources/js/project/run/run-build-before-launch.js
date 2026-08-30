// Staleness detection and non-interactive compilation before Java launches.
(function(global) {
  "use strict";

  /**
   * Register Java build-before-run orchestration.
   * @param {object} app Application module registry.
   * @param {object} deps Compiler, project-provider, build-tool, terminal, and filesystem dependencies.
   * @returns {object} Build-before-run API.
   */
  function registerMarkdownViewerRunBuildBeforeLaunch(app, deps = {}) {
    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      const base = normalizePath(parent);
      const value = normalizePath(child);
      if (/^[A-Za-z]:\//.test(value) || value.startsWith("/")) return value;
      return `${base}/${value.replace(/^\/+/, "")}`;
    }

    async function getModifiedAt(path) {
      try {
        const stats = await (deps.Neutralino || global.Neutralino)?.filesystem?.getStats?.(path);
        return Number(stats?.modifiedAt || stats?.mtime || 0) || 0;
      } catch (_error) {
        return 0;
      }
    }

    function expectedClassPath(projectPath, configuration, buildConfiguration, mainClass, context = {}) {
      const relativeClass = `${String(mainClass || "").replace(/\./g, "/")}.class`;
      if (buildConfiguration.buildSystem === "maven") {
        return joinPath(context.mavenProject?.projectRoot || projectPath, `target/classes/${relativeClass}`);
      }
      if (buildConfiguration.buildSystem === "gradle") {
        const modulePath = String(configuration.java?.modulePath || "").replace(/^:+|:+$/g, "").replace(/:/g, "/");
        return joinPath(context.gradleProject?.projectRoot || projectPath, `${modulePath ? `${modulePath}/` : ""}build/classes/java/main/${relativeClass}`);
      }
      const profile = buildConfiguration.javacProfile || {};
      const outputRoot = profile.outputMode === "classes"
        ? deps.compiler.resolveStoredPath(projectPath, profile.outputPath || "classes")
        : context.mainClass?.sourceRoot || deps.compiler.resolveStoredPath(projectPath, buildConfiguration.sourceFolders?.[0] || "");
      return joinPath(outputRoot, relativeClass);
    }

    async function getNewestSourceTime(sourceRoots) {
      let newest = 0;
      for (const sourceRoot of sourceRoots || []) {
        const files = await deps.compiler.collectJavaFiles(sourceRoot);
        for (const filePath of files) newest = Math.max(newest, await getModifiedAt(filePath));
      }
      return newest;
    }

    async function isStale(projectPath, configuration, buildConfiguration, context = {}) {
      const outputTime = await getModifiedAt(expectedClassPath(
        projectPath,
        configuration,
        buildConfiguration,
        configuration.java?.mainClass,
        context
      ));
      if (!outputTime) return true;
      const sourceRoots = (buildConfiguration.sourceFolders || [])
        .map((path) => deps.compiler.resolveStoredPath(projectPath, path));
      return await getNewestSourceTime(sourceRoots) > outputTime;
    }

    function applyJavaEnvironment(command, runtime) {
      return deps.projectRuntime?.applyToCommand?.(command, runtime, deps.osName || global.NL_OS) || command;
    }

    async function runBuildCommand(command, cwd, title, runtime) {
      const result = await deps.terminal.runCommand(applyJavaEnvironment(command, runtime), {
        cwd,
        title,
        captureOutput: true
      });
      if (Number(result.exitCode) !== 0) {
        const error = new Error(`${title} failed with exit code ${result.exitCode}.`);
        error.result = result;
        throw error;
      }
      return result;
    }

    async function buildMaven(configuration, context, runtime) {
      const project = context.mavenProject;
      const command = deps.mavenCommand.buildCompileCommand({ runner: project.runner });
      return runBuildCommand(command, project.projectRoot, `Build: ${configuration.name}`, runtime);
    }

    async function buildGradle(configuration, context, runtime) {
      const project = context.gradleProject;
      const settings = project.launcherSettings || {};
      const projectPath = String(configuration.java?.modulePath || "").trim().replace(/^:+|:+$/g, "");
      const command = typeof deps.gradleCommand.buildTasksCommand === "function"
        ? deps.gradleCommand.buildTasksCommand({
            runner: project.runner,
            tasks: "classes",
            projectPath,
            offline: settings.offline === true,
            userHome: settings.userHome
          })
        : [
            project.runner,
            "--console=plain",
            "--no-daemon",
            settings.offline === true ? "--offline" : "",
            settings.userHome ? `--gradle-user-home "${settings.userHome}"` : "",
            projectPath ? `:${projectPath}:classes` : "classes"
          ].filter(Boolean).join(" ");
      return runBuildCommand(command, project.projectRoot, `Build: ${configuration.name}`, runtime);
    }

    /**
     * Compile stale Java outputs before launch when the configuration requests it.
     * @param {string} projectPath Open project root.
     * @param {object} configuration Java Application configuration.
     * @param {object} buildConfiguration Java Build Path configuration.
     * @param {object} runtime Resolved project JDK.
     * @param {object} context Detected build-tool and main-class context.
     * @param {object} options Launch-specific build options.
     * @returns {Promise<object|null>} Build result, or null when no build was required.
     */
    async function prepare(projectPath, configuration, buildConfiguration, runtime, context = {}, options = {}) {
      if (configuration.buildBeforeRun !== true) return null;
      if (!await isStale(projectPath, configuration, buildConfiguration, context)) return null;
      if (buildConfiguration.buildSystem === "maven") return buildMaven(configuration, context, runtime);
      if (buildConfiguration.buildSystem === "gradle") return buildGradle(configuration, context, runtime);
      const succeeded = await deps.projectProvider.rebuildProject(
        { folderPath: projectPath },
        { useLastOptions: true, runAnalyzers: false, debugInfo: options.debugInfo === true }
      );
      if (!succeeded) throw new Error(`Build: ${configuration.name} did not complete.`);
      return { exitCode: 0, output: "" };
    }

    const api = { expectedClassPath, isStale, prepare };
    app.registerModule?.("runBuildBeforeLaunch", api);
    return api;
  }

  global.registerMarkdownViewerRunBuildBeforeLaunch = registerMarkdownViewerRunBuildBeforeLaunch;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerRunBuildBeforeLaunch };
  }
})(typeof window !== "undefined" ? window : globalThis);
