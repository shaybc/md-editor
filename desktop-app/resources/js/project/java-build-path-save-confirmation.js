(function(global) {
  "use strict";

  /** Confirm and apply the build work requested after Java Build Path changes. */
  function registerMarkdownViewerJavaBuildPathSaveConfirmation(app, deps = {}) {
    function getBuildAction(configuration) {
      const requiresInitialBuild = configuration?.buildSystem === "javac" && !configuration.javacProfile;
      return requiresInitialBuild
        ? {
            id: "build",
            label: "Build",
            message: "The Java Build Path settings have changed. Build the project to select Java build options and apply the changes?",
            useLastOptions: false,
            requiresAnalysisRefresh: true
          }
        : {
            id: "rebuild",
            label: "Rebuild",
            message: "The Java Build Path settings have changed. Rebuild the project to apply the changes?",
            useLastOptions: true,
            requiresAnalysisRefresh: false
          };
    }

    function renderRunAnalyzersSwitch(body, state) {
      const label = document.createElement("label");
      label.className = "settings-switch-row";

      const copy = document.createElement("span");
      const title = document.createElement("span");
      title.className = "settings-switch-title";
      title.textContent = "Run code analyzers";
      const description = document.createElement("span");
      description.className = "settings-switch-description";
      description.textContent = "Re-run JDT and the other configured code analyzers after the rebuild.";
      copy.append(title, description);

      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "settings-switch-input";
      input.checked = true;
      input.addEventListener("change", () => {
        state.runAnalyzers = input.checked;
      });

      const switchControl = document.createElement("span");
      switchControl.className = "settings-switch";
      switchControl.setAttribute("aria-hidden", "true");
      label.append(copy, input, switchControl);
      body.appendChild(label);
    }

    async function runSavedConfigurationAnalysis(projectPath) {
      if (typeof deps.runAnalyzers !== "function") return false;
      try {
        await deps.runAnalyzers?.(projectPath);
        return true;
      } catch (error) {
        await deps.notify?.alert?.({
          title: "Java Project Analysis",
          message: error?.message || "The saved Java Build Path could not be applied to project analysis."
        });
        return false;
      }
    }

    /**
     * Apply one persisted Java Build Path configuration to build and analysis state.
     * @param {string} projectPath Opened Java project root.
     * @param {object} configuration Persisted Java Build Path configuration.
     * @param {object} options Save-change and dialog lifecycle options.
     * @returns {Promise<{rebuilt: boolean, analyzersRun: boolean}>} Applied follow-up work.
     */
    async function confirmAfterSave(projectPath, configuration = {}, options = {}) {
      if (options.configurationChanged === false) {
        options.onDecision?.("synchronize");
        return { rebuilt: false, analyzersRun: await runSavedConfigurationAnalysis(projectPath) };
      }
      if (deps.shouldConfirm?.() === false) {
        options.onDecision?.("skipped");
        return { rebuilt: false, analyzersRun: await runSavedConfigurationAnalysis(projectPath) };
      }
      const buildAction = getBuildAction(configuration);
      const state = { runAnalyzers: true };
      const decision = await deps.notify?.show?.({
        title: "Java Build Path Changed",
        message: buildAction.message,
        dedupeKey: `java-build-path-rebuild:${projectPath}`,
        dismissValue: "cancel",
        renderBody: (body) => renderRunAnalyzersSwitch(body, state),
        buttons: [
          { id: "cancel", label: "Not Now", value: "cancel", variant: "cancel" },
          { id: buildAction.id, label: buildAction.label, value: buildAction.id, variant: "primary", autoFocus: true }
        ]
      });
      options.onDecision?.(decision);
      if (decision !== buildAction.id) {
        return { rebuilt: false, analyzersRun: await runSavedConfigurationAnalysis(projectPath) };
      }

      let rebuilt = false;
      try {
        rebuilt = await deps.rebuildProject?.(projectPath, {
          runAnalyzers: false,
          useLastOptions: buildAction.useLastOptions
        }) === true;
      } catch (error) {
        await deps.notify?.alert?.({
          title: "Java Project Rebuild",
          message: error?.message || "The Java project could not be rebuilt."
        });
      }
      const shouldRunAnalyzers = state.runAnalyzers || buildAction.requiresAnalysisRefresh;
      const analyzersRun = shouldRunAnalyzers ? await runSavedConfigurationAnalysis(projectPath) : false;
      return { rebuilt, analyzersRun };
    }

    const api = { confirmAfterSave };
    app?.registerModule?.("javaBuildPathSaveConfirmation", api);
    return api;
  }

  global.registerMarkdownViewerJavaBuildPathSaveConfirmation = registerMarkdownViewerJavaBuildPathSaveConfirmation;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJavaBuildPathSaveConfirmation };
  }
})(typeof window !== "undefined" ? window : globalThis);
