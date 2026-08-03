(function(global) {
  "use strict";

  /** Persist and restore the latest Java Rebuild terminal output for each project. */
  function registerMarkdownViewerJavaRebuildOutput(app, deps = {}) {
    const FILE_NAME = "java-rebuild-output.json";
    const TAB_ID = "java-rebuild";
    let loadedProjectPath = "";
    let restoreGeneration = 0;

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function getOutputPath(projectPath) {
      return joinPath(joinPath(projectPath, ".md-editor"), FILE_NAME);
    }

    function canPersist() {
      const Neutralino = deps.Neutralino || global.Neutralino;
      return Boolean(deps.isDesktopRuntime?.() && Neutralino?.filesystem?.readFile && Neutralino?.filesystem?.writeFile);
    }

    async function writeOutput(projectPath, content) {
      const root = normalizePath(projectPath);
      const Neutralino = deps.Neutralino || global.Neutralino;
      if (!root || !canPersist()) return false;
      try {
        await Neutralino.filesystem.createDirectory(joinPath(root, ".md-editor"));
      } catch (_error) {
        // Existing project metadata folders are valid.
      }
      try {
        await Neutralino.filesystem.writeFile(getOutputPath(root), JSON.stringify({
          schemaVersion: 1,
          type: "md-editor-java-rebuild-output",
          updatedAt: new Date().toISOString(),
          content: String(content || "")
        }, null, 2) + "\n");
        return true;
      } catch (error) {
        console.warn("Unable to persist Java Rebuild output:", error);
        return false;
      }
    }

    async function readOutput(projectPath) {
      const root = normalizePath(projectPath);
      const Neutralino = deps.Neutralino || global.Neutralino;
      if (!root || !canPersist()) return null;
      try {
        const payload = JSON.parse(await Neutralino.filesystem.readFile(getOutputPath(root)));
        if (payload?.type !== "md-editor-java-rebuild-output") return null;
        return String(payload.content || "");
      } catch (_error) {
        return null;
      }
    }

    function openOutput(projectPath, content, activate) {
      const root = normalizePath(projectPath);
      return deps.terminal?.showCommandOutput?.(content, {
        tabId: TAB_ID,
        title: "Java Rebuild",
        activate,
        onClear: () => void clear(root)
      }) || null;
    }

    /** Replace the saved Java Rebuild output for a project. */
    async function save(projectPath, content) {
      return writeOutput(projectPath, content);
    }

    /** Clear the saved Java Rebuild output without closing its tab. */
    async function clear(projectPath) {
      return writeOutput(projectPath, "");
    }

    /** Clear the previous output and close its tab before another rebuild starts. */
    async function begin(projectPath) {
      loadedProjectPath = normalizePath(projectPath);
      restoreGeneration += 1;
      deps.terminal?.closeCommandOutput?.(TAB_ID);
      return clear(loadedProjectPath);
    }

    /** Clear saved output and replace an open Java Rebuild console without activating it. */
    async function clearForClean(projectPath) {
      const root = normalizePath(projectPath);
      const cleared = await writeOutput(root, "");
      if (cleared && loadedProjectPath === root) openOutput(root, "", false);
      return cleared;
    }

    /** Show the saved Java Rebuild output, creating an empty persisted tab when needed. */
    async function show(projectPath) {
      const root = normalizePath(projectPath);
      if (!root) return null;
      let content = await readOutput(root);
      if (content === null) {
        content = "";
        await writeOutput(root, content);
      }
      loadedProjectPath = root;
      return openOutput(root, content, true);
    }

    /** Read the saved Java Rebuild output for project-owned reparsing workflows. */
    async function read(projectPath) {
      return await readOutput(projectPath);
    }

    /** Restore a project's saved Java Rebuild tab without activating the bottom panel. */
    async function restoreForProject(projectPath) {
      const root = normalizePath(projectPath);
      if (!root) {
        restoreGeneration += 1;
        loadedProjectPath = "";
        deps.terminal?.closeCommandOutput?.(TAB_ID);
        return null;
      }
      if (loadedProjectPath === root) return null;
      loadedProjectPath = root;
      const generation = ++restoreGeneration;
      deps.terminal?.closeCommandOutput?.(TAB_ID);
      const content = await readOutput(root);
      if (generation !== restoreGeneration || loadedProjectPath !== root || content === null) return null;
      return openOutput(root, content, false);
    }

    /** Return terminal-runner options that capture and clear persisted rebuild output. */
    function getTerminalOptions(projectPath) {
      const root = normalizePath(projectPath);
      return {
        tabId: TAB_ID,
        captureOutput: true,
        onClear: () => void clear(root)
      };
    }

    const api = {
      FILE_NAME,
      TAB_ID,
      begin,
      clear,
      clearForClean,
      getOutputPath,
      getTerminalOptions,
      read,
      restoreForProject,
      save,
      show
    };
    app.registerModule?.("javaRebuildOutput", api);
    void restoreForProject(deps.getActiveProjectPath?.() || "");
    return api;
  }

  global.registerMarkdownViewerJavaRebuildOutput = registerMarkdownViewerJavaRebuildOutput;
})(typeof window !== "undefined" ? window : globalThis);
