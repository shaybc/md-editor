(function (root) {
  "use strict";

  const MARKDOWN_VIEWER_SHARED_CONSTANTS = Object.freeze({
    DESKTOP_PROFILE_DIR: ".md-editor"
  });

  function createMarkdownViewerApp() {
    return {
      constants: { ...MARKDOWN_VIEWER_SHARED_CONSTANTS },
      dom: {},
      state: {},
      actions: {},
      services: {},
      modules: {},
      registerModule: function registerModule(name, moduleApi) {
        if (!name) return;
        this.modules[name] = moduleApi || {};
      },
    };
  }

  if (root) {
    root.markdownViewerSharedConstants = MARKDOWN_VIEWER_SHARED_CONSTANTS;
    root.createMarkdownViewerApp = createMarkdownViewerApp;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      MARKDOWN_VIEWER_SHARED_CONSTANTS,
      createMarkdownViewerApp
    };
  }
})(typeof window !== "undefined" ? window : null);
