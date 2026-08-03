(function(global) {
  "use strict";

  /** Read Apache RAT declarations without rewriting or executing Maven. */
  function registerMarkdownViewerRatConfigurationReader(app, deps = {}) {
    const filesystem = () => (deps.Neutralino || global.Neutralino)?.filesystem;

    function readTag(text, name) {
      const match = String(text || "").match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
      return match ? match[1].trim() : "";
    }

    function readAllTags(text, name) {
      return Array.from(String(text || "").matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "gi")))
        .map((match) => match[1].trim());
    }

    function findRatPlugins(text) {
      const plugins = [];
      const pluginPattern = /<plugin(?:\s[^>]*)?>([\s\S]*?)<\/plugin>/gi;
      let match;
      while ((match = pluginPattern.exec(String(text || "")))) {
        const body = match[1];
        if (readTag(body, "artifactId") !== "apache-rat-plugin") continue;
        const prefix = String(text || "").slice(0, match.index);
        const pluginManagementStart = prefix.lastIndexOf("<pluginManagement");
        const pluginManagementEnd = prefix.lastIndexOf("</pluginManagement>");
        const profileStart = prefix.lastIndexOf("<profile");
        const profileEnd = prefix.lastIndexOf("</profile>");
        plugins.push({
          start: match.index,
          end: pluginPattern.lastIndex,
          body,
          version: readTag(body, "version"),
          configuration: readTag(body, "configuration"),
          inPluginManagement: pluginManagementStart > pluginManagementEnd,
          inProfile: profileStart > profileEnd,
          executions: readAllTags(body, "execution"),
          exclusions: readAllTags(body, "inputExclude").concat(readAllTags(body, "exclude")),
          exclusionFiles: readAllTags(body, "inputExcludeFile"),
          includes: readAllTags(body, "inputInclude").concat(readAllTags(body, "include")),
          configs: readAllTags(body, "config"),
          approvedFamilies: readAllTags(body, "licenseFamiliesApproved")
            .concat(readAllTags(body, "approvedLicenseFamily"))
            .concat(readAllTags(body, "approvedLicenses")),
          skip: readTag(body, "skip"),
          editLicense: readTag(body, "editLicense")
        });
      }
      return plugins;
    }

    function readParentRelativePath(text) {
      const parent = readTag(text, "parent");
      if (!parent) return "";
      const explicit = readTag(parent, "relativePath");
      return explicit || "../pom.xml";
    }

    function readModules(text) {
      const modules = readTag(text, "modules");
      return modules ? readAllTags(modules, "module") : [];
    }

    async function readPom(path) {
      const text = await filesystem().readFile(path);
      return {
        path,
        text,
        artifactId: readTag(text, "artifactId"),
        packaging: readTag(text, "packaging") || "jar",
        parentRelativePath: readParentRelativePath(text),
        modules: readModules(text),
        ratPlugins: findRatPlugins(text)
      };
    }

    const api = { findRatPlugins, readAllTags, readPom, readTag };
    app?.registerModule?.("ratConfigurationReader", api);
    return api;
  }

  global.registerMarkdownViewerRatConfigurationReader = registerMarkdownViewerRatConfigurationReader;
})(typeof window !== "undefined" ? window : globalThis);
