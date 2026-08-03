(function(global) {
  "use strict";

  /** Loads read-only Java task markers from the JDT snapshot committed with Problems. */
  function registerMarkdownViewerJdtTaskSource(app, deps = {}) {
    const PAGE_SIZE = 5000;
    const taskStore = deps.taskStore || app?.modules?.projectTaskStore;
    let requestSerial = 0;
    let lastRequest = null;
    let unsubscribeProblems = null;
    let observedGenerationId = 0;

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    }

    function currentWorkspaceRoot() {
      return String(deps.getWorkspaceRoot?.() || taskStore?.getState?.().workspaceRoot || "");
    }

    function trace(name, details = {}) {
      deps.diagnosticLifecycleTrace?.mark?.(name, details);
    }

    function isCurrent(request) {
      const state = taskStore?.getState?.();
      return request.serial === requestSerial
        && normalizePath(request.workspaceRoot) === normalizePath(state?.workspaceRoot)
        && normalizePath(request.workspaceRoot) === normalizePath(currentWorkspaceRoot());
    }

    async function readCommittedTasks(request) {
      const getTasks = deps.getJdtTasks || deps.jdtProxyClient?.getTasks;
      if (typeof getTasks !== "function") throw new Error("The JDT task provider is unavailable.");
      const tasks = [];
      let offset = 0;
      let totalCount = 0;
      do {
        const page = await getTasks({
          workspaceRoot: request.workspaceRoot,
          generationId: request.generationId,
          snapshotId: request.snapshotId,
          offset,
          limit: PAGE_SIZE
        });
        if (!isCurrent(request)) return { stale: true, tasks: [] };
        if (page?.stale
          || Number(page?.generationId) !== request.generationId
          || String(page?.snapshotId || "") !== request.snapshotId
          || normalizePath(page?.workspaceRoot) !== normalizePath(request.workspaceRoot)) {
          return { stale: true, tasks: [] };
        }
        const rows = Array.isArray(page.tasks) ? page.tasks : [];
        tasks.push(...rows);
        totalCount = Math.max(Number(page.totalCount) || 0, tasks.length);
        offset += rows.length;
        if (!rows.length) break;
      } while (offset < totalCount);
      return { stale: false, tasks };
    }

    /** Refresh tasks from one immutable JDT generation snapshot. */
    async function refresh(request = lastRequest) {
      if (!request?.workspaceRoot || !request?.generationId || !request?.snapshotId) return false;
      const active = { ...request, serial: ++requestSerial };
      lastRequest = {
        workspaceRoot: active.workspaceRoot,
        generationId: active.generationId,
        snapshotId: active.snapshotId
      };
      taskStore?.setJdtSourceState?.({
        workspaceRoot: active.workspaceRoot,
        status: taskStore?.getState?.().jdtTasks?.length ? "refreshing" : "loading",
        generationId: active.generationId,
        snapshotId: active.snapshotId
      });
      try {
        const result = await readCommittedTasks(active);
        if (!isCurrent(active) || result.stale) {
          trace("jdt-task-snapshot-rejected", {
            generationId: active.generationId,
            workspaceRoot: active.workspaceRoot,
            snapshotId: active.snapshotId,
            reason: "stale"
          });
          return false;
        }
        const accepted = taskStore?.replaceJdtTasks?.({ ...active, tasks: result.tasks }) === true;
        trace(accepted ? "jdt-task-snapshot-installed" : "jdt-task-snapshot-rejected", {
          generationId: active.generationId,
          workspaceRoot: active.workspaceRoot,
          snapshotId: active.snapshotId,
          taskCount: result.tasks.length,
          reason: accepted ? undefined : "workspace-mismatch"
        });
        return accepted;
      } catch (error) {
        if (!isCurrent(active)) return false;
        taskStore?.setJdtSourceState?.({
          workspaceRoot: active.workspaceRoot,
          status: "error",
          generationId: active.generationId,
          snapshotId: active.snapshotId,
          error: { code: "jdt-tasks-failed", message: String(error?.message || error) }
        });
        trace("jdt-task-snapshot-failed", {
          generationId: active.generationId,
          workspaceRoot: active.workspaceRoot,
          snapshotId: active.snapshotId,
          error: String(error?.message || error)
        });
        return false;
      }
    }

    function acceptProblemsSummary(summary = {}) {
      const workspaceRoot = String(summary.workspaceRoot || "");
      const generationId = Number(summary.generationId) || 0;
      const snapshotId = String(summary.providerCounts?.jdt?.snapshotId || "");
      if (!workspaceRoot || !generationId) return;
      if (normalizePath(workspaceRoot) !== normalizePath(currentWorkspaceRoot())) return;
      if (!snapshotId) {
        requestSerial += 1;
        lastRequest = null;
        taskStore?.clearJdtTasks?.(workspaceRoot);
        return;
      }
      const key = `${normalizePath(workspaceRoot)}:${generationId}:${snapshotId}`;
      const previousKey = lastRequest
        ? `${normalizePath(lastRequest.workspaceRoot)}:${lastRequest.generationId}:${lastRequest.snapshotId}`
        : "";
      if (key === previousKey && taskStore?.getState?.().jdt?.status === "ready") return;
      void refresh({ workspaceRoot, generationId, snapshotId });
    }

    /** Reflect generation progress while retaining the last committed JDT tasks. */
    function onAnalysisGenerationState(generation = {}) {
      const workspaceRoot = String(generation.workspaceRoot || "");
      if (workspaceRoot && normalizePath(workspaceRoot) !== normalizePath(currentWorkspaceRoot())) return;
      if (["running", "committing"].includes(generation.status)) {
        const generationId = Number(generation.generationId) || 0;
        if (generationId && generationId !== observedGenerationId) {
          observedGenerationId = generationId;
          requestSerial += 1;
        }
        taskStore?.setJdtSourceState?.({ workspaceRoot, status: "refreshing", generationId: generation.generationId });
      } else if (generation.status === "incomplete") {
        taskStore?.setJdtSourceState?.({
          workspaceRoot,
          status: "incomplete",
          generationId: generation.generationId,
          error: {
            code: "analysis-incomplete",
            message: String(generation.failure?.message || generation.failure?.code || generation.reason || generation.error || "Analysis did not complete.")
          }
        });
      }
    }

    function closeWorkspace(workspaceRoot = currentWorkspaceRoot()) {
      requestSerial += 1;
      lastRequest = null;
      observedGenerationId = 0;
      taskStore?.clearJdtTasks?.(workspaceRoot);
    }

    function retry() {
      return refresh(lastRequest);
    }

    if (deps.projectProblemsBroker?.subscribe) {
      unsubscribeProblems = deps.projectProblemsBroker.subscribe(acceptProblemsSummary);
    }

    const api = { refresh, retry, acceptProblemsSummary, onAnalysisGenerationState, closeWorkspace };
    app?.registerModule?.("jdtTaskSource", api);
    api.dispose = () => { requestSerial += 1; unsubscribeProblems?.(); };
    return api;
  }

  global.registerMarkdownViewerJdtTaskSource = registerMarkdownViewerJdtTaskSource;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJdtTaskSource };
  }
})(typeof window !== "undefined" ? window : globalThis);
