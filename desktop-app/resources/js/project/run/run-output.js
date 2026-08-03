// Persistence and restoration for the latest project Run output.
(function(global) {
  "use strict";

  /**
   * Register latest Run output persistence.
   * @param {object} app Application module registry.
   * @param {object} deps Terminal and filesystem dependencies.
   * @returns {object} Run output API.
   */
  function registerMarkdownViewerRunOutput(app, deps = {}) {
    const FILE_NAME = "run-output.json";
    const TAB_ID = "run-output";
    let loadedProjectPath = "";
    let restoreGeneration = 0;

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function getPath(projectPath) {
      return joinPath(joinPath(projectPath, ".md-editor"), FILE_NAME);
    }

    function getFilesystem() {
      return (deps.Neutralino || global.Neutralino)?.filesystem || null;
    }

    async function save(projectPath, result = {}) {
      const root = normalizePath(projectPath);
      const filesystem = getFilesystem();
      if (!root || !filesystem?.writeFile) return false;
      try {
        try {
          await filesystem.createDirectory(joinPath(root, ".md-editor"));
        } catch (_error) {
          // Existing project metadata directories are valid.
        }
        await filesystem.writeFile(getPath(root), JSON.stringify({
          schemaVersion: 1,
          type: "md-editor-run-output",
          updatedAt: new Date().toISOString(),
          configurationId: String(result.configurationId || ""),
          configurationName: String(result.configurationName || "Run"),
          configurationType: String(result.configurationType || ""),
          exitCode: Number(result.exitCode ?? 0),
          content: String(result.content || "")
        }, null, 2) + "\n");
        return true;
      } catch (error) {
        console.warn("Unable to persist Run output:", error);
        return false;
      }
    }

    async function read(projectPath) {
      try {
        const value = JSON.parse(await getFilesystem()?.readFile?.(getPath(projectPath)));
        return value?.type === "md-editor-run-output" ? value : null;
      } catch (_error) {
        return null;
      }
    }

    function showValue(value, activate = true) {
      if (!value) return null;
      return deps.terminal?.showCommandOutput?.(value.content || "", {
        tabId: TAB_ID,
        title: `Run: ${value.configurationName || "Output"}`,
        activate
      }) || null;
    }

    /**
     * Restore the latest output for a newly active project.
     * @param {string} projectPath Open project root.
     * @returns {Promise<object|null>} Restored terminal session.
     */
    async function restoreForProject(projectPath) {
      const root = normalizePath(projectPath);
      if (root === loadedProjectPath) return null;
      const generation = ++restoreGeneration;
      loadedProjectPath = root;
      deps.terminal?.closeCommandOutput?.(TAB_ID);
      if (!root) return null;
      const value = await read(root);
      if (generation !== restoreGeneration || loadedProjectPath !== root) return null;
      return showValue(value, false);
    }

    async function show(projectPath) {
      return showValue(await read(projectPath), true);
    }

    const api = { FILE_NAME, TAB_ID, getPath, read, restoreForProject, save, show };
    app.registerModule?.("runOutput", api);
    return api;
  }

  global.registerMarkdownViewerRunOutput = registerMarkdownViewerRunOutput;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerRunOutput };
  }
})(typeof window !== "undefined" ? window : globalThis);
