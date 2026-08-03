(function(global) {
  "use strict";

  /** Parse Gradle Groovy and Kotlin build-script failures with source locations. */
  function registerMarkdownViewerGradleBuildScriptDiagnosticsParser(app) {
    /** Convert build-script failure blocks into navigable diagnostics. */
    function parse(request = {}) {
      const lines = Array.isArray(request.lines) ? request.lines : [];
      const diagnostics = [];
      const consumedLineIndexes = [];
      for (let index = 0; index < lines.length; index += 1) {
        const line = request.helpers?.stripAnsi?.(lines[index]) || String(lines[index] || "");
        const header = line.match(/^(?:Build file|Settings file) ['"](.+?\.(?:gradle|gradle\.kts))['"] line:\s*(\d+)/i);
        const kotlin = line.match(/^[ew]:\s+(?:file:\/\/\/)?(.+?\.(?:gradle|gradle\.kts)):(?:(\d+):(\d+)|\s*\((\d+),\s*(\d+)\):?)\s+(.+)$/i);
        if (kotlin) {
          diagnostics.push({
            severity: /^w:/i.test(line) ? "warning" : "error",
            message: kotlin[6].trim(),
            filePath: request.helpers?.normalizeFilePath?.(kotlin[1]) || kotlin[1],
            line: Number(kotlin[2] || kotlin[4]) || 1,
            column: Number(kotlin[3] || kotlin[5]) || 1,
            source: "gradle"
          });
          consumedLineIndexes.push(index);
          continue;
        }
        if (!header) continue;
        const detail = lines.slice(index + 1, index + 8)
          .map((value) => request.helpers?.stripAnsi?.(value) || String(value || ""))
          .map((value) => value.trim())
          .find((value) => value && !/^\* (?:Where|What went wrong|Try):?$/i.test(value));
        diagnostics.push({
          severity: "error",
          message: detail || "Gradle build script evaluation failed.",
          filePath: request.helpers?.normalizeFilePath?.(header[1]) || header[1],
          line: Number(header[2]) || 1,
          column: 1,
          source: "gradle"
        });
        consumedLineIndexes.push(index);
      }
      return { diagnostics, consumedLineIndexes };
    }

    const api = { parse };
    app.registerModule?.("gradleBuildScriptDiagnosticsParser", api);
    return api;
  }

  global.registerMarkdownViewerGradleBuildScriptDiagnosticsParser = registerMarkdownViewerGradleBuildScriptDiagnosticsParser;
})(typeof window !== "undefined" ? window : globalThis);
