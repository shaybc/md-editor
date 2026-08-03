(function(global) {
  "use strict";

  /** Combines JDT/AJDT and Kotlin diagnostics into one stable severity-first project snapshot. */
  function registerMarkdownViewerProjectProblemsBroker(app, deps = {}) {
    const providers = new Map();
    const listeners = new Set();
    let revision = 0;
    let refreshGeneration = 0;
    let refreshTimer = null;
    let retryTimer = null;
    let current = createSnapshot([], 0, null, { generationId: 0, workspaceRoot: "" });
    const PROVIDER_RETRY_DELAY_MS = 2000;

    function maximumProblems() {
      return Math.max(1, Number(deps.getMaximumProblems?.()) || 5000);
    }

    function registerProvider(id, provider) {
      providers.get(id)?.unsubscribe?.();
      const registration = { provider, unsubscribe: function() {}, serial: 0 };
      registration.unsubscribe = provider?.subscribe?.((summary) => {
        registration.serial += 1;
        if (typeof deps.onProviderInvalidated === "function") deps.onProviderInvalidated(id, summary);
        else scheduleRefresh();
      }) || function() {};
      providers.set(id, registration);
      if (typeof deps.onProviderInvalidated === "function") deps.onProviderInvalidated(id);
      else scheduleRefresh();
      return function unregister() {
        const registered = providers.get(id);
        registered?.unsubscribe?.();
        providers.delete(id);
        scheduleRefresh();
      };
    }

    function scheduleRefresh() {
      if (typeof deps.onProviderInvalidated === "function") {
        deps.onProviderInvalidated("project-problems");
        return;
      }
      if (refreshTimer) return;
      refreshTimer = global.setTimeout(() => {
        refreshTimer = null;
        void refresh();
      }, 100);
      refreshTimer.unref?.();
    }

    /**
     * Collect one provider's filtered problem rows.
     *
     * @returns {Promise<{rows: Array, reportedTotal: number}|null>} null when the
     *   provider failed this round; the refresh must continue with the others.
     */
    async function collectProviderRows(providerId, provider, workspaceRoot, expectedSnapshotId = "") {
      const summary = await provider.getSummary(workspaceRoot);
      const providerTotal = Number(summary?.total ?? summary?.totalCount) || 0;
      const snapshotId = String(expectedSnapshotId || summary?.id || summary?.snapshotId || "");
      if (!providerTotal && !expectedSnapshotId) return { rows: [], reportedTotal: 0, snapshotId };
      const page = await provider.getProblems({
        workspaceRoot,
        snapshotId,
        offset: 0,
        limit: maximumProblems()
      });
      if (page?.stale === true) return { stale: true };
      let removed = 0;
      const rows = [];
      for (const problem of page?.problems || []) {
        if (provider.filterProblem && provider.filterProblem(problem) === false) {
          removed += 1;
          continue;
        }
        rows.push(normalizeProblem(problem, providerId));
      }
      if (!expectedSnapshotId) {
        const confirmedSummary = await provider.getSummary(workspaceRoot);
        const confirmedSnapshotId = String(confirmedSummary?.id || confirmedSummary?.snapshotId || "");
        if (confirmedSnapshotId !== snapshotId) return { stale: true };
      }
      return {
        rows,
        reportedTotal: removed ? rows.length : Number(page?.totalCount ?? page?.total ?? providerTotal) || 0,
        snapshotId: String(page?.snapshotId || snapshotId)
      };
    }

    /** Atomically publish one complete generation assembled from pinned provider snapshots. */
    async function commitGeneration(request = {}) {
      const generationId = Number(request.generationId) || 0;
      const workspaceRoot = String(request.workspaceRoot || "");
      const requiredProviderIds = Array.from(new Set(request.requiredProviderIds || []));
      const rows = [];
      let reportedTotal = 0;
      const providerCounts = {};
      const reportedCounts = { error: 0, warning: 0, information: 0 };
      for (const providerId of requiredProviderIds) {
        const registration = providers.get(providerId);
        if (!registration) throw new Error(`The ${providerId} problem provider is unavailable.`);
        const expectedSnapshotId = String(request.snapshotIds?.[providerId] || "");
        const providerSerial = registration.serial;
        const collected = await collectProviderRows(providerId, registration.provider, workspaceRoot, expectedSnapshotId);
        if (deps.isGenerationCurrent?.(generationId, workspaceRoot) === false) return { stale: true };
        if (collected?.stale === true || (!expectedSnapshotId && providerSerial !== registration.serial)) return { stale: true };
        providerCounts[providerId] = {
          totalCount: Number(collected?.reportedTotal) || 0,
          availableCount: collected?.rows?.length || 0,
          snapshotId: String(collected?.snapshotId || expectedSnapshotId)
        };
        for (const problem of collected?.rows || []) {
          rows.push(problem);
          reportedCounts[problem.severity] += 1;
        }
        reportedTotal += Number(collected?.reportedTotal) || 0;
      }
      if (deps.isGenerationCurrent?.(generationId, workspaceRoot) === false) return { stale: true };
      rows.sort(compareProblems);
      revision += 1;
      current = freezeSnapshot(createSnapshot(rows.slice(0, maximumProblems()), Math.max(reportedTotal, rows.length), reportedCounts, {
        generationId,
        workspaceRoot,
        providerCounts
      }));
      deps.diagnosticLifecycleTrace?.mark?.("problems-snapshot-released", {
        generationId,
        workspaceRoot,
        snapshotId: current.snapshotId,
        totalCount: current.totalCount,
        availableCount: current.availableCount,
        counts: Object.assign({}, current.counts),
        providerCounts,
        providerFailed: false
      });
      listeners.forEach((listener) => listener(getSummary()));
      return getSummary();
    }

    /** Clear committed diagnostics when the active workspace identity changes. */
    function clearWorkspace(workspaceRoot = "") {
      const normalizedCurrent = normalizeLocation(current.workspaceRoot);
      const normalizedNext = normalizeLocation(workspaceRoot);
      if (normalizedCurrent && normalizedCurrent === normalizedNext) return current;
      revision += 1;
      current = createSnapshot([], 0, null, { generationId: 0, workspaceRoot: String(workspaceRoot || "") });
      listeners.forEach((listener) => listener(getSummary()));
      return current;
    }

    async function refresh(workspaceRoot = deps.getWorkspaceRoot?.() || "") {
      const generation = ++refreshGeneration;
      const rows = [];
      let reportedTotal = 0;
      let providerFailed = false;
      const providerCounts = {};
      const reportedCounts = { error: 0, warning: 0, information: 0 };
      for (const [providerId, registration] of providers) {
        // One failing provider (a restarting language server, a timed-out query)
        // must not abort the refresh: aborting froze the snapshot at its last
        // state - potentially empty - while diagnostics kept flowing underneath.
        let collected = null;
        let retainedAfterFailure = false;
        try {
          collected = await collectProviderRows(providerId, registration.provider, workspaceRoot);
        } catch (_error) {
          providerFailed = true;
          retainedAfterFailure = true;
          // Retain the failing provider's previous rows so a transient outage
          // does not blank its problems while the retry is pending.
          const retained = current.problems.filter((problem) => problem.providerId === providerId);
          collected = { rows: retained, reportedTotal: retained.length };
        }
        if (generation !== refreshGeneration) return current;
        if (!collected) continue;
        providerCounts[providerId] = {
          totalCount: Number(collected.reportedTotal) || 0,
          availableCount: collected.rows.length,
          retainedAfterFailure
        };
        for (const problem of collected.rows) {
          rows.push(problem);
          reportedCounts[problem.severity] += 1;
        }
        reportedTotal += collected.reportedTotal;
      }
      const reconciled = reconcileStableRows(current.problems, rows, maximumProblems());
      revision += 1;
      current = createSnapshot(reconciled, Math.max(reportedTotal, rows.length), reportedCounts, {
        generationId: current.generationId,
        workspaceRoot
      });
      deps.diagnosticLifecycleTrace?.mark?.("problems-snapshot-released", {
        workspaceRoot,
        snapshotId: current.snapshotId,
        totalCount: current.totalCount,
        availableCount: current.availableCount,
        counts: Object.assign({}, current.counts),
        providerCounts,
        providerFailed
      });
      listeners.forEach((listener) => listener(getSummary()));
      if (providerFailed && !retryTimer) {
        retryTimer = global.setTimeout(() => {
          retryTimer = null;
          scheduleRefresh();
        }, PROVIDER_RETRY_DELAY_MS);
        // Retries are best-effort background work; they must not keep a Node
        // process (tests, tooling) alive on their own.
        retryTimer.unref?.();
      }
      return current;
    }

    function createSnapshot(problems, reportedTotal, reportedCounts, metadata = {}) {
      const counts = reportedCounts || problems.reduce((result, problem) => {
        result[problem.severity] += 1;
        return result;
      }, { error: 0, warning: 0, information: 0 });
      const snapshotId = String(revision);
      return {
        revision,
        snapshotRevision: revision,
        snapshotId,
        id: snapshotId,
        generationId: Number(metadata.generationId) || 0,
        workspaceRoot: String(metadata.workspaceRoot || ""),
        providerCounts: metadata.providerCounts || {},
        total: reportedTotal,
        totalCount: reportedTotal,
        availableCount: problems.length,
        maximumProblems: maximumProblems(),
        counts,
        problems
      };
    }

    function freezeSnapshot(snapshot) {
      const providerCounts = Object.freeze(Object.fromEntries(Object.entries(snapshot.providerCounts || {}).map(([id, counts]) => [id, Object.freeze({ ...counts })])));
      return Object.freeze({
        ...snapshot,
        counts: Object.freeze({ ...snapshot.counts }),
        providerCounts,
        problems: Object.freeze(snapshot.problems.map((problem) => Object.freeze({ ...problem })))
      });
    }

    function getSummary() {
      const { problems, ...summary } = current;
      return summary;
    }

    function getProblems(query = {}) {
      const requestedSnapshot = String(query.snapshotId || "");
      if (requestedSnapshot && requestedSnapshot !== current.snapshotId) {
        return { stale: true, ...getSummary(), problems: [] };
      }
      const offset = Math.max(0, Number(query.offset) || 0);
      const limit = Math.max(0, Number(query.limit) || 100);
      const rows = query.severity
        ? current.problems.filter((problem) => problem.severity === normalizeSeverity(query.severity))
        : current.problems;
      return { stale: false, ...getSummary(), problems: rows.slice(offset, offset + limit) };
    }

    function subscribe(listener) {
      if (typeof listener !== "function") return function() {};
      listeners.add(listener);
      listener(getSummary());
      return () => listeners.delete(listener);
    }

    const api = { registerProvider, refresh, commitGeneration, clearWorkspace, getSummary, getProblems, subscribe, scheduleRefresh };
    app?.registerModule?.("projectProblemsBroker", api);
    return api;
  }

  function reconcileStableRows(previous, incoming, limit) {
    const incomingById = new Map(incoming.map((problem) => [problem.id, problem]));
    const surviving = previous.filter((problem) => incomingById.has(problem.id)).map((problem) => incomingById.get(problem.id));
    const seen = new Set(surviving.map((problem) => problem.id));
    const additions = incoming.filter((problem) => !seen.has(problem.id)).sort(compareProblems);
    const grouped = ["error", "warning", "information"].flatMap((severity) => [
      ...surviving.filter((problem) => problem.severity === severity),
      ...additions.filter((problem) => problem.severity === severity)
    ]);
    return grouped.slice(0, limit);
  }

  function normalizeProblem(problem, providerId) {
    const severity = normalizeSeverity(problem.severity);
    const filePath = problem.filePath || problem.file || "";
    const id = String(problem.id || [providerId, filePath, problem.line, problem.column, problem.message].join("|"));
    return { ...problem, id: `${providerId}:${id}`, providerId, severity, filePath, file: problem.file || filePath };
  }

  function normalizeLocation(value) {
    return String(value || "").replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  }

  function normalizeSeverity(value) {
    const normalized = String(value || "information").toLowerCase();
    if (normalized === "error" || normalized === "1") return "error";
    if (normalized === "warning" || normalized === "2") return "warning";
    return "information";
  }

  function compareProblems(left, right) {
    const rank = { error: 0, warning: 1, information: 2 };
    return rank[left.severity] - rank[right.severity] || left.id.localeCompare(right.id);
  }

  global.registerMarkdownViewerProjectProblemsBroker = registerMarkdownViewerProjectProblemsBroker;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerProjectProblemsBroker, reconcileStableRows, normalizeProblem };
})(typeof window !== "undefined" ? window : globalThis);
