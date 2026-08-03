(function(window) {
  "use strict";

  function registerMarkdownViewerAiCompanionAutocomplete(app, deps) {
    const controllerFactory = window.createAiCompanionAutocompleteController;
    if (typeof controllerFactory !== "function") {
      throw new Error("AI Companion autocomplete controller was not loaded.");
    }
    const api = controllerFactory(app, deps);
    app.registerModule("aiCompanionAutocomplete", api);
    return api;
  }

  window.registerMarkdownViewerAiCompanionAutocomplete = registerMarkdownViewerAiCompanionAutocomplete;
})(window);