(function(global) {
  "use strict";

  const COMMAND_ID = "mdeditor.java.getWorkspaceProjectInventory";
  const INVENTORY_INACTIVITY_TIMEOUT_MS = 300000;
  const INVENTORY_MAXIMUM_TIMEOUT_MS = 1800000;

  /**
   * Register the renderer client for JDT's authoritative workspace inventory.
   * @param {object} app Application module registry.
   * @param {object} deps JDT session and shared JSON-RPC dependencies.
   * @returns {object} JDT inventory client API.
   */
  function registerMarkdownViewerJdtProjectInventoryClient(app, deps = {}) {
    /**
     * Query the active JDT session for projects imported in one analysis generation.
     * @param {object} request Workspace and generation identity.
     * @returns {Promise<object>} Generation-correlated JDT inventory response.
     */
    async function requestInventory(request = {}) {
      const workspaceRoot = String(request.workspaceRoot || "");
      const generationId = Number(request.generationId) || 0;
      const session = deps.getJdtSession?.(workspaceRoot);
      if (!session?.transport) throw new Error("JDT session is unavailable for project inventory validation.");
      const result = await deps.requestClient?.request?.(
        session.transport,
        "workspace/executeCommand",
        { command: COMMAND_ID, arguments: [{ generationId }] },
        {
          timeoutMs: INVENTORY_INACTIVITY_TIMEOUT_MS,
          maximumTimeoutMs: INVENTORY_MAXIMUM_TIMEOUT_MS,
          resetTimeoutOnMessage: true,
          label: "the JDT project inventory"
        }
      );
      if (!result || Number(result.generationId) !== generationId) {
        throw new Error("JDT returned a stale project inventory.");
      }
      return {
        generationId,
        capturedAt: Number(result.capturedAt) || 0,
        projects: Array.isArray(result.projects) ? result.projects.map((project) => ({ ...project })) : []
      };
    }

    const api = { requestInventory };
    app?.registerModule?.("jdtProjectInventoryClient", api);
    return api;
  }

  global.registerMarkdownViewerJdtProjectInventoryClient = registerMarkdownViewerJdtProjectInventoryClient;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJdtProjectInventoryClient };
  }
})(typeof window !== "undefined" ? window : globalThis);
