(function(global) {
  "use strict";

  /** Classifies repeated JDT import failures and opens the workspace circuit breaker. */
  function registerMarkdownViewerJavaAnalysisFailureMonitor(app, deps = {}) {
    const FAILURE_WINDOW_MS = 30000;
    const REPEAT_THRESHOLD = 3;
    const occurrences = new Map();
    const notified = new Set();

    function hashText(value) {
      let hash = 2166136261;
      const text = String(value || "");
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(16);
    }

    function classify(message) {
      const text = String(message || "");
      if (/Unsupported class file major version\s+\d+/i.test(text)) {
        return { code: "jdk-incompatible", fatal: true, summary: text.match(/Unsupported class file major version\s+\d+/i)?.[0] || "Incompatible Java runtime" };
      }
      if (/Cannot invoke[^\r\n]*ProjectDescription[^\r\n]*internalGetDescription\(\)[^\r\n]*null|JDT project initialization failed|Java project initialization failed|Initialization failed/i.test(text)) {
        return { code: "jdt-initialization-failed", fatal: true, summary: "JDT project initialization failed." };
      }
      if (/Resolution of the configuration[^\r\n]*attempted without an exclusive lock/i.test(text)) {
        return { code: "gradle-import-failed", fatal: true, reason: "exclusive-lock-required", summary: "Gradle project import failed because configuration resolution was attempted without the required exclusive lock." };
      }
      if (/Could not fetch model of type|The supplied phased action failed/i.test(text)) {
        return { code: "gradle-import-failed", fatal: true, summary: "Java project initialization failed." };
      }
      if (/Synchronize Gradle projects? with workspace failed|error connecting to the Gradle build/i.test(text)) {
        return { code: "gradle-import-failed", fatal: false, summary: "Gradle project synchronization failed." };
      }
      if (/Maven.*(?:import|configuration).*(?:failed|error)|Failed to update Maven project/i.test(text)) {
        return { code: "maven-import-failed", fatal: false, summary: "Maven project synchronization failed." };
      }
      return null;
    }

    /** Record one reduced worker failure and return a circuit-break decision. */
    function record(event) {
      const classification = event?.code ? event : classify(event?.message);
      if (!classification) return null;
      const workspaceId = String(event?.workspaceId || "java");
      const fingerprint = String(event?.fingerprint || `${classification.code}:${hashText(event?.message || classification.summary)}`);
      const key = `${workspaceId}:${fingerprint}`;
      const now = Number(event?.timestamp || Date.now());
      const previous = occurrences.get(key);
      const workerCount = Number(event?.count);
      const count = Number.isFinite(workerCount) && workerCount > 0
        ? Math.floor(workerCount)
        : (previous && now - previous.firstAt <= FAILURE_WINDOW_MS ? previous.count + 1 : 1);
      const record = { firstAt: previous && count > 1 ? previous.firstAt : now, lastAt: now, count };
      occurrences.set(key, record);
      return Object.assign({}, classification, {
        workspaceId,
        fingerprint,
        count,
        trip: classification.fatal === true || count >= REPEAT_THRESHOLD,
        shouldNotify: !notified.has(key)
      });
    }

    function markNotified(workspaceId, fingerprint) {
      notified.add(`${workspaceId}:${fingerprint}`);
    }

    function reset(workspaceId, options = {}) {
      const prefix = `${String(workspaceId || "")}:`;
      Array.from(occurrences.keys()).forEach((key) => { if (key.startsWith(prefix)) occurrences.delete(key); });
      if (options.preserveNotifications !== true) {
        Array.from(notified).forEach((key) => { if (key.startsWith(prefix)) notified.delete(key); });
      }
    }

    const api = { classify, markNotified, record, reset };
    app?.registerModule?.("javaAnalysisFailureMonitor", api);
    return api;
  }

  global.registerMarkdownViewerJavaAnalysisFailureMonitor = registerMarkdownViewerJavaAnalysisFailureMonitor;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJavaAnalysisFailureMonitor };
  }
})(typeof window !== "undefined" ? window : globalThis);
