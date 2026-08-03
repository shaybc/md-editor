(function(window) {
  "use strict";

  /**
   * Recent-file context provider, Continue-inspired ("Recent File Context" in its context
   * selection docs). Pulls short snippets from other currently-open documents so the model
   * sees related code without any new disk I/O or indexing — only tabs already in memory.
   * @param {{getOpenDocuments: function(): Array<{path: string, content: string}>, maxFiles?: number, maxCharsPerFile?: number}} deps
   * @returns {{collect: function(object): Array<{path: string, snippet: string}>}} Provider.
   */
  function createAiCompanionAutocompleteRecentFilesProvider(deps) {
    const maxFiles = Math.max(0, deps?.maxFiles ?? 3);
    const maxCharsPerFile = Math.max(0, deps?.maxCharsPerFile ?? 600);

    function collect(context) {
      if (maxFiles === 0 || typeof deps?.getOpenDocuments !== "function") return [];
      const activePath = context?.path || "";
      const documents = deps.getOpenDocuments() || [];
      return documents
        .filter((doc) => doc && doc.path && doc.path !== activePath && String(doc.content || "").trim())
        .slice(-maxFiles)
        .map((doc) => ({
          path: doc.path,
          snippet: String(doc.content).slice(0, maxCharsPerFile)
        }));
    }

    return { collect };
  }

  window.createAiCompanionAutocompleteRecentFilesProvider = createAiCompanionAutocompleteRecentFilesProvider;
})(window);
