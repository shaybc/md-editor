// Java Source action for local equals() and hashCode() generation.
(function(global) {
  "use strict";

  /** Register Generate hashCode() and equals() without requiring JDT. */
  function registerMarkdownViewerJavaEqualsHashCodeActions(app, deps = {}) {
    const sourceActions = deps.sourceActions || app.modules?.sourceActions;
    const getActiveCodeMirrorEditor = deps.getActiveCodeMirrorEditor || function() { return null; };
    const getActiveEditorValue = deps.getActiveEditorValue || function() { return ""; };
    const isActiveJavaFile = deps.isActiveJavaFile || function() { return false; };
    const updateEditorLineNumbers = deps.updateEditorLineNumbers || function() {};
    const updateEditorSelectionHighlights = deps.updateEditorSelectionHighlights || function() {};
    const updateStatusLine = deps.updateStatusLine || function() {};
    const alertUser = deps.alertUser || function(message) { window.alert?.(message); };
    const dialog = deps.dialog || window.createMarkdownViewerEqualsHashCodeDialog?.();
    const generator = deps.generator || window.createMarkdownViewerJavaEqualsHashCodeGenerator?.({
      getOutlineLanguage: function() { return app.modules?.javaOutlineLanguage || null; }
    });

    function canGenerateEqualsHashCode() {
      return !!(
        isActiveJavaFile()
        && getActiveCodeMirrorEditor()?.replaceRange
        && generator?.analyze
        && generator?.createInsertion
        && dialog?.open
      );
    }

    async function generateEqualsHashCode() {
      if (!canGenerateEqualsHashCode()) return { applied: false, reason: "not-java" };
      const editor = getActiveCodeMirrorEditor();
      const source = String(getActiveEditorValue() || "");
      const cursorOffset = Number(editor.getView?.()?.state?.selection?.main?.head) || 0;
      const analysis = generator.analyze(source, cursorOffset);
      if (!analysis?.owner) {
        alertUser("Place the cursor inside a Java class to generate hashCode() and equals().");
        return { applied: false, reason: "no-class" };
      }
      if (analysis.hasHashCode || analysis.hasEquals) {
        alertUser("This class already defines hashCode() or equals().");
        return { applied: false, reason: "already-exists" };
      }
      if (!analysis.fields.length) {
        alertUser("This class has no instance fields available for equality generation.");
        return { applied: false, reason: "no-candidates" };
      }
      const selection = await dialog.open(analysis);
      if (!selection) return { applied: false, reason: "cancelled" };
      if (!selection.fields?.length) return { applied: false, reason: "no-selection" };
      const insertion = generator.createInsertion(source, analysis, selection.fields, selection);
      if (!insertion || !editor.replaceRange(insertion.offset, insertion.offset, insertion.text)) {
        alertUser("Unable to insert the generated hashCode() and equals() methods.");
        return { applied: false, reason: "apply-failed" };
      }
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
      return { applied: true, fieldCount: selection.fields.length };
    }

    sourceActions?.registerProvider?.({
      id: "java-equals-hashcode-actions",
      getAvailableActions() {
        return canGenerateEqualsHashCode() ? [{
          id: "generate-equals-hashcode",
          label: "Generate hashCode() and equals()...",
          shortcut: "",
          icon: "bi-fingerprint",
          run: generateEqualsHashCode
        }] : [];
      }
    });

    const api = { canGenerateEqualsHashCode, generateEqualsHashCode };
    app.registerModule?.("javaEqualsHashCodeActions", api);
    return api;
  }

  global.registerMarkdownViewerJavaEqualsHashCodeActions = registerMarkdownViewerJavaEqualsHashCodeActions;
})(window);
