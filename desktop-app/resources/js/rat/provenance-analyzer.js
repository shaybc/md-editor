(function(global) {
  "use strict";

  /** Collect conservative Git and path evidence without making ownership conclusions. */
  function registerMarkdownViewerRatProvenanceAnalyzer(app, deps = {}) {
    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/");
    }

    async function analyze(context) {
      const filePath = normalizePath(context?.finding?.filePath || context?.targetPath);
      const projectPath = normalizePath(context?.projectPath).replace(/\/+$/, "");
      const relativePath = filePath.toLowerCase().startsWith(`${projectPath.toLowerCase()}/`)
        ? filePath.slice(projectPath.length + 1)
        : filePath;
      let status = null;
      try {
        status = await deps.runGitAction?.(projectPath, "status");
      } catch (_error) {
        status = null;
      }
      const statusFile = (status?.status?.files || status?.files || []).find((entry) =>
        normalizePath(entry.path).toLowerCase() === relativePath.toLowerCase()
      );
      return {
        relativePath,
        trackedState: statusFile
          ? (statusFile.index === "?" || statusFile.workingDir === "?" ? "untracked" : "modified")
          : status ? "tracked-or-clean" : "unknown",
        generatedLooking: /(?:^|\/)(?:target|build|generated|snapshots?|fixtures?)(?:\/|$)/i.test(relativePath),
        conclusion: "Evidence only; verify origin and licensing with the project owner or upstream source."
      };
    }

    const api = { analyze };
    app?.registerModule?.("ratProvenanceAnalyzer", api);
    return api;
  }

  global.registerMarkdownViewerRatProvenanceAnalyzer = registerMarkdownViewerRatProvenanceAnalyzer;
})(typeof window !== "undefined" ? window : globalThis);
