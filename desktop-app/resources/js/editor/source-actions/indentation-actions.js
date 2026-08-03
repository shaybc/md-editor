// Language-aware indentation correction exposed through the editor Source submenu.
(function(window) {
  "use strict";

  /**
   * Register the reusable Correct Indentation action for the active CodeMirror editor.
   * @param {object} app Application module registry.
   * @param {object} deps Active-editor commands and editor refresh callbacks.
   * @returns {object|null} Registered Source-action provider.
   */
  function registerMarkdownViewerIndentationSourceActions(app, deps = {}) {
    const sourceActions = deps.sourceActions || app.modules?.sourceActions;
    const activeEditorCommands = deps.activeEditorCommands;
    if (!sourceActions?.registerProvider || !activeEditorCommands) return null;

    function runCorrectIndentation() {
      const didRun = activeEditorCommands.correctIndentation?.() === true;
      if (didRun) {
        deps.updateEditorLineNumbers?.();
        deps.updateEditorSelectionHighlights?.();
        deps.updateStatusLine?.();
      }
      return didRun;
    }

    return sourceActions.registerProvider({
      id: "indentation-source-actions",
      getAvailableActions() {
        return [{
          id: "correct-indentation",
          label: "Correct Indentation",
          shortcut: "Ctrl+I",
          icon: "bi-text-indent-left",
          run: runCorrectIndentation
        }];
      }
    });
  }

  window.registerMarkdownViewerIndentationSourceActions = registerMarkdownViewerIndentationSourceActions;
})(window);
