(function(global) {
  "use strict";

  /** Records one correlated timeline for Java, Kotlin, AJDT, and Problems diagnostics. */
  function registerMarkdownViewerDiagnosticLifecycleTrace(app, deps = {}) {
    let generation = 0;
    let workspaceRoot = "";
    let generationStartedAt = 0;
    const latestProviderCounts = new Map();

    function now() {
      return Number(deps.now?.()) || Date.now();
    }

    function write(milestone, details = {}) {
      const timestamp = now();
      const payload = {
        generation,
        milestone: String(milestone || "unknown"),
        workspaceRoot,
        timestamp,
        elapsedMs: generationStartedAt ? Math.max(0, timestamp - generationStartedAt) : 0,
        providerCounts: Object.fromEntries(Array.from(latestProviderCounts, ([providerId, counts]) => [providerId, { ...counts }])),
        ...details
      };
      try {
        const pending = deps.debugLog?.("info", "[lsp] Diagnostic lifecycle", payload);
        pending?.catch?.(() => {});
      } catch (_error) {
        // Diagnostic tracing must never interrupt language-server analysis.
      }
      return payload;
    }

    /**
     * Begin a correlated diagnostic lifecycle generation.
     * @param {string} reason Business event that invalidated the previous generation.
     * @param {object} details Workspace and provider context for the new generation.
     * @returns {object} The emitted generation-start record.
     */
    function startGeneration(reason, details = {}) {
      const requestedGeneration = Number(details.generationId);
      generation = Number.isFinite(requestedGeneration) && requestedGeneration > 0 ? requestedGeneration : generation + 1;
      workspaceRoot = String(details.workspaceRoot || deps.getWorkspaceRoot?.() || workspaceRoot || "");
      generationStartedAt = now();
      latestProviderCounts.clear();
      return write("generation-started", { reason: String(reason || "unspecified"), ...details });
    }

    /**
     * Record one lifecycle milestone against the active generation.
     * @param {string} milestone Stable machine-readable milestone name.
     * @param {object} details Provider-specific evidence for the milestone.
     * @returns {object} The emitted milestone record.
     */
    function mark(milestone, details = {}) {
      if (!generation) startGeneration("implicit", { workspaceRoot: details.workspaceRoot });
      Object.entries(details.providerCounts || {}).forEach(([providerId, counts]) => {
        latestProviderCounts.set(providerId, { ...(latestProviderCounts.get(providerId) || {}), ...counts });
      });
      return write(milestone, details);
    }

    /**
     * Record one provider snapshot using normalized severity counts.
     * @param {string} providerId Diagnostic provider identifier.
     * @param {object} summary Provider summary or snapshot.
     * @returns {object} The emitted provider-snapshot record.
     */
    function markProviderSnapshot(providerId, summary = {}) {
      const counts = summary.counts || {};
      const normalizedProviderId = String(providerId || "unknown");
      const normalizedCounts = {
        totalCount: Number(summary.totalCount ?? summary.total) || 0,
        availableCount: Number(summary.availableCount) || 0,
        error: Number(counts.error) || 0,
        warning: Number(counts.warning) || 0,
        info: Number(counts.info ?? counts.information) || 0
      };
      latestProviderCounts.set(normalizedProviderId, normalizedCounts);
      return mark("provider-snapshot", {
        workspaceRoot: String(summary.workspaceRoot || workspaceRoot || ""),
        providerId: normalizedProviderId,
        sessionKey: String(summary.sessionKey || ""),
        revision: Number(summary.revision ?? summary.snapshotRevision) || 0,
        snapshotId: String(summary.snapshotId || summary.id || ""),
        totalCount: normalizedCounts.totalCount,
        availableCount: normalizedCounts.availableCount,
        counts: {
          error: normalizedCounts.error,
          warning: normalizedCounts.warning,
          info: normalizedCounts.info
        },
        analysisAvailable: summary.analysisAvailable !== false,
        failureCode: String(summary.failure?.code || ""),
        lastPublication: summary.lastPublication || null
      });
    }

    function closeWorkspace(details = {}) {
      if (generation) write("workspace-closed", details);
      workspaceRoot = "";
      generationStartedAt = 0;
      latestProviderCounts.clear();
    }

    const api = {
      closeWorkspace,
      getGeneration: () => generation,
      mark,
      markProviderSnapshot,
      startGeneration
    };
    app?.registerModule?.("diagnosticLifecycleTrace", api);
    return api;
  }

  global.registerMarkdownViewerDiagnosticLifecycleTrace = registerMarkdownViewerDiagnosticLifecycleTrace;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerDiagnosticLifecycleTrace };
  }
})(typeof window !== "undefined" ? window : globalThis);
