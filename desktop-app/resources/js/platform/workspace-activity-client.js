(function(global) {
  "use strict";

  /** Provides renderer-safe access to the workspace activity Web Worker. */
  function registerMarkdownViewerWorkspaceActivityClient(app, deps = {}) {
    const WorkerConstructor = deps.Worker || global.Worker;
    const workerUrl = deps.workerUrl || "js/platform/workspace-activity-worker.js";
    const workspaceHandlers = new Map();
    const workspaceRegistrations = new Map();
    let worker = null;
    let restartCount = 0;

    function createWorker() {
      if (typeof WorkerConstructor !== "function") return null;
      const next = new WorkerConstructor(workerUrl);
      next.onmessage = handleWorkerMessage;
      next.onerror = handleWorkerFailure;
      return next;
    }

    function ensureWorker() {
      if (!worker) worker = createWorker();
      return worker;
    }

    function post(message) {
      const activeWorker = ensureWorker();
      if (!activeWorker) return false;
      activeWorker.postMessage(message);
      return true;
    }

    function handleWorkerMessage(event) {
      const message = event?.data || {};
      if (message.workspaceId && workspaceHandlers.has(message.workspaceId)) workspaceHandlers.get(message.workspaceId)(message);
    }

    function handleWorkerFailure(event) {
      worker?.terminate?.();
      worker = null;
      const error = new Error(event?.message || "Workspace activity worker failed.");
      if (restartCount < 1) {
        restartCount += 1;
        const restartedWorker = ensureWorker();
        workspaceRegistrations.forEach((options, workspaceId) => restartedWorker?.postMessage({
          type: "register-workspace",
          workspaceId,
          workspaceRoot: options.workspaceRoot,
          derivedRoots: options.derivedRoots || []
        }));
      }
      workspaceHandlers.forEach((handler) => handler({ type: "worker-error", recoverable: restartCount <= 1, message: error.message }));
    }

    /** Register one filesystem reduction scope. */
    function registerWorkspace(workspaceId, options, handler) {
      workspaceHandlers.set(workspaceId, handler);
      workspaceRegistrations.set(workspaceId, {
        workspaceRoot: options.workspaceRoot,
        derivedRoots: options.derivedRoots || []
      });
      return post({
        type: "register-workspace",
        workspaceId,
        workspaceRoot: options.workspaceRoot,
        derivedRoots: options.derivedRoots || []
      });
    }

    function pushWatchEvents(workspaceId, events) {
      return post({ type: "watch-events", workspaceId, events });
    }

    function updateDerivedRoots(workspaceId, derivedRoots) {
      const registration = workspaceRegistrations.get(workspaceId);
      if (registration) registration.derivedRoots = derivedRoots || [];
      return post({ type: "update-derived-roots", workspaceId, derivedRoots });
    }

    function disposeWorkspace(workspaceId) {
      workspaceHandlers.delete(workspaceId);
      workspaceRegistrations.delete(workspaceId);
      return post({ type: "dispose-workspace", workspaceId });
    }

    function dispose() {
      worker?.terminate?.();
      worker = null;
      workspaceHandlers.clear();
      workspaceRegistrations.clear();
    }

    const api = {
      registerWorkspace,
      pushWatchEvents,
      updateDerivedRoots,
      disposeWorkspace,
      dispose
    };
    app?.registerModule?.("workspaceActivityClient", api);
    return api;
  }

  global.registerMarkdownViewerWorkspaceActivityClient = registerMarkdownViewerWorkspaceActivityClient;
})(typeof window !== "undefined" ? window : globalThis);
