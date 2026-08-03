// Java Pull Up action backed by the MD-Editor JDT LS companion bundle.
(function(global) {
  "use strict";

  /** Register the Eclipse-style Pull Up refactoring action. */
  function registerMarkdownViewerJavaPullUpActions(app, deps = {}) {
    const sourceActions = deps.sourceActions || app.modules?.sourceActions;
    const javaSourceActions = deps.javaSourceActions || app.modules?.javaSourceActions;
    const requestClient = deps.requestClient;
    const lspServerRegistry = deps.lspServerRegistry;
    const getActiveEditorPath = deps.getActiveEditorPath || function() { return ""; };
    const getActiveEditorValue = deps.getActiveEditorValue || function() { return ""; };
    const getActiveCodeMirrorEditor = deps.getActiveCodeMirrorEditor || function() { return null; };
    const getActiveFolderPath = deps.getActiveFolderPath || function() { return ""; };
    const getWorkspaceEditPreview = deps.getWorkspaceEditPreview || function() { return app.modules?.workspaceEditPreview || null; };
    const isDesktopRuntime = deps.isDesktopRuntime || function() { return false; };
    const reloadFolderTree = deps.reloadFolderTree || function() {};
    const suppressFolderWatcher = deps.suppressFolderWatcher || function() {};
    const updateStatusLine = deps.updateStatusLine || function() {};
    const alertUser = deps.alertUser || function(message) { global.alert?.(message); };
    const appDebugLog = deps.appDebugLog || function() {};
    const dialog = deps.dialog || global.createMarkdownViewerPullUpDialog?.();
    const prepared = new Map();
    const pending = new Map();

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function normalizeSelection(context = {}) {
      const source = String(context.source ?? getActiveEditorValue());
      const start = Math.max(0, Math.min(source.length, Number(context.selection?.start) || 0));
      const end = Math.max(start, Math.min(source.length, Number(context.selection?.end) || start));
      return { source, start, end };
    }

    function selectionKey(context = {}) {
      const selection = normalizeSelection(context);
      return `${normalizePath(getActiveEditorPath()).toLowerCase()}:${selection.start}:${selection.end}:${selection.source.length}`;
    }

    function isInsideWorkspace(path) {
      const root = normalizePath(getActiveFolderPath()).toLowerCase();
      const candidate = normalizePath(path).toLowerCase();
      return !!root && (candidate === root || candidate.startsWith(`${root}/`));
    }

    function canRequest() {
      const path = getActiveEditorPath();
      const editorContext = getActiveCodeMirrorEditor()?.getLspDocumentContext?.();
      return !!sourceActions && !!javaSourceActions && !!requestClient && !!dialog && !!getWorkspaceEditPreview()
        && isDesktopRuntime() && /\.java$/i.test(String(path || "")) && isInsideWorkspace(path)
        && editorContext?.languageId === "java" && !!editorContext.transport;
    }

    async function getDocumentRequest(context = {}) {
      const selection = normalizeSelection(context);
      const javaContext = javaSourceActions.getActiveJavaContext?.();
      const documentContext = await javaSourceActions.getActiveLspDocumentContext?.(javaContext, getActiveCodeMirrorEditor());
      const uri = documentContext?.fileUri || lspServerRegistry?.toFileUri?.(javaContext?.path || getActiveEditorPath());
      if (!documentContext?.transport || !uri) throw new Error("The Java language server is unavailable for this file.");
      return {
        documentContext,
        request: { uri, selectionStart: selection.start, selectionEnd: selection.end }
      };
    }

    async function execute(documentContext, command, request, label) {
      return requestClient.request(documentContext.transport, "workspace/executeCommand", {
        command,
        arguments: [request]
      }, { label });
    }

    function getEligibilityMessage(analysis) {
      return analysis?.problems?.find((problem) => ["fatal", "error"].includes(problem.severity))?.message
        || "The selected Java member cannot be pulled up.";
    }

    async function prepareAvailableActions(context = {}) {
      if (!canRequest()) return false;
      const key = selectionKey(context);
      if (prepared.has(key)) return false;
      if (pending.has(key)) return pending.get(key);
      const task = getDocumentRequest(context)
        .then(({ documentContext, request }) => execute(documentContext, "mdeditor.java.pullUp.check", request, "Check Pull Up"))
        .then((analysis) => {
          prepared.set(key, analysis || { available: false, problems: [] });
          return true;
        })
        .catch((error) => {
          prepared.set(key, { available: false, problems: [{ severity: "error", message: error?.message || String(error) }] });
          try { appDebugLog("warning", "[lsp] Java Pull Up discovery failed", { message: error?.message || String(error) }); } catch (_error) {}
          return true;
        })
        .finally(() => pending.delete(key));
      pending.set(key, task);
      return task;
    }

    async function pullUp(context = {}) {
      const activePath = normalizePath(getActiveEditorPath());
      const originalSource = getActiveEditorValue();
      try {
        if (!canRequest()) throw new Error("Pull Up requires a writable Java file in the active desktop workspace and a running Java language server.");
        const { documentContext, request } = await getDocumentRequest(context);
        const analysis = prepared.get(selectionKey(context))
          || await execute(documentContext, "mdeditor.java.pullUp.check", request, "Check Pull Up");
        if (!analysis?.available) throw new Error(getEligibilityMessage(analysis));
        const workspaceEditPreview = getWorkspaceEditPreview();
        return await dialog.open({
          analysis,
          request,
          resolveConfiguration(settings) {
            return execute(documentContext, "mdeditor.java.pullUp.resolve", settings, "Resolve Pull Up");
          },
          async preparePreview(settings) {
            if (normalizePath(getActiveEditorPath()) !== activePath || getActiveEditorValue() !== originalSource) {
              throw new Error("The active Java source changed while Pull Up was open.");
            }
            const result = await execute(documentContext, "mdeditor.java.pullUp.preview", settings, "Preview Pull Up");
            const fatal = result?.problems?.find((problem) => ["fatal", "error"].includes(problem.severity));
            if (!result?.edit) {
              if (fatal) return { problems: result.problems, summary: [] };
              throw new Error("JDT did not return a safe Pull Up workspace edit.");
            }
            const preview = await workspaceEditPreview.resolve({ title: "Pull Up", workspaceEdit: result.edit });
            preview.problems = result.problems || [];
            return preview;
          },
          async applyPreview(preview) {
            if (normalizePath(getActiveEditorPath()) !== activePath || getActiveEditorValue() !== originalSource) {
              throw new Error("The active Java source changed after the preview was prepared.");
            }
            suppressFolderWatcher(1200);
            return workspaceEditPreview.apply(preview);
          },
          async onAfterApply() {
            prepared.clear();
            await reloadFolderTree({ skipSavedGraphPrompt: true });
            updateStatusLine();
          },
          async onAfterUndo() {
            suppressFolderWatcher(1200);
            await reloadFolderTree({ skipSavedGraphPrompt: true });
            updateStatusLine();
          }
        });
      } catch (error) {
        try { appDebugLog("warning", "[lsp] Java Pull Up failed", { message: error?.message || String(error) }); } catch (_error) {}
        alertUser(error?.message || "Pull Up failed.");
        return { applied: false, reason: "error", error };
      }
    }

    const provider = sourceActions?.registerProvider?.({
      id: "java-pull-up-actions",
      prepareAvailableActions,
      getAvailableActions(context = {}) {
        if (!canRequest()) return [];
        const key = selectionKey(context);
        const analysis = prepared.get(key);
        return [{
          id: "pull-up",
          label: "Pull Up...",
          shortcut: "",
          icon: "bi-arrow-up-square",
          menu: "refactor",
          disabled: false,
          title: analysis && !analysis.available ? getEligibilityMessage(analysis) : "Pull selected members into a superclass or interface.",
          run: pullUp
        }];
      }
    });

    const api = { canRequest, prepareAvailableActions, pullUp, provider };
    app.registerModule?.("javaPullUpActions", api);
    return api;
  }

  registerMarkdownViewerJavaPullUpActions._test = {
    normalizeSelection(source, start, end) {
      const value = String(source || "");
      const from = Math.max(0, Math.min(value.length, Number(start) || 0));
      return { source: value, start: from, end: Math.max(from, Math.min(value.length, Number(end) || from)) };
    }
  };

  global.registerMarkdownViewerJavaPullUpActions = registerMarkdownViewerJavaPullUpActions;
})(typeof window !== "undefined" ? window : globalThis);
