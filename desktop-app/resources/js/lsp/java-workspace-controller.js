(function(global) {
  "use strict";

  /** Owns the user-visible lifecycle of one persistent Java language-server workspace. */
  function registerMarkdownViewerJavaWorkspaceController(app, deps = {}) {
    const PROJECT_DETECTION_TIMEOUT_MS = Number(deps.projectDetectionTimeoutMs) > 0 ? Number(deps.projectDetectionTimeoutMs) : 120000;
    const listeners = new Set();
    let workspaceRoot = "";
    let model = null;
    let runtime = null;
    let failure = null;
    let hasTerminalAnalysisFailure = false;
    let generation = 0;
    let activeDetection = null;
    let state = { phase: "closed", label: "Java: Closed", model: null, runtime: null, failure: null, error: null, logPath: "" };

    function createDetectionAbortController() {
      if (typeof global.AbortController === "function") return new global.AbortController();
      const listeners = new Set();
      const signal = {
        aborted: false,
        addEventListener(type, listener) { if (type === "abort" && typeof listener === "function") listeners.add(listener); },
        removeEventListener(type, listener) { if (type === "abort") listeners.delete(listener); }
      };
      return { signal, abort() {
        if (signal.aborted) return;
        signal.aborted = true;
        listeners.forEach((listener) => listener({ type: "abort" }));
        listeners.clear();
      } };
    }

    function cancelDetectionTimer(session) {
      if (!session?.timer) return;
      if (typeof global.clearTimeout === "function") global.clearTimeout(session.timer);
      else session.timer?.close?.();
      session.timer = null;
    }

    function clearDetection(session) {
      if (!session) return;
      cancelDetectionTimer(session);
      if (activeDetection === session) activeDetection = null;
    }

    function abortActiveDetection(reason) {
      const session = activeDetection;
      if (!session) return false;
      session.reason = reason;
      cancelDetectionTimer(session);
      session.controller.abort();
      return true;
    }

    function markDetectionIncomplete(details) {
      const analysisGeneration = deps.analysisGenerationCoordinator?.getState?.();
      deps.analysisGenerationCoordinator?.markIncomplete?.({
        generationId: analysisGeneration?.generationId,
        workspaceRoot,
        providerId: "jdt",
        code: details.code,
        summary: details.summary,
        details
      });
    }

    function createStatusRequest(phase, label) {
      const showsProgress = ["detecting", "starting", "initializing", "importing", "refreshing", "cancelling"].includes(phase);
      const canCancel = ["detecting", "starting", "initializing", "importing", "refreshing"].includes(phase);
      const outcome = phase === "cancelled" ? "cancelled"
        : ["degraded", "runtime-required"].includes(phase) ? "failed"
          : (!showsProgress && phase !== "cancelling" ? "finished" : "");
      return {
        id: "java-workspace",
        label,
        showProgress: showsProgress,
        onCancel: canCancel ? () => cancelAnalysis({ confirmed: true }) : null,
        cancelLabel: canCancel ? "Cancel Java background action" : "",
        priority: 10,
        backgroundProcess: { category: "java", icon: "bi-cup-hot", outcome }
      };
    }

    function publish(phase, label, error = null) {
      state = { phase, label, model, runtime, failure, error, logPath: state.logPath || "" };
      const statusManager = deps.statusManager || app.modules?.statusManager;
      if (phase === "closed" || phase === "ready") statusManager?.unsetStatus?.("java-workspace");
      else statusManager?.setStatus?.(createStatusRequest(phase, label));
      if (!statusManager && phase !== "closed" && phase !== "ready") {
        global.setTimeout(() => {
          if (state.phase !== phase || state.label !== label) return;
          app.modules?.statusManager?.setStatus?.(createStatusRequest(phase, label));
        }, 0);
      }
      listeners.forEach((listener) => listener(state));
      return state;
    }

    /** Convert a managed build-model failure into the terminal analysis failure it represents. */
    function createAnalysisInventoryFailure(detected) {
      const inventory = detected?.analysisInventory;
      const reason = String(inventory?.error || "").trim();
      if (!reason) return null;
      const provider = inventory.buildSystem === "maven" ? "Maven" : "Gradle";
      return {
        code: String(inventory.errorCode || "") || `${String(inventory.buildSystem || "managed")}-analysis-inventory-failed`,
        summary: `${provider} project inventory could not be resolved: ${reason}`,
        reason,
        fatal: true,
        inventoryKind: String(inventory.kind || ""),
        remediation: `Fix the ${provider} project-model error, then retry Java project analysis.`
      };
    }

    /**
     * Detect and cache the Java model without blocking folder rendering.
     * @param {string} path Project workspace root.
     * @param {object} options Instrumentation context for why the workspace reopened.
     * @returns {Promise<object>} Latest Java workspace state.
     */
    async function openWorkspace(path, options = {}) {
      abortActiveDetection("superseded");
      const currentGeneration = ++generation;
      workspaceRoot = String(path || "");
      model = null;
      failure = null;
      hasTerminalAnalysisFailure = false;
      if (!workspaceRoot) {
        if (deps.analysisGenerationCoordinator?.closeWorkspace) deps.analysisGenerationCoordinator.closeWorkspace();
        else deps.diagnosticLifecycleTrace?.closeWorkspace?.();
        return publish("closed", "Java: Closed");
      }
      if (deps.analysisGenerationCoordinator?.beginGeneration) {
        deps.analysisGenerationCoordinator.beginGeneration({
          workspaceRoot,
          reason: options.traceReason || "workspace-opened"
        });
      } else {
        deps.diagnosticLifecycleTrace?.startGeneration?.(options.traceReason || "workspace-opened", { workspaceRoot });
      }
      deps.onWorkspaceSessionStarted?.(workspaceRoot);
      const detection = { controller: createDetectionAbortController(), reason: "", timer: null };
      activeDetection = detection;
      detection.timer = global.setTimeout(() => {
        if (activeDetection !== detection) return;
        detection.reason = "timeout";
        detection.controller.abort();
      }, PROJECT_DETECTION_TIMEOUT_MS);
      publish("detecting", "Java: Detecting project...");
      try {
        const detected = await deps.workspaceModel.detect(workspaceRoot, { signal: detection.controller.signal });
        clearDetection(detection);
        if (currentGeneration !== generation) return state;
        model = detected;
        failure = createAnalysisInventoryFailure(model);
        if (failure) {
          publish("degraded", "Java: Analysis model unavailable", new Error(failure.summary));
          markDetectionIncomplete(failure);
          return state;
        }
        deps.folderWatcher?.setDerivedRoots?.(model?.derivedRoots || []);
        deps.onModelResolved?.({ workspaceRoot, model });
        runtime = model?.hasJavaContent ? await deps.projectRuntime?.resolve?.(workspaceRoot, model.projectConfiguration || {}) : null;
        if (currentGeneration !== generation) return state;
        if (model?.hasJavaContent && !runtime?.ok) {
          const label = runtime?.code === "project-jdk-required" ? "Java: Project JDK required" : "Java: Project JDK unavailable";
          publish("runtime-required", label);
          deps.onRuntimeRequired?.({ workspaceRoot, model, runtime });
          return state;
        }
        if (model?.hasJavaContent && runtime?.ok && !runtime.launcherJdk) {
          publish("degraded", "Java: JDK 21+ required for JDT");
          deps.onLauncherRequired?.({ workspaceRoot, model, runtime });
          return state;
        }
        publish("dormant", `Java: Waiting (${model?.kind || "unmanaged"})`);
        if (model?.hasJavaContent && runtime?.ok) deps.onRuntimeResolved?.({ workspaceRoot, model, runtime });
      } catch (error) {
        clearDetection(detection);
        if (currentGeneration !== generation) return state;
        if (detection.reason === "timeout") {
          failure = {
            code: "java-project-detection-timeout",
            summary: "Java project detection exceeded the two-minute limit.",
            reason: "timeout",
            fatal: true,
            remediation: "Retry Java project analysis after checking the Maven project model and local dependency access."
          };
          publish("degraded", "Java: Project detection timed out", new Error(failure.summary));
          markDetectionIncomplete(failure);
        } else if (detection.reason === "cancelled" || error?.name === "AbortError" || error?.code === "java-project-detection-cancelled") {
          publish("cancelled", "Java: JDT cancelled");
        } else {
          failure = {
            code: error?.code || "java-project-detection-failed",
            summary: error?.message || "Java project detection failed.",
            reason: error?.message || "",
            fatal: true,
            remediation: "Fix the project detection error, then retry Java project analysis."
          };
          publish("degraded", "Java: Project detection failed", error);
          markDetectionIncomplete(failure);
        }
      }
      return state;
    }

    /** Announce that a stable Java tab is beginning or reusing JDT startup. */
    function activateDocument(context = {}) {
      if (model?.hasJavaContent && (!runtime?.ok || !runtime.launcherJdk)) return false;
      if (["dormant", "cancelled"].includes(state.phase)) publish("starting", `Java: Starting (${model?.kind || "project"})`);
      if (context.sessionId) deps.workspaceActivityClient?.setTrackedDocuments?.(context.sessionId, context.activeUri || "", context.tabUris || []);
      return true;
    }

    function markInitializing() {
      if (!["degraded", "closed", "cancelling", "cancelled"].includes(state.phase)) publish("initializing", "Java: Initializing...");
    }

    function markImporting(label) {
      if (!["degraded", "closed", "cancelling", "cancelled"].includes(state.phase)) publish("importing", label || `Java: Importing ${model?.kind || "project"}...`);
    }

    /** Mark an explicit incremental JDT analysis as active. */
    function markRefreshing(label) {
      if (!["degraded", "closed", "cancelling", "cancelled"].includes(state.phase)) publish("refreshing", label || "Java: Reanalyzing...");
    }

    /** Mark JDT import as usable while project-wide diagnostics continue finalizing. */
    function markClasspathReady() {
      if (["cancelling", "cancelled"].includes(state.phase) || hasTerminalAnalysisFailure) return state;
      return publish("classpath-ready", "Java: Project imported");
    }

    function markReady() {
      if (["cancelling", "cancelled"].includes(state.phase) || hasTerminalAnalysisFailure) return state;
      failure = null;
      return publish("ready", "Java: Ready");
    }

    /** Cancel the active JDT session while leaving source files and the workspace open. */
    async function cancelAnalysis(options = {}) {
      if (!["detecting", "starting", "initializing", "importing", "refreshing"].includes(state.phase)) return false;
      const isDetecting = state.phase === "detecting";
      if (options.confirmed !== true && typeof deps.confirmCancellation === "function") {
        let confirmed = false;
        try {
          confirmed = await deps.confirmCancellation({ workspaceRoot, model, runtime }) === true;
        } catch (_error) {
          confirmed = false;
        }
        if (!confirmed) {
          publish(state.phase, state.label);
          return false;
        }
      }
      const currentGeneration = ++generation;
      publish("cancelling", isDetecting ? "Java: Cancelling project detection..." : "Java: Cancelling JDT...");
      if (isDetecting) {
        abortActiveDetection("cancelled");
        failure = null;
        hasTerminalAnalysisFailure = false;
        publish("cancelled", "Java: JDT cancelled");
        return true;
      }
      try {
        await deps.cancelAnalysis?.({ workspaceRoot, model, runtime });
        if (currentGeneration !== generation) return true;
        failure = null;
        hasTerminalAnalysisFailure = false;
        publish("cancelled", "Java: JDT cancelled");
        return true;
      } catch (error) {
        if (currentGeneration === generation) publish("degraded", "Java: JDT cancellation failed", error);
        return false;
      }
    }

    function markDegraded(error, details = null) {
      failure = details || failure;
      publish("degraded", "Java: Degraded — files remain available", error);
    }

    function markAnalysisFailed(details) {
      failure = details || { code: "java-analysis-failed", summary: "Java project analysis failed." };
      hasTerminalAnalysisFailure = true;
      publish("degraded", "Java: Project analysis failed", new Error(failure.summary || "Java project analysis failed."));
    }

    function setLogPath(path) {
      state = Object.assign({}, state, { logPath: String(path || "") });
      return state.logPath;
    }

    function closeWorkspace() {
      abortActiveDetection("closed");
      generation += 1;
      const closedWorkspaceRoot = workspaceRoot;
      workspaceRoot = "";
      model = null;
      runtime = null;
      failure = null;
      hasTerminalAnalysisFailure = false;
      state = Object.assign({}, state, { logPath: "" });
      if (deps.analysisGenerationCoordinator?.closeWorkspace) deps.analysisGenerationCoordinator.closeWorkspace({ workspaceRoot: closedWorkspaceRoot });
      else deps.diagnosticLifecycleTrace?.closeWorkspace?.({ workspaceRoot: closedWorkspaceRoot });
      publish("closed", "Java: Closed");
    }

    function subscribe(listener) {
      if (typeof listener !== "function") return function() {};
      listeners.add(listener);
      return function() { listeners.delete(listener); };
    }

    const api = {
      openWorkspace,
      closeWorkspace,
      activateDocument,
      markInitializing,
      markImporting,
      markRefreshing,
      markClasspathReady,
      markReady,
      cancelAnalysis,
      markDegraded,
      markAnalysisFailed,
      setLogPath,
      getState: () => state,
      getModel: () => model,
      getRuntime: () => runtime,
      subscribe
    };
    app?.registerModule?.("javaWorkspaceController", api);
    return api;
  }

  global.registerMarkdownViewerJavaWorkspaceController = registerMarkdownViewerJavaWorkspaceController;
})(typeof window !== "undefined" ? window : globalThis);
