// Java Source action orchestrating the local Externalize Strings wizard.
(function(global) {
  "use strict";

  /** Register Externalize Strings for writable desktop Java files. */
  function registerMarkdownViewerJavaExternalizeStringsActions(app, deps = {}) {
    const sourceActions = deps.sourceActions || app.modules?.sourceActions;
    const filesystem = deps.filesystem || {};
    const getActiveCodeMirrorEditor = deps.getActiveCodeMirrorEditor || function() { return null; };
    const getActiveEditorValue = deps.getActiveEditorValue || function() { return ""; };
    const getActiveEditorPath = deps.getActiveEditorPath || function() { return ""; };
    const isActiveJavaFile = deps.isActiveJavaFile || function() { return false; };
    const isDesktopRuntime = deps.isDesktopRuntime || function() { return false; };
    const updateEditorLineNumbers = deps.updateEditorLineNumbers || function() {};
    const updateEditorSelectionHighlights = deps.updateEditorSelectionHighlights || function() {};
    const updateStatusLine = deps.updateStatusLine || function() {};
    const alertUser = deps.alertUser || function(message) { window.alert?.(message); };
    const analysis = deps.analysis || window.createMarkdownViewerJavaStringLiteralAnalysis?.();
    const generator = deps.generator || window.createMarkdownViewerJavaMessageBundleGenerator?.();
    const dialog = deps.dialog || window.createMarkdownViewerExternalizeStringsDialog?.();
    const removeWorkspaceFile = filesystem.remove || filesystem.removeFile;
    const writer = deps.writer || window.createMarkdownViewerExternalizationFileWriter?.({
      filesystem,
      suppressFolderWatcher: deps.suppressFolderWatcher,
      reloadFolderTree: deps.reloadFolderTree
    });

    function canExternalizeStrings() {
      return !!(
        isActiveJavaFile()
        && isDesktopRuntime()
        && getActiveEditorPath()
        && getActiveCodeMirrorEditor()?.replaceRange
        && filesystem.readFile
        && filesystem.writeFile
        && filesystem.createDirectory
        && removeWorkspaceFile
        && analysis?.analyze
        && generator?.createPlan
        && dialog?.choose
        && dialog?.preview
        && writer?.apply
      );
    }

    async function readOptionalFile(path) {
      try {
        const content = await filesystem.readFile(path);
        return { exists: true, content: String(content || "") };
      } catch (_) {
        return { exists: false, content: "" };
      }
    }

    function getFileName(path) {
      return String(path || "").replace(/\\/g, "/").split("/").pop() || "Java source";
    }

    async function externalizeStrings() {
      if (!canExternalizeStrings()) return { applied: false, reason: "unavailable" };
      const editor = getActiveCodeMirrorEditor();
      const originalSource = String(getActiveEditorValue() || "");
      const activePath = getActiveEditorPath();
      const discovered = analysis.analyze(originalSource);
      if (!discovered.length) {
        alertUser("No non-externalized Java string literals were found in this file.");
        return { applied: false, reason: "no-candidates" };
      }

      let configuration = analysis.createDefaultConfiguration(originalSource, activePath);
      let defaultPaths = generator.resolvePaths(configuration);
      let defaultProperties = await readOptionalFile(defaultPaths.propertiesPath);
      let literals = generator.assignDefaultKeys(discovered, configuration.keyPrefix, defaultProperties.content);
      const fileName = getFileName(activePath);

      while (true) {
        const choice = await dialog.choose({ fileName, sourceContent: originalSource, literals, configuration });
        if (!choice) return { applied: false, reason: "cancelled" };
        literals = choice.literals;
        configuration = choice.configuration;
        const paths = generator.resolvePaths(configuration);
        const [accessorFile, propertiesFile] = await Promise.all([
          readOptionalFile(paths.accessorPath),
          readOptionalFile(paths.propertiesPath)
        ]);
        let plan;
        try {
          plan = generator.createPlan(originalSource, literals, configuration, {
            accessorContent: accessorFile.content,
            accessorExists: accessorFile.exists,
            propertiesContent: propertiesFile.content,
            propertiesExists: propertiesFile.exists
          });
        } catch (error) {
          alertUser(error.message || "Unable to prepare string externalization.");
          continue;
        }
        if (!plan.selectedCount && !plan.ignoredCount) {
          alertUser("Choose at least one string to externalize or ignore.");
          continue;
        }
        const previewResult = await dialog.preview(plan, fileName);
        if (previewResult === "back") continue;
        if (previewResult !== "finish") return { applied: false, reason: "cancelled" };
        if (String(getActiveEditorValue() || "") !== originalSource) {
          alertUser("The Java file changed while the Externalize Strings wizard was open. Run the action again.");
          return { applied: false, reason: "source-changed" };
        }
        try {
          const result = await writer.apply(plan, (nextSource) =>
            editor.replaceRange(0, originalSource.length, nextSource)
          );
          updateEditorLineNumbers();
          updateEditorSelectionHighlights();
          updateStatusLine();
          return { applied: true, stringCount: plan.selectedCount, ignoredCount: plan.ignoredCount, fileCount: result.fileCount };
        } catch (error) {
          console.error("Failed to externalize Java strings:", error);
          alertUser(error.message || "Unable to externalize strings.");
          return { applied: false, reason: "apply-failed" };
        }
      }
    }

    sourceActions?.registerProvider?.({
      id: "java-externalize-strings-actions",
      getAvailableActions() {
        return canExternalizeStrings() ? [{
          id: "externalize-strings",
          label: "Externalize Strings...",
          shortcut: "",
          icon: "bi-translate",
          run: externalizeStrings
        }] : [];
      }
    });

    const api = { canExternalizeStrings, externalizeStrings };
    app.registerModule?.("javaExternalizeStringsActions", api);
    return api;
  }

  global.registerMarkdownViewerJavaExternalizeStringsActions = registerMarkdownViewerJavaExternalizeStringsActions;
})(window);
