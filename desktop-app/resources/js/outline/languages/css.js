(function(global) {
  "use strict";

  function registerMarkdownViewerCssOutlineLanguage(app, deps = {}) {
    const syntax = deps.syntaxTree;
    const OUTLINE_NODES = new Set([
      "RuleSet", "MediaStatement", "SupportsStatement", "ContainerStatement", "LayerStatement",
      "KeyframesStatement", "Keyframe", "PageStatement", "FontFaceStatement"
    ]);

    function isOutlineNode(node) { return OUTLINE_NODES.has(String(node?.name || "")); }

    function extract(tree, source, helpers = syntax) {
      const context = helpers.createContext(source);

      function buildRule(node) {
        const raw = context.nodeText(node);
        const header = raw.slice(0, [raw.indexOf("{"), raw.indexOf(";")].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? raw.length)
          .replace(/\s+/g, " ").trim();
        const name = header || String(node.name || "rule");
        const kind = node.name === "RuleSet" || node.name === "Keyframe" ? "selector" : "namespace";
        return context.createNode(kind, name, node, {
          detail: node.name === "RuleSet" ? "selector" : "at-rule",
          selectionFrom: context.findNameOffset(node, name),
          children: helpers.collectDirectMatches(node, isOutlineNode).map(buildRule)
        });
      }

      return helpers.collectDirectMatches(helpers.getRoot(tree), isOutlineNode).map(buildRule);
    }

    const api = syntax.createLanguageAdapter({
      id: "css",
      label: "CSS",
      languageIds: ["css", "scss"],
      extensions: /\.(?:css|scss|sass)$/i,
      emptyMessage: "No CSS rules found.",
      extract
    }, deps);
    app.registerModule?.("cssOutlineLanguage", api);
    return api;
  }

  global.registerMarkdownViewerCssOutlineLanguage = registerMarkdownViewerCssOutlineLanguage;
})(typeof window !== "undefined" ? window : globalThis);
