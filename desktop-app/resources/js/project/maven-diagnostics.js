(function(global) {
  "use strict";

  /** Convert Maven build output into Problems diagnostics using focused parser modules. */
  function registerMarkdownViewerMavenDiagnostics(app, deps = {}) {
    function stripAnsi(value) {
      return String(value || "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    }

    function normalizeFilePath(value) {
      const normalized = String(value || "").trim().replace(/\\/g, "/");
      return /^\/[a-zA-Z]:\//.test(normalized) ? normalized.slice(1) : normalized;
    }

    function isBuildDetail(message) {
      return !/^(?:COMPILATION ERROR\s*:|->\s*\[Help|To see the full stack trace|Re-run Maven|For more information|Run\s+['"]?mvn\s+|After correcting the problems|mvn\s+<args>|\[Help \d+\]\s+https?:)/i.test(message);
    }

    function readMultilineItem(rawLine, level) {
      const line = stripAnsi(rawLine);
      const repeatedLevel = line.match(new RegExp("^\\[" + level + "\\]\\s{2,}(\\S.*)$", "i"));
      if (repeatedLevel) return repeatedLevel[1].trim();
      return line.match(/^\s{2,}(\S.*)$/)?.[1]?.trim() || "";
    }

    function getDirectoryPath(filePath) {
      const normalized = normalizeFilePath(filePath).replace(/\/+$/, "");
      if (/\/pom\.xml$/i.test(normalized)) return normalized.replace(/\/pom\.xml$/i, "");
      const slash = normalized.lastIndexOf("/");
      return slash > 0 ? normalized.slice(0, slash) : "";
    }

    function resolveRelativePath(pathValue, basePath) {
      const root = normalizeFilePath(basePath).replace(/\/+$/, "");
      return root ? root + "/" + String(pathValue || "").replace(/^\/+/, "") : String(pathValue || "");
    }

    function resolveMavenPomDirectory(line, projectPath) {
      const match = String(line || "").match(/^\[INFO\]\s+from\s+(.+?pom\.xml)\s*$/i);
      if (!match) return "";
      const pomPath = normalizeFilePath(match[1]);
      const isAbsolute = /^[a-zA-Z]:\//.test(pomPath) || pomPath.startsWith("/");
      return getDirectoryPath(isAbsolute ? pomPath : resolveRelativePath(pomPath, projectPath)) || normalizeFilePath(projectPath).replace(/\/+$/, "");
    }

    function resolveMavenArtifactDirectory(line, projectPath) {
      const match = String(line || "").match(/^\[INFO\]\s+---\s+.+?\s+@\s+([^\s]+)\s+---\s*$/i);
      const root = normalizeFilePath(projectPath).replace(/\/+$/, "");
      if (!match || !root) return "";
      const artifactId = match[1].trim();
      const rootName = root.split("/").pop();
      return artifactId && artifactId !== rootName ? root + "/" + artifactId : "";
    }

    function isMultilineNoiseItem(item) {
      const value = String(item || "").trim();
      return /^@@\s/.test(value)
        || /^[+-]/.test(value)
        || /^\.\.\.\s+\(\d+\s+more\s+lines\s+that\s+didn't\s+fit\)/i.test(value)
        || /^Run\s+'mvn\s+/i.test(value);
    }

    function resolveMultilineLocation(item, projectPath, modulePath) {
      const value = String(item || "").replace(/^[-*]\s+/, "").trim().replace(/^(["'])(.*)\1$/, "$2");
      const located = value.match(/^(.+?):\[(\d+),(\d+)\](?:\s+.*)?$/);
      const candidate = normalizeFilePath(located?.[1] || value);
      if (!candidate || /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
        return { filePath: "", line: 1, column: 1 };
      }
      const isAbsolute = /^[a-zA-Z]:\//.test(candidate) || candidate.startsWith("/");
      const isRelativePath = /^[^\s:]+(?:\/[^:]+)+$/.test(candidate);
      if (!isAbsolute && !isRelativePath) return { filePath: "", line: 1, column: 1 };
      const root = normalizeFilePath(modulePath || projectPath).replace(/\/+$/, "");
      return {
        filePath: isAbsolute || !root ? candidate : root + "/" + candidate.replace(/^\/+/, ""),
        line: Number(located?.[2]) || 1,
        column: Number(located?.[3]) || 1
      };
    }

    function getSpecializedParsers() {
      const parsers = (Array.isArray(deps.parsers) ? deps.parsers : []).concat([
        app.modules?.spotlessMavenDiagnosticsParser,
        app.modules?.mavenCompilerDiagnosticsParser,
        app.modules?.mavenDependencyResolutionParser,
        app.modules?.mavenMultilineDiagnosticsParser,
        app.modules?.mavenProjectFailureParser
      ]).filter((parser) => parser && typeof parser.parse === "function");
      return Array.from(new Set(parsers));
    }

    function runSpecializedParsers(lines, options) {
      const consumedLineIndexes = new Set();
      const diagnostics = [];
      const helpers = {
        stripAnsi,
        normalizeFilePath,
        readMultilineItem,
        resolveMavenPomDirectory,
        resolveMavenArtifactDirectory,
        resolveMultilineLocation,
        isBuildDetail,
        isMultilineNoiseItem
      };
      for (const parser of getSpecializedParsers()) {
        const result = parser.parse({ lines, projectPath: options.projectPath, helpers, consumedLineIndexes }) || {};
        for (const diagnostic of result.diagnostics || []) diagnostics.push(diagnostic);
        for (const index of result.consumedLineIndexes || []) consumedLineIndexes.add(index);
      }
      return { diagnostics, consumedLineIndexes };
    }

    /** Parse Maven output with registered parser modules and de-duplicate Problems rows. */
    function parseDiagnostics(output, options = {}) {
      const diagnostics = [];
      const seen = new Set();
      const append = (diagnostic) => {
        const key = [diagnostic.severity, diagnostic.filePath, diagnostic.line, diagnostic.column, diagnostic.message].join("|");
        if (seen.has(key)) return;
        seen.add(key);
        diagnostics.push(diagnostic);
      };

      const lines = String(output || "").split(/\r?\n/);
      const specialized = runSpecializedParsers(lines, options);
      for (const diagnostic of specialized.diagnostics) append(diagnostic);
      return diagnostics;
    }

    const api = { parseDiagnostics };
    app.registerModule?.("mavenDiagnostics", api);
    return api;
  }

  global.registerMarkdownViewerMavenDiagnostics = registerMarkdownViewerMavenDiagnostics;
})(typeof window !== "undefined" ? window : globalThis);
