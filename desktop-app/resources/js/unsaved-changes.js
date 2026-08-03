(function (window) {
  "use strict";

  function registerUnsavedChanges(app, deps) {
    function normalizeEditorContent(content) {
      return String(content || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    }

    function tabHasUnsavedChanges(tab, currentContent) {
      if (!tab) return false;
      if (tab.isNewUnsavedFile === true) return true;

      if (tab.type === "large-file") return false;

      if (tab.type === "image-editor") return tab.imageEditorDirty === true;
      if (tab.type === "diagram-editor") return tab.diagramDirty === true;

      if (tab.type === "graph") {
        return tab.graphHasUnsavedChanges === true;
      }

      var contentToCompare = currentContent === undefined ? tab.content : currentContent;
      return normalizeEditorContent(tab.savedContent) !== normalizeEditorContent(contentToCompare);
    }

    function bindWindowExitGuards(guards) {
      function confirmDiscardUnsavedChangesBeforeExit() {
        var unsavedTabs = guards.getUnsavedTabs();
        if (!unsavedTabs.length) return true;

        var pluralSuffix = unsavedTabs.length === 1 ? "" : "s";
        return window.confirm(
          "You have unsaved changes in " + unsavedTabs.length + " open tab" + pluralSuffix + ". " +
          "Exit without saving? Your changes will be lost."
        );
      }

      window.markdownViewerHasUnsavedChanges = function () {
        return guards.getUnsavedTabs().length > 0;
      };
      window.markdownViewerConfirmDiscardUnsavedBeforeExit = confirmDiscardUnsavedChangesBeforeExit;

      return confirmDiscardUnsavedChangesBeforeExit;
    }

    var api = {
      bindWindowExitGuards: bindWindowExitGuards,
      normalizeEditorContent: normalizeEditorContent,
      tabHasUnsavedChanges: tabHasUnsavedChanges,
    };

    app.services.unsavedChanges = api;
    app.registerModule("unsavedChanges", api);

    return api;
  }

  window.registerMarkdownViewerUnsavedChanges = registerUnsavedChanges;
})(window);
