(function(window, document) {
  "use strict";

  function registerMarkdownViewerEditorContextMenu(app, deps) {
    const markdownEditor = deps.markdownEditor;
    const escapeHtml = deps.escapeHtml;
    const getActiveTabId = deps.getActiveTabId;
    const getEditorInputEventCount = deps.getEditorInputEventCount;
    const hideLinkAutocomplete = deps.hideLinkAutocomplete;
    const updateEditorLineNumbers = deps.updateEditorLineNumbers;
    const updateEditorSelectionHighlights = deps.updateEditorSelectionHighlights;
    const updateStatusLine = deps.updateStatusLine;

    let editorContextMenu = null;
    let editorContextMenuSelection = null;
    const editorContextMenuUndoStack = [];
    const editorContextMenuRedoStack = [];
    const editorContextMenuUndoStackLimit = 50;

    const editorMarkdownActions = [
      { type: "heading-1", label: "Heading 1", icon: "bi-type-h1" },
      { type: "heading-2", label: "Heading 2", icon: "bi-type-h2" },
      { type: "heading-3", label: "Heading 3", icon: "bi-type-h3" },
      { type: "fenced-code", label: "Fenced code", icon: "bi-code-square" },
      { type: "inline-code", label: "Inline code", icon: "bi-code" },
      { type: "link", label: "Link", icon: "bi-link-45deg" },
      { type: "url", label: "URL", icon: "bi-globe" },
      { type: "emphasis", label: "Emphasis", icon: "bi-type-italic" },
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
      markdownEditor.value = value;
      markdownEditor.selectionStart = selectionStart;
      markdownEditor.selectionEnd = selectionEnd;
      markdownEditor.focus();
      markdownEditor.dispatchEvent(new Event("input"));
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
      hideEditorContextMenu();
    }

    function undoEditorContextMenuConversion() {
      const undoState = editorContextMenuUndoStack[editorContextMenuUndoStack.length - 1];
      if (!undoState) return false;
      if (undoState.tabId !== getActiveTabId() || markdownEditor.value !== undoState.afterValue) return false;

      editorContextMenuUndoStack.pop();
      editorContextMenuRedoStack.push(undoState);
      applyEditorContextMenuHistoryState(undoState.beforeValue, undoState.selectionStart, undoState.selectionEnd);
      return true;
    }

    function redoEditorContextMenuConversion() {
      const redoState = editorContextMenuRedoStack[editorContextMenuRedoStack.length - 1];
      if (!redoState) return false;
      if (redoState.tabId !== getActiveTabId() || markdownEditor.value !== redoState.beforeValue) return false;

      editorContextMenuRedoStack.pop();
      editorContextMenuUndoStack.push(redoState);
      applyEditorContextMenuHistoryState(redoState.afterValue, redoState.replacementStart, redoState.replacementEnd);
      return true;
    }

    function replaceEditorSelectionPreservingUndo(start, end, replacement) {
      const value = markdownEditor.value;
      const nextValue = value.slice(0, start) + replacement + value.slice(end);
      const replacementEnd = start + replacement.length;

      markdownEditor.focus();
      markdownEditor.selectionStart = start;
      markdownEditor.selectionEnd = end;

      if (document.queryCommandSupported && document.queryCommandSupported("insertText")) {
        const inputCount = getEditorInputEventCount();
        const inserted = document.execCommand("insertText", false, replacement);
        if (inserted && markdownEditor.value === nextValue) {
          markdownEditor.selectionStart = start;
          markdownEditor.selectionEnd = replacementEnd;
          if (getEditorInputEventCount() === inputCount) {
            markdownEditor.dispatchEvent(new Event("input"));
          }
          return true;
        }
      }

      markdownEditor.value = nextValue;
      markdownEditor.selectionStart = start;
      markdownEditor.selectionEnd = replacementEnd;
      rememberEditorContextMenuConversion({
        tabId: getActiveTabId(),
        beforeValue: value,
        afterValue: nextValue,
        selectionStart: start,
        selectionEnd: end,
        replacementStart: start,
        replacementEnd
      });
      markdownEditor.dispatchEvent(new Event("input"));
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
      const value = markdownEditor.value;
      const selectedText = value.slice(start, end);
      const replacement = convertSelectionToMarkdown(type, selectedText);

      replaceEditorSelectionPreservingUndo(start, end, replacement);
      hideEditorContextMenu();
    }

    function applyMarkdownActionToSelection(type) {
      const selectionStart = markdownEditor.selectionStart;
      const selectionEnd = markdownEditor.selectionEnd;
      editorContextMenuSelection = {
        start: Math.min(selectionStart, selectionEnd),
        end: Math.max(selectionStart, selectionEnd)
      };
      replaceEditorSelectionWithMarkdown(type);
    }

    function renderEditorContextMenu(clientX, clientY) {
      const menu = getEditorContextMenu();
      const selectedText = markdownEditor.value.slice(editorContextMenuSelection.start, editorContextMenuSelection.end);
      const preview = selectedText.replace(/\s+/g, " ").trim();

      menu.innerHTML = `
        <div class="editor-context-menu-title">Convert selection</div>
        ${preview ? `<div class="editor-context-menu-preview">${escapeHtml(preview.slice(0, 60))}${preview.length > 60 ? "..." : ""}</div>` : ""}
        <div class="editor-context-menu-items">
          ${editorMarkdownActions.map((action) => `
            <button class="editor-context-menu-item" type="button" role="menuitem" data-markdown-action="${action.type}">
              <i class="bi ${action.icon}" aria-hidden="true"></i>
              <span>${escapeHtml(action.label)}</span>
            </button>
          `).join("")}
        </div>
      `;

      menu.querySelectorAll("[data-markdown-action]").forEach(function(button) {
        button.addEventListener("click", function() {
          replaceEditorSelectionWithMarkdown(button.dataset.markdownAction);
        });
      });

      positionEditorContextMenu(menu, clientX, clientY);
    }

    function handleEditorContextMenu(event) {
      const selectionStart = markdownEditor.selectionStart;
      const selectionEnd = markdownEditor.selectionEnd;

      if (selectionStart === selectionEnd) {
        hideEditorContextMenu();
        return;
      }

      event.preventDefault();
      hideLinkAutocomplete();
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
      hideEditorContextMenu,
      handleEditorContextMenu,
      redoEditorContextMenuConversion,
      undoEditorContextMenuConversion
    };

    app.registerModule("editorContextMenu", api);
    return api;
  }

  window.registerMarkdownViewerEditorContextMenu = registerMarkdownViewerEditorContextMenu;
})(window, document);
