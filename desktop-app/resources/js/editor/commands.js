(function(global) {
  "use strict";

  const DEFAULT_SPACES_PER_INDENT_LEVEL = 4;
  const DEFAULT_TABS_PER_INDENT_LEVEL = 1;

  function normalizeIndentUnit(value, fallback) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.max(1, Math.min(16, Math.floor(numericValue)));
  }

  function normalizeSpacesPerIndentLevel(value) {
    return normalizeIndentUnit(value, DEFAULT_SPACES_PER_INDENT_LEVEL);
  }

  function normalizeTabsPerIndentLevel(value) {
    return normalizeIndentUnit(value, DEFAULT_TABS_PER_INDENT_LEVEL);
  }

  function invertCase(text) {
    return String(text || "").replace(/[A-Za-z]/g, function(character) {
      const upper = character.toUpperCase();
      const lower = character.toLowerCase();
      return character === upper ? lower : upper;
    });
  }

  function toTitleCase(text) {
    return String(text || "").toLowerCase().replace(/\b([\p{L}\p{N}])/gu, function(match) {
      return match.toUpperCase();
    });
  }

  function transformLines(text, transformLine) {
    return String(text || "").replace(/[^\r\n]*(?:\r\n|\r|\n|$)/g, function(line) {
      if (line === "") return "";
      const endingMatch = line.match(/(\r\n|\r|\n)$/);
      const ending = endingMatch ? endingMatch[0] : "";
      const content = ending ? line.slice(0, -ending.length) : line;
      return transformLine(content) + ending;
    });
  }

  /** Resolve the complete editor word nearest a diagnostic character offset. */
  function getWordRangeNearOffset(text, offset) {
    const source = String(text || "");
    const position = Math.max(0, Math.min(source.length, Number(offset) || 0));
    const lineStart = source.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
    const nextLineBreak = source.indexOf("\n", position);
    const lineEnd = nextLineBreak < 0 ? source.length : nextLineBreak;
    const isWordCharacterAt = function(index) {
      return index >= lineStart && index < lineEnd && /[\p{L}\p{N}\p{Pc}$]/u.test(source.charAt(index));
    };
    let wordOffset = [position, position + 1, position - 1].find(isWordCharacterAt);
    if (wordOffset === undefined) {
      let right = position;
      while (right < lineEnd && !isWordCharacterAt(right)) right += 1;
      let left = Math.min(position - 1, lineEnd - 1);
      while (left >= lineStart && !isWordCharacterAt(left)) left -= 1;
      const rightDistance = isWordCharacterAt(right) ? right - position : Number.POSITIVE_INFINITY;
      const leftDistance = isWordCharacterAt(left) ? position - left : Number.POSITIVE_INFINITY;
      wordOffset = rightDistance <= leftDistance ? right : left;
    }
    if (!isWordCharacterAt(wordOffset)) return { start: position, end: position };
    let start = wordOffset;
    let end = wordOffset + 1;
    while (start > lineStart && isWordCharacterAt(start - 1)) start -= 1;
    while (end < lineEnd && isWordCharacterAt(end)) end += 1;
    return { start, end };
  }

  function getSortLineEnding(text) {
    const match = String(text || "").match(/\r\n|\r|\n/);
    return match ? match[0] : "\n";
  }

  function normalizeSortGroup(group, fallback) {
    const source = group || {};
    const from = Number(source.from);
    const length = Number(source.length);
    const normalized = {
      from: Number.isFinite(from) ? Math.max(1, Math.floor(from)) : fallback.from,
      length: Number.isFinite(length) ? Math.max(1, Math.floor(length)) : fallback.length,
      descending: source.descending === true,
      comparison: ["case-sensitive", "case-insensitive", "numeric"].includes(source.comparison)
        ? source.comparison
        : fallback.comparison
    };
    normalized.enabled = source.enabled === true || fallback.enabled === true;
    return normalized;
  }

  function normalizeSortOptions(options = {}) {
    const groups = Array.isArray(options.groups) ? options.groups : [];
    const normalizedGroups = [
      normalizeSortGroup(groups[0], { from: 1, length: 500, comparison: "case-insensitive", enabled: true }),
      normalizeSortGroup(groups[1], { from: 1, length: 1, comparison: "case-insensitive", enabled: false }),
      normalizeSortGroup(groups[2], { from: 1, length: 1, comparison: "case-insensitive", enabled: false })
    ];
    return {
      inCharacterCodeOrder: options.inCharacterCodeOrder === true,
      deleteDuplicateLines: options.deleteDuplicateLines === true,
      groups: normalizedGroups.filter((group) => group.enabled)
    };
  }

  function getSortKey(line, group) {
    const start = Math.max(0, group.from - 1);
    return String(line || "").slice(start, start + group.length);
  }

  function compareSortValues(leftValue, rightValue, group, inCharacterCodeOrder) {
    if (inCharacterCodeOrder) {
      if (leftValue < rightValue) return -1;
      if (leftValue > rightValue) return 1;
      return 0;
    }
    if (group.comparison === "numeric") {
      const leftNumber = Number(leftValue.trim());
      const rightNumber = Number(rightValue.trim());
      const leftValid = Number.isFinite(leftNumber);
      const rightValid = Number.isFinite(rightNumber);
      if (leftValid && rightValid && leftNumber !== rightNumber) return leftNumber - rightNumber;
      if (leftValid !== rightValid) return leftValid ? -1 : 1;
      return 0;
    }
    const leftText = group.comparison === "case-sensitive" ? leftValue : leftValue.toLocaleLowerCase();
    const rightText = group.comparison === "case-sensitive" ? rightValue : rightValue.toLocaleLowerCase();
    return leftText.localeCompare(rightText);
  }

  function compareSortLines(leftLine, rightLine, options) {
    for (const group of options.groups) {
      const comparison = compareSortValues(
        getSortKey(leftLine, group),
        getSortKey(rightLine, group),
        group,
        options.inCharacterCodeOrder
      );
      if (comparison !== 0) return group.descending ? -comparison : comparison;
    }
    return 0;
  }

  function compareDuplicateLines(leftLine, rightLine, options) {
    const group = options.groups[0] || { comparison: "case-insensitive" };
    return compareSortValues(String(leftLine || ""), String(rightLine || ""), group, options.inCharacterCodeOrder);
  }

  function sortDocumentLines(text, options = {}) {
    const source = String(text || "");
    const lineEnding = getSortLineEnding(source);
    const normalizedOptions = normalizeSortOptions(options);
    const lines = source.split(/\r\n|\r|\n/);
    if (lines.length < 2 || !normalizedOptions.groups.length) return source;
    let sortedLines = lines
      .map((line, index) => ({ line, index }))
      .sort(function(left, right) {
        const comparison = compareSortLines(left.line, right.line, normalizedOptions);
        return comparison || left.index - right.index;
      })
      .map((entry) => entry.line);
    if (normalizedOptions.deleteDuplicateLines) {
      sortedLines = sortedLines.filter(function(line, index) {
        return index === 0 || compareDuplicateLines(sortedLines[index - 1], line, normalizedOptions) !== 0;
      });
    }
    return sortedLines.join(lineEnding);
  }

  function trimLeadingSpace(text) {
    return transformLines(text, function(line) {
      return line.replace(/^[ \t]+/, "");
    });
  }

  function trimTrailingSpace(text) {
    return transformLines(text, function(line) {
      return line.replace(/[ \t]+$/, "");
    });
  }

  function trimLeadingAndTrailingSpace(text) {
    return transformLines(text, function(line) {
      return line.replace(/^[ \t]+|[ \t]+$/g, "");
    });
  }

  function tabToSpace(text, options = {}) {
    const spaces = " ".repeat(normalizeSpacesPerIndentLevel(options.spacesPerIndentLevel));
    const tabsPerLevel = normalizeTabsPerIndentLevel(options.tabsPerIndentLevel);
    return transformLines(text, function(line) {
      return line.replace(/^\t+/, function(tabs) {
        const fullLevels = Math.floor(tabs.length / tabsPerLevel);
        const remainder = tabs.length % tabsPerLevel;
        return spaces.repeat(fullLevels) + "\t".repeat(remainder);
      });
    });
  }

  function spaceToTab(text, options = {}) {
    const spacesPerLevel = normalizeSpacesPerIndentLevel(options.spacesPerIndentLevel);
    const tabs = "\t".repeat(normalizeTabsPerIndentLevel(options.tabsPerIndentLevel));
    return transformLines(text, function(line) {
      return line.replace(/^ +/, function(spaces) {
        const fullLevels = Math.floor(spaces.length / spacesPerLevel);
        const remainder = spaces.length % spacesPerLevel;
        return tabs.repeat(fullLevels) + " ".repeat(remainder);
      });
    });
  }

  function getDuplicateCurrentLineEdit(value, cursor) {
    const text = String(value || "");
    const position = Math.max(0, Math.min(text.length, Number(cursor) || 0));
    const lineStart = text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
    const nextNewline = text.indexOf("\n", position);
    const hasLineEnding = nextNewline !== -1;
    const lineEnd = hasLineEnding ? nextNewline : text.length;
    const lineText = text.slice(lineStart, lineEnd);
    const insertPosition = hasLineEnding ? lineEnd + 1 : lineEnd;
    const insertion = hasLineEnding ? `${lineText}\n` : `${text.length ? "\n" : ""}${lineText}`;
    const nextCursor = hasLineEnding ? insertPosition : insertPosition + (text.length ? 1 : 0);
    return { insertPosition, insertion, nextCursor };
  }

  function registerMarkdownViewerActiveEditorCommands(app, deps) {
    const fallbackEditor = deps.markdownEditor || null;

    function getActiveEditor() {
      return app.services?.editorViewManager?.getActiveMarkdownEditor?.() || fallbackEditor;
    }

    function getActiveEditorValue() {
      return getActiveEditor()?.value || "";
    }

    function getActiveEditorScroll() {
      const editor = getActiveEditor();
      return {
        top: editor?.scrollTop || 0,
        left: editor?.scrollLeft || 0
      };
    }

    function setActiveEditorValue(value) {
      const editor = getActiveEditor();
      if (editor) editor.value = String(value || "");
    }

    function setActiveEditorScroll(top, left) {
      const editor = getActiveEditor();
      if (!editor) return;
      if (Number.isFinite(top)) editor.scrollTop = top;
      if (Number.isFinite(left)) editor.scrollLeft = left;
    }

    function getActiveEditorSelection() {
      const editor = getActiveEditor();
      const start = editor?.selectionStart || 0;
      const end = editor?.selectionEnd || start;
      return {
        start: Math.min(start, end),
        end: Math.max(start, end)
      };
    }

    function setActiveEditorSelection(start, end) {
      const editor = getActiveEditor();
      if (!editor) return;
      const valueLength = editor.value.length;
      const selectionStart = Math.max(0, Math.min(valueLength, Number(start) || 0));
      const selectionEnd = Math.max(selectionStart, Math.min(valueLength, Number(end) || selectionStart));
      if (typeof editor.setSelectionRange === "function") {
        editor.setSelectionRange(selectionStart, selectionEnd);
      } else {
        editor.selectionStart = selectionStart;
        editor.selectionEnd = selectionEnd;
      }
    }

    function focusActiveEditor(options) {
      getActiveEditor()?.focus?.(options);
    }

    function isActiveEditorFocused() {
      const codeMirrorEditor = deps.getCodeMirrorEditor?.();
      if (typeof codeMirrorEditor?.isFocused === "function" && codeMirrorEditor.isFocused()) return true;
      return document.activeElement === getActiveEditor();
    }

    function dispatchActiveEditorInput() {
      const editor = getActiveEditor();
      if (editor) editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function refreshActiveEditorUi() {
      deps.updateEditorLineNumbers?.();
      deps.updateEditorSelectionHighlights?.();
      deps.updateStatusLine?.();
    }

    function replaceActiveEditorRange(start, end, text) {
      const editor = getActiveEditor();
      if (!editor) return false;
      const value = editor.value || "";
      const selectionStart = Math.max(0, Math.min(value.length, Number(start) || 0));
      const selectionEnd = Math.max(selectionStart, Math.min(value.length, Number(end) || selectionStart));
      const replacement = String(text || "");
      const codeMirrorEditor = deps.getCodeMirrorEditor?.();
      focusActiveEditor();
      setActiveEditorSelection(selectionStart, selectionEnd);
      if (typeof codeMirrorEditor?.replaceRange === "function" && codeMirrorEditor.replaceRange(selectionStart, selectionEnd, replacement)) {
        return true;
      }
      if (document.queryCommandSupported?.("insertText")) {
        try {
          const inserted = document.execCommand("insertText", false, replacement);
          if (inserted) {
            dispatchActiveEditorInput();
            refreshActiveEditorUi();
            return true;
          }
        } catch (_) {}
      }
      editor.value = value.slice(0, selectionStart) + replacement + value.slice(selectionEnd);
      setActiveEditorSelection(selectionStart + replacement.length, selectionStart + replacement.length);
      dispatchActiveEditorInput();
      refreshActiveEditorUi();
      return true;
    }

    function replaceActiveEditorSelection(text) {
      const selection = getActiveEditorSelection();
      return replaceActiveEditorRange(selection.start, selection.end, text);
    }

    function getSelectedOrCurrentLineRange() {
      const value = getActiveEditorValue();
      const selection = getActiveEditorSelection();
      let start = selection.start;
      let end = selection.end;
      const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      let lineEnd;
      if (start === end) {
        const nextNewline = value.indexOf("\n", end);
        lineEnd = nextNewline === -1 ? value.length : nextNewline;
      } else {
        const adjustedEnd = end > start && value.charAt(end - 1) === "\n" ? end - 1 : end;
        const nextNewline = value.indexOf("\n", adjustedEnd);
        lineEnd = nextNewline === -1 ? value.length : nextNewline;
      }
      return { start: lineStart, end: lineEnd };
    }

    function replaceSelectedOrCurrentLines(transformLineRange) {
      const value = getActiveEditorValue();
      const range = getSelectedOrCurrentLineRange();
      const selectedText = value.slice(range.start, range.end);
      return replaceActiveEditorRange(range.start, range.end, transformLineRange(selectedText));
    }

    function runCodeMirrorCommand(methodName) {
      const codeMirrorEditor = deps.getCodeMirrorEditor?.();
      if (typeof codeMirrorEditor?.[methodName] !== "function") return false;
      const handled = codeMirrorEditor[methodName]();
      if (handled) refreshActiveEditorUi();
      return !!handled;
    }

    function runNativeEditorCommand(command) {
      focusActiveEditor();
      try {
        return !!document.execCommand?.(command);
      } catch (_) {
        return false;
      }
    }

    async function cutSelection() {
      const selection = getActiveEditorSelection();
      if (selection.start === selection.end) return false;
      const text = getActiveEditorValue().slice(selection.start, selection.end);
      try {
        await navigator.clipboard?.writeText?.(text);
      } catch (_) {
        if (runNativeEditorCommand("cut")) return true;
      }
      return replaceActiveEditorRange(selection.start, selection.end, "");
    }

    async function copySelection() {
      const selection = getActiveEditorSelection();
      const value = getActiveEditorValue();
      if (selection.start === selection.end) return false;
      const text = value.slice(selection.start, selection.end);
      try {
        await navigator.clipboard?.writeText?.(text);
        return true;
      } catch (_) {
        return runNativeEditorCommand("copy");
      }
    }

    async function pasteClipboard() {
      try {
        const text = await navigator.clipboard?.readText?.();
        return replaceActiveEditorSelection(text || "");
      } catch (_) {
        return runNativeEditorCommand("paste");
      }
    }

    function deleteSelection() {
      const selection = getActiveEditorSelection();
      if (selection.start === selection.end) return false;
      return replaceActiveEditorRange(selection.start, selection.end, "");
    }

    function selectAll() {
      setActiveEditorSelection(0, getActiveEditorValue().length);
      focusActiveEditor();
      refreshActiveEditorUi();
      return true;
    }

    function duplicateCurrentLine() {
      const value = getActiveEditorValue();
      const selection = getActiveEditorSelection();
      const { insertPosition, insertion, nextCursor } = getDuplicateCurrentLineEdit(value, selection.end);
      if (!replaceActiveEditorRange(insertPosition, insertPosition, insertion)) return false;
      setActiveEditorSelection(nextCursor, nextCursor);
      focusActiveEditor();
      refreshActiveEditorUi();
      return true;
    }

    function transformSelection(transformText) {
      const selection = getActiveEditorSelection();
      const value = getActiveEditorValue();
      const sourceStart = selection.start === selection.end ? 0 : selection.start;
      const sourceEnd = selection.start === selection.end ? value.length : selection.end;
      const replacement = transformText(value.slice(sourceStart, sourceEnd));
      return replaceActiveEditorRange(sourceStart, sourceEnd, replacement);
    }

    /**
     * Replace one path separator with another within the current non-empty selection.
     * @param {string} sourceSeparator - Separator to replace.
     * @param {string} targetSeparator - Separator to insert.
     * @returns {boolean} Whether the selected text was changed.
     */
    function replaceSelectedPathSeparators(sourceSeparator, targetSeparator) {
      const selection = getActiveEditorSelection();
      if (selection.start === selection.end) return false;
      const selectedText = getActiveEditorValue().slice(selection.start, selection.end);
      const replacement = selectedText.split(sourceSeparator).join(targetSeparator);
      if (replacement === selectedText) return false;
      return replaceActiveEditorRange(selection.start, selection.end, replacement);
    }

    function getIndentOptions() {
      return {
        spacesPerIndentLevel: deps.getSpacesPerIndentLevel?.() || DEFAULT_SPACES_PER_INDENT_LEVEL,
        tabsPerIndentLevel: deps.getTabsPerIndentLevel?.() || DEFAULT_TABS_PER_INDENT_LEVEL
      };
    }

    function increaseLineIndentFallback() {
      const options = getIndentOptions();
      const indent = " ".repeat(normalizeSpacesPerIndentLevel(options.spacesPerIndentLevel));
      return replaceSelectedOrCurrentLines((text) => transformLines(text, (line) => indent + line));
    }

    function decreaseLineIndentFallback() {
      const options = getIndentOptions();
      const spacesPerLevel = normalizeSpacesPerIndentLevel(options.spacesPerIndentLevel);
      const tabsPerLevel = normalizeTabsPerIndentLevel(options.tabsPerIndentLevel);
      const tabIndent = "\t".repeat(tabsPerLevel);
      const spaceIndent = " ".repeat(spacesPerLevel);
      return replaceSelectedOrCurrentLines((text) => transformLines(text, function(line) {
        if (line.startsWith(spaceIndent)) return line.slice(spacesPerLevel);
        if (line.startsWith(tabIndent)) return line.slice(tabsPerLevel);
        if (line.startsWith("\t")) return line.slice(1);
        const leadingSpaces = line.match(/^ +/)?.[0] || "";
        if (leadingSpaces) return line.slice(Math.min(leadingSpaces.length, spacesPerLevel));
        return line;
      }));
    }

    function setActiveEditorBookmarkedLines(lineNumbers) {
      const codeMirrorEditor = deps.getCodeMirrorEditor?.();
      return typeof codeMirrorEditor?.setBookmarkedLines === "function"
        ? codeMirrorEditor.setBookmarkedLines(lineNumbers)
        : false;
    }

    function clearActiveEditorBookmarkedLines() {
      const codeMirrorEditor = deps.getCodeMirrorEditor?.();
      return typeof codeMirrorEditor?.clearBookmarkedLines === "function"
        ? codeMirrorEditor.clearBookmarkedLines()
        : false;
    }

    const api = {
      getActiveEditor,
      getActiveEditorValue,
      getActiveEditorScroll,
      setActiveEditorValue,
      setActiveEditorScroll,
      getActiveEditorSelection,
      setActiveEditorSelection,
      getActiveEditorWordRangeNearOffset: function(offset) {
        return getWordRangeNearOffset(getActiveEditorValue(), offset);
      },
      focusActiveEditor,
      isActiveEditorFocused,
      undo: function() { return runCodeMirrorCommand("undo") || runNativeEditorCommand("undo"); },
      redo: function() { return runCodeMirrorCommand("redo") || runNativeEditorCommand("redo"); },
      cutSelection,
      copySelection,
      pasteClipboard,
      deleteSelection,
      selectAll,
      duplicateCurrentLine,
      increaseLineIndent: function() { return runCodeMirrorCommand("indentMore") || increaseLineIndentFallback(); },
      decreaseLineIndent: function() { return runCodeMirrorCommand("indentLess") || decreaseLineIndentFallback(); },
      correctIndentation: function() { return runCodeMirrorCommand("correctIndentation"); },
      canFormatActiveDocument: function() {
        return deps.getCodeMirrorEditor?.()?.canFormatActiveDocument?.() === true;
      },
      formatActiveDocument: async function() {
        const codeMirrorEditor = deps.getCodeMirrorEditor?.();
        return typeof codeMirrorEditor?.formatActiveDocument === "function"
          ? codeMirrorEditor.formatActiveDocument()
          : false;
      },
      getCommentCapabilities: function() {
        return deps.getCodeMirrorEditor?.()?.getCommentCapabilities?.() || { canToggleComment: false, canToggleBlockComment: false };
      },
      toggleComment: function() { return runCodeMirrorCommand("toggleComment"); },
      toggleBlockComment: function() { return runCodeMirrorCommand("toggleBlockComment"); },
      startAutocomplete: function() { return runCodeMirrorCommand("startCompletion"); },
      setDocumentWordAutocomplete: function(enabled) {
        const codeMirrorEditor = deps.getCodeMirrorEditor?.();
        if (typeof codeMirrorEditor?.setDocumentWordAutocomplete === "function") {
          codeMirrorEditor.setDocumentWordAutocomplete(enabled === true);
          return true;
        }
        return false;
      },
      setAutocompletePreferences: function(preferences) {
        const codeMirrorEditor = deps.getCodeMirrorEditor?.();
        if (typeof codeMirrorEditor?.setAutocompletePreferences === "function") {
          codeMirrorEditor.setAutocompletePreferences(preferences || {});
          return true;
        }
        return false;
      },
      transformToUppercase: function() { return transformSelection((text) => text.toUpperCase()); },
      transformToLowercase: function() { return transformSelection((text) => text.toLowerCase()); },
      transformToTitleCase: function() { return transformSelection(toTitleCase); },
      invertSelectionCase: function() { return transformSelection(invertCase); },
      replaceSelectedPathSeparators,
      trimSelectedTrailingSpace: function() { return transformSelection(trimTrailingSpace); },
      trimSelectedLeadingSpace: function() { return transformSelection(trimLeadingSpace); },
      trimSelectedLeadingAndTrailingSpace: function() { return transformSelection(trimLeadingAndTrailingSpace); },
      selectedTabsToSpaces: function() { return replaceSelectedOrCurrentLines((text) => tabToSpace(text, getIndentOptions())); },
      selectedSpacesToTabs: function() { return replaceSelectedOrCurrentLines((text) => spaceToTab(text, getIndentOptions())); },
      sortCurrentDocumentLines: function(options) {
        const value = getActiveEditorValue();
        const replacement = sortDocumentLines(value, options);
        if (replacement === value) return false;
        if (!replaceActiveEditorRange(0, value.length, replacement)) return false;
        setActiveEditorSelection(0, 0);
        focusActiveEditor();
        refreshActiveEditorUi();
        return true;
      },
      setActiveEditorBookmarkedLines,
      clearActiveEditorBookmarkedLines,
      replaceActiveEditorRange,
      dispatchActiveEditorInput
    };

    app.services.activeEditorCommands = api;
    app.registerModule?.("activeEditorCommands", api);
    return api;
  }

  registerMarkdownViewerActiveEditorCommands._test = {
    DEFAULT_SPACES_PER_INDENT_LEVEL,
    DEFAULT_TABS_PER_INDENT_LEVEL,
    invertCase,
    normalizeSpacesPerIndentLevel,
    normalizeTabsPerIndentLevel,
    getDuplicateCurrentLineEdit,
    getWordRangeNearOffset,
    spaceToTab,
    sortDocumentLines,
    tabToSpace,
    toTitleCase,
    trimLeadingAndTrailingSpace,
    trimLeadingSpace,
    trimTrailingSpace
  };

  global.registerMarkdownViewerActiveEditorCommands = registerMarkdownViewerActiveEditorCommands;
})(typeof window !== "undefined" ? window : globalThis);
