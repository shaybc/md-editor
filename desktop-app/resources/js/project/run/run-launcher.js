// Resolution and execution lifecycle for project Run configurations.
(function(global) {
  "use strict";

  /**
   * Register Run configuration launching.
   * @param {object} app Application module registry.
   * @param {object} deps Store, runtime, detection, build, terminal, and output dependencies.
   * @returns {object} Run launcher API.
   */
  function registerMarkdownViewerRunLauncher(app, deps = {}) {
    const listeners = new Set();
    const runningTitles = [];
    let runSequence = 0;

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function isInside(root, path) {
      const base = normalizePath(root).toLowerCase();
      const value = normalizePath(path).toLowerCase();
      return value === base || value.startsWith(`${base}/`);
    }

    function toRelativePath(root, path) {
      if (!isInside(root, path)) return "";
      return normalizePath(path).slice(normalizePath(root).length).replace(/^\/+/, "");
    }

    function publish() {
      const value = { running: runningTitles.length > 0, titles: [...runningTitles] };
      listeners.forEach((listener) => {
        try {
          listener(value);
        } catch (_error) {
          // Launcher observers cannot interrupt a running command.
        }
      });
      return value;
    }

    function subscribe(listener) {
      if (typeof listener !== "function") return function() {};
      listeners.add(listener);
      listener({ running: runningTitles.length > 0, titles: [...runningTitles] });
      return function unsubscribe() {
        listeners.delete(listener);
      };
    }

    function getProjectPath() {
      return normalizePath(deps.getProjectPath?.() || deps.store.getSnapshot().projectPath);
    }

    async function resolveRuntime(projectPath, configuration, buildConfiguration) {
      if (configuration.type === "docker-compose") return { ok: true };
      const runtimeConfiguration = {
        ...buildConfiguration,
        projectJdkId: configuration.java?.jdkId || buildConfiguration.projectJdkId
      };
      return deps.projectRuntime.requireForCommand(projectPath, runtimeConfiguration);
    }

    async function resolveTooling(projectPath, configuration, buildConfiguration) {
      const sourceFolders = buildConfiguration.sourceFolders || [];
      if (configuration.type === "docker-compose") return {};
      if (configuration.type === "maven" || buildConfiguration.buildSystem === "maven") {
        const target = configuration.type === "java-application" && configuration.java?.modulePath
          ? `${projectPath}/${configuration.java.modulePath}`
          : projectPath;
        return {
          mavenProject: await deps.mavenDetection.detectProjectForTarget(projectPath, target, deps.osName)
        };
      }
      if (configuration.type === "gradle" || buildConfiguration.buildSystem === "gradle") {
        return {
          gradleProject: await deps.gradleDetection.detectProject(
            projectPath,
            deps.osName,
            sourceFolders,
            deps.getGradleLauncherSettings?.(buildConfiguration.gradle) || {}
          )
        };
      }
      return {};
    }

    async function findConfiguredMainClass(projectPath, configuration, buildConfiguration) {
      const sourceRoots = (buildConfiguration.sourceFolders || [])
        .map((path) => deps.compiler.resolveStoredPath(projectPath, path));
      const matches = await deps.mainClassFinder.findAll(sourceRoots);
      return {
        matches,
        mainClass: matches.find((item) => item.className === configuration.java?.mainClass) || null,
        sourceRoots
      };
    }

    async function resolveContext(configuration, options = {}) {
      const projectPath = getProjectPath();
      if (!projectPath) throw new Error("Open a project before running a configuration.");
      const buildConfiguration = await deps.buildPath.loadConfiguration(projectPath);
      const runtime = await resolveRuntime(projectPath, configuration, buildConfiguration);
      const tooling = await resolveTooling(projectPath, configuration, buildConfiguration);
      const mainContext = configuration.type === "java-application"
        ? await findConfiguredMainClass(projectPath, configuration, buildConfiguration)
        : { matches: [], mainClass: null, sourceRoots: [] };
      const validation = await deps.validation.validate(configuration, {
        projectPath,
        configurations: deps.store.getSnapshot().configurations,
        runtime,
        ...tooling
      });
      if (!validation.runnable) {
        const error = new Error(Object.values(validation.errors)[0] || "The Run configuration is invalid.");
        error.validation = validation;
        throw error;
      }
      if (configuration.type === "java-application" && !mainContext.mainClass && options.allowUnknownMain !== true) {
        const error = new Error(`Main class '${configuration.java?.mainClass || ""}' was not found in the configured source roots.`);
        error.validation = { runnable: false, errors: { "java.mainClass": error.message } };
        throw error;
      }
      return { projectPath, buildConfiguration, runtime, validation, ...tooling, ...mainContext };
    }

    /**
     * Build a non-executing command preview for a configuration draft.
     * @param {object} configuration Run configuration draft.
     * @returns {Promise<object>} Preview command context.
     */
    async function preview(configuration) {
      try {
        const context = await resolveContext(configuration, { allowUnknownMain: true });
        const classpath = configuration.java?.classpathOverride || (configuration.type === "java-application" ? "<runtime classpath>" : "");
        return { ...deps.commandBuilder.build(configuration, { ...context, classpath }), validation: context.validation };
      } catch (error) {
        const projectPath = getProjectPath();
        return {
          ...deps.commandBuilder.build(configuration, { projectPath, classpath: configuration.java?.classpathOverride || "<runtime classpath>" }),
          validation: error.validation || { runnable: false, errors: { project: error.message } }
        };
      }
    }

    /**
     * Resolve and prepare a Java Application configuration for debugger launch.
     * @param {object} configuration Saved Run configuration.
     * @returns {Promise<object>} Prepared launch context with runtime classpath.
     */
    async function resolveJavaLaunchContext(configuration) {
      const context = await resolveContext(configuration);
      if (configuration.type !== "java-application") {
        throw new Error("Java debugging is available for Java Application run configurations.");
      }
      await deps.buildBeforeLaunch.prepare(
        context.projectPath,
        configuration,
        context.buildConfiguration,
        context.runtime,
        context,
        { debugInfo: true }
      );
      const classpath = await deps.runtimeClasspath.resolve(
        context.projectPath,
        configuration,
        context.buildConfiguration,
        context.runtime
      );
      return { ...context, ...classpath };
    }
    async function persistResult(projectPath, configuration, result, fallbackContent = "") {
      const content = result?.session?.consoleOutput || result?.output || fallbackContent;
      await deps.output.save(projectPath, {
        configurationId: configuration.id,
        configurationName: configuration.name,
        configurationType: configuration.type,
        exitCode: Number(result?.exitCode ?? 1),
        content
      });
      return content;
    }

    /**
     * Validate, resolve, and execute one Run configuration.
     * @param {object} configuration Saved Run configuration.
     * @returns {Promise<boolean>} Whether the launched process completed successfully.
     */
    async function runConfiguration(configuration) {
      let context;
      let title = `Run: ${configuration?.name || "Configuration"}`;
      let backgroundOwnerId = "";
      let backgroundStarted = false;
      let backgroundCompleted = false;
      let runStartedAt = 0;

      function completeBackgroundRun(outcome) {
        if (!backgroundStarted || backgroundCompleted) return;
        backgroundCompleted = true;
        deps.backgroundProcesses?.complete?.(backgroundOwnerId, outcome, { description: title });
      }

      try {
        context = await resolveContext(configuration);
        if (configuration.type === "java-application") {
          await deps.buildBeforeLaunch.prepare(
            context.projectPath,
            configuration,
            context.buildConfiguration,
            context.runtime,
            context
          );
          const classpath = await deps.runtimeClasspath.resolve(
            context.projectPath,
            configuration,
            context.buildConfiguration,
            context.runtime
          );
          Object.assign(context, classpath);
        }
        const launch = deps.commandBuilder.build(configuration, context);
        title = launch.title;
        await deps.store.setActive(configuration.id);
        runningTitles.push(title);
        publish();
        const runId = `${Date.now()}-${++runSequence}`;
        const runTabId = `run-${runId}`;
        backgroundOwnerId = `run:${configuration.id}:${runId}`;
        runStartedAt = Date.now();
        const result = await deps.terminal.runCommand(launch.command, {
          cwd: launch.cwd,
          title,
          tabId: runTabId,
          interactive: true,
          captureOutput: true,
          onProcessStarted(process) {
            const entry = deps.backgroundProcesses?.start?.({
              ownerId: backgroundOwnerId,
              category: "run",
              icon: "bi-play-fill",
              description: title,
              pid: process.pid,
              tabId: runTabId,
              onCancel: process.stop
            });
            backgroundStarted = Boolean(entry);
          }
        });
        const exitCode = Number(result.exitCode);
        completeBackgroundRun(exitCode === 0 ? "finished" : exitCode === 130 ? "cancelled" : "failed");
        await persistResult(context.projectPath, configuration, result);
        if (exitCode === 130) return false;
        if (exitCode !== 0) {
          deps.alert?.(`${configuration.name} failed with exit code ${result.exitCode}. See ${configuration.name} output.`);
          return false;
        }
        return true;
      } catch (error) {
        const projectPath = context?.projectPath || getProjectPath();
        const result = (error?.result || error?.session) ? {
          exitCode: error?.result?.exitCode ?? 1,
          output: error?.result?.output || error?.session?.consoleOutput || "",
          session: error?.session
        } : null;
        if (projectPath && configuration) await persistResult(projectPath, configuration, result, error?.message || "");
        completeBackgroundRun("failed");
        deps.alert?.(error?.message || "The Run configuration could not be launched.");
        return false;
      } finally {
        const index = runningTitles.lastIndexOf(title);
        if (index >= 0) runningTitles.splice(index, 1);
        if (runStartedAt) deps.statistics?.recordRun?.(Date.now() - runStartedAt);
        completeBackgroundRun("failed");
        publish();
      }
    }

    /**
     * Run one saved configuration by identifier.
     * @param {string} configurationId Saved configuration identifier.
     * @returns {Promise<boolean>} Whether execution succeeded.
     */
    async function runById(configurationId) {
      const configuration = deps.store.get(configurationId);
      if (!configuration) {
        deps.alert?.("The selected Run configuration no longer exists.");
        return false;
      }
      return runConfiguration(configuration);
    }

    async function runActive() {
      const configuration = deps.store.getActive();
      if (!configuration) {
        deps.alert?.("Create or select a Run configuration first.");
        return false;
      }
      return runConfiguration(configuration);
    }

    function createUniqueName(simpleName) {
      const names = new Set(deps.store.getSnapshot().configurations.map((item) => item.name.toLowerCase()));
      if (!names.has(simpleName.toLowerCase())) return simpleName;
      let suffix = 2;
      while (names.has(`${simpleName} ${suffix}`.toLowerCase())) suffix += 1;
      return `${simpleName} ${suffix}`;
    }

    /**
     * Create or reuse a saved Java Application configuration for one source file.
     * @param {string} filePath Java source file path.
     * @returns {Promise<object|null>} Saved Java Application configuration, or null when the file cannot launch.
     */
    async function ensureJavaFileConfiguration(filePath) {
      const projectPath = getProjectPath();
      const buildConfiguration = await deps.buildPath.loadConfiguration(projectPath);
      const sourceRoots = (buildConfiguration.sourceFolders || [])
        .map((path) => deps.compiler.resolveStoredPath(projectPath, path));
      const sourceRoot = sourceRoots.find((root) => isInside(root, filePath)) || "";
      const mainClass = await deps.mainClassFinder.inspectFile(filePath, sourceRoot);
      if (!mainClass) {
        deps.alert?.("This Java file does not declare a public static void main method.");
        return null;
      }
      const existing = deps.store.getSnapshot().configurations.find((item) =>
        item.type === "java-application" && item.java?.mainClass === mainClass.className);
      const configuration = existing || await deps.store.upsert({
        ...deps.store.createDraft("java-application"),
        name: createUniqueName(mainClass.simpleName),
        buildBeforeRun: true,
        java: {
          modulePath: "",
          mainClass: mainClass.className,
          programArguments: "",
          vmArguments: "",
          jdkId: "",
          classpathOverride: ""
        }
      });
      return configuration;
    }

    /**
     * Create or reuse a saved Java Application configuration for one source file, then run it.
     * @param {string} filePath Java source file path.
     * @returns {Promise<boolean>} Whether execution succeeded.
     */
    async function runJavaFile(filePath) {
      const configuration = await ensureJavaFileConfiguration(filePath);
      if (!configuration) return false;
      return runConfiguration(configuration);
    }

    async function canRunJavaFile(filePath) {
      if (!getProjectPath() || !/\.java$/i.test(String(filePath || ""))) return false;
      return Boolean(await deps.mainClassFinder.inspectFile(filePath));
    }

    async function stopNewest() {
      if (!runningTitles.length) return false;
      return deps.terminal.stopCommandSession([...runningTitles]);
    }

    const api = {
      canRunJavaFile,
      ensureJavaFileConfiguration,
      isRunning: () => runningTitles.length > 0,
      preview,
      resolveJavaLaunchContext,
      runActive,
      runById,
      runConfiguration,
      runJavaFile,
      stopNewest,
      subscribe
    };
    app.registerModule?.("runLauncher", api);
    return api;
  }

  global.registerMarkdownViewerRunLauncher = registerMarkdownViewerRunLauncher;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerRunLauncher };
  }
})(typeof window !== "undefined" ? window : globalThis);
