(function(global) {
  global.registerMarkdownViewerTabsProfileWriteGate = function registerMarkdownViewerTabsProfileWriteGate(app, deps) {
    const api = {};

    with (deps) {
    let pauseDepth = 0;
    let pendingSnapshot = null;
    let writeTimer = null;

    function isEnabled() {
      return typeof deps?.isEnabled === "function" ? deps.isEnabled() : true;
    }

    function cloneSnapshot(snapshot) {
      return typeof deps?.cloneSnapshot === "function" ? deps.cloneSnapshot(snapshot) : snapshot;
    }

    function log(level, message, details) {
      if (typeof deps?.appDebugLog === "function") {
        void deps.appDebugLog(level, `[tabs-session] ${message}`, details);
      }
    }

    function clearWriteTimer() {
      if (writeTimer !== null) {
        clearTimeout(writeTimer);
        writeTimer = null;
      }
    }

    async function flushNow(reason = "flush") {
      if (!isEnabled()) return null;
      clearWriteTimer();
      if (pauseDepth > 0) {
        log("debug", "Deferred tabs profile write flush while paused", {
          reason,
          pauseDepth,
          hasPendingSnapshot: pendingSnapshot !== null
        });
        return null;
      }
      if (pendingSnapshot === null) return null;
      const snapshot = pendingSnapshot;
      pendingSnapshot = null;
      log("debug", "Flushing tabs profile write", {
        reason,
        tabCount: Array.isArray(snapshot) ? snapshot.length : 0
      });
      return deps.queueWrite?.(snapshot) || null;
    }

    function schedule(snapshot, reason = "schedule") {
      if (!isEnabled()) return null;
      pendingSnapshot = cloneSnapshot(snapshot);
      clearWriteTimer();
      if (pauseDepth > 0) {
        log("debug", "Deferred tabs profile write while paused", {
          reason,
          pauseDepth,
          tabCount: Array.isArray(pendingSnapshot) ? pendingSnapshot.length : 0
        });
        return null;
      }
      writeTimer = setTimeout(() => {
        writeTimer = null;
        void flushNow("timer");
      }, Number(deps?.delayMs ?? 100));
      return null;
    }

    function pause(reason = "operation") {
      pauseDepth += 1;
      clearWriteTimer();
      let resumed = false;
      log("debug", "Paused tabs profile writes", {
        reason,
        pauseDepth,
        hasPendingSnapshot: pendingSnapshot !== null
      });
      return async function resumeTabsProfileWrites() {
        if (resumed) return null;
        resumed = true;
        pauseDepth = Math.max(0, pauseDepth - 1);
        log("debug", "Resumed tabs profile writes", {
          reason,
          pauseDepth,
          hasPendingSnapshot: pendingSnapshot !== null
        });
        if (pauseDepth === 0) return flushNow(`resume:${reason}`);
        return null;
      };
    }

    async function withPaused(reason, work) {
      const resume = pause(reason);
      try {
        return await work();
      } finally {
        await resume();
      }
    }

    Object.assign(api, {
      flushNow,
      getPauseDepth: () => pauseDepth,
      hasPendingSnapshot: () => pendingSnapshot !== null,
      pause,
      schedule,
      withPaused
    });
    }

    app.registerModule?.("tabsProfileWriteGate", api);
    return api;
  };
})(window);
