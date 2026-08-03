(function(global) {
  "use strict";

  function registerMarkdownViewerMarkdownOutlineLanguage(app, deps = {}) {
    const syntax = deps.syntaxTree;

    function extract(tree, source, helpers = syntax) {
      const context = helpers.createContext(source);
      const headings = [];
      helpers.walk(helpers.getRoot(tree), (node) => {
        const match = /^(?:ATX|Setext)Heading([1-6])$/.exec(String(node?.name || ""));
        if (!match) return;
        const level = Number(match[1]);
        const raw = context.nodeText(node);
        const name = raw.replace(/^\s{0,3}#{1,6}\s*/, "").replace(/\s*#+\s*$/, "")
          .replace(/\r?\n\s*(?:=+|-+)\s*$/, "").trim();
        if (!name) return;
        headings.push({ level, node: context.createNode("heading", name, node, {
          detail: `H${level}`,
          selectionFrom: context.findNameOffset(node, name)
        }) });
      });

      const roots = [];
      const stack = [];
      headings.forEach((entry) => {
        while (stack.length && stack[stack.length - 1].level >= entry.level) stack.pop();
        if (stack.length) stack[stack.length - 1].node.children.push(entry.node);
        else roots.push(entry.node);
        stack.push(entry);
      });
      return roots;
    }

    const api = syntax.createLanguageAdapter({
      id: "markdown",
      label: "Markdown",
      extensions: /\.(?:md|markdown|mdown|mkd)$/i,
      emptyMessage: "No Markdown headings found.",
      extract
    }, deps);
    app.registerModule?.("markdownOutlineLanguage", api);
    return api;
  }

  global.registerMarkdownViewerMarkdownOutlineLanguage = registerMarkdownViewerMarkdownOutlineLanguage;
})(typeof window !== "undefined" ? window : globalThis);
