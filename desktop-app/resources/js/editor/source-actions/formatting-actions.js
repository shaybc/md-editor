// Formatter actions exposed through the editor Source submenu.
(function(window) {
  "use strict";

  /**
   * Register the reusable Format File action for CodeMirror-backed documents.
   * @param {object} app Application module registry.
   * @param {object} deps Active-editor commands and editor refresh callbacks.
   * @returns {object|null} Registered Source-action provider.
   */
  function registerMarkdownViewerFormattingSourceActions(app, deps = {}) {
    const sourceActions = deps.sourceActions || app.modules?.sourceActions;
    const activeEditorCommands = deps.activeEditorCommands;
    if (!sourceActions?.registerProvider || !activeEditorCommands) return null;

    function isJavaActiveEditor() {
      const language = activeEditorCommands.getActiveEditor?.()?.getActiveLanguage?.() || null;
      return language?.id === "java" || language?.codeMirrorLanguage === "java";
    }

    async function runFormatFile() {
      const didRun = await activeEditorCommands.formatActiveDocument?.();
      if (didRun === true) {
        deps.updateEditorLineNumbers?.();
        deps.updateEditorSelectionHighlights?.();
        deps.updateStatusLine?.();
      }
      return didRun === true;
    }

    return sourceActions.registerProvider({
      id: "formatting-source-actions",
      getAvailableActions() {
        if (isJavaActiveEditor()) return [];
        if (activeEditorCommands.canFormatActiveDocument?.() !== true) return [];
        return [{
          id: "format-file",
          label: "Format File",
          shortcut: "",
          icon: "bi-magic",
          run: runFormatFile
        }];
      }
    });
  }

  window.registerMarkdownViewerFormattingSourceActions = registerMarkdownViewerFormattingSourceActions;
})(window);
