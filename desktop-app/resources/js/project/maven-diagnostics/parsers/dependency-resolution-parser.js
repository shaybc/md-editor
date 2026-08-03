(function(global) {
  "use strict";

  /** Parse Maven dependency-resolution failures into concise project diagnostics. */
  function registerMarkdownViewerMavenDependencyResolutionParser(app) {
    function summarizeDependencyResolutionFailure(message) {
      const text = String(message || "").trim();
      const moduleName = text.match(/(?:on project|for project)\s+([^:\s]+)[:\s]/i)?.[1] || "project";
      const artifactSection = text.match(/The following artifacts could not be resolved:\s+(.+?)(?::\s+[^:]+:[^:]+:[^:]+\s+was not found|:\s+Could not find artifact|\s+->\s+\[Help|$)/i)?.[1] || "";
      const artifacts = artifactSection
        .split(/,\s*/)
        .map((artifact) => artifact.trim())
        .filter((artifact) => /^[\w.-]+:[\w.-]+:[\w.-]+(?::[\w.-]+)?(?::[\w.-]+)?$/.test(artifact));
      const firstMissing = artifacts[0] || text.match(/(?:Could not find artifact|resolved:)\s+([^\s,]+:[^\s,]+:[^\s,]+)/i)?.[1] || "unknown artifact";
      const repository = text.match(/\b(?:in|from)\s+(https?:\/\/[^\s)]+)/i)?.[1] || "configured repositories";
      const cached = /cached in the local repository|resolution is not reattempted|updates are forced/i.test(text);
      const count = artifacts.length;
      const countText = count > 1 ? `${count} artifacts` : "a required artifact";
      return `Maven dependency resolution failed for ${moduleName}: could not resolve ${countText}. First missing: ${firstMissing}. Repository: ${repository}.${cached ? " Maven cached the failed lookup; use -U to force updates." : ""}`;
    }

    function isDependencyResolutionFailure(message) {
      return /Could not resolve dependencies|The following artifacts could not be resolved|DependencyResolutionException|resolution is not reattempted|updates are forced/i.test(message);
    }

    /**
     * Parse dependency-resolution failures from Maven ERROR lines.
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
        if (!isDependencyResolutionFailure(originalMessage)) continue;
        diagnostics.push({
          severity: "error",
          message: summarizeDependencyResolutionFailure(originalMessage),
          originalMessage,
          fullMessage: originalMessage,
          filePath: "",
          line: 1,
          column: 1,
          source: "maven",
          problemType: "maven-dependency-resolution"
        });
        consumedLineIndexes.push(index);
      }

      return { diagnostics, consumedLineIndexes };
    }

    const api = { parse, summarizeDependencyResolutionFailure };
    app.registerModule?.("mavenDependencyResolutionParser", api);
    return api;
  }

  global.registerMarkdownViewerMavenDependencyResolutionParser = registerMarkdownViewerMavenDependencyResolutionParser;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerMavenDependencyResolutionParser };
})(typeof window !== "undefined" ? window : globalThis);
