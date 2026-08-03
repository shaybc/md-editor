(function(global) {
  "use strict";

  function registerMarkdownViewerJsonOutlineLanguage(app, deps = {}) {
    const syntax = deps.syntaxTree;

    function isProperty(node) { return node?.name === "Property"; }

    function extract(tree, source, helpers = syntax) {
      const context = helpers.createContext(source);

      function buildProperty(node) {
        const nameNode = helpers.findDescendant(node, (child) => child.name === "PropertyName");
        const rawName = nameNode ? context.nodeText(nameNode) : context.nodeText(node).split(":", 1)[0];
        let name = rawName.trim().replace(/^['"]|['"]$/g, "");
        try { name = JSON.parse(rawName); } catch (_error) { /* JSONC and incomplete keys use the trimmed text. */ }
        const children = helpers.collectDirectMatches(node, isProperty).map(buildProperty);
        const selectionNode = nameNode || node;
        return context.createNode("key", name, node, {
          detail: children.length ? "object" : "property",
          selectionFrom: context.findNameOffset(selectionNode, name),
          children
        });
      }

      return helpers.collectDirectMatches(helpers.getRoot(tree), isProperty).map(buildProperty);
    }

    const api = syntax.createLanguageAdapter({
      id: "json",
      label: "JSON",
      extensions: /\.(?:json|jsonc|map)$/i,
      emptyMessage: "No JSON properties found.",
      extract
    }, deps);
    app.registerModule?.("jsonOutlineLanguage", api);
    return api;
  }

  global.registerMarkdownViewerJsonOutlineLanguage = registerMarkdownViewerJsonOutlineLanguage;
})(typeof window !== "undefined" ? window : globalThis);
