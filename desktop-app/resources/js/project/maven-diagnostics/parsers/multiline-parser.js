(function(global) {
  "use strict";

  /** Parse Maven multiline blocks that enumerate affected files or repeated details. */
  function registerMarkdownViewerMavenMultilineDiagnosticsParser(app) {
    function createMultilineMessage(header, item) {
      return header.replace(/:\s*$/, "") + ": " + item;
    }

    /**
     * Parse generic Maven ERROR/WARNING blocks with indented items.
     * @param {object} request Maven parser request with log lines and shared helpers.
     * @returns {object} Diagnostics and consumed line indexes.
     */
    function parse(request = {}) {
      const lines = Array.isArray(request.lines) ? request.lines : [];
      const helpers = request.helpers || {};
      const consumed = request.consumedLineIndexes || new Set();
      const diagnostics = [];
      const consumedLineIndexes = [];
      let currentMavenModulePath = "";
      let currentMavenArtifactPath = "";

      for (let index = 0; index < lines.length; index += 1) {
        if (consumed.has(index)) continue;
        const line = helpers.stripAnsi?.(lines[index]) || String(lines[index] || "");
        const pomDirectory = helpers.resolveMavenPomDirectory?.(line, request.projectPath);
        if (pomDirectory) currentMavenModulePath = pomDirectory;
        const artifactDirectory = helpers.resolveMavenArtifactDirectory?.(line, request.projectPath);
        if (artifactDirectory) currentMavenArtifactPath = artifactDirectory;
        const blockHeader = line.match(/^\[(ERROR|WARNING)\]\s+(.+:\s*)$/i);
        if (!blockHeader) continue;

        const items = [];
        let nextIndex = index + 1;
        while (nextIndex < lines.length) {
          if (consumed.has(nextIndex)) break;
          const item = helpers.readMultilineItem?.(lines[nextIndex], blockHeader[1]) || "";
          if (!item) break;
          items.push(item);
          nextIndex += 1;
        }
        if (!items.length) continue;

        for (const item of items) {
          if (helpers.isMultilineNoiseItem?.(item)) continue;
          const normalizedItem = helpers.normalizeFilePath?.(String(item || "").replace(/^[-*]\s+/, "").trim()) || String(item || "");
          const modulePath = currentMavenModulePath || (/^src\//.test(normalizedItem) ? currentMavenArtifactPath : "");
          const location = helpers.resolveMultilineLocation?.(item, request.projectPath, modulePath) || {};
          diagnostics.push({
            severity: blockHeader[1].toLowerCase() === "warning" ? "warning" : "error",
            message: createMultilineMessage(blockHeader[2].trim(), item),
            filePath: location.filePath || "",
            line: location.line || 1,
            column: location.column || 1,
            source: "maven"
          });
        }
        for (let consumedIndex = index; consumedIndex < nextIndex; consumedIndex += 1) consumedLineIndexes.push(consumedIndex);
        index = nextIndex - 1;
      }

      return { diagnostics, consumedLineIndexes };
    }

    const api = { parse };
    app.registerModule?.("mavenMultilineDiagnosticsParser", api);
    return api;
  }

  global.registerMarkdownViewerMavenMultilineDiagnosticsParser = registerMarkdownViewerMavenMultilineDiagnosticsParser;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerMavenMultilineDiagnosticsParser };
})(typeof window !== "undefined" ? window : globalThis);
