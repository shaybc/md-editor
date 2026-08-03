(function(global) {
  "use strict";

  /** Build an Outline from the HTML element hierarchy. */
  function registerMarkdownViewerHtmlOutlineLanguage(app, deps = {}) {
    const syntax = deps.syntaxTree;
    const api = syntax.createLanguageAdapter({
      id: "html",
      label: "HTML",
      extensions: /\.(?:html|htm)$/i,
      emptyMessage: "No HTML elements found.",
      extract(tree, source, helpers = syntax) { return helpers.extractMarkupElements(tree, source); }
    }, deps);
    app.registerModule?.("htmlOutlineLanguage", api);
    return api;
  }

  global.registerMarkdownViewerHtmlOutlineLanguage = registerMarkdownViewerHtmlOutlineLanguage;
})(typeof window !== "undefined" ? window : globalThis);
