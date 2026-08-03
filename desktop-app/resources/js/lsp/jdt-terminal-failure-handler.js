(function(global) {
  "use strict";

  /**
   * Owns the UI and process shutdown consequences of terminal JDT analysis failures.
   *
   * @param {object} app - MD-Editor application registry.
   * @param {object} deps - Lazy workspace, bridge, and logging dependencies.
   * @returns {{handleIncomplete: Function}} Terminal failure handler.
   */
  function registerMarkdownViewerJdtTerminalFailureHandler(app, deps = {}) {
    /**
     * Settle the Java workspace UI and stop JDT for a JDT-attributed incomplete generation.
     *
     * @param {object} generation - Canonical analysis generation snapshot.
     * @returns {Promise<boolean>} Whether the failure belonged to JDT and was handled.
     */
    async function handleIncomplete(generation = {}) {
      if (generation?.failure?.providerId !== "jdt") return false;
      const controller = deps.getJavaWorkspaceController?.();
      const failure = Object.assign({
        code: generation.failure.code,
        summary: generation.failure.summary,
        fatal: generation.failure.fatal,
        projectPath: generation.workspaceRoot,
        logPath: controller?.getState?.()?.logPath || ""
      }, generation.failure.details || {});

      // Update the owner before stopping the process so the existing running row
      // becomes terminal immediately, even if native process shutdown is delayed.
      controller?.markAnalysisFailed?.(failure);
      try {
        await deps.getLspBridge?.()?.stopServerSessions?.("java", { force: true });
      } catch (error) {
        await deps.log?.("error", "[lsp] Failed to stop JDT after terminal analysis failure", {
          generationId: generation.generationId,
          workspaceRoot: generation.workspaceRoot,
          failureCode: generation.failure.code,
          message: error?.message || String(error)
        });
      }
      return true;
    }

    const api = { handleIncomplete };
    app?.registerModule?.("jdtTerminalFailureHandler", api);
    return api;
  }

  global.registerMarkdownViewerJdtTerminalFailureHandler = registerMarkdownViewerJdtTerminalFailureHandler;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJdtTerminalFailureHandler };
  }
})(typeof window !== "undefined" ? window : globalThis);
