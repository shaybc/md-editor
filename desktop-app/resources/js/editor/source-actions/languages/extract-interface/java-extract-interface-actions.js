// Java Extract Interface action and JDT LS refactoring workflow.
(function(global) {
  "use strict";

  /** Register the Eclipse-style Extract Interface refactoring action. */
  function registerMarkdownViewerJavaExtractInterfaceActions(app, deps = {}) {
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
    const readUri = deps.readUri || async function() { return ""; };
    const reloadFolderTree = deps.reloadFolderTree || function() {};
    const suppressFolderWatcher = deps.suppressFolderWatcher || function() {};
    const updateStatusLine = deps.updateStatusLine || function() {};
    const alertUser = deps.alertUser || function(message) { global.alert?.(message); };
    const appDebugLog = deps.appDebugLog || function() {};
    const dialog = deps.dialog || global.createMarkdownViewerExtractInterfaceDialog?.();
    const workspaceAdapter = deps.workspaceAdapter || global.createMarkdownViewerJavaExtractInterfaceWorkspaceEdit?.({
      getWorkspaceEditPreview,
      getActiveEditorPath
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

    function getTypeSelection(source) {
      const match = /\b(?:public\s+)?(?:abstract\s+|final\s+|sealed\s+|non-sealed\s+)*(?:class|record|enum)\s+([A-Za-z_$][\w$]*)/.exec(String(source || ""));
      const offset = match ? match.index + match[0].lastIndexOf(match[1]) : 0;
      const before = String(source || "").slice(0, offset);
      const lines = before.split("\n");
      const start = { line: lines.length - 1, character: lines[lines.length - 1].replace(/\r$/, "").length };
      return {
        typeName: match?.[1] || "",
        position: start,
        range: { start, end: { line: start.line, character: start.character + (match?.[1]?.length || 0) } }
      };
    }

    function createCodeActionParams(fileUri, source) {
      return {
        textDocument: { uri: fileUri },
        range: getTypeSelection(source).range,
        context: { diagnostics: [] }
      };
    }

    function canExtractInterface() {
      const path = getActiveEditorPath();
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
        && editorContext?.languageId === "java"
        && !!editorContext.transport;
    }

    function clone(value) {
      if (typeof structuredClone === "function") return structuredClone(value || {});
      return JSON.parse(JSON.stringify(value || {}));
    }

    function setExtractReplacement(configuration, enabled) {
      const result = clone(configuration);
      result.java = result.java || {};
      result.java.refactoring = result.java.refactoring || {};
      result.java.refactoring.extract = result.java.refactoring.extract || {};
      result.java.refactoring.extract.interface = result.java.refactoring.extract.interface || {};
      result.java.refactoring.extract.interface.replace = !!enabled;
      return result;
    }

    function notifyConfiguration(transport, settings) {
      transport.send(JSON.stringify({
        jsonrpc: "2.0",
        method: "workspace/didChangeConfiguration",
        params: { settings }
      }));
    }

    function getCurrentPackageNode(status) {
      const destinations = status?.destinationResponse?.destinations || status?.destinations || [];
      return destinations.find((destination) => destination?.isParentOfSelectedFile)
        || destinations.find((destination) => destination?.isParent)
        || destinations[0]
        || null;
    }

    function getPackageName(source) {
      return String(source || "").match(/^\s*package\s+([\w.]+)\s*;/m)?.[1] || "";
    }

    async function getInstanceofEdits(documentContext, source, status, settings) {
      if (!settings.replaceWherePossible || !settings.replaceInstanceof) return {};
      const selection = getTypeSelection(source);
      const references = await requestClient.request(documentContext.transport, "textDocument/references", {
        textDocument: { uri: documentContext.fileUri },
        position: selection.position,
        context: { includeDeclaration: false }
      }, { label: "Extract Interface instanceof references" });
      const packageName = getPackageName(source);
      return workspaceAdapter.collectInstanceofEdits(references, {
        readUri,
        interfaceName: settings.interfaceName,
        packageName,
        qualifiedName: packageName ? `${packageName}.${settings.interfaceName}` : settings.interfaceName,
        subTypeName: status.subTypeName
      });
    }

    async function requestRefactorEdit(documentContext, context, destination, settings) {
      const originalConfiguration = clone(deps.getJdtConfiguration?.(documentContext) || documentContext.workspaceConfiguration || {});
      notifyConfiguration(documentContext.transport, setExtractReplacement(originalConfiguration, settings.replaceWherePossible));
      try {
        return await requestClient.request(documentContext.transport, "java/getRefactorEdit", {
          command: "extractInterface",
          commandArguments: [settings.selectedHandleIdentifiers, settings.interfaceName, destination],
          context
        }, { label: "Extract Interface" });
      } finally {
        notifyConfiguration(documentContext.transport, originalConfiguration);
      }
    }

    async function extractInterface() {
      const activePath = normalizePath(getActiveEditorPath());
      const originalSource = getActiveEditorValue();
      try {
        if (!canExtractInterface()) throw new Error("Extract Interface requires a writable Java file in the active desktop workspace and a running Java language server.");
        const javaContext = javaSourceActions.getActiveJavaContext?.();
        const editor = getActiveCodeMirrorEditor();
        const documentContext = await javaSourceActions.getActiveLspDocumentContext?.(javaContext, editor);
        const fileUri = documentContext?.fileUri || lspServerRegistry?.toFileUri?.(activePath);
        if (!documentContext?.transport || !fileUri) throw new Error("The Java language server is unavailable for this file.");
        documentContext.fileUri = fileUri;
        const context = createCodeActionParams(fileUri, originalSource);
        const status = await requestClient.request(documentContext.transport, "java/checkExtractInterfaceStatus", context, {
          label: "Check Extract Interface"
        });
        const members = Array.isArray(status?.members) ? status.members.filter((member) => member?.handleIdentifier) : [];
        const destination = getCurrentPackageNode(status);
        if (!status?.subTypeName || !destination) throw new Error("JDT could not identify the primary Java type and its current package.");
        if (!members.length) throw new Error("This Java class has no members eligible for an extracted interface.");

        const result = await dialog.open({
          subTypeName: status.subTypeName,
          members,
          async preparePreview(settings) {
            if (normalizePath(getActiveEditorPath()) !== activePath || getActiveEditorValue() !== originalSource) {
              throw new Error("The active Java source changed while Extract Interface was open.");
            }
            const refactor = await requestRefactorEdit(documentContext, context, destination, settings);
            if (refactor?.errorMessage) throw new Error(refactor.errorMessage);
            if (!refactor?.edit) throw new Error("JDT did not return a safe Extract Interface workspace edit.");
            const instanceofEditsByUri = await getInstanceofEdits(documentContext, originalSource, status, settings);
            return workspaceAdapter.prepare(refactor.edit, { ...settings, instanceofEditsByUri });
          },
          async applyPreview(preview) {
            if (normalizePath(getActiveEditorPath()) !== activePath || getActiveEditorValue() !== originalSource) {
              throw new Error("The active Java source changed after the preview was prepared.");
            }
            suppressFolderWatcher(1200);
            return workspaceAdapter.apply(preview);
          },
          async onAfterApply() {
            await reloadFolderTree({ skipSavedGraphPrompt: true });
            updateStatusLine();
          },
          async onAfterUndo() {
            suppressFolderWatcher(1200);
            await reloadFolderTree({ skipSavedGraphPrompt: true });
            updateStatusLine();
          }
        });
        return result || { applied: false, reason: "cancelled" };
      } catch (error) {
        log("warning", "[lsp] Java Extract Interface failed", { message: error?.message || String(error) });
        alertUser(error?.message || "Extract Interface failed.");
        return { applied: false, reason: "error", error };
      }
    }

    const provider = sourceActions?.registerProvider?.({
      id: "java-extract-interface-actions",
      getAvailableActions() {
        if (!canExtractInterface()) return [];
        return [{
          id: "extract-interface",
          label: "Extract Interface...",
          shortcut: "",
          icon: "bi-diagram-2",
          menu: "refactor",
          run: extractInterface
        }];
      }
    });

    const api = { canExtractInterface, extractInterface, provider };
    app.registerModule?.("javaExtractInterfaceActions", api);
    return api;
  }

  registerMarkdownViewerJavaExtractInterfaceActions._test = {
    createCodeActionParams: function(fileUri, source) {
      const match = /\b(?:class|record|enum)\s+([A-Za-z_$][\w$]*)/.exec(String(source || ""));
      const offset = match ? match.index + match[0].lastIndexOf(match[1]) : 0;
      const before = String(source || "").slice(0, offset).split("\n");
      const start = { line: before.length - 1, character: before.at(-1).replace(/\r$/, "").length };
      return { textDocument: { uri: fileUri }, range: { start, end: { line: start.line, character: start.character + (match?.[1]?.length || 0) } }, context: { diagnostics: [] } };
    }
  };

  global.registerMarkdownViewerJavaExtractInterfaceActions = registerMarkdownViewerJavaExtractInterfaceActions;
})(typeof window !== "undefined" ? window : globalThis);
