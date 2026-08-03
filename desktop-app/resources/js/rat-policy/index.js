(function(global) {
  "use strict";

  /** Coordinate RAT policy inventory, planning, preview, application, and verification. */
  function registerMarkdownViewerRatPolicyManager(app, deps = {}) {
    const ROUTE_STEPS = { overview: 0, license: 1, enforcement: 2, coverage: 3, review: 4, advanced: 2 };

    /** Open a newly analyzed RAT policy workflow for the selected Maven project. */
    async function open(request = {}) {
      const inventory = await deps.projectInventory.analyze({
        projectPath: request.projectPath || deps.getWorkspaceRoot?.()
      });
      let draft = deps.policyModel.createDraft(inventory, {
        mode: request.mode || (request.route === "advanced" ? "advanced" : "guided"),
        route: request.route || "overview"
      });
      const coverage = deps.coverageAnalyzer.analyze(inventory, draft);
      const model = { inventory, draft, coverage, stepIndex: ROUTE_STEPS[request.route] || 0 };

      deps.dialog.open(model, {
        updateDraft(patch) {
          draft = deps.policyModel.update(draft, patch);
          model.draft = draft;
          const capabilities = deps.versionCapabilities.resolve(draft.pluginVersion);
          model.inventory = { ...inventory, capabilities };
          model.coverage = deps.coverageAnalyzer.analyze(model.inventory, draft);
          return draft;
        },
        validate(candidate) {
          const currentInventory = { ...inventory, capabilities: deps.versionCapabilities.resolve(candidate.pluginVersion) };
          return deps.validator.validate(candidate, currentInventory);
        },
        preview(candidate) {
          const currentInventory = { ...inventory, capabilities: deps.versionCapabilities.resolve(candidate.pluginVersion) };
          return deps.changePlanner.plan(currentInventory, candidate);
        },
        apply(plan) {
          return deps.changeSet.apply(plan, {
            confirmDelete(message) {
              return deps.confirm?.({
                title: "Delete saved RAT policy file?",
                message,
                confirmLabel: "Delete file",
                confirmVariant: "danger",
                cancelLabel: "Keep file"
              }) || false;
            }
          });
        },
        async saveAndVerify(plan) {
          const saved = await deps.tabs.saveExternalDocuments(plan.changes.map((change) => change.path));
          if (!saved) throw new Error("Saving was cancelled. Apache RAT was not run.");
          return deps.verifier.run(inventory, draft.scanScope || "module");
        }
      });
      return model;
    }

    const api = { open };
    app?.registerModule?.("ratPolicyManager", api);
    return api;
  }

  global.registerMarkdownViewerRatPolicyManager = registerMarkdownViewerRatPolicyManager;
})(typeof window !== "undefined" ? window : globalThis);
