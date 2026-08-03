/** JDT lifecycle aggregation for concurrent project import and build activity. */
(function(global) {
  "use strict";

  /**
   * Create a tracker that keeps JDT busy until every reported project action finishes.
   * @param {{onLifecycle?: Function}} callbacks Receives normalized phase and message updates.
   * @returns {{acceptLifecycle: Function, acceptMessage: Function, getActiveCount: Function}} JDT activity tracker.
   */
  function createJdtActivityTracker(callbacks = {}) {
    const activeProgress = new Map();
    let completionPending = false;

    function isProjectActivity(value = {}) {
      return /import|gradle|maven|project.*(?:configuration|build|sync)|update project/i.test(`${value.title || ""} ${value.message || ""}`);
    }

    function getActivityMessage(value = {}) {
      return String(value.message || value.title || "Importing project...").trim();
    }

    function publishImportCompleteWhenIdle() {
      if (activeProgress.size || !completionPending) return;
      completionPending = false;
      callbacks.onLifecycle?.("import-complete", "Ready");
    }

    /**
     * Accept a lifecycle update already reduced by the workspace worker.
     * @param {string} phase Normalized JDT lifecycle phase.
     * @param {string} message User-facing activity detail.
     * @returns {boolean} Whether a phase was accepted.
     */
    function acceptLifecycle(phase, message = "") {
      if (phase === "import-complete") {
        completionPending = true;
        publishImportCompleteWhenIdle();
        return true;
      }
      if (phase === "importing") completionPending = false;
      callbacks.onLifecycle?.(phase, message);
      return Boolean(phase);
    }

    /**
     * Accept one decoded JDT protocol message and publish meaningful project activity.
     * @param {object} message Decoded JDT language-server protocol message.
     * @returns {boolean} Whether the message described tracked project activity.
     */
    function acceptMessage(message = {}) {
      const method = String(message.method || "");
      const type = String(message.params?.type || "");
      const statusMessage = String(message.params?.message || "");
      if (method === "language/status") {
        if (type === "ServiceReady") return acceptLifecycle("service-ready");
        // JDT also publishes Started/Ready when its fallback single-file project is usable.
        // Only explicit project-import events or completed import progress prove workspace readiness.
        if (isProjectActivity({ title: type, message: statusMessage })) return acceptLifecycle("importing", statusMessage);
        return false;
      }
      if (method === "language/eventNotification" && /^(?:200|ProjectsImported)$/i.test(type)) {
        return acceptLifecycle("import-complete", statusMessage);
      }
      if (method !== "$/progress") return false;

      const token = String(message.params?.token ?? "workspace");
      const value = message.params?.value || {};
      if (value.kind === "begin" && isProjectActivity(value)) {
        completionPending = false;
        activeProgress.set(token, value);
        callbacks.onLifecycle?.("importing", getActivityMessage(value));
        return true;
      }
      if (value.kind === "report" && activeProgress.has(token)) {
        activeProgress.set(token, value);
        callbacks.onLifecycle?.("importing", getActivityMessage(value));
        return true;
      }
      if (value.kind === "end" && activeProgress.delete(token)) {
        completionPending = true;
        publishImportCompleteWhenIdle();
        return true;
      }
      return false;
    }

    return { acceptLifecycle, acceptMessage, getActiveCount: () => activeProgress.size };
  }

  global.MarkdownViewerJdtActivityTracker = { createJdtActivityTracker };
})(typeof window !== "undefined" ? window : globalThis);
