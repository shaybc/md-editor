(function (window, document) {
  "use strict";

  function registerClipboard(app, deps) {
    function showCopiedMessage() {
      var originalText = deps.copyMarkdownButton.innerHTML;
      deps.copyMarkdownButton.innerHTML = '<i class="bi bi-check-lg"></i> Copied!';

      setTimeout(function () {
        deps.copyMarkdownButton.innerHTML = originalText;
      }, 2000);
    }

    async function copyToClipboard(text) {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          showCopiedMessage();
          return;
        }

        var textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        var successful = document.execCommand("copy");
        document.body.removeChild(textArea);

        if (!successful) {
          throw new Error("Copy command was unsuccessful");
        }

        showCopiedMessage();
      } catch (error) {
        console.error("Copy failed:", error);
        alert("Failed to copy HTML: " + error.message);
      }
    }

    function bindCopyMarkdownButton() {
      deps.copyMarkdownButton.addEventListener("click", function () {
        try {
          copyToClipboard(deps.getMarkdownText());
        } catch (error) {
          console.error("Copy failed:", error);
          alert("Failed to copy Markdown: " + error.message);
        }
      });
    }

    var api = {
      bindCopyMarkdownButton: bindCopyMarkdownButton,
      copyToClipboard: copyToClipboard,
      showCopiedMessage: showCopiedMessage,
    };

    app.services.clipboard = api;
    app.registerModule("clipboard", api);

    return api;
  }

  window.registerMarkdownViewerClipboard = registerClipboard;
})(window, document);
