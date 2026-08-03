// Java Extract Method action, shortcut, and JDT LS workflow orchestration.
(function(global) {
  "use strict";

  /**
   * Register the Eclipse-style Extract Method refactoring action.
   * @param {object} app Application module registry.
   * @param {object} deps Active editor, JDT, preview, and UI dependencies.
   * @returns {object} Extract Method action API.
   */
  function registerMarkdownViewerJavaExtractMethodActions(app, deps = {}) {
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
    const updateEditorLineNumbers = deps.updateEditorLineNumbers || function() {};
    const updateEditorSelectionHighlights = deps.updateEditorSelectionHighlights || function() {};
    const updateStatusLine = deps.updateStatusLine || function() {};
    const alertUser = deps.alertUser || function(message) { global.alert?.(message); };
    const appDebugLog = deps.appDebugLog || function() {};
    const document = deps.document || global.document;
    const dialog = deps.dialog || global.createMarkdownViewerExtractMethodDialog?.();
    const workspaceAdapter = deps.workspaceAdapter || global.createMarkdownViewerJavaExtractMethodWorkspaceEdit?.({
      getWorkspaceEditPreview,
      getActiveEditorPath,
      fromFileUri: function(uri) { return lspServerRegistry?.fromFileUri?.(uri) || ""; }
    });

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

    function normalizeSelection(context = {}) {
      const source = String(context.source ?? getActiveEditorValue());
      const start = Math.max(0, Math.min(source.length, Number(context.selection?.start) || 0));
      const end = Math.max(start, Math.min(source.length, Number(context.selection?.end) || start));
      return { source, start, end };
    }

    function getCurrentSelectionContext() {
      const source = getActiveEditorValue();
      const commandSelection = activeEditorCommands?.getActiveEditorSelection?.();
      const viewSelection = getActiveCodeMirrorEditor()?.getView?.()?.state?.selection?.main;
      const start = commandSelection
        ? Math.min(Number(commandSelection.start) || 0, Number(commandSelection.end) || 0)
        : Math.min(Number(viewSelection?.from) || 0, Number(viewSelection?.to) || 0);
      const end = commandSelection
        ? Math.max(Number(commandSelection.start) || 0, Number(commandSelection.end) || 0)
        : Math.max(Number(viewSelection?.from) || 0, Number(viewSelection?.to) || 0);
      return { source, selection: { start, end } };
    }

    function offsetToPosition(source, offset) {
      const bounded = Math.max(0, Math.min(String(source || "").length, Number(offset) || 0));
      const lines = String(source || "").slice(0, bounded).split("\n");
      return { line: lines.length - 1, character: lines[lines.length - 1].replace(/\r$/, "").length };
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

    function canExtractMethod(context = {}) {
      const path = getActiveEditorPath();
      const selection = normalizeSelection(context);
      const editorContext = getActiveCodeMirrorEditor()?.getLspDocumentContext?.();
      return !!sourceActions
        && !!javaSourceActions
        && !!requestClient
        && !!dialog
        && !!workspaceAdapter
        && !!getWorkspaceEditPreview()
        && isDesktopRuntime()
        && /\.java$/i.test(String(path || ""))
        && isInsideWorkspace(path)
        && selection.start < selection.end
        && !!selection.source.slice(selection.start, selection.end).trim()
        && editorContext?.languageId === "java"
        && !!editorContext.transport;
    }

    function getFormattingOptions(documentContext) {
      const format = documentContext?.workspaceConfiguration?.java?.format || {};
      const tabSize = Number(format.tabSize);
      return {
        tabSize: Number.isFinite(tabSize) && tabSize > 0 ? tabSize : 4,
        insertSpaces: format.insertSpaces !== false
      };
    }

    function assertCapturedContext(activePath, source, start, end) {
      if (normalizePath(getActiveEditorPath()) !== activePath || getActiveEditorValue() !== source) {
        throw new Error("The active Java source changed while Extract Method was open.");
      }
      const current = normalizeSelection(getCurrentSelectionContext());
      if (current.start !== start || current.end !== end) throw new Error("The Java selection changed while Extract Method was open.");
    }

    function refreshEditorStatus() {
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
    }

    async function extractMethod(context = {}) {
      const selection = normalizeSelection(context);
      const activePath = normalizePath(getActiveEditorPath());
      try {
        const capturedContext = { source: selection.source, selection: { start: selection.start, end: selection.end } };
        if (!canExtractMethod(capturedContext)) {
          throw new Error("Extract Method requires selected Java code in a writable desktop workspace with a running Java language server.");
        }
        const javaContext = javaSourceActions.getActiveJavaContext?.();
        const editor = getActiveCodeMirrorEditor();
        const documentContext = await javaSourceActions.getActiveLspDocumentContext?.(javaContext, editor);
        const fileUri = documentContext?.fileUri || lspServerRegistry?.toFileUri?.(activePath);
        if (!documentContext?.transport || !fileUri) throw new Error("The Java language server is unavailable for this file.");
        assertCapturedContext(activePath, selection.source, selection.start, selection.end);

        const refactor = await requestClient.request(documentContext.transport, "java/getRefactorEdit", {
          command: "extractMethod",
          commandArguments: [],
          context: createCodeActionParams(fileUri, selection),
          options: getFormattingOptions(documentContext)
        }, { label: "Extract Method" });
        const initialPreview = await workspaceAdapter.prepare(refactor, { fileUri });
        const defaultMethodName = initialPreview.defaultMethodName;
        const initialSignature = initialPreview.methodSignature;

        const result = await dialog.open({
          defaultMethodName,
          methodSignature: initialSignature,
          initialPreview,
          getSignature(settings) {
            const selectedSettings = typeof settings === "string" ? { methodName: settings } : (settings || {});
            return workspaceAdapter.customizeMethodSignature(initialSignature, defaultMethodName, selectedSettings);
          },
          async preparePreview(settings) {
            assertCapturedContext(activePath, selection.source, selection.start, selection.end);
            const selectedSettings = typeof settings === "string" ? { methodName: settings } : (settings || {});
            return workspaceAdapter.prepare(refactor, { fileUri, ...selectedSettings });
          },
          async applyPreview(preview) {
            assertCapturedContext(activePath, selection.source, selection.start, selection.end);
            return workspaceAdapter.apply(preview);
          },
          onAfterApply: refreshEditorStatus,
          onAfterUndo: refreshEditorStatus
        });
        return result || { applied: false, reason: "cancelled" };
      } catch (error) {
        log("warning", "[lsp] Java Extract Method failed", { message: error?.message || String(error) });
        alertUser(error?.message || "Extract Method failed.");
        return { applied: false, reason: "error", error };
      }
    }

    function handleShortcut(event) {
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || String(event.key || "").toLowerCase() !== "m") return;
      if (/^(input|textarea|select|button)$/i.test(String(event.target?.tagName || ""))) return;
      const context = getCurrentSelectionContext();
      if (!canExtractMethod(context)) return;
      event.preventDefault();
      event.stopPropagation();
      void extractMethod(context);
    }

    const provider = sourceActions?.registerProvider?.({
      id: "java-extract-method-actions",
      getAvailableActions(context = {}) {
        if (!canExtractMethod(context)) return [];
        return [{
          id: "extract-method",
          label: "Extract Method...",
          shortcut: "Alt+Shift+M",
          icon: "bi-box-arrow-up-right",
          menu: "refactor",
          run: extractMethod
        }];
      }
    });
    document?.addEventListener?.("keydown", handleShortcut);

    const api = { canExtractMethod, createCodeActionParams, extractMethod, handleShortcut, provider };
    app.registerModule?.("javaExtractMethodActions", api);
    return api;
  }

  global.registerMarkdownViewerJavaExtractMethodActions = registerMarkdownViewerJavaExtractMethodActions;
})(typeof window !== "undefined" ? window : globalThis);
