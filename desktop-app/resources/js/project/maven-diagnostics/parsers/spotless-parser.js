(function(global) {
  "use strict";

  /** Parse Spotless Maven failures into useful file-level diagnostics. */
  function registerMarkdownViewerSpotlessMavenDiagnosticsParser(app) {
    function cleanLogLine(line, helpers) {
      return helpers.stripAnsi(line).replace(/^\[(?:ERROR|WARNING|INFO)\]\s*/, "").trim();
    }

    function isSpotlessLine(line) {
      return /com\.diffplug\.spotless:spotless-maven-plugin|spotless-maven-plugin/i.test(line);
    }

    function isSpotlessFailureStart(line) {
      return isSpotlessLine(line) && /The following files had format violations:/i.test(line);
    }

    function isIgnoredSpotlessItem(item) {
      const value = String(item || "").trim();
      return !value
        || /^@@\s/.test(value)
        || /^[+-]/.test(value)
        || /^\.\.\.\s+\(\d+\s+more\s+lines\s+that\s+didn't\s+fit\)/i.test(value)
        || /^Run\s+'mvn\s+spotless:apply'/i.test(value)
        || /^After correcting the problems/i.test(value)
        || /^mvn\s+<args>/i.test(value)
        || /^Violations also present in:?$/i.test(value);
    }

    function isBlockEnd(line) {
      return /^\[ERROR\]\s+After correcting the problems/i.test(line)
        || /^\[ERROR\]\s+For more information/i.test(line)
        || /^\[ERROR\]\s+->\s+\[Help/i.test(line)
        || /^\[INFO\]\s+/i.test(line);
    }

    function parse(request = {}) {
      const lines = Array.isArray(request.lines) ? request.lines : [];
      const helpers = request.helpers || {};
      const diagnostics = [];
      const consumedLineIndexes = [];
      let currentMavenModulePath = "";
      let currentMavenArtifactPath = "";

      for (let index = 0; index < lines.length; index += 1) {
        const rawLine = lines[index];
        const line = helpers.stripAnsi(rawLine);
        const pomDirectory = helpers.resolveMavenPomDirectory?.(line, request.projectPath);
        if (pomDirectory) currentMavenModulePath = pomDirectory;
        const artifactDirectory = helpers.resolveMavenArtifactDirectory?.(line, request.projectPath);
        if (artifactDirectory) currentMavenArtifactPath = artifactDirectory;
        if (!isSpotlessFailureStart(line)) continue;

        const blockLines = [line];
        const blockStart = index;
        let nextIndex = index + 1;
        while (nextIndex < lines.length) {
          const nextLine = helpers.stripAnsi(lines[nextIndex]);
          if (isBlockEnd(nextLine)) break;
          blockLines.push(nextLine);
          nextIndex += 1;
        }
        for (let consumed = blockStart; consumed < nextIndex; consumed += 1) consumedLineIndexes.push(consumed);

        const fullMessage = blockLines.map((blockLine) => cleanLogLine(blockLine, helpers)).filter(Boolean).join("\n");
        const foundFiles = [];
        for (const blockLine of blockLines) {
          const item = helpers.readMultilineItem?.(blockLine, "ERROR") || "";
          if (isIgnoredSpotlessItem(item)) continue;
          const normalizedItem = helpers.normalizeFilePath(String(item || "").replace(/^[-*]\s+/, "").trim());
          const modulePath = currentMavenModulePath || (/^src\//.test(normalizedItem) ? currentMavenArtifactPath : "");
          const location = helpers.resolveMultilineLocation?.(item, request.projectPath, modulePath) || {};
          if (!location.filePath) continue;
          foundFiles.push({ relativePath: item, location });
        }

        if (!foundFiles.length) {
          diagnostics.push({
            severity: "error",
            message: "Spotless format violations were reported, but no affected file path could be parsed.",
            originalMessage: fullMessage,
            fullMessage,
            filePath: "",
            line: 1,
            column: 1,
            source: "maven",
            problemType: "spotless-format"
          });
          index = nextIndex - 1;
          continue;
        }

        for (const file of foundFiles) {
          diagnostics.push({
            severity: "error",
            message: `Spotless format violation: ${file.relativePath}`,
            originalMessage: fullMessage,
            fullMessage,
            filePath: file.location.filePath,
            line: file.location.line || 1,
            column: file.location.column || 1,
            source: "maven",
            problemType: "spotless-format"
          });
        }
        index = nextIndex - 1;
      }

      return { diagnostics, consumedLineIndexes };
    }

    const api = { parse };
    app.registerModule?.("spotlessMavenDiagnosticsParser", api);
    return api;
  }

  global.registerMarkdownViewerSpotlessMavenDiagnosticsParser = registerMarkdownViewerSpotlessMavenDiagnosticsParser;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerSpotlessMavenDiagnosticsParser };
})(typeof window !== "undefined" ? window : globalThis);
