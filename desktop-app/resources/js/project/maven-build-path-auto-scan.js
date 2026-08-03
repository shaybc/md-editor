(function(global) {
  "use strict";

  /** Coordinates best-effort Maven source discovery after a desktop folder opens. */
  function registerMarkdownViewerMavenBuildPathAutoScan(app, deps = {}) {
    const activeScans = new Set();

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function getNeutralino() {
      return deps.Neutralino || global.Neutralino;
    }

    function getOsName() {
      return typeof deps.osName === "string" ? deps.osName : "Windows";
    }

    function getActiveFolderPath() {
      return normalizePath(typeof deps.getActiveFolderPath === "function" ? deps.getActiveFolderPath() : "");
    }

    function isStillActiveFolder(projectPath) {
      const activeFolderPath = getActiveFolderPath();
      return !activeFolderPath || activeFolderPath.toLowerCase() === normalizePath(projectPath).toLowerCase();
    }

    function log(level, message, details = {}) {
      if (typeof deps.appDebugLog === "function") {
        void deps.appDebugLog(level, `[maven-build-path-auto-scan] ${message}`, details);
      }
    }

    function mergeSourceFolders(projectPath, existingFolders, detectedFolders) {
      const merged = [];
      const seen = new Set();
      const add = (path) => {
        const normalized = normalizePath(path);
        if (!normalized) return false;
        const key = normalized.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        merged.push(normalized);
        return true;
      };

      for (const path of existingFolders || []) add(path);
      let added = 0;
      for (const entry of detectedFolders || []) {
        const stored = deps.javaBuildPath.toStoredPath(projectPath, entry.absolutePath || entry.path);
        if (add(stored)) added += 1;
      }
      return { sourceFolders: merged, added };
    }

    function hasSourceFoldersChanged(before, after) {
      if ((before || []).length !== (after || []).length) return true;
      return (before || []).some((path, index) => normalizePath(path) !== normalizePath(after[index]));
    }

    function setMavenModulePaths(paths) {
      app.modules?.sidebarContextTree?.setMavenModulePaths?.(paths);
    }

    async function runAutoScan(projectPath) {
      const normalizedProjectPath = normalizePath(projectPath);
      if (!normalizedProjectPath || activeScans.has(normalizedProjectPath.toLowerCase())) return null;
      if (
        !getNeutralino()
        || !deps.javaBuildPath
        || !deps.mavenDetection
        || (!deps.mavenSourceFolders?.scanProject && !deps.mavenSourceFolders?.scan)
      ) return null;
      if (!isStillActiveFolder(normalizedProjectPath)) return null;

      const scanKey = normalizedProjectPath.toLowerCase();
      activeScans.add(scanKey);
      setMavenModulePaths([]);
      try {
        const configuration = await deps.javaBuildPath.loadConfiguration(normalizedProjectPath);
        if (configuration.buildSystem === "javac") {
          log("debug", "skipped because the project is configured for javac", { projectPath: normalizedProjectPath });
          return null;
        }

        const mavenProject = await deps.mavenDetection.detectProject(
          normalizedProjectPath,
          getOsName(),
          configuration.sourceFolders
        );
        if (!mavenProject?.hasPom) {
          log("debug", "skipped because no Maven descriptor was detected", { projectPath: normalizedProjectPath });
          return null;
        }

        const statusManager = app.modules?.statusManager;
        const scanController = typeof global.AbortController === "function" ? new global.AbortController() : { signal: { aborted: false }, abort() { this.signal.aborted = true; } };
        let scanOutcome = "finished";
        statusManager?.setStatus?.({
          id: "maven-module-scan",
          label: "Scanning folder for Maven modules...",
          showProgress: true,
          onCancel: function() {
            scanController.abort();
            return true;
          },
          backgroundProcess: { category: "maven", icon: "bi-diagram-3" }
        });
        let discovery;
        try {
          const scanRoot = mavenProject.projectRoot || normalizedProjectPath;
          discovery = deps.mavenSourceFolders.scanProject
            ? await deps.mavenSourceFolders.scanProject(scanRoot, { signal: scanController.signal })
            : { sourceFolders: await deps.mavenSourceFolders.scan(scanRoot, { signal: scanController.signal }), modules: [] };
        } catch (error) {
          scanOutcome = scanController.signal.aborted ? "cancelled" : "failed";
          throw error;
        } finally {
          statusManager?.unsetStatus?.("maven-module-scan", { outcome: scanOutcome });
        }
        const detectedFolders = discovery?.sourceFolders || [];
        if (!isStillActiveFolder(normalizedProjectPath)) return null;
        setMavenModulePaths((discovery?.modules || []).map((module) => module.absolutePath || module.path));
        const merged = mergeSourceFolders(normalizedProjectPath, configuration.sourceFolders, detectedFolders);
        const validationError = merged.sourceFolders.length
          ? deps.javaBuildPath.validateSourceFolders(normalizedProjectPath, merged.sourceFolders)
          : "";
        if (validationError) {
          log("warning", "detected Maven source folders were not saved because validation failed", {
            projectPath: normalizedProjectPath,
            error: validationError
          });
          return null;
        }

        const shouldSave = configuration.buildSystem !== "maven"
          || hasSourceFoldersChanged(configuration.sourceFolders, merged.sourceFolders);
        if (!shouldSave || !isStillActiveFolder(normalizedProjectPath)) return null;

        const saved = await deps.javaBuildPath.saveConfiguration(normalizedProjectPath, {
          ...configuration,
          buildSystem: "maven",
          sourceFolders: merged.sourceFolders
        });
        log("info", "saved Maven source folders to Java Build Path", {
          projectPath: normalizedProjectPath,
          detected: detectedFolders.length,
          added: merged.added
        });
        return saved;
      } catch (error) {
        log("warning", "failed to auto-scan Maven source folders", {
          projectPath: normalizedProjectPath,
          error: error?.message || String(error || "Unknown error")
        });
        return null;
      } finally {
        activeScans.delete(scanKey);
      }
    }

    /** Schedule Maven Build Path source discovery without delaying folder rendering. */
    function schedule(projectPath) {
      const normalizedProjectPath = normalizePath(projectPath);
      if (!normalizedProjectPath) return;
      const run = () => { void runAutoScan(normalizedProjectPath); };
      if (typeof global.requestIdleCallback === "function") {
        global.requestIdleCallback(run, { timeout: 3000 });
        return;
      }
      if (typeof global.setTimeout === "function") {
        global.setTimeout(run, 0);
        return;
      }
      Promise.resolve().then(run);
    }

    const api = { runAutoScan, schedule };
    app.registerModule?.("mavenBuildPathAutoScan", api);
    return api;
  }

  global.registerMarkdownViewerMavenBuildPathAutoScan = registerMarkdownViewerMavenBuildPathAutoScan;
})(typeof window !== "undefined" ? window : globalThis);
