(function(global) {
  "use strict";

  /** Parse generic project-level Maven ERROR lines that no specialized parser owns. */
  function registerMarkdownViewerMavenProjectFailureParser(app) {
    /**
     * Parse actionable project-level Maven errors without file locations.
     * @param {object} request Maven parser request with log lines and shared helpers.
     * @returns {object} Diagnostics and consumed line indexes.
     */
    function parse(request = {}) {
      const lines = Array.isArray(request.lines) ? request.lines : [];
      const helpers = request.helpers || {};
      const consumed = request.consumedLineIndexes || new Set();
      const diagnostics = [];
      const consumedLineIndexes = [];

      for (let index = 0; index < lines.length; index += 1) {
        if (consumed.has(index)) continue;
        const line = helpers.stripAnsi?.(lines[index]) || String(lines[index] || "");
        const projectError = line.match(/^\[ERROR\]\s+(.+)$/i);
        if (!projectError) continue;
        const originalMessage = projectError[1].trim();
        if (!helpers.isBuildDetail?.(originalMessage)) continue;
        diagnostics.push({
          severity: "error",
          message: originalMessage,
          originalMessage,
          filePath: "",
          line: 1,
          column: 1,
          source: "maven"
        });
        consumedLineIndexes.push(index);
      }

      return { diagnostics, consumedLineIndexes };
    }

    const api = { parse };
    app.registerModule?.("mavenProjectFailureParser", api);
    return api;
  }

  global.registerMarkdownViewerMavenProjectFailureParser = registerMarkdownViewerMavenProjectFailureParser;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerMavenProjectFailureParser };
})(typeof window !== "undefined" ? window : globalThis);
