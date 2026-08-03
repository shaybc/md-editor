(function(global) {
  "use strict";

  /**
   * Register the pure policy that compares selected Java modules with JDT's real inventory.
   * @param {object} app Application module registry.
   * @returns {object} JDT scope validator API.
   */
  function registerMarkdownViewerJdtProjectScopeValidator(app) {
    /**
     * Validate the usable imported JDT projects for one frozen analysis scope.
     * @param {object} request Expected roots and JDT inventory.
     * @returns {object} Validated downstream roots and mismatch evidence.
     */
    function validate(request = {}) {
      const expectedProjectRoots = uniquePaths(request.expectedProjectRoots);
      const expectedSourceRoots = uniquePaths(request.expectedSourceRoots);
      const inventory = Array.isArray(request.projects) ? request.projects.map(normalizeProject) : [];
      const usableProjects = inventory.filter((project) => project.accessible && project.javaProject && !project.internal && project.path);
      const usableByPath = new Map(usableProjects.map((project) => [comparisonKey(project.path), project]));
      const validatedProjectRoots = expectedProjectRoots.filter((root) => usableByPath.has(comparisonKey(root)));
      const missingProjectRoots = expectedProjectRoots.filter((root) => !usableByPath.has(comparisonKey(root)));
      const expectedKeys = new Set(expectedProjectRoots.map(comparisonKey));
      const unexpectedProjects = usableProjects.filter((project) => project.sourceRoots.length > 0 && !expectedKeys.has(comparisonKey(project.path)));
      const importedSourceRoots = uniquePaths(inventory.flatMap((project) => project.sourceRoots || []));
      const importedSourceKeys = new Set(importedSourceRoots.map(comparisonKey));
      const missingSourceRoots = expectedSourceRoots.filter((root) => !importedSourceKeys.has(comparisonKey(root)));
      const sourceScope = expectedSourceRoots.length > 0;
      return {
        valid: sourceScope
          ? missingSourceRoots.length === 0
          : expectedProjectRoots.length > 0 && missingProjectRoots.length === 0 && validatedProjectRoots.length > 0 && unexpectedProjects.length === 0,
        expectedProjectRoots,
        expectedSourceRoots,
        validatedProjectRoots: sourceScope && missingSourceRoots.length === 0 ? expectedProjectRoots : validatedProjectRoots,
        missingProjectRoots,
        missingSourceRoots,
        importedSourceRoots,
        unexpectedProjects,
        projects: inventory
      };
    }

    const api = { validate };
    app?.registerModule?.("jdtProjectScopeValidator", api);
    return api;
  }

  function uniquePaths(values) {
    const result = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
      const path = normalizePath(value);
      const key = comparisonKey(path);
      if (!path || seen.has(key)) continue;
      seen.add(key);
      result.push(path);
    }
    return result;
  }

  function normalizeProject(project = {}) {
    return {
      name: String(project.name || ""),
      locationUri: String(project.locationUri || ""),
      path: normalizePath(project.locationUri),
      open: project.open === true,
      accessible: project.accessible === true,
      javaProject: project.javaProject === true,
      sourceRoots: uniquePaths(project.sourceRoots),
      internal: project.internal === true || String(project.name || "") === "jdt.ls-java-project"
    };
  }

  function normalizePath(value) {
    const raw = String(value || "");
    if (/^file:/i.test(raw)) {
      try {
        const url = new URL(raw);
        const decoded = decodeURIComponent(url.pathname || "");
        return decoded.replace(/^\/([A-Za-z]:\/)/, "$1").replace(/\\/g, "/").replace(/\/+$/, "");
      } catch (_error) {
        return raw.replace(/^file:\/\/\/?/i, "").replace(/\\/g, "/").replace(/\/+$/, "");
      }
    }
    return raw.replace(/\\/g, "/").replace(/\/+$/, "");
  }

  function comparisonKey(value) {
    return normalizePath(value).toLowerCase();
  }

  global.registerMarkdownViewerJdtProjectScopeValidator = registerMarkdownViewerJdtProjectScopeValidator;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJdtProjectScopeValidator };
  }
})(typeof window !== "undefined" ? window : globalThis);
