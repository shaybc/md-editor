(function(global) {
  "use strict";

  /** Apply RAT text plans as one unsaved editor transaction with grouped undo. */
  function registerMarkdownViewerRatChangeSet(app, deps = {}) {
    async function apply(plan, options = {}) {
      if (!plan?.changes?.length) throw new Error("The RAT change plan is empty.");
      const applied = [];
      try {
        for (const change of plan.changes) {
          await deps.tabs.applyExternalDocumentContent(change.path, change.afterContent, {
            reason: "rat-manager",
            createMissing: change.type === "create"
          });
          applied.push(change);
        }
      } catch (error) {
        for (const change of applied.slice().reverse()) {
          try {
            if (change.type === "create") await deps.tabs.applyExternalResourceDelete?.(change.path);
            else await deps.tabs.applyExternalDocumentContent(change.path, change.beforeContent, { reason: "rat-manager-rollback" });
          } catch (_rollbackError) {
            // Preserve the original failure while attempting every rollback.
          }
        }
        throw error;
      }
      let undone = false;
      return {
        applied: true,
        plan,
        hasUnsavedChanges: true,
        async undo() {
          if (undone) return false;
          for (const change of applied.slice().reverse()) {
            if (change.type === "create") {
              const filesystem = (deps.Neutralino || global.Neutralino)?.filesystem;
              let saved = false;
              try {
                saved = Boolean((await filesystem?.getStats?.(change.path))?.isFile);
              } catch (_error) {
                saved = false;
              }
              if (saved) {
                const confirmDelete = options.confirmDelete || deps.confirmDelete;
                if (confirmDelete && !await Promise.resolve(confirmDelete(`Delete the newly saved RAT file ${change.path}?`))) return false;
                await deps.tabs.applyExternalResourceDelete?.(change.path);
                await filesystem.remove(change.path);
              } else {
                await deps.tabs.applyExternalResourceDelete?.(change.path);
              }
            } else {
              await deps.tabs.applyExternalDocumentContent(change.path, change.beforeContent, { reason: "rat-manager-undo" });
            }
          }
          undone = true;
          return true;
        }
      };
    }

    const api = { apply };
    app?.registerModule?.("ratChangeSet", api);
    return api;
  }

  global.registerMarkdownViewerRatChangeSet = registerMarkdownViewerRatChangeSet;
})(typeof window !== "undefined" ? window : globalThis);
