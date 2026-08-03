(function(global) {
  "use strict";

  /** Owns bounded coalescing of filesystem watcher events into workspace patches. */
  function createFilesystemEventReducer(options = {}) {
    const maximumPaths = Number(options.maximumPaths) || 10000;
    const invalidatePathCount = Number(options.invalidatePathCount) || 1000;
    const invalidateParentCount = Number(options.invalidateParentCount) || 100;
    const eventsByPath = new Map();
    const dirtyParents = new Set();
    const invalidatedRoots = new Set();
    let sequence = 0;

    function normalizePath(path) {
      return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function parentPath(path) {
      const normalized = normalizePath(path);
      return normalized.slice(0, normalized.lastIndexOf("/"));
    }

    function eventPath(event) {
      const directory = normalizePath(event?.dir);
      const filename = String(event?.filename || "").replace(/\\/g, "/").replace(/^\/+/, "");
      return normalizePath(filename ? `${directory}/${filename}` : directory);
    }

    function isInside(path, root) {
      const comparablePath = normalizePath(path).toLowerCase();
      const comparableRoot = normalizePath(root).toLowerCase();
      return comparableRoot && (comparablePath === comparableRoot || comparablePath.startsWith(`${comparableRoot}/`));
    }

    function findDerivedRoot(path, derivedRoots) {
      return (derivedRoots || []).map(normalizePath).filter(Boolean).find((root) => isInside(path, root)) || "";
    }

    function mergeAction(previous, next) {
      if (!previous) return next;
      if (previous === "add" && next === "modified") return "add";
      if (previous === "add" && next === "delete") return "none";
      if (previous === "modified" && next === "modified") return "modified";
      if (next === "delete") return "delete";
      if (previous === "delete" && next === "add") return "modified";
      return next;
    }

    /** Add one watcher event without allowing path cardinality to grow unbounded. */
    function push(event, context = {}) {
      const path = eventPath(event);
      if (!path) return;
      const derivedRoot = findDerivedRoot(path, context.derivedRoots);
      if (derivedRoot && path !== derivedRoot) {
        if (invalidatedRoots.size >= invalidateParentCount) {
          invalidatedRoots.clear();
          invalidatedRoots.add(normalizePath(context.workspaceRoot));
        } else if (!invalidatedRoots.has(normalizePath(context.workspaceRoot))) {
          invalidatedRoots.add(derivedRoot);
        }
        return;
      }
      if (eventsByPath.size >= maximumPaths && !eventsByPath.has(path)) {
        eventsByPath.clear();
        dirtyParents.clear();
        invalidatedRoots.add(normalizePath(context.workspaceRoot));
        return;
      }
      const previous = eventsByPath.get(path);
      const action = mergeAction(previous?.action, event.action);
      if (action === "none") eventsByPath.delete(path);
      else eventsByPath.set(path, Object.assign({}, previous || {}, event, { action, path }));
      const parent = parentPath(path);
      if (parent) dirtyParents.add(parent);
      if (event.action === "moved" && event.oldFilename) {
        const oldPath = normalizePath(`${normalizePath(event.dir)}/${event.oldFilename}`);
        const oldParent = parentPath(oldPath);
        if (oldParent) dirtyParents.add(oldParent);
      }
    }

    /** Return one ordered patch and reset the current reduction window. */
    function flush(context = {}) {
      const pathCount = eventsByPath.size;
      if (pathCount > invalidatePathCount || dirtyParents.size > invalidateParentCount) {
        invalidatedRoots.add(normalizePath(context.workspaceRoot));
        eventsByPath.clear();
        dirtyParents.clear();
      }
      const patch = {
        sequence: ++sequence,
        changes: Array.from(eventsByPath.values()),
        dirtyParents: Array.from(dirtyParents),
        invalidatedRoots: Array.from(invalidatedRoots),
        inputPathCount: pathCount
      };
      eventsByPath.clear();
      dirtyParents.clear();
      invalidatedRoots.clear();
      return patch;
    }

    return { push, flush, getPendingPathCount: () => eventsByPath.size };
  }

  global.MarkdownViewerFilesystemEventReducer = { createFilesystemEventReducer };
})(typeof self !== "undefined" ? self : globalThis);
