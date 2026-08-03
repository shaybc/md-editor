(function(global) {
  "use strict";

  /** Explain which Maven modules inherit or execute the current RAT policy. */
  function registerMarkdownViewerRatPolicyCoverageAnalyzer(app) {
    function moduleRows(inventory) {
      const rootModules = inventory.rootPom?.modules || [];
      const declaringPath = inventory.governing?.pomPath || "";
      const rows = [{
        name: inventory.module?.artifactId || inventory.rootPom?.artifactId || "Current module",
        path: inventory.module?.projectRoot || inventory.projectPath,
        status: inventory.hasActivePlugin ? "covered" : inventory.hasPluginManagementOnly ? "available-only" : "not-configured",
        reason: inventory.hasActivePlugin
          ? `RAT is declared by ${declaringPath || "the current POM"}.`
          : inventory.hasPluginManagementOnly
            ? "RAT appears only in pluginManagement; that does not execute the audit."
            : "No active Apache RAT plugin declaration was found."
      }];
      rootModules.forEach((name) => rows.push({
        name,
        path: name,
        status: inventory.hasActivePlugin && inventory.governing?.inherited ? "inherited" : "needs-effective-pom",
        reason: inventory.hasActivePlugin && inventory.governing?.inherited
          ? "The statically discovered parent declaration is inherited."
          : "Profile and inheritance details require effective-POM confirmation."
      }));
      return rows;
    }

    /** Produce a static coverage report and warnings for the wizard. */
    function analyze(inventory, draft) {
      const rows = moduleRows(inventory);
      const warnings = [];
      if (inventory.hasPluginManagementOnly) warnings.push("pluginManagement makes configuration available but does not run RAT.");
      if (inventory.profiles.length) warnings.push("Profile activation may change which modules execute RAT.");
      if (!inventory.capabilities.known) warnings.push("The RAT version is unresolved; validation is limited to XML structure and safe fields.");
      if (inventory.hasSkip || draft.skip || draft.disableExecution) warnings.push("License auditing is bypassed for at least one selected scope.");
      return { rows, warnings, confidence: inventory.configurationConfidence || "missing" };
    }

    const api = { analyze };
    app?.registerModule?.("ratPolicyCoverageAnalyzer", api);
    return api;
  }

  global.registerMarkdownViewerRatPolicyCoverageAnalyzer = registerMarkdownViewerRatPolicyCoverageAnalyzer;
})(typeof window !== "undefined" ? window : globalThis);
