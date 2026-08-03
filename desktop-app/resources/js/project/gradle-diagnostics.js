(function(global) {
  "use strict";

  /** Coordinate focused Gradle output parsers and de-duplicate Problems diagnostics. */
  function registerMarkdownViewerGradleDiagnostics(app, deps = {}) {
    function stripAnsi(value) {
      return String(value || "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    }

    function normalizeFilePath(value) {
      const normalized = String(value || "").trim().replace(/\\/g, "/");
      return /^\/[a-zA-Z]:\//.test(normalized) ? normalized.slice(1) : normalized;
    }

    function getParsers() {
      const parsers = (Array.isArray(deps.parsers) ? deps.parsers : []).concat([
        app.modules?.gradleCompilerDiagnosticsParser,
        app.modules?.gradleBuildScriptDiagnosticsParser,
        app.modules?.gradleProjectFailureParser
      ]).filter((parser) => parser && typeof parser.parse === "function");
      return Array.from(new Set(parsers));
    }

    /** Parse Gradle output and return unique Problems diagnostics in log order. */
    function parseDiagnostics(output, options = {}) {
      const lines = String(output || "").split(/\r?\n/);
      const consumedLineIndexes = new Set();
      const diagnostics = [];
      const seen = new Set();
      const helpers = { normalizeFilePath, stripAnsi };
      for (const parser of getParsers()) {
        const result = parser.parse({ lines, projectPath: options.projectPath, helpers, consumedLineIndexes }) || {};
        for (const diagnostic of result.diagnostics || []) {
          const key = [diagnostic.severity, diagnostic.filePath, diagnostic.line, diagnostic.column, diagnostic.message].join("|");
          if (seen.has(key)) continue;
          seen.add(key);
          diagnostics.push(diagnostic);
        }
        for (const index of result.consumedLineIndexes || []) consumedLineIndexes.add(index);
      }
      return diagnostics;
    }

    const api = { parseDiagnostics };
    app.registerModule?.("gradleDiagnostics", api);
    return api;
  }

  global.registerMarkdownViewerGradleDiagnostics = registerMarkdownViewerGradleDiagnostics;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerGradleDiagnostics };
})(typeof window !== "undefined" ? window : globalThis);
