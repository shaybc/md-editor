// Java-specific Source submenu actions and LSP-backed implementations.
(function(window) {
  "use strict";

  function registerMarkdownViewerJavaSourceActions(app, deps = {}) {
    const getActiveEditorPath = deps.getActiveEditorPath || function() { return ""; };
    const getActiveEditorValue = deps.getActiveEditorValue || function() { return ""; };
    const getActiveCodeMirrorEditor = deps.getActiveCodeMirrorEditor || function() { return null; };
    const getLspSession = deps.getLspSession || function() { return null; };
    const languageRegistry = deps.languageRegistry || null;
    const lspServerRegistry = deps.lspServerRegistry || null;
    const updateEditorLineNumbers = deps.updateEditorLineNumbers || function() {};
    const updateEditorSelectionHighlights = deps.updateEditorSelectionHighlights || function() {};
    const updateStatusLine = deps.updateStatusLine || function() {};
    const alertUser = deps.alertUser || function(message) { window.alert?.(message); };
    const appDebugLog = deps.appDebugLog || function() {};
    const requestTimeoutMs = Number.isFinite(Number(deps.requestTimeoutMs)) ? Math.max(1, Number(deps.requestTimeoutMs)) : 15000;
    const requestClient = deps.requestClient;

    function log(level, message, details) {
      try {
        appDebugLog(level, message, details);
      } catch (_error) {
        // Source actions must never fail because diagnostics logging failed.
      }
    }

    function normalizePath(path) {
      return lspServerRegistry?.normalizeLocalPath
        ? lspServerRegistry.normalizeLocalPath(path || "")
        : String(path || "").replace(/\\/g, "/");
    }

    function getActiveJavaContext() {
      const path = normalizePath(getActiveEditorPath());
      if (!path || !/\.java$/i.test(path)) return null;
      const content = getActiveEditorValue();
      const language = languageRegistry?.resolveLanguageForPath?.(path, { content }) || null;
      if (language && language.id !== "java" && language.codeMirrorLanguage !== "java") return null;
      const server = lspServerRegistry?.getServerForLanguage?.("java") || null;
      if (!server || server.id !== "java") return null;
      return { path, content, language, server };
    }

    function canOrganizeImportsForActiveEditor() {
      return !!getActiveJavaContext();
    }

    function getDocumentEndPosition(text) {
      const lines = String(text || "").split("\n");
      const lastLine = Math.max(0, lines.length - 1);
      return {
        line: lastLine,
        character: lines[lastLine]?.length || 0
      };
    }

    function getLineStarts(text) {
      const value = String(text || "");
      const starts = [0];
      for (let index = 0; index < value.length; index += 1) {
        if (value[index] === "\n") starts.push(index + 1);
      }
      return starts;
    }

    function getLineEndOffset(text, lineStarts, lineIndex) {
      const value = String(text || "");
      const nextStart = lineStarts[lineIndex + 1];
      if (typeof nextStart === "number") return Math.max(lineStarts[lineIndex], nextStart - 1);
      return value.length;
    }

    function getLineFullEndOffset(text, lineStarts, lineIndex) {
      const value = String(text || "");
      const nextStart = lineStarts[lineIndex + 1];
      return typeof nextStart === "number" ? nextStart : value.length;
    }

    function getLineText(text, lineStarts, lineIndex) {
      const start = lineStarts[lineIndex] || 0;
      const end = getLineEndOffset(text, lineStarts, lineIndex);
      return String(text || "").slice(start, end).replace(/\r$/, "");
    }

    function positionToOffset(text, lineStarts, position) {
      const lineCount = lineStarts.length;
      const line = Math.max(0, Math.min(Number(position?.line) || 0, Math.max(0, lineCount - 1)));
      const lineStart = lineStarts[line] || 0;
      const lineEnd = getLineEndOffset(text, lineStarts, line);
      const character = Math.max(0, Number(position?.character) || 0);
      return Math.max(lineStart, Math.min(lineStart + character, lineEnd));
    }

    function isImportLine(line) {
      return /^\s*import\s+(?:static\s+)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\.\*)*;\s*(?:(?:\/\/.*)|(?:\/\*.*\*\/)\s*)?$/.test(line || "");
    }

    function isBlankLine(line) {
      return /^\s*$/.test(line || "");
    }

    function getImportEditBounds(text) {
      const lineStarts = getLineStarts(text);
      let firstImportLine = -1;
      let lastImportLine = -1;
      for (let index = 0; index < lineStarts.length; index += 1) {
        if (!isImportLine(getLineText(text, lineStarts, index))) continue;
        if (firstImportLine < 0) firstImportLine = index;
        lastImportLine = index;
      }
      if (firstImportLine < 0) return null;

      let startLine = firstImportLine;
      while (startLine > 0 && isBlankLine(getLineText(text, lineStarts, startLine - 1))) {
        startLine -= 1;
      }

      let endLine = lastImportLine;
      while (endLine + 1 < lineStarts.length && isBlankLine(getLineText(text, lineStarts, endLine + 1))) {
        endLine += 1;
      }

      return {
        start: lineStarts[startLine],
        end: getLineFullEndOffset(text, lineStarts, endLine),
        lineStarts
      };
    }

    function normalizeTextEdit(edit, text, lineStarts) {
      const range = edit?.range || null;
      if (!range) return null;
      const from = positionToOffset(text, lineStarts, range.start);
      const to = positionToOffset(text, lineStarts, range.end);
      return {
        range,
        newText: String(edit.newText ?? ""),
        from: Math.min(from, to),
        to: Math.max(from, to)
      };
    }

    function validateImportOnlyEdits(text, edits) {
      if (!Array.isArray(edits) || edits.length === 0) return [];
      const bounds = getImportEditBounds(text);
      if (!bounds) throw new Error("The Java file has no import block to organize.");
      const normalized = edits.map((edit) => normalizeTextEdit(edit, text, bounds.lineStarts));
      if (normalized.some((edit) => !edit)) throw new Error("The Java language server returned an invalid import edit.");
      const unsafeEdit = normalized.find((edit) => edit.from < bounds.start || edit.to > bounds.end);
      if (unsafeEdit) {
        throw new Error("The Java language server returned edits outside the import block, so no changes were applied.");
      }
      return normalized;
    }

    function getWorkspaceEditUris(workspaceEdit) {
      const uris = new Set();
      Object.entries(workspaceEdit?.changes || {}).forEach(([uri, edits]) => {
        if (Array.isArray(edits) && edits.length) uris.add(uri);
      });
      (workspaceEdit?.documentChanges || []).forEach((change) => {
        const uri = change?.textDocument?.uri || change?.uri || "";
        if (uri && Array.isArray(change?.edits) && change.edits.length) uris.add(uri);
      });
      return uris;
    }

    function extractCurrentFileEdits(workspaceEdit, fileUri) {
      if (!workspaceEdit || typeof workspaceEdit !== "object") return [];
      const editUris = getWorkspaceEditUris(workspaceEdit);
      const otherUri = Array.from(editUris).find((uri) => uri !== fileUri);
      if (otherUri) {
        throw new Error("The Java language server returned edits for another file, so no changes were applied.");
      }
      const edits = [];
      const changedEdits = workspaceEdit.changes?.[fileUri];
      if (Array.isArray(changedEdits)) edits.push(...changedEdits);
      (workspaceEdit.documentChanges || []).forEach((change) => {
        if (change?.textDocument?.uri === fileUri && Array.isArray(change.edits)) edits.push(...change.edits);
      });
      return edits;
    }

    function getOrganizeImportsWorkspaceEdit(actions, fileUri) {
      const candidates = Array.isArray(actions) ? actions : [];
      const action = candidates.find((candidate) => {
        const kind = String(candidate?.kind || "");
        const title = String(candidate?.title || "");
        return kind === "source.organizeImports"
          || kind.startsWith("source.organizeImports.")
          || /organize\s+imports/i.test(title);
      });
      if (!action) return null;
      if (action.edit) return action.edit;
      log("info", "[lsp] Java organize imports returned command-only action", {
        fileUri,
        command: action.command?.command || action.command || "",
        title: action.title || ""
      });
      return null;
    }


    async function getActiveLspDocumentContext(javaContext, codeMirrorEditor) {
      let documentContext = codeMirrorEditor?.getLspDocumentContext?.() || null;
      if (!documentContext || documentContext.languageId !== "java" || !documentContext.transport) {
        await codeMirrorEditor?.refreshLspSessionForActivePath?.();
        documentContext = codeMirrorEditor?.getLspDocumentContext?.() || null;
      }
      if (!documentContext || documentContext.languageId !== "java" || !documentContext.transport) {
        documentContext = await getLspSession({
          path: javaContext.path,
          language: javaContext.language,
          codeMirrorLanguage: "java",
          content: javaContext.content,
          view: codeMirrorEditor?.getView?.()
        });
      }
      return documentContext;
    }

    async function organizeImportsForActiveEditor() {
      const javaContext = getActiveJavaContext();
      if (!javaContext) {
        alertUser("Organize imports is available only for local Java files.");
        return { applied: false, reason: "not-java" };
      }
      const codeMirrorEditor = getActiveCodeMirrorEditor();
      if (!codeMirrorEditor || typeof codeMirrorEditor.applyLspTextEdits !== "function") {
        alertUser("Organize imports requires the CodeMirror editor.");
        return { applied: false, reason: "editor-unavailable" };
      }

      try {
        const documentContext = await getActiveLspDocumentContext(javaContext, codeMirrorEditor);
        const fileUri = documentContext?.fileUri || lspServerRegistry.toFileUri(javaContext.path);
        if (!documentContext?.transport || !fileUri) {
          alertUser("The Java language server is not available for this file.");
          return { applied: false, reason: "lsp-unavailable" };
        }

        const text = getActiveEditorValue();
        const actions = await requestClient.request(documentContext.transport, "textDocument/codeAction", {
          textDocument: { uri: fileUri },
          range: {
            start: { line: 0, character: 0 },
            end: getDocumentEndPosition(text)
          },
          context: {
            diagnostics: [],
            only: ["source.organizeImports"]
          }
        }, {
          label: "Organize imports",
          timeoutMs: requestTimeoutMs
        });
        const workspaceEdit = getOrganizeImportsWorkspaceEdit(actions, fileUri);
        if (!workspaceEdit) {
          alertUser("The Java language server did not return an editable Organize imports change.");
          return { applied: false, reason: "no-edit" };
        }

        const edits = extractCurrentFileEdits(workspaceEdit, fileUri);
        if (!edits.length) {
          alertUser("There are no Java imports to remove.");
          return { applied: false, reason: "no-edits" };
        }
        validateImportOnlyEdits(text, edits);
        const applied = codeMirrorEditor.applyLspTextEdits(edits);
        if (applied) {
          updateEditorLineNumbers();
          updateEditorSelectionHighlights();
          updateStatusLine();
          log("info", "[lsp] Applied Java organize imports edit", { fileUri, editCount: edits.length });
          return { applied: true, editCount: edits.length };
        }
        alertUser("Unable to apply the Java organize imports edit.");
        return { applied: false, reason: "apply-failed" };
      } catch (error) {
        const message = error?.message || "This Java file could not organize imports.";
        log("warning", "[lsp] Java organize imports failed", {
          path: javaContext.path,
          message
        });
        alertUser(message);
        return { applied: false, reason: "error", error };
      }
    }

    async function formatSelectedEditor() {
      const codeMirrorEditor = getActiveCodeMirrorEditor();
      if (!codeMirrorEditor || typeof codeMirrorEditor.formatSelectedLines !== "function") {
        alertUser("Format Selected requires the CodeMirror editor.");
        return false;
      }
      try {
        const didFormat = await codeMirrorEditor.formatSelectedLines();
        if (didFormat) {
          updateEditorLineNumbers();
          updateEditorSelectionHighlights();
          updateStatusLine();
          return true;
        }
        alertUser("Select one or more lines to format.");
      } catch (error) {
        console.warn("Failed to format selected Java lines:", error);
        alertUser(error?.message || "The selected Java lines could not be formatted.");
      }
      return false;
    }

    async function formatActiveEditor() {
      const codeMirrorEditor = getActiveCodeMirrorEditor();
      if (!codeMirrorEditor || typeof codeMirrorEditor.formatActiveDocument !== "function") return false;
      try {
        const didFormat = await codeMirrorEditor.formatActiveDocument();
        if (didFormat) {
          updateEditorLineNumbers();
          updateEditorSelectionHighlights();
          updateStatusLine();
          return true;
        }
        alertUser("No formatter is registered for this file type.");
      } catch (error) {
        console.warn("Failed to format editor document:", error);
        alertUser(error?.message || "This file could not be formatted.");
      }
      return false;
    }

    function registerSourceActionProvider() {
      const sourceActions = deps.sourceActions || app.modules?.sourceActions;
      sourceActions?.registerProvider?.({
        id: "java-source-actions",
        getAvailableActions() {
          if (!canOrganizeImportsForActiveEditor()) return [];
          const actions = [
            { id: "format-file", label: "Format File", shortcut: "", icon: "bi-magic", run: formatActiveEditor }
          ];
          if (getActiveCodeMirrorEditor()?.canFormatSelectedLines?.()) {
            actions.push({ id: "format-selected", label: "Format Selected", shortcut: "", icon: "bi-magic", run: formatSelectedEditor });
          }
          const addImportActions = app.modules?.javaAddImportActions;
          if (addImportActions?.canAddImportForActiveEditor?.()) {
            actions.push({ id: "add-import", label: "Add Import", shortcut: "Ctrl+Shift+M", icon: "bi-box-arrow-in-down", run: addImportActions.addImportForActiveEditor });
          }
          actions.push({ id: "organize-imports", label: "Organize Imports", shortcut: "", icon: "bi-diagram-3", run: organizeImportsForActiveEditor });
          return actions;
        }
      });
    }

    const api = {
      canOrganizeImportsForActiveEditor,
      extractCurrentFileEdits,
      formatActiveEditor,
      formatSelectedEditor,
      getActiveJavaContext,
      getActiveLspDocumentContext,
      organizeImportsForActiveEditor
    };

    app.registerModule?.("javaSourceActions", api);
    registerSourceActionProvider();
    return api;
  }

  registerMarkdownViewerJavaSourceActions._test = {
    getDocumentEndPosition(text) {
      const lines = String(text || "").split("\n");
      return {
        line: Math.max(0, lines.length - 1),
        character: lines[lines.length - 1]?.length || 0
      };
    }
  };

  window.registerMarkdownViewerJavaSourceActions = registerMarkdownViewerJavaSourceActions;
})(window);
