// Java Source action for local constructor generation using fields.
(function(global) {
  "use strict";

  /** Register Generate Constructor using Fields without requiring JDT. */
  function registerMarkdownViewerJavaConstructorActions(app, deps = {}) {
    const sourceActions = deps.sourceActions || app.modules?.sourceActions;
    const getActiveCodeMirrorEditor = deps.getActiveCodeMirrorEditor || function() { return null; };
    const getActiveEditorValue = deps.getActiveEditorValue || function() { return ""; };
    const isActiveJavaFile = deps.isActiveJavaFile || function() { return false; };
    const updateEditorLineNumbers = deps.updateEditorLineNumbers || function() {};
    const updateEditorSelectionHighlights = deps.updateEditorSelectionHighlights || function() {};
    const updateStatusLine = deps.updateStatusLine || function() {};
    const alertUser = deps.alertUser || function(message) { window.alert?.(message); };
    const dialog = deps.dialog || window.createMarkdownViewerConstructorDialog?.();
    const generator = deps.generator || window.createMarkdownViewerJavaConstructorGenerator?.({
      getOutlineLanguage: function() { return app.modules?.javaOutlineLanguage || null; }
    });

    function canGenerateConstructor() {
      return !!(
        isActiveJavaFile()
        && getActiveCodeMirrorEditor()?.replaceRange
        && generator?.analyze
        && generator?.createInsertion
        && dialog?.open
      );
    }

    async function generateConstructor() {
      if (!canGenerateConstructor()) return { applied: false, reason: "not-java" };
      const editor = getActiveCodeMirrorEditor();
      const source = String(getActiveEditorValue() || "");
      const cursorOffset = Number(editor.getView?.()?.state?.selection?.main?.head) || 0;
      const analysis = generator.analyze(source, cursorOffset);
      if (!analysis?.owner) {
        alertUser("Place the cursor inside a Java class to generate a constructor.");
        return { applied: false, reason: "no-class" };
      }
      if (!analysis.fields.length) {
        alertUser("This class has no instance fields available for constructor generation.");
        return { applied: false, reason: "no-candidates" };
      }
      const selection = await dialog.open(analysis);
      if (!selection) return { applied: false, reason: "cancelled" };
      if (!selection.fields?.length) return { applied: false, reason: "no-selection" };
      if (generator.hasMatchingConstructor(analysis, selection.fields)) {
        alertUser("A constructor with the selected field types already exists.");
        return { applied: false, reason: "already-exists" };
      }
      const insertion = generator.createInsertion(source, analysis, selection.fields, selection);
      if (!insertion || !editor.replaceRange(insertion.offset, insertion.offset, insertion.text)) {
        alertUser("Unable to insert the generated constructor.");
        return { applied: false, reason: "apply-failed" };
      }
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
      return { applied: true, fieldCount: selection.fields.length };
    }

    sourceActions?.registerProvider?.({
      id: "java-constructor-actions",
      getAvailableActions() {
        return canGenerateConstructor() ? [{
          id: "generate-constructor-using-fields",
          label: "Generate Constructor using Fields...",
          shortcut: "",
          icon: "bi-box-arrow-in-right",
          run: generateConstructor
        }] : [];
      }
    });

    const api = { canGenerateConstructor, generateConstructor };
    app.registerModule?.("javaConstructorActions", api);
    return api;
  }

  global.registerMarkdownViewerJavaConstructorActions = registerMarkdownViewerJavaConstructorActions;
})(window);
