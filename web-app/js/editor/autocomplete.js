(function(window, document) {
  "use strict";

  function registerMarkdownViewerAutocomplete(app, deps) {
    const markdownEditor = deps.markdownEditor;
    const escapeHtml = deps.escapeHtml;
    let linkAutocompleteLayer = null;
    let linkAutocompleteState = null;
    const imagePathPattern = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;

    function getLinkAutocompleteLayer() {
      if (!linkAutocompleteLayer) {
        linkAutocompleteLayer = document.createElement("div");
        linkAutocompleteLayer.id = "link-autocomplete-layer";
        linkAutocompleteLayer.className = "link-autocomplete-layer hidden";
        linkAutocompleteLayer.setAttribute("role", "listbox");
        linkAutocompleteLayer.setAttribute("aria-label", "Link suggestions");
        document.body.appendChild(linkAutocompleteLayer);
      }
      return linkAutocompleteLayer;
    }

    function hideLinkAutocomplete() {
      if (linkAutocompleteLayer) {
        linkAutocompleteLayer.classList.add("hidden");
        linkAutocompleteLayer.innerHTML = "";
      }
      linkAutocompleteState = null;
      markdownEditor.removeAttribute("aria-activedescendant");
    }

    function isCursorInsideMarkdownCode(value, cursor, lineBefore) {
      const beforeCursor = String(value || "").slice(0, cursor);
      const fenceRegex = /^ {0,3}(```+|~~~+)/gm;
      let fenceMatch;
      let activeFence = null;

      while ((fenceMatch = fenceRegex.exec(beforeCursor)) !== null) {
        const marker = fenceMatch[1];
        const markerChar = marker[0];
        const markerLength = marker.length;

        if (!activeFence) {
          activeFence = { markerChar, markerLength };
          continue;
        }

        if (markerChar === activeFence.markerChar && markerLength >= activeFence.markerLength) {
          activeFence = null;
        }
      }

      if (activeFence) return true;

      const inlinePrefix = String(lineBefore || "");
      const inlineCodeRegex = /`+/g;
      let inlineMatch;
      let openInlineFence = null;

      while ((inlineMatch = inlineCodeRegex.exec(inlinePrefix)) !== null) {
        const tickLength = inlineMatch[0].length;
        if (openInlineFence === tickLength) {
          openInlineFence = null;
        } else if (!openInlineFence) {
          openInlineFence = tickLength;
        }
      }

      return !!openInlineFence;
    }

    function getFrontmatterBoundsForCursor(value, cursor) {
      const source = String(value || "");
      if (!source.startsWith("---")) return null;

      const openingMatch = source.match(/^---[ \t]*(?:\r?\n|$)/);
      if (!openingMatch) return null;

      const contentStart = openingMatch[0].length;
      const closingRegex = /^---[ \t]*(?:\r?\n|$)/gm;
      closingRegex.lastIndex = contentStart;
      const closingMatch = closingRegex.exec(source);
      if (!closingMatch || cursor < contentStart || cursor > closingMatch.index) return null;

      return {
        contentStart,
        contentEnd: closingMatch.index
      };
    }

    function isCursorInFrontmatterTagsList(frontmatterText, relativeCursor) {
      const beforeCursor = frontmatterText.slice(0, relativeCursor);
      const lines = beforeCursor.split(/\r?\n/);

      for (let index = lines.length - 2; index >= 0; index -= 1) {
        const line = lines[index];
        if (!line.trim() || /^\s*#/.test(line)) continue;

        const tagsMatch = line.match(/^(\s*)tags\s*:\s*(?:#.*)?$/i);
        if (tagsMatch) {
          const tagsIndent = tagsMatch[1].length;
          const currentLine = lines[lines.length - 1] || "";
          const currentLineIndent = (currentLine.match(/^\s*/) || [""])[0].length;
          return currentLineIndent >= tagsIndent;
        }

        if (/^\s*[\w.-]+\s*:/.test(line)) return false;
      }

      return false;
    }

    function getFrontmatterTagAutocompleteContext(value, cursor, lineStart, lineBefore) {
      const frontmatterBounds = getFrontmatterBoundsForCursor(value, cursor);
      if (!frontmatterBounds) return null;

      const frontmatterText = String(value || "").slice(frontmatterBounds.contentStart, frontmatterBounds.contentEnd);
      const relativeCursor = cursor - frontmatterBounds.contentStart;
      const nextCharacter = String(value || "").charAt(cursor);
      if (nextCharacter && /[\p{L}\p{N}_\/-]/u.test(nextCharacter)) return null;

      const listItemMatch = lineBefore.match(/^(\s*-\s*)([\p{L}\p{N}_\/-]*)$/u);
      if (listItemMatch && isCursorInFrontmatterTagsList(frontmatterText, relativeCursor)) {
        const query = listItemMatch[2] || "";
        if (!query) return null;
        return {
          type: "frontmatter-tag",
          query,
          replaceStart: lineStart + listItemMatch[1].length,
          replaceEnd: cursor,
          needsClosingSyntax: false
        };
      }

      const inlineTagsMatch = lineBefore.match(/^(\s*tags\s*:\s*\[[^\]]*)([\p{L}\p{N}_\/-]*)$/iu);
      if (inlineTagsMatch) {
        const prefix = inlineTagsMatch[1];
        const previousSeparator = Math.max(prefix.lastIndexOf(","), prefix.lastIndexOf("["));
        const queryStartOffset = previousSeparator + 1 + prefix.slice(previousSeparator + 1).match(/^\s*/)[0].length;
        const query = lineBefore.slice(queryStartOffset);
        if (!query) return null;
        return {
          type: "frontmatter-tag",
          query,
          replaceStart: lineStart + queryStartOffset,
          replaceEnd: cursor,
          needsClosingSyntax: false
        };
      }

      const scalarTagsMatch = lineBefore.match(/^(\s*tags\s*:\s*)([\p{L}\p{N}_\/-]*)$/iu);
      if (scalarTagsMatch) {
        const query = scalarTagsMatch[2] || "";
        if (!query) return null;
        return {
          type: "frontmatter-tag",
          query,
          replaceStart: lineStart + scalarTagsMatch[1].length,
          replaceEnd: cursor,
          needsClosingSyntax: false
        };
      }

      return null;
    }

    function getTagAutocompleteContext(value, cursor, lineStart, lineBefore) {
      const frontmatterTagContext = getFrontmatterTagAutocompleteContext(value, cursor, lineStart, lineBefore);
      if (frontmatterTagContext) return frontmatterTagContext;

      if (isCursorInsideMarkdownCode(value, cursor, lineBefore)) return null;

      const tagMatch = lineBefore.match(/(^|[^\p{L}\p{N}_\/-])#([\p{L}\p{N}][\p{L}\p{N}_\/-]*)$/u);
      if (!tagMatch) return null;

      const query = tagMatch[2] || "";
      if (!query) return null;

      const hashIndex = lineBefore.length - query.length - 1;
      const replaceStart = lineStart + hashIndex;
      const nextCharacter = String(value || "").charAt(cursor);

      if (nextCharacter && /[\p{L}\p{N}_\/-]/u.test(nextCharacter)) return null;

      return {
        type: "tag",
        query,
        replaceStart,
        replaceEnd: cursor,
        needsClosingSyntax: false
      };
    }

    function getLinkAutocompleteContext() {
      if (document.activeElement !== markdownEditor) return null;
      if (markdownEditor.selectionStart !== markdownEditor.selectionEnd) return null;

      const cursor = markdownEditor.selectionStart;
      const value = markdownEditor.value;
      const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
      const lineBefore = value.slice(lineStart, cursor);

      if (lineBefore.endsWith("[[]]")) {
        return {
          type: "wiki",
          query: "",
          replaceStart: cursor - 2,
          replaceEnd: cursor - 2,
          needsClosingSyntax: false
        };
      }

      if (lineBefore.endsWith("![]()")) {
        return {
          type: "image",
          query: "",
          replaceStart: cursor - 1,
          replaceEnd: cursor - 1,
          needsClosingSyntax: false
        };
      }

      if (lineBefore.endsWith("[]()")) {
        return {
          type: "markdown",
          query: "",
          replaceStart: cursor - 1,
          replaceEnd: cursor - 1,
          needsClosingSyntax: false
        };
      }

      const wikiStart = lineBefore.lastIndexOf("[[");
      if (wikiStart !== -1) {
        const query = lineBefore.slice(wikiStart + 2);
        if (!query.includes("]]")) {
          const lineEnd = value.indexOf("\n", cursor);
          const lineAfter = value.slice(cursor, lineEnd === -1 ? value.length : lineEnd);
          const closingWikiOffset = lineAfter.indexOf("]]");
          const hasClosingSyntax = closingWikiOffset !== -1;
          return {
            type: "wiki",
            query,
            replaceStart: lineStart + wikiStart + 2,
            replaceEnd: hasClosingSyntax ? cursor + closingWikiOffset : cursor,
            needsClosingSyntax: !hasClosingSyntax
          };
        }
      }

      const markdownStart = lineBefore.lastIndexOf("](");
      if (markdownStart !== -1) {
        const rawQuery = lineBefore.slice(markdownStart + 2);
        const query = rawQuery.replace(/\s+["'][^"']*$/, "");
        const labelOpen = lineBefore.lastIndexOf("[", markdownStart);
        const isImageTarget = labelOpen > 0 && lineBefore[labelOpen - 1] === "!";
        if (labelOpen !== -1 && !rawQuery.includes(")") && !/\s/.test(query)) {
          const lineEnd = value.indexOf("\n", cursor);
          const lineAfter = value.slice(cursor, lineEnd === -1 ? value.length : lineEnd);
          const closingParenOffset = lineAfter.indexOf(")");
          const hasClosingSyntax = closingParenOffset !== -1;
          return {
            type: isImageTarget ? "image" : "markdown",
            query,
            replaceStart: lineStart + markdownStart + 2,
            replaceEnd: hasClosingSyntax ? cursor + closingParenOffset : cursor,
            needsClosingSyntax: !hasClosingSyntax
          };
        }
      }

      return getTagAutocompleteContext(value, cursor, lineStart, lineBefore);
    }

    function getMarkdownLinkAutocompleteEntries() {
      return (deps.getFolderMarkdownFiles() || [])
        .map((entry) => {
          const path = deps.normalizeMarkdownLinkPath(entry.path || entry.fullPath || entry.file?.webkitRelativePath || entry.file?.name || entry.name || "");
          if (!path || !deps.isMarkdownPath(path)) return null;
          const name = entry.name || deps.getFileName(path);
          return { entry, name, path };
        })
        .filter(Boolean)
        .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }));
    }

    function getAllFolderTreeFiles(nodes, files = []) {
      (nodes || []).forEach((node) => {
        if (!node) return;
        if (node.kind === "directory") {
          getAllFolderTreeFiles(node.children || [], files);
        } else if (node.kind === "file") {
          files.push(node);
        }
      });
      return files;
    }

    function getImageAutocompleteEntries() {
      return getAllFolderTreeFiles(deps.getCurrentFolderTreeNodes ? deps.getCurrentFolderTreeNodes() : [])
        .map((entry) => {
          const path = deps.normalizeMarkdownLinkPath(entry.path || entry.file?.webkitRelativePath || entry.name || entry.fullPath || "");
          if (!path || !imagePathPattern.test(path)) return null;
          const name = entry.name || deps.getFileName(path);
          return { entry, name, path };
        })
        .filter(Boolean)
        .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }));
    }

    function getRootRelativeMarkdownLinkTarget(targetPath) {
      const normalizedTarget = deps.normalizeMarkdownLinkPath(targetPath);
      return normalizedTarget ? `/${normalizedTarget}` : "";
    }

    function getActiveFolderGraphSnapshots() {
      const activeGraphTab = deps.getActiveGraphTab();
      if (activeGraphTab?.graphSnapshot) return [activeGraphTab.graphSnapshot];

      const activeFolderKey = String(deps.getActiveFolderName() || "").trim();
      const matchingSnapshots = (deps.getTabs() || [])
        .filter((tab) => tab?.type === "graph" && tab.graphSnapshot)
        .filter((tab) => !activeFolderKey || tab.folderName === activeFolderKey || tab.graphSnapshot?.folderName === activeFolderKey || tab.title === activeFolderKey)
        .map((tab) => tab.graphSnapshot);

      if (matchingSnapshots.length) return matchingSnapshots;

      return (deps.getTabs() || [])
        .filter((tab) => tab?.type === "graph" && tab.graphSnapshot)
        .map((tab) => tab.graphSnapshot);
    }

    function getGraphSnapshotAutocompleteTags() {
      const tagSet = new Set();

      getActiveFolderGraphSnapshots().forEach((graphSnapshot) => {
        (graphSnapshot?.files || []).forEach((snapshotFile) => {
          deps.normalizeFileTagList(snapshotFile.tags || []).forEach((tag) => tagSet.add(tag));
          deps.extractMarkdownTags(snapshotFile.content || "").forEach((tag) => tagSet.add(tag));
        });

        (graphSnapshot?.nodes || []).forEach((node) => {
          if ((node?.type || "file") !== "tag") return;
          const normalizedTag = deps.normalizeTagName(node.tag || node.label || String(node.id || "").replace(/^tag:/, ""));
          if (normalizedTag) tagSet.add(normalizedTag);
        });
      });

      return Array.from(tagSet);
    }

    function getTagAutocompleteEntries() {
      return Array.from(new Set([
        ...getGraphSnapshotAutocompleteTags(),
        ...Array.from(deps.getFolderTagCounts().keys()),
        ...deps.getKnownTags()
      ]))
        .filter(Boolean)
        .map((tag) => ({ tag, name: `#${tag}` }))
        .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" }));
    }

    function getLinkAutocompleteInsertText(item) {
      if (linkAutocompleteState?.type === "tag") return `#${item.tag}`;
      if (linkAutocompleteState?.type === "frontmatter-tag") return item.tag;
      if (linkAutocompleteState?.type === "image") return deps.normalizeMarkdownLinkPath(item.path);
      return getRootRelativeMarkdownLinkTarget(item.path);
    }

    function getFilteredLinkAutocompleteItems(context) {
      const query = String(context.query || "").trim().toLowerCase();

      if (context.type === "tag" || context.type === "frontmatter-tag") {
        const entries = getTagAutocompleteEntries();
        return query
          ? entries.filter((item) => item.tag.toLowerCase().includes(query))
          : entries;
      }

      const entries = context.type === "image" ? getImageAutocompleteEntries() : getMarkdownLinkAutocompleteEntries();
      return query
        ? entries.filter((item) => {
            const nameWithoutExtension = item.name.replace(/\.[^.]+$/i, "").toLowerCase();
            return item.name.toLowerCase().includes(query)
              || item.path.toLowerCase().includes(query)
              || nameWithoutExtension.includes(query);
          })
        : entries;
    }

    function getTextareaCaretClientPosition(textarea, position) {
      const computedStyle = window.getComputedStyle(textarea);
      const mirror = document.createElement("div");
      mirror.className = "textarea-caret-mirror";
      const properties = [
        "boxSizing", "width", "height", "fontFamily", "fontSize", "fontWeight", "fontStyle",
        "letterSpacing", "textTransform", "wordSpacing", "textIndent", "lineHeight", "paddingTop",
        "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth",
        "borderBottomWidth", "borderLeftWidth", "whiteSpace", "overflowWrap", "wordBreak", "tabSize"
      ];
      properties.forEach((property) => { mirror.style[property] = computedStyle[property]; });
      mirror.style.position = "absolute";
      mirror.style.visibility = "hidden";
      mirror.style.overflow = "hidden";
      mirror.style.top = "0";
      mirror.style.left = "-9999px";
      mirror.textContent = textarea.value.slice(0, position);
      const marker = document.createElement("span");
      marker.textContent = textarea.value.slice(position, position + 1) || "\u200b";
      mirror.appendChild(marker);
      document.body.appendChild(mirror);

      const textareaRect = textarea.getBoundingClientRect();
      const markerRect = marker.getBoundingClientRect();
      const mirrorRect = mirror.getBoundingClientRect();
      const top = textareaRect.top + (markerRect.top - mirrorRect.top) - textarea.scrollTop;
      const left = textareaRect.left + (markerRect.left - mirrorRect.left) - textarea.scrollLeft;
      mirror.remove();
      return { top, left };
    }

    function positionLinkAutocompleteLayer() {
      if (!linkAutocompleteState || !linkAutocompleteLayer || linkAutocompleteLayer.classList.contains("hidden")) return;
      const caret = getTextareaCaretClientPosition(markdownEditor, markdownEditor.selectionStart);
      const editorRect = markdownEditor.getBoundingClientRect();
      const layerRect = linkAutocompleteLayer.getBoundingClientRect();
      const lineHeight = deps.getEditorLineHeight();
      const viewportPadding = 8;
      let top = caret.top + lineHeight + 4;
      let left = caret.left;

      if (top + layerRect.height > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, caret.top - layerRect.height - 4);
      }
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - layerRect.width - viewportPadding));
      top = Math.max(viewportPadding, Math.min(top, window.innerHeight - layerRect.height - viewportPadding));

      linkAutocompleteLayer.style.top = `${top}px`;
      linkAutocompleteLayer.style.left = `${Math.max(editorRect.left, left)}px`;
    }

    function scrollLinkAutocompleteSelectionIntoView() {
      if (!linkAutocompleteLayer || !linkAutocompleteState?.items.length) return;
      const activeOption = linkAutocompleteLayer.querySelector(".link-autocomplete-option.active");
      if (!activeOption) return;

      const optionTop = activeOption.offsetTop;
      const optionBottom = optionTop + activeOption.offsetHeight;
      const visibleTop = linkAutocompleteLayer.scrollTop;
      const visibleBottom = visibleTop + linkAutocompleteLayer.clientHeight;

      if (optionTop < visibleTop) {
        linkAutocompleteLayer.scrollTop = optionTop;
      } else if (optionBottom > visibleBottom) {
        linkAutocompleteLayer.scrollTop = optionBottom - linkAutocompleteLayer.clientHeight;
      }
    }

    function renderLinkAutocomplete() {
      const context = getLinkAutocompleteContext();
      if (!context) {
        hideLinkAutocomplete();
        return;
      }

      const items = getFilteredLinkAutocompleteItems(context);
      const layer = getLinkAutocompleteLayer();
      const selectedIndex = Math.min(Math.max(linkAutocompleteState?.selectedIndex || 0, 0), Math.max(items.length - 1, 0));
      linkAutocompleteState = { ...context, items, selectedIndex };
      layer.innerHTML = "";
      layer.setAttribute("aria-label", context.type === "tag" || context.type === "frontmatter-tag" ? "Tag suggestions" : context.type === "image" ? "Image suggestions" : "Link suggestions");

      if (context.type !== "tag" && context.type !== "frontmatter-tag" && !deps.getIsFolderOpen()) {
        const empty = document.createElement("div");
        empty.className = "link-autocomplete-empty";
        empty.textContent = context.type === "image" ? "Open a folder to insert images." : "Open a folder to link documents.";
        layer.appendChild(empty);
      } else if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "link-autocomplete-empty";
        empty.textContent = context.type === "tag" || context.type === "frontmatter-tag" ? "No matching tags." : context.type === "image" ? "No matching images." : "No matching Markdown documents.";
        layer.appendChild(empty);
      } else {
        items.forEach((item, index) => {
          const option = document.createElement("button");
          option.type = "button";
          option.id = `link-autocomplete-option-${index}`;
          option.className = "link-autocomplete-option" + (index === selectedIndex ? " active" : "");
          option.setAttribute("role", "option");
          option.setAttribute("aria-selected", index === selectedIndex ? "true" : "false");
          option.innerHTML = context.type === "tag" || context.type === "frontmatter-tag"
            ? `<span class="link-autocomplete-name">${escapeHtml(item.name)}</span><span class="link-autocomplete-path">Tag</span>`
            : context.type === "image"
              ? `<span class="link-autocomplete-name">${escapeHtml(item.name)}</span><span class="link-autocomplete-path">${escapeHtml(item.path)}</span>`
              : `<span class="link-autocomplete-name">${escapeHtml(item.name.replace(/\.(md|markdown)$/i, ""))}</span><span class="link-autocomplete-path">${escapeHtml(item.path)}</span>`;
          option.addEventListener("mousedown", (event) => {
            event.preventDefault();
            acceptLinkAutocomplete(index);
          });
          layer.appendChild(option);
        });
        markdownEditor.setAttribute("aria-activedescendant", `link-autocomplete-option-${selectedIndex}`);
      }

      layer.classList.remove("hidden");
      requestAnimationFrame(() => {
        positionLinkAutocompleteLayer();
        scrollLinkAutocompleteSelectionIntoView();
      });
    }

    function acceptLinkAutocomplete(index = linkAutocompleteState?.selectedIndex || 0) {
      if (!linkAutocompleteState || !linkAutocompleteState.items.length) return false;
      const state = linkAutocompleteState;
      const item = state.items[index] || state.items[0];
      const baseInsertText = getLinkAutocompleteInsertText(item);
      const closingSyntax = state.type === "wiki" ? "]]" : (state.type === "markdown" || state.type === "image") ? ")" : "";
      const insertText = state.needsClosingSyntax && closingSyntax ? `${baseInsertText}${closingSyntax}` : baseInsertText;
      const value = markdownEditor.value;
      const closingSyntaxLength = closingSyntax
        && (state.needsClosingSyntax || value.slice(state.replaceEnd, state.replaceEnd + closingSyntax.length) === closingSyntax)
        ? closingSyntax.length
        : 0;
      markdownEditor.value = value.slice(0, state.replaceStart) + insertText + value.slice(state.replaceEnd);
      const nextPosition = state.replaceStart + baseInsertText.length + closingSyntaxLength;
      markdownEditor.selectionStart = markdownEditor.selectionEnd = nextPosition;
      hideLinkAutocomplete();
      markdownEditor.focus();
      markdownEditor.dispatchEvent(new Event("input"));
      return true;
    }

    function moveLinkAutocompleteSelection(delta) {
      if (!linkAutocompleteState || !linkAutocompleteState.items.length) return false;
      const itemCount = linkAutocompleteState.items.length;
      linkAutocompleteState.selectedIndex = (linkAutocompleteState.selectedIndex + delta + itemCount) % itemCount;
      renderLinkAutocomplete();
      return true;
    }

    function handleLinkAutocompleteKeydown(event) {
      if (!linkAutocompleteState || !linkAutocompleteLayer || linkAutocompleteLayer.classList.contains("hidden")) return false;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        return moveLinkAutocompleteSelection(1);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        return moveLinkAutocompleteSelection(-1);
      }
      if (event.key === "Enter" || event.key === "Tab") {
        if (linkAutocompleteState.items.length) {
          event.preventDefault();
          return acceptLinkAutocomplete();
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        hideLinkAutocomplete();
        return true;
      }
      return false;
    }

    function isLayerHovered() {
      return !!(linkAutocompleteLayer && linkAutocompleteLayer.matches(":hover"));
    }

    const api = {
      handleLinkAutocompleteKeydown,
      hideLinkAutocomplete,
      isLayerHovered,
      positionLinkAutocompleteLayer,
      renderLinkAutocomplete
    };

    Object.defineProperties(api, {
      layer: { get: function() { return linkAutocompleteLayer; } },
      state: { get: function() { return linkAutocompleteState; } }
    });

    app.registerModule("autocomplete", api);
    return api;
  }

  window.registerMarkdownViewerAutocomplete = registerMarkdownViewerAutocomplete;
})(window, document);
