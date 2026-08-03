(function(global) {
  "use strict";

  /** Own the four-way unsaved Java source choice shown before compilation. */
  function registerMarkdownViewerJavaCompileSaveDialog(app) {
    const modal = document.getElementById("java-compile-save-modal");
    const message = document.getElementById("java-compile-save-message");

    /** Ask how disk compilation should handle dirty Java tabs. */
    function choose(options = {}) {
      if (!modal) return Promise.resolve("cancel");
      message.textContent = options.message || "Java files have unsaved changes. Choose what to save before compiling disk content.";
      modal.style.display = "flex";
      return new Promise((resolve) => {
        const finish = (value) => {
          modal.style.display = "none";
          modal.querySelectorAll("[data-java-compile-save-choice]").forEach((button) => { button.onclick = null; });
          resolve(value);
        };
        modal.querySelectorAll("[data-java-compile-save-choice]").forEach((button) => {
          button.onclick = () => finish(button.dataset.javaCompileSaveChoice);
        });
        modal.onclick = (event) => { if (event.target === modal) finish("cancel"); };
      });
    }

    const api = { choose };
    app.registerModule?.("javaCompileSaveDialog", api);
    return api;
  }

  global.registerMarkdownViewerJavaCompileSaveDialog = registerMarkdownViewerJavaCompileSaveDialog;
})(typeof window !== "undefined" ? window : globalThis);

