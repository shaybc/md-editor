(function(global) {
  "use strict";

  /** Build wrapper-aware Apache RAT and effective-POM commands. */
  function registerMarkdownViewerRatCommandBuilder(app, deps = {}) {
    function quote(value) {
      const text = String(value || "");
      if (!text) return "\"\"";
      return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
    }

    function relativePath(root, path) {
      const base = String(root || "").replace(/\\/g, "/").replace(/\/+$/, "");
      const target = String(path || "").replace(/\\/g, "/");
      return target.toLowerCase().startsWith(`${base.toLowerCase()}/`) ? target.slice(base.length + 1) : target;
    }

    function build(context, options = {}) {
      const runner = context.wrapper?.runner || context.module?.runner || "mvn";
      const cwd = context.wrapper?.cwd || context.module?.projectRoot || context.projectPath;
      const pomPath = options.pomPath || context.module?.pomPath;
      const args = [];
      if (pomPath && String(pomPath).replace(/\\/g, "/").toLowerCase() !== `${String(cwd).replace(/\\/g, "/").toLowerCase()}/pom.xml`) {
        args.push("-f", quote(relativePath(cwd, pomPath)));
      }
      if (options.scope === "module-with-dependencies") {
        args.push("-pl", quote(relativePath(context.projectPath, context.module.projectRoot)), "-am");
      }
      if (options.kind === "effective-pom") args.push("help:effective-pom");
      else if (options.kind === "skip") args.push("-Drat.skip=true", options.goal || "verify");
      else args.push("apache-rat:check");
      return { command: [runner].concat(args).join(" "), cwd, kind: options.kind || "check" };
    }

    const api = { build, quote };
    app?.registerModule?.("ratCommandBuilder", api);
    return api;
  }

  global.registerMarkdownViewerRatCommandBuilder = registerMarkdownViewerRatCommandBuilder;
})(typeof window !== "undefined" ? window : globalThis);
