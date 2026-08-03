// Java Source action for locally overriding or implementing inherited methods.
(function(global) {
  "use strict";

  /** Register Override/Implement Methods without requiring JDT. */
  function registerMarkdownViewerJavaOverrideMethodActions(app, deps = {}) {
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
    const classAnalysis = window.createMarkdownViewerJavaClassAnalysis?.({ getOutlineLanguage });
    const dialog = deps.dialog || window.createMarkdownViewerOverrideMethodDialog?.();
    const resolver = deps.resolver || window.createMarkdownViewerJavaSuperclassResolver?.({
      getOutlineLanguage,
      classAnalysis,
      readFile: deps.readFile
    });
    const generator = deps.generator || window.createMarkdownViewerJavaOverrideMethodGenerator?.({ getOutlineLanguage, classAnalysis });

    function canOverrideMethods() {
      return !!(
        isActiveJavaFile()
        && getActiveCodeMirrorEditor()?.replaceRange
        && resolver?.findType
        && resolver?.getDirectTypeReferences
        && resolver?.resolveType
        && generator?.analyze
        && generator?.createInsertion
        && dialog?.open
      );
    }

    async function resolveTypeHierarchy(source, owner, activePath, seen = new Set(), inherited = {}) {
      const resolved = [];
      for (const reference of resolver.getDirectTypeReferences(source, owner)) {
        const referenceKey = String(reference.reference || "").toLowerCase();
        if (!referenceKey || seen.has(referenceKey)) continue;
        seen.add(referenceKey);
        const resolution = await resolver.resolveType(source, activePath, reference.reference);
        if (resolution?.reason !== "resolved") continue;
        const relation = inherited.relation || reference.relation;
        const invocationType = inherited.invocationType || (relation === "interface" ? resolution.typeName : "");
        resolved.push({ ...resolution, relation, invocationType });
        const resolvedOwner = resolver.findType(resolution.source, resolution.typeName);
        if (resolvedOwner) {
          resolved.push(...await resolveTypeHierarchy(
            resolution.source, resolvedOwner, resolution.path, seen, { relation, invocationType }
          ));
        }
      }
      return resolved;
    }

    async function overrideMethods() {
      if (!canOverrideMethods()) return { applied: false, reason: "not-java" };
      const editor = getActiveCodeMirrorEditor();
      const source = String(getActiveEditorValue() || "");
      const cursorOffset = Number(editor.getView?.()?.state?.selection?.main?.head) || 0;
      const owner = classAnalysis?.findActiveClass(source, cursorOffset);
      if (!owner) {
        alertUser("Place the cursor inside a Java class to override or implement methods.");
        return { applied: false, reason: "no-class" };
      }
      const resolvedTypes = await resolveTypeHierarchy(source, owner, getActiveEditorPath());
      const analysis = generator.analyze(source, owner, resolvedTypes);
      if (!analysis?.methods?.length) {
        alertUser("No inherited methods remain available to override or implement.");
        return { applied: false, reason: "no-candidates" };
      }
      const selection = await dialog.open(analysis);
      if (!selection) return { applied: false, reason: "cancelled" };
      if (!selection.methods?.length) return { applied: false, reason: "no-selection" };
      const insertion = generator.createInsertion(source, analysis, selection.methods, selection);
      if (!insertion || !editor.replaceRange(insertion.offset, insertion.offset, insertion.text)) {
        alertUser("Unable to insert the selected method stubs.");
        return { applied: false, reason: "apply-failed" };
      }
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
      return { applied: true, methodCount: selection.methods.length };
    }

    sourceActions?.registerProvider?.({
      id: "java-override-method-actions",
      getAvailableActions() {
        return canOverrideMethods() ? [{
          id: "override-implement-methods",
          label: "Override/Implement Methods...",
          shortcut: "",
          icon: "bi-arrow-return-right",
          run: overrideMethods
        }] : [];
      }
    });

    const api = { canOverrideMethods, overrideMethods };
    app.registerModule?.("javaOverrideMethodActions", api);
    return api;
  }

  global.registerMarkdownViewerJavaOverrideMethodActions = registerMarkdownViewerJavaOverrideMethodActions;
})(window);
