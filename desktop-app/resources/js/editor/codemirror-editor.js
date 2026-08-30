(function(window, document) {
  "use strict";

  function createMarkdownViewerCodeMirrorEditorInstance(app, deps) {
    const textarea = deps.markdownEditor;
    const languageRegistry = deps.languageRegistry;
    const getActiveEditorPath = deps.getActiveEditorPath || function() { return ""; };
    const getLanguageOverride = deps.getLanguageOverride || function() { return null; };
    const onLanguageChange = deps.onLanguageChange || function() {};
    const openEditorFindReplace = deps.openEditorFindReplace;
    const goToEditorLinePrompt = deps.goToEditorLinePrompt;
    const openLspDefinitionTarget = deps.openLspDefinitionTarget;
    const getEditorQuickFixSuggestions = deps.getEditorQuickFixSuggestions;
    const openEditorQuickFix = deps.openEditorQuickFix;
    const getSnippetDefinitions = deps.getSnippetDefinitions || function() { return []; };
    const getLspSession = deps.getLspSession || function() { return null; };
    const aiAutocomplete = deps.aiAutocomplete || null;
    let wordWrapEnabled = deps.wordWrap === true;
    let documentWordAutocompleteEnabled = deps.documentWordAutocompleteEnabled === true;
    let languageAutocompleteEnabled = deps.languageAutocompleteEnabled === true;
    let languageServerAutocompleteEnabled = deps.languageServerAutocompleteEnabled === true;
    let snippetAutocompleteEnabled = deps.snippetAutocompleteEnabled === true;
    let showSymbolPreferences = deps.showSymbolPreferences || {};
    let unclosedBracketHighlightEnabled = deps.unclosedBracketHighlightEnabled === true;
    const CodeMirror = window.MarkdownViewerCodeMirror;

    if (!textarea || !textarea.parentElement) {
      throw new Error("Cannot create editable text tab: missing editor textarea host.");
    }
    if (!CodeMirror) {
      throw new Error("Cannot create editable text tab: CodeMirror 6 bundle is unavailable.");
    }

    let backingValue = textarea.value || "";
    let selectionStart = textarea.selectionStart || 0;
    let selectionEnd = textarea.selectionEnd || selectionStart;
    let syncingFromCodeMirror = false;
    let syncingToCodeMirror = false;
    let lastLanguageId = "";
    let lspSessionRequestId = 0;
    let activeLspDocumentContext = null;
    let lspActivationEnabled = deps.lspActivationEnabled !== false;
    let editorApi = null;
    let detachAiAutocomplete = null;
    let compatibilitySyncTimer = null;
    let largeDocumentCompatibilitySyncPending = false;

    const LARGE_DOCUMENT_LINE_THRESHOLD = 10000;
    const LARGE_DOCUMENT_CHARACTER_THRESHOLD = 250000;
    const LARGE_DOCUMENT_SYNC_DELAY_MS = 150;

    const host = document.createElement("div");
    host.className = "codemirror-editor";
    textarea.parentElement.insertBefore(host, textarea);
    textarea.parentElement.classList.add("codemirror-enabled");
    textarea.classList.add("markdown-editor-compat");
    textarea.setAttribute("aria-hidden", "true");
    textarea.tabIndex = -1;

    const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");

    function getNativeTextareaValue() {
      return valueDescriptor && valueDescriptor.get ? valueDescriptor.get.call(textarea) : backingValue;
    }

    function setNativeTextareaValue(value) {
      if (valueDescriptor && valueDescriptor.set) valueDescriptor.set.call(textarea, String(value || ""));
    }

    function getActiveLanguageInfo() {
      const overrideId = getLanguageOverride();
      const override = languageRegistry?.languages?.find?.(function(language) { return language.id === overrideId; });
      if (override) return override;
      const path = getActiveEditorPath();
      return languageRegistry?.resolveLanguageForPath(path, { content: backingValue }) || languageRegistry?.resolveLanguageForPath("document.md") || null;
    }

    function getActiveFormatterId() {
      const language = getActiveLanguageInfo();
      if (!language) return "";
      if (typeof CodeMirror.canFormatCode === "function" && CodeMirror.canFormatCode(language.id)) return language.id;
      return language.formatter || language.id || "";
    }

    function getCodeMirrorPositionAtMouseEvent(sourceEvent) {
      if (!(sourceEvent instanceof MouseEvent) || typeof codeMirror?.view?.posAtCoords !== "function") return null;
      try {
        const position = codeMirror.view.posAtCoords({ x: sourceEvent.clientX, y: sourceEvent.clientY });
        return typeof position === "number" ? position : null;
      } catch (error) {
        console.warn("CodeMirror position lookup failed.", error);
        return null;
      }
    }

    function dispatchTextareaEvent(type, sourceEvent) {
      const eventOptions = { bubbles: true, cancelable: true };
      let event;
      if (sourceEvent instanceof MouseEvent) {
        event = new MouseEvent(type, {
          ...eventOptions,
          clientX: sourceEvent.clientX,
          clientY: sourceEvent.clientY,
          screenX: sourceEvent.screenX,
          screenY: sourceEvent.screenY,
          button: sourceEvent.button,
          buttons: sourceEvent.buttons,
          ctrlKey: sourceEvent.ctrlKey,
          shiftKey: sourceEvent.shiftKey,
          altKey: sourceEvent.altKey,
          metaKey: sourceEvent.metaKey
        });
      } else if (sourceEvent instanceof KeyboardEvent) {
        event = new KeyboardEvent(type, {
          ...eventOptions,
          key: sourceEvent.key,
          code: sourceEvent.code,
          ctrlKey: sourceEvent.ctrlKey,
          shiftKey: sourceEvent.shiftKey,
          altKey: sourceEvent.altKey,
          metaKey: sourceEvent.metaKey
        });
      } else {
        event = new Event(type, eventOptions);
      }
      const position = getCodeMirrorPositionAtMouseEvent(sourceEvent);
      if (typeof position === "number") Object.defineProperty(event, "markdownViewerCodeMirrorOffset", { value: position });
      textarea.dispatchEvent(event);
      return event;
    }

    const codeMirror = CodeMirror.createEditor({
      parent: host,
      doc: backingValue,
      language: getActiveLanguageInfo()?.codeMirrorLanguage || "markdown",
      selectionMatchCaseSensitive: true,
      documentWordAutocompleteEnabled,
      languageAutocompleteEnabled,
      languageServerAutocompleteEnabled,
      snippetAutocompleteEnabled,
      snippetDefinitions: getSnippetDefinitions(getActiveLanguageInfo()?.codeMirrorLanguage || "markdown"),
      showSymbols: showSymbolPreferences,
      wordWrap: wordWrapEnabled,
      unclosedBracketHighlightEnabled,
      openLspDefinitionTarget,
      getEditorQuickFixSuggestions,
      openEditorQuickFix,
      onDebugBreakpointsRemapped: function(remaps) {
        if (syncingToCodeMirror) return;
        if (typeof deps.onDebugBreakpointsRemapped === "function") {
          deps.onDebugBreakpointsRemapped({ path: getActiveEditorPath(), remaps: remaps || [] });
        }
      },
      onUpdate: function(update) {
        if (syncingToCodeMirror) return;
        const selection = codeMirror.getSelection();
        selectionStart = selection.start;
        selectionEnd = selection.end;
        if (update.docChanged) {
          if (isLargeCodeMirrorDocument(update.state.doc)) {
            applyCodeMirrorChangesToBackingValue(update.changes);
            largeDocumentCompatibilitySyncPending = true;
            scheduleCompatibilitySync();
          }
          else flushCompatibilitySync();
        }
        if (update.selectionSet) {
          dispatchTextareaEvent("select");
          document.dispatchEvent(new Event("selectionchange"));
        }
        if (editorApi && aiAutocomplete?.handleEditorUpdate) {
          aiAutocomplete.handleEditorUpdate(editorApi, update);
        }
      }
    });

    function isLargeCodeMirrorDocument(doc) {
      return doc.lines > LARGE_DOCUMENT_LINE_THRESHOLD || doc.length > LARGE_DOCUMENT_CHARACTER_THRESHOLD;
    }

    function scheduleCompatibilitySync() {
      clearTimeout(compatibilitySyncTimer);
      compatibilitySyncTimer = setTimeout(flushCompatibilitySync, LARGE_DOCUMENT_SYNC_DELAY_MS);
    }

    function applyCodeMirrorChangesToBackingValue(changes) {
      const replacements = [];
      changes.iterChanges(function(fromA, toA, _fromB, _toB, inserted) {
        replacements.push({ from: fromA, to: toA, insert: inserted.toString() });
      });
      for (let index = replacements.length - 1; index >= 0; index -= 1) {
        const replacement = replacements[index];
        backingValue = backingValue.slice(0, replacement.from) + replacement.insert + backingValue.slice(replacement.to);
      }
    }

    function flushCompatibilitySync() {
      clearTimeout(compatibilitySyncTimer);
      compatibilitySyncTimer = null;
      if (largeDocumentCompatibilitySyncPending) {
        largeDocumentCompatibilitySyncPending = false;
        syncingFromCodeMirror = true;
        try {
          textarea.dispatchEvent(new CustomEvent("input", {
            bubbles: true,
            detail: { largeCodeMirrorDocument: true }
          }));
        } finally {
          syncingFromCodeMirror = false;
        }
        return true;
      }
      const currentValue = codeMirror.getValue();
      if (currentValue === backingValue) return false;
      syncingFromCodeMirror = true;
      backingValue = currentValue;
      setNativeTextareaValue(currentValue);
      try {
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      } finally {
        syncingFromCodeMirror = false;
      }
      return true;
    }

    function setLanguageForActivePath() {
      const language = getActiveLanguageInfo();
      const nextLanguageId = language?.codeMirrorLanguage || "text";
      host.dataset.language = language?.id || "text";
      onLanguageChange(language);
      if (nextLanguageId === lastLanguageId) {
        codeMirror.setSnippetDefinitions?.(getSnippetDefinitions(nextLanguageId));
        if (lspActivationEnabled) void refreshLspSessionForActivePath();
        return;
      }
      lastLanguageId = nextLanguageId;
      codeMirror.setLanguage(nextLanguageId);
      codeMirror.setSnippetDefinitions?.(getSnippetDefinitions(nextLanguageId));
      if (lspActivationEnabled) void refreshLspSessionForActivePath();
    }

    /** Enable LSP only after this editor has remained active long enough. */
    function setLspActivationEnabled(enabled) {
      const nextEnabled = enabled === true;
      if (lspActivationEnabled === nextEnabled && nextEnabled) return Promise.resolve(true);
      lspActivationEnabled = nextEnabled;
      if (nextEnabled) return refreshLspSessionForActivePath();
      lspSessionRequestId += 1;
      activeLspDocumentContext = null;
      codeMirror.setLspSession?.(null);
      return Promise.resolve(false);
    }

    async function refreshLspSessionForActivePath() {
      const requestId = ++lspSessionRequestId;
      const language = getActiveLanguageInfo();
      const path = getActiveEditorPath();
      try {
        const session = await getLspSession({
          path,
          language,
          codeMirrorLanguage: language?.codeMirrorLanguage || "text",
          content: backingValue,
          view: codeMirror.view
        });
        if (requestId !== lspSessionRequestId) return false;
        const didSetSession = typeof codeMirror.setLspSession === "function"
          ? await codeMirror.setLspSession(session)
          : false;
        activeLspDocumentContext = didSetSession && session ? {
          ...session,
          path,
          codeMirrorLanguage: language?.codeMirrorLanguage || "text",
          text: backingValue
        } : null;
        return didSetSession;
      } catch (error) {
        console.warn("Failed to configure CodeMirror LSP session:", error);
        if (requestId === lspSessionRequestId && typeof codeMirror.setLspSession === "function") {
          activeLspDocumentContext = null;
          codeMirror.setLspSession(null);
        }
        return false;
      }
    }

    async function formatActiveDocument() {
      const formatterId = getActiveFormatterId();
      if (!formatterId || typeof CodeMirror.formatCode !== "function" || typeof CodeMirror.canFormatCode !== "function" || !CodeMirror.canFormatCode(formatterId)) return false;
      const source = codeMirror.view.state.doc.toString();
      const formatted = await CodeMirror.formatCode(source, formatterId);
      if (codeMirror.view.state.doc.toString() !== source) {
        throw new Error("The document changed while formatting. Try Format File again.");
      }
      const currentSelection = codeMirror.getSelection();
      const caretPosition = Math.min(currentSelection.start, formatted.length);
      if (formatted === source) {
        codeMirror.setSelection(caretPosition, caretPosition);
        return true;
      }
      const transaction = {
        changes: { from: 0, to: source.length, insert: formatted },
        selection: {
          anchor: caretPosition,
          head: caretPosition
        },
        scrollIntoView: true
      };
      if (typeof CodeMirror.isolateHistory?.of === "function") {
        transaction.annotations = CodeMirror.isolateHistory.of("full");
      }
      codeMirror.view.focus();
      codeMirror.view.dispatch(transaction);
      return true;
    }

    function getSelectedLineOffsets() {
      const selection = codeMirror.view.state.selection.main;
      if (!selection || selection.empty || selection.to <= selection.from) return null;
      const document = codeMirror.view.state.doc;
      const startLine = document.lineAt(selection.from);
      const selectedEndLine = document.lineAt(selection.to);
      const endOffset = selectedEndLine.from === selection.to ? selection.to - 1 : selection.to;
      const endLine = document.lineAt(Math.max(selection.from, endOffset));
      return { from: startLine.from, to: endLine.to };
    }

    function canFormatSelectedLines() {
      return !!getSelectedLineOffsets() && canFormatActiveDocument();
    }

    async function formatSelectedLines() {
      const formatterId = getActiveFormatterId();
      const selectedLines = getSelectedLineOffsets();
      if (!formatterId || !selectedLines || typeof CodeMirror.formatCodeWithCursor !== "function" || !canFormatActiveDocument()) return false;

      const [startResult, endResult] = await Promise.all([
        CodeMirror.formatCodeWithCursor(backingValue, formatterId, selectedLines.from),
        CodeMirror.formatCodeWithCursor(backingValue, formatterId, selectedLines.to)
      ]);
      if (startResult?.formatted !== endResult?.formatted) {
        throw new Error("The formatter returned inconsistent selected-line results.");
      }
      const formattedDocument = String(startResult?.formatted || "");
      const formattedStart = Math.max(0, Number(startResult?.cursorOffset) || 0);
      const formattedEnd = Math.max(formattedStart, Number(endResult?.cursorOffset) || formattedStart);
      const replacement = formattedDocument.slice(formattedStart, formattedEnd);
      if (replacement === backingValue.slice(selectedLines.from, selectedLines.to)) return true;

      const transaction = {
        changes: { from: selectedLines.from, to: selectedLines.to, insert: replacement },
        selection: {
          anchor: selectedLines.from,
          head: selectedLines.from + replacement.length
        },
        scrollIntoView: true
      };
      if (typeof CodeMirror.isolateHistory?.of === "function") {
        transaction.annotations = CodeMirror.isolateHistory.of("full");
      }
      codeMirror.view.focus();
      codeMirror.view.dispatch(transaction);
      return true;
    }

    function canFormatActiveDocument() {
      const formatterId = getActiveFormatterId();
      return !!(formatterId && typeof CodeMirror.canFormatCode === "function" && CodeMirror.canFormatCode(formatterId));
    }

    function collapseTopLevelFolds() {
      return typeof CodeMirror.collapseTopLevelFolds === "function"
        ? CodeMirror.collapseTopLevelFolds(codeMirror.view)
        : false;
    }

    function expandTopLevelFolds() {
      return typeof CodeMirror.expandTopLevelFolds === "function"
        ? CodeMirror.expandTopLevelFolds(codeMirror.view)
        : false;
    }

    function undoEditorChange() {
      return typeof CodeMirror.undo === "function" ? CodeMirror.undo(codeMirror.view) : false;
    }

    function redoEditorChange() {
      return typeof CodeMirror.redo === "function" ? CodeMirror.redo(codeMirror.view) : false;
    }

    function indentMoreEditorSelection() {
      return typeof CodeMirror.indentMore === "function" ? CodeMirror.indentMore(codeMirror.view) : false;
    }

    function indentLessEditorSelection() {
      return typeof CodeMirror.indentLess === "function" ? CodeMirror.indentLess(codeMirror.view) : false;
    }

    function correctEditorIndentation() {
      return typeof CodeMirror.indentSelection === "function" ? CodeMirror.indentSelection(codeMirror.view) : false;
    }

    function getEditorCommentCapabilities() {
      const selectionPosition = codeMirror.view.state.selection.main.head;
      const languageData = codeMirror.view.state.languageDataAt("commentTokens", selectionPosition, 1);
      const commentTokens = languageData.length ? languageData[0] : null;
      const canToggleBlockComment = !!(commentTokens?.block?.open && commentTokens?.block?.close);
      return {
        canToggleComment: !!commentTokens?.line || canToggleBlockComment,
        canToggleBlockComment
      };
    }

    function toggleEditorComment() {
      return typeof CodeMirror.toggleComment === "function" ? CodeMirror.toggleComment(codeMirror.view) : false;
    }

    function toggleEditorBlockComment() {
      return typeof CodeMirror.toggleBlockComment === "function" ? CodeMirror.toggleBlockComment(codeMirror.view) : false;
    }

    function selectAllEditorText() {
      return typeof CodeMirror.selectAll === "function" ? CodeMirror.selectAll(codeMirror.view) : false;
    }

    function startEditorCompletion() {
      return typeof CodeMirror.startCompletion === "function" ? CodeMirror.startCompletion(codeMirror.view) : false;
    }

    function getDocumentSymbols() {
      return typeof codeMirror.getDocumentSymbols === "function" ? codeMirror.getDocumentSymbols() : Promise.resolve([]);
    }

    function getSyntaxTree() {
      return typeof codeMirror.getSyntaxTree === "function" ? codeMirror.getSyntaxTree() : null;
    }

    function moveSelectionToContextMenuPosition(event) {
      const position = getCodeMirrorPositionAtMouseEvent(event);
      if (typeof position !== "number") return;
      const range = codeMirror.view.state.selection.main;
      const selectionStart = Math.min(range.anchor, range.head);
      const selectionEnd = Math.max(range.anchor, range.head);
      if (selectionStart !== selectionEnd && position >= selectionStart && position <= selectionEnd) return;
      codeMirror.setSelection(position, position);
    }

    function setSelectionMatchCaseSensitive(matchCase) {
      if (typeof codeMirror.setSelectionMatchCaseSensitive === "function") {
        codeMirror.setSelectionMatchCaseSensitive(matchCase !== false);
      }
    }

    function setWordWrap(enabled) {
      wordWrapEnabled = enabled === true;
      if (typeof codeMirror.setWordWrap === "function") {
        codeMirror.setWordWrap(wordWrapEnabled);
      }
    }

    function setShowSymbolPreferences(preferences) {
      showSymbolPreferences = preferences || {};
      if (typeof codeMirror.setShowSymbols === "function") {
        codeMirror.setShowSymbols(showSymbolPreferences);
      }
    }

    function setUnclosedBracketHighlightEnabled(enabled) {
      unclosedBracketHighlightEnabled = enabled === true;
      if (typeof codeMirror.setUnclosedBracketHighlightEnabled === "function") {
        codeMirror.setUnclosedBracketHighlightEnabled(unclosedBracketHighlightEnabled);
      }
    }

    function isUnclosedBracketHighlightEnabled() {
      return unclosedBracketHighlightEnabled;
    }

    function isWordWrapEnabled() {
      return typeof codeMirror.isWordWrapEnabled === "function"
        ? codeMirror.isWordWrapEnabled()
        : wordWrapEnabled;
    }

    function setDocumentWordAutocomplete(enabled) {
      documentWordAutocompleteEnabled = enabled === true;
      if (typeof codeMirror.setDocumentWordAutocomplete === "function") {
        codeMirror.setDocumentWordAutocomplete(documentWordAutocompleteEnabled);
      }
    }

    function isDocumentWordAutocompleteEnabled() {
      return typeof codeMirror.isDocumentWordAutocompleteEnabled === "function"
        ? codeMirror.isDocumentWordAutocompleteEnabled()
        : documentWordAutocompleteEnabled;
    }

    function setAutocompletePreferences(preferences) {
      const nextPreferences = preferences || {};
      documentWordAutocompleteEnabled = nextPreferences.documentWords === true;
      languageAutocompleteEnabled = nextPreferences.language === true;
      languageServerAutocompleteEnabled = nextPreferences.languageServer === true;
      snippetAutocompleteEnabled = nextPreferences.snippets === true;
      if (typeof codeMirror.setAutocompletePreferences === "function") {
        codeMirror.setAutocompletePreferences({
          documentWords: documentWordAutocompleteEnabled,
          language: languageAutocompleteEnabled,
          languageServer: languageServerAutocompleteEnabled,
          snippets: snippetAutocompleteEnabled
        });
      }
    }

    function setLanguageAutocomplete(enabled) {
      languageAutocompleteEnabled = enabled === true;
      if (typeof codeMirror.setLanguageAutocomplete === "function") {
        codeMirror.setLanguageAutocomplete(languageAutocompleteEnabled);
      }
    }

    function isLanguageAutocompleteEnabled() {
      return typeof codeMirror.isLanguageAutocompleteEnabled === "function"
        ? codeMirror.isLanguageAutocompleteEnabled()
        : languageAutocompleteEnabled;
    }

    function setLanguageServerAutocomplete(enabled) {
      languageServerAutocompleteEnabled = enabled === true;
      if (typeof codeMirror.setLanguageServerAutocomplete === "function") {
        codeMirror.setLanguageServerAutocomplete(languageServerAutocompleteEnabled);
      }
    }

    function isLanguageServerAutocompleteEnabled() {
      return typeof codeMirror.isLanguageServerAutocompleteEnabled === "function"
        ? codeMirror.isLanguageServerAutocompleteEnabled()
        : languageServerAutocompleteEnabled;
    }

    function setSnippetAutocomplete(enabled) {
      snippetAutocompleteEnabled = enabled === true;
      if (typeof codeMirror.setSnippetAutocomplete === "function") {
        codeMirror.setSnippetAutocomplete(snippetAutocompleteEnabled);
      }
    }

    function isSnippetAutocompleteEnabled() {
      return typeof codeMirror.isSnippetAutocompleteEnabled === "function"
        ? codeMirror.isSnippetAutocompleteEnabled()
        : snippetAutocompleteEnabled;
    }

    function refreshSnippetDefinitions() {
      const language = getActiveLanguageInfo();
      const languageId = language?.codeMirrorLanguage || "markdown";
      codeMirror.setSnippetDefinitions?.(getSnippetDefinitions(languageId));
    }

    function setBookmarkedLines(lineNumbers) {
      return typeof codeMirror.setBookmarkedLines === "function"
        ? codeMirror.setBookmarkedLines(lineNumbers)
        : false;
    }

    function clearBookmarkedLines() {
      return typeof codeMirror.clearBookmarkedLines === "function"
        ? codeMirror.clearBookmarkedLines()
        : false;
    }

    function setDebugBreakpoints(breakpoints) {
      return typeof codeMirror.setDebugBreakpoints === "function"
        ? codeMirror.setDebugBreakpoints(breakpoints)
        : false;
    }

    function clearDebugBreakpoints() {
      return typeof codeMirror.clearDebugBreakpoints === "function"
        ? codeMirror.clearDebugBreakpoints()
        : false;
    }

    function setDebugExecutionLine(lineNumber) {
      return typeof codeMirror.setDebugExecutionLine === "function"
        ? codeMirror.setDebugExecutionLine(lineNumber)
        : false;
    }

    function clearDebugExecutionLine() {
      return typeof codeMirror.clearDebugExecutionLine === "function"
        ? codeMirror.clearDebugExecutionLine()
        : false;
    }

    function setDebugBreakpointHandler(handler) {
      return typeof codeMirror.setDebugBreakpointHandler === "function"
        ? codeMirror.setDebugBreakpointHandler(handler)
        : false;
    }

    function setAiGhostSuggestion(suggestion) {
      return typeof codeMirror.setAiGhostSuggestion === "function"
        ? codeMirror.setAiGhostSuggestion(suggestion)
        : false;
    }

    function clearAiGhostSuggestion() {
      return typeof codeMirror.clearAiGhostSuggestion === "function"
        ? codeMirror.clearAiGhostSuggestion()
        : false;
    }

    function getLspDocumentContext() {
      if (!activeLspDocumentContext) return null;
      return {
        ...activeLspDocumentContext,
        text: backingValue
      };
    }

    function lspPositionToOffset(position) {
      const doc = codeMirror.view.state.doc;
      const lineNumber = Math.max(1, Math.min((Number(position?.line) || 0) + 1, doc.lines));
      const line = doc.line(lineNumber);
      const character = Math.max(0, Number(position?.character) || 0);
      return Math.max(line.from, Math.min(line.from + character, line.to));
    }

    function applyLspTextEdits(edits) {
      const changes = (Array.isArray(edits) ? edits : [])
        .map(function(edit) {
          const range = edit?.range || null;
          if (!range) return null;
          const from = lspPositionToOffset(range.start);
          const to = lspPositionToOffset(range.end);
          return {
            from: Math.min(from, to),
            to: Math.max(from, to),
            insert: String(edit.newText ?? "").replace(/\r\n?/g, "\n")
          };
        })
        .filter(Boolean)
        .sort(function(left, right) { return left.from - right.from || left.to - right.to; });
      if (!changes.length) return false;
      const transaction = {
        changes,
        scrollIntoView: true
      };
      if (typeof CodeMirror.isolateHistory?.of === "function") {
        transaction.annotations = CodeMirror.isolateHistory.of("full");
      }
      codeMirror.view.focus();
      codeMirror.view.dispatch(transaction);
      return true;
    }

    function replaceRange(start, end, replacement) {
      const length = codeMirror.view.state.doc.length;
      const from = Math.max(0, Math.min(Number(start) || 0, length));
      const to = Math.max(from, Math.min(Number(end) || from, length));
      const insert = String(replacement || "").replace(/\r\n?/g, "\n");
      const transaction = {
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
        scrollIntoView: true
      };
      if (typeof CodeMirror.isolateHistory?.of === "function") {
        transaction.annotations = CodeMirror.isolateHistory.of("full");
      }
      codeMirror.view.focus();
      codeMirror.view.dispatch(transaction);
      return true;
    }

    function setCodeMirrorValue(value) {
      clearTimeout(compatibilitySyncTimer);
      compatibilitySyncTimer = null;
      largeDocumentCompatibilitySyncPending = false;
      const nextValue = String(value || "");
      backingValue = nextValue;
      setNativeTextareaValue(nextValue);
      if (syncingFromCodeMirror) return;
      syncingToCodeMirror = true;
      try {
        codeMirror.setValue(nextValue);
      } finally {
        syncingToCodeMirror = false;
      }
      const selection = codeMirror.getSelection();
      selectionStart = selection.start;
      selectionEnd = selection.end;
      setLanguageForActivePath();
    }

    function setTextareaSelectionRange(start, end) {
      const length = codeMirror.view.state.doc.length;
      const nextStart = Math.max(0, Math.min(Number(start) || 0, length));
      const nextEnd = Math.max(nextStart, Math.min(Number(end) || nextStart, length));
      selectionStart = nextStart;
      selectionEnd = nextEnd;
      codeMirror.setSelection(nextStart, nextEnd);
    }

    Object.defineProperty(textarea, "value", {
      configurable: true,
      get: function() {
        flushCompatibilitySync();
        return backingValue;
      },
      set: function(value) {
        if (valueDescriptor && valueDescriptor.set) valueDescriptor.set.call(textarea, String(value || ""));
        setCodeMirrorValue(value);
      }
    });

    textarea.addEventListener("input", function() {
      if (syncingFromCodeMirror) return;
      const nativeValue = getNativeTextareaValue();
      if (nativeValue !== backingValue) setCodeMirrorValue(nativeValue);
    });

    Object.defineProperty(textarea, "selectionStart", {
      configurable: true,
      get: function() {
        return selectionStart;
      },
      set: function(value) {
        setTextareaSelectionRange(value, selectionEnd);
      }
    });

    Object.defineProperty(textarea, "selectionEnd", {
      configurable: true,
      get: function() {
        return selectionEnd;
      },
      set: function(value) {
        setTextareaSelectionRange(selectionStart, value);
      }
    });

    textarea.setSelectionRange = function(start, end) {
      setTextareaSelectionRange(start, end);
    };

    Object.defineProperty(textarea, "scrollTop", {
      configurable: true,
      get: function() {
        return codeMirror.view.scrollDOM.scrollTop;
      },
      set: function(value) {
        codeMirror.view.scrollDOM.scrollTop = Number(value) || 0;
      }
    });

    Object.defineProperty(textarea, "scrollLeft", {
      configurable: true,
      get: function() {
        return codeMirror.view.scrollDOM.scrollLeft;
      },
      set: function(value) {
        codeMirror.view.scrollDOM.scrollLeft = Number(value) || 0;
      }
    });

    textarea.focus = function() {
      codeMirror.view.focus();
    };

    textarea.getBoundingClientRect = function() {
      return host.getBoundingClientRect();
    };

    ["clientWidth", "clientHeight", "offsetWidth", "offsetHeight", "scrollHeight", "scrollWidth"].forEach(function(property) {
      Object.defineProperty(textarea, property, {
        configurable: true,
        get: function() {
          return codeMirror.view.scrollDOM[property] || host[property] || 0;
        }
      });
    });

    codeMirror.view.dom.addEventListener("contextmenu", function(event) {
      moveSelectionToContextMenuPosition(event);
      const forwarded = dispatchTextareaEvent("contextmenu", event);
      if (forwarded.defaultPrevented) event.preventDefault();
    });
    codeMirror.view.dom.addEventListener("keydown", function(event) {
      const key = String(event.key || "").toLowerCase();
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.code === "Slash") {
        event.preventDefault();
        event.stopPropagation();
        toggleEditorBlockComment();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.code === "Slash") {
        event.preventDefault();
        event.stopPropagation();
        toggleEditorComment();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && key === "f" && typeof openEditorFindReplace === "function") {
        event.preventDefault();
        event.stopPropagation();
        openEditorFindReplace({ replace: false });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && key === "h" && typeof openEditorFindReplace === "function") {
        event.preventDefault();
        event.stopPropagation();
        openEditorFindReplace({ replace: true, focusReplace: true });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && key === "g" && typeof goToEditorLinePrompt === "function") {
        event.preventDefault();
        event.stopPropagation();
        goToEditorLinePrompt();
      }
    }, true);
    // Tab-to-close-nearest-unmatched-bracket. Deliberately a no-op (doesn't call
    // preventDefault/stopPropagation) unless it actually closes something, so every other
    // existing Tab behavior — indenting, accepting a completion-dropdown entry, accepting an
    // AI ghost suggestion — keeps working exactly as before. Two DOM checks yield to the
    // higher-priority behaviors: a visible completion tooltip (CM6's own Tab-accept should
    // win) and a visible AI ghost suggestion (its own Tab-accept handler should win).
    codeMirror.view.dom.addEventListener("keydown", function(event) {
      if (event.key !== "Tab" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!unclosedBracketHighlightEnabled) return;
      if (document.querySelector(".cm-tooltip-autocomplete")) return;
      if (codeMirror.view.dom.querySelector(".cm-aiGhostInline, .cm-aiGhostBlock")) return;
      const handled = typeof codeMirror.fixNearestUnclosedBracket === "function" && codeMirror.fixNearestUnclosedBracket();
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
    codeMirror.view.dom.addEventListener("focusin", function() {
      dispatchTextareaEvent("focus");
    });
    codeMirror.view.dom.addEventListener("focusout", function() {
      dispatchTextareaEvent("blur");
    });
    codeMirror.view.dom.addEventListener("click", function(event) {
      dispatchTextareaEvent("click", event);
    });
    codeMirror.view.dom.addEventListener("keyup", function(event) {
      dispatchTextareaEvent("keyup", event);
    });
    codeMirror.view.dom.addEventListener("mousemove", function(event) {
      dispatchTextareaEvent("mousemove", event);
    });
    codeMirror.view.dom.addEventListener("mouseleave", function(event) {
      dispatchTextareaEvent("mouseleave", event);
    });
    codeMirror.view.scrollDOM.addEventListener("scroll", function() {
      textarea.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    setLanguageForActivePath();

    const api = {
      isEnabled: function() { return true; },
      isFocused: function() { return codeMirror.view.hasFocus; },
      canFormatActiveDocument,
      canFormatSelectedLines,
      collapseTopLevelFolds,
      expandTopLevelFolds,
      getDocumentSymbols,
      getSyntaxTree,
      getActiveLanguage: getActiveLanguageInfo,
      formatActiveDocument,
      formatSelectedLines,
      getLspDocumentContext,
      indentLess: indentLessEditorSelection,
      indentMore: indentMoreEditorSelection,
      correctIndentation: correctEditorIndentation,
      replaceRange,
      applyLspTextEdits,
      redo: redoEditorChange,
      setLanguageForActivePath,
      refreshLspSessionForActivePath,
      setLspActivationEnabled,
      setBookmarkedLines,
      clearBookmarkedLines,
      setDebugBreakpoints,
      clearDebugBreakpoints,
      setDebugExecutionLine,
      clearDebugExecutionLine,
      setDebugBreakpointHandler,
      setAiGhostSuggestion,
      clearAiGhostSuggestion,
      setAutocompletePreferences,
      setSelectionMatchCaseSensitive,
      setShowSymbolPreferences,
      setUnclosedBracketHighlightEnabled,
      isUnclosedBracketHighlightEnabled,
      setWordWrap,
      setDocumentWordAutocomplete,
      setLanguageAutocomplete,
      setLanguageServerAutocomplete,
      setSnippetAutocomplete,
      refreshSnippetDefinitions,
      isDocumentWordAutocompleteEnabled,
      isLanguageAutocompleteEnabled,
      isLanguageServerAutocompleteEnabled,
      isSnippetAutocompleteEnabled,
      isWordWrapEnabled,
      selectAll: selectAllEditorText,
      startCompletion: startEditorCompletion,
      syncFromTextarea: function() { setCodeMirrorValue(textarea.value); },
      flushPendingSync: flushCompatibilitySync,
      getCommentCapabilities: getEditorCommentCapabilities,
      toggleComment: toggleEditorComment,
      toggleBlockComment: toggleEditorBlockComment,
      getView: function() { return codeMirror.view; },
      undo: undoEditorChange,
      destroy: function() {
        flushCompatibilitySync();
        void setLspActivationEnabled(false);
        if (typeof detachAiAutocomplete === "function") detachAiAutocomplete();
        try {
          codeMirror.destroy?.();
        } catch (error) {
          console.warn("Failed to destroy CodeMirror editor:", error);
        }
        host.remove();
      }
    };

    editorApi = api;
    if (aiAutocomplete?.attachEditor) {
      detachAiAutocomplete = aiAutocomplete.attachEditor(api);
    }

    if (deps.registerModule !== false) app.registerModule("codeMirrorEditor", api);
    return api;
  }

  function registerMarkdownViewerCodeMirrorEditor(app, deps) {
    return createMarkdownViewerCodeMirrorEditorInstance(app, deps || {});
  }

  window.createMarkdownViewerCodeMirrorEditorInstance = createMarkdownViewerCodeMirrorEditorInstance;
  window.registerMarkdownViewerCodeMirrorEditor = registerMarkdownViewerCodeMirrorEditor;
})(window, document);
