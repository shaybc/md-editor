(function(window, document) {
  "use strict";

  function registerMarkdownViewerEditorLineStatus(app, deps) {
    const fallbackMarkdownEditor = deps.markdownEditor;
    const fallbackEditorLineNumbers = deps.editorLineNumbers;
    const fallbackEditorCurrentLine = deps.editorCurrentLine;
    const fallbackEditorSelectionHighlights = deps.editorSelectionHighlights;
    const getActiveMarkdownEditor = deps.getActiveMarkdownEditor || function() { return fallbackMarkdownEditor; };
    const getActiveOverlay = deps.getActiveOverlay || function(name) {
      if (name === "editorLineNumbers") return fallbackEditorLineNumbers;
      if (name === "editorCurrentLine") return fallbackEditorCurrentLine;
      if (name === "editorSelectionHighlights") return fallbackEditorSelectionHighlights;
      return null;
    };
    const escapeHtml = deps.escapeHtml;
    const getEditorSelectionMatchCaseSensitive = deps.getEditorSelectionMatchCaseSensitive || function() { return true; };

    let editorLineMeasure = null;
    let editorLineNumberResizeFrame = null;
    const editorCurrentLineMetrics = { top: 0, height: 0 };

    function isCodeMirrorBackedEditor(markdownEditor = getActiveMarkdownEditor()) {
      return !!(markdownEditor?.parentElement?.classList?.contains("codemirror-enabled"));
    }

    function clearLegacyEditorOverlays() {
      const editorLineNumbers = getActiveOverlay("editorLineNumbers");
      const editorCurrentLine = getActiveOverlay("editorCurrentLine");
      const editorSelectionHighlights = getActiveOverlay("editorSelectionHighlights");
      if (editorLineNumbers) editorLineNumbers.innerHTML = "";
      if (editorCurrentLine) {
        editorCurrentLine.classList.remove("visible");
        editorCurrentLine.style.height = "";
        editorCurrentLine.style.transform = "";
      }
      if (editorSelectionHighlights) editorSelectionHighlights.innerHTML = "";
    }

    function getEditorLineHeight(computedStyle) {
      const markdownEditor = getActiveMarkdownEditor();
      if (!markdownEditor) return 21;
      const style = computedStyle || window.getComputedStyle(markdownEditor);
      const parsedLineHeight = parseFloat(style.lineHeight);
      if (!Number.isNaN(parsedLineHeight)) return parsedLineHeight;
      const parsedFontSize = parseFloat(style.fontSize);
      return Number.isNaN(parsedFontSize) ? 21 : parsedFontSize * 1.5;
    }

    function getEditorLineMeasure() {
      if (!editorLineMeasure) {
        editorLineMeasure = document.createElement("textarea");
        editorLineMeasure.className = "editor-line-measure";
        editorLineMeasure.setAttribute("aria-hidden", "true");
        editorLineMeasure.setAttribute("tabindex", "-1");
        editorLineMeasure.setAttribute("wrap", "soft");
        document.body.appendChild(editorLineMeasure);
      }

      return editorLineMeasure;
    }

    function syncEditorLineMeasureStyles(measure, computedStyle) {
      const stylesToCopy = [
        "fontFamily",
        "fontSize",
        "fontWeight",
        "fontStyle",
        "lineHeight",
        "letterSpacing",
        "textTransform",
        "textIndent",
        "textRendering",
        "wordSpacing",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "borderTopWidth",
        "borderRightWidth",
        "borderBottomWidth",
        "borderLeftWidth",
        "boxSizing",
        "tabSize"
      ];

      stylesToCopy.forEach(function(property) {
        measure.style[property] = computedStyle[property];
      });
      const markdownEditor = getActiveMarkdownEditor();
      measure.style.width = `${markdownEditor?.clientWidth || 0}px`;
    }

    function syncEditorOverlayMetrics() {
      const markdownEditor = getActiveMarkdownEditor();
      if (!markdownEditor) return;
      const wrapper = markdownEditor.parentElement;
      if (!wrapper) return;

      const computedStyle = window.getComputedStyle(markdownEditor);
      const borderWidth = (parseFloat(computedStyle.borderLeftWidth) || 0)
        + (parseFloat(computedStyle.borderRightWidth) || 0);
      const scrollbarWidth = Math.max(0, markdownEditor.offsetWidth - markdownEditor.clientWidth - borderWidth);
      wrapper.style.setProperty("--editor-overlay-scrollbar-width", `${scrollbarWidth}px`);
    }

    function getEditorWrappedLineHeights(lines, computedStyle, lineHeight) {
      const measure = getEditorLineMeasure();
      const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
      const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
      const verticalPadding = paddingTop + paddingBottom;

      syncEditorLineMeasureStyles(measure, computedStyle);

      return lines.map(function(line) {
        measure.value = line || " ";
        return Math.max(lineHeight, Math.ceil(measure.scrollHeight - verticalPadding));
      });
    }

    function getCurrentEditorLine() {
      const markdownEditor = getActiveMarkdownEditor();
      if (!markdownEditor) return 1;
      return markdownEditor.value.slice(0, markdownEditor.selectionStart || 0).split("\n").length;
    }

    function updateEditorCurrentLineHighlight(activeLine, wrappedLineHeights, computedStyle) {
      const markdownEditor = getActiveMarkdownEditor();
      const editorCurrentLine = getActiveOverlay("editorCurrentLine");
      if (!editorCurrentLine) return;

      const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
      const activeLineIndex = Math.max(0, activeLine - 1);
      const top = paddingTop + wrappedLineHeights.slice(0, activeLineIndex).reduce(function(total, height) {
        return total + height;
      }, 0);
      const height = wrappedLineHeights[activeLineIndex] || getEditorLineHeight(computedStyle);

      editorCurrentLineMetrics.top = top;
      editorCurrentLineMetrics.height = height;
      editorCurrentLine.style.height = `${height}px`;
      editorCurrentLine.classList.add("visible");
      syncEditorCurrentLineScroll();
    }

    function updateEditorLineNumbers() {
      const markdownEditor = getActiveMarkdownEditor();
      const editorLineNumbers = getActiveOverlay("editorLineNumbers");
      if (!markdownEditor) return;
      if (isCodeMirrorBackedEditor(markdownEditor)) {
        clearLegacyEditorOverlays();
        return;
      }
      syncEditorOverlayMetrics();

      const lines = markdownEditor.value.split("\n");
      const activeLine = getCurrentEditorLine();
      const computedStyle = window.getComputedStyle(markdownEditor);
      const lineHeight = getEditorLineHeight(computedStyle);
      const wrappedLineHeights = getEditorWrappedLineHeights(lines, computedStyle, lineHeight);

      if (editorLineNumbers) {
        const lineNumbersMarkup = lines.map(function(_line, index) {
          const lineNumber = index + 1;
          const activeClass = lineNumber === activeLine ? " active" : "";
          return `<span class="editor-line-number${activeClass}" style="height:${wrappedLineHeights[index]}px">${lineNumber}</span>`;
        }).join("");

        editorLineNumbers.innerHTML = `<div class="editor-line-numbers-inner" style="transform: translateY(-${markdownEditor.scrollTop}px);">${lineNumbersMarkup}</div>`;
      }

      updateEditorCurrentLineHighlight(activeLine, wrappedLineHeights, computedStyle);
    }

    function scheduleEditorLineNumbersUpdate() {
      if (editorLineNumberResizeFrame) return;

      editorLineNumberResizeFrame = window.requestAnimationFrame(function() {
        editorLineNumberResizeFrame = null;
        updateEditorLineNumbers();
      });
    }

    function updateEditorSelectionHighlights() {
      const markdownEditor = getActiveMarkdownEditor();
      const editorSelectionHighlights = getActiveOverlay("editorSelectionHighlights");
      if (!editorSelectionHighlights) return;
      if (!markdownEditor) {
        editorSelectionHighlights.innerHTML = "";
        return;
      }
      if (isCodeMirrorBackedEditor(markdownEditor)) {
        clearLegacyEditorOverlays();
        return;
      }

      const text = markdownEditor.value;
      const selectionStart = Math.min(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0);
      const selectionEnd = Math.max(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0);
      const selectedText = text.slice(selectionStart, selectionEnd);

      if (!selectedText || selectedText.trim() === "") {
        editorSelectionHighlights.innerHTML = "";
        return;
      }

      let markup = "";
      let searchFrom = 0;
      const matchCase = getEditorSelectionMatchCaseSensitive();
      const searchableText = matchCase ? text : text.toLocaleLowerCase();
      const searchableSelection = matchCase ? selectedText : selectedText.toLocaleLowerCase();
      let matchIndex = searchableText.indexOf(searchableSelection, searchFrom);

      while (matchIndex !== -1) {
        const matchedText = text.slice(matchIndex, matchIndex + selectedText.length);
        markup += escapeHtml(text.slice(searchFrom, matchIndex));
        markup += `<span class="editor-selection-match">${escapeHtml(matchedText)}</span>`;
        searchFrom = matchIndex + selectedText.length;
        matchIndex = searchableText.indexOf(searchableSelection, searchFrom);
      }

      markup += escapeHtml(text.slice(searchFrom));
      editorSelectionHighlights.innerHTML = `<div class="editor-selection-highlights-inner">${markup}</div>`;
      syncEditorSelectionHighlightsScroll();
    }

    function syncEditorSelectionHighlightsScroll() {
      const markdownEditor = getActiveMarkdownEditor();
      const editorSelectionHighlights = getActiveOverlay("editorSelectionHighlights");
      if (!editorSelectionHighlights) return;
      if (!markdownEditor) return;

      const inner = editorSelectionHighlights.querySelector(".editor-selection-highlights-inner");
      if (!inner) return;

      inner.style.transform = `translate(${-markdownEditor.scrollLeft}px, ${-markdownEditor.scrollTop}px)`;
    }

    function syncEditorCurrentLineScroll() {
      const markdownEditor = getActiveMarkdownEditor();
      const editorCurrentLine = getActiveOverlay("editorCurrentLine");
      if (!editorCurrentLine) return;
      if (!markdownEditor) return;
      if (isCodeMirrorBackedEditor(markdownEditor)) return;
      editorCurrentLine.style.transform = `translateY(${editorCurrentLineMetrics.top - markdownEditor.scrollTop}px)`;
    }

    function syncEditorLineNumberScroll() {
      const markdownEditor = getActiveMarkdownEditor();
      const editorLineNumbers = getActiveOverlay("editorLineNumbers");
      if (!markdownEditor) return;
      if (isCodeMirrorBackedEditor(markdownEditor)) return;
      if (editorLineNumbers) {
        const inner = editorLineNumbers.querySelector(".editor-line-numbers-inner");
        if (inner) {
          inner.style.transform = `translateY(-${markdownEditor.scrollTop}px)`;
        }
      }
      syncEditorCurrentLineScroll();
    }

    const api = {
      getCurrentEditorLine,
      getEditorLineHeight,
      isCodeMirrorBackedEditor,
      scheduleEditorLineNumbersUpdate,
      syncEditorOverlayMetrics,
      syncEditorCurrentLineScroll,
      syncEditorLineNumberScroll,
      syncEditorSelectionHighlightsScroll,
      updateEditorLineNumbers,
      updateEditorSelectionHighlights
    };

    app.registerModule("editorLineStatus", api);
    return api;
  }

  window.registerMarkdownViewerEditorLineStatus = registerMarkdownViewerEditorLineStatus;
})(window, document);
