// Java Introduce Parameter Object action and semantic refactoring workflow.
(function(global) {
  "use strict";

  /**
   * Register the Eclipse-style Introduce Parameter Object refactoring.
   * @param {object} app Application module registry.
   * @param {object} deps Active editor, JDT, preview, and UI dependencies.
   * @returns {object} Introduce Parameter Object action API.
   */
  function registerMarkdownViewerJavaIntroduceParameterObjectActions(app, deps = {}) {
    const sourceActions = deps.sourceActions || app.modules?.sourceActions;
    const javaSourceActions = deps.javaSourceActions || app.modules?.javaSourceActions;
    const activeEditorCommands = deps.activeEditorCommands || app.modules?.activeEditorCommands;
    const requestClient = deps.requestClient;
    const lspServerRegistry = deps.lspServerRegistry;
    const getActiveEditorPath = deps.getActiveEditorPath || function() { return ""; };
    const getActiveEditorValue = deps.getActiveEditorValue || function() { return ""; };
    const getActiveCodeMirrorEditor = deps.getActiveCodeMirrorEditor || function() { return null; };
    const getActiveFolderPath = deps.getActiveFolderPath || function() { return ""; };
    const getWorkspaceEditPreview = deps.getWorkspaceEditPreview || function() { return app.modules?.workspaceEditPreview || null; };
    const isDesktopRuntime = deps.isDesktopRuntime || function() { return false; };
    const readUri = deps.readUri || async function() { return ""; };
    const reloadFolderTree = deps.reloadFolderTree || async function() {};
    const suppressFolderWatcher = deps.suppressFolderWatcher || function() {};
    const updateEditorLineNumbers = deps.updateEditorLineNumbers || function() {};
    const updateEditorSelectionHighlights = deps.updateEditorSelectionHighlights || function() {};
    const updateStatusLine = deps.updateStatusLine || function() {};
    const alertUser = deps.alertUser || function(message) { global.alert?.(message); };
    const appDebugLog = deps.appDebugLog || function() {};
    const dialog = deps.dialog || global.createMarkdownViewerIntroduceParameterObjectDialog?.();
    const analysisService = deps.analysisService || global.createMarkdownViewerJavaParameterObjectAnalysis?.({
      requestClient,
      readUri
    });
    const workspaceAdapter = deps.workspaceAdapter || global.createMarkdownViewerJavaIntroduceParameterObjectWorkspaceEdit?.({
      getWorkspaceEditPreview,
      getActiveEditorPath,
      toFileUri: function(path) { return lspServerRegistry?.toFileUri?.(path) || ""; }
    });
    const modelTools = global.markdownViewerJavaParameterObjectModel;

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function isInsideWorkspace(path) {
      const root = normalizePath(getActiveFolderPath()).toLowerCase();
      const candidate = normalizePath(path).toLowerCase();
      return !!root && (candidate === root || candidate.startsWith(`${root}/`));
    }

    function log(level, message, details) {
      try { appDebugLog(level, message, details); } catch (_error) {}
    }

    function currentSelection(source = getActiveEditorValue()) {
      const commandSelection = activeEditorCommands?.getActiveEditorSelection?.();
      const viewSelection = getActiveCodeMirrorEditor()?.getView?.()?.state?.selection?.main;
      const anchor = commandSelection ? Number(commandSelection.start) || 0 : Number(viewSelection?.from) || 0;
      const head = commandSelection ? Number(commandSelection.end) || anchor : Number(viewSelection?.to) || anchor;
      return {
        source: String(source || ""),
        start: Math.max(0, Math.min(anchor, head)),
        end: Math.max(0, Math.max(anchor, head))
      };
    }

    function offsetToPosition(source, offset) {
      return global.createMarkdownViewerJavaParameterObjectAnalysis._test.offsetToPosition(source, offset);
    }

    function createCodeActionParams(fileUri, selection) {
      return {
        textDocument: { uri: fileUri },
        range: {
          start: offsetToPosition(selection.source, selection.start),
          end: offsetToPosition(selection.source, selection.end)
        },
        context: { diagnostics: [] }
      };
    }

    function canIntroduceParameterObject() {
      const path = getActiveEditorPath();
      const editorContext = getActiveCodeMirrorEditor()?.getLspDocumentContext?.();
      return !!sourceActions
        && !!javaSourceActions
        && !!requestClient
        && !!dialog
        && !!analysisService
        && !!workspaceAdapter
        && !!modelTools
        && !!getWorkspaceEditPreview()
        && isDesktopRuntime()
        && /\.java$/i.test(String(path || ""))
        && isInsideWorkspace(path)
        && editorContext?.languageId === "java"
        && !!editorContext.transport;
    }

    function assertCapturedContext(activePath, source, start, end) {
      if (normalizePath(getActiveEditorPath()) !== activePath || getActiveEditorValue() !== source) {
        throw new Error("The active Java source changed while Introduce Parameter Object was open.");
      }
      const selection = currentSelection(source);
      if (selection.start !== start || selection.end !== end) {
        throw new Error("The Java selection changed while Introduce Parameter Object was open.");
      }
    }

    async function refreshAfterChange() {
      await reloadFolderTree({ skipSavedGraphPrompt: true });
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
    }

    async function introduceParameterObject(context = {}) {
      const selection = context.source !== undefined
        ? {
            source: String(context.source || ""),
            start: Math.max(0, Number(context.selection?.start) || 0),
            end: Math.max(0, Number(context.selection?.end) || Number(context.selection?.start) || 0)
          }
        : currentSelection();
      const activePath = normalizePath(getActiveEditorPath());
      try {
        if (!canIntroduceParameterObject()) {
          throw new Error("Introduce Parameter Object requires a writable Java file in the active desktop workspace and a running Java language server.");
        }
        const javaContext = javaSourceActions.getActiveJavaContext?.();
        const editor = getActiveCodeMirrorEditor();
        const documentContext = await javaSourceActions.getActiveLspDocumentContext?.(javaContext, editor);
        const fileUri = documentContext?.fileUri || lspServerRegistry?.toFileUri?.(activePath);
        if (!documentContext?.transport || !fileUri) throw new Error("The Java language server is unavailable for this file.");
        assertCapturedContext(activePath, selection.source, selection.start, selection.end);
        const codeActionParams = createCodeActionParams(fileUri, selection);
        const analysis = await analysisService.analyze({
          codeActionParams,
          fileUri,
          source: selection.source,
          transport: documentContext.transport
        });
        const initialModel = modelTools.createModel(analysis);
        const result = await dialog.open({
          analysis,
          initialModel,
          getSignature(model) {
            return modelTools.buildSignature(model, analysis);
          },
          validate(model) {
            return modelTools.validate(model, analysis);
          },
          async preparePreview(model) {
            assertCapturedContext(activePath, selection.source, selection.start, selection.end);
            return workspaceAdapter.prepare(analysis, model);
          },
          async applyPreview(preview) {
            assertCapturedContext(activePath, selection.source, selection.start, selection.end);
            suppressFolderWatcher(1500);
            return workspaceAdapter.apply(preview);
          },
          onAfterApply: refreshAfterChange,
          async onAfterUndo() {
            suppressFolderWatcher(1500);
            await refreshAfterChange();
          }
        });
        return result || { applied: false, reason: "cancelled" };
      } catch (error) {
        log("warning", "[lsp] Java Introduce Parameter Object failed", { message: error?.message || String(error) });
        alertUser(error?.message || "Introduce Parameter Object failed.");
        return { applied: false, reason: "error", error };
      }
    }

    const provider = sourceActions?.registerProvider?.({
      id: "java-introduce-parameter-object-actions",
      getAvailableActions() {
        if (!canIntroduceParameterObject()) return [];
        return [{
          id: "introduce-parameter-object",
          label: "Introduce Parameter Object...",
          shortcut: "",
          icon: "bi-boxes",
          menu: "refactor",
          run: introduceParameterObject
        }];
      }
    });

    const api = { canIntroduceParameterObject, createCodeActionParams, introduceParameterObject, provider };
    app.registerModule?.("javaIntroduceParameterObjectActions", api);
    return api;
  }

  global.registerMarkdownViewerJavaIntroduceParameterObjectActions =
    registerMarkdownViewerJavaIntroduceParameterObjectActions;
})(typeof window !== "undefined" ? window : globalThis);
