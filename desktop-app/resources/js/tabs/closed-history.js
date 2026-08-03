// Persists and manages the source-backed tabs that can be reopened after closing.
(function(global) {
  global.registerMarkdownViewerClosedTabHistory = function registerMarkdownViewerClosedTabHistory(app, deps) {
    const STORAGE_KEY = "markdownViewerClosedTabHistory";
    const REOPENABLE_SOURCE_KINDS = new Set(["markdown", "file", "unsupported", "unsupported-file", "large-file", "file-preview", "diagram-editor", "hex-editor", "graph-file"]);

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
    }

    function getDescriptorSource(descriptor) {
      const source = descriptor?.source && typeof descriptor.source === "object" ? descriptor.source : {};
      return {
        path: normalizePath(descriptor?.sourceFilePath || source.path || descriptor?.filePreviewSource?.path || descriptor?.hexEditorSource?.path || ""),
        kind: String(source.kind || descriptor?.type || "").trim().toLowerCase()
      };
    }

    function getTabSource(tab) {
      return {
        path: normalizePath(tab?.sourceFilePath || tab?.openedSource?.path || tab?.filePreviewSource?.path || tab?.hexEditorSource?.path || ""),
        kind: String(tab?.openedSource?.kind || tab?.type || "").trim().toLowerCase()
      };
    }

    function isReopenableSource(source) {
      return !!source.path && REOPENABLE_SOURCE_KINDS.has(source.kind);
    }

    function getLimit() {
      const value = Number(deps.getLimit?.());
      return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.floor(value))) : 20;
    }

    function load() {
      try {
        const parsed = JSON.parse(global.localStorage.getItem(STORAGE_KEY) || "[]");
        return (Array.isArray(parsed) ? parsed : []).filter(function(descriptor) {
          return descriptor && typeof descriptor === "object" && isReopenableSource(getDescriptorSource(descriptor));
        });
      } catch (_error) {
        return [];
      }
    }

    function save(history) {
      const limit = getLimit();
      const trimmed = limit > 0 ? history.slice(-limit) : [];
      try {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch (_error) {
        // Closed-tab history is optional when browser storage is unavailable.
      }
      return trimmed;
    }

    function createReopenDescriptor(tab) {
      try {
        const descriptor = deps.serializeTab?.(tab, { includeInlineDraft: false });
        if (!descriptor || !isReopenableSource(getDescriptorSource(descriptor))) return null;
        const cleanDescriptor = JSON.parse(JSON.stringify(descriptor));
        cleanDescriptor.dirty = false;
        cleanDescriptor.hasDraft = false;
        delete cleanDescriptor.draft;
        delete cleanDescriptor.draftContent;
        delete cleanDescriptor.draftDocument;
        return cleanDescriptor;
      } catch (_error) {
        return null;
      }
    }

    function removeBySource(history, source) {
      if (!isReopenableSource(source)) return history;
      return history.filter(function(descriptor) {
        return getDescriptorSource(descriptor).path !== source.path;
      });
    }

    /** Remember a closed source-backed tab as the most recent history entry. */
    function record(tab) {
      const descriptor = createReopenDescriptor(tab);
      if (!descriptor || getLimit() === 0) return false;
      const history = removeBySource(load(), getDescriptorSource(descriptor));
      history.push(descriptor);
      save(history);
      return true;
    }

    /** Remove and return the most recently closed tab descriptor. */
    function pop() {
      const history = load();
      const descriptor = history.pop() || null;
      save(history);
      return descriptor;
    }

    /** Return whether the descriptor's source file still exists in the desktop runtime. */
    async function sourceExists(descriptor) {
      const source = getDescriptorSource(descriptor);
      if (!isReopenableSource(source) || typeof global.NL_VERSION === "undefined" || !global.Neutralino?.filesystem?.getStats) return false;
      try {
        await global.Neutralino.filesystem.getStats(descriptor.sourceFilePath || descriptor.source?.path || descriptor.filePreviewSource?.path || descriptor.hexEditorSource?.path);
        return true;
      } catch (_error) {
        return false;
      }
    }

    /** Return whether at least one closed source-backed tab can be reopened. */
    function hasEntries() {
      return load().length > 0;
    }

    /** Remove any history entry that points to a tab opened through another workflow. */
    function removeMatchingTab(tab) {
      const source = getTabSource(tab);
      if (!isReopenableSource(source)) return false;
      const history = load();
      const filtered = removeBySource(history, source);
      if (filtered.length === history.length) return false;
      save(filtered);
      return true;
    }

    /** Remove entries for tabs that are already open and enforce the current limit. */
    function reconcileOpenTabs(openTabs) {
      let history = load();
      (Array.isArray(openTabs) ? openTabs : []).forEach(function(tab) {
        history = removeBySource(history, getTabSource(tab));
      });
      save(history);
    }

    /** Enforce the current configured history limit immediately. */
    function trim() {
      save(load());
    }

    const api = { record, pop, sourceExists, hasEntries, removeMatchingTab, reconcileOpenTabs, trim };
    app.registerModule?.("closedTabHistory", api);
    return api;
  };
})(window);
