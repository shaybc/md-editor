(function(global) {
  "use strict";

  const STATE_FILE = "eclipse-preferences.json";
  const PROBLEM_COLLECTION_OWNER = "eclipse-preferences";
  const SETTINGS = ["off", "existing", "generate"];

  /**
   * Owns the "apply project Eclipse preferences" analysis feature for one workspace:
   * detection, one-time consent prompt, generation via the JDT proxy bridge,
   * staleness tracking, and the post-generation JDT rebuild.
   *
   * Mechanic: JDT automatically honors per-project .settings/org.eclipse.jdt.core.prefs,
   * so the controller only materializes the files (project's own eclipseJdt task) and
   * asks JDT to rebuild - it never edits JDT configuration.
   */
  function registerMarkdownViewerEclipsePreferencesController(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;
    let workspaceRoot = "";
    let model = null;
    let detection = null;
    let state = null;
    let applying = false;
    let promptShownForRoot = "";
    let pendingApplyWhenReady = false;

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function statePath(root) {
      return `${normalizePath(root)}/.md-editor/${STATE_FILE}`;
    }

    async function readState(root) {
      try { return JSON.parse(await Neutralino.filesystem.readFile(statePath(root))) || {}; }
      catch (_error) { return {}; }
    }

    async function writeState(root, value) {
      try {
        await Neutralino.filesystem.createDirectory?.(`${normalizePath(root)}/.md-editor`).catch?.(() => null);
        await Neutralino.filesystem.writeFile(statePath(root), JSON.stringify(value, null, 2));
      } catch (_error) { /* Preferences still apply this session without persistence. */ }
    }

    function getSetting() {
      return SETTINGS.includes(state?.setting) ? state.setting : "existing";
    }

    /** Persist the user's choice and start generation when it becomes "generate". */
    async function setSetting(value) {
      if (!workspaceRoot || !SETTINGS.includes(value)) return getSetting();
      state = { ...(state || {}), setting: value };
      await writeState(workspaceRoot, state);
      if (value === "generate") scheduleApply();
      return value;
    }

    /** Detect posture for a newly resolved workspace model and prompt once if useful. */
    async function onModelResolved(value) {
      workspaceRoot = normalizePath(value?.workspaceRoot || "");
      model = value?.model || null;
      detection = null;
      pendingApplyWhenReady = false;
      clearProblem();
      if (!workspaceRoot || !model?.hasJavaContent) return;
      state = await readState(workspaceRoot);
      detection = await deps.detection?.detect?.(workspaceRoot, model) || null;
      if (!detection) return;
      if (getSetting() === "generate" && canGeneratePreferences()) {
        if (isStale()) scheduleApply();
        return;
      }
      const shouldPrompt = canGeneratePreferences()
        && detection.richness !== "curated"
        && state?.setting === undefined
        && state?.promptDismissed !== true
        && promptShownForRoot !== workspaceRoot;
      if (shouldPrompt) {
        promptShownForRoot = workspaceRoot;
        void showPrompt();
      }
    }

    /** Re-evaluate a deferred generation once JDT reaches "ready". */
    function onJavaStateChanged(javaState) {
      if (javaState?.phase === "ready" && pendingApplyWhenReady) {
        pendingApplyWhenReady = false;
        void applyNow().catch(() => null);
      }
    }

    function isStale() {
      return state?.appliedSignature !== String(model?.configurationSignature || "");
    }

    /** Return whether this workspace may generate preferences through Gradle. */
    function canGeneratePreferences(options = {}) {
      const hasExplicitGenerationChoice = Object.prototype.hasOwnProperty.call(options, "generate");
      const configuredBuildSystem = String(model?.projectConfiguration?.buildSystem || "");
      return detection?.generatable === true
        && options.generate !== false
        && (hasExplicitGenerationChoice || !configuredBuildSystem || configuredBuildSystem === "gradle");
    }

    /** Queue generation for when a JDT session exists; run immediately if it does. */
    function scheduleApply() {
      if (deps.getJavaState?.()?.phase === "ready") void applyNow().catch(() => null);
      else pendingApplyWhenReady = true;
    }

    async function showPrompt() {
      const decision = await deps.showNotification?.({
        title: "Project Eclipse Preferences Detected",
        message: "This project's build defines Eclipse compiler preferences (warning suppressions, encodings). Apply them to Java analysis so problems match the project's intended Eclipse setup?",
        dismissValue: "not-now",
        buttons: [
          { id: "never", label: "Don't ask again", value: "never", variant: "cancel" },
          { id: "not-now", label: "Not now", value: "not-now", variant: "cancel" },
          { id: "apply", label: "Apply", value: "apply", variant: "primary", autoFocus: true }
        ]
      });
      if (decision === "apply") await setSetting("generate");
      else if (decision === "never") {
        state = { ...(state || {}), promptDismissed: true };
        await writeState(workspaceRoot, state);
      }
    }

    /**
     * Apply generated or committed preference files and rebuild JDT diagnostics.
     *
     * @param {object} options - Application capability selected by the build-path UI.
     * @param {boolean} [options.generate=true] - Allow Gradle preference generation.
     * @returns {Promise<{ok: boolean, description: string, logPath?: string}>} Apply outcome.
     */
    async function applyNow(options = {}) {
      if (applying || !workspaceRoot) return { ok: false, description: "Preference application is already running or no workspace is open." };
      const generatePreferences = canGeneratePreferences(options);
      if (!generatePreferences && detection?.present !== true) {
        return { ok: false, description: "No project Eclipse preferences were found." };
      }
      const session = deps.getJdtSession?.(workspaceRoot);
      if (!session) {
        pendingApplyWhenReady = true;
        return { ok: false, description: "Waiting for the Java session to become ready." };
      }
      applying = true;
      setStatus(generatePreferences ? "Java: Generating Eclipse preferences" : "Java: Applying Eclipse preferences", true);
      try {
        let result = { ok: true, description: "Committed Eclipse preferences applied.", logPath: "" };
        if (generatePreferences) {
          result = await deps.jdtClient.runEclipsePreferences(session);
          if (!result?.ok) {
            publishProblem(`Eclipse preference generation failed: ${result?.description || "unknown error"}`, result?.logPath || "");
            return result || { ok: false, description: "Eclipse preference generation failed." };
          }
        }
        const scopeRefresh = await deps.refreshEclipseAnalysisScope?.(workspaceRoot) || {};
        clearProblem();
        state = {
          ...(state || {}),
          setting: generatePreferences ? "generate" : "existing",
          appliedAt: new Date().toISOString(),
          appliedSignature: String(scopeRefresh.configurationSignature || model?.configurationSignature || ""),
          lastResult: result.description
        };
        await writeState(workspaceRoot, state);
        setStatus(scopeRefresh.changed === true
          ? "Java: Restarting with Eclipse project scope"
          : "Java: Rebuilding with Eclipse preferences", true);
        if (scopeRefresh.changed === true) await deps.restartJavaAnalysis?.(workspaceRoot)?.catch?.(() => null);
        else await deps.requestJdtWorkspaceBuild?.(session)?.catch?.(() => null);
        // The rebuild republishes diagnostics; make sure the Problems aggregation
        // re-reads them even if no summary event fires afterwards.
        deps.scheduleProblemsRefresh?.();
        return result;
      } catch (error) {
        publishProblem(`Eclipse preference application failed: ${String(error?.message || error).split(/\r?\n/, 1)[0]}`, "");
        return { ok: false, description: String(error?.message || error) };
      } finally {
        applying = false;
        clearStatus();
      }
    }

    function publishProblem(message, logPath) {
      deps.problemsPanel?.setDiagnosticCollection?.(PROBLEM_COLLECTION_OWNER, [{
        severity: "warning",
        message: `${message} Analysis continues with the existing preferences.`,
        source: "Eclipse Preferences",
        projectPath: workspaceRoot,
        logPath: String(logPath || "")
      }], { persistent: false, revealErrors: false, userDeletable: false });
    }

    function clearProblem() {
      deps.problemsPanel?.clearDiagnosticCollection?.(PROBLEM_COLLECTION_OWNER, { revealErrors: false });
    }

    function setStatus(label, showProgress) {
      deps.getStatusManager?.()?.setStatus?.({ id: "eclipse-preferences", label, showProgress: showProgress === true, priority: 12 });
    }

    function clearStatus() {
      deps.getStatusManager?.()?.unsetStatus?.("eclipse-preferences");
    }

    const api = {
      onModelResolved,
      onJavaStateChanged,
      applyNow,
      getSetting,
      setSetting,
      getDetection: () => detection,
      getState: () => ({ ...(state || {}), applying })
    };
    app?.registerModule?.("eclipsePreferencesController", api);
    return api;
  }

  global.registerMarkdownViewerEclipsePreferencesController = registerMarkdownViewerEclipsePreferencesController;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerEclipsePreferencesController };
})(typeof window !== "undefined" ? window : globalThis);
