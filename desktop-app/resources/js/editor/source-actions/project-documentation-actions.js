// Java method-documentation insertion exposed through the editor Source submenu.
(function(window) {
  "use strict";

  /** Register local method-Javadoc generation for the active Java editor. */
  function registerMarkdownViewerProjectDocumentationSourceActions(app, deps = {}) {
    const sourceActions = deps.sourceActions || app.modules?.sourceActions;
    const activeEditorCommands = deps.activeEditorCommands;
    const getActiveEditorPath = deps.getActiveEditorPath || function() { return ""; };
    const getActiveEditorValue = deps.getActiveEditorValue || function() { return ""; };
    const updateEditorLineNumbers = deps.updateEditorLineNumbers || function() {};
    const updateEditorSelectionHighlights = deps.updateEditorSelectionHighlights || function() {};
    const updateStatusLine = deps.updateStatusLine || function() {};
    const alertUser = deps.alertUser || function(message) { window.alert?.(message); };
    const appDebugLog = deps.appDebugLog || function() {};
    const generator = deps.generator || window.createMarkdownViewerJavaMethodJavadoc?.();
    if (!sourceActions?.registerProvider) return null;

    function getGeneration(offset) {
      if (!/\.java$/i.test(String(getActiveEditorPath() || ""))) return { status: "not-java" };
      return generator?.createInsertion?.(getActiveEditorValue(), offset) || { status: "no-method" };
    }

    function generateMethodDocumentation(offset) {
      const generation = getGeneration(offset);
      if (generation.status === "existing") {
        alertUser("This method already has Javadoc documentation.");
        return { applied: false, reason: "existing" };
      }
      if (generation.status !== "ready") {
        alertUser("Place the cursor inside a Java method to generate Javadoc documentation.");
        return { applied: false, reason: generation.status };
      }
      if (!activeEditorCommands?.replaceActiveEditorRange?.(generation.offset, generation.offset, generation.text)) {
        alertUser("Unable to insert the generated Javadoc documentation.");
        return { applied: false, reason: "apply-failed" };
      }
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
      try {
        appDebugLog("info", "[java] Generated method Javadoc locally", { methodName: generation.methodName });
      } catch (_error) {}
      return { applied: true, methodName: generation.methodName };
    }

    const provider = sourceActions.registerProvider({
      id: "project-documentation-source-actions",
      getAvailableActions(context = {}) {
        const offset = Number(context.selection?.start) || 0;
        const generation = getGeneration(offset);
        if (generation.status !== "ready" && generation.status !== "existing") return [];
        return [{
          id: "generate-method-documentation",
          label: "Generate Documentation for Method...",
          shortcut: "",
          icon: "bi-journal-code",
          run() { return generateMethodDocumentation(offset); }
        }];
      }
    });
    const api = { generateMethodDocumentation };
    app.registerModule?.("javaMethodDocumentationActions", api);
    return provider;
  }

  window.registerMarkdownViewerProjectDocumentationSourceActions = registerMarkdownViewerProjectDocumentationSourceActions;
})(window);
