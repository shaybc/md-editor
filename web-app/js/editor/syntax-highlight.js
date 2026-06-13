(function(window) {
  "use strict";

  function registerMarkdownViewerEditorSyntaxHighlight(app, deps) {
    const markdownEditor = deps.markdownEditor;
    const editorSyntaxHighlight = deps.editorSyntaxHighlight;
    const escapeHtml = deps.escapeHtml;
    const getCodeMirrorEditor = deps.getCodeMirrorEditor || function() { return deps.codeMirrorEditor || null; };

    function rangesOverlap(existingRanges, start, end) {
      return existingRanges.some(function(range) {
        return start < range.end && end > range.start;
      });
    }

    function addInlineSyntaxRanges(line, regex, className, ranges) {
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(line)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (end > start && !rangesOverlap(ranges, start, end)) {
          ranges.push({ start, end, className });
        }
        if (match[0] === "") regex.lastIndex += 1;
      }
    }

    let mermaidDiagnostics = [];
    let mermaidTooltip = null;

    function isIndexInQuotedText(line, index) {
      let quote = "";
      let escaped = false;

      for (let cursor = 0; cursor < index; cursor += 1) {
        const char = line[cursor];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if ((char === '"' || char === "'") && (!quote || quote === char)) {
          quote = quote ? "" : char;
        }
      }

      return !!quote;
    }

    function addMermaidDiagnostic(diagnostics, lineNumber, start, end, message, suggestion) {
      if (end <= start) return;
      diagnostics.push({
        line: lineNumber,
        start,
        end,
        message,
        suggestion
      });
    }

    function collectMermaidDiagnosticsForLine(line, lineNumber) {
      const diagnostics = [];

      let match;
      const reservedWordRegex = /\b(end|default)\b/gi;
      while ((match = reservedWordRegex.exec(line)) !== null) {
        const value = match[1].toLowerCase();
        if (isIndexInQuotedText(line, match.index)) continue;
        addMermaidDiagnostic(
          diagnostics,
          lineNumber,
          match.index,
          match.index + match[0].length,
          `"${match[0]}" is a Mermaid keyword and can break flowchart parsing when used as a node id.`,
          `Rename the node id, for example ${value === "end" ? 'EndNode["end"]' : 'DefaultNode["default"]'}, then point links at the new id.`
        );
      }

      const labelRegex = /([A-Za-z_][\w.-]*)\[((?:[^\]"']|"[^"]*"|'[^']*')*)\]/g;
      while ((match = labelRegex.exec(line)) !== null) {
        const label = match[2];
        const trimmedLabel = label.trim();
        if (!trimmedLabel || trimmedLabel[0] === '"' || trimmedLabel[0] === "'") continue;
        if (/[():,\[\]<>]/.test(label)) {
          const labelStart = match.index + match[1].length + 1;
          addMermaidDiagnostic(
            diagnostics,
            lineNumber,
            labelStart,
            labelStart + label.length,
            "This unquoted Mermaid label contains punctuation that Mermaid v11 parses more strictly.",
            `Quote the label, for example ${match[1]}["${label.replace(/"/g, '\\"')}"].`
          );
        }
      }

      const htmlRegex = /<[^>\s]+[^>]*>/g;
      while ((match = htmlRegex.exec(line)) !== null) {
        if (isIndexInQuotedText(line, match.index)) {
          addMermaidDiagnostic(
            diagnostics,
            lineNumber,
            match.index,
            match.index + match[0].length,
            "HTML inside Mermaid labels can be rejected depending on Mermaid security settings.",
            "Use a plain-text label or replace line breaks with \\n."
          );
        }
      }

      const invisibleRegex = /[\u200B-\u200D\uFEFF\u00A0]/g;
      while ((match = invisibleRegex.exec(line)) !== null) {
        addMermaidDiagnostic(
          diagnostics,
          lineNumber,
          match.index,
          match.index + 1,
          "This invisible Unicode character can make Mermaid fail to parse the line.",
          "Delete and retype the surrounding text as plain text."
        );
      }

      return diagnostics;
    }

    function renderLineWithRanges(line, ranges) {
      if (!ranges.length) return escapeHtml(line);

      ranges.sort(function(a, b) {
        return a.start - b.start || b.end - a.end;
      });

      let markup = "";
      let cursor = 0;
      ranges.forEach(function(range) {
        if (range.start < cursor) return;
        markup += escapeHtml(line.slice(cursor, range.start));
        const tooltip = range.message
          ? ` data-mermaid-message="${escapeHtml(range.message)}" data-mermaid-suggestion="${escapeHtml(range.suggestion)}"`
          : "";
        markup += `<span class="${range.className}"${tooltip}>${escapeHtml(line.slice(range.start, range.end))}</span>`;
        cursor = range.end;
      });
      markup += escapeHtml(line.slice(cursor));
      return markup;
    }

    function renderMermaidSyntaxLine(line, lineNumber) {
      const diagnostics = collectMermaidDiagnosticsForLine(line, lineNumber);
      mermaidDiagnostics.push.apply(mermaidDiagnostics, diagnostics);

      const ranges = diagnostics.map(function(diagnostic) {
        return Object.assign({}, diagnostic, { className: "editor-mermaid-warning" });
      });

      return `<span class="editor-md-code">${renderLineWithRanges(line, ranges)}</span>`;
    }

    function renderInlineMarkdownSyntax(line) {
      if (!line) return "";

      const ranges = [];
      addInlineSyntaxRanges(line, /`+[^`\n]*`+/g, "editor-md-code", ranges);
      addInlineSyntaxRanges(line, /!?\[[^\]\n]+\]\([^\)\n]+\)/g, "editor-md-link", ranges);
      addInlineSyntaxRanges(line, /https?:\/\/[^\s<>)]+/g, "editor-md-url", ranges);
      addInlineSyntaxRanges(line, /(\*\*|__)(?=\S)(.+?\S)\1/g, "editor-md-strong", ranges);
      addInlineSyntaxRanges(line, /(^|[^*_])(\*|_)(?=\S)([^*_\n]+?\S)\2(?!\2)/g, "editor-md-emphasis", ranges);

      ranges.sort(function(a, b) {
        return a.start - b.start || b.end - a.end;
      });

      let markup = "";
      let cursor = 0;
      ranges.forEach(function(range) {
        if (range.start < cursor) return;
        markup += escapeHtml(line.slice(cursor, range.start));
        markup += `<span class="${range.className}">${escapeHtml(line.slice(range.start, range.end))}</span>`;
        cursor = range.end;
      });
      markup += escapeHtml(line.slice(cursor));
      return markup;
    }

    function renderMarkdownSyntaxLine(line, state, lineNumber) {
      const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
      if (fenceMatch) {
        if (!state.inFence) {
          state.inFence = true;
          state.fenceLanguage = fenceMatch[3].trim().split(/\s+/)[0].toLowerCase();
        } else {
          state.inFence = false;
          state.fenceLanguage = "";
        }
        return `${escapeHtml(fenceMatch[1])}<span class="editor-md-marker">${escapeHtml(fenceMatch[2])}</span><span class="editor-md-code">${escapeHtml(fenceMatch[3])}</span>`;
      }

      if (state.inFence) {
        if (state.fenceLanguage === "mermaid") {
          return renderMermaidSyntaxLine(line, lineNumber);
        }
        return `<span class="editor-md-code">${escapeHtml(line)}</span>`;
      }

      const headingMatch = line.match(/^(\s*)(#{1,6})(\s+.*)$/);
      if (headingMatch) {
        return `${escapeHtml(headingMatch[1])}<span class="editor-md-marker">${escapeHtml(headingMatch[2])}</span><span class="editor-md-heading">${renderInlineMarkdownSyntax(headingMatch[3])}</span>`;
      }

      const hrMatch = line.match(/^(\s{0,3})([-*_])(?:\s*\2){2,}\s*$/);
      if (hrMatch) {
        return `<span class="editor-md-hr">${escapeHtml(line)}</span>`;
      }

      const quoteMatch = line.match(/^(\s*>+\s?)(.*)$/);
      if (quoteMatch) {
        return `<span class="editor-md-quote">${escapeHtml(quoteMatch[1])}</span>${renderInlineMarkdownSyntax(quoteMatch[2])}`;
      }

      const listMatch = line.match(/^(\s*)([-+*]|\d+[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/);
      if (listMatch) {
        const taskMarkup = listMatch[4]
          ? `<span class="editor-md-task">${escapeHtml(listMatch[4])}</span>`
          : "";
        return `${escapeHtml(listMatch[1])}<span class="editor-md-list">${escapeHtml(listMatch[2])}</span>${escapeHtml(listMatch[3])}${taskMarkup}${renderInlineMarkdownSyntax(listMatch[5])}`;
      }

      if (/^\s*\|.*\|\s*$/.test(line) || /^\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+$/.test(line)) {
        return `<span class="editor-md-table">${renderInlineMarkdownSyntax(line)}</span>`;
      }

      return renderInlineMarkdownSyntax(line);
    }

    function renderEditorSyntaxHighlights() {
      if (!editorSyntaxHighlight || !markdownEditor) return;
      if (getCodeMirrorEditor()?.isEnabled()) {
        editorSyntaxHighlight.innerHTML = "";
        markdownEditor.classList.remove("syntax-highlight-enabled");
        return;
      }

      const state = { inFence: false, fenceLanguage: "" };
      const lines = markdownEditor.value.split("\n");
      mermaidDiagnostics = [];
      const markup = lines.map(function(line, index) {
        const renderedLine = renderMarkdownSyntaxLine(line, state, index) || " ";
        return renderedLine + (index < lines.length - 1 ? "\n" : "");
      }).join("");

      editorSyntaxHighlight.innerHTML = `<div class="editor-syntax-highlight-inner">${markup}</div>`;
      markdownEditor.classList.add("syntax-highlight-enabled");
      syncEditorSyntaxHighlightScroll();
    }

    function ensureMermaidTooltip() {
      if (mermaidTooltip) return mermaidTooltip;
      mermaidTooltip = document.createElement("div");
      mermaidTooltip.className = "editor-mermaid-tooltip hidden";
      mermaidTooltip.setAttribute("role", "tooltip");
      document.body.appendChild(mermaidTooltip);
      return mermaidTooltip;
    }

    function hideMermaidTooltip() {
      if (!mermaidTooltip) return;
      mermaidTooltip.classList.add("hidden");
    }

    function getMermaidWarningAtPoint(clientX, clientY) {
      if (!editorSyntaxHighlight) return null;

      const warnings = editorSyntaxHighlight.querySelectorAll(".editor-mermaid-warning");
      for (let index = 0; index < warnings.length; index += 1) {
        const warning = warnings[index];
        const rects = warning.getClientRects();
        for (let rectIndex = 0; rectIndex < rects.length; rectIndex += 1) {
          const rect = rects[rectIndex];
          if (
            clientX >= rect.left &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom
          ) {
            return warning;
          }
        }
      }

      return null;
    }

    function showMermaidTooltip(event, diagnostic) {
      const tooltip = ensureMermaidTooltip();
      tooltip.innerHTML = `
        <div class="editor-mermaid-tooltip-title">Mermaid syntax risk</div>
        <div>${escapeHtml(diagnostic.message)}</div>
        <div class="editor-mermaid-tooltip-suggestion">${escapeHtml(diagnostic.suggestion)}</div>
      `;

      const offset = 14;
      let left = event.clientX + offset;
      let top = event.clientY + offset;
      tooltip.classList.remove("hidden");

      const rect = tooltip.getBoundingClientRect();
      if (left + rect.width > window.innerWidth - 8) {
        left = Math.max(8, event.clientX - rect.width - offset);
      }
      if (top + rect.height > window.innerHeight - 8) {
        top = Math.max(8, event.clientY - rect.height - offset);
      }

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }

    function handleMermaidTooltipMouseMove(event) {
      const warning = getMermaidWarningAtPoint(event.clientX, event.clientY);
      if (!warning) {
        hideMermaidTooltip();
        return;
      }
      showMermaidTooltip(event, {
        message: warning.getAttribute("data-mermaid-message") || "",
        suggestion: warning.getAttribute("data-mermaid-suggestion") || ""
      });
    }

    function handleMermaidWarningOverlayMouseMove(event) {
      const warning = event.target.closest ? event.target.closest(".editor-mermaid-warning") : null;
      if (!warning || !editorSyntaxHighlight || !editorSyntaxHighlight.contains(warning)) {
        hideMermaidTooltip();
        return;
      }
      showMermaidTooltip(event, {
        message: warning.getAttribute("data-mermaid-message") || "",
        suggestion: warning.getAttribute("data-mermaid-suggestion") || ""
      });
    }

    markdownEditor.addEventListener("mousemove", handleMermaidTooltipMouseMove);
    markdownEditor.addEventListener("mouseleave", hideMermaidTooltip);
    markdownEditor.addEventListener("blur", hideMermaidTooltip);
    if (editorSyntaxHighlight) {
      editorSyntaxHighlight.addEventListener("mousemove", handleMermaidWarningOverlayMouseMove);
      editorSyntaxHighlight.addEventListener("mouseleave", hideMermaidTooltip);
    }

    function syncEditorSyntaxHighlightScroll() {
      if (!editorSyntaxHighlight) return;

      const inner = editorSyntaxHighlight.querySelector(".editor-syntax-highlight-inner");
      if (!inner) return;

      inner.style.transform = `translate(${-markdownEditor.scrollLeft}px, ${-markdownEditor.scrollTop}px)`;
    }

    const api = {
      renderEditorSyntaxHighlights,
      renderInlineMarkdownSyntax,
      renderMarkdownSyntaxLine,
      collectMermaidDiagnosticsForLine,
      getMermaidWarningAtPoint,
      syncEditorSyntaxHighlightScroll
    };

    app.registerModule("editorSyntaxHighlight", api);
    return api;
  }

  window.registerMarkdownViewerEditorSyntaxHighlight = registerMarkdownViewerEditorSyntaxHighlight;
})(window);
