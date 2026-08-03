(function(global) {
  "use strict";

  function registerMarkdownViewerJavaScriptOutlineLanguage(app, deps = {}) {
    const syntax = deps.syntaxTree;
    const DECLARATIONS = new Set([
      "ClassDeclaration", "FunctionDeclaration", "MethodDeclaration", "VariableDeclaration",
      "InterfaceDeclaration", "TypeAliasDeclaration", "EnumDeclaration", "NamespaceDeclaration",
      "ModuleDeclaration", "PropertyDeclaration"
    ]);

    function isDeclaration(node) { return DECLARATIONS.has(String(node?.name || "")); }

    function describe(node, raw) {
      const type = String(node?.name || "");
      const compact = raw.replace(/\s+/g, " ").trim();
      if (type === "VariableDeclaration" && !/(?:=>|\bfunction\b)/.test(raw)) return null;
      const patterns = [
        ["ClassDeclaration", /\bclass\s+([A-Za-z_$][\w$]*)/, "class"],
        ["FunctionDeclaration", /\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)/, "function"],
        ["InterfaceDeclaration", /\binterface\s+([A-Za-z_$][\w$]*)/, "interface"],
        ["TypeAliasDeclaration", /\btype\s+([A-Za-z_$][\w$]*)/, "type"],
        ["EnumDeclaration", /\benum\s+([A-Za-z_$][\w$]*)/, "enum"],
        ["NamespaceDeclaration", /\bnamespace\s+([A-Za-z_$][\w$]*)/, "namespace"],
        ["ModuleDeclaration", /\bmodule\s+([A-Za-z_$][\w$]*)/, "module"],
        ["VariableDeclaration", /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/, "function"],
        ["MethodDeclaration", /(?:^|\s)(?:get\s+|set\s+|async\s+|static\s+)*([A-Za-z_$][\w$]*)\s*\(/, "method"],
        ["PropertyDeclaration", /(?:^|\s)([A-Za-z_$][\w$]*)\s*(?:[?!:]|=)/, "property"]
      ];
      const definition = patterns.find(([nodeName]) => nodeName === type);
      const match = definition?.[1].exec(compact);
      return match ? { name: match[1], kind: definition[2], detail: type.replace(/Declaration$/, "") } : null;
    }

    function extract(tree, source, helpers = syntax) {
      const context = helpers.createContext(source);

      function buildDeclaration(node) {
        const description = describe(node, context.nodeText(node));
        if (!description) return null;
        const children = helpers.collectDirectMatches(node, isDeclaration).map(buildDeclaration).filter(Boolean);
        return context.createNode(description.kind, description.name, node, {
          detail: description.detail,
          selectionFrom: context.findNameOffset(node, description.name),
          children
        });
      }

      return helpers.collectDirectMatches(helpers.getRoot(tree), isDeclaration).map(buildDeclaration).filter(Boolean);
    }

    const api = syntax.createLanguageAdapter({
      id: "javascript",
      label: "JavaScript/TypeScript",
      languageIds: ["javascript", "typescript"],
      extensions: /\.(?:js|jsx|mjs|cjs|ts|tsx)$/i,
      emptyMessage: "No JavaScript or TypeScript declarations found.",
      extract
    }, deps);
    app.registerModule?.("javaScriptOutlineLanguage", api);
    return api;
  }

  global.registerMarkdownViewerJavaScriptOutlineLanguage = registerMarkdownViewerJavaScriptOutlineLanguage;
})(typeof window !== "undefined" ? window : globalThis);
