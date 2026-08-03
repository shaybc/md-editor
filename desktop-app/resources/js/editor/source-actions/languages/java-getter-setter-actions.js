// Java Source action orchestrating local getter/setter analysis and generation.
(function(window) {
  "use strict";

  /**
   * Register local Java getter/setter generation with the Source-action registry.
   * @param {object} app Application module registry.
   * @param {object} deps Editor, generator, dialog, and UI dependencies.
   * @returns {object} Public getter/setter action API.
   */
  function registerMarkdownViewerJavaGetterSetterActions(app, deps = {}) {
    const sourceActions = deps.sourceActions || app.modules?.sourceActions;
    const javaSourceActions = deps.javaSourceActions || app.modules?.javaSourceActions;
    const getActiveCodeMirrorEditor = deps.getActiveCodeMirrorEditor || function() { return null; };
    const isActiveJavaFile = deps.isActiveJavaFile
      || function() { return javaSourceActions?.canOrganizeImportsForActiveEditor?.() === true; };
    const getActiveEditorValue = deps.getActiveEditorValue || function() { return ""; };
    const updateEditorLineNumbers = deps.updateEditorLineNumbers || function() {};
    const updateEditorSelectionHighlights = deps.updateEditorSelectionHighlights || function() {};
    const updateStatusLine = deps.updateStatusLine || function() {};
    const alertUser = deps.alertUser || function(message) { window.alert?.(message); };
    const appDebugLog = deps.appDebugLog || function() {};
    const dialog = deps.dialog || window.createMarkdownViewerGetterSetterDialog?.();
    const accessorGenerator = deps.accessorGenerator || window.createMarkdownViewerJavaAccessorGenerator?.({
      getOutlineLanguage: function() { return app.modules?.javaOutlineLanguage || null; }
    });

    function log(level, message, details) {
      try {
        appDebugLog(level, message, details);
      } catch (_error) {
        // Generation must not fail because diagnostics logging failed.
      }
    }

    function canGenerateGettersAndSetters() {
      const codeMirrorEditor = getActiveCodeMirrorEditor();
      return !!(
        isActiveJavaFile()
        && codeMirrorEditor?.replaceRange
        && accessorGenerator?.analyze
        && accessorGenerator?.createInsertion
        && dialog?.open
      );
    }

    async function generateGettersAndSetters() {
      if (!canGenerateGettersAndSetters()) {
        alertUser("Generate Getters and Setters is available only for local Java files.");
        return { applied: false, reason: "not-java" };
      }
      const codeMirrorEditor = getActiveCodeMirrorEditor();
      const source = String(getActiveEditorValue() || "");
      const selection = codeMirrorEditor.getView?.()?.state?.selection?.main;
      const cursorOffset = Number(selection?.head) || 0;

      try {
        const analysis = accessorGenerator.analyze(source, cursorOffset);
        if (!analysis?.owner) {
          alertUser("Place the cursor inside a Java class to generate getters and setters.");
          return { applied: false, reason: "no-class" };
        }
        if (!analysis.fields.length) {
          alertUser("This class has no fields that need getters or setters.");
          return { applied: false, reason: "no-candidates" };
        }

        const selection = await dialog.open(analysis.fields);
        if (!selection) return { applied: false, reason: "cancelled" };
        const selectedAccessors = Array.isArray(selection) ? selection : selection.fields;
        if (!selectedAccessors.length) return { applied: false, reason: "no-selection" };
        const generationOptions = Array.isArray(selection) ? {} : {
          order: selection.order,
          generateComments: selection.generateComments === true
        };
        const insertion = accessorGenerator.createInsertion(source, analysis.owner, selectedAccessors, generationOptions);
        if (!insertion || !codeMirrorEditor.replaceRange(insertion.offset, insertion.offset, insertion.text)) {
          alertUser("Unable to insert the generated getter and setter methods.");
          return { applied: false, reason: "apply-failed" };
        }

        updateEditorLineNumbers();
        updateEditorSelectionHighlights();
        updateStatusLine();
        log("info", "[java] Generated getters and setters locally", {
          className: analysis.owner.name,
          order: generationOptions.order || "pairs",
          generateComments: generationOptions.generateComments === true,
          accessorCount: selectedAccessors.reduce((count, field) =>
            count + (field.generateGetter ? 1 : 0) + (field.generateSetter ? 1 : 0), 0)
        });
        return { applied: true, fieldCount: selectedAccessors.length };
      } catch (error) {
        const message = error?.message || "The getters and setters could not be generated.";
        log("warning", "[java] Local getter/setter generation failed", { message });
        alertUser(message);
        return { applied: false, reason: "error", error };
      }
    }

    sourceActions?.registerProvider?.({
      id: "java-getter-setter-actions",
      getAvailableActions() {
        return canGenerateGettersAndSetters() ? [{
          id: "generate-getters-setters",
          label: "Generate Getters and Setters...",
          shortcut: "",
          icon: "bi-braces",
          run: generateGettersAndSetters
        }] : [];
      }
    });

    const api = { canGenerateGettersAndSetters, generateGettersAndSetters };
    app.registerModule?.("javaGetterSetterActions", api);
    return api;
  }

  window.registerMarkdownViewerJavaGetterSetterActions = registerMarkdownViewerJavaGetterSetterActions;
})(window);
