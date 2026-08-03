// Java Source action for generating constructors that delegate to a superclass.
(function(global) {
  "use strict";

  /** Register Generate Constructors from Superclass without requiring JDT. */
  function registerMarkdownViewerJavaSuperclassConstructorActions(app, deps = {}) {
    const sourceActions = deps.sourceActions || app.modules?.sourceActions;
    const getActiveCodeMirrorEditor = deps.getActiveCodeMirrorEditor || function() { return null; };
    const getActiveEditorValue = deps.getActiveEditorValue || function() { return ""; };
    const getActiveEditorPath = deps.getActiveEditorPath || function() { return ""; };
    const isActiveJavaFile = deps.isActiveJavaFile || function() { return false; };
    const updateEditorLineNumbers = deps.updateEditorLineNumbers || function() {};
    const updateEditorSelectionHighlights = deps.updateEditorSelectionHighlights || function() {};
    const updateStatusLine = deps.updateStatusLine || function() {};
    const alertUser = deps.alertUser || function(message) { window.alert?.(message); };
    const getOutlineLanguage = function() { return app.modules?.javaOutlineLanguage || null; };
    const dialog = deps.dialog || window.createMarkdownViewerSuperclassConstructorDialog?.();
    const resolver = deps.resolver || window.createMarkdownViewerJavaSuperclassResolver?.({
      getOutlineLanguage,
      readFile: deps.readFile
    });
    const generator = deps.generator || window.createMarkdownViewerJavaSuperclassConstructorGenerator?.({ getOutlineLanguage });

    function canGenerateFromSuperclass() {
      return !!(
        isActiveJavaFile()
        && getActiveCodeMirrorEditor()?.replaceRange
        && resolver?.resolve
        && generator?.analyze
        && generator?.createInsertion
        && dialog?.open
      );
    }

    async function generateFromSuperclass() {
      if (!canGenerateFromSuperclass()) return { applied: false, reason: "not-java" };
      const editor = getActiveCodeMirrorEditor();
      const source = String(getActiveEditorValue() || "");
      const cursorOffset = Number(editor.getView?.()?.state?.selection?.main?.head) || 0;
      const resolution = await resolver.resolve(source, cursorOffset, getActiveEditorPath());
      if (resolution?.reason === "no-class") {
        alertUser("Place the cursor inside a Java class to generate constructors from its superclass.");
        return { applied: false, reason: "no-class" };
      }
      if (resolution?.reason === "no-superclass") {
        alertUser("This class does not declare a superclass.");
        return { applied: false, reason: "no-superclass" };
      }
      if (resolution?.reason !== "resolved") {
        alertUser("Unable to find the source for superclass " + (resolution?.className || "") + ".");
        return { applied: false, reason: "superclass-not-found" };
      }
      const analysis = generator.analyze(source, resolution.owner, resolution);
      if (!analysis?.constructors?.length) {
        alertUser("No accessible superclass constructors remain to be implemented.");
        return { applied: false, reason: "no-candidates" };
      }
      const selection = await dialog.open(analysis);
      if (!selection) return { applied: false, reason: "cancelled" };
      if (!selection.constructors?.length) return { applied: false, reason: "no-selection" };
      const insertion = generator.createInsertion(source, analysis, selection.constructors, selection);
      if (!insertion || !editor.replaceRange(insertion.offset, insertion.offset, insertion.text)) {
        alertUser("Unable to insert the generated superclass constructors.");
        return { applied: false, reason: "apply-failed" };
      }
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
      return { applied: true, constructorCount: selection.constructors.length };
    }

    sourceActions?.registerProvider?.({
      id: "java-superclass-constructor-actions",
      getAvailableActions() {
        return canGenerateFromSuperclass() ? [{
          id: "generate-constructors-from-superclass",
          label: "Generate Constructors from Superclass...",
          shortcut: "",
          icon: "bi-diagram-2",
          run: generateFromSuperclass
        }] : [];
      }
    });

    const api = { canGenerateFromSuperclass, generateFromSuperclass };
    app.registerModule?.("javaSuperclassConstructorActions", api);
    return api;
  }

  global.registerMarkdownViewerJavaSuperclassConstructorActions = registerMarkdownViewerJavaSuperclassConstructorActions;
})(window);
