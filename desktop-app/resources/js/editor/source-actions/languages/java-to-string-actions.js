// Java Source action for local toString() generation.
(function(global) {
  "use strict";

  /**
   * Register Generate toString() without requiring the Java language server.
   * @param {object} app Application module registry.
   * @param {object} deps Editor and UI dependencies.
   * @returns {{ canGenerateToString: Function, generateToString: Function }} Action API.
   */
  function registerMarkdownViewerJavaToStringActions(app, deps = {}) {
    const sourceActions = deps.sourceActions || app.modules?.sourceActions;
    const getActiveCodeMirrorEditor = deps.getActiveCodeMirrorEditor || function() { return null; };
    const getActiveEditorValue = deps.getActiveEditorValue || function() { return ""; };
    const isActiveJavaFile = deps.isActiveJavaFile || function() { return false; };
    const updateEditorLineNumbers = deps.updateEditorLineNumbers || function() {};
    const updateEditorSelectionHighlights = deps.updateEditorSelectionHighlights || function() {};
    const updateStatusLine = deps.updateStatusLine || function() {};
    const alertUser = deps.alertUser || function(message) { window.alert?.(message); };
    const dialog = deps.dialog || window.createMarkdownViewerToStringDialog?.();
    const generator = deps.generator || window.createMarkdownViewerJavaToStringGenerator?.({
      getOutlineLanguage: function() { return app.modules?.javaOutlineLanguage || null; }
    });

    function canGenerateToString() {
      return !!(
        isActiveJavaFile()
        && getActiveCodeMirrorEditor()?.replaceRange
        && generator?.analyze
        && generator?.createInsertion
        && dialog?.open
      );
    }

    async function generateToString() {
      if (!canGenerateToString()) return { applied: false, reason: "not-java" };
      const editor = getActiveCodeMirrorEditor();
      const source = String(getActiveEditorValue() || "");
      const cursorOffset = Number(editor.getView?.()?.state?.selection?.main?.head) || 0;
      const analysis = generator.analyze(source, cursorOffset);
      if (!analysis?.owner) {
        alertUser("Place the cursor inside a Java class to generate toString().");
        return { applied: false, reason: "no-class" };
      }
      if (analysis.hasToString) {
        alertUser("This class already defines toString().");
        return { applied: false, reason: "already-exists" };
      }
      if (!analysis.fields.length && !analysis.methods.length && !analysis.inheritedMethods?.length) {
        alertUser("This class has no eligible fields or methods for toString().");
        return { applied: false, reason: "no-candidates" };
      }
      const selection = await dialog.open(analysis);
      if (!selection) return { applied: false, reason: "cancelled" };
      if (!selection.members?.length) return { applied: false, reason: "no-selection" };
      const insertion = generator.createInsertion(source, analysis, selection.members, selection);
      if (!insertion || !editor.replaceRange(insertion.offset, insertion.offset, insertion.text)) {
        alertUser("Unable to insert the generated toString() method.");
        return { applied: false, reason: "apply-failed" };
      }
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
      return { applied: true, memberCount: selection.members.length };
    }

    sourceActions?.registerProvider?.({
      id: "java-to-string-actions",
      getAvailableActions() {
        return canGenerateToString() ? [{
          id: "generate-to-string",
          label: "Generate toString()...",
          shortcut: "",
          icon: "bi-card-text",
          run: generateToString
        }] : [];
      }
    });

    const api = { canGenerateToString, generateToString };
    app.registerModule?.("javaToStringActions", api);
    return api;
  }

  global.registerMarkdownViewerJavaToStringActions = registerMarkdownViewerJavaToStringActions;
})(window);
