"use strict";

/** Coordinates high-volume filesystem reduction outside the renderer thread. */
importScripts("filesystem-event-reducer.js");

const workspaces = new Map();
const FILESYSTEM_FLUSH_MS = 100;

function postWorkerError(scopeId, error) {
  self.postMessage({
    type: "worker-error",
    scopeId: String(scopeId || ""),
    recoverable: true,
    message: error?.message || String(error)
  });
}

function registerWorkspace(message) {
  workspaces.set(message.workspaceId, {
    workspaceId: message.workspaceId,
    workspaceRoot: message.workspaceRoot,
    derivedRoots: message.derivedRoots || [],
    reducer: self.MarkdownViewerFilesystemEventReducer.createFilesystemEventReducer(),
    timer: null
  });
}

function flushWorkspace(workspace) {
  if (workspace.timer) self.clearTimeout(workspace.timer);
  workspace.timer = null;
  const patch = workspace.reducer.flush({ workspaceRoot: workspace.workspaceRoot });
  if (!patch.changes.length && !patch.dirtyParents.length && !patch.invalidatedRoots.length) return;
  self.postMessage({ type: "filesystem-patch", workspaceId: workspace.workspaceId, patch });
}

function acceptWatchEvents(workspace, events) {
  (events || []).forEach((event) => workspace.reducer.push(event, {
    workspaceRoot: workspace.workspaceRoot,
    derivedRoots: workspace.derivedRoots
  }));
  if (!workspace.timer) workspace.timer = self.setTimeout(() => flushWorkspace(workspace), FILESYSTEM_FLUSH_MS);
}

self.onmessage = function(event) {
  const message = event?.data || {};
  try {
    if (message.type === "register-workspace") registerWorkspace(message);
    else if (message.type === "watch-events") {
      const workspace = workspaces.get(message.workspaceId);
      if (workspace) acceptWatchEvents(workspace, message.events);
    } else if (message.type === "update-derived-roots") {
      const workspace = workspaces.get(message.workspaceId);
      if (workspace) workspace.derivedRoots = message.derivedRoots || [];
    } else if (message.type === "dispose-workspace") {
      const workspace = workspaces.get(message.workspaceId);
      if (workspace) flushWorkspace(workspace);
      workspaces.delete(message.workspaceId);
    }
  } catch (error) {
    postWorkerError(message.workspaceId, error);
  }
};
