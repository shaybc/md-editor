(function(global) {
  "use strict";

  /** Build a read-only inventory of the Maven project and its current RAT policy. */
  function registerMarkdownViewerRatPolicyProjectInventory(app, deps = {}) {
    const filesystem = () => (deps.Neutralino || global.Neutralino)?.filesystem;

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(root, child) {
      return `${normalizePath(root)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    async function fileExists(path) {
      try {
        return (await filesystem().getStats(path))?.isFile === true;
      } catch (_error) {
        return false;
      }
    }

    function readProjectLicense(pomText) {
      const licenses = String(pomText || "").match(/<licenses(?:\s[^>]*)?>([\s\S]*?)<\/licenses>/i)?.[1] || "";
      const license = licenses.match(/<license(?:\s[^>]*)?>([\s\S]*?)<\/license>/i)?.[1] || "";
      const name = deps.configurationReader.readTag(license, "name");
      const url = deps.configurationReader.readTag(license, "url");
      const combined = `${name} ${url}`.toLowerCase();
      let identifier = "";
      if (combined.includes("apache") && combined.includes("2.0")) identifier = "Apache-2.0";
      else if (/\bmit\b/.test(combined)) identifier = "MIT";
      else if (combined.includes("bsd") && combined.includes("3")) identifier = "BSD-3-Clause";
      else if (combined.includes("eclipse public") && combined.includes("2.0")) identifier = "EPL-2.0";
      return { identifier, name, url };
    }

    async function discoverDocuments(projectPath) {
      const names = ["LICENSE", "LICENSE.txt", "NOTICE", "NOTICE.txt", "README.md", "THIRD-PARTY.md", "DEPENDENCIES"];
      const entries = [];
      for (const name of names) {
        const path = joinPath(projectPath, name);
        if (await fileExists(path)) entries.push({ name, path });
      }
      return entries;
    }

    /** Analyze the opened Maven project without running Maven or writing files. */
    async function analyze(request = {}) {
      const projectPath = normalizePath(request.projectPath || deps.getWorkspaceRoot?.());
      if (!projectPath) throw new Error("Open a Maven project before configuring Apache RAT policy.");
      const context = await deps.projectContext.analyze({
        projectPath,
        targetPath: projectPath,
        finding: { kind: "policy-setup", source: "local", projectPath, filePath: "", originalMessage: "" }
      });
      const rootPom = context.pomChain[context.pomChain.length - 1] || context.pomChain[0];
      const governing = context.governing;
      const pluginVersion = governing?.version || "";
      return {
        ...context,
        rootPom,
        projectLicense: readProjectLicense(rootPom?.text),
        documents: await discoverDocuments(projectPath),
        pluginVersion,
        capabilities: deps.versionCapabilities.resolve(pluginVersion),
        hasActivePlugin: context.declarations.some((entry) => entry.active),
        hasBoundExecution: context.declarations.some((entry) => entry.active && (entry.executions || []).some((execution) => /<goal>\s*check\s*<\/goal>/i.test(execution))),
        hasPluginManagementOnly: context.declarations.length > 0 && !context.declarations.some((entry) => entry.active),
        hasSkip: context.declarations.some((entry) => String(entry.skip).toLowerCase() === "true"),
        profiles: context.declarations.filter((entry) => entry.inProfile),
        analyzedAt: Date.now()
      };
    }

    const api = { analyze };
    app?.registerModule?.("ratPolicyProjectInventory", api);
    return api;
  }

  global.registerMarkdownViewerRatPolicyProjectInventory = registerMarkdownViewerRatPolicyProjectInventory;
})(typeof window !== "undefined" ? window : globalThis);
