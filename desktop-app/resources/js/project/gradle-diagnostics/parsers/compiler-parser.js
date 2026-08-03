(function(global) {
  "use strict";

  /** Parse Java and Kotlin compiler locations from plain Gradle output. */
  function registerMarkdownViewerGradleCompilerDiagnosticsParser(app) {
    /** Convert compiler output lines into navigable Gradle diagnostics. */
    function parse(request = {}) {
      const lines = Array.isArray(request.lines) ? request.lines : [];
      const diagnostics = [];
      const consumedLineIndexes = [];
      for (let index = 0; index < lines.length; index += 1) {
        const line = request.helpers?.stripAnsi?.(lines[index]) || String(lines[index] || "");
        const java = line.match(/^(.+?\.java):(\d+):(?:(\d+):)?\s*(error|warning):\s*(.+)$/i);
        const kotlin = line.match(/^[ew]:\s+(?:file:\/\/\/)?(.+?\.kts?):(?:(\d+):(\d+)|\s*\((\d+),\s*(\d+)\):?)\s+(.+)$/i);
        const match = java || kotlin;
        if (!match) continue;
        const severityToken = java ? match[4] : line.trim().slice(0, 1);
        diagnostics.push({
          severity: /warning|w/i.test(severityToken) ? "warning" : "error",
          message: (java ? match[5] : match[6]).trim(),
          filePath: request.helpers?.normalizeFilePath?.(match[1]) || match[1],
          line: Number(java ? match[2] : (match[2] || match[4])) || 1,
          column: Number(java ? match[3] : (match[3] || match[5])) || 1,
          source: "gradle"
        });
        consumedLineIndexes.push(index);
      }
      return { diagnostics, consumedLineIndexes };
    }

    const api = { parse };
    app.registerModule?.("gradleCompilerDiagnosticsParser", api);
    return api;
  }

  global.registerMarkdownViewerGradleCompilerDiagnosticsParser = registerMarkdownViewerGradleCompilerDiagnosticsParser;
})(typeof window !== "undefined" ? window : globalThis);
