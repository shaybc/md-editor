(function (window, document) {
  "use strict";

  var fallbackMessage = "Browsers open folders with a read-only folder picker. Files stay on this device, but saving writes a downloaded copy unless you use the desktop app.";

  function registerFolderPicker(app) {
    function supportsDesktopFolderPicker() {
      return typeof window.Neutralino !== "undefined"
        && !!window.Neutralino.os
        && typeof window.Neutralino.os.showFolderDialog === "function"
        && typeof window.Neutralino.filesystem !== "undefined";
    }

    function supportsNativeDirectoryPicker() {
      return typeof window.showDirectoryPicker === "function";
    }

    function getFolderPickerFallbackMessage() {
      return fallbackMessage;
    }

    function shouldUseNativeDirectoryPicker() {
      if (supportsDesktopFolderPicker()) return false;

      var supported = supportsNativeDirectoryPicker();
      window.markdownViewerFolderPickerMode = supported ? "native" : "folder-input";
      return supported;
    }

    function updateFolderImportHint() {
      if (typeof window.NL_VERSION !== "undefined") return;

      document.querySelectorAll("#import-from-folder").forEach(function (button) {
        button.title = supportsNativeDirectoryPicker()
          ? "Open a local folder for browsing and in-place saves."
          : getFolderPickerFallbackMessage();
        button.setAttribute("aria-label", "Open folder");
      });
    }

    var api = {
      getFolderPickerFallbackMessage: getFolderPickerFallbackMessage,
      shouldUseNativeDirectoryPicker: shouldUseNativeDirectoryPicker,
      supportsDesktopFolderPicker: supportsDesktopFolderPicker,
      supportsNativeDirectoryPicker: supportsNativeDirectoryPicker,
      updateFolderImportHint: updateFolderImportHint,
    };

    app.services.folderPicker = api;
    app.registerModule("folderPicker", api);

    return api;
  }

  window.registerMarkdownViewerFolderPicker = registerFolderPicker;
})(window, document);
