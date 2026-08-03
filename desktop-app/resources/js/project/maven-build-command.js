(function(global) {
  "use strict";

  /** Build Maven rebuild commands from the selected test policy. */
  function registerMarkdownViewerMavenBuildCommand(app) {
    /** Normalize Maven test choices so running tests always compiles them. */
    function normalizeTestOptions(options = {}) {
      const runTests = options.runTests === true;
      return {
        compileTests: runTests || options.compileTests !== false,
        runTests
      };
    }

    /** Produce the Maven clean-package command for a detected runner. */
    function buildCommand(options = {}) {
      const parts = [String(options.runner || "mvn"), "clean", "package"];
      if (Array.isArray(options.optionArguments)) {
        options.optionArguments.map((argument) => String(argument || "").trim()).filter(Boolean).forEach((argument) => parts.push(argument));
      } else {
        const tests = normalizeTestOptions(options);
        if (!tests.compileTests) parts.push("-Dmaven.test.skip=true");
        else if (!tests.runTests) parts.push("-DskipTests");
        if (options.skipRat === true) parts.push("-Drat.skip=true");
      }
      return parts.join(" ");
    }

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function relativePath(root, path) {
      const base = normalizePath(root).toLowerCase();
      const target = normalizePath(path);
      return target.toLowerCase().startsWith(`${base}/`) ? target.slice(base.length + 1) : target;
    }

    function quote(value) {
      const text = String(value || "");
      return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
    }

    /** Produce the Maven effective-POM inspection command for a detected project. */
    function buildEffectivePomCommand(options = {}) {
      const runner = String(options.runner || "mvn");
      const cwd = normalizePath(options.cwd || options.projectRoot || "");
      const pomPath = normalizePath(options.pomPath || "");
      const parts = [runner];
      if (cwd && pomPath && pomPath.toLowerCase() !== `${cwd.toLowerCase()}/pom.xml`) {
        parts.push("-f", quote(relativePath(cwd, pomPath)));
      }
      parts.push("help:effective-pom");
      return parts.join(" ");
    }

    /** Produce the Maven clean-only command for a detected runner. */
    function buildCleanCommand(options = {}) {
      return String(options.runner || "mvn") + " clean";
    }

    /** Produce the Maven Spotless apply command for a detected module. */
    function buildSpotlessApplyCommand(options = {}) {
      const runner = String(options.runner || "mvn");
      const cwd = normalizePath(options.cwd || options.projectRoot || "");
      const pomPath = normalizePath(options.pomPath || "");
      const parts = [runner];
      if (cwd && pomPath && pomPath.toLowerCase() !== `${cwd.toLowerCase()}/pom.xml`) {
        parts.push("-f", quote(relativePath(cwd, pomPath)));
      }
      parts.push("spotless:apply");
      return parts.join(" ");
    }

    /** Produce an arbitrary Maven goals command for a Run configuration. */
    function buildGoalsCommand(options = {}) {
      const profiles = String(options.profiles || "").trim().split(/\s+/).filter(Boolean)
        .map((profile) => profile.startsWith("-") ? profile : `-P${profile}`);
      return [String(options.runner || "mvn"), ...profiles, String(options.commandLine || "").trim()].filter(Boolean).join(" ");
    }

    const api = { buildCleanCommand, buildCommand, buildCompileCommand, buildEffectivePomCommand, buildGoalsCommand, buildSpotlessApplyCommand, normalizeTestOptions };
    /** Produce a module compile command without packaging project JARs. */
    function buildCompileCommand(options = {}) {
      return String(options.runner || "mvn") + " "
        + (options.includeTests === true ? "test-compile" : "compile")
        + " -Dmaven.compiler.useIncrementalCompilation=false";
    }

    app.registerModule?.("mavenBuildCommand", api);
    return api;
  }

  global.registerMarkdownViewerMavenBuildCommand = registerMarkdownViewerMavenBuildCommand;
})(typeof window !== "undefined" ? window : globalThis);
