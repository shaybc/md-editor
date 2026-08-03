// Transactional workspace file writes for generated externalization artifacts.
(function(global) {
  "use strict";

  /**
   * Create the externalization workspace writer.
   * @param {{ filesystem?: object, suppressFolderWatcher?: Function, reloadFolderTree?: Function }} options Write dependencies.
   * @returns {object} Transactional plan application API.
   */
  function createMarkdownViewerExternalizationFileWriter(options = {}) {
    const filesystem = options.filesystem || {};
    const removeWorkspaceFile = filesystem.remove || filesystem.removeFile;
    const suppressFolderWatcher = options.suppressFolderWatcher || function() {};
    const reloadFolderTree = options.reloadFolderTree || (async function() {});

    async function ensureDirectory(path) {
      const normalized = String(path || "").replace(/\\/g, "/");
      const rootMatch = normalized.match(/^(?:[A-Za-z]:\/|\/)/)?.[0] || "";
      const remainder = normalized.slice(rootMatch.length);
      let current = rootMatch.replace(/\/$/, "");
      for (const segment of remainder.split("/").filter(Boolean)) {
        current = current ? current + "/" + segment : segment;
        if (filesystem.getStats) {
          try {
            await filesystem.getStats(current);
            continue;
          } catch (_) {
            // The directory does not exist yet.
          }
        }
        try {
          await filesystem.createDirectory(current);
        } catch (error) {
          const message = String(error?.message || error || "").toLowerCase();
          if (!message.includes("exist") && !message.includes("already")) throw error;
        }
      }
    }

    async function rollbackFiles(writtenFiles) {
      for (const file of writtenFiles.slice().reverse()) {
        try {
          if (file.existed) await filesystem.writeFile(file.path, file.previousContent || "");
          else if (removeWorkspaceFile) await removeWorkspaceFile(file.path);
        } catch (error) {
          console.error("Failed to roll back externalized string file:", file.path, error);
        }
      }
    }

    /** Apply generated files and the active-editor change, rolling files back on failure. */
    async function apply(plan, applyEditorContent) {
      const writtenFiles = [];
      suppressFolderWatcher(1500);
      try {
        for (const file of plan.files || []) {
          const directory = String(file.path || "").replace(/\\/g, "/").replace(/\/[^/]*$/, "");
          await ensureDirectory(directory);
          await filesystem.writeFile(file.path, file.content);
          writtenFiles.push(file);
        }
        const editorApplied = applyEditorContent(plan.sourceContent);
        if (!editorApplied) throw new Error("The active editor rejected the externalization change.");
        try {
          await reloadFolderTree({ skipSavedGraphPrompt: true });
        } catch (error) {
          console.warn("Externalized strings, but failed to refresh the folder tree:", error);
        }
        return { applied: true, fileCount: writtenFiles.length };
      } catch (error) {
        await rollbackFiles(writtenFiles);
        throw error;
      } finally {
        suppressFolderWatcher(500);
      }
    }

    return { apply };
  }

  global.createMarkdownViewerExternalizationFileWriter = createMarkdownViewerExternalizationFileWriter;
})(window);
