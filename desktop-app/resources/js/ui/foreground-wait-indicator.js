(function(global) {
  "use strict";

  /** Owns the non-blocking UI shown when foreground actions wait unusually long. */
  function registerMarkdownViewerForegroundWaitIndicator(app, deps = {}) {
    const rootElement = deps.rootElement || global.document?.body || null;
    const statusId = "foreground-file-open";
    const delayMs = Number.isFinite(Number(deps.delayMs)) ? Math.max(0, Number(deps.delayMs)) : 400;
    const schedule = deps.setTimeout || global.setTimeout?.bind(global);
    const cancelSchedule = deps.clearTimeout || global.clearTimeout?.bind(global);
    const pending = new Map();
    let nextTokenId = 1;

    function render() {
      const isWaiting = Array.from(pending.values()).some((entry) => entry.delayed);
      rootElement?.classList?.toggle("app-foreground-waiting", isWaiting);
      if (rootElement) rootElement.setAttribute("aria-busy", isWaiting ? "true" : "false");
      const statusManager = deps.getStatusManager?.() || app.modules?.statusManager;
      if (isWaiting) {
        const count = pending.size;
        statusManager?.setStatus?.({
          id: statusId,
          label: count === 1 ? "Opening file..." : `Opening ${count} files...`,
          showProgress: true,
          priority: -10
        });
      } else statusManager?.unsetStatus?.(statusId);
    }

    /**
     * Track one foreground action and reveal the wait UI only if it exceeds the delay.
     * @returns {Function} Idempotent release function for the tracked action.
     */
    function begin() {
      const tokenId = nextTokenId++;
      const entry = { delayed: false, timer: null };
      pending.set(tokenId, entry);
      const reveal = function revealDelayedWait() {
        if (!pending.has(tokenId)) return;
        entry.delayed = true;
        entry.timer = null;
        render();
      };
      if (schedule) entry.timer = schedule(reveal, delayMs);
      else reveal();

      let released = false;
      return function release() {
        if (released) return;
        released = true;
        if (entry.timer !== null && cancelSchedule) cancelSchedule(entry.timer);
        pending.delete(tokenId);
        render();
      };
    }

    /** Cancel all outstanding wait indications, such as when the workspace closes. */
    function clear() {
      pending.forEach((entry) => {
        if (entry.timer !== null && cancelSchedule) cancelSchedule(entry.timer);
      });
      pending.clear();
      render();
    }

    const api = { begin, clear };
    app.registerModule?.("foregroundWaitIndicator", api);
    render();
    return api;
  }

  global.registerMarkdownViewerForegroundWaitIndicator = registerMarkdownViewerForegroundWaitIndicator;
})(typeof window !== "undefined" ? window : globalThis);
