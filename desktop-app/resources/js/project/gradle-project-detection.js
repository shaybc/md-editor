(function(global) {
  "use strict";

  /** Detect a Gradle project descriptor and resolve the configured Gradle runner. */
  function registerMarkdownViewerGradleProjectDetection(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;
    const DESCRIPTOR_NAMES = ["settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts"];

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function isAbsolute(path) {
      const value = normalizePath(path);
      return /^[a-zA-Z]:\//.test(value) || value.startsWith("/");
    }

    function isInsideProject(projectPath, candidatePath) {
      const project = normalizePath(projectPath).toLowerCase();
      const candidate = normalizePath(candidatePath).toLowerCase();
      return candidate === project || candidate.startsWith(`${project}/`);
    }

    function getParentPath(path) {
      const normalized = normalizePath(path);
      return normalizePath(normalized.slice(0, normalized.lastIndexOf("/")));
    }

    function toProjectRelativePath(projectPath, candidatePath) {
      const project = normalizePath(projectPath);
      const candidate = normalizePath(candidatePath);
      return candidate.slice(project.length).replace(/^\/+/, "") || candidate.split("/").pop() || "build.gradle";
    }

    async function isFile(path) {
      try {
        return (await Neutralino.filesystem.getStats(path))?.isFile === true;
      } catch (_error) {
        return false;
      }
    }

    async function findDescriptor(directoryPath) {
      for (const name of DESCRIPTOR_NAMES) {
        const descriptorPath = joinPath(directoryPath, name);
        if (await isFile(descriptorPath)) return { projectRoot: normalizePath(directoryPath), descriptorPath };
      }
      return null;
    }

    async function findNearestProject(projectPath, sourcePath) {
      let candidate = normalizePath(sourcePath);
      while (candidate && isInsideProject(projectPath, candidate)) {
        const detected = await findDescriptor(candidate);
        if (detected) return detected;
        if (candidate.toLowerCase() === normalizePath(projectPath).toLowerCase()) break;
        candidate = getParentPath(candidate);
      }
      return null;
    }

    function quote(value) {
      const text = String(value || "");
      return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
    }

    function normalizeLauncherSettings(value) {
      const settings = value && typeof value === "object" ? value : {};
      const mode = ["auto", "wrapper", "built-in", "local"].includes(settings.mode) ? settings.mode : "auto";
      const installation = settings.selectedInstallation && typeof settings.selectedInstallation === "object"
        ? {
          id: String(settings.selectedInstallation.id || ""),
          name: String(settings.selectedInstallation.name || ""),
          version: String(settings.selectedInstallation.version || ""),
          path: normalizePath(settings.selectedInstallation.path),
          executablePath: normalizePath(settings.selectedInstallation.executablePath)
        }
        : null;
      return {
        mode,
        offline: settings.offline === true,
        userHome: normalizePath(settings.userHome),
        executable: normalizePath(settings.executable || settings.selectedInstallation?.executablePath),
        configurationError: String(settings.configurationError || ""),
        requireInstallation: settings.requireInstallation === true,
        selectedInstallation: installation
      };
    }

    /** Resolve wrapper/local/PATH precedence for one detected Gradle root. */
    function resolveRunner(project, launcherSettings = {}, osName = "Windows") {
      const settings = normalizeLauncherSettings(launcherSettings);
      const isWindows = String(osName || "").toLowerCase() === "windows";
      if (settings.configurationError) {
        return { runner: "", runnerPath: "", usesWrapper: false, error: settings.configurationError };
      }
      const wrapperRunner = isWindows ? ".\\gradlew.bat" : "./gradlew";
      if (settings.mode === "wrapper") {
        return project.hasWrapper
          ? { runner: wrapperRunner, runnerPath: project.wrapperPath, usesWrapper: true, error: "" }
          : { runner: "", runnerPath: "", usesWrapper: false, error: "Gradle wrapper mode is selected, but this project does not contain the expected Gradle wrapper." };
      }
      if (settings.mode === "built-in") {
        return { runner: "gradle", runnerPath: "", usesWrapper: false, error: "" };
      }
      if (settings.mode === "local") {
        return settings.executable
          ? { runner: quote(settings.executable), runnerPath: settings.executable, usesWrapper: false, error: "" }
          : { runner: "", runnerPath: "", usesWrapper: false, error: "Gradle local mode requires a configured Gradle installation in Settings > Gradle." };
      }
      if (project.hasWrapper) return { runner: wrapperRunner, runnerPath: project.wrapperPath, usesWrapper: true, error: "" };
      if (settings.executable) return { runner: quote(settings.executable), runnerPath: settings.executable, usesWrapper: false, error: "" };
      return { runner: "gradle", runnerPath: "", usesWrapper: false, error: "" };
    }

    /** Detect the Gradle root associated with an opened Java project. */
    async function detectProject(projectPath, osName = "Windows", sourceFolders = [], launcherSettings = {}) {
      const openedRoot = normalizePath(projectPath);
      let detected = await findDescriptor(openedRoot);
      let ambiguous = false;
      if (!detected) {
        const matches = new Map();
        for (const sourceFolder of sourceFolders || []) {
          const sourcePath = isAbsolute(sourceFolder) ? normalizePath(sourceFolder) : joinPath(openedRoot, sourceFolder);
          const match = await findNearestProject(openedRoot, sourcePath);
          if (match) matches.set(match.projectRoot.toLowerCase(), match);
        }
        if (matches.size === 1) detected = Array.from(matches.values())[0];
        ambiguous = matches.size > 1;
      }

      const projectRoot = detected?.projectRoot || openedRoot;
      const isWindows = String(osName || "").toLowerCase() === "windows";
      const wrapperPath = joinPath(projectRoot, isWindows ? "gradlew.bat" : "gradlew");
      const hasGradleProject = Boolean(detected) && !ambiguous;
      const hasWrapper = hasGradleProject && await isFile(wrapperPath);
      const normalizedLauncherSettings = normalizeLauncherSettings(launcherSettings);
      let resolvedRunner = resolveRunner({ hasWrapper, wrapperPath }, normalizedLauncherSettings, osName);
      if (
        hasGradleProject
        && normalizedLauncherSettings.requireInstallation
        && resolvedRunner.runnerPath
        && !await isFile(resolvedRunner.runnerPath)
      ) {
        resolvedRunner = {
          runner: "",
          runnerPath: resolvedRunner.runnerPath,
          usesWrapper: false,
          error: "The selected Project Gradle executable is unavailable. Update the installation in Settings or select another installation in Java Build Path."
        };
      }
      return {
        ambiguous,
        hasGradleProject,
        projectRoot,
        descriptorPath: detected?.descriptorPath || joinPath(openedRoot, "build.gradle"),
        descriptorLabel: detected ? toProjectRelativePath(openedRoot, detected.descriptorPath) : "build.gradle",
        wrapperPath: hasWrapper ? wrapperPath : "",
        hasWrapper,
        runner: resolvedRunner.runner,
        runnerPath: resolvedRunner.runnerPath,
        usesWrapper: resolvedRunner.usesWrapper,
        runnerError: resolvedRunner.error,
        gradleInstallation: normalizedLauncherSettings.selectedInstallation,
        launcherSettings: normalizedLauncherSettings
      };
    }

    const api = { DESCRIPTOR_NAMES, detectProject, resolveRunner };
    app.registerModule?.("gradleProjectDetection", api);
    return api;
  }

  global.registerMarkdownViewerGradleProjectDetection = registerMarkdownViewerGradleProjectDetection;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerGradleProjectDetection };
})(typeof window !== "undefined" ? window : globalThis);
