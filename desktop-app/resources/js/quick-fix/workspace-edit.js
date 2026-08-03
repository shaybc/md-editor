(function(global) {
  "use strict";

  /** Resolve, validate, preview, apply, and undo LSP workspace edits. */
  function registerMarkdownViewerWorkspaceEditPreview(app, deps = {}) {
    const registry = deps.registry;
    const tabs = deps.tabs;

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function pathKey(value) {
      const path = normalizePath(value);
      return deps.osName === "Windows" ? path.toLowerCase() : path;
    }

    function isInsideWorkspace(path) {
      const root = pathKey(deps.getWorkspaceRoot?.());
      const candidate = pathKey(path);
      return !!root && (candidate === root || candidate.startsWith(`${root}/`));
    }

    function requireLocalWorkspacePath(uri) {
      const path = registry?.fromFileUri?.(uri) || "";
      if (!path) throw new Error("Quick Fix returned a non-local file URI.");
      if (!isInsideWorkspace(path)) throw new Error(`Quick Fix returned a path outside the active workspace: ${path}`);
      return normalizePath(path);
    }

    async function pathExists(path) {
      const Neutralino = deps.Neutralino || global.Neutralino;
      try {
        await Neutralino.filesystem.getStats(path);
        return true;
      } catch (_error) {
        return false;
      }
    }

    async function readSnapshot(path) {
      const tabSnapshot = tabs?.getExternalDocumentSnapshot?.(path);
      if (tabSnapshot) return tabSnapshot;
      const Neutralino = deps.Neutralino || global.Neutralino;
      return {
        path,
        content: await Neutralino.filesystem.readFile(path),
        isOpen: false,
        isDirty: false,
        version: null
      };
    }

    function getLineStarts(text) {
      const value = String(text || "");
      const starts = [0];
      for (let index = 0; index < value.length; index += 1) {
        if (value[index] === "\n") starts.push(index + 1);
      }
      return starts;
    }

    function positionToOffset(text, lineStarts, position) {
      const line = Math.max(0, Math.min(Number(position?.line) || 0, lineStarts.length - 1));
      const start = lineStarts[line] || 0;
      const next = lineStarts[line + 1];
      const end = typeof next === "number" ? Math.max(start, next - 1) : String(text || "").length;
      return Math.max(start, Math.min(start + Math.max(0, Number(position?.character) || 0), end));
    }

    function applyTextEdits(content, edits) {
      const text = String(content || "");
      const lineStarts = getLineStarts(text);
      const normalized = (Array.isArray(edits) ? edits : []).map((edit) => {
        if (!edit?.range) throw new Error("Quick Fix returned a text edit without a range.");
        const start = positionToOffset(text, lineStarts, edit.range.start);
        const end = positionToOffset(text, lineStarts, edit.range.end);
        return {
          from: Math.min(start, end),
          to: Math.max(start, end),
          newText: String(edit.newText ?? "")
        };
      }).sort((left, right) => left.from - right.from || left.to - right.to);
      for (let index = 1; index < normalized.length; index += 1) {
        if (normalized[index].from < normalized[index - 1].to) {
          throw new Error("Quick Fix returned overlapping text edits.");
        }
      }
      let result = text;
      normalized.slice().reverse().forEach((edit) => {
        result = result.slice(0, edit.from) + edit.newText + result.slice(edit.to);
      });
      return result;
    }

    function collectRawOperations(workspaceEdit) {
      const operations = [];
      Object.entries(workspaceEdit?.changes || {}).forEach(([uri, edits]) => {
        operations.push({ type: "modify", uri, edits, version: null });
      });
      (workspaceEdit?.documentChanges || []).forEach((change) => {
        if (change?.textDocument?.uri) {
          operations.push({
            type: "modify",
            uri: change.textDocument.uri,
            edits: change.edits,
            version: change.textDocument.version
          });
          return;
        }
        if (change?.kind === "create") operations.push({ type: "create", uri: change.uri, options: change.options || {} });
        else if (change?.kind === "rename") operations.push({ type: "rename", oldUri: change.oldUri, newUri: change.newUri, options: change.options || {} });
        else if (change?.kind === "delete") operations.push({ type: "delete", uri: change.uri, options: change.options || {} });
      });
      return operations;
    }

    /**
     * Convert one JDT workspace edit into a validated preview.
     * @param {object} action Normalized JDT action.
     * @returns {Promise<object>} Previewable operations and affected-file summaries.
     */
    async function resolve(action) {
      if (!action?.workspaceEdit) throw new Error(action?.disabledReason || "This Quick Fix has no previewable edit.");
      const operations = [];
      const virtualSnapshots = new Map();
      for (const raw of collectRawOperations(action.workspaceEdit)) {
        if (raw.type === "modify") {
          const path = requireLocalWorkspacePath(raw.uri);
          const snapshot = virtualSnapshots.get(pathKey(path)) || await readSnapshot(path);
          if (raw.version !== null && raw.version !== undefined && (snapshot.version === null || Number(raw.version) !== Number(snapshot.version))) {
            throw new Error(`Quick Fix is stale for ${path}. Refresh diagnostics and try again.`);
          }
          const content = applyTextEdits(snapshot.content, raw.edits);
          operations.push({ ...raw, path, beforeContent: snapshot.content, afterContent: content, snapshot });
          virtualSnapshots.set(pathKey(path), { ...snapshot, content });
        } else if (raw.type === "rename") {
          const oldPath = requireLocalWorkspacePath(raw.oldUri);
          const newPath = requireLocalWorkspacePath(raw.newUri);
          if (!await pathExists(oldPath)) throw new Error(`Quick Fix rename source does not exist: ${oldPath}`);
          const destinationExists = await pathExists(newPath);
          if (destinationExists && !raw.options?.overwrite && !raw.options?.ignoreIfExists) {
            throw new Error(`Quick Fix rename destination already exists: ${newPath}`);
          }
          const snapshot = await readSnapshot(oldPath);
          const destinationSnapshot = destinationExists && raw.options?.overwrite ? await readSnapshot(newPath) : null;
          if (snapshot.isDirty || destinationSnapshot?.isDirty) {
            throw new Error("Save or discard unsaved changes before applying this rename.");
          }
          const skip = destinationExists && raw.options?.ignoreIfExists && !raw.options?.overwrite;
          operations.push({ ...raw, oldPath, newPath, snapshot, destinationExists, destinationSnapshot, skip });
          if (!skip) {
            virtualSnapshots.delete(pathKey(oldPath));
            virtualSnapshots.set(pathKey(newPath), { ...snapshot, path: newPath });
          }
        } else {
          const path = requireLocalWorkspacePath(raw.uri);
          const exists = await pathExists(path);
          if (raw.type === "create" && exists && !raw.options?.overwrite && !raw.options?.ignoreIfExists) {
            throw new Error(`Quick Fix create destination already exists: ${path}`);
          }
          if (raw.type === "delete" && !exists && !raw.options?.ignoreIfNotExists) {
            throw new Error(`Quick Fix delete target does not exist: ${path}`);
          }
          const snapshot = (raw.type === "delete" || (raw.type === "create" && exists && raw.options?.overwrite))
            && exists ? await readSnapshot(path) : null;
          if (snapshot?.isDirty) throw new Error(`Save or discard unsaved changes before changing ${path}.`);
          const skip = raw.type === "create" && exists && raw.options?.ignoreIfExists && !raw.options?.overwrite;
          operations.push({ ...raw, path, exists, snapshot, skip });
          if (raw.type === "create" && !skip) {
            virtualSnapshots.set(pathKey(path), {
              path,
              content: "",
              isOpen: false,
              isDirty: false,
              version: null
            });
          } else {
            virtualSnapshots.delete(pathKey(path));
          }
        }
      }
      if (!operations.length) throw new Error("JDT returned an empty workspace edit.");
      return {
        action,
        operations,
        affectedPaths: Array.from(new Set(operations.flatMap((operation) =>
          operation.type === "rename" ? [operation.oldPath, operation.newPath] : [operation.path]
        ))),
        summary: operations.map((operation) => {
          if (operation.type === "modify") return { type: "modify", path: operation.path, before: operation.beforeContent, after: operation.afterContent };
          if (operation.type === "rename") return { type: "rename", path: operation.oldPath, destination: operation.newPath };
          return { type: operation.type, path: operation.path };
        })
      };
    }

    async function applyOperation(operation) {
      const Neutralino = deps.Neutralino || global.Neutralino;
      if (operation.type === "modify") {
        await tabs.applyExternalDocumentContent(operation.path, operation.afterContent, { reason: "quick-fix" });
        return async () => tabs.applyExternalDocumentContent(operation.path, operation.beforeContent, { reason: "quick-fix-undo" });
      }
      if (operation.type === "create") {
        if (operation.skip) return async () => {};
        await Neutralino.filesystem.writeFile(operation.path, "");
        await tabs.syncExternalResourceContent?.(operation.path, "");
        return async () => {
          if (operation.exists) {
            await Neutralino.filesystem.writeFile(operation.path, operation.snapshot.content);
            await tabs.syncExternalResourceContent?.(operation.path, operation.snapshot.content);
          } else {
            await tabs.applyExternalResourceDelete?.(operation.path);
            await Neutralino.filesystem.remove(operation.path);
          }
        };
      }
      if (operation.type === "rename") {
        if (operation.skip) return async () => {};
        if (operation.destinationExists) {
          await tabs.applyExternalResourceDelete?.(operation.newPath);
          await Neutralino.filesystem.remove(operation.newPath);
        }
        await Neutralino.filesystem.move(operation.oldPath, operation.newPath);
        tabs.applyExternalResourceRename?.(operation.oldPath, operation.newPath);
        return async () => {
          await Neutralino.filesystem.move(operation.newPath, operation.oldPath);
          tabs.applyExternalResourceRename?.(operation.newPath, operation.oldPath);
          if (operation.destinationExists) {
            await Neutralino.filesystem.writeFile(operation.newPath, operation.destinationSnapshot.content);
            if (operation.destinationSnapshot.isOpen) {
              await tabs.syncExternalResourceContent?.(operation.newPath, operation.destinationSnapshot.content, { open: true });
            }
          }
        };
      }
      if (operation.type === "delete") {
        if (operation.exists) {
          await tabs.applyExternalResourceDelete?.(operation.path);
          await Neutralino.filesystem.remove(operation.path);
        }
        return async () => {
          if (operation.exists) {
            await Neutralino.filesystem.writeFile(operation.path, operation.snapshot.content);
            if (operation.snapshot.isOpen) await tabs.syncExternalResourceContent?.(operation.path, operation.snapshot.content, { open: true });
          }
        };
      }
      throw new Error(`Unsupported Quick Fix operation: ${operation.type}`);
    }

    /**
     * Apply a preview transactionally and return a grouped undo action.
     * @param {object} preview Resolved workspace edit preview.
     * @returns {Promise<object>} Applied result with undo callback.
     */
    async function apply(preview) {
      const undoSteps = [];
      try {
        for (const operation of preview.operations) {
          undoSteps.push(await applyOperation(operation));
        }
      } catch (error) {
        for (const undo of undoSteps.slice().reverse()) {
          try {
            await undo();
          } catch (_rollbackError) {
            // Preserve the original application failure while attempting every rollback.
          }
        }
        throw error;
      }
      let undone = false;
      return {
        applied: true,
        async undo() {
          if (undone) return false;
          for (const undo of undoSteps.slice().reverse()) await undo();
          undone = true;
          return true;
        }
      };
    }

    const api = { apply, applyTextEdits, resolve };
    app.registerModule?.("workspaceEditPreview", api);
    return api;
  }

  global.registerMarkdownViewerWorkspaceEditPreview = registerMarkdownViewerWorkspaceEditPreview;
})(typeof window !== "undefined" ? window : globalThis);
