(function (window, document) {
  "use strict";

  var app = window.markdownViewerApp;

  if (!app) {
    app = window.createMarkdownViewerApp
      ? window.createMarkdownViewerApp()
      : {
          constants: {},
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
    window.markdownViewerApp = app;
  }

  document.addEventListener("DOMContentLoaded", function () {
    app.bootedAt = Date.now();
    app.documentReadyState = document.readyState;
  });
})(window, document);
