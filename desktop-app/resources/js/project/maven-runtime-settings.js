(function(global) {
  "use strict";

  /** Owns Maven executable selection and global invocation arguments. */
  function registerMarkdownViewerMavenRuntimeSettings(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;
    const getStoredSettings = deps.getSettings || (() => ({}));
    const VALID_MODES = new Set(["auto", "wrapper", "system", "custom"]);

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function quote(value) {
      const text = String(value || "");
      const quoteCharacter = String.fromCharCode(34);
      return /[\s"&|<>^]/.test(text) ? quoteCharacter + text + quoteCharacter : text;
    }

    function joinPath(parent, child) {
      return normalizePath(parent) + "/" + String(child || "").replace(/\\/g, "/").replace(/^\/+/, "");
    }

    function parentPath(path) {
      const normalized = normalizePath(path);
      return normalizePath(normalized.slice(0, normalized.lastIndexOf("/")));
    }

    function isInside(boundary, candidate) {
      const root = normalizePath(boundary).toLowerCase();
      const path = normalizePath(candidate).toLowerCase();
      return !root || path === root || path.startsWith(root + "/");
    }

    async function isFile(path) {
      if (!path || !Neutralino?.filesystem?.getStats) return false;
      try {
        return (await Neutralino.filesystem.getStats(path))?.isFile === true;
      } catch (_error) {
        return false;
      }
    }

    /** Return normalized Maven preferences from global application state. */
    function getConfiguration() {
      const state = getStoredSettings() || {};
      const requestedMode = String(state.mavenExecutionMode || "auto").trim().toLowerCase();
      return {
        executionMode: VALID_MODES.has(requestedMode) ? requestedMode : "auto",
        executablePath: normalizePath(state.mavenExecutablePath),
        settingsFilePath: normalizePath(state.mavenSettingsFilePath),
        offline: state.mavenOffline === true,
        localRepositoryPath: normalizePath(state.mavenLocalRepositoryPath)
      };
    }

    async function findWrapper(startPath, boundaryPath, osName) {
      const isWindows = String(osName || "").toLowerCase() === "windows";
      const name = isWindows ? "mvnw.cmd" : "mvnw";
      let current = normalizePath(startPath);
      while (current && isInside(boundaryPath, current)) {
        const candidate = joinPath(current, name);
        if (await isFile(candidate)) return candidate;
        if (current.toLowerCase() === normalizePath(boundaryPath).toLowerCase()) break;
        current = parentPath(current);
      }
      return "";
    }

    /** Resolve the configured Maven executable for one detected project. */
    async function resolveRunner(options = {}) {
      const configuration = options.configuration || getConfiguration();
      const osName = options.osName || "Windows";
      const isWindows = String(osName).toLowerCase() === "windows";
      if (configuration.executionMode === "custom") {
        if (!configuration.executablePath || !await isFile(configuration.executablePath)) {
          return { runner: "", runnerPath: configuration.executablePath, usesWrapper: false, error: "The configured custom Maven executable is unavailable." };
        }
        return { runner: quote(configuration.executablePath), runnerPath: configuration.executablePath, usesWrapper: false, error: "" };
      }
      if (configuration.executionMode !== "system") {
        const wrapperPath = await findWrapper(options.projectRoot, options.workspaceRoot || options.projectRoot, osName);
        if (wrapperPath) return { runner: quote(wrapperPath), runnerPath: wrapperPath, usesWrapper: true, error: "" };
        if (configuration.executionMode === "wrapper") {
          return { runner: "", runnerPath: "", usesWrapper: false, error: "Maven wrapper mode is selected, but no mvnw launcher was found in this project." };
        }
      }
      return { runner: isWindows ? "mvn.cmd" : "mvn", runnerPath: "", usesWrapper: false, error: "" };
    }

    /** Build the arguments controlled by global Maven settings. */
    function getInvocationArguments(options = {}) {
      const configuration = options.configuration || getConfiguration();
      const parts = [];
      if (configuration.settingsFilePath) parts.push("--settings", quote(configuration.settingsFilePath));
      const offline = typeof options.offlineOverride === "boolean" ? options.offlineOverride : configuration.offline;
      if (offline) parts.push("--offline");
      if (configuration.localRepositoryPath && options.preserveIsolatedRepository !== true) {
        parts.push(quote("-Dmaven.repo.local=" + configuration.localRepositoryPath));
      }
      return parts;
    }

    const api = { getConfiguration, getInvocationArguments, resolveRunner, quote };
    app.registerModule?.("mavenRuntimeSettings", api);
    return api;
  }

  global.registerMarkdownViewerMavenRuntimeSettings = registerMarkdownViewerMavenRuntimeSettings;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerMavenRuntimeSettings };
})(typeof window !== "undefined" ? window : globalThis);
