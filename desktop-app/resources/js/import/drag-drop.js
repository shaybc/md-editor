(function(window, document) {
  "use strict";

  function registerMarkdownViewerDragDrop(app, deps) {
    const dropzone = deps.dropzone;

    function preventDefaults(event) {
      event.preventDefault();
      event.stopPropagation();
    }

    function highlight() {
      dropzone.classList.add("active");
    }

    function unhighlight() {
      dropzone.classList.remove("active");
    }

    function bindDropzone() {
      const dropEvents = ["dragenter", "dragover", "dragleave", "drop"];

      dropEvents.forEach((eventName) => {
        dropzone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
      });

      ["dragenter", "dragover"].forEach((eventName) => {
        dropzone.addEventListener(eventName, highlight, false);
      });

      ["dragleave", "drop"].forEach((eventName) => {
        dropzone.addEventListener(eventName, unhighlight, false);
      });

      dropzone.addEventListener("drop", deps.handleDrop, false);
    }

    const api = {
      bindDropzone,
      highlight,
      preventDefaults,
      unhighlight
    };

    app.registerModule("dragDrop", api);
    return api;
  }

  window.registerMarkdownViewerDragDrop = registerMarkdownViewerDragDrop;
})(window, document);
