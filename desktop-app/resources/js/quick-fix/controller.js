(function(global) {
  "use strict";

  /** Coordinate Java action discovery, preview, application, AI fallback, and verification. */
  function registerMarkdownViewerQuickFixController(app, deps = {}) {
    function isLocalWorkflowDiagnostic(problem) {
      return Boolean(deps.localProvider?.isRatDiagnostic?.(problem)
        || deps.localProvider?.isSpotlessDiagnostic?.(problem)
        || deps.localProvider?.isMavenDependencyResolutionDiagnostic?.(problem)
        || deps.localProvider?.isMavenDiagnostic?.(problem));
    }

    function canOpenForDiagnostic(problem) {
      return Boolean(problem && (
        deps.javaAnalysisProvider?.isDiagnostic?.(problem)
        || isLocalWorkflowDiagnostic(problem)
        || (problem.filePath && /\.java$/i.test(problem.filePath))
      ));
    }
    function canUseAi() {
      const settings = deps.getAiSettings?.() || {};
      return settings.enabled === true && settings.agentEnabled === true
        && typeof deps.getAiCompanion?.()?.runProblemFix === "function";
    }

    async function runAi(diagnostic) {
      const problemContext = await deps.getProblemContext?.(diagnostic) || {};
      return deps.getAiCompanion?.()?.runProblemFix?.({
        ...problemContext,
        diagnostic,
        workspaceRoot: deps.getWorkspaceRoot?.(),
        relatedDiagnostics: deps.diagnosticStore.getDiagnosticsForUri(diagnostic.uri)
      });
    }

    function normalizeMavenBuildOptions(options = {}) {
      const buildOptions = Object.assign({}, options.mavenBuildOptions || {});
      const advancedText = String(buildOptions.advancedArguments || "");
      const advancedTokens = advancedText.split(/\s+/).filter(Boolean);
      const requestsForcedUpdates = advancedTokens.includes("-U") || advancedTokens.includes("--update-snapshots");
      if (requestsForcedUpdates) {
        buildOptions.invocationValues = Object.assign({}, buildOptions.invocationValues || {}, {
          "dependency.force-updates": true
        });
        buildOptions.advancedArguments = advancedTokens.filter((token) => token !== "-U" && token !== "--update-snapshots").join(" ");
      }
      return Object.assign({}, options, { mavenBuildOptions: buildOptions });
    }

    async function rebuild(options) {
      const provider = deps.getJavaProjectProvider?.();
      if (!provider?.rebuildProject) return false;
      return provider.rebuildProject({ folderPath: deps.getWorkspaceRoot?.() }, normalizeMavenBuildOptions(options));
    }

    async function confirmSpotlessApply(problem) {
      const message = [
        "Spotless apply runs the project-approved formatter for the Maven module that owns this problem.",
        "",
        "It may rewrite multiple files in that module, not only the clicked file. MD-Editor will show the terminal output, but it will not preview or save editor buffers for you before Maven changes files on disk.",
        "",
        "After it finishes, review Git diff before committing. If the result is not what you expected, use Git or your editor history to revert the formatting changes.",
        "",
        problem?.filePath ? `Clicked file: ${problem.filePath}` : ""
      ].filter((line, index, lines) => line || lines[index - 1]).join("\n");
      if (typeof deps.confirm === "function") {
        return deps.confirm(message, { title: "Run Spotless apply?", confirmLabel: "Run Spotless apply", cancelLabel: "Cancel" });
      }
      if (typeof app?.services?.confirm === "function") {
        return app.services.confirm({ title: "Run Spotless apply?", message, confirmLabel: "Run Spotless apply", cancelLabel: "Cancel" });
      }
      const notify = app?.services?.notify;
      if (typeof notify?.show === "function") {
        const result = await notify.show({
          title: "Run Spotless apply?",
          message,
          buttons: [
            { id: "cancel", label: "Cancel", value: false, variant: "cancel" },
            { id: "run", label: "Run Spotless apply", value: true, variant: "primary", autoFocus: true }
          ]
        });
        return result === true || result === "run";
      }
      return typeof global.confirm === "function" ? global.confirm(message) : false;
    }

    async function runSpotlessApply(problem) {
      const provider = deps.getJavaProjectProvider?.();
      if (!provider?.runMavenSpotlessApply) throw new Error("Maven Spotless apply is unavailable.");
      if (!await confirmSpotlessApply(problem)) return false;
      return provider.runMavenSpotlessApply({ folderPath: deps.getWorkspaceRoot?.() }, { diagnostic: problem });
    }

    function showMavenDependencyResolutionHelp(problem) {
      const message = [
        "Maven dependency resolution means Maven could not find one or more artifacts that the current project or plugin configuration needs.",
        "",
        "Even a Maven clean can do more than delete target folders: Maven still reads the reactor, applies profiles, resolves plugins, and may resolve dependencies for plugin or module configuration bound to the clean lifecycle.",
        "",
        "When Maven says a previous failure was cached, -U asks Maven to retry remote and snapshot lookups for this invocation. It does not edit pom.xml and it does not fix an incorrect repository, missing local module, or unavailable artifact by itself.",
        "",
        problem?.message ? `Original problem: ${problem.message}` : ""
      ].filter((line, index, lines) => line || lines[index - 1]).join("\n");
      const notify = app?.services?.notify;
      if (typeof notify?.show === "function") {
        return notify.show({
          title: "Maven dependency resolution",
          message,
          buttons: [{ id: "ok", label: "OK", value: "ok", variant: "primary", autoFocus: true }]
        });
      }
      return app?.services?.alert?.(message) || global.alert?.(message);
    }

    function formatMavenExplanation(problem, explanation) {
      if (!explanation) return null;
      const lines = [
        explanation.summary,
        "",
        "Suggested next steps:",
        ...(explanation.nextSteps || []).map((step) => `- ${step}`),
        "",
        problem?.message ? `Original problem: ${problem.message}` : ""
      ];
      return lines.filter((line, index, allLines) => line || allLines[index - 1]).join("\n");
    }

    function showMavenProblemExplanation(problem, action) {
      const explanation = action?.explanation || deps.mavenProblemExplainer?.explain?.(problem) || null;
      const message = formatMavenExplanation(problem, explanation);
      if (!message) return showMavenBuildProblemHelp(problem);
      const notify = app?.services?.notify;
      if (typeof notify?.show === "function") {
        return notify.show({
          title: explanation.title || "Maven build problem",
          message,
          buttons: [{ id: "ok", label: "OK", value: "ok", variant: "primary", autoFocus: true }]
        });
      }
      return app?.services?.alert?.(message) || global.alert?.(message);
    }

    async function searchMavenProblemOnWeb(problem, action) {
      const explanation = action?.searchQuery ? null : deps.mavenProblemExplainer?.explain?.(problem);
      const query = action?.searchQuery || explanation?.searchQuery || problem?.message || "Maven build error";
      if (typeof deps.openExternalWebSearch === "function") {
        return deps.openExternalWebSearch(query);
      }
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      if (typeof global.Neutralino?.os?.open === "function") return global.Neutralino.os.open(url);
      if (typeof global.open === "function") return global.open(url, "_blank", "noopener,noreferrer");
      return false;
    }
    function showMavenBuildProblemHelp(problem) {
      const message = [
        "This problem came from Maven build output, not from the Java language server.",
        "",
        "That means Eclipse/JDT-style code actions may not know about it, even when the reported file is a .java file. The right next step is usually to inspect the Maven output, rerun the build with adjusted Maven options, or use the plugin-specific guidance from the build tool.",
        "",
        problem?.message ? `Original problem: ${problem.message}` : ""
      ].filter((line, index, lines) => line || lines[index - 1]).join("\n");
      const notify = app?.services?.notify;
      if (typeof notify?.show === "function") {
        return notify.show({
          title: "Maven build problem",
          message,
          buttons: [{ id: "ok", label: "OK", value: "ok", variant: "primary", autoFocus: true }]
        });
      }
      return app?.services?.alert?.(message) || global.alert?.(message);
    }
    async function executeLocalWorkflow(problem, action) {
      if (action.kind === "rat-manager") {
        const manager = deps.getRatManager?.();
        if (!manager?.open) throw new Error("Apache RAT License Audit is unavailable.");
        return manager.open({
          route: "finding.summary",
          projectPath: deps.getWorkspaceRoot?.(),
          targetPath: problem.filePath,
          diagnostic: problem
        });
      }
      if (action.kind === "maven-rebuild-with-options") {
        return rebuild({ mavenBuildOptions: action.mavenBuildOptions || {} });
      }
      if (action.kind === "maven-spotless-apply") {
        return runSpotlessApply(problem);
      }
      if (action.kind === "maven-inspect-effective-pom") {
        return rebuild({ mavenBuildOptions: { autoInspectEffectivePom: true } });
      }
      if (action.kind === "maven-dependency-resolution-help") {
        return showMavenDependencyResolutionHelp(problem);
      }
      if (action.kind === "maven-build-problem-help") {
        return showMavenBuildProblemHelp(problem);
      }
      if (action.kind === "maven-problem-explanation") {
        return showMavenProblemExplanation(problem, action);
      }
      if (action.kind === "maven-search-web") {
        return searchMavenProblemOnWeb(problem, action);
      }
    }

    async function verify(diagnostic, originalFingerprint, previousFingerprints) {
      const result = await deps.diagnosticStore.waitForChange(diagnostic.uri, originalFingerprint);
      if (!result.changed) return "Verification timed out. Quick Fix changes remain applied.";
      if (result.match) return "Still present. JDT continues to report the original problem.";
      const introduced = result.diagnostics.filter((item) =>
        !previousFingerprints.has(deps.diagnosticStore.createFingerprint(item))
      );
      if (introduced.length) {
        return `New diagnostics introduced: ${introduced.length}. The original problem is resolved.`;
      }
      return "Resolved. JDT no longer reports the original problem.";
    }

    /**
     * Discover JDT suggestions for a diagnostic already visible in the active editor.
     * @param {object} problem Live Java diagnostic.
     * @returns {Promise<object|null>} Prepared actions for the unified editor hover.
     */
    async function getEditorSuggestions(problem) {
      if (!problem?.isLiveDiagnostic || !/\.java$/i.test(problem.filePath || "")) return null;
      try {
        const result = await deps.javaProvider.getActions(problem, { ensureDocumentOpen: false });
        const currentDiagnostic = deps.diagnosticStore.findEditorDiagnostic({
          uri: problem.uri,
          range: problem.range,
          message: problem.message
        });
        return currentDiagnostic ? { ...result, diagnostic: currentDiagnostic } : null;
      } catch (error) {
        const currentDiagnostic = deps.diagnosticStore.findEditorDiagnostic({
          uri: problem.uri,
          range: problem.range,
          message: problem.message
        });
        return currentDiagnostic ? {
          actions: [],
          diagnostic: currentDiagnostic,
          reason: error?.message || "JDT Quick Fix failed."
        } : null;
      }
    }

    /**
     * Open Quick Fix for one Problems-panel diagnostic.
     * @param {object} problem Selected diagnostic.
     * @param {object} options Prepared hover result and initially selected action.
     * @returns {Promise<void>} Resolves when the workflow closes.
     */
    async function openForDiagnostic(problem, options = {}) {
      if (!canOpenForDiagnostic(problem)) return;
      if (deps.javaAnalysisProvider?.isDiagnostic?.(problem)) {
        const actions = await deps.javaAnalysisProvider.getActions(problem);
        await deps.dialog.open({
          diagnostic: problem,
          actions,
          reason: actions.length ? "" : "No Java project-analysis recovery action is available.",
          aiAvailable: false,
          executeAction: (action) => deps.javaAnalysisProvider.executeAction(problem, action)
        });
        return;
      }
      if (isLocalWorkflowDiagnostic(problem)) {
        const actions = await deps.localProvider.getActions(problem);
        await deps.dialog.open({
          diagnostic: problem,
          actions,
          reason: actions.length ? "" : "No local workflow is available for this problem.",
          aiAvailable: false,
          executeAction: (action) => executeLocalWorkflow(problem, action)
        });
        return;
      }
      let result;
      try {
        if (options.preparedResult) {
          const currentDiagnostic = deps.diagnosticStore.findEditorDiagnostic({
            uri: problem.uri,
            range: problem.range,
            message: problem.message
          });
          if (!currentDiagnostic) return;
          result = { ...options.preparedResult, diagnostic: currentDiagnostic };
        } else {
          result = await deps.javaProvider.getActions(problem);
        }
      } catch (error) {
        result = { actions: [], diagnostic: deps.diagnosticStore.findMatchingDiagnostic(problem) || problem, reason: error?.message || "JDT Quick Fix failed." };
      }
      const diagnostic = result.diagnostic || problem;
      if (!result.actions.length && diagnostic) {
        const localActions = await deps.localProvider?.getActions?.(diagnostic) || [];
        if (localActions.length) {
          result = { ...result, actions: localActions, reason: "" };
        }
      }
      const fingerprint = deps.diagnosticStore.createFingerprint(diagnostic);
      const previousFingerprints = new Set(
        deps.diagnosticStore.getDiagnosticsForUri(diagnostic.uri).map(deps.diagnosticStore.createFingerprint)
      );
      await deps.dialog.open({
        diagnostic,
        actions: result.actions,
        reason: result.reason,
        initialActionId: options.initialActionId,
        aiAvailable: canUseAi(),
        resolvePreview: async (action) => {
          const resolvedAction = action.provenance === "JDT"
            ? await deps.javaProvider.resolveAction(action)
            : action;
          if (resolvedAction.disabled) throw new Error(resolvedAction.disabledReason);
          return deps.workspaceEditPreview.resolve(resolvedAction);
        },
        applyPreview: async (preview) => {
          const result = await deps.workspaceEditPreview.apply(preview);
          await deps.javaAnalysisRefresh?.reanalyze?.({ reason: "java-quick-fix-applied" });
          return result;
        },
        verify: () => verify(diagnostic, fingerprint, previousFingerprints),
        rebuild,
        runAi: () => runAi(diagnostic)
      });
    }

    const api = { canOpenForDiagnostic, getEditorSuggestions, openForDiagnostic };
    app.registerModule?.("quickFixController", api);
    return api;
  }

  global.registerMarkdownViewerQuickFixController = registerMarkdownViewerQuickFixController;
})(typeof window !== "undefined" ? window : globalThis);
