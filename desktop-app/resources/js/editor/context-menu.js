(function(window, document) {
  "use strict";

  function registerMarkdownViewerEditorContextMenu(app, deps) {
    const fallbackMarkdownEditor = deps.markdownEditor;
    const activeEditorCommands = deps.activeEditorCommands || null;
    const escapeHtml = deps.escapeHtml;
    const getActiveTabId = deps.getActiveTabId;
    const getEditorInputEventCount = deps.getEditorInputEventCount;
    const hideLinkAutocomplete = deps.hideLinkAutocomplete;
    const openEditorEmojiModal = deps.openEditorEmojiModal;
    const updateEditorLineNumbers = deps.updateEditorLineNumbers;
    const updateEditorSelectionHighlights = deps.updateEditorSelectionHighlights;
    const updateStatusLine = deps.updateStatusLine;
    const getCodeMirrorEditor = deps.getCodeMirrorEditor || function() { return deps.codeMirrorEditor || null; };
    const getActiveTab = deps.getActiveTab || function() { return null; };
    const getSourceActions = deps.getSourceActions || function() { return app.modules?.sourceActions || null; };
    const getUnicodeConverter = deps.getUnicodeConverter || function() { return app.modules?.unicodeConverter || null; };
    const getBase64Converter = deps.getBase64Converter || function() { return app.modules?.base64Converter || null; };
    const getXmlSchemaGenerator = deps.getXmlSchemaGenerator || function() { return app.modules?.xmlSchemaGenerator || null; };
    const getXmlStubGenerator = deps.getXmlStubGenerator || function() { return app.modules?.xmlStubGenerator || null; };
    const getXmlValidation = deps.getXmlValidation || function() { return app.modules?.xmlValidation || null; };
    const getXmlSchemaAutocomplete = deps.getXmlSchemaAutocomplete || function() { return app.modules?.xmlSchemaAutocomplete || null; };
    const getXmlTreeGridView = deps.getXmlTreeGridView || function() { return app.modules?.xmlTreeGridView || null; };
    const openXsltToolInTab = deps.openXsltToolInTab || null;
    const openXmlAwareCompareForActiveEditor = deps.openXmlAwareCompareForActiveEditor || null;
    const getLessToCssConverter = deps.getLessToCssConverter || function() { return app.modules?.lessToCssConverter || null; };
    const openGeneratedXmlSchemaInTab = deps.openGeneratedXmlSchemaInTab || null;
    const openGeneratedXmlStubInTab = deps.openGeneratedXmlStubInTab || null;
    const openGeneratedCssInTab = deps.openGeneratedCssInTab || null;
    const isMarkdownPath = deps.isMarkdownPath || function(path) { return /\.(md|markdown)$/i.test(path || ""); };
    const isUnsupportedFileTab = deps.isUnsupportedFileTab || function() { return false; };

    let editorContextMenu = null;
    let editorContextMenuSelection = null;
    let editorContextMenuRenderToken = 0;
    let editorSelectionMatchCaseSensitive = true;
    const editorContextMenuUndoStack = [];
    const editorContextMenuRedoStack = [];
    const editorContextMenuUndoStackLimit = 50;

    function getMarkdownEditor() {
      return activeEditorCommands?.getActiveEditor?.() || deps.getActiveMarkdownEditor?.() || fallbackMarkdownEditor;
    }

    function getEditorValue() {
      return activeEditorCommands?.getActiveEditorValue?.() ?? getMarkdownEditor()?.value ?? "";
    }

    function getEditorSelection() {
      return activeEditorCommands?.getActiveEditorSelection?.() || {
        start: Math.min(getMarkdownEditor()?.selectionStart || 0, getMarkdownEditor()?.selectionEnd || 0),
        end: Math.max(getMarkdownEditor()?.selectionStart || 0, getMarkdownEditor()?.selectionEnd || 0)
      };
    }

    function focusEditor() {
      activeEditorCommands?.focusActiveEditor?.() || getMarkdownEditor()?.focus?.();
    }

    function setEditorSelection(start, end) {
      if (activeEditorCommands?.setActiveEditorSelection) {
        activeEditorCommands.setActiveEditorSelection(start, end);
      } else {
        const markdownEditor = getMarkdownEditor();
        if (markdownEditor) {
          markdownEditor.selectionStart = start;
          markdownEditor.selectionEnd = end;
        }
      }
    }

    function dispatchEditorInput() {
      activeEditorCommands?.dispatchActiveEditorInput?.() || getMarkdownEditor()?.dispatchEvent?.(new Event("input"));
    }

    const editorMarkdownActions = [
      { type: "heading-1", label: "Heading 1", icon: "bi-type-h1" },
      { type: "heading-2", label: "Heading 2", icon: "bi-type-h2" },
      { type: "heading-3", label: "Heading 3", icon: "bi-type-h3" },
      { type: "heading-4", label: "Heading 4", icon: "bi-type-h4" },
      { type: "heading-5", label: "Heading 5", icon: "bi-type-h5" },
      { type: "heading-6", label: "Heading 6", icon: "bi-type-h6" },
      { type: "fenced-code", label: "Fenced code", icon: "bi-code-square" },
      { type: "inline-code", label: "Inline code", icon: "bi-code" },
      { type: "link", label: "Link", icon: "bi-link-45deg" },
      { type: "url", label: "URL", icon: "bi-globe" },
      { type: "emphasis", label: "Emphasis", icon: "bi-type-italic" },
      { type: "strikethrough", label: "Strikethrough", icon: "bi-type-strikethrough" },
      { type: "title-case", label: "Title case", icon: "bi-type" },
      { type: "uppercase", label: "Uppercase", icon: "bi-alphabet-uppercase" },
      { type: "lowercase", label: "Lowercase", icon: "bi-alphabet" },
      { type: "strong", label: "Strong emphasis", icon: "bi-type-bold" },
      { type: "blockquote", label: "Blockquote", icon: "bi-blockquote-left" },
      { type: "unordered-list", label: "Bulleted list", icon: "bi-list-ul" },
      { type: "ordered-list", label: "Numbered list", icon: "bi-list-ol" },
      { type: "task-list", label: "Task items", icon: "bi-check2-square" },
      { type: "horizontal-rule", label: "Horizontal rule", icon: "bi-hr" },
      { type: "table", label: "Table", icon: "bi-table" }
    ];

    function rememberEditorContextMenuConversion(undoState) {
      editorContextMenuUndoStack.push(undoState);
      editorContextMenuRedoStack.length = 0;
      if (editorContextMenuUndoStack.length > editorContextMenuUndoStackLimit) {
        editorContextMenuUndoStack.shift();
      }
    }

    function applyEditorContextMenuHistoryState(value, selectionStart, selectionEnd) {
      if (activeEditorCommands?.setActiveEditorValue) activeEditorCommands.setActiveEditorValue(value);
      else {
        const markdownEditor = getMarkdownEditor();
        if (markdownEditor) markdownEditor.value = value;
      }
      setEditorSelection(selectionStart, selectionEnd);
      focusEditor();
      dispatchEditorInput();
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
      hideEditorContextMenu();
    }

    function undoEditorContextMenuConversion() {
      const undoState = editorContextMenuUndoStack[editorContextMenuUndoStack.length - 1];
      if (!undoState) return false;
      if (undoState.tabId !== getActiveTabId() || getEditorValue() !== undoState.afterValue) return false;

      editorContextMenuUndoStack.pop();
      editorContextMenuRedoStack.push(undoState);
      applyEditorContextMenuHistoryState(undoState.beforeValue, undoState.selectionStart, undoState.selectionEnd);
      return true;
    }

    function redoEditorContextMenuConversion() {
      const redoState = editorContextMenuRedoStack[editorContextMenuRedoStack.length - 1];
      if (!redoState) return false;
      if (redoState.tabId !== getActiveTabId() || getEditorValue() !== redoState.beforeValue) return false;

      editorContextMenuRedoStack.pop();
      editorContextMenuUndoStack.push(redoState);
      applyEditorContextMenuHistoryState(redoState.afterValue, redoState.replacementStart, redoState.replacementEnd);
      return true;
    }

    function replaceEditorSelectionPreservingUndo(start, end, replacement) {
      const markdownEditor = getMarkdownEditor();
      const value = getEditorValue();
      const valueLength = value.length;
      const selectionStart = Math.max(0, Math.min(Number(start) || 0, valueLength));
      const selectionEnd = Math.max(selectionStart, Math.min(Number(end) || selectionStart, valueLength));
      const nextValue = value.slice(0, selectionStart) + replacement + value.slice(selectionEnd);
      const replacementEnd = selectionStart + replacement.length;
      const codeMirrorEditor = getCodeMirrorEditor();

      focusEditor();
      setEditorSelection(selectionStart, selectionEnd);

      if (typeof codeMirrorEditor?.replaceRange === "function" && codeMirrorEditor.replaceRange(selectionStart, selectionEnd, replacement)) {
        return true;
      }

      if (document.queryCommandSupported && document.queryCommandSupported("insertText")) {
        const inputCount = getEditorInputEventCount();
        const inserted = document.execCommand("insertText", false, replacement);
        if (inserted && markdownEditor.value === nextValue) {
          markdownEditor.selectionStart = selectionStart;
          markdownEditor.selectionEnd = replacementEnd;
          if (getEditorInputEventCount() === inputCount) {
            markdownEditor.dispatchEvent(new Event("input"));
          }
          return true;
        }
      }

      if (activeEditorCommands?.setActiveEditorValue) activeEditorCommands.setActiveEditorValue(nextValue);
      else markdownEditor.value = nextValue;
      setEditorSelection(selectionStart, replacementEnd);
      rememberEditorContextMenuConversion({
        tabId: getActiveTabId(),
        beforeValue: value,
        afterValue: nextValue,
        selectionStart,
        selectionEnd,
        replacementStart: selectionStart,
        replacementEnd
      });
      dispatchEditorInput();
      return false;
    }

    function getEditorContextMenu() {
      if (!editorContextMenu) {
        editorContextMenu = document.createElement("div");
        editorContextMenu.id = "editor-context-menu";
        editorContextMenu.className = "editor-context-menu hidden";
        editorContextMenu.setAttribute("role", "menu");
        editorContextMenu.setAttribute("aria-label", "Convert selected Markdown text");
        document.body.appendChild(editorContextMenu);
      }
      return editorContextMenu;
    }

    function hideEditorContextMenu() {
      editorContextMenuRenderToken += 1;
      if (editorContextMenu) {
        editorContextMenu.classList.add("hidden");
      }
    }

    function positionEditorContextMenu(menu, clientX, clientY) {
      menu.style.left = "0px";
      menu.style.top = "0px";
      menu.classList.remove("hidden");

      const menuRect = menu.getBoundingClientRect();
      const margin = 8;
      const left = Math.min(Math.max(clientX, margin), window.innerWidth - menuRect.width - margin);
      const top = Math.min(Math.max(clientY, margin), window.innerHeight - menuRect.height - margin);

      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      positionEditorContextSubmenus(menu);
    }

    /** Keep rendered editor submenus inside the visible application viewport. */
    function positionEditorContextSubmenus(menu) {
      const margin = 8;
      const submenus = Array.from(menu.querySelectorAll(".editor-context-menu-submenu"));
      submenus.forEach(function(submenu) {
        const panel = submenu.querySelector(":scope > .editor-context-menu-submenu-panel");
        if (!panel) return;
        panel.style.visibility = "hidden";
        panel.style.pointerEvents = "none";
        panel.style.display = "grid";
        panel.style.left = "100%";
        panel.style.right = "auto";
        panel.style.top = "0px";
      });

      submenus.forEach(function(submenu) {
        const panel = submenu.querySelector(":scope > .editor-context-menu-submenu-panel");
        if (!panel) return;
        const isNestedPanel = !!submenu.parentElement?.closest(".editor-context-menu-submenu-panel");
        const submenuRect = submenu.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const availableRight = window.innerWidth - submenuRect.right - margin;
        const availableLeft = submenuRect.left - margin;
        const opensRight = availableRight >= panelRect.width || availableRight >= availableLeft;
        const desiredLeft = opensRight ? submenuRect.right : submenuRect.left - panelRect.width;
        const viewportLeft = Math.min(
          Math.max(desiredLeft, margin),
          Math.max(margin, window.innerWidth - panelRect.width - margin)
        );
        const viewportTop = Math.min(
          Math.max(submenuRect.top, margin),
          Math.max(margin, window.innerHeight - panelRect.height - margin)
        );

        panel.style.left = `${isNestedPanel ? viewportLeft : viewportLeft - submenuRect.left}px`;
        panel.style.top = `${isNestedPanel ? viewportTop : viewportTop - submenuRect.top}px`;
        submenu.classList.toggle("editor-context-menu-submenu-open-left", !opensRight);
      });

      submenus.forEach(function(submenu) {
        const panel = submenu.querySelector(":scope > .editor-context-menu-submenu-panel");
        if (!panel) return;
        panel.style.removeProperty("display");
        panel.style.removeProperty("visibility");
        panel.style.removeProperty("pointer-events");
      });
    }

    function convertLines(text, callback) {
      return text.split("\n").map(callback).join("\n");
    }

    function toggleLinePrefix(text, prefix) {
      return convertLines(text, function(line) {
        return line.trim() ? `${prefix}${line}` : line;
      });
    }

    function splitTableRow(line) {
      const trimmedLine = line.trim();
      if (trimmedLine.includes("|")) {
        return trimmedLine.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
      }
      if (trimmedLine.includes("\t")) {
        return trimmedLine.split("\t").map((cell) => cell.trim());
      }
      if (trimmedLine.includes(",")) {
        return trimmedLine.split(",").map((cell) => cell.trim());
      }
      return [trimmedLine];
    }

    function convertSelectionToMarkdownTable(text) {
      const rows = text.split("\n").filter((line) => line.trim()).map(splitTableRow);
      const columnCount = Math.max(1, ...rows.map((row) => row.length));
      const normalizedRows = rows.length ? rows.map((row) => {
        return Array.from({ length: columnCount }, (_, index) => row[index] || "");
      }) : [Array.from({ length: columnCount }, () => "")];
      const header = normalizedRows[0];
      const bodyRows = normalizedRows.slice(1);
      const separator = Array.from({ length: columnCount }, () => "---");
      const tableRows = [header, separator, ...bodyRows];

      return tableRows.map((row) => `| ${row.join(" | ")} |`).join("\n");
    }

    function convertSelectionToTitleCase(text) {
      return text.toLowerCase().replace(/\p{L}[\p{L}\p{N}'-]*/gu, function(word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      });
    }

    function convertSelectionToMarkdown(type, selectedText) {
      const text = selectedText || "";
      const trimmed = text.trim();

      switch (type) {
        case "heading-1":
          return toggleLinePrefix(text, "# ");
        case "heading-2":
          return toggleLinePrefix(text, "## ");
        case "heading-3":
          return toggleLinePrefix(text, "### ");
        case "heading-4":
          return toggleLinePrefix(text, "#### ");
        case "heading-5":
          return toggleLinePrefix(text, "##### ");
        case "heading-6":
          return toggleLinePrefix(text, "###### ");
        case "fenced-code":
          return `\`\`\`\n${text}\n\`\`\``;
        case "inline-code":
          return `\`${text.replace(/`/g, "\\`")}\``;
        case "link":
          return `[${text}](url)`;
        case "url":
          return `<${trimmed || text}>`;
        case "emphasis":
          return `*${text}*`;
        case "strikethrough":
          return `~~${text}~~`;
        case "title-case":
          return convertSelectionToTitleCase(text);
        case "uppercase":
          return text.toUpperCase();
        case "lowercase":
          return text.toLowerCase();
        case "strong":
          return `**${text}**`;
        case "blockquote":
          return toggleLinePrefix(text, "> ");
        case "unordered-list":
          return toggleLinePrefix(text, "- ");
        case "ordered-list":
          return text.split("\n").map(function(line, index) {
            return line.trim() ? `${index + 1}. ${line}` : line;
          }).join("\n");
        case "task-list":
          return toggleLinePrefix(text, "- [ ] ");
        case "horizontal-rule":
          return text ? `${text}\n\n---` : "---";
        case "table":
          return convertSelectionToMarkdownTable(text);
        default:
          return text;
      }
    }

    function replaceEditorSelectionWithMarkdown(type) {
      if (!editorContextMenuSelection) return;

      const { start, end } = editorContextMenuSelection;
      const value = getEditorValue();
      const selectedText = value.slice(start, end);
      const replacement = convertSelectionToMarkdown(type, selectedText);

      replaceEditorSelectionPreservingUndo(start, end, replacement);
      hideEditorContextMenu();
    }

    function applyMarkdownActionToSelection(type) {
      const { start: selectionStart, end: selectionEnd } = getEditorSelection();
      editorContextMenuSelection = {
        start: Math.min(selectionStart, selectionEnd),
        end: Math.max(selectionStart, selectionEnd)
      };
      replaceEditorSelectionWithMarkdown(type);
    }

    function replaceSelectionWithText(replacement) {
      const { start: selectionStart, end: selectionEnd } = getEditorSelection();
      replaceEditorSelectionPreservingUndo(selectionStart, selectionEnd, replacement);
      hideEditorContextMenu();
    }

    function replaceRangeWithText(start, end, replacement) {
      replaceEditorSelectionPreservingUndo(start, end, replacement);
      hideEditorContextMenu();
    }

    function restoreEditorContextSelection() {
      if (!editorContextMenuSelection) return false;
      const valueLength = getEditorValue().length;
      const selectionStart = Math.max(0, Math.min(Number(editorContextMenuSelection.start) || 0, valueLength));
      const selectionEnd = Math.max(selectionStart, Math.min(Number(editorContextMenuSelection.end) || selectionStart, valueLength));
      editorContextMenuSelection = { start: selectionStart, end: selectionEnd };
      focusEditor();
      setEditorSelection(selectionStart, selectionEnd);
      return true;
    }

    function runEditorContextCommand(command) {
      restoreEditorContextSelection();
      try {
        document.execCommand(command);
      } catch (_) {
        return false;
      } finally {
        if (command !== "copy") hideEditorContextMenu();
      }
      return true;
    }

    async function pasteIntoEditorContextSelection() {
      restoreEditorContextSelection();
      let pastedText = "";
      try {
        pastedText = await navigator.clipboard.readText();
      } catch (_) {
        runEditorContextCommand("paste");
        return;
      }
      replaceSelectionWithText(pastedText);
    }

    function selectAllEditorText() {
      focusEditor();
      setEditorSelection(0, getEditorValue().length);
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
      hideEditorContextMenu();
    }

    function deleteEditorContextSelection() {
      if (!editorContextMenuSelection || editorContextMenuSelection.end <= editorContextMenuSelection.start) return;
      const { start, end } = editorContextMenuSelection;
      replaceEditorSelectionPreservingUndo(start, end, "");
      setEditorSelection(start, start);
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
      hideEditorContextMenu();
    }

    function setEditorSelectionMatchCaseSensitive(matchCase) {
      restoreEditorContextSelection();
      editorSelectionMatchCaseSensitive = matchCase !== false;
      const codeMirrorEditor = getCodeMirrorEditor();
      if (typeof codeMirrorEditor?.setSelectionMatchCaseSensitive === "function") {
        codeMirrorEditor.setSelectionMatchCaseSensitive(editorSelectionMatchCaseSensitive);
      }
      updateEditorSelectionHighlights();
      updateStatusLine();
      hideEditorContextMenu();
    }

    function getEditorSelectionMatchCaseSensitive() {
      return editorSelectionMatchCaseSensitive;
    }

    function getEditorSourceActionContext() {
      return {
        activeTab: getActiveTab(),
        selection: Object.assign({}, editorContextMenuSelection),
        source: getEditorValue()
      };
    }

    function runEditorSourceAction(action) {
      const sourceActions = getSourceActions();
      if (!sourceActions?.findAvailableAction?.(action, getEditorSourceActionContext())) {
        return false;
      }
      restoreEditorContextSelection();
      hideEditorContextMenu();
      void sourceActions.executeAction(action, getEditorSourceActionContext());
      return true;
    }

    function convertEditorUnicodeSelection(format) {
      if (!editorContextMenuSelection || editorContextMenuSelection.end <= editorContextMenuSelection.start) return;
      const { start, end } = editorContextMenuSelection;
      const unicodeConverter = getUnicodeConverter();
      if (!unicodeConverter) return;

      try {
        const selectedText = getEditorValue().slice(start, end);
        const replacement = format === "decode"
          ? unicodeConverter.decode(selectedText)
          : format === "decode-uri"
            ? unicodeConverter.decodeUri(selectedText)
            : unicodeConverter.encode(selectedText, format);
        replaceEditorSelectionPreservingUndo(start, end, replacement);
        setEditorSelection(start, start + replacement.length);
        updateEditorLineNumbers();
        updateEditorSelectionHighlights();
        updateStatusLine();
      } catch (error) {
        console.warn("Failed to convert selected Unicode text:", error);
        window.alert(error?.message || "The selected text could not be converted.");
      } finally {
        hideEditorContextMenu();
      }
    }

    function convertEditorBase64Selection(mode) {
      if (!editorContextMenuSelection || editorContextMenuSelection.end <= editorContextMenuSelection.start) return;
      const { start, end } = editorContextMenuSelection;
      const base64Converter = getBase64Converter();
      if (!base64Converter) return;

      try {
        const selectedText = getEditorValue().slice(start, end);
        const replacement = mode === "decode"
          ? base64Converter.decode(selectedText)
          : base64Converter.encode(selectedText);
        replaceEditorSelectionPreservingUndo(start, end, replacement);
        setEditorSelection(start, start + replacement.length);
        updateEditorLineNumbers();
        updateEditorSelectionHighlights();
        updateStatusLine();
      } catch (error) {
        console.warn("Failed to convert selected Base64 text:", error);
        window.alert(error?.message || "The selected text could not be converted as Base64.");
      } finally {
        hideEditorContextMenu();
      }
    }

    function runActiveEditorSelectionCommand(command) {
      restoreEditorContextSelection();
      let handled = false;
      switch (command) {
        case "uppercase":
          handled = activeEditorCommands?.transformToUppercase?.();
          break;
        case "lowercase":
          handled = activeEditorCommands?.transformToLowercase?.();
          break;
        case "title-case":
          handled = activeEditorCommands?.transformToTitleCase?.();
          break;
        case "invert-case":
          handled = activeEditorCommands?.invertSelectionCase?.();
          break;
        case "path-separators-backslash-to-slash":
          handled = activeEditorCommands?.replaceSelectedPathSeparators?.("\\", "/");
          break;
        case "path-separators-slash-to-backslash":
          handled = activeEditorCommands?.replaceSelectedPathSeparators?.("/", "\\");
          break;
        default:
          break;
      }
      hideEditorContextMenu();
      return handled;
    }

    function runEditorContextMenuAction(action) {
      if (runEditorSourceAction(action)) return;
      switch (action) {
        case "uppercase":
        case "lowercase":
        case "title-case":
        case "invert-case":
        case "path-separators-backslash-to-slash":
        case "path-separators-slash-to-backslash":
          runActiveEditorSelectionCommand(action);
          break;
        case "unicode-hex-ncr":
          convertEditorUnicodeSelection("hex-ncr");
          break;
        case "unicode-javascript-es6":
          convertEditorUnicodeSelection("javascript-es6");
          break;
        case "unicode-java-c":
          convertEditorUnicodeSelection("java-c");
          break;
        case "unicode-css":
          convertEditorUnicodeSelection("css");
          break;
        case "unicode-encoded-uri":
          convertEditorUnicodeSelection("encoded-uri");
          break;
        case "unicode-decode":
          convertEditorUnicodeSelection("decode");
          break;
        case "uri-encode":
          convertEditorUnicodeSelection("encoded-uri");
          break;
        case "uri-decode":
          convertEditorUnicodeSelection("decode-uri");
          break;
        case "base64-encode":
          convertEditorBase64Selection("encode");
          break;
        case "base64-decode":
          convertEditorBase64Selection("decode");
          break;
        case "format-file":
          formatEditorDocument();
          break;
        case "compact-json":
        case "json-for-code":
        case "json-from-code":
          runJsonEditCommand(action, { useContextSelection: true });
          break;
        case "compact-xml":
        case "xml-validate":
        case "xml-associate-schema":
        case "xml-for-code":
        case "xml-from-code":
        case "xml-create-schema":
        case "xml-create-stub":
        case "xml-run-xslt":
        case "xml-aware-compare":
        case "xml-tree-grid":
          runXmlEditCommand(action, { useContextSelection: true });
          break;
        case "less-to-css":
          convertLessDocumentToCss(true);
          break;
        case "collapse-all-folds":
          collapseAllEditorFolds();
          break;
        case "expand-all-folds":
          expandAllEditorFolds();
          break;
        case "emoji":
          restoreEditorContextSelection();
          hideEditorContextMenu();
          if (typeof openEditorEmojiModal === "function") openEditorEmojiModal();
          break;
        case "cut":
          runEditorContextCommand("cut");
          break;
        case "copy":
          runEditorContextCommand("copy");
          hideEditorContextMenu();
          break;
        case "paste":
          pasteIntoEditorContextSelection();
          break;
        case "delete":
          deleteEditorContextSelection();
          break;
        case "select-all":
          selectAllEditorText();
          break;
        case "ignore-case":
          setEditorSelectionMatchCaseSensitive(false);
          break;
        case "case-sensitive":
          setEditorSelectionMatchCaseSensitive(true);
          break;
        default:
          break;
      }
    }


    async function organizeJavaImports(options = {}) {
      if (options.restoreSelection !== false) restoreEditorContextSelection();
      hideEditorContextMenu();
      const javaSourceActions = app.modules?.javaSourceActions;
      if (!javaSourceActions || typeof javaSourceActions.organizeImportsForActiveEditor !== "function") return;
      const result = await javaSourceActions.organizeImportsForActiveEditor();
      if (result?.applied) {
        updateEditorLineNumbers();
        updateEditorSelectionHighlights();
        updateStatusLine();
      }
    }
    async function formatEditorDocument(options = {}) {
      if (options.restoreSelection !== false) restoreEditorContextSelection();
      hideEditorContextMenu();
      const codeMirrorEditor = getCodeMirrorEditor();
      if (!codeMirrorEditor || typeof codeMirrorEditor.formatActiveDocument !== "function") return;
      try {
        const didFormat = await codeMirrorEditor.formatActiveDocument();
        if (didFormat) {
          updateEditorLineNumbers();
          updateEditorSelectionHighlights();
          updateStatusLine();
        } else {
          window.alert("No formatter is registered for this file type.");
        }
      } catch (error) {
        console.warn("Failed to format editor document:", error);
        window.alert(error?.message || "This file could not be formatted.");
      }
    }

    function compactJsonDocument() {
      const source = getEditorValue();
      const caretPosition = getEditorSelection().start;
      try {
        const compactJson = JSON.stringify(JSON.parse(source));
        replaceEditorSelectionPreservingUndo(0, source.length, compactJson);
        const compactCaretPosition = Math.min(caretPosition, compactJson.length);
        setEditorSelection(compactCaretPosition, compactCaretPosition);
        updateEditorLineNumbers();
        updateEditorSelectionHighlights();
        updateStatusLine();
      } catch (error) {
        window.alert(error?.message || "This file does not contain valid JSON.");
      } finally {
        hideEditorContextMenu();
      }
    }

    function getJsonCodeTransformationTarget(useContextSelection) {
      const source = getEditorValue();
      const selection = (useContextSelection && editorContextMenuSelection) || getEditorSelection();
      const hasSelection = selection.end > selection.start;
      const start = hasSelection ? selection.start : 0;
      const end = hasSelection ? selection.end : source.length;
      return { start, end, source: source.slice(start, end) };
    }

    function convertJsonToJavaStringLiteral(useContextSelection) {
      const target = getJsonCodeTransformationTarget(useContextSelection);
      try {
        const compactJson = JSON.stringify(JSON.parse(target.source));
        const javaStringLiteral = `"${compactJson.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
        replaceEditorSelectionPreservingUndo(target.start, target.end, javaStringLiteral);
        updateEditorLineNumbers();
        updateEditorSelectionHighlights();
        updateStatusLine();
      } catch (error) {
        window.alert(error?.message || "The selected content does not contain valid JSON.");
      } finally {
        hideEditorContextMenu();
      }
    }

    function convertJavaStringLiteralToJson(useContextSelection) {
      const target = getJsonCodeTransformationTarget(useContextSelection);
      try {
        const decodedJson = JSON.parse(target.source.trim());
        if (typeof decodedJson !== "string") {
          throw new Error("The selected content must be a string literal containing JSON.");
        }
        const prettyJson = JSON.stringify(JSON.parse(decodedJson), null, 2);
        replaceEditorSelectionPreservingUndo(target.start, target.end, prettyJson);
        updateEditorLineNumbers();
        updateEditorSelectionHighlights();
        updateStatusLine();
      } catch (error) {
        window.alert(error?.message || "The selected code string does not contain valid JSON.");
      } finally {
        hideEditorContextMenu();
      }
    }

    /**
     * Run one JSON conversion for either the editor context menu or the main Edit menu.
     * @param {string} command JSON conversion command identifier.
     * @param {object} [options] Selection source options.
     * @param {boolean} [options.useContextSelection=false] Whether to use the saved right-click selection.
     * @returns {boolean} Whether the command identifier was handled.
     */
    function runJsonEditCommand(command, options = {}) {
      const useContextSelection = options.useContextSelection === true;
      switch (command) {
        case "compact-json":
          compactJsonDocument();
          return true;
        case "json-for-code":
          convertJsonToJavaStringLiteral(useContextSelection);
          return true;
        case "json-from-code":
          convertJavaStringLiteralToJson(useContextSelection);
          return true;
        default:
          return false;
      }
    }

    function showXmlConversionError(message) {
      console.warn(message);
      const notify = app.services?.notify || app.modules?.notificationModal;
      if (typeof notify?.alert === "function") {
        void notify.alert({ title: "XML", message });
      }
    }

    function parseXmlDocument(source) {
      const xmlDocument = new DOMParser().parseFromString(source, "application/xml");
      const parserError = xmlDocument.querySelector("parsererror");
      if (parserError) {
        throw new Error(parserError.textContent?.trim() || "This file does not contain valid XML.");
      }
      return xmlDocument;
    }

    function removeXmlWhitespaceTextNodes(node) {
      Array.from(node.childNodes || []).forEach(function(child) {
        if (child.nodeType === Node.TEXT_NODE && !child.nodeValue.trim()) {
          node.removeChild(child);
          return;
        }
        removeXmlWhitespaceTextNodes(child);
      });
    }

    function serializeCompactXml(source) {
      const declarationMatch = source.match(/^\s*(<\?xml\s+[^?]*\?>)/i);
      const xmlDocument = parseXmlDocument(source);
      removeXmlWhitespaceTextNodes(xmlDocument);
      const serializedXml = new XMLSerializer().serializeToString(xmlDocument);
      if (declarationMatch && !/^\s*<\?xml\s+/i.test(serializedXml)) {
        return declarationMatch[1] + serializedXml;
      }
      return serializedXml;
    }

    function compactXmlDocument() {
      const source = getEditorValue();
      const caretPosition = getEditorSelection().start;
      try {
        const compactXml = serializeCompactXml(source);
        replaceEditorSelectionPreservingUndo(0, source.length, compactXml);
        const compactCaretPosition = Math.min(caretPosition, compactXml.length);
        setEditorSelection(compactCaretPosition, compactCaretPosition);
        updateEditorLineNumbers();
        updateEditorSelectionHighlights();
        updateStatusLine();
      } catch (error) {
        showXmlConversionError(error?.message || "This file does not contain valid XML.");
      } finally {
        hideEditorContextMenu();
      }
    }

    function convertXmlToJavaStringLiteral(useContextSelection) {
      const target = getJsonCodeTransformationTarget(useContextSelection);
      try {
        const compactXml = serializeCompactXml(target.source);
        replaceEditorSelectionPreservingUndo(target.start, target.end, JSON.stringify(compactXml));
        updateEditorLineNumbers();
        updateEditorSelectionHighlights();
        updateStatusLine();
      } catch (error) {
        showXmlConversionError(error?.message || "The selected content does not contain valid XML.");
      } finally {
        hideEditorContextMenu();
      }
    }

    function convertJavaStringLiteralToXml(useContextSelection) {
      const target = getJsonCodeTransformationTarget(useContextSelection);
      try {
        const decodedXml = JSON.parse(target.source.trim());
        if (typeof decodedXml !== "string") {
          throw new Error("The selected content must be a string literal containing XML.");
        }
        parseXmlDocument(decodedXml);
        replaceEditorSelectionPreservingUndo(target.start, target.end, decodedXml);
        updateEditorLineNumbers();
        updateEditorSelectionHighlights();
        updateStatusLine();
      } catch (error) {
        showXmlConversionError(error?.message || "The selected code string does not contain valid XML.");
      } finally {
        hideEditorContextMenu();
      }
    }

    function getXmlGeneratedOutputTitle(extension) {
      const activeTab = getActiveTab();
      const sourceName = String(activeTab?.sourceFileName || activeTab?.sourceFileHandle?.name || activeTab?.title || "document.xml");
      return sourceName.replace(/\.[^./\\]+$/, "") + extension;
    }

    function getXmlSchemaOutputTitle() {
      return getXmlGeneratedOutputTitle(".xsd");
    }

    function getXmlStubOutputTitle() {
      return getXmlGeneratedOutputTitle("-stub.xml");
    }

    function getLessCssOutputTitle() {
      const activeTab = getActiveTab();
      const sourceName = String(activeTab?.sourceFileName || activeTab?.sourceFileHandle?.name || activeTab?.title || "style.less");
      return sourceName.replace(/\.[^./\\]+$/, "") + ".css";
    }

    function convertLessDocumentToCss(useContextSelection) {
      const target = getJsonCodeTransformationTarget(useContextSelection);
      try {
        const converter = getLessToCssConverter();
        if (typeof converter?.convertLessToCss !== "function") {
          throw new Error("LESS to CSS conversion is not available in this build.");
        }
        if (typeof openGeneratedCssInTab !== "function") {
          throw new Error("Generated CSS tabs are not available in this build.");
        }
        const cssSource = converter.convertLessToCss(target.source);
        openGeneratedCssInTab(cssSource, getLessCssOutputTitle());
      } catch (error) {
        showXmlConversionError(error?.message || "The selected content does not contain valid LESS.");
      } finally {
        hideEditorContextMenu();
      }
    }

    function createXmlSchemaFromEditorXml(useContextSelection) {
      const target = getJsonCodeTransformationTarget(useContextSelection);
      try {
        const generator = getXmlSchemaGenerator();
        if (typeof generator?.createXmlSchemaFromXml !== "function") {
          throw new Error("XML schema generation is not available in this build.");
        }
        if (typeof openGeneratedXmlSchemaInTab !== "function") {
          throw new Error("Generated XML schema tabs are not available in this build.");
        }
        const schemaSource = generator.createXmlSchemaFromXml(target.source);
        openGeneratedXmlSchemaInTab(schemaSource, getXmlSchemaOutputTitle());
      } catch (error) {
        showXmlConversionError(error?.message || "The selected content does not contain valid XML.");
      } finally {
        hideEditorContextMenu();
      }
    }

    function createXmlStubFromEditorXsd(useContextSelection) {
      const target = getJsonCodeTransformationTarget(useContextSelection);
      try {
        const generator = getXmlStubGenerator();
        if (typeof generator?.createXmlStubFromXsd !== "function") {
          throw new Error("XML stub generation is not available in this build.");
        }
        if (typeof openGeneratedXmlStubInTab !== "function") {
          throw new Error("Generated XML stub tabs are not available in this build.");
        }
        const stubSource = generator.createXmlStubFromXsd(target.source);
        openGeneratedXmlStubInTab(stubSource, getXmlStubOutputTitle());
      } catch (error) {
        showXmlConversionError(error?.message || "The selected content does not contain a valid XML Schema.");
      } finally {
        hideEditorContextMenu();
      }
    }

    async function validateXmlFromActiveEditor() {
      try {
        const validator = getXmlValidation();
        if (typeof validator?.validateActiveEditor !== "function") {
          throw new Error("XML validation is not available in this build.");
        }
        await validator.validateActiveEditor();
      } catch (error) {
        showXmlConversionError(error?.message || "XML validation failed.");
      } finally {
        hideEditorContextMenu();
      }
    }

    async function associateXmlSchemaForActiveEditor() {
      try {
        const autocomplete = getXmlSchemaAutocomplete();
        if (typeof autocomplete?.associateSchemaForActiveEditor !== "function") {
          throw new Error("XML schema association is not available in this build.");
        }
        await autocomplete.associateSchemaForActiveEditor();
      } catch (error) {
        showXmlConversionError(error?.message || "XML schema association failed.");
      } finally {
        hideEditorContextMenu();
      }
    }

    function getActiveEditorPath() {
      const activeTab = getActiveTab();
      return activeTab?.sourceFilePath || activeTab?.sourceFileName || activeTab?.sourceFileHandle?.name || activeTab?.title || "";
    }

    function openXsltRunnerForActiveEditor() {
      try {
        if (typeof openXsltToolInTab !== "function") throw new Error("XSLT Runner is not available in this build.");
        const sourcePath = getActiveEditorPath();
        const source = getEditorValue();
        const options = /\.(xsl|xslt)$/i.test(sourcePath) ? { xsltText: source } : { xmlText: source };
        openXsltToolInTab(options);
      } catch (error) {
        showXmlConversionError(error?.message || "XSLT Runner failed.");
      } finally {
        hideEditorContextMenu();
      }
    }

    function openXmlTreeGridForActiveEditor() {
      try {
        const view = getXmlTreeGridView();
        if (typeof view?.openForActiveEditor !== "function") {
          throw new Error("XML Tree/Grid View is not available in this build.");
        }
        view.openForActiveEditor();
      } catch (error) {
        showXmlConversionError(error?.message || "XML Tree/Grid View failed.");
      } finally {
        hideEditorContextMenu();
      }
    }
    function openXmlAwareCompareForEditor() {
      try {
        if (typeof openXmlAwareCompareForActiveEditor !== "function") throw new Error("XML-aware comparison is not available in this build.");
        const sourcePath = getActiveEditorPath();
        openXmlAwareCompareForActiveEditor({
          name: sourcePath.replace(/\\/g, "/").split("/").pop() || "Active XML",
          path: sourcePath || null,
          content: getEditorValue()
        });
      } catch (error) {
        showXmlConversionError(error?.message || "XML-aware comparison failed.");
      } finally {
        hideEditorContextMenu();
      }
    }
    /**
     * Run one XML conversion for either the editor context menu or the main Edit menu.
     * @param {string} command XML conversion command identifier.
     * @param {object} [options] Selection source options.
     * @param {boolean} [options.useContextSelection=false] Whether to use the saved right-click selection.
     * @returns {boolean} Whether the command identifier was handled.
     */
    function runXmlEditCommand(command, options = {}) {
      const useContextSelection = options.useContextSelection === true;
      switch (command) {
        case "xml-validate":
          void validateXmlFromActiveEditor();
          return true;
        case "xml-associate-schema":
          void associateXmlSchemaForActiveEditor();
          return true;
        case "xml-tree-grid":
          openXmlTreeGridForActiveEditor();
          return true;
        case "xml-aware-compare":
          openXmlAwareCompareForEditor();
          return true;
        case "compact-xml":
          compactXmlDocument();
          return true;
        case "xml-for-code":
          convertXmlToJavaStringLiteral(useContextSelection);
          return true;
        case "xml-from-code":
          convertJavaStringLiteralToXml(useContextSelection);
          return true;
        case "xml-create-schema":
          createXmlSchemaFromEditorXml(useContextSelection);
          return true;
        case "xml-create-stub":
          createXmlStubFromEditorXsd(useContextSelection);
          return true;
        default:
          return false;
      }
    }

    function canShowMarkdownConversionSection() {
      const activeTab = getActiveTab();
      if (isUnsupportedFileTab(activeTab)) return false;
      if (activeTab?.parseAsLanguageId) return activeTab.parseAsLanguageId === "markdown";
      const sourcePath = activeTab?.sourceFilePath || activeTab?.sourceFileName || activeTab?.sourceFileHandle?.name || "";
      if (sourcePath) return isMarkdownPath(sourcePath);
      const tabTitle = String(activeTab?.title || "");
      if (/\.[^./\\]+$/.test(tabTitle)) return isMarkdownPath(tabTitle);
      return !activeTab || activeTab.type === "markdown";
    }

    function collapseAllEditorFolds() {
      hideEditorContextMenu();
      const codeMirrorEditor = getCodeMirrorEditor();
      if (typeof codeMirrorEditor?.collapseTopLevelFolds === "function") {
        codeMirrorEditor.collapseTopLevelFolds();
      }
    }

    function expandAllEditorFolds() {
      hideEditorContextMenu();
      const codeMirrorEditor = getCodeMirrorEditor();
      if (typeof codeMirrorEditor?.expandTopLevelFolds === "function") {
        codeMirrorEditor.expandTopLevelFolds();
      }
    }

    function getEditorSharedContextActions() {
      return [
        { type: "format-file", label: "Format file", shortcut: "", icon: "bi-magic" },
        { type: "emoji", label: "Emoji", shortcut: "Win+Period", icon: "bi-emoji-smile" }
      ];
    }

    function getEditorUnicodeConversionAction() {
      if (!getUnicodeConverter()) return null;
      return {
        id: "utf8-convert",
        label: "UTF8 Convert",
        icon: "bi-translate",
        children: [
          { type: "unicode-hex-ncr", label: "Hex NCRs", icon: "bi-code-square" },
          { type: "unicode-javascript-es6", label: "JavaScript ES6", icon: "bi-braces" },
          { type: "unicode-java-c", label: "Java/C", icon: "bi-code-slash" },
          { type: "unicode-css", label: "CSS", icon: "bi-palette" },
          { type: "unicode-encoded-uri", label: "Encoded URI", icon: "bi-link-45deg" },
          { type: "separator" },
          { type: "unicode-decode", label: "Decode to Text", icon: "bi-arrow-left-right" }
        ]
      };
    }

    function getEditorUriConversionAction() {
      if (!getUnicodeConverter()) return null;
      return {
        id: "encoded-uri",
        label: "Encoded URI",
        icon: "bi-link-45deg",
        children: [
          { type: "uri-encode", label: "Encode", icon: "bi-arrow-right" },
          { type: "uri-decode", label: "Decode", icon: "bi-arrow-left" }
        ]
      };
    }

    function getEditorBase64ConversionAction() {
      if (!getBase64Converter()) return null;
      return {
        id: "base64",
        label: "Base64",
        icon: "bi-file-binary",
        children: [
          { type: "base64-encode", label: "Encode", icon: "bi-arrow-right" },
          { type: "base64-decode", label: "Decode", icon: "bi-arrow-left" }
        ]
      };
    }

    function getEditorCaseConversionAction() {
      return {
        id: "convert-case",
        label: "Convert Case to",
        icon: "bi-type",
        children: [
          { type: "uppercase", label: "UPPERCASE", icon: "bi-alphabet-uppercase" },
          { type: "lowercase", label: "lowercase", icon: "bi-alphabet" },
          { type: "title-case", label: "CammelCase", icon: "bi-type" },
          { type: "invert-case", label: "iNVERT cASE", icon: "bi-arrow-left-right" }
        ]
      };
    }

    function getEditorPathSeparatorAction() {
      return {
        id: "replace-path-separators",
        label: "Replace Path Separators",
        icon: "bi-slash-lg",
        children: [
          {
            type: "path-separators-backslash-to-slash",
            label: "\\ to /",
            icon: "bi-arrow-right",
            title: "Replace backslashes in the selected text with forward slashes"
          },
          {
            type: "path-separators-slash-to-backslash",
            label: "/ to \\",
            icon: "bi-arrow-left",
            title: "Replace forward slashes in the selected text with backslashes"
          }
        ]
      };
    }

    function getEditorJsonConversionAction() {
      return {
        id: "json",
        label: "JSON",
        icon: "bi-braces",
        children: [
          { type: "compact-json", label: "One-line JSON", icon: "bi-arrows-collapse" },
          { type: "json-for-code", label: "JSON for Code", icon: "bi-code-square" },
          { type: "json-from-code", label: "JSON from Code", icon: "bi-braces" }
        ]
      };
    }

    function getEditorJsonSourceActions() {
      return getEditorJsonConversionAction().children.map(function(action) {
        return { ...action, menu: "source-json" };
      });
    }

    function getEditorXmlConversionAction() {
      return {
        id: "xml",
        label: "XML",
        icon: "bi-code-slash",
        children: [
          { type: "xml-validate", label: "Validate XML", icon: "bi-check2-circle" },
          { type: "xml-tree-grid", label: "XML Tree/Grid View", icon: "bi-diagram-3" },
          { type: "xml-associate-schema", label: "Associate XML Schema...", icon: "bi-link-45deg" },
          { type: "compact-xml", label: "One-line XML", icon: "bi-arrows-collapse" },
          { type: "xml-for-code", label: "XML for Code", icon: "bi-code-square" },
          { type: "xml-from-code", label: "XML from Code", icon: "bi-code-slash" },
          { type: "xml-create-schema", label: "Create XML Schema from XML", icon: "bi-diagram-3" },
          { type: "xml-create-stub", label: "Create XML Stub from XSD", icon: "bi-filetype-xml" },
          { type: "xml-run-xslt", label: "Run XSLT", icon: "bi-shuffle" },
          { type: "xml-aware-compare", label: "XML-aware Compare...", icon: "bi-file-diff" }
        ]
      };
    }

    function getEditorXmlSourceActions() {
      return getEditorXmlConversionAction().children
        .filter((action) => action.type !== "xml-create-stub")
        .map(function(action) {
          return { ...action, menu: "source-xml" };
        });
    }

    function getEditorXsdSourceActions() {
      return getEditorXmlConversionAction().children
        .filter((action) => action.type === "xml-validate" || action.type === "xml-tree-grid" || action.type === "xml-create-stub")
        .map(function(action) {
          return { ...action, label: action.type === "xml-validate" ? "Validate XSD" : action.label, menu: "source-xsd" };
        });
    }

    function getEditorLessSourceActions() {
      return [
        { type: "less-to-css", label: "LESS to CSS", icon: "bi-filetype-css", menu: "source-less" }
      ];
    }

    function getEditorEditAction(hasSelection) {
      const children = [
        { type: "copy", label: "Copy", shortcut: "Ctrl+C", icon: "bi-copy", disabled: !hasSelection },
        { type: "cut", label: "Cut", shortcut: "Ctrl+X", icon: "bi-scissors", disabled: !hasSelection },
        { type: "paste", label: "Paste", shortcut: "Ctrl+V", icon: "bi-clipboard" },
        { type: "delete", label: "Delete", shortcut: "", icon: "bi-trash", disabled: !hasSelection },
        { type: "select-all", label: "Select All", shortcut: "Ctrl+A", icon: "bi-textarea-t" }
      ];
      if (hasSelection) {
        children.push(getEditorCaseConversionAction());
        children.push(getEditorPathSeparatorAction());
      }
      const unicodeConversionAction = hasSelection ? getEditorUnicodeConversionAction() : null;
      if (unicodeConversionAction) children.push(unicodeConversionAction);
      const base64ConversionAction = hasSelection ? getEditorBase64ConversionAction() : null;
      if (base64ConversionAction) children.push(base64ConversionAction);
      const uriConversionAction = hasSelection ? getEditorUriConversionAction() : null;
      if (uriConversionAction) children.push(uriConversionAction);
      children.push(getEditorJsonConversionAction());
      children.push(getEditorXmlConversionAction());
      return { id: "edit", label: "Edit", icon: "bi-pencil-square", children };
    }

    function getEditorSourceActionGroup(action) {
      const id = action?.id || action?.type || "";
      if (id === "toggle-comment" || id === "toggle-block-comment") return "comments";
      if (id === "correct-indentation" || id === "format-file" || id === "format-selected") return "format";
      if (id === "add-import" || id === "organize-imports") return "imports";
      return "source-generation";
    }

    function insertEditorSourceActionSeparators(actions) {
      return actions.reduce(function(groupedActions, action) {
        const group = getEditorSourceActionGroup(action);
        const previousAction = groupedActions[groupedActions.length - 1];
        const previousGroup = getEditorSourceActionGroup(previousAction);
        if (previousAction && previousAction?.type !== "separator" && previousGroup !== group) {
          groupedActions.push({ type: "separator" });
        }
        groupedActions.push(action);
        return groupedActions;
      }, []);
    }

    function moveCorrectIndentationIntoFormatGroup(actions) {
      const indentationIndex = actions.findIndex((action) => action?.id === "correct-indentation");
      const formatIndex = actions.findIndex((action) => action?.id === "format-file" || action?.id === "format-selected");
      if (indentationIndex < 0 || formatIndex < 0 || indentationIndex === formatIndex - 1) return actions;
      const groupedActions = actions.slice();
      const [indentationAction] = groupedActions.splice(indentationIndex, 1);
      const targetIndex = groupedActions.findIndex((action) => action?.id === "format-file" || action?.id === "format-selected");
      groupedActions.splice(targetIndex, 0, indentationAction);
      return groupedActions;
    }

    function getEditorSourceActions() {
      const sourceActions = getSourceActions();
      const actions = sourceActions?.getAvailableActions?.(getEditorSourceActionContext()) || [];
      const sourceMenuActions = moveCorrectIndentationIntoFormatGroup(
        actions.filter((action) => action?.menu !== "debugger" && action?.menu !== "refactor" && action?.menu !== "root")
      );
      const activeTab = getActiveTab();
      const activeLanguage = getCodeMirrorEditor()?.getActiveLanguage?.();
      const activePath = activeTab?.sourceFilePath || activeTab?.sourceFileName || activeTab?.sourceFileHandle?.name || activeTab?.title || "";
      const isJsonContext = activeTab?.parseAsLanguageId === "json"
        || activeLanguage?.id === "json"
        || activeLanguage?.codeMirrorLanguage === "json"
        || /\.json$/i.test(activePath);
      const isXsdContext = /\.xsd$/i.test(activePath);
      const isXmlContext = !isXsdContext && (activeTab?.parseAsLanguageId === "xml"
        || activeTab?.parseAsLanguageId === "maven"
        || activeLanguage?.id === "xml"
        || activeLanguage?.id === "maven"
        || activeLanguage?.codeMirrorLanguage === "xml"
        || /\.(xml|xsl|xslt|svg)$/i.test(activePath)
        || /(^|[/\\])pom\.xml$/i.test(activePath));
      const isLessContext = activeTab?.parseAsLanguageId === "less"
        || activeLanguage?.id === "less"
        || activeLanguage?.codeMirrorLanguage === "less"
        || /\.less$/i.test(activePath);
      if (!isJsonContext && !isXmlContext && !isXsdContext && !isLessContext) return insertEditorSourceActionSeparators(sourceMenuActions);
      return insertEditorSourceActionSeparators([
        { type: "format-file", label: "Format File", shortcut: "", icon: "bi-magic" },
        ...sourceMenuActions,
        ...(isJsonContext ? getEditorJsonSourceActions() : []),
        ...(isXmlContext ? getEditorXmlSourceActions() : []),
        ...(isXsdContext ? getEditorXsdSourceActions() : []),
        ...(isLessContext ? getEditorLessSourceActions() : [])
      ]);
    }

    function getEditorRootActions() {
      const sourceActions = getSourceActions();
      return (sourceActions?.getAvailableActions?.(getEditorSourceActionContext()) || [])
        .filter((action) => action?.menu === "root");
    }

    function splitEditorDebugRootActions(rootActions) {
      const debugRootActionOrder = ["run-java-main", "debug-java-main"];
      const debugRootActionIds = new Set(debugRootActionOrder);
      const groups = rootActions.reduce((result, action) => {
        if (debugRootActionIds.has(action?.id)) result.debugRootActions.push(action);
        else result.rootActions.push(action);
        return result;
      }, { rootActions: [], debugRootActions: [] });
      groups.debugRootActions.sort((a, b) => debugRootActionOrder.indexOf(a.id) - debugRootActionOrder.indexOf(b.id));
      return groups;
    }

    function getEditorDebuggerActions() {
      const sourceActions = getSourceActions();
      return (sourceActions?.getAvailableActions?.(getEditorSourceActionContext()) || [])
        .filter((action) => action?.menu === "debugger");
    }

    function splitEditorDebuggerActions(debuggerActions) {
      const quickActionIds = [
        "debug-toggle-breakpoint",
        "debug-run-to-cursor",
        "debug-evaluate-selection",
        "debug-evaluate-expression",
        "debug-add-selection-watch"
      ];
      const selectedIds = new Set();
      const quickActions = quickActionIds.flatMap(function(id) {
        const action = debuggerActions.find((candidate) => candidate?.id === id && !selectedIds.has(candidate.id));
        if (!action) return [];
        selectedIds.add(action.id);
        return [action];
      });
      return { quickActions };
    }

    function insertEditorRefactorSubmenuAfterSurround(rootActions, refactorActions) {
      if (!refactorActions.length) return rootActions;
      const groupedActions = rootActions.slice();
      const refactorAction = { id: "refactor", label: "Refactor", icon: "bi-tools", children: refactorActions };
      const surroundIndex = groupedActions.findIndex((action) => action?.id === "surround-with");
      const insertIndex = surroundIndex >= 0 ? surroundIndex + 1 : groupedActions.length;
      groupedActions.splice(insertIndex, 0, refactorAction);
      return groupedActions;
    }

    function insertEditorDebugSubmenuAfterSurround(rootActions, debuggerActions, debugRootActions = []) {
      const debugChildren = [
        ...debugRootActions,
        ...(debugRootActions.length && debuggerActions.length ? [{ type: "separator" }] : []),
        ...debuggerActions
      ];
      if (!debugChildren.length) return rootActions;
      const groupedActions = rootActions.slice();
      const debugActions = [
        { type: "separator" },
        { id: "debug", label: "Debug", icon: "bi-bug-fill", children: debugChildren }
      ];
      const surroundIndex = groupedActions.findIndex((action) => action?.id === "surround-with");
      const refactorIndex = groupedActions.findIndex((action) => action?.id === "refactor");
      const insertIndex = refactorIndex >= 0 && (surroundIndex < 0 || refactorIndex > surroundIndex)
        ? refactorIndex + 1
        : surroundIndex >= 0 ? surroundIndex + 1 : groupedActions.length;
      groupedActions.splice(insertIndex, 0, ...debugActions);
      return groupedActions;
    }

    function getEditorRefactorActions() {
      const sourceActions = getSourceActions();
      return (sourceActions?.getAvailableActions?.(getEditorSourceActionContext()) || [])
        .filter((action) => action?.menu === "refactor");
    }

    function renderEditorSourceSubmenu(sourceActions) {
      if (!sourceActions.length) return "";
      return `
        <div class="editor-context-menu-submenu">
          <button class="editor-context-menu-item" type="button" role="menuitem" aria-haspopup="true">
            <i class="bi bi-code-slash" aria-hidden="true"></i>
            <span>Source</span>
            <i class="bi bi-chevron-right editor-context-menu-submenu-arrow" aria-hidden="true"></i>
          </button>
          <div class="editor-context-menu-submenu-panel" role="menu">
            ${sourceActions.map(renderEditorContextAction).join('')}
          </div>
        </div>
      `;
    }

    function renderEditorRefactorSubmenu(refactorActions) {
      if (!refactorActions.length) return "";
      return renderEditorSourceSubmenu(refactorActions)
        .replace("bi-code-slash", "bi-tools")
        .replace("<span>Source</span>", "<span>Refactor</span>");
    }

    function renderEditorContextAction(action) {
      if (action?.type === 'separator') {
        return '<div class="editor-context-menu-divider" role="separator"></div>';
      }
      if (Array.isArray(action?.children)) {
        return `
          <div class="editor-context-menu-submenu">
            <button class="editor-context-menu-item" type="button" role="menuitem" aria-haspopup="true">
              <i class="bi ${action.icon || 'bi-braces'}" aria-hidden="true"></i>
              <span>${escapeHtml(action.label || '')}</span>
              <i class="bi bi-chevron-right editor-context-menu-submenu-arrow" aria-hidden="true"></i>
            </button>
            <div class="editor-context-menu-submenu-panel" role="menu">
              ${action.children.map(renderEditorContextAction).join('')}
            </div>
          </div>
        `;
      }
      return renderEditorContextActionButton(action);
    }

    function renderEditorContextActionButton(action) {
      return `
        <button class="editor-context-menu-item" type="button" role="menuitem" data-editor-context-action="${action.id || action.type}"${action.disabled ? " disabled aria-disabled=\"true\"" : ""}${action.title ? ` title="${escapeHtml(action.title)}"` : ""}>
          <i class="bi ${action.icon}" aria-hidden="true"></i>
          <span>${escapeHtml(action.label)}</span>
          ${action.shortcut ? `<kbd>${escapeHtml(action.shortcut)}</kbd>` : ""}
        </button>
      `;
    }

    function prepareEditorSourceActions(clientX, clientY, renderToken, renderMenu) {
      const sourceActions = getSourceActions();
      const context = getEditorSourceActionContext();
      if (typeof sourceActions?.prepareAvailableActions !== 'function') return;
      void sourceActions.prepareAvailableActions(context).then(function(changed) {
        if (!changed || renderToken !== editorContextMenuRenderToken || editorContextMenu?.classList.contains('hidden')) return;
        if (JSON.stringify(context.selection) !== JSON.stringify(editorContextMenuSelection) || context.source !== getEditorValue()) return;
        // Replacing the menu under the pointer collapses open nested submenus. Prepared actions remain cached for the next opening.
        if (editorContextMenu.matches(':hover')) return;
        renderMenu(clientX, clientY, true);
      });
    }

    function renderEditorFoldContextMenu(clientX, clientY, skipPreparation = false) {
      const renderToken = editorContextMenuRenderToken;
      const menu = getEditorContextMenu();
      const sourceActions = getEditorSourceActions();
      const rootActionGroups = splitEditorDebugRootActions(getEditorRootActions());
      const debuggerActions = getEditorDebuggerActions();
      const debuggerMenuActions = splitEditorDebuggerActions(debuggerActions);
      const refactorActions = getEditorRefactorActions();
      const rootWithRefactorActions = insertEditorRefactorSubmenuAfterSurround(rootActionGroups.rootActions, refactorActions);
      const rootMenuActions = insertEditorDebugSubmenuAfterSurround(rootWithRefactorActions, debuggerMenuActions.quickActions, rootActionGroups.debugRootActions);
      const sharedContextActions = getEditorSharedContextActions();
      const browserLikeActions = sourceActions.length || debuggerActions.length ? sharedContextActions.slice(1) : sharedContextActions;
      const editAction = getEditorEditAction(false);
      menu.innerHTML = `
        <div class="editor-context-menu-items editor-context-menu-native-items">
          ${browserLikeActions.map(renderEditorContextActionButton).join("")}
          ${renderEditorContextAction(editAction)}
          ${renderEditorSourceSubmenu(sourceActions)}
          ${rootMenuActions.map(renderEditorContextAction).join("")}
        </div>
      `;

      menu.querySelectorAll("[data-editor-context-action]").forEach(function(button) {
        button.addEventListener("click", function() {
          runEditorContextMenuAction(button.dataset.editorContextAction);
        });
      });

      positionEditorContextMenu(menu, clientX, clientY);
      if (!skipPreparation) prepareEditorSourceActions(clientX, clientY, renderToken, renderEditorFoldContextMenu);
    }

    function renderEditorContextMenu(clientX, clientY, skipPreparation = false) {
      const renderToken = editorContextMenuRenderToken;
      const menu = getEditorContextMenu();
      const caseToggleAction = editorSelectionMatchCaseSensitive ? "ignore-case" : "case-sensitive";
      const caseToggleLabel = editorSelectionMatchCaseSensitive ? "Ignore case" : "Case sensitive";
      const canConvertMarkdownSelection = canShowMarkdownConversionSection();
      const sharedContextActions = getEditorSharedContextActions();
      const sourceActions = getEditorSourceActions();
      const rootActionGroups = splitEditorDebugRootActions(getEditorRootActions());
      const debuggerActions = getEditorDebuggerActions();
      const debuggerMenuActions = splitEditorDebuggerActions(debuggerActions);
      const refactorActions = getEditorRefactorActions();
      const rootWithRefactorActions = insertEditorRefactorSubmenuAfterSurround(rootActionGroups.rootActions, refactorActions);
      const rootMenuActions = insertEditorDebugSubmenuAfterSurround(rootWithRefactorActions, debuggerMenuActions.quickActions, rootActionGroups.debugRootActions);
      const visibleSharedContextActions = sourceActions.length || debuggerActions.length ? sharedContextActions.slice(1) : sharedContextActions;
      const browserLikeActions = [
        ...visibleSharedContextActions,
        { type: caseToggleAction, label: caseToggleLabel, shortcut: "", icon: editorSelectionMatchCaseSensitive ? "bi-type" : "bi-type-bold" }
      ];
      const editAction = getEditorEditAction(true);

      menu.innerHTML = `
        <div class="editor-context-menu-items editor-context-menu-native-items">
          ${browserLikeActions.map(renderEditorContextActionButton).join("")}
          ${renderEditorContextAction(editAction)}
          ${renderEditorSourceSubmenu(sourceActions)}
          ${rootMenuActions.map(renderEditorContextAction).join("")}
        </div>
        ${canConvertMarkdownSelection ? `
          <div class="editor-context-menu-divider" role="separator"></div>
          <div class="editor-context-menu-title">Convert selection</div>
          <div class="editor-context-menu-items editor-context-menu-conversion-items">
            ${editorMarkdownActions.map((action) => `
              <button class="editor-context-menu-item" type="button" role="menuitem" data-markdown-action="${action.type}">
                <i class="bi ${action.icon}" aria-hidden="true"></i>
                <span>${escapeHtml(action.label)}</span>
              </button>
            `).join("")}
          </div>
        ` : ""}
      `;

      menu.querySelectorAll("[data-markdown-action]").forEach(function(button) {
        button.addEventListener("click", function() {
          replaceEditorSelectionWithMarkdown(button.dataset.markdownAction);
        });
      });
      menu.querySelectorAll("[data-editor-context-action]").forEach(function(button) {
        button.addEventListener("click", function() {
          runEditorContextMenuAction(button.dataset.editorContextAction);
        });
      });

      positionEditorContextMenu(menu, clientX, clientY);
      if (!skipPreparation) prepareEditorSourceActions(clientX, clientY, renderToken, renderEditorContextMenu);
    }

    function handleEditorContextMenu(event) {
      const { start: selectionStart, end: selectionEnd } = getEditorSelection();

      event.preventDefault();
      hideLinkAutocomplete();
      editorContextMenuRenderToken += 1;

      if (selectionStart === selectionEnd) {
        editorContextMenuSelection = { start: selectionStart, end: selectionEnd };
        renderEditorFoldContextMenu(event.clientX, event.clientY);
        return;
      }

      editorContextMenuSelection = { start: selectionStart, end: selectionEnd };
      renderEditorContextMenu(event.clientX, event.clientY);
    }

    function contains(target) {
      return !!(editorContextMenu && editorContextMenu.contains(target));
    }

    const api = {
      contains,
      convertSelectionToMarkdown,
      applyMarkdownActionToSelection,
      formatEditorDocument,
      organizeJavaImports,
      replaceSelectionWithText,
      replaceRangeWithText,
      getEditorSelectionMatchCaseSensitive,
      hideEditorContextMenu,
      handleEditorContextMenu,
      runJsonEditCommand,
      runXmlEditCommand,
      convertLessDocumentToCss,
      redoEditorContextMenuConversion,
      undoEditorContextMenuConversion
    };

    app.registerModule("editorContextMenu", api);
    return api;
  }

  window.registerMarkdownViewerEditorContextMenu = registerMarkdownViewerEditorContextMenu;
})(window, document);



