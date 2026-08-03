(function(global) {
  "use strict";

  function registerMarkdownViewerXmlOutlineLanguage(app, deps = {}) {
    const syntax = deps.syntaxTree;
    function extract(tree, source, helpers = syntax) {
      return helpers.extractMarkupElements(tree, source);
    }

    const api = syntax.createLanguageAdapter({
      id: "xml",
      label: "XML",
      languageIds: ["xml", "maven"],
      extensions: /\.(?:xml|xsd|xsl|xslt|svg|pom)$/i,
      emptyMessage: "No XML elements found.",
      extract
    }, deps);
    app.registerModule?.("xmlOutlineLanguage", api);
    return api;
  }

  global.registerMarkdownViewerXmlOutlineLanguage = registerMarkdownViewerXmlOutlineLanguage;
})(typeof window !== "undefined" ? window : globalThis);
