(function(global) {
  "use strict";

  /** Build an Outline from YAML mapping keys while preserving nested mappings. */
  function registerMarkdownViewerYamlOutlineLanguage(app, deps = {}) {
    const syntax = deps.syntaxTree;

    function isPair(node) { return node?.name === "Pair"; }

    function extract(tree, source, helpers = syntax) {
      const context = helpers.createContext(source);
      const rootPairs = helpers.collectDirectMatches(helpers.getRoot(tree), isPair);
      const rootNames = new Set(rootPairs.map((node) => getPairName(node)).filter(Boolean));
      const isKubernetesManifest = rootNames.has("apiVersion") && rootNames.has("kind");

      function getPairName(node) {
        const keyNode = helpers.findDescendant(node, (child) => child.name === "Key");
        const rawName = keyNode ? context.nodeText(keyNode) : context.nodeText(node).split(":", 1)[0];
        return rawName.trim().replace(/^[']|[']$/g, "").replace(/^[\"]|[\"]$/g, "");
      }

      function getPairValue(node) {
        const raw = context.nodeText(node);
        const colonIndex = raw.indexOf(":");
        if (colonIndex < 0) return "";
        return raw.slice(colonIndex + 1).split(/\r?\n/, 1)[0].trim().replace(/^['"]|['"]$/g, "");
      }

      function getKubernetesDetail(path, node) {
        if (path === "kind") return getPairValue(node) || "resource kind";
        if (path === "metadata.name") return "resource name";
        if (path === "spec") return "resource spec";
        return "mapping key";
      }

      function buildPair(node, parentPath = "") {
        const keyNode = helpers.findDescendant(node, (child) => child.name === "Key");
        const name = getPairName(node);
        const path = parentPath ? `${parentPath}.${name}` : name;
        const displayName = isKubernetesManifest && path === "metadata.name" ? "metadata.name" : name;
        return context.createNode("key", displayName, node, {
          detail: isKubernetesManifest ? getKubernetesDetail(path, node) : "mapping key",
          selectionFrom: context.findNameOffset(keyNode || node, name),
          children: helpers.collectDirectMatches(node, isPair).map((child) => buildPair(child, path))
        });
      }

      return rootPairs.map((node) => buildPair(node));
    }

    const api = syntax.createLanguageAdapter({
      id: "yaml",
      label: "YAML",
      extensions: /\.(?:yaml|yml)$/i,
      emptyMessage: "No YAML mapping keys found.",
      extract
    }, deps);
    app.registerModule?.("yamlOutlineLanguage", api);
    return api;
  }

  global.registerMarkdownViewerYamlOutlineLanguage = registerMarkdownViewerYamlOutlineLanguage;
})(typeof window !== "undefined" ? window : globalThis);
