(function(global) {
  "use strict";
  const ABI_COMMAND_STALL_TIMEOUT_MS = 300000;
  const ABI_COMMAND_MAXIMUM_TIMEOUT_MS = 1800000;
  const ABI_CONFIRMATION_RETRY_DELAYS_MS = Object.freeze([250, 750]);
  const reconciliationPolicy = global.markdownViewerKotlinAbiReconciliationPolicy
    || (typeof require === "function" ? require("./kotlin-abi-reconciliation-policy.js") : null);

  /** Calls adapter methods, rejects expired responses, and coordinates Kotlin ABI installation in JDT. */
  function registerMarkdownViewerKotlinAdapterClient(app, deps = {}) {
    let nextId = 1;
    let workspaceSession = null;
    let latestSummary = { id: "0", total: 0, counts: { error: 0, warning: 0, information: 0 } };
    let latestStatus = { phase: "closed", message: "Kotlin: Closed" };
    const pending = new Map();
    const activeAbiRequestIds = new Set();
    const problemListeners = new Set();
    const statusListeners = new Set();
    const abiListeners = new Set();

    function attachSession(session) {
      if (!session?.transport || session.kotlinAdapterAttached) return session;
      session.kotlinAdapterAttached = true;
      session.transport.subscribe((message) => {
        let response;
        try { response = JSON.parse(message); } catch (_error) { return; }
        touchSessionActivity(session, response);
        if (response.method === "mdEditor/kotlin/problemsChanged") {
          latestSummary = response.params || latestSummary;
          problemListeners.forEach((listener) => listener(latestSummary));
          return;
        }
        if (response.method === "mdEditor/kotlin/status") {
          latestStatus = response.params || latestStatus;
          statusListeners.forEach((listener) => listener(latestStatus));
          return;
        }
        if (response.method === "mdEditor/kotlin/abiChanged") {
          abiListeners.forEach((listener) => listener(response.params));
          return;
        }
        const request = pending.get(String(response.id));
        if (!request) return;
        pending.delete(String(response.id));
        clearRequestTimers(request);
        response.error ? request.reject(new Error(response.error.message || "Language-server request failed.")) : request.resolve(response.result);
      });
      return session;
    }

    function setWorkspaceSession(session) {
      workspaceSession = attachSession(session);
      return workspaceSession;
    }

    function request(session, method, params = {}, timeoutMs) {
      attachSession(session);
      if (!session?.transport) throw new Error("Kotlin language-server session is unavailable.");
      const id = `kotlin-adapter-${nextId++}`;
      const defaultTimeout = method === "mdEditor/kotlin/refreshModel" ? 900000 : 30000;
      const timing = typeof timeoutMs === "object" && timeoutMs
        ? {
            stallTimeoutMs: Number(timeoutMs.stallTimeoutMs) || defaultTimeout,
            maximumTimeoutMs: Number(timeoutMs.maximumTimeoutMs) || Number(timeoutMs.stallTimeoutMs) || defaultTimeout,
            operation: String(timeoutMs.operation || ""),
            onActivity: typeof timeoutMs.onActivity === "function" ? timeoutMs.onActivity : null
          }
        : { stallTimeoutMs: Number(timeoutMs) || defaultTimeout, maximumTimeoutMs: Number(timeoutMs) || defaultTimeout, operation: "", onActivity: null };
      const promise = new Promise((resolve, reject) => {
        const request = { id, resolve, reject, method, params, session, ...timing, stallTimer: null, maximumTimer: null };
        request.maximumTimer = global.setTimeout(() => {
          pending.delete(id);
          clearRequestTimers(request);
          reject(new Error(`${method} exceeded its maximum wait of ${timing.maximumTimeoutMs} ms.`));
        }, timing.maximumTimeoutMs);
        pending.set(id, request);
        armStallTimer(id, request);
      });
      session.transport.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      promise.requestId = id;
      return promise;
    }

    function armStallTimer(id, request) {
      global.clearTimeout(request.stallTimer);
      request.stallTimer = global.setTimeout(() => {
        pending.delete(id);
        clearRequestTimers(request);
        request.reject(new Error(`${request.method} stalled for ${request.stallTimeoutMs} ms.`));
      }, request.stallTimeoutMs);
    }

    function touchSessionActivity(session, response = {}) {
      for (const [id, request] of pending) {
        if (request.session !== session) continue;
        armStallTimer(id, request);
        request.onActivity?.({
          requestId: id,
          responseId: String(response.id ?? ""),
          method: String(response.method || "response")
        });
      }
    }

    function clearRequestTimers(request) {
      global.clearTimeout(request.stallTimer);
      global.clearTimeout(request.maximumTimer);
    }


    /** Cancel one pending JSON-RPC request and notify its language-server transport. */
    function cancelRequest(id, reason = "Request cancelled.") {
      const key = String(id || "");
      const request = pending.get(key);
      if (!request) return false;
      pending.delete(key);
      activeAbiRequestIds.delete(key);
      clearRequestTimers(request);
      try {
        request.session?.transport?.send?.(JSON.stringify({
          jsonrpc: "2.0",
          method: "$/cancelRequest",
          params: { id: key }
        }));
      } catch (_error) {
        // Local rejection still settles the UI when the transport has already closed.
      }
      const error = new Error(String(reason || "Request cancelled."));
      error.code = "request-cancelled";
      request.reject(error);
      return true;
    }

    /** Cancel every active Kotlin ABI reconciliation request. */
    function cancelAbiReconciliation(reason) {
      let cancelled = 0;
      for (const id of Array.from(activeAbiRequestIds)) if (cancelRequest(id, reason)) cancelled += 1;
      return cancelled;
    }
    async function refreshModel(options = {}) {
      return request(options.session || workspaceSession, "mdEditor/kotlin/refreshModel", { force: options.force === true, generationId: Number(options.generationId) || 0 });
    }

    async function getAbiSnapshot(options = {}) {
      return request(options.session || workspaceSession, "mdEditor/kotlin/getAbiSnapshot", {});
    }

    async function confirmAbiApplied(workspaceRevision, options = {}) {
      return request(options.session || workspaceSession, "mdEditor/kotlin/confirmAbiApplied", { workspaceRevision });
    }

    async function applyAbiToJdt(snapshot, jdtSession, options = {}) {
      if (!snapshot || !jdtSession?.transport) return null;
      const groups = new Map();
      for (const entry of snapshot.entries || []) {
        if (!groups.has(entry.projectUri)) groups.set(entry.projectUri, []);
        groups.get(entry.projectUri).push({
          jar: deps.fromFileUri?.(entry.jarUri) || entry.jarUri,
          contentHash: entry.contentHash || "",
          expectedFqns: Array.isArray(entry.expectedFqns) ? entry.expectedFqns : [],
          test: entry.test === true,
          patchModule: entry.patchModule || undefined
        });
      }
      const projects = Array.from(groups, ([project, entries]) => ({ project, entries }));
      const reconciliationRequest = {
        command: "mdeditor.kotlin.reconcileAbiClasspaths",
        arguments: [{
          metadataVersion: Number(snapshot.metadataVersion) || 0,
          generationId: Number(jdtSession.generationId) || 0,
          revision: snapshot.workspaceRevision,
          snapshotUri: snapshot.snapshotUri || "",
          projects,
          removedProjectUris: snapshot.removedProjectUris || []
        }]
      };
      const snapshotEvidence = reconciliationPolicy?.summarizeSnapshot?.(snapshot) || {};
      let result = null;
      let unconfirmed = [];
      let attempt = 0;
      let missingResourceRetryIndex = 0;
      let confirmationRetryIndex = 0;
      while (true) {
        attempt += 1;
        options.onAttempt?.({ attempt, generationId: Number(jdtSession.generationId) || 0, snapshot: snapshotEvidence });
        const pendingRequest = request(jdtSession, "workspace/executeCommand", reconciliationRequest, {
          stallTimeoutMs: ABI_COMMAND_STALL_TIMEOUT_MS,
          maximumTimeoutMs: ABI_COMMAND_MAXIMUM_TIMEOUT_MS,
          operation: "kotlin-abi-reconciliation",
          onActivity: (activity) => options.onActivity?.({ attempt, phase: "transport-activity", ...activity })
        });
        activeAbiRequestIds.add(pendingRequest.requestId);
        try {
          result = await pendingRequest;
        } finally {
          activeAbiRequestIds.delete(pendingRequest.requestId);
        }
        const resultEvidence = reconciliationPolicy?.summarizeResult?.(result) || result || {};
        options.onResult?.({ attempt, result: resultEvidence });
        const missingProjects = Array.isArray(result?.missingProjects) ? result.missingProjects : [];
        const missingJars = Array.isArray(result?.missingJars) ? result.missingJars : [];
        if (missingProjects.length || missingJars.length) {
          const retryDelay = reconciliationPolicy?.getMissingResourceRetryDelay?.(result, missingResourceRetryIndex);
          if (retryDelay !== null && retryDelay !== undefined) {
            missingResourceRetryIndex += 1;
            options.onRetry?.({ attempt, phase: "missing-resources", delayMs: retryDelay, result: resultEvidence });
            await waitForAbiConfirmation(retryDelay);
            continue;
          }
          throw createAbiFailure("kotlin-abi-resources-missing",
            `JDT could not reconcile the Kotlin ABI classpath (${missingProjects.length} projects, ${missingJars.length} JARs pending).`,
            { attempt, snapshot: snapshotEvidence, result: resultEvidence });
        }
        const uncoveredProjects = findUncoveredAbiProjects(projects, result);
        if (uncoveredProjects.length) {
          throw createAbiFailure("kotlin-abi-projects-uncovered",
            `JDT did not report reconciliation for ${uncoveredProjects.length} Kotlin ABI projects: ${uncoveredProjects.join("; ")}`,
            { attempt, snapshot: snapshotEvidence, result: resultEvidence, uncoveredProjects });
        }
        if (String(result?.revision || "") !== String(snapshot.workspaceRevision || "")) {
          throw createAbiFailure("kotlin-abi-revision-mismatch",
            `JDT confirmed Kotlin ABI revision ${String(result?.revision || "")}, expected ${String(snapshot.workspaceRevision || "")}.`,
            { attempt, snapshot: snapshotEvidence, result: resultEvidence });
        }
        const expectedGenerationId = Number(jdtSession.generationId) || 0;
        if (expectedGenerationId && Number(result?.generationId) !== expectedGenerationId) {
          throw createAbiFailure("kotlin-abi-generation-mismatch",
            `JDT confirmed Kotlin ABI generation ${Number(result?.generationId) || 0}, expected ${expectedGenerationId}.`,
            { attempt, snapshot: snapshotEvidence, result: resultEvidence });
        }
        if (result?.verificationMetadataComplete === false) {
          throw createAbiFailure("kotlin-abi-metadata-incomplete", "JDT rejected incomplete Kotlin ABI verification metadata.",
            { attempt, snapshot: snapshotEvidence, result: resultEvidence });
        }
        const unresolvedTypes = Array.isArray(result?.unresolvedTypes) ? result.unresolvedTypes : [];
        const incompatibleClassFiles = Array.isArray(result?.incompatibleClassFiles) ? result.incompatibleClassFiles : [];
        if (unresolvedTypes.length || incompatibleClassFiles.length) {
          const first = unresolvedTypes[0]?.fqn || incompatibleClassFiles[0]?.fqn || "unknown type";
          throw createAbiFailure("kotlin-abi-verification-failed",
            `JDT could not verify the Kotlin ABI (${unresolvedTypes.length} unresolved types, ${incompatibleClassFiles.length} incompatible class files). First failure: ${first}`,
            { attempt, snapshot: snapshotEvidence, result: resultEvidence });
        }
        unconfirmed = findUnconfirmedAbiEntries(projects, result);
        if (!unconfirmed.length) return result;
        const retryDelay = ABI_CONFIRMATION_RETRY_DELAYS_MS[confirmationRetryIndex];
        if (retryDelay === undefined) break;
        confirmationRetryIndex += 1;
        options.onRetry?.({ attempt, phase: "unconfirmed-entries", delayMs: retryDelay, result: resultEvidence, unconfirmed });
        await waitForAbiConfirmation(retryDelay);
      }
      const details = unconfirmed.map((entry) => `${entry.project} -> ${entry.jar}`).join("; ");
      throw createAbiFailure("kotlin-abi-confirmation-incomplete",
        `JDT did not confirm ${unconfirmed.length} Kotlin ABI classpath entries: ${details}`,
        { attempt, snapshot: snapshotEvidence, result: reconciliationPolicy?.summarizeResult?.(result) || result || {}, unconfirmed });
    }

    function createAbiFailure(code, message, evidence) {
      if (reconciliationPolicy?.createFailure) return reconciliationPolicy.createFailure(code, message, evidence);
      const error = new Error(message);
      error.code = code;
      error.evidence = evidence;
      return error;
    }

    function waitForAbiConfirmation(delayMs) {
      if (typeof deps.wait === "function") return deps.wait(delayMs);
      return new Promise((resolve) => global.setTimeout(resolve, delayMs));
    }

    /**
     * Ask JDT to rebuild the workspace incrementally after a Kotlin ABI installation.
     *
     * Filling the MD_EDITOR_KOTLIN_ABI container does not reliably schedule an Eclipse
     * build on its own, so diagnostics compiled before the ABI arrived (for example
     * "cannot be resolved" errors for Kotlin types) would otherwise never be retracted.
     * The request resolves when JDT finishes the build and has republished diagnostics.
     *
     * @param {object} jdtSession - Session wrapper exposing the JDT transport.
     * @returns {Promise<number|null>} The JDT build status, or null without a session.
     */
    async function requestJdtWorkspaceBuild(jdtSession) {
      if (!jdtSession?.transport) return null;
      // `java/buildWorkspace` takes a bare boolean: false requests an incremental build.
      return request(jdtSession, "java/buildWorkspace", false, {
        stallTimeoutMs: ABI_COMMAND_STALL_TIMEOUT_MS,
        maximumTimeoutMs: ABI_COMMAND_MAXIMUM_TIMEOUT_MS
      });
    }

    async function clearAbiFromJdt(snapshot, jdtSession) {
      if (!jdtSession?.transport) return null;
      return request(jdtSession, "workspace/executeCommand", {
        command: "mdeditor.kotlin.reconcileAbiClasspaths",
        arguments: [{
          metadataVersion: 2,
          revision: snapshot?.workspaceRevision || "disabled",
          snapshotUri: "",
          projects: [],
          removedProjectUris: (snapshot?.entries || []).map((entry) => entry.projectUri)
        }]
      }, { stallTimeoutMs: ABI_COMMAND_STALL_TIMEOUT_MS, maximumTimeoutMs: ABI_COMMAND_MAXIMUM_TIMEOUT_MS });
    }

    function createProblemsProvider(getSession = () => workspaceSession) {
      return {
        async getSummary(workspaceRoot) {
          const session = await getSession();
          if (!session) return latestSummary;
          const page = await request(session, "mdEditor/kotlin/getProblems", { workspaceRoot, offset: 0, limit: 0 });
          latestSummary = { id: page.id, total: page.total, counts: page.counts };
          return latestSummary;
        },
        async getProblems(query) {
          const session = await getSession();
          return session ? request(session, "mdEditor/kotlin/getProblems", query) : { ...latestSummary, problems: [] };
        },
        subscribe(listener) {
          problemListeners.add(listener);
          return () => problemListeners.delete(listener);
        }
      };
    }

    function subscribeStatus(listener) {
      statusListeners.add(listener);
      listener(latestStatus);
      return () => statusListeners.delete(listener);
    }

    function subscribeAbi(listener) {
      abiListeners.add(listener);
      return () => abiListeners.delete(listener);
    }

    const api = {
      attachSession,
      cancelRequest,
      cancelAbiReconciliation,
      setWorkspaceSession,
      request,
      refreshModel,
      getAbiSnapshot,
      applyAbiToJdt,
      requestJdtWorkspaceBuild,
      clearAbiFromJdt,
      confirmAbiApplied,
      createProblemsProvider,
      subscribeStatus,
      subscribeAbi,
      getStatus() { return latestStatus; },
      getWorkspaceSession() { return workspaceSession; }
    };
    app?.registerModule?.("kotlinAdapterClient", api);
    return api;
  }

  function normalizeAbiPath(value) {
    return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  }

  function findUnconfirmedAbiEntries(projects, result) {
    const confirmed = new Set((result?.effectiveEntries || [])
      .map((entry) => `${normalizeAbiPath(entry?.project)}|${normalizeAbiPath(entry?.jar)}`));
    return projects.flatMap(({ project, entries }) => entries
      .filter((entry) => !confirmed.has(`${normalizeAbiPath(project)}|${normalizeAbiPath(entry.jar)}`))
      .map((entry) => ({ project, jar: entry.jar })));
  }

  function findUncoveredAbiProjects(projects, result) {
    const covered = new Set([
      ...(Array.isArray(result?.appliedProjects) ? result.appliedProjects : []),
      ...(Array.isArray(result?.unchangedProjects) ? result.unchangedProjects : [])
    ].map(normalizeAbiPath));
    return projects.map(({ project }) => project).filter((project) => !covered.has(normalizeAbiPath(project)));
  }

  global.registerMarkdownViewerKotlinAdapterClient = registerMarkdownViewerKotlinAdapterClient;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerKotlinAdapterClient };
})(typeof window !== "undefined" ? window : globalThis);
