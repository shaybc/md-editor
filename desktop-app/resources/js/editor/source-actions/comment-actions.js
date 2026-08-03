// Language-aware comment commands exposed through the editor Source submenu.
(function(window) {
  "use strict";

  /**
   * Register reusable comment actions for every CodeMirror language that declares comment tokens.
   * @param {object} app Application module registry.
   * @param {object} deps Active-editor commands and editor refresh callbacks.
   * @returns {object|null} Registered Source-action provider.
   */
  function registerMarkdownViewerCommentSourceActions(app, deps = {}) {
    const sourceActions = deps.sourceActions || app.modules?.sourceActions;
    const activeEditorCommands = deps.activeEditorCommands;
    if (!sourceActions?.registerProvider || !activeEditorCommands) return null;

    function refreshEditorStatus() {
      deps.updateEditorLineNumbers?.();
      deps.updateEditorSelectionHighlights?.();
      deps.updateStatusLine?.();
    }

    function runEditorCommand(commandName) {
      const didRun = activeEditorCommands[commandName]?.() === true;
      if (didRun) refreshEditorStatus();
      return didRun;
    }

    const provider = {
      id: "comment-source-actions",
      getAvailableActions() {
        const capabilities = activeEditorCommands.getCommentCapabilities?.() || {};
        const actions = [];
        if (capabilities.canToggleComment) {
          actions.push({
            id: "toggle-comment",
            label: "Toggle Comment",
            shortcut: "Ctrl+/",
            icon: "bi-chat-square-text",
            run() { return runEditorCommand("toggleComment"); }
          });
        }
        if (capabilities.canToggleBlockComment) {
          actions.push({
            id: "toggle-block-comment",
            label: "Toggle Block Comment",
            shortcut: "Ctrl+Shift+/",
            icon: "bi-chat-square-dots",
            run() { return runEditorCommand("toggleBlockComment"); }
          });
        }
        return actions;
      }
    };

    return sourceActions.registerProvider(provider);
  }

  window.registerMarkdownViewerCommentSourceActions = registerMarkdownViewerCommentSourceActions;
})(window);
