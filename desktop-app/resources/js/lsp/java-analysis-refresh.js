(function(global) {
  "use strict";

  /** Coordinate explicit JDT reanalysis requests with the shared diagnostic generation. */
  function registerMarkdownViewerJavaAnalysisRefresh(app, deps = {}) {
    const TERMINAL_GENERATION_STATES = new Set(["committed", "incomplete"]);
    let activeRefresh = null;

    function waitForGeneration(generationId) {
      return new Promise((resolve) => {
        const unsubscribe = deps.analysisGenerationCoordinator?.subscribe?.((state) => {
          if (Number(state?.generationId) !== Number(generationId) || !TERMINAL_GENERATION_STATES.has(state?.status)) return;
          unsubscribe?.();
          resolve(state);
        });
      });
    }

    async function runGeneration(reason) {
      const workspaceRoot = String(deps.getWorkspaceRoot?.() || "");
      if (!workspaceRoot) throw new Error("Open a Java workspace before requesting analysis.");
      const current = deps.analysisGenerationCoordinator?.getState?.();
      const javaState = deps.javaWorkspaceController?.getState?.();
      deps.javaWorkspaceController?.markRefreshing?.("Java: Reanalyzing...");
      const generationId = deps.analysisGenerationCoordinator?.beginGeneration?.({
        workspaceRoot,
        reason,
        requirements: current?.requirements,
        jdtReady: ["classpath-ready", "ready", "refreshing"].includes(javaState?.phase),
        kotlinReady: current?.providers?.kotlin?.ready === true,
        kotlinAbiReady: current?.providers?.kotlin?.abiReady === true
      });
      if (!generationId) throw new Error("Java analysis could not be started.");
      return waitForGeneration(generationId);
    }

    async function performRefresh(reason) {
      let result = await runGeneration(reason);
      if (result.status === "committed") return { succeeded: true, generation: result, recovered: false };
      await deps.retryJavaWorkspace?.();
      const retryGeneration = deps.analysisGenerationCoordinator?.getState?.();
      if (!retryGeneration?.generationId) return { succeeded: false, generation: result, recovered: false };
      if (!TERMINAL_GENERATION_STATES.has(retryGeneration.status)) result = await waitForGeneration(retryGeneration.generationId);
      else result = retryGeneration;
      const succeeded = result.status === "committed";
      if (!succeeded) {
        const summary = result.failure?.summary || "Java project analysis did not complete after retry.";
        deps.javaWorkspaceController?.markDegraded?.(new Error(summary), result.failure);
      }
      return { succeeded, generation: result, recovered: true };
    }

    /**
     * Reanalyze the active Java workspace and commit its next settled Problems snapshot.
     * @param {object} options Business reason recorded in the diagnostic lifecycle.
     * @returns {Promise<object>} Terminal generation outcome.
     */
    function reanalyze(options = {}) {
      if (activeRefresh) return activeRefresh;
      const reason = String(options.reason || "explicit-java-refresh");
      activeRefresh = performRefresh(reason).finally(() => {
        activeRefresh = null;
      });
      return activeRefresh;
    }

    const api = { reanalyze };
    app?.registerModule?.("javaAnalysisRefresh", api);
    return api;
  }

  global.registerMarkdownViewerJavaAnalysisRefresh = registerMarkdownViewerJavaAnalysisRefresh;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJavaAnalysisRefresh };
  }
})(typeof window !== "undefined" ? window : globalThis);
