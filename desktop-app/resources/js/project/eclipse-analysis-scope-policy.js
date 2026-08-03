// Eclipse analysis scope policy: selects generated Eclipse projects without overwriting manual choices.
(function(global) {
  "use strict";

  function normalizePath(value) {
    return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  }

  function hasEclipseDescriptor(module) {
    return module?.kind === "eclipse"
      || (Array.isArray(module?.kinds) && module.kinds.includes("eclipse"));
  }

  function hasManualSelection(configuration) {
    const scope = configuration?.analysisScope || {};
    if (typeof scope.customized === "boolean") return scope.customized;
    return scope.mode === "workspace"
      || (scope.includedModuleRoots || []).length > 0
      || (scope.excludedModuleRoots || []).length > 0;
  }

  function sameValues(left, right) {
    return JSON.stringify((left || []).map(normalizePath).sort()) === JSON.stringify((right || []).map(normalizePath).sort());
  }

  /**
   * Prepare an explicit module scope from the leaf projects carrying Eclipse descriptors.
   *
   * @param {string} workspaceRoot - Opened project folder.
   * @param {Array<object>} modules - Freshly detected Java workspace modules.
   * @param {object} configuration - Saved Java Build Path configuration.
   * @param {Function} toRelativeModuleRoot - Converts an absolute module root for persistence.
   * @returns {{changed: boolean, requiresConfirmation: boolean, moduleCount: number, analysisScope?: object}}
   *   The proposed scope change. This function performs no IO.
   */
  function createEclipseScopePlan(workspaceRoot, modules, configuration, toRelativeModuleRoot) {
    const eclipseModules = (modules || []).filter(hasEclipseDescriptor);
    const leafModules = eclipseModules.filter((candidate) => {
      const candidateRoot = `${normalizePath(candidate.root).toLowerCase()}/`;
      return !eclipseModules.some((other) => other !== candidate
        && `${normalizePath(other.root).toLowerCase()}/`.startsWith(candidateRoot));
    });
    if (!leafModules.length) return { changed: false, requiresConfirmation: false, moduleCount: 0 };

    const selectedKeys = new Set(leafModules.map((module) => normalizePath(module.root).toLowerCase()));
    const relativeRoot = (module) => normalizePath(toRelativeModuleRoot(workspaceRoot, module.root));
    const includedModuleRoots = leafModules.map(relativeRoot).sort();
    const excludedModuleRoots = (modules || [])
      .filter((module) => !selectedKeys.has(normalizePath(module.root).toLowerCase()))
      .map(relativeRoot)
      .sort();
    const current = configuration?.analysisScope || {};
    const changed = current.mode !== "build-path"
      || !sameValues(current.includedModuleRoots, includedModuleRoots)
      || !sameValues(current.excludedModuleRoots, excludedModuleRoots);
    return {
      changed,
      requiresConfirmation: changed && hasManualSelection(configuration),
      moduleCount: includedModuleRoots.length,
      analysisScope: {
        mode: "build-path",
        includedModuleRoots,
        excludedModuleRoots,
        customized: hasManualSelection(configuration)
      }
    };
  }

  /**
   * Register the pure Eclipse analysis-scope policy.
   *
   * @param {object} app - MD-Editor application registry.
   * @returns {{createEclipseScopePlan: Function, hasManualSelection: Function}} Policy API.
   */
  function registerMarkdownViewerEclipseAnalysisScopePolicy(app) {
    const api = { createEclipseScopePlan, hasManualSelection };
    app?.registerModule?.("eclipseAnalysisScopePolicy", api);
    return api;
  }

  global.registerMarkdownViewerEclipseAnalysisScopePolicy = registerMarkdownViewerEclipseAnalysisScopePolicy;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createEclipseScopePlan, hasManualSelection, registerMarkdownViewerEclipseAnalysisScopePolicy };
  }
})(typeof window !== "undefined" ? window : globalThis);
