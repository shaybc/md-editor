(function(global) {
  "use strict";

  /** Build an Outline from YAML mapping keys while preserving nested mappings. */
  function registerMarkdownViewerYamlOutlineLanguage(app, deps = {}) {
    const syntax = deps.syntaxTree;

    function isPair(node) { return node?.name === "Pair"; }

    function extract(tree, source, helpers = syntax) {
      const context = helpers.createContext(source);

      function buildPair(node) {
        const keyNode = helpers.findDescendant(node, (child) => child.name === "Key");
        const rawName = keyNode ? context.nodeText(keyNode) : context.nodeText(node).split(":", 1)[0];
        const name = rawName.trim().replace(/^['"]|['"]$/g, "");
        return context.createNode("key", name, node, {
          detail: "mapping key",
          selectionFrom: context.findNameOffset(keyNode || node, name),
          children: helpers.collectDirectMatches(node, isPair).map(buildPair)
        });
      }

      return helpers.collectDirectMatches(helpers.getRoot(tree), isPair).map(buildPair);
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
