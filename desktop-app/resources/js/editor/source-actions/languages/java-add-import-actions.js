// Java Add Import action backed by the active Java language server.
(function(global) {
  "use strict";

  const JAVA_TYPE_COMPLETION_KINDS = new Set([7, 8, 13, 22]);
  const JAVA_TYPE_SYMBOL_KINDS = new Set([5, 10, 11, 23]);

  /**
   * Register the Java Add Import command and its editor shortcut.
   * @param {object} app Application module registry.
   * @param {object} deps Java editor and language-server dependencies.
   * @returns {object} Java Add Import action API.
   */
  function registerMarkdownViewerJavaAddImportActions(app, deps = {}) {
    const javaSourceActions = deps.javaSourceActions || app.modules?.javaSourceActions;
    const requestClient = deps.requestClient || app.modules?.lspRequestClient;
    const lspServerRegistry = deps.lspServerRegistry || app.modules?.lspServerRegistry;
    const getActiveCodeMirrorEditor = deps.getActiveCodeMirrorEditor || function() { return null; };
    const getActiveEditorValue = deps.getActiveEditorValue || function() { return ""; };
    const updateEditorLineNumbers = deps.updateEditorLineNumbers || function() {};
    const updateEditorSelectionHighlights = deps.updateEditorSelectionHighlights || function() {};
    const updateStatusLine = deps.updateStatusLine || function() {};
    const alertUser = deps.alertUser || function(message) { global.alert?.(message); };
    const appDebugLog = deps.appDebugLog || function() {};
    const standardImports = deps.standardImports || global.markdownViewerJavaStandardImports;
    const qualifiedTypeReferences = deps.qualifiedTypeReferences || global.markdownViewerJavaQualifiedTypeReferences;
    const requestTimeoutMs = Number.isFinite(Number(deps.requestTimeoutMs))
      ? Math.max(1, Number(deps.requestTimeoutMs))
      : 15000;
    const standardImportRequestTimeoutMs = Math.min(requestTimeoutMs, 1000);
    const dialog = global.createMarkdownViewerAddImportDialog?.({ document: deps.document || global.document }) || null;

    function log(level, message, details) {
      try {
        appDebugLog(level, message, details);
      } catch (_error) {
        // Import generation must not depend on diagnostics logging.
      }
    }

    function canAddImportForActiveEditor() {
      return !!javaSourceActions?.getActiveJavaContext?.() && !!getActiveCodeMirrorEditor()?.getView?.();
    }

    function isJavaReferenceCharacter(character) {
      return /[\p{L}\p{N}_$.]/u.test(character || "");
    }

    function getSelectedTypeReference(editor, source) {
      const selection = editor?.getView?.()?.state?.selection?.main;
      if (!selection) return null;
      let from = Math.min(selection.from, selection.to);
      let to = Math.max(selection.from, selection.to);
      if (from === to) {
        while (from > 0 && isJavaReferenceCharacter(source[from - 1])) from -= 1;
        while (to < source.length && isJavaReferenceCharacter(source[to])) to += 1;
      }
      const selected = source.slice(from, to);
      const leadingWhitespace = selected.length - selected.trimStart().length;
      const trailingWhitespace = selected.length - selected.trimEnd().length;
      from += leadingWhitespace;
      to -= trailingWhitespace;
      const text = source.slice(from, to);
      if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(text)) return null;
      const parts = text.split(".");
      return {
        from,
        to,
        text,
        simpleName: parts.at(-1),
        isQualified: parts.length > 1
      };
    }

    function offsetToPosition(source, offset) {
      const safeOffset = Math.max(0, Math.min(Number(offset) || 0, source.length));
      const before = source.slice(0, safeOffset);
      const lastBreak = before.lastIndexOf("\n");
      return {
        line: (before.match(/\n/g) || []).length,
        character: safeOffset - lastBreak - 1
      };
    }

    function positionToOffset(source, position) {
      const requestedLine = Math.max(0, Number(position?.line) || 0);
      let offset = 0;
      let line = 0;
      while (line < requestedLine) {
        const nextBreak = source.indexOf("\n", offset);
        if (nextBreak < 0) return source.length;
        offset = nextBreak + 1;
        line += 1;
      }
      const lineEnd = source.indexOf("\n", offset);
      const maximum = lineEnd < 0 ? source.length : lineEnd;
      return Math.min(offset + Math.max(0, Number(position?.character) || 0), maximum);
    }

    function getImportFromText(text, simpleName) {
      const escapedName = simpleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = String(text || "").match(new RegExp(`(?:[A-Za-z_$][\\w$]*\\.)+${escapedName}(?=\\b|$)`));
      return match?.[0] || "";
    }

    function getCompletionQualifiedName(item, simpleName) {
      for (const edit of item?.additionalTextEdits || []) {
        const importedName = String(edit?.newText || "").match(/\bimport\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\s*;/)?.[1];
        if (importedName?.endsWith(`.${simpleName}`)) return importedName;
      }
      const fromDetail = getImportFromText(item?.detail, simpleName);
      if (fromDetail) return fromDetail;
      const label = String(item?.label || "");
      const packageSuffix = label.match(/\s+-\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*$/)?.[1];
      if (packageSuffix) return `${packageSuffix}.${simpleName}`;
      return getImportFromText(label, simpleName);
    }

    function getCompletionItemName(item) {
      const textEdit = item?.textEdit;
      const editedText = typeof textEdit?.newText === "string" ? textEdit.newText : "";
      return String(item?.filterText || item?.insertText || editedText || item?.label || "")
        .match(/[A-Za-z_$][\w$]*/)?.[0] || "";
    }

    function createCandidate(item, simpleName, index) {
      const qualifiedName = getCompletionQualifiedName(item, simpleName);
      const detail = String(item?.detail || "").trim();
      return {
        id: qualifiedName || `completion-${index}`,
        label: String(item?.label || simpleName),
        qualifiedName,
        displayName: qualifiedName || detail || String(item?.label || simpleName),
        completionItem: item
      };
    }

    function deduplicateCandidates(candidates) {
      const seen = new Set();
      return candidates.filter((candidate) => {
        const identity = candidate.qualifiedName || `${candidate.label}\u0000${candidate.displayName}`;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      });
    }

    async function requestCompletionCandidates(documentContext, reference, source, timeoutMs = requestTimeoutMs) {
      const result = await requestClient.request(documentContext.transport, "textDocument/completion", {
        textDocument: { uri: documentContext.fileUri },
        position: offsetToPosition(source, reference.to),
        context: { triggerKind: 1 }
      }, {
        label: "Add Import candidates",
        timeoutMs
      });
      const items = Array.isArray(result) ? result : result?.items || [];
      return deduplicateCandidates(items
        .filter((item) => JAVA_TYPE_COMPLETION_KINDS.has(Number(item?.kind)))
        .filter((item) => getCompletionItemName(item) === reference.simpleName)
        .map((item, index) => createCandidate(item, reference.simpleName, index)))
        .filter((candidate) => !!candidate.qualifiedName);
    }

    async function requestWorkspaceSymbolCandidates(documentContext, reference) {
      const symbols = await requestClient.request(documentContext.transport, "workspace/symbol", {
        query: reference.simpleName
      }, {
        label: "Java type search",
        timeoutMs: requestTimeoutMs
      });
      return deduplicateCandidates((Array.isArray(symbols) ? symbols : [])
        .filter((symbol) => JAVA_TYPE_SYMBOL_KINDS.has(Number(symbol?.kind)))
        .filter((symbol) => String(symbol?.name || "").split(".").at(-1) === reference.simpleName)
        .map((symbol, index) => {
          const symbolName = String(symbol.name || reference.simpleName);
          const qualifiedName = symbolName.includes(".")
            ? symbolName
            : [String(symbol.containerName || "").trim(), symbolName].filter(Boolean).join(".");
          return {
            id: qualifiedName || `symbol-${index}`,
            label: symbolName,
            qualifiedName,
            displayName: qualifiedName || symbolName,
            completionItem: null
          };
        })
        .filter((candidate) => candidate.qualifiedName.includes(".")));
    }

    async function findImportCandidates(documentContext, reference, source) {
      if (reference.isQualified) {
        return [{
          id: reference.text,
          label: reference.simpleName,
          qualifiedName: reference.text,
          displayName: reference.text,
          completionItem: null
        }];
      }
      const standardCandidates = (standardImports?.findBySimpleName?.(reference.simpleName) || []).map((entry) => ({
        id: entry.qualifiedName,
        label: reference.simpleName,
        qualifiedName: entry.qualifiedName,
        displayName: entry.qualifiedName,
        completionItem: null
      }));
      let completionCandidates;
      try {
        completionCandidates = await requestCompletionCandidates(
          documentContext,
          reference,
          source,
          standardCandidates.length ? standardImportRequestTimeoutMs : requestTimeoutMs
        );
      } catch (error) {
        if (standardCandidates.length) return standardCandidates;
        throw error;
      }
      if (completionCandidates.length) {
        return deduplicateCandidates([...completionCandidates, ...standardCandidates]);
      }
      if (standardCandidates.length) return standardCandidates;
      try {
        const symbolCandidates = await requestWorkspaceSymbolCandidates(documentContext, reference);
        return deduplicateCandidates([...completionCandidates, ...symbolCandidates]);
      } catch (error) {
        if (completionCandidates.length) return completionCandidates;
        throw error;
      }
    }

    function getSourcePackage(source) {
      return source.match(/^\s*package\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/m)?.[1] || "";
    }

    function getImportedTypes(source) {
      return Array.from(source.matchAll(/^[ \t]*import[ \t]+(?!static[ \t]+)([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\.\*)*)[ \t]*;/gm), (match) => ({
        qualifiedName: match[1],
        start: match.index,
        end: match.index + match[0].length
      }));
    }

    function isTypeAvailableWithoutImport(source, qualifiedName) {
      const packageName = qualifiedName.slice(0, -(qualifiedName.split(".").at(-1).length + 1));
      if (packageName === "java.lang" || packageName === getSourcePackage(source)) return true;
      return getImportedTypes(source).some((entry) => {
        if (entry.qualifiedName === qualifiedName) return true;
        return entry.qualifiedName.endsWith(".*") && qualifiedName.startsWith(entry.qualifiedName.slice(0, -1));
      });
    }

    function findConflictingImport(source, qualifiedName) {
      const simpleName = qualifiedName.split(".").at(-1);
      return getImportedTypes(source).find((entry) => {
        return !entry.qualifiedName.endsWith(".*")
          && entry.qualifiedName !== qualifiedName
          && entry.qualifiedName.split(".").at(-1) === simpleName;
      }) || null;
    }

    function getLineEndIncludingBreak(source, offset) {
      const lineBreak = source.indexOf("\n", offset);
      return lineBreak < 0 ? source.length : lineBreak + 1;
    }

    function skipLeadingComments(source) {
      let offset = 0;
      while (offset < source.length) {
        const whitespace = source.slice(offset).match(/^\s+/)?.[0] || "";
        offset += whitespace.length;
        if (source.startsWith("//", offset)) {
          offset = getLineEndIncludingBreak(source, offset);
          continue;
        }
        if (source.startsWith("/*", offset)) {
          const end = source.indexOf("*/", offset + 2);
          offset = end < 0 ? source.length : end + 2;
          continue;
        }
        break;
      }
      return offset;
    }

    function createManualImportEdit(source, qualifiedName) {
      const imports = getImportedTypes(source);
      const importText = `import ${qualifiedName};`;
      if (imports.length) {
        const followingImport = imports.find((entry) => entry.qualifiedName.localeCompare(qualifiedName) > 0);
        if (followingImport) {
          return { from: followingImport.start, to: followingImport.start, insert: `${importText}\n` };
        }
        const lastImport = imports.at(-1);
        const insertionOffset = getLineEndIncludingBreak(source, lastImport.end);
        return { from: insertionOffset, to: insertionOffset, insert: `${importText}\n` };
      }
      const packageMatch = /^\s*package\s+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*;/m.exec(source);
      if (packageMatch) {
        const insertionOffset = getLineEndIncludingBreak(source, packageMatch.index + packageMatch[0].length);
        return { from: insertionOffset, to: insertionOffset, insert: `\n${importText}\n` };
      }
      const insertionOffset = skipLeadingComments(source);
      return { from: insertionOffset, to: insertionOffset, insert: `${importText}\n\n` };
    }

    async function resolveCompletionItem(documentContext, candidate) {
      const item = candidate.completionItem;
      if (!item || Array.isArray(item.additionalTextEdits)) return item;
      try {
        return await requestClient.request(documentContext.transport, "completionItem/resolve", item, {
          label: "Add Import completion",
          timeoutMs: requestTimeoutMs
        }) || item;
      } catch (_error) {
        return item;
      }
    }

    function getSafeLanguageServerImportEdits(item, source) {
      const firstType = source.search(/\b(?:class|interface|enum|record)\s+[A-Za-z_$]/);
      const headerEnd = firstType < 0 ? source.length : firstType;
      return (item?.additionalTextEdits || []).filter((edit) => {
        const from = positionToOffset(source, edit?.range?.start);
        const to = positionToOffset(source, edit?.range?.end);
        return from <= headerEnd && to <= headerEnd && /\bimport\s+/.test(String(edit?.newText || ""));
      });
    }

    function createLspEdit(source, change) {
      return {
        range: {
          start: offsetToPosition(source, change.from),
          end: offsetToPosition(source, change.to)
        },
        newText: change.insert
      };
    }

    async function applyImportCandidate(editor, documentContext, reference, candidate, source) {
      const qualifiedName = candidate.qualifiedName;
      if (!qualifiedName || !qualifiedName.endsWith(`.${reference.simpleName}`)) {
        throw new Error("The selected Java type did not provide a valid fully qualified name.");
      }
      const conflictingImport = findConflictingImport(source, qualifiedName);
      if (conflictingImport) {
        throw new Error(`${conflictingImport.qualifiedName} is already imported with the same simple type name.`);
      }

      const resolvedItem = await resolveCompletionItem(documentContext, candidate);
      let importEdits = getSafeLanguageServerImportEdits(resolvedItem, source);
      const importRequired = !isTypeAvailableWithoutImport(source, qualifiedName);
      if (importRequired && !importEdits.length) {
        importEdits = [createLspEdit(source, createManualImportEdit(source, qualifiedName))];
      }
      const edits = [...importEdits];
      if (reference.isQualified) {
        const referenceRanges = qualifiedTypeReferences?.findAll
          ? qualifiedTypeReferences.findAll(source, qualifiedName)
          : [{ from: reference.from, to: reference.to }];
        for (const range of referenceRanges) {
          edits.push(createLspEdit(source, {
            from: range.from,
            to: range.to,
            insert: reference.simpleName
          }));
        }
      }
      if (!edits.length) return { applied: false, reason: "already-available" };
      if (!editor.applyLspTextEdits(edits)) return { applied: false, reason: "apply-failed" };
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
      return { applied: true, qualifiedName, editCount: edits.length };
    }

    /**
     * Add an import for the selected Java type reference in the active editor.
     * @returns {Promise<object>} Result describing whether an import edit was applied.
     */
    async function addImportForActiveEditor() {
      const javaContext = javaSourceActions?.getActiveJavaContext?.();
      const editor = getActiveCodeMirrorEditor();
      if (!javaContext || !editor?.getView?.() || !editor?.applyLspTextEdits) {
        alertUser("Add Import is available only for local Java files in the CodeMirror editor.");
        return { applied: false, reason: "editor-unavailable" };
      }
      const source = getActiveEditorValue();
      const reference = getSelectedTypeReference(editor, source);
      if (!reference) {
        alertUser("Select a Java type reference, or place the cursor inside one, then try Add Import again.");
        return { applied: false, reason: "no-type-reference" };
      }

      try {
        let documentContext = null;
        if (!reference.isQualified) {
          documentContext = await javaSourceActions.getActiveLspDocumentContext(javaContext, editor);
          if (!documentContext?.transport) {
            alertUser("The Java language server is not available for this file.");
            return { applied: false, reason: "lsp-unavailable" };
          }
          documentContext.fileUri = documentContext.fileUri || lspServerRegistry?.toFileUri?.(javaContext.path);
          if (!documentContext.fileUri) throw new Error("The active Java document URI is unavailable.");
        }
        const candidates = await findImportCandidates(documentContext, reference, source);
        if (!candidates.length) {
          alertUser(`No importable Java type named '${reference.simpleName}' was found in the current project classpath.`);
          return { applied: false, reason: "no-candidates" };
        }
        const candidate = candidates.length === 1
          ? candidates[0]
          : await dialog?.open({ typeName: reference.simpleName, candidates });
        if (!candidate) return { applied: false, reason: "cancelled" };
        if (getActiveEditorValue() !== source) {
          alertUser("The Java source changed while choosing an import. Try Add Import again.");
          return { applied: false, reason: "source-changed" };
        }
        const result = await applyImportCandidate(editor, documentContext, reference, candidate, source);
        if (result.reason === "already-available") {
          alertUser(`${candidate.qualifiedName} is already available without another import.`);
        } else if (result.reason === "apply-failed") {
          alertUser("The Java import edit could not be applied.");
        }
        if (result.applied) {
          log("info", "[lsp] Applied Java Add Import edit", {
            path: javaContext.path,
            qualifiedName: result.qualifiedName,
            editCount: result.editCount
          });
        }
        return result;
      } catch (error) {
        const message = error?.message || "The Java import could not be added.";
        log("warning", "[lsp] Java Add Import failed", { path: javaContext.path, message });
        alertUser(message);
        return { applied: false, reason: "error", error };
      }
    }

    function handleEditorShortcut(event) {
      const editor = getActiveCodeMirrorEditor();
      const editorElement = editor?.getView?.()?.dom;
      if (!editorElement?.contains(event.target)) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (!canAddImportForActiveEditor()) return;

      const isAutocompleteShortcut = !event.shiftKey
        && (event.code === "Space" || event.key === " " || event.key === "Spacebar");
      const isAddImportShortcut = event.shiftKey && String(event.key).toLowerCase() === "m";
      if (isAutocompleteShortcut) {
        const source = getActiveEditorValue();
        const reference = getSelectedTypeReference(editor, source);
        if (!reference?.isQualified) return;
      } else if (!isAddImportShortcut) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      void addImportForActiveEditor();
    }

    global.document?.addEventListener("keydown", handleEditorShortcut, true);

    const api = {
      addImportForActiveEditor,
      canAddImportForActiveEditor
    };
    app.registerModule?.("javaAddImportActions", api);
    return api;
  }

  global.registerMarkdownViewerJavaAddImportActions = registerMarkdownViewerJavaAddImportActions;
})(window);
