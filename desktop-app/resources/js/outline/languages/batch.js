(function(global) {
  "use strict";

  /** Build a navigable Outline from callable labels in Windows batch files. */
  function registerMarkdownViewerBatchOutlineLanguage(app, deps = {}) {
    const syntax = deps.syntaxTree;

    function parseSource(source, helpers = syntax) {
      const context = helpers.createContext(source);
      const nodes = [];
      const matcher = /^\s*:([^:\s][^\r\n]*)/gm;
      let match;
      while ((match = matcher.exec(context.source))) {
        const name = match[1].trim();
        if (!name) continue;
        const selectionFrom = match.index + match[0].indexOf(name);
        nodes.push(context.createNode("label", name, {
          from: match.index,
          to: match.index + match[0].length
        }, { detail: "batch label", selectionFrom }));
      }
      return nodes;
    }

    const api = syntax.createLanguageAdapter({
      id: "batch",
      label: "Batch",
      extensions: /\.(?:bat|cmd)$/i,
      emptyMessage: "No batch labels found.",
      parseSource
    }, deps);
    app.registerModule?.("batchOutlineLanguage", api);
    return api;
  }

  global.registerMarkdownViewerBatchOutlineLanguage = registerMarkdownViewerBatchOutlineLanguage;
})(typeof window !== "undefined" ? window : globalThis);
