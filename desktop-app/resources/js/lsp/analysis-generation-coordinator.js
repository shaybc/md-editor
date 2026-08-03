(function(global) {
  "use strict";

  const DEFAULT_STALL_TIMEOUT_MS = 300000;
  const DEFAULT_MAXIMUM_TIMEOUT_MS = 1800000;
  const COMMIT_RETRY_DELAY_MS = 100;

  /** Owns the single completion decision for project-wide language analysis. */
  function registerMarkdownViewerAnalysisGenerationCoordinator(app, deps = {}) {
    const listeners = new Set();
    let nextGenerationId = 1;
    let stallTimer = null;
    let maximumTimer = null;
    let commitRetryTimer = null;
    let lastRequest = null;
    let state = createIdleState();

    function createIdleState() {
      return {
        status: "idle",
        generationId: 0,
        workspaceRoot: "",
        reason: "",
        requirementsResolved: false,
        requirements: normalizeRequirements(),
        providers: createProviderState(normalizeRequirements()),
        failure: null,
        inactivity: null,
        startedAt: 0,
        lastProgressAt: 0,
        committedAt: 0
      };
    }

    function normalizeRequirements(requirements = {}) {
      const jdt = requirements.jdt === true;
      const kotlin = requirements.kotlin === true;
      const ajdt = requirements.ajdt === true;
      const expectedProjectRoots = Array.from(new Set(
        (requirements.expectedProjectRoots || []).map(normalizePathValue).filter(Boolean)
      ));
      const expectedSourceRoots = Array.from(new Set(
        (requirements.expectedSourceRoots || []).map(normalizePathValue).filter(Boolean)
      ));
      return {
        jdt,
        kotlin,
        ajdt,
        jdtImportRequired: jdt && requirements.jdtImportRequired === true,
        kotlinAbiRequired: jdt && kotlin && requirements.kotlinAbiRequired !== false,
        expectedProjectRoots,
        expectedSourceRoots
      };
    }

    function createProviderState(requirements) {
      return {
        jdt: {
          required: requirements.jdt,
          serviceReady: !requirements.jdt,
          importReady: !requirements.jdt || !requirements.jdtImportRequired,
          initialBuildComplete: !requirements.jdt,
          finalBuildRequested: false,
          finalBuildResponse: false,
          finalBuildComplete: false,
          finalizationRequested: false,
          settled: !requirements.jdt,
          snapshotId: "",
          inventoryStatus: requirements.jdt ? "waiting" : "skipped",
          inventory: [],
          validatedProjectRoots: [],
          scopeEvidence: null
        },
        kotlin: {
          required: requirements.kotlin,
          abiReady: !requirements.kotlinAbiRequired,
          ready: !requirements.kotlin,
          snapshotId: ""
        },
        ajdt: {
          required: requirements.ajdt,
          outcome: requirements.ajdt ? "waiting" : "skipped"
        }
      };
    }

    function cloneState() {
      return {
        ...state,
        requirements: {
          ...state.requirements,
          expectedProjectRoots: [...state.requirements.expectedProjectRoots],
          expectedSourceRoots: [...state.requirements.expectedSourceRoots]
        },
        providers: {
          jdt: {
            ...state.providers.jdt,
            inventory: [...state.providers.jdt.inventory],
            validatedProjectRoots: [...state.providers.jdt.validatedProjectRoots],
            scopeEvidence: state.providers.jdt.scopeEvidence ? { ...state.providers.jdt.scopeEvidence } : null
          },
          kotlin: { ...state.providers.kotlin },
          ajdt: { ...state.providers.ajdt }
        },
        failure: state.failure ? {
          ...state.failure,
          details: state.failure.details ? { ...state.failure.details } : null
        } : null,
        inactivity: state.inactivity ? { ...state.inactivity } : null
      };
    }

    function publish() {
      const snapshot = cloneState();
      listeners.forEach((listener) => {
        try { listener(snapshot); } catch (_error) { /* Observers cannot interrupt analysis. */ }
      });
      deps.onStateChanged?.(snapshot);
      return snapshot;
    }

    function clearTimers() {
      global.clearTimeout(stallTimer);
      global.clearTimeout(maximumTimer);
      global.clearTimeout(commitRetryTimer);
      stallTimer = null;
      maximumTimer = null;
      commitRetryTimer = null;
    }

    function armStallTimer() {
      global.clearTimeout(stallTimer);
      if (state.status !== "running" && state.status !== "committing") return;
      const generationId = state.generationId;
      const timeoutMs = Number(deps.stallTimeoutMs) || DEFAULT_STALL_TIMEOUT_MS;
      stallTimer = global.setTimeout(() => {
        reportInactivity({
          generationId,
          kind: "idle",
          code: "analysis-generation-stalled",
          summary: "Project analysis stopped making progress."
        });
      }, timeoutMs);
      stallTimer.unref?.();
    }

    function armMaximumTimer() {
      global.clearTimeout(maximumTimer);
      const generationId = state.generationId;
      const timeoutMs = Number(deps.maximumTimeoutMs) || DEFAULT_MAXIMUM_TIMEOUT_MS;
      maximumTimer = global.setTimeout(() => {
        reportInactivity({
          generationId,
          kind: "maximum-duration",
          code: "analysis-generation-timeout",
          summary: "Project analysis exceeded its maximum duration."
        });
      }, timeoutMs);
      maximumTimer.unref?.();
    }

    function touch(milestone, details = {}) {
      if (state.status !== "running" && state.status !== "committing") return;
      const resumedFrom = state.inactivity;
      state.lastProgressAt = Date.now();
      state.inactivity = null;
      armStallTimer();
      if (resumedFrom) {
        deps.diagnosticLifecycleTrace?.mark?.("analysis-generation-progress-resumed", {
          generationId: state.generationId,
          workspaceRoot: state.workspaceRoot,
          previousInactivityCode: resumedFrom.code
        });
      }
      deps.diagnosticLifecycleTrace?.mark?.(milestone, {
        generationId: state.generationId,
        workspaceRoot: state.workspaceRoot,
        ...details
      });
    }

    /** Record a lack of observed progress without failing a generation that may still be working. */
    function reportInactivity(event = {}) {
      if (!isCurrent({ ...event, workspaceRoot: event.workspaceRoot || state.workspaceRoot })
          || !["running", "committing"].includes(state.status)) return false;
      const detectedAt = Date.now();
      state.inactivity = {
        kind: String(event.kind || "idle"),
        code: String(event.code || "analysis-generation-inactive"),
        summary: String(event.summary || "Project analysis has not reported recent progress."),
        detectedAt,
        idleForMs: Math.max(0, detectedAt - (state.lastProgressAt || state.startedAt || detectedAt))
      };
      deps.diagnosticLifecycleTrace?.mark?.("analysis-generation-inactivity-observed", {
        generationId: state.generationId,
        workspaceRoot: state.workspaceRoot,
        ...state.inactivity
      });
      const snapshot = cloneState();
      deps.onInactivity?.(snapshot);
      publish();
      if (state.inactivity.kind === "idle") armStallTimer();
      return true;
    }

    function isCurrent(event = {}) {
      const generationId = Number(event.generationId);
      const workspaceRoot = String(event.workspaceRoot || state.workspaceRoot || "");
      const matches = generationId === state.generationId
        && normalizePath(workspaceRoot) === normalizePath(state.workspaceRoot);
      if (!matches) {
        deps.diagnosticLifecycleTrace?.mark?.("stale-generation-event-ignored", {
          generationId: state.generationId,
          workspaceRoot: state.workspaceRoot,
          eventGenerationId: generationId,
          eventWorkspaceRoot: workspaceRoot,
          eventType: String(event.type || event.phase || "")
        });
      }
      return matches;
    }

    /**
     * Begin a new project-analysis generation and supersede all pending completion work.
     * @param {object} request Workspace, reason, and optional frozen provider requirements.
     * @returns {number} The new generation identifier.
     */
    function beginGeneration(request = {}) {
      clearTimers();
      const workspaceRoot = String(request.workspaceRoot || deps.getWorkspaceRoot?.() || "");
      const workspaceChanged = normalizePath(workspaceRoot) !== normalizePath(state.workspaceRoot);
      const requirementsResolved = request.requirements !== undefined && request.requirements !== null;
      const requirements = normalizeRequirements(request.requirements || {});
      const previousValidatedRoots = workspaceChanged ? [] : [...(state.providers?.jdt?.validatedProjectRoots || [])];
      const generationId = nextGenerationId++;
      state = {
        status: workspaceRoot ? "running" : "idle",
        generationId,
        workspaceRoot,
        reason: String(request.reason || "unspecified"),
        requirementsResolved,
        requirements,
        providers: createProviderState(requirements),
        failure: null,
        inactivity: null,
        startedAt: Date.now(),
        lastProgressAt: Date.now(),
        committedAt: 0
      };
      if (request.jdtReady === true && requirements.jdt) {
        state.providers.jdt.serviceReady = true;
        state.providers.jdt.importReady = true;
        state.providers.jdt.initialBuildComplete = true;
        if (previousValidatedRoots.length) {
          state.providers.jdt.inventoryStatus = "validated";
          state.providers.jdt.validatedProjectRoots = previousValidatedRoots;
        }
      }
      if (request.kotlinReady === true && requirements.kotlin) state.providers.kotlin.ready = true;
      if (request.kotlinAbiReady === true && requirements.kotlinAbiRequired) state.providers.kotlin.abiReady = true;
      lastRequest = { workspaceRoot, reason: state.reason, requirements };
      if (workspaceChanged) deps.clearProblemsWorkspace?.(workspaceRoot);
      deps.diagnosticLifecycleTrace?.startGeneration?.(state.reason, { generationId, workspaceRoot });
      deps.onGenerationStarted?.(cloneState());
      if (state.status === "running") {
        armStallTimer();
        armMaximumTimer();
        void advance();
      }
      publish();
      return generationId;
    }

    /**
     * Resolve and freeze the provider requirements discovered for the active workspace.
     * @param {object} event Generation identity plus the detected provider requirements.
     * @returns {boolean} Whether the active generation accepted the requirements.
     */
    function setRequirements(event = {}) {
      if (!isCurrent(event) || state.status !== "running" || state.requirementsResolved) return false;
      const requirements = normalizeRequirements(event.requirements);
      state.requirements = requirements;
      state.requirementsResolved = true;
      state.providers = createProviderState(requirements);
      lastRequest = { workspaceRoot: state.workspaceRoot, reason: state.reason, requirements };
      touch("analysis-requirements-resolved", { requirements });
      publish();
      void advance();
      return true;
    }

    /**
     * Accept one JDT service/import/build lifecycle event for the active generation.
     * @param {object} event Generation identity and JDT lifecycle phase.
     * @returns {boolean} Whether the event was accepted.
     */
    function acceptJdtLifecycle(event = {}) {
      const phase = String(event.phase || "");
      if ((state.status === "committed" || state.status === "incomplete") && phase === "build-started"
          && normalizePath(event.workspaceRoot) === normalizePath(state.workspaceRoot)) {
        const kotlinReady = state.providers.kotlin.ready;
        const kotlinAbiReady = state.providers.kotlin.abiReady;
        const generationId = beginGeneration({
          workspaceRoot: state.workspaceRoot,
          reason: "jdt-autobuild",
          requirements: state.requirements,
          jdtReady: true,
          kotlinReady,
          kotlinAbiReady
        });
        deps.onAutobuildGeneration?.({ generationId, workspaceRoot: state.workspaceRoot });
        return true;
      }
      if (!isCurrent(event) || state.status !== "running") return false;
      const jdt = state.providers.jdt;
      if (phase === "service-ready") jdt.serviceReady = true;
      if (phase === "import-complete") jdt.importReady = true;
      if (phase === "build-complete") {
        if (jdt.finalBuildRequested) jdt.finalBuildComplete = true;
        else {
          jdt.initialBuildComplete = true;
          // JDT's initial managed workspace build runs only after its automatic
          // Maven/Gradle import has produced the projects that can be validated.
          jdt.importReady = true;
        }
      }
      if (jdt.serviceReady && jdt.importReady && jdt.initialBuildComplete && jdt.inventoryStatus === "waiting") {
        void requestJdtProjectInventory();
      }
      touch(`analysis-${phase}`, { message: String(event.message || "") });
      publish();
      void advance();
      return true;
    }

    /** Mark the Kotlin ABI classpath as installed and confirmed for this generation. */
    function markKotlinAbiReady(event = {}) {
      if (!isCurrent(event) || state.status !== "running") return false;
      state.providers.kotlin.abiReady = true;
      touch("analysis-kotlin-abi-ready", { workspaceRevision: String(event.workspaceRevision || "") });
      publish();
      void advance();
      return true;
    }

    /** Mark the Kotlin diagnostic provider as ready to contribute a stable snapshot. */
    function markKotlinReady(event = {}) {
      if (!isCurrent(event) || state.status !== "running") return false;
      state.providers.kotlin.ready = true;
      state.providers.kotlin.snapshotId = String(event.snapshotId || "");
      touch("analysis-kotlin-ready", { snapshotId: state.providers.kotlin.snapshotId });
      publish();
      void advance();
      return true;
    }

    /** Record provider progress so a healthy long-running generation does not stall. */
    function markProgress(event = {}) {
      if (!isCurrent(event) || !["running", "committing"].includes(state.status)) return false;
      touch(String(event.milestone || "analysis-provider-progress"), {
        providerId: String(event.providerId || ""),
        message: String(event.message || "")
      });
      return true;
    }

    /** Accept the immutable JDT snapshot emitted after the final diagnostic quiet window. */
    function markJdtDiagnosticsSettled(event = {}) {
      if (!isCurrent(event) || state.status !== "running") return false;
      state.providers.jdt.settled = true;
      state.providers.jdt.snapshotId = String(event.snapshotId || "");
      touch("analysis-jdt-diagnostics-settled", { snapshotId: state.providers.jdt.snapshotId });
      publish();
      void advance();
      return true;
    }

    /** Invalidate a provisional JDT settle when another current-generation publication arrives. */
    function markJdtDiagnosticsUnsettled(event = {}) {
      if (!isCurrent(event) || !["running", "committing"].includes(state.status)) return false;
      state.status = "running";
      state.providers.jdt.settled = false;
      state.providers.jdt.snapshotId = "";
      touch("analysis-jdt-diagnostics-unsettled");
      publish();
      return true;
    }

    /** Record the terminal AJDT outcome; an enabled-provider failure fails the generation. */
    function markAjdtTerminal(event = {}) {
      if (!isCurrent(event) || state.status !== "running") return false;
      const outcome = String(event.outcome || "");
      if (outcome === "failed") {
        markIncomplete({
          generationId: state.generationId,
          providerId: "ajdt",
          code: event.code || "ajdt-diagnostics-failed",
          summary: event.summary || event.reason || "AJDT analysis failed."
        });
        return true;
      }
      state.providers.ajdt.outcome = outcome === "ready" ? "ready" : "skipped";
      touch("analysis-ajdt-terminal", { outcome: state.providers.ajdt.outcome });
      publish();
      void advance();
      return true;
    }

    /** Mark a required provider failure without releasing a partial Problems snapshot. */
    function markIncomplete(event = {}) {
      if (!isCurrent({ ...event, workspaceRoot: event.workspaceRoot || state.workspaceRoot })
          || !["running", "committing"].includes(state.status)) return false;
      clearTimers();
      state.status = "incomplete";
      state.failure = {
        providerId: String(event.providerId || "coordinator"),
        code: String(event.code || "analysis-generation-failed"),
        summary: String(event.summary || "Project analysis did not complete."),
        fatal: event.fatal !== false,
        notificationHandled: event.notificationHandled === true,
        details: event.details && typeof event.details === "object" ? { ...event.details } : null
      };
      deps.diagnosticLifecycleTrace?.mark?.("analysis-generation-incomplete", {
        generationId: state.generationId,
        workspaceRoot: state.workspaceRoot,
        providerId: state.failure.providerId,
        failureCode: state.failure.code,
        message: state.failure.summary
      });
      try {
        deps.onIncomplete?.(cloneState());
      } catch (error) {
        deps.diagnosticLifecycleTrace?.mark?.("analysis-incomplete-handler-failed", {
          generationId: state.generationId,
          workspaceRoot: state.workspaceRoot,
          message: String(error?.message || error)
        });
      }
      publish();
      return true;
    }

    async function requestJdtProjectInventory() {
      const generationId = state.generationId;
      const workspaceRoot = state.workspaceRoot;
      const jdt = state.providers.jdt;
      if (!jdt.required || jdt.inventoryStatus !== "waiting") return;
      jdt.inventoryStatus = "loading";
      touch("analysis-jdt-project-inventory-requested");
      publish();
      try {
        const inventory = await deps.requestJdtProjectInventory?.({ generationId, workspaceRoot });
        if (!isCurrent({ generationId, workspaceRoot }) || state.status !== "running") return;
        const validation = deps.validateJdtProjectScope?.({
          expectedProjectRoots: state.requirements.expectedProjectRoots,
          expectedSourceRoots: state.requirements.expectedSourceRoots,
          projects: inventory?.projects || []
        });
        if (!validation?.valid) {
          jdt.inventoryStatus = "failed";
          jdt.inventory = validation?.projects || inventory?.projects || [];
          jdt.scopeEvidence = validation || null;
          deps.onJdtProjectScopeFailed?.({ generationId, workspaceRoot, validation, inventory });
          markIncomplete({
            generationId,
            workspaceRoot,
            providerId: "jdt",
            code: "jdt-project-scope-mismatch",
            summary: "JDT did not import every selected Java analysis module.",
            details: { scopeEvidence: validation }
          });
          return;
        }
        jdt.inventoryStatus = "validated";
        jdt.inventory = validation.projects;
        jdt.validatedProjectRoots = validation.validatedProjectRoots;
        jdt.scopeEvidence = validation;
        touch("analysis-jdt-project-inventory-validated", {
          projectCount: jdt.validatedProjectRoots.length,
          unexpectedProjectCount: validation.unexpectedProjects.length
        });
        deps.onJdtProjectScopeValidated?.({
          generationId,
          workspaceRoot,
          validatedProjectRoots: [...jdt.validatedProjectRoots],
          validation
        });
        publish();
        void advance();
      } catch (error) {
        if (!isCurrent({ generationId, workspaceRoot }) || state.status !== "running") return;
        jdt.inventoryStatus = "failed";
        deps.onJdtProjectScopeFailed?.({ generationId, workspaceRoot, error });
        markIncomplete({
          generationId,
          workspaceRoot,
          providerId: "jdt",
          code: "jdt-project-inventory-failed",
          summary: String(error?.message || error)
        });
      }
    }

    function prerequisitesReady() {
      if (!state.requirementsResolved) return false;
      const { jdt, kotlin } = state.providers;
      if (jdt.required && (!jdt.serviceReady || !jdt.importReady || !jdt.initialBuildComplete)) return false;
      if (jdt.required && jdt.inventoryStatus !== "validated") return false;
      if (kotlin.required && !kotlin.ready) return false;
      if (kotlin.required && state.requirements.kotlinAbiRequired && !kotlin.abiReady) return false;
      return true;
    }

    async function requestFinalBuild() {
      const generationId = state.generationId;
      const jdt = state.providers.jdt;
      jdt.finalBuildRequested = true;
      jdt.finalBuildResponse = false;
      jdt.finalBuildComplete = false;
      touch("analysis-final-jdt-build-requested");
      publish();
      try {
        await deps.requestFinalJdtBuild?.({ generationId, workspaceRoot: state.workspaceRoot });
        if (!isCurrent({ generationId, workspaceRoot: state.workspaceRoot }) || state.status !== "running") return;
        jdt.finalBuildResponse = true;
        touch("analysis-final-jdt-build-response");
        publish();
        void advance();
      } catch (error) {
        markIncomplete({
          generationId,
          providerId: "jdt",
          code: "jdt-final-build-failed",
          summary: String(error?.message || error)
        });
      }
    }

    async function requestJdtFinalization() {
      const generationId = state.generationId;
      const jdt = state.providers.jdt;
      jdt.finalizationRequested = true;
      touch("analysis-jdt-finalization-requested");
      publish();
      try {
        const accepted = await deps.finalizeJdtGeneration?.({
          generationId,
          workspaceRoot: state.workspaceRoot,
          ajdtRequired: state.providers.ajdt.required,
          validatedProjectRoots: [...jdt.validatedProjectRoots]
        });
        if (accepted === false) throw new Error("The JDT proxy rejected the analysis generation.");
      } catch (error) {
        markIncomplete({
          generationId,
          providerId: "jdt",
          code: "jdt-finalization-failed",
          summary: String(error?.message || error)
        });
      }
    }

    function providersSettled() {
      const { jdt, kotlin, ajdt } = state.providers;
      return (!jdt.required || jdt.settled)
        && (!kotlin.required || kotlin.ready)
        && (!ajdt.required || ajdt.outcome === "ready");
    }

    async function commitGeneration() {
      const generationId = state.generationId;
      state.status = "committing";
      touch("analysis-problems-commit-started");
      publish();
      try {
        const result = await deps.commitProblemsGeneration?.({
          generationId,
          workspaceRoot: state.workspaceRoot,
          requiredProviderIds: [
            ...(state.providers.jdt.required ? ["jdt"] : []),
            ...(state.providers.kotlin.required ? ["kotlin"] : [])
          ],
          snapshotIds: {
            jdt: state.providers.jdt.snapshotId
          }
        });
        if (!isCurrent({ generationId, workspaceRoot: state.workspaceRoot }) || state.status !== "committing") return;
        if (result?.stale === true) {
          state.status = "running";
          touch("analysis-problems-commit-retry");
          publish();
          commitRetryTimer = global.setTimeout(() => {
            commitRetryTimer = null;
            void advance();
          }, COMMIT_RETRY_DELAY_MS);
          commitRetryTimer.unref?.();
          return;
        }
        clearTimers();
        state.status = "committed";
        state.committedAt = Date.now();
        state.failure = null;
        deps.diagnosticLifecycleTrace?.mark?.("analysis-generation-committed", {
          generationId,
          workspaceRoot: state.workspaceRoot,
          snapshotId: String(result?.snapshotId || "")
        });
        deps.onCommitted?.(cloneState());
        publish();
      } catch (error) {
        markIncomplete({
          generationId,
          providerId: "coordinator",
          code: "problems-snapshot-commit-failed",
          summary: String(error?.message || error)
        });
      }
    }

    async function advance() {
      if (state.status !== "running" || !prerequisitesReady()) return;
      const jdt = state.providers.jdt;
      if (jdt.required && !jdt.finalBuildRequested) {
        void requestFinalBuild();
        return;
      }
      if (jdt.required && (!jdt.finalBuildResponse || !jdt.finalBuildComplete)) return;
      if (jdt.required && !jdt.finalizationRequested) {
        void requestJdtFinalization();
        return;
      }
      if (!providersSettled()) return;
      void commitGeneration();
    }

    /** Begin another generation using the active workspace and frozen requirements. */
    function retry() {
      if (!lastRequest?.workspaceRoot) return 0;
      const providerState = state.providers;
      return beginGeneration({
        workspaceRoot: lastRequest.workspaceRoot,
        reason: "analysis-retry",
        requirements: lastRequest.requirements,
        jdtReady: providerState.jdt.serviceReady && providerState.jdt.importReady,
        kotlinReady: providerState.kotlin.ready,
        kotlinAbiReady: providerState.kotlin.abiReady
      });
    }

    /** Close analysis state and clear results that belong to the closed workspace. */
    function closeWorkspace() {
      clearTimers();
      const workspaceRoot = state.workspaceRoot;
      state = createIdleState();
      lastRequest = null;
      deps.clearProblemsWorkspace?.("");
      deps.diagnosticLifecycleTrace?.closeWorkspace?.({ workspaceRoot });
      publish();
    }

    /**
     * Notify the coordinator that a provider changed outside an active generation.
     * @param {string} providerId Diagnostic provider identifier.
     * @returns {number} A new generation ID, or the active ID while already running.
     */
    function invalidateProvider(providerId) {
      if (state.status === "running" || state.status === "committing") {
        touch("analysis-provider-invalidated", { providerId: String(providerId || "") });
        return state.generationId;
      }
      if (state.status !== "committed") return state.generationId;
      if (!state.workspaceRoot || !lastRequest) return 0;
      const jdtReady = state.providers.jdt.serviceReady && state.providers.jdt.importReady;
      const kotlinReady = state.providers.kotlin.ready;
      const kotlinAbiReady = state.providers.kotlin.abiReady;
      return beginGeneration({
        workspaceRoot: state.workspaceRoot,
        reason: `${String(providerId || "provider")}-diagnostics-changed`,
        requirements: state.requirements,
        jdtReady,
        kotlinReady,
        kotlinAbiReady
      });
    }

    function subscribe(listener) {
      if (typeof listener !== "function") return function() {};
      listeners.add(listener);
      listener(cloneState());
      return () => listeners.delete(listener);
    }

    const api = {
      beginGeneration,
      setRequirements,
      acceptJdtLifecycle,
      markKotlinAbiReady,
      markKotlinReady,
      markProgress,
      markJdtDiagnosticsSettled,
      markJdtDiagnosticsUnsettled,
      markAjdtTerminal,
      markIncomplete,
      invalidateProvider,
      retry,
      closeWorkspace,
      getValidatedProjectRoots: function() { return [...state.providers.jdt.validatedProjectRoots]; },
      getState: cloneState,
      subscribe
    };
    app?.registerModule?.("analysisGenerationCoordinator", api);
    return api;
  }

  function normalizePath(value) {
    return normalizePathValue(value).toLowerCase();
  }

  function normalizePathValue(value) {
    return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
  }

  global.registerMarkdownViewerAnalysisGenerationCoordinator = registerMarkdownViewerAnalysisGenerationCoordinator;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerAnalysisGenerationCoordinator };
  }
})(typeof window !== "undefined" ? window : globalThis);
