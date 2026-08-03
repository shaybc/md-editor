(function(global) {
  "use strict";

  /**
   * Java workspace phases in which JDT is not running and will not reach "ready" without
   * an explicit user action (retry, JDK selection, document activation, reopen).
   * Kotlin must not wait on these with an "Importing" spinner — the wait would never end.
   */
  const JAVA_BLOCKED_PHASES = ["degraded", "runtime-required", "cancelling", "cancelled", "closed"];
  const JAVA_CLASSPATH_READY_PHASES = ["classpath-ready", "ready"];

  /** Coordinates Java import, Kotlin ABI analysis, JDT classpaths, status, and problem authority. */
  function registerMarkdownViewerKotlinWorkspaceCoordinator(app, deps = {}) {
    let context = null;
    let kotlinSession = null;
    let broker = null;
    let jdtProviderRegistered = false;
    let kotlinProviderRegistered = false;
    let mixedScopesReleased = true;
    let starting = null;
    let waitingForJavaRefresh = false;
    let pendingAbiSnapshot = null;
    let latestAbiSnapshot = null;
    let queuedAbiSnapshot = null;
    let activeAbiInstall = null;
    let needsAbiReconcile = true;
    let installedAbiRevision = "";
    let previousJavaPhase = "";
    let tracedAbiGenerationRevision = "";
    let latestJdtSummary = { revision: 0, totalCount: 0, availableCount: 0, maximumProblems: 5000 };
    let analysisReady = true;
    let analysisGenerationStatus = "idle";
    let reconciliationEpoch = 0;
    let latestAbiFailure = null;
    let lastReconciliationActivityTraceAt = 0;

    function setAnalysisReady(ready) {
      analysisReady = ready === true;
      deps.onAnalysisReady?.(analysisReady);
      if (analysisReady && context && deps.isAutoStartEnabled?.("kotlin") !== false) {
        const generation = deps.analysisGenerationCoordinator?.getState?.();
        deps.analysisGenerationCoordinator?.markKotlinReady?.({
          generationId: generation?.generationId,
          workspaceRoot: context.workspaceRoot
        });
      }
    }

    function onModelResolved(value) {
      const nextContext = value?.model?.hasKotlinContent ? value : null;
      if (!nextContext && kotlinSession) void setEnabled(false).catch(handleFailure);
      context = nextContext;
      clearStatus();
      kotlinSession = null;
      pendingAbiSnapshot = null;
      latestAbiSnapshot = null;
      queuedAbiSnapshot = null;
      needsAbiReconcile = true;
      installedAbiRevision = "";
      previousJavaPhase = "";
      analysisGenerationStatus = "idle";
      latestAbiFailure = null;
      reconciliationEpoch += 1;
      tracedAbiGenerationRevision = "";
      mixedScopesReleased = !context;
      setAnalysisReady(!context);
      waitingForJavaRefresh = false;
      ensureProviders();
      if (!context || deps.isAutoStartEnabled?.("kotlin") === false) {
        // Kotlin will never run for this workspace, so nothing may stay quarantined:
        // JDT must keep full problem authority, including Kotlin module scopes.
        mixedScopesReleased = true;
        setAnalysisReady(true);
        clearStatus();
        broker?.scheduleRefresh?.();
        return;
      }
      void continueStartup().catch(handleFailure);
    }

    /** Settle Kotlin state when JDT stopped without reaching "ready" (failed, blocked, or closed). */
    function onJavaUnavailable(phase) {
      waitingForJavaRefresh = false;
      pendingAbiSnapshot = null;
      // A blocked Java session has no live JDT diagnostics left to quarantine (the store is
      // cleared on fatal import failures), so release the mixed scopes and report the Kotlin
      // side as settled. This lets the Java failure problem stand alone instead of hiding it
      // behind a perpetual "analysis in progress" state.
      mixedScopesReleased = true;
      setAnalysisReady(true);
      if (phase === "closed") clearStatus();
      else setStatus(describeBlockedJavaStatus(phase), false);
      broker?.scheduleRefresh?.();
    }

    function onJavaStateChanged(state) {
      if (!context) return;
      const phase = String(state?.phase || "");
      const javaClasspathReady = isJavaAnalysisClasspathReady();
      const becameReady = isJavaClasspathReady(phase) && !isJavaClasspathReady(previousJavaPhase);
      previousJavaPhase = phase;
      // An ordinary JDT build temporarily uses the importing phase without
      // discarding the installed ABI container. Only a new Java session makes
      // the current Kotlin ABI revision stale.
      if (["detecting", "initializing", "restarting", "runtime-required", "closed"].includes(phase)) {
        needsAbiReconcile = true;
      }
      // Only a mixed Java/Kotlin project depends on the JDT lifecycle; pure-Kotlin
      // analysis proceeds regardless of the Java controller's phase.
      if (context.model.hasJavaContent === true && JAVA_BLOCKED_PHASES.includes(String(state?.phase || ""))) {
        onJavaUnavailable(String(state.phase));
        return;
      }
      if (!javaClasspathReady) setAnalysisReady(false);
      if (waitingForJavaRefresh && isJavaClasspathReady(state?.phase)) {
        waitingForJavaRefresh = false;
        mixedScopesReleased = true;
        setAnalysisReady(true);
        broker?.scheduleRefresh?.();
      }
      if (javaClasspathReady && pendingAbiSnapshot) {
        const snapshot = pendingAbiSnapshot;
        pendingAbiSnapshot = null;
        void installAbi(snapshot).catch(handleFailure);
        return;
      }
      if (isJavaClasspathReady(state?.phase) && latestAbiSnapshot && !activeAbiInstall
          && becameReady && needsAbiReconcile) {
        void installAbi(latestAbiSnapshot).catch(handleFailure);
        return;
      }
      if (javaClasspathReady && mixedScopesReleased) setAnalysisReady(true);
      void continueStartup().catch(handleFailure);
    }

    async function continueStartup() {
      if (!context || starting || kotlinSession) return starting;
      const hasJava = context.model.hasJavaContent === true;
      const javaPhase = String(deps.getJavaState?.()?.phase || "");
      if (hasJava && JAVA_BLOCKED_PHASES.includes(javaPhase)) {
        // Java terminally failed or was stopped: Kotlin ABI can never attach in this
        // session, so never claim an import is still running.
        onJavaUnavailable(javaPhase);
        return null;
      }
      if (hasJava && !isJavaAnalysisClasspathReady()) {
        setAnalysisReady(false);
        // "dormant" means JDT is waiting for activation, not importing — show a passive
        // waiting status instead of a progress spinner that nothing will ever complete.
        if (javaPhase === "dormant") setStatus("Kotlin: Waiting for Java analysis", false);
        else setStatus("Java: Importing (Kotlin ABI pending)", true);
        return null;
      }
      starting = startKotlin().finally(() => { starting = null; });
      return starting;
    }

    async function startKotlin() {
      const firstKotlin = context.model.kotlinSourceFiles?.[0];
      const server = deps.registry?.getServerForLanguage?.("kotlin");
      if (!firstKotlin || !server) return null;
      mixedScopesReleased = context.model.hasJavaContent !== true;
      setAnalysisReady(false);
      broker?.scheduleRefresh?.();
      setStatus("Kotlin: Importing project model", true);
      deps.diagnosticLifecycleTrace?.mark?.("kotlin-model-started", {
        workspaceRoot: context.workspaceRoot,
        sourceFile: firstKotlin
      });
      const session = await deps.bridge.ensureSession({ server, filePath: firstKotlin });
      if (!session) throw new Error("Kotlin language-server session could not be started.");
      kotlinSession = deps.kotlinClient.setWorkspaceSession(session);
      ensureProviders();
      const activeGeneration = deps.analysisGenerationCoordinator?.getState?.();
      const snapshot = await deps.kotlinClient.refreshModel({
        session: kotlinSession,
        generationId: activeGeneration?.generationId
      });
      latestAbiSnapshot = snapshot || null;
      deps.diagnosticLifecycleTrace?.mark?.("kotlin-model-completed", {
        workspaceRoot: context.workspaceRoot,
        workspaceRevision: String(snapshot?.workspaceRevision || ""),
        abiChanged: snapshot?.abiChanged === true,
        entryCount: Array.isArray(snapshot?.entries) ? snapshot.entries.length : 0
      });
      if (context.model.hasJavaContent && snapshot?.entries?.length) {
        if (isJavaAnalysisClasspathReady()) await installAbi(snapshot);
        else {
          pendingAbiSnapshot = snapshot;
          setStatus("Kotlin: Ready (Java classpath pending)", false);
        }
      } else {
        mixedScopesReleased = true;
        setAnalysisReady(true);
        broker?.scheduleRefresh?.();
      }
      return session;
    }

    function installAbi(snapshot) {
      if (!snapshot) return Promise.resolve();
      const workspaceRevision = String(snapshot.workspaceRevision || "");
      if (workspaceRevision && workspaceRevision === installedAbiRevision && !needsAbiReconcile) {
        return activeAbiInstall || Promise.resolve();
      }
      latestAbiSnapshot = snapshot;
      queuedAbiSnapshot = snapshot;
      if (activeAbiInstall) return activeAbiInstall;
      activeAbiInstall = (async () => {
        while (queuedAbiSnapshot) {
          const nextSnapshot = queuedAbiSnapshot;
          queuedAbiSnapshot = null;
          await performAbiInstall(nextSnapshot);
        }
      })().finally(() => { activeAbiInstall = null; });
      return activeAbiInstall;
    }

    async function performAbiInstall(snapshot) {
      const operationEpoch = ++reconciliationEpoch;
      const workspaceRevision = String(snapshot?.workspaceRevision || "");
      if (workspaceRevision && workspaceRevision !== tracedAbiGenerationRevision) {
        tracedAbiGenerationRevision = workspaceRevision;
        const previousGeneration = deps.analysisGenerationCoordinator?.getState?.();
        const jdtClasspathReady = isJavaAnalysisClasspathReady(previousGeneration);
        const generationId = deps.analysisGenerationCoordinator?.beginGeneration?.({
          workspaceRoot: context.workspaceRoot,
          reason: "kotlin-abi-refresh",
          requirements: previousGeneration?.requirements,
          jdtReady: jdtClasspathReady
        });
        if (jdtClasspathReady) {
          deps.analysisGenerationCoordinator?.acceptJdtLifecycle?.({ generationId, workspaceRoot: context.workspaceRoot, phase: "service-ready" });
          deps.analysisGenerationCoordinator?.acceptJdtLifecycle?.({ generationId, workspaceRoot: context.workspaceRoot, phase: "import-complete" });
        }
      }
      const key = `java:${deps.normalizePath(context.workspaceRoot)}`;
      const jdtSession = deps.jdtClient?.getSession?.(key);
      if (!jdtSession) throw new Error("JDT session is unavailable for Kotlin ABI installation.");
      deps.diagnosticLifecycleTrace?.mark?.("kotlin-abi-install-started", {
        workspaceRoot: context.workspaceRoot,
        workspaceRevision,
        entryCount: Array.isArray(snapshot?.entries) ? snapshot.entries.length : 0
      });
      setStatus("Java: Refreshing Kotlin classpath", true);
      waitingForJavaRefresh = true;
      deps.javaController?.markImporting?.("Java: Refreshing Kotlin classpath");
      const reconciliationStartedAt = Date.now();
      const generation = deps.analysisGenerationCoordinator?.getState?.();
      let reconciliation;
      try {
        reconciliation = await deps.kotlinClient.applyAbiToJdt(snapshot, {
          transport: jdtSession.transport,
          generationId: generation?.generationId
        }, {
          onAttempt(value) {
            markReconciliationProgress("attempt", value, generation, workspaceRevision);
          },
          onActivity(value) {
            const now = Date.now();
            deps.analysisGenerationCoordinator?.markProgress?.({
              generationId: generation?.generationId,
              workspaceRoot: context.workspaceRoot,
              providerId: "kotlin-abi",
              milestone: "analysis-kotlin-abi-activity",
              message: `Kotlin ABI reconciliation activity (${value.method || value.phase || "transport"})`
            });
            if (now - lastReconciliationActivityTraceAt >= 5000 || value.method === "response") {
              lastReconciliationActivityTraceAt = now;
              deps.diagnosticLifecycleTrace?.mark?.("kotlin-abi-reconciliation-activity", {
                generationId: generation?.generationId,
                workspaceRoot: context.workspaceRoot,
                workspaceRevision,
                ...value
              });
            }
          },
          onResult(value) {
            markReconciliationProgress("result", value, generation, workspaceRevision);
          },
          onRetry(value) {
            markReconciliationProgress("retry-scheduled", value, generation, workspaceRevision);
          }
        });
      } catch (error) {
        latestAbiFailure = createAbiFailureRecord(error, generation, workspaceRevision, reconciliationStartedAt);
        throw error;
      }
      if (operationEpoch !== reconciliationEpoch) return;
      latestAbiFailure = null;
      deps.diagnosticLifecycleTrace?.mark?.("kotlin-abi-verified", {
        generationId: generation?.generationId,
        workspaceRoot: context.workspaceRoot,
        workspaceRevision,
        sessionToken: String(reconciliation?.sessionToken || ""),
        effectiveEntryCount: Array.isArray(reconciliation?.effectiveEntries) ? reconciliation.effectiveEntries.length : 0,
        effectiveEntries: Array.isArray(reconciliation?.effectiveEntries) ? reconciliation.effectiveEntries : [],
        resolvedTypeCount: Number(reconciliation?.resolvedTypeCount) || 0,
        unresolvedTypes: Array.isArray(reconciliation?.unresolvedTypes) ? reconciliation.unresolvedTypes : [],
        incompatibleClassFiles: Array.isArray(reconciliation?.incompatibleClassFiles) ? reconciliation.incompatibleClassFiles : [],
        projects: Array.isArray(reconciliation?.projectVerification) ? reconciliation.projectVerification : [],
        workspaceProjects: Array.isArray(reconciliation?.workspaceProjects) ? reconciliation.workspaceProjects : []
      });
      deps.diagnosticLifecycleTrace?.mark?.("kotlin-abi-installed", {
        workspaceRoot: context.workspaceRoot,
        workspaceRevision,
        abiRevision: String(reconciliation?.revision || workspaceRevision),
        invalidatedProjectCount: Array.isArray(reconciliation?.invalidatedProjects) ? reconciliation.invalidatedProjects.length : 0,
        unchangedProjectCount: Array.isArray(reconciliation?.unchangedProjects) ? reconciliation.unchangedProjects.length : 0,
        durationMs: Date.now() - reconciliationStartedAt
      });
      deps.jdtClient?.updateKotlinAbiSnapshot?.(key, snapshot);
      if (operationEpoch !== reconciliationEpoch || latestAbiSnapshot?.workspaceRevision !== snapshot.workspaceRevision) return;
      const confirmed = await deps.kotlinClient.confirmAbiApplied(snapshot.workspaceRevision, { session: kotlinSession });
      if (confirmed === false) throw new Error("Kotlin ABI revision changed before JDT confirmation.");
      if (operationEpoch !== reconciliationEpoch) return;
      deps.diagnosticLifecycleTrace?.mark?.("kotlin-abi-confirmed", {
        workspaceRoot: context.workspaceRoot,
        workspaceRevision
      });
      const confirmedGeneration = deps.analysisGenerationCoordinator?.getState?.();
      deps.analysisGenerationCoordinator?.markKotlinAbiReady?.({
        generationId: confirmedGeneration?.generationId,
        workspaceRoot: context.workspaceRoot,
        workspaceRevision
      });
      if (latestAbiSnapshot?.workspaceRevision !== snapshot.workspaceRevision) return;
      waitingForJavaRefresh = false;
      installedAbiRevision = workspaceRevision;
      needsAbiReconcile = false;
      mixedScopesReleased = true;
      setAnalysisReady(true);
      setStatus("Java/Kotlin: Finalizing analysis", true);
    }

    function markReconciliationProgress(phase, value, generation, workspaceRevision) {
      deps.analysisGenerationCoordinator?.markProgress?.({
        generationId: generation?.generationId,
        workspaceRoot: context?.workspaceRoot || "",
        providerId: "kotlin-abi",
        milestone: `analysis-kotlin-abi-${phase}`,
        message: `Kotlin ABI reconciliation ${phase}`
      });
      deps.diagnosticLifecycleTrace?.mark?.(`kotlin-abi-reconciliation-${phase}`, {
        generationId: generation?.generationId,
        workspaceRoot: context?.workspaceRoot || "",
        workspaceRevision,
        ...value
      });
    }

    function createAbiFailureRecord(error, generation, workspaceRevision, startedAt) {
      return {
        code: String(error?.code || "kotlin-analysis-failed"),
        message: String(error?.message || error),
        evidence: error?.evidence || null,
        generationId: Number(generation?.generationId) || 0,
        workspaceRevision: String(workspaceRevision || ""),
        durationMs: Math.max(0, Date.now() - startedAt),
        jdtLogPath: String(deps.getJavaState?.()?.logPath || ""),
        occurredAt: Date.now()
      };
    }

    function ensureProviders() {
      if (!broker) return;
      if (!jdtProviderRegistered && deps.jdtClient) {
        jdtProviderRegistered = true;
        broker.registerProvider("jdt", {
          getSummary() { return { id: String(latestJdtSummary.snapshotId || latestJdtSummary.revision || 0), total: latestJdtSummary.totalCount || 0 }; },
          getProblems(query) { return deps.jdtClient.getProblems(query); },
          subscribe(listener) {
            return deps.jdtClient.subscribeDiagnosticSummary((summary) => {
              latestJdtSummary = summary || latestJdtSummary;
              listener(summary);
            });
          },
          filterProblem(problem) {
            return mixedScopesReleased || !belongsToKotlinScope(problem, context?.model?.kotlinModuleRoots || [], deps.normalizePath);
          }
        });
      }
      if (!kotlinProviderRegistered && deps.kotlinClient) {
        kotlinProviderRegistered = true;
        broker.registerProvider("kotlin", deps.kotlinClient.createProblemsProvider(() => kotlinSession));
        deps.kotlinClient.subscribeStatus((status) => {
          const phase = String(status?.phase || "");
          const generation = deps.analysisGenerationCoordinator?.getState?.();
          if (phase && phase !== "closed") {
            deps.analysisGenerationCoordinator?.markProgress?.({
              generationId: generation?.generationId,
              workspaceRoot: context?.workspaceRoot || "",
              providerId: "kotlin",
              milestone: "analysis-kotlin-progress",
              message: String(status?.message || phase)
            });
          }
          if (phase === "ready") {
            setAnalysisReady(mixedScopesReleased);
            if (analysisGenerationStatus === "incomplete") {
              setStatus("Java/Kotlin: Analysis incomplete", false);
            } else if (analysisGenerationStatus === "committed" || context?.model?.hasJavaContent !== true) {
              setStatus("Java/Kotlin: Ready", false);
            } else {
              setStatus("Java/Kotlin: Finalizing analysis", true);
            }
          }
          else if (phase !== "closed") setStatus(status?.message || `Kotlin: ${phase}`, !["ready", "failed", "stale"].includes(phase));
        });
        deps.kotlinClient.subscribeAbi((snapshot) => {
          latestAbiSnapshot = snapshot || latestAbiSnapshot;
          if (snapshot?.abiChanged && context?.model?.hasJavaContent) void installAbi(snapshot).catch(handleFailure);
        });
      }
    }

    async function setEnabled(enabled) {
      const activeSession = kotlinSession;
      const activeContext = context;
      if (!enabled && activeSession) {
        const snapshot = await deps.kotlinClient.getAbiSnapshot({ session: activeSession }).catch(() => null);
        const key = activeContext ? `java:${deps.normalizePath(activeContext.workspaceRoot)}` : "";
        const jdtSession = key ? deps.jdtClient?.getSession?.(key) : null;
        if (snapshot && jdtSession) {
          await deps.kotlinClient.clearAbiFromJdt(snapshot, { transport: jdtSession.transport });
          deps.jdtClient?.updateKotlinAbiSnapshot?.(key, null);
        }
      }
      kotlinSession = null;
      waitingForJavaRefresh = false;
      pendingAbiSnapshot = null;
      latestAbiSnapshot = null;
      queuedAbiSnapshot = null;
      needsAbiReconcile = true;
      tracedAbiGenerationRevision = "";
      latestAbiFailure = null;
      reconciliationEpoch += 1;
      installedAbiRevision = "";
      if (!enabled) {
        mixedScopesReleased = true;
        clearStatus();
        await deps.bridge?.stopServerSessions?.("kotlin");
        broker?.scheduleRefresh?.();
        return;
      }
      mixedScopesReleased = !context?.model?.hasJavaContent;
      broker?.scheduleRefresh?.();
      await continueStartup();
    }
    function setProblemsBroker(value) {
      broker = value;
      ensureProviders();
    }

    /**
     * Synchronize the mixed-language status with the canonical analysis generation.
     * @param {object} generation Canonical generation state for the active workspace.
     */
    function onAnalysisGenerationState(generation = {}) {
      if (!context || deps.normalizePath(generation.workspaceRoot) !== deps.normalizePath(context.workspaceRoot)) return;
      analysisGenerationStatus = String(generation.status || "idle");
      if (generation.status === "running" && pendingAbiSnapshot && isCanonicalJdtClasspathReady(generation)) {
        const snapshot = pendingAbiSnapshot;
        pendingAbiSnapshot = null;
        void installAbi(snapshot).catch(handleFailure);
      } else if (generation.status === "committed") {
        setStatus("Java/Kotlin: Ready", false);
      } else if (generation.status === "incomplete") {
        if (waitingForJavaRefresh || activeAbiInstall) {
          cancelActiveAbiReconciliation(generation.failure?.summary || "The analysis generation became incomplete.", {
            failureCode: generation.failure?.code || "analysis-incomplete"
          });
        } else {
          setStatus("Java/Kotlin: Analysis incomplete", false, "failed");
        }
      }
    }

    /** Cancel stale ABI work while preserving the JDT session and its native evidence. */
    function cancelActiveAbiReconciliation(reason, details = {}) {
      reconciliationEpoch += 1;
      queuedAbiSnapshot = null;
      waitingForJavaRefresh = false;
      const cancelledRequestCount = deps.kotlinClient?.cancelAbiReconciliation?.(reason) || 0;
      deps.diagnosticLifecycleTrace?.mark?.("kotlin-abi-reconciliation-cancelled", {
        workspaceRoot: context?.workspaceRoot || "",
        workspaceRevision: String(latestAbiSnapshot?.workspaceRevision || ""),
        cancelledRequestCount,
        reason: String(reason || "Kotlin ABI reconciliation cancelled."),
        ...details
      });
      deps.javaController?.markReady?.();
      setStatus("Java/Kotlin: Analysis incomplete", false, "failed");
      return cancelledRequestCount;
    }

    /** Retry the latest ABI snapshot without restarting an otherwise healthy JDT session. */
    async function retryAbiReconciliation() {
      if (!context || !latestAbiSnapshot) return false;
      cancelActiveAbiReconciliation("Superseded by a manual Kotlin ABI reconciliation retry.", { manualRetry: true });
      latestAbiFailure = null;
      needsAbiReconcile = true;
      tracedAbiGenerationRevision = "";
      mixedScopesReleased = false;
      setAnalysisReady(false);
      deps.diagnosticLifecycleTrace?.mark?.("kotlin-abi-manual-retry-requested", {
        workspaceRoot: context.workspaceRoot,
        workspaceRevision: String(latestAbiSnapshot.workspaceRevision || "")
      });
      try {
        await installAbi(latestAbiSnapshot);
        return true;
      } catch (error) {
        handleFailure(error);
        return false;
      }
    }

    function handleFailure(error) {
      const generation = deps.analysisGenerationCoordinator?.getState?.();
      latestAbiFailure = latestAbiFailure || createAbiFailureRecord(error, generation,
        latestAbiSnapshot?.workspaceRevision || "", Date.now());
      deps.diagnosticLifecycleTrace?.mark?.("kotlin-analysis-failed", {
        workspaceRoot: context?.workspaceRoot || "",
        providerId: "kotlin",
        code: latestAbiFailure.code,
        message: latestAbiFailure.message,
        evidence: latestAbiFailure.evidence,
        durationMs: latestAbiFailure.durationMs,
        jdtLogPath: latestAbiFailure.jdtLogPath,
        stack: String(error?.stack || "")
      });
      deps.analysisGenerationCoordinator?.markIncomplete?.({
        generationId: generation?.generationId,
        workspaceRoot: context?.workspaceRoot || "",
        providerId: "kotlin",
        code: latestAbiFailure.code,
        summary: latestAbiFailure.message
      });
      cancelActiveAbiReconciliation(latestAbiFailure.message, { failureCode: latestAbiFailure.code });
      mixedScopesReleased = false;
      analysisReady = true;
      deps.onAnalysisReady?.(true);
      setStatus(`Kotlin: Analysis failed - ${latestAbiFailure.message.split(/\r?\n/, 1)[0]}`, false, "failed");
      broker?.scheduleRefresh?.();
    }

    function setStatus(label, showProgress, explicitOutcome = "") {
      const manager = deps.getStatusManager?.() || app.modules?.statusManager;
      const request = { id: "kotlin-workspace", label, showProgress: showProgress === true, priority: 11 };
      const terminalOutcome = explicitOutcome || (showProgress === true ? ""
        : (/cancel/i.test(label) ? "cancelled" : (/failed|unavailable/i.test(label) ? "failed" : "finished")));
      if (app.modules?.backgroundProcesses) {
        Object.assign(request, {
          onCancel: showProgress === true ? async function() {
            const cancelled = cancelActiveAbiReconciliation("Cancelled from Background Processes.", { userCancelled: true });
            if (!cancelled) await deps.bridge?.stopServerSessions?.("kotlin", { force: true });
            clearStatus("cancelled");
            return true;
          } : null,
          backgroundProcess: { category: "kotlin", icon: "bi-braces", outcome: terminalOutcome }
        });
      }
      manager?.setStatus?.(request);
    }

    function clearStatus(outcome = "finished") {
      (deps.getStatusManager?.() || app.modules?.statusManager)?.unsetStatus?.("kotlin-workspace", { outcome });
    }

    /** Decide whether the current JDT workspace is safe for Kotlin ABI reconciliation. */
    function isJavaAnalysisClasspathReady(generation = deps.analysisGenerationCoordinator?.getState?.()) {
      return isJavaClasspathReady(deps.getJavaState?.()?.phase)
        || isCanonicalJdtClasspathReady(generation);
    }

    const api = {
      onModelResolved, onJavaStateChanged, onAnalysisGenerationState, setEnabled, setProblemsBroker, continueStartup,
      cancelActiveAbiReconciliation, retryAbiReconciliation,
      getLastAbiFailure: () => latestAbiFailure,
      getSession: () => kotlinSession,
      isAnalysisReady: () => analysisReady
    };
    app?.registerModule?.("kotlinWorkspaceCoordinator", api);
    return api;
  }

  /**
   * Describe why Kotlin analysis cannot proceed for a blocked Java workspace phase.
   *
   * @param {string} phase - A phase from JAVA_BLOCKED_PHASES (other than "closed").
   * @returns {string} A non-progress status label naming the actual blocker.
   */
  function describeBlockedJavaStatus(phase) {
    if (phase === "runtime-required") return "Kotlin: Unavailable (Project JDK required)";
    if (phase === "cancelling" || phase === "cancelled") return "Kotlin: Unavailable (Java analysis cancelled)";
    return "Kotlin: Unavailable (Java analysis failed)";
  }

  function belongsToKotlinScope(problem, roots, normalizePath) {
    const file = normalizePath(problem?.filePath || problem?.file || "").toLowerCase();
    if (!file || file === "project") return false;
    return roots.some((root) => {
      const candidate = normalizePath(root).toLowerCase();
      return file === candidate || file.startsWith(`${candidate}/`);
    });
  }

  function isJavaClasspathReady(phase) {
    return JAVA_CLASSPATH_READY_PHASES.includes(String(phase || ""));
  }

  /** Return whether JDT has imported, built, and validated the selected project inventory. */
  function isCanonicalJdtClasspathReady(generation) {
    const jdt = generation?.providers?.jdt;
    return ["running", "committed"].includes(String(generation?.status || ""))
      && jdt?.serviceReady === true
      && jdt?.importReady === true
      && jdt?.initialBuildComplete === true
      && jdt?.inventoryStatus === "validated";
  }

  global.registerMarkdownViewerKotlinWorkspaceCoordinator = registerMarkdownViewerKotlinWorkspaceCoordinator;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerKotlinWorkspaceCoordinator, belongsToKotlinScope };
})(typeof window !== "undefined" ? window : globalThis);
