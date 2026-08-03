(function(global) {
  "use strict";

  /** Parse actionable task and dependency failures from plain Gradle output. */
  function registerMarkdownViewerGradleProjectFailureParser(app) {
    function isActionable(message) {
      return /^(?:Execution failed for task|Could not (?:resolve|find|determine|compile)|A problem occurred|Plugin .* was not found|Could not create task|Gradle could not start)/i.test(message);
    }

    /** Convert unlocated Gradle failure lines into project-level Problems rows. */
    function parse(request = {}) {
      const lines = Array.isArray(request.lines) ? request.lines : [];
      const consumed = request.consumedLineIndexes || new Set();
      const diagnostics = [];
      const consumedLineIndexes = [];
      for (let index = 0; index < lines.length; index += 1) {
        if (consumed.has(index)) continue;
        const line = request.helpers?.stripAnsi?.(lines[index]) || String(lines[index] || "");
        const message = line.trim().replace(/^>\s*/, "");
        if (!isActionable(message)) continue;
        diagnostics.push({
          severity: "error",
          message,
          originalMessage: message,
          filePath: "",
          line: 1,
          column: 1,
          source: "gradle"
        });
        consumedLineIndexes.push(index);
      }
      return { diagnostics, consumedLineIndexes };
    }

    const api = { parse };
    app.registerModule?.("gradleProjectFailureParser", api);
    return api;
  }

  global.registerMarkdownViewerGradleProjectFailureParser = registerMarkdownViewerGradleProjectFailureParser;
})(typeof window !== "undefined" ? window : globalThis);
