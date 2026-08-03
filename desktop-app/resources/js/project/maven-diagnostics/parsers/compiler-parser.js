(function(global) {
  "use strict";

  /** Parse Maven compiler source locations into navigable Problems diagnostics. */
  function registerMarkdownViewerMavenCompilerDiagnosticsParser(app) {
    /**
     * Parse javac-style Maven compiler lines.
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
        const located = line.match(/^\[(ERROR|WARNING)\]\s+(.+?\.java):\[(\d+),(\d+)\]\s+(.+)$/i);
        if (!located) continue;
        diagnostics.push({
          severity: located[1].toLowerCase() === "warning" ? "warning" : "error",
          message: located[5].trim(),
          filePath: helpers.normalizeFilePath?.(located[2]) || located[2],
          line: Number(located[3]) || 1,
          column: Number(located[4]) || 1,
          source: "maven"
        });
        consumedLineIndexes.push(index);
      }

      return { diagnostics, consumedLineIndexes };
    }

    const api = { parse };
    app.registerModule?.("mavenCompilerDiagnosticsParser", api);
    return api;
  }

  global.registerMarkdownViewerMavenCompilerDiagnosticsParser = registerMarkdownViewerMavenCompilerDiagnosticsParser;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerMavenCompilerDiagnosticsParser };
})(typeof window !== "undefined" ? window : globalThis);
