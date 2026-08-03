(function(global) {
  "use strict";

  /** Register the standalone RAT Policy Manager and its focused submodules. */
  function registerMarkdownViewerRatPolicyFeature(app, deps = {}) {
    const versionCapabilities = global.registerMarkdownViewerRatPolicyVersionCapabilities?.(app);
    const referenceCatalog = global.registerMarkdownViewerRatPolicyReferenceCatalog?.(app, { fetch: deps.fetch });
    const projectInventory = global.registerMarkdownViewerRatPolicyProjectInventory?.(app, {
      projectContext: deps.projectContext,
      configurationReader: deps.configurationReader,
      versionCapabilities,
      getWorkspaceRoot: deps.getWorkspaceRoot,
      get Neutralino() { return deps.Neutralino; }
    });
    const policyModel = global.registerMarkdownViewerRatPolicyModel?.(app);
    const coverageAnalyzer = global.registerMarkdownViewerRatPolicyCoverageAnalyzer?.(app);
    const validator = global.registerMarkdownViewerRatPolicyValidator?.(app);
    const pomEditPlanner = global.registerMarkdownViewerRatPolicyPomEditPlanner?.(app, { xmlEditPlanner: deps.xmlEditPlanner });
    const ratConfigPlanner = global.registerMarkdownViewerRatPolicyRatConfigPlanner?.(app);
    const exclusionPlanner = global.registerMarkdownViewerRatPolicyExclusionPlanner?.(app, { validator });
    const headerPlanner = global.registerMarkdownViewerRatPolicyHeaderPlanner?.(app);
    const changePlanner = global.registerMarkdownViewerRatPolicyChangePlanner?.(app, {
      tabs: deps.tabs,
      validator,
      pomEditPlanner,
      ratConfigPlanner,
      exclusionPlanner,
      headerPlanner,
      referenceCatalog,
      xmlEditPlanner: deps.xmlEditPlanner,
      fetch: deps.fetch,
      get Neutralino() { return deps.Neutralino; }
    });
    const verifier = global.registerMarkdownViewerRatPolicyVerifier?.(app, { runner: deps.runner });
    const helpContent = global.registerMarkdownViewerRatPolicyHelpContent?.(app);
    const dialog = global.registerMarkdownViewerRatPolicyDialog?.(app, { helpContent, confirm: deps.confirm });
    return global.registerMarkdownViewerRatPolicyManager?.(app, {
      projectInventory,
      policyModel,
      coverageAnalyzer,
      versionCapabilities,
      validator,
      changePlanner,
      changeSet: deps.changeSet,
      verifier,
      dialog,
      tabs: deps.tabs,
      confirm: deps.confirm,
      getWorkspaceRoot: deps.getWorkspaceRoot
    });
  }

  global.registerMarkdownViewerRatPolicyFeature = registerMarkdownViewerRatPolicyFeature;
})(typeof window !== "undefined" ? window : globalThis);
