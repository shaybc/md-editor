(function (window, document) {
  "use strict";

  function isPrimaryModifier(event) {
    return !!(event.ctrlKey || event.metaKey);
  }

  function registerKeyboardShortcuts(app, deps) {
    function handleDocumentKeydown(event) {
      var key = String(event.key || "");
      var lowerKey = key.toLowerCase();

      if (isPrimaryModifier(event) && event.shiftKey && lowerKey === "s") {
        event.preventDefault();
        if (deps.getCurrentViewMode() === "split") {
          deps.toggleSyncScrolling();
        }
        return;
      }

      if (isPrimaryModifier(event) && lowerKey === "s") {
        event.preventDefault();
        deps.saveCurrentFileIfChanged();
        return;
      }

      if (isPrimaryModifier(event) && lowerKey === "f") {
        var activeFindEl = document.activeElement;
        var isFindTextControl = activeFindEl && (
          activeFindEl.tagName === "TEXTAREA"
          || activeFindEl.tagName === "INPUT"
          || activeFindEl.isContentEditable
        );
        if (!isFindTextControl && deps.getActiveTabType && deps.getActiveTabType() === "graph" && deps.openGraphFindDialog) {
          event.preventDefault();
          deps.openGraphFindDialog();
          return;
        }
      }

      if (isPrimaryModifier(event) && lowerKey === "c") {
        var activeEl = document.activeElement;
        var isTextControl = activeEl && (activeEl.tagName === "TEXTAREA" || activeEl.tagName === "INPUT");
        var hasSelection = window.getSelection && window.getSelection().toString().trim().length > 0;
        var editorHasSelection = deps.markdownEditor.selectionStart !== deps.markdownEditor.selectionEnd;

        if (!isTextControl && !hasSelection && !editorHasSelection) {
          event.preventDefault();
          deps.copyMarkdownButton.click();
        }
      }

      if (isPrimaryModifier(event) && lowerKey === "t") {
        event.preventDefault();
        deps.newTab();
        return;
      }

      if (isPrimaryModifier(event) && lowerKey === "w") {
        event.preventDefault();
        deps.closeTab(deps.getActiveTabId());
        return;
      }

      if (key === "Escape") {
        deps.closeMermaidModal();
        deps.closeGraphComparisonDetailsModal();
        deps.hideGraphStaleModal();
      }
    }

    document.addEventListener("keydown", handleDocumentKeydown);

    var api = {
      handleDocumentKeydown: handleDocumentKeydown,
    };

    app.registerModule("keyboardShortcuts", api);
    return api;
  }

  window.registerMarkdownViewerKeyboardShortcuts = registerKeyboardShortcuts;
})(window, document);
