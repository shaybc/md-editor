(function(global) {
  "use strict";

  function registerMarkdownViewerPythonOutlineLanguage(app, deps = {}) {
    const syntax = deps.syntaxTree;
    const DECLARATIONS = new Set(["ClassDefinition", "FunctionDefinition"]);

    function isDeclaration(node) { return DECLARATIONS.has(String(node?.name || "")); }

    function extract(tree, source, helpers = syntax) {
      const context = helpers.createContext(source);

      function buildDeclaration(node) {
        const raw = context.nodeText(node);
        const isClass = node.name === "ClassDefinition";
        const match = (isClass ? /\bclass\s+([A-Za-z_]\w*)/ : /\b(?:async\s+)?def\s+([A-Za-z_]\w*)/).exec(raw);
        if (!match) return null;
        return context.createNode(isClass ? "class" : "function", match[1], node, {
          detail: isClass ? "class" : (/\basync\s+def\b/.test(raw) ? "async function" : "function"),
          selectionFrom: context.findNameOffset(node, match[1]),
          children: helpers.collectDirectMatches(node, isDeclaration).map(buildDeclaration).filter(Boolean)
        });
      }

      return helpers.collectDirectMatches(helpers.getRoot(tree), isDeclaration).map(buildDeclaration).filter(Boolean);
    }

    const api = syntax.createLanguageAdapter({
      id: "python",
      label: "Python",
      extensions: /\.(?:py|pyw)$/i,
      emptyMessage: "No Python declarations found.",
      extract
    }, deps);
    app.registerModule?.("pythonOutlineLanguage", api);
    return api;
  }

  global.registerMarkdownViewerPythonOutlineLanguage = registerMarkdownViewerPythonOutlineLanguage;
})(typeof window !== "undefined" ? window : globalThis);
