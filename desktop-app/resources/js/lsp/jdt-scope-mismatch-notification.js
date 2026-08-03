/* User-facing explanation policy for JDT project-scope mismatches. */
(function(global) {
  "use strict";

  const MODULE_PREVIEW_LIMIT = 5;

  /**
   * Register the pure formatter for actionable JDT scope-mismatch notifications.
   *
   * @param {object} app - MD-Editor application module registry.
   * @returns {{create: Function}} Scope-mismatch notification formatter.
   */
  function registerMarkdownViewerJdtScopeMismatchNotification(app) {
    /**
     * Convert project-inventory validation evidence into concise user-facing text.
     *
     * @param {object} generation - Incomplete analysis generation snapshot.
     * @returns {{title: string, message: string}} Notification copy.
     */
    function create(generation = {}) {
      const failure = generation.failure || {};
      const evidence = failure.details?.scopeEvidence || {};
      const expected = uniquePaths(evidence.expectedProjectRoots);
      const validated = uniquePaths(evidence.validatedProjectRoots);
      const missing = uniquePaths(evidence.missingProjectRoots);
      const projects = Array.isArray(evidence.projects) ? evidence.projects : [];
      const usableProjects = projects.filter(isUsableProject);
      const internalProjectCount = projects.filter((project) => project?.internal === true).length;
      const lines = [];

      if (!expected.length) {
        lines.push("No modules are selected for Java analysis, so JDT has no project scope to import.");
      } else {
        lines.push(`JDT imported ${validated.length} of ${expected.length} modules selected for Java analysis.`);
        if (!validated.length) {
          lines.push("None of the selected module paths matched a usable JDT project.");
        }
      }

      if (missing.length) {
        lines.push(`Missing modules (${missing.length}): ${createPathPreview(missing, generation.workspaceRoot)}.`);
      }
      if (!usableProjects.length) {
        const internalNote = internalProjectCount
          ? ` Only ${internalProjectCount} internal JDT ${pluralize("project", internalProjectCount)} ${internalProjectCount === 1 ? "was" : "were"} found; internal projects cannot be analyzed.`
          : "";
        lines.push(`JDT reported no usable Java projects.${internalNote}`);
      } else {
        const importedPaths = usableProjects.map((project) => project.path || project.locationUri || project.name);
        lines.push(`Usable JDT projects (${usableProjects.length}): ${createPathPreview(importedPaths, generation.workspaceRoot)}.`);
      }
      lines.push("Review the selected modules and generated import scope in Java Build Path, then run analysis again.");

      return {
        title: "Java Analysis Scope Mismatch",
        message: lines.join("\n\n")
      };
    }

    const api = { create };
    app?.registerModule?.("jdtScopeMismatchNotification", api);
    return api;
  }

  function uniquePaths(values) {
    return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || "")).filter(Boolean)));
  }

  function isUsableProject(project) {
    return project?.accessible === true && project?.javaProject === true && project?.internal !== true
      && Boolean(project?.path || project?.locationUri);
  }

  function createPathPreview(paths, workspaceRoot) {
    const labels = paths.slice(0, MODULE_PREVIEW_LIMIT).map((path) => createRelativeLabel(path, workspaceRoot));
    const remaining = paths.length - labels.length;
    return remaining > 0 ? `${labels.join(", ")} and ${remaining} more` : labels.join(", ");
  }

  function createRelativeLabel(value, workspaceRoot) {
    const path = normalizePath(value);
    const root = normalizePath(workspaceRoot);
    if (root && path.toLowerCase() === root.toLowerCase()) return ".";
    if (root && path.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return path.slice(root.length + 1);
    return path || String(value || "unknown");
  }

  function normalizePath(value) {
    const raw = String(value || "");
    if (/^file:/i.test(raw)) {
      try {
        const url = new URL(raw);
        return decodeURIComponent(url.pathname || "").replace(/^\/([A-Za-z]:\/)/, "$1").replace(/\\/g, "/").replace(/\/+$/, "");
      } catch (_error) {
        return raw.replace(/^file:\/\/\/?/i, "").replace(/\\/g, "/").replace(/\/+$/, "");
      }
    }
    return raw.replace(/\\/g, "/").replace(/\/+$/, "");
  }

  function pluralize(noun, count) {
    return Number(count) === 1 ? noun : `${noun}s`;
  }

  global.registerMarkdownViewerJdtScopeMismatchNotification = registerMarkdownViewerJdtScopeMismatchNotification;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJdtScopeMismatchNotification };
  }
})(typeof window !== "undefined" ? window : globalThis);
