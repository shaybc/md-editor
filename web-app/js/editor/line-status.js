(function(window, document) {
  "use strict";

  function registerMarkdownViewerEditorLineStatus(app, deps) {
    const markdownEditor = deps.markdownEditor;
    const editorLineNumbers = deps.editorLineNumbers;
    const editorCurrentLine = deps.editorCurrentLine;
    const editorSelectionHighlights = deps.editorSelectionHighlights;
    const escapeHtml = deps.escapeHtml;
    const getEditorSelectionMatchCaseSensitive = deps.getEditorSelectionMatchCaseSensitive || function() { return true; };

    let editorLineMeasure = null;
    let editorLineNumberResizeFrame = null;
    const editorCurrentLineMetrics = { top: 0, height: 0 };

    function getEditorLineHeight(computedStyle) {
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
      measure.style.width = `${markdownEditor.clientWidth}px`;
    }

    function syncEditorOverlayMetrics() {
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
      return markdownEditor.value.slice(0, markdownEditor.selectionStart || 0).split("\n").length;
    }

    function updateEditorCurrentLineHighlight(activeLine, wrappedLineHeights, computedStyle) {
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
      if (!editorSelectionHighlights) return;

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
      if (!editorSelectionHighlights) return;

      const inner = editorSelectionHighlights.querySelector(".editor-selection-highlights-inner");
      if (!inner) return;

      inner.style.transform = `translate(${-markdownEditor.scrollLeft}px, ${-markdownEditor.scrollTop}px)`;
    }

    function syncEditorCurrentLineScroll() {
      if (!editorCurrentLine) return;
      editorCurrentLine.style.transform = `translateY(${editorCurrentLineMetrics.top - markdownEditor.scrollTop}px)`;
    }

    function syncEditorLineNumberScroll() {
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
