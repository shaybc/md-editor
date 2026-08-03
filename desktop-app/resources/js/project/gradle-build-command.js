(function(global) {
  "use strict";

  /** Build Gradle project commands from persisted launcher and test choices. */
  function registerMarkdownViewerGradleBuildCommand(app) {
    function quote(value) {
      const text = String(value || "");
      return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
    }

    /** Normalize Gradle test choices so running tests always compiles them. */
    function normalizeTestOptions(options = {}) {
      const runTests = options.runTests === true;
      return { compileTests: runTests || options.compileTests !== false, runTests };
    }

    function appendLauncherOptions(parts, options) {
      parts.push("--console=plain", "--no-daemon");
      if (options.offline === true) parts.push("--offline");
      if (String(options.userHome || "").trim()) parts.push("--gradle-user-home", quote(String(options.userHome).trim()));
    }

    /** Produce the project-root Gradle rebuild command. */
    function buildCommand(options = {}) {
      const parts = [String(options.runner || "gradle")];
      appendLauncherOptions(parts, options);
      const tests = normalizeTestOptions(options);
      parts.push("clean", tests.runTests ? "build" : "assemble");
      if (tests.compileTests && !tests.runTests) parts.push("testClasses");
      return parts.join(" ");
    }

    /** Produce the project-root Gradle clean command. */
    function buildCleanCommand(options = {}) {
      const parts = [String(options.runner || "gradle")];
      appendLauncherOptions(parts, options);
      parts.push("clean");
      return parts.join(" ");
    }

    /** Produce an arbitrary Gradle tasks command for a Run configuration. */
    function buildTasksCommand(options = {}) {
      const parts = [String(options.runner || "gradle")];
      appendLauncherOptions(parts, options);
      const projectPath = String(options.projectPath || "").trim().replace(/^:+|:+$/g, "");
      String(options.tasks || "").trim().split(/\s+/).filter(Boolean).forEach((value) => {
        parts.push(projectPath && !value.startsWith("-") && !value.includes(":") ? `:${projectPath}:${value}` : value);
      });
      return parts.join(" ");
    }

    const api = { buildCleanCommand, buildCommand, buildTasksCommand, normalizeTestOptions };
    app.registerModule?.("gradleBuildCommand", api);
    return api;
  }

  global.registerMarkdownViewerGradleBuildCommand = registerMarkdownViewerGradleBuildCommand;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerGradleBuildCommand };
})(typeof window !== "undefined" ? window : globalThis);
