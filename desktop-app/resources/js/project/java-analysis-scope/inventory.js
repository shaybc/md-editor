(function(global) {
  "use strict";

  /** Selects the authoritative JDT analysis inventory for the configured build system. */
  function registerMarkdownViewerJavaAnalysisInventory(app, deps = {}) {
    function inferBuildSystem(context) {
      const configured = String(context.configuration?.buildSystem || "");
      if (configured === "gradle" || configured === "maven" || configured === "javac") return configured;
      const rootKinds = (context.discoveredModules || [])
        .filter((module) => String(module.root || "").toLowerCase() === String(context.workspaceRoot || "").toLowerCase())
        .flatMap((module) => module.kinds || [module.kind]);
      if (rootKinds.includes("gradle")) return "gradle";
      if (rootKinds.includes("maven")) return "maven";
      return "javac";
    }

    /**
     * Resolve the canonical inventory without falling back between managed providers.
     * @param {object} context Workspace discovery context.
     * @returns {Promise<object>} Inventory result, including a blocking managed-model error.
     */
    async function resolve(context = {}) {
      const buildSystem = inferBuildSystem(context);
      try {
        const inventory = buildSystem === "gradle"
          ? await deps.gradle.resolve(context)
          : buildSystem === "maven"
            ? await deps.maven.resolve(context)
            : deps.standard.resolve(context);
        return { ...inventory, buildSystem, error: "" };
      } catch (error) {
        return {
          buildSystem,
          kind: buildSystem === "gradle" ? "gradle-modules" : "maven-modules",
          label: buildSystem === "gradle" ? "Gradle modules" : "Maven reactor modules",
          entries: [],
          error: error?.message || `${buildSystem} project inventory could not be resolved.`,
          errorCode: error?.code || ""
        };
      }
    }

    const api = { inferBuildSystem, resolve };
    app?.registerModule?.("javaAnalysisInventory", api);
    return api;
  }

  global.registerMarkdownViewerJavaAnalysisInventory = registerMarkdownViewerJavaAnalysisInventory;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJavaAnalysisInventory };
  }
})(typeof window !== "undefined" ? window : globalThis);
