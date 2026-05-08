document.addEventListener("DOMContentLoaded", function () {
  let markdownRenderTimeout = null;
  const RENDER_DELAY = 100;
  let syncScrollingEnabled = true;
  let isEditorScrolling = false;
  let isPreviewScrolling = false;
  let scrollSyncTimeout = null;
  const SCROLL_SYNC_DELAY = 10;

  // View Mode State - Story 1.1
  let currentViewMode = 'split'; // 'editor', 'split', or 'preview'
  let autoSelectFileEnabled = true;
  let currentFolderTreeNodes = [];
  let folderTreeFilterText = "";
  let currentFolderSortMode = "name-asc";
  let isFolderOpen = false;

  const markdownEditor = document.getElementById("markdown-editor");
  const editorLineNumbers = document.getElementById("editor-line-numbers");
  const editorCurrentLine = document.getElementById("editor-current-line");
  const editorSelectionHighlights = document.getElementById("editor-selection-highlights");
  const markdownPreview = document.getElementById("markdown-preview");
  const themeToggle = document.getElementById("theme-toggle");
  const importFromFileButtons = document.querySelectorAll("#import-from-file");
  const newDocumentButtons = document.querySelectorAll(".new-document-button");
  const importFromGithubButton = document.getElementById("import-from-github");
  const importFromFolderButton = document.getElementById("import-from-folder");
  const folderTreeFilterInput = document.getElementById("folder-tree-filter-input");
  const folderTreeFilterToggleButtons = document.querySelectorAll(".toggle-folder-tree-filter");
  const folderTreeExpandToggleButtons = document.querySelectorAll(".toggle-folder-tree-expanded");
  let folderTreeRoot = document.getElementById("folder-tree-root");

  console.error("[FolderTree] init", {
    hasPane: !!document.getElementById("folder-tree-pane"),
    hasRoot: !!folderTreeRoot,
    hasImportOption: !!document.getElementById("import-from-folder"),
    viewportWidth: window.innerWidth
  });
  const fileInput = document.getElementById("file-input");
  const folderInput = document.getElementById("folder-input");
  let shownFolderInputFallbackNotice = false;
  const exportMd = document.getElementById("export-md");
  const exportHtml = document.getElementById("export-html");
  const exportPdf = document.getElementById("export-pdf");
  const copyMarkdownButton = document.getElementById("copy-markdown-button");
  const dropzone = document.getElementById("dropzone");
  const closeDropzoneBtn = document.getElementById("close-dropzone");
  const syncToggleButtons = document.querySelectorAll(".sync-toggle-button");
  const editorPane = document.getElementById("markdown-editor");
  const previewPane = document.querySelector(".preview-pane");
  const readingTimeElement = document.getElementById("reading-time");
  const wordCountElement = document.getElementById("word-count");
  const charCountElement = document.getElementById("char-count");
  const statusTipElement = document.getElementById("status-tip");
  const graphPointsStatusElement = document.getElementById("graph-points-status");
  const graphPointsCountElement = document.getElementById("graph-points-count");
  const editorTextpadStatusElement = document.getElementById("editor-textpad-status");
  const editorTotalLengthElement = document.getElementById("editor-total-length");
  const editorTotalLinesElement = document.getElementById("editor-total-lines");
  const editorCursorLineElement = document.getElementById("editor-cursor-line");
  const editorCursorColumnElement = document.getElementById("editor-cursor-column");
  const editorPositionLabelElement = document.getElementById("editor-position-label");
  const editorPositionValueElement = document.getElementById("editor-position-value");
  let previewHoveredLinkUrl = "";

  let linkAutocompleteLayer = null;
  let linkAutocompleteState = null;
  const LINK_AUTOCOMPLETE_MAX_ITEMS = 8;

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
        replaceEnd: cursor - 2
      };
    }

    if (lineBefore.endsWith("[]()")) {
      return {
        type: "markdown",
        query: "",
        replaceStart: cursor - 1,
        replaceEnd: cursor - 1
      };
    }

    const wikiStart = lineBefore.lastIndexOf("[[");
    if (wikiStart !== -1) {
      const query = lineBefore.slice(wikiStart + 2);
      if (!query.includes("]]")) {
        return {
          type: "wiki",
          query,
          replaceStart: lineStart + wikiStart + 2,
          replaceEnd: cursor
        };
      }
    }

    const markdownStart = lineBefore.lastIndexOf("](");
    if (markdownStart !== -1) {
      const query = lineBefore.slice(markdownStart + 2);
      const labelOpen = lineBefore.lastIndexOf("[", markdownStart);
      if (labelOpen !== -1 && !query.includes(")")) {
        return {
          type: "markdown",
          query,
          replaceStart: lineStart + markdownStart + 2,
          replaceEnd: cursor
        };
      }
    }

    return null;
  }

  function getMarkdownLinkAutocompleteEntries() {
    return (folderMarkdownFiles || [])
      .map((entry) => {
        const path = normalizeMarkdownLinkPath(entry.path || entry.fullPath || entry.file?.webkitRelativePath || entry.file?.name || entry.name || "");
        if (!path || !isMarkdownPath(path)) return null;
        const name = entry.name || getFileName(path);
        return { entry, name, path };
      })
      .filter(Boolean)
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }));
  }

  function getRelativeMarkdownLinkTarget(targetPath) {
    const normalizedTarget = normalizeMarkdownLinkPath(targetPath);
    const sourcePath = normalizeMarkdownLinkPath(getActiveMarkdownSourcePath());
    const sourceDirectory = getDirectoryPath(sourcePath);
    if (!sourceDirectory) return normalizedTarget;

    const fromParts = sourceDirectory.split("/").filter(Boolean);
    const toParts = normalizedTarget.split("/").filter(Boolean);
    while (fromParts.length && toParts.length && fromParts[0].toLowerCase() === toParts[0].toLowerCase()) {
      fromParts.shift();
      toParts.shift();
    }
    const relativeParts = fromParts.map(() => "..").concat(toParts);
    return relativeParts.join("/") || getFileName(normalizedTarget);
  }

  function getLinkAutocompleteInsertText(item, type) {
    const relativeTarget = getRelativeMarkdownLinkTarget(item.path);
    return type === "wiki" ? relativeTarget.replace(/\.(md|markdown)$/i, "") : relativeTarget;
  }

  function getFilteredLinkAutocompleteItems(context) {
    const query = String(context.query || "").trim().toLowerCase();
    const entries = getMarkdownLinkAutocompleteEntries();
    const filtered = query
      ? entries.filter((item) => {
          const nameWithoutExtension = item.name.replace(/\.(md|markdown)$/i, "").toLowerCase();
          return item.name.toLowerCase().includes(query)
            || item.path.toLowerCase().includes(query)
            || nameWithoutExtension.includes(query);
        })
      : entries;
    return filtered.slice(0, LINK_AUTOCOMPLETE_MAX_ITEMS);
  }

  function getTextareaCaretClientPosition(textarea, position) {
    const computedStyle = window.getComputedStyle(textarea);
    const mirror = document.createElement("div");
    mirror.className = "textarea-caret-mirror";
    const properties = [
      "boxSizing", "width", "height", "fontFamily", "fontSize", "fontWeight", "fontStyle",
      "letterSpacing", "textTransform", "wordSpacing", "textIndent", "lineHeight", "paddingTop",
      "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth",
      "borderBottomWidth", "borderLeftWidth", "whiteSpace", "overflowWrap", "tabSize"
    ];
    properties.forEach((property) => { mirror.style[property] = computedStyle[property]; });
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.overflow = "hidden";
    mirror.style.top = "0";
    mirror.style.left = "-9999px";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.overflowWrap = "break-word";
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
    const lineHeight = getEditorLineHeight();
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

    if (!isFolderOpen || !folderMarkdownFiles.length) {
      const empty = document.createElement("div");
      empty.className = "link-autocomplete-empty";
      empty.textContent = "Open a folder to link documents.";
      layer.appendChild(empty);
    } else if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "link-autocomplete-empty";
      empty.textContent = "No matching Markdown documents.";
      layer.appendChild(empty);
    } else {
      items.forEach((item, index) => {
        const option = document.createElement("button");
        option.type = "button";
        option.id = `link-autocomplete-option-${index}`;
        option.className = "link-autocomplete-option" + (index === selectedIndex ? " active" : "");
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", index === selectedIndex ? "true" : "false");
        option.innerHTML = `<span class="link-autocomplete-name">${escapeHtml(item.name.replace(/\.(md|markdown)$/i, ""))}</span><span class="link-autocomplete-path">${escapeHtml(item.path)}</span>`;
        option.addEventListener("mousedown", (event) => {
          event.preventDefault();
          acceptLinkAutocomplete(index);
        });
        layer.appendChild(option);
      });
      markdownEditor.setAttribute("aria-activedescendant", `link-autocomplete-option-${selectedIndex}`);
    }

    layer.classList.remove("hidden");
    requestAnimationFrame(positionLinkAutocompleteLayer);
  }

  function acceptLinkAutocomplete(index = linkAutocompleteState?.selectedIndex || 0) {
    if (!linkAutocompleteState || !linkAutocompleteState.items.length) return false;
    const state = linkAutocompleteState;
    const item = state.items[index] || state.items[0];
    const insertText = getLinkAutocompleteInsertText(item, state.type);
    const value = markdownEditor.value;
    markdownEditor.value = value.slice(0, state.replaceStart) + insertText + value.slice(state.replaceEnd);
    const nextPosition = state.replaceStart + insertText.length;
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


  // View Mode Elements - Story 1.1
  const contentContainer = document.querySelector(".content-container");
  const viewModeButtons = document.querySelectorAll(".view-mode-btn");

  function supportsNativeDirectoryPicker() {
    return typeof window.showDirectoryPicker === "function";
  }

  function getFolderPickerFallbackMessage() {
    return "Browsers open folders with a read-only folder picker. Files stay on this device, but saving writes a downloaded copy unless you use the desktop app.";
  }

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
    let matchIndex = text.indexOf(selectedText, searchFrom);

    while (matchIndex !== -1) {
      markup += escapeHtml(text.slice(searchFrom, matchIndex));
      markup += `<span class="editor-selection-match">${escapeHtml(selectedText)}</span>`;
      searchFrom = matchIndex + selectedText.length;
      matchIndex = text.indexOf(selectedText, searchFrom);
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

  function shouldUseNativeDirectoryPicker(event) {
    if (typeof NL_VERSION !== "undefined") return true;
    // Chrome/Edge show an unavoidable "view and copy files" permission prompt for
    // showDirectoryPicker(). Prefer the standard folder input in browsers so opening a
    // folder feels like a normal local selection. Power users can hold Alt while
    // clicking Open folder to opt into File System Access handles for in-place saves.
    return !!(event && event.altKey && supportsNativeDirectoryPicker());
  }

  function updateFolderImportHint() {
    if (typeof NL_VERSION !== "undefined") return;

    document.querySelectorAll("#import-from-folder").forEach(function(button) {
      button.title = `${getFolderPickerFallbackMessage()} Hold Alt while clicking to request Chrome/Edge folder-write access.`;
      button.setAttribute("aria-label", "Open folder using browser read-only folder picker");
    });
  }


  const RECENT_FILES_KEY = "markdownViewerRecentFiles";
  const RECENT_FOLDERS_KEY = "markdownViewerRecentFolders";
  const RECENT_PROFILE_DIR = ".mdviewer";
  const RECENT_PROFILE_FILE = "recent-items.json";
  const RECENT_HANDLES_DB = "markdownViewerRecentHandles";
  const RECENT_HANDLES_STORE = "handles";
  const MAX_RECENT_ITEMS = 10;
  const recentFileHandles = new Map();
  const recentFolderHandles = new Map();
  const recentItemsCache = {
    [RECENT_FILES_KEY]: readRecentItemsFromLocalStorage(RECENT_FILES_KEY),
    [RECENT_FOLDERS_KEY]: readRecentItemsFromLocalStorage(RECENT_FOLDERS_KEY)
  };
  let recentProfilePathPromise = null;
  let recentProfileWriteTimer = null;
  let recentHandlesDbPromise = null;

  function isNeutralinoRuntime() {
    return typeof NL_VERSION !== "undefined" && typeof Neutralino !== "undefined";
  }

  function normalizeRecentItems(items) {
    return Array.isArray(items) ? items.slice(0, MAX_RECENT_ITEMS) : [];
  }

  function readRecentItemsFromLocalStorage(storageKey) {
    try {
      const items = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return normalizeRecentItems(items);
    } catch (error) {
      console.warn("Failed to read recent items:", error);
      return [];
    }
  }

  function writeRecentItemsToLocalStorage(storageKey, items) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(normalizeRecentItems(items)));
    } catch (error) {
      console.warn("Failed to save recent items:", error);
    }
  }

  function readRecentItems(storageKey) {
    return normalizeRecentItems(recentItemsCache[storageKey] || []);
  }

  function writeRecentItems(storageKey, items) {
    recentItemsCache[storageKey] = normalizeRecentItems(items);
    writeRecentItemsToLocalStorage(storageKey, recentItemsCache[storageKey]);
    scheduleRecentProfileWrite();
  }

  function getRecentItemKey(item) {
    return String(item && (item.path || item.handleName || item.name || item.label) || "").toLowerCase();
  }

  function getRecentHandleStore(storageKey) {
    return storageKey === RECENT_FOLDERS_KEY ? recentFolderHandles : recentFileHandles;
  }

  function getRecentHandleId(storageKey, key) {
    return `${storageKey}:${key}`;
  }

  function openRecentHandlesDatabase() {
    if (isNeutralinoRuntime() || !window.indexedDB) return Promise.resolve(null);

    if (!recentHandlesDbPromise) {
      recentHandlesDbPromise = new Promise((resolve) => {
        const request = window.indexedDB.open(RECENT_HANDLES_DB, 1);

        request.onupgradeneeded = function(event) {
          const database = event.target.result;
          if (!database.objectStoreNames.contains(RECENT_HANDLES_STORE)) {
            database.createObjectStore(RECENT_HANDLES_STORE, { keyPath: "id" });
          }
        };

        request.onsuccess = function(event) {
          resolve(event.target.result);
        };

        request.onerror = function(event) {
          console.warn("Failed to open recent handles database:", event.target.error);
          resolve(null);
        };

        request.onblocked = function() {
          console.warn("Opening the recent handles database was blocked by another tab.");
          resolve(null);
        };
      });
    }

    return recentHandlesDbPromise;
  }

  async function persistRecentHandle(storageKey, key, handle) {
    if (!handle || isNeutralinoRuntime()) return;

    const database = await openRecentHandlesDatabase();
    if (!database) return;

    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(RECENT_HANDLES_STORE, "readwrite");
        const store = transaction.objectStore(RECENT_HANDLES_STORE);
        store.put({
          id: getRecentHandleId(storageKey, key),
          storageKey,
          key,
          handle,
          updatedAt: Date.now()
        });
        transaction.oncomplete = resolve;
        transaction.onerror = function(event) { reject(event.target.error); };
        transaction.onabort = function(event) { reject(event.target.error); };
      });
    } catch (error) {
      console.warn("Failed to save recent file-system handle:", error);
    }
  }

  async function getPersistedRecentHandle(storageKey, key) {
    const handleStore = getRecentHandleStore(storageKey);
    const cachedHandle = handleStore.get(key);
    if (cachedHandle) return cachedHandle;

    const database = await openRecentHandlesDatabase();
    if (!database) return null;

    try {
      const record = await new Promise((resolve, reject) => {
        const transaction = database.transaction(RECENT_HANDLES_STORE, "readonly");
        const request = transaction.objectStore(RECENT_HANDLES_STORE).get(getRecentHandleId(storageKey, key));
        request.onsuccess = function(event) { resolve(event.target.result || null); };
        request.onerror = function(event) { reject(event.target.error); };
      });
      if (record && record.handle) {
        handleStore.set(key, record.handle);
        return record.handle;
      }
    } catch (error) {
      console.warn("Failed to read recent file-system handle:", error);
    }

    return null;
  }

  async function hydrateRecentHandlesFromIndexedDB() {
    const database = await openRecentHandlesDatabase();
    if (!database) return;

    try {
      const records = await new Promise((resolve, reject) => {
        const transaction = database.transaction(RECENT_HANDLES_STORE, "readonly");
        const request = transaction.objectStore(RECENT_HANDLES_STORE).getAll();
        request.onsuccess = function(event) { resolve(event.target.result || []); };
        request.onerror = function(event) { reject(event.target.error); };
      });

      records.forEach((record) => {
        if (!record || !record.storageKey || !record.key || !record.handle) return;
        getRecentHandleStore(record.storageKey).set(record.key, record.handle);
      });
    } catch (error) {
      console.warn("Failed to hydrate recent file-system handles:", error);
    }
  }

  async function ensureFileSystemHandlePermission(handle, mode = "read") {
    if (!handle || typeof handle.queryPermission !== "function") return true;

    const options = { mode };
    try {
      if (await handle.queryPermission(options) === "granted") return true;
      if (typeof handle.requestPermission !== "function") return false;
      return await handle.requestPermission(options) === "granted";
    } catch (error) {
      console.warn("Failed to verify file-system handle permission:", error);
      return false;
    }
  }

  function mergeRecentItems(...itemGroups) {
    const mergedByKey = new Map();

    itemGroups.flat().forEach((item) => {
      const key = getRecentItemKey(item);
      if (!key) return;

      const existing = mergedByKey.get(key);
      if (!existing || Number(item.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
        mergedByKey.set(key, item);
      }
    });

    return Array.from(mergedByKey.values())
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, MAX_RECENT_ITEMS);
  }

  function getProfileSeparator(profileDir) {
    return profileDir.includes("\\") ? "\\" : "/";
  }

  async function getUserProfileDir() {
    if (!isNeutralinoRuntime() || !Neutralino.os || !Neutralino.os.getEnv) return null;

    const envVars = NL_OS === "Windows" ? ["USERPROFILE", "HOME"] : ["HOME", "USERPROFILE"];
    for (const envVar of envVars) {
      try {
        const value = await Neutralino.os.getEnv(envVar);
        if (value) return value;
      } catch (error) {
        // Try the next platform-appropriate profile variable.
      }
    }

    return null;
  }

  async function getRecentProfilePath() {
    if (!isNeutralinoRuntime()) return null;

    if (!recentProfilePathPromise) {
      recentProfilePathPromise = (async () => {
        const profileDir = await getUserProfileDir();
        if (!profileDir) return null;

        const separator = getProfileSeparator(profileDir);
        const dataDir = `${profileDir}${separator}${RECENT_PROFILE_DIR}`;
        try {
          if (Neutralino.filesystem && Neutralino.filesystem.createDirectory) {
            await Neutralino.filesystem.createDirectory(dataDir);
          }
        } catch (error) {
          // The directory may already exist; reads/writes below will report real failures.
        }

        return `${dataDir}${separator}${RECENT_PROFILE_FILE}`;
      })();
    }

    return recentProfilePathPromise;
  }

  function getRecentProfilePayload() {
    return {
      version: 1,
      updatedAt: Date.now(),
      recentFiles: readRecentItems(RECENT_FILES_KEY),
      recentFolders: readRecentItems(RECENT_FOLDERS_KEY)
    };
  }

  async function writeRecentItemsToProfile() {
    const profilePath = await getRecentProfilePath();
    if (!profilePath) return;

    try {
      await Neutralino.filesystem.writeFile(profilePath, JSON.stringify(getRecentProfilePayload(), null, 2));
    } catch (error) {
      console.warn("Failed to save recent items to user profile:", error);
    }
  }

  function scheduleRecentProfileWrite() {
    if (!isNeutralinoRuntime()) return;

    clearTimeout(recentProfileWriteTimer);
    recentProfileWriteTimer = setTimeout(() => {
      writeRecentItemsToProfile();
    }, 100);
  }

  async function hydrateRecentItemsFromProfile() {
    const profilePath = await getRecentProfilePath();
    if (!profilePath) return;

    try {
      const rawProfileData = await Neutralino.filesystem.readFile(profilePath);
      const profileData = JSON.parse(rawProfileData || "{}");
      recentItemsCache[RECENT_FILES_KEY] = mergeRecentItems(
        profileData.recentFiles || [],
        recentItemsCache[RECENT_FILES_KEY]
      );
      recentItemsCache[RECENT_FOLDERS_KEY] = mergeRecentItems(
        profileData.recentFolders || [],
        recentItemsCache[RECENT_FOLDERS_KEY]
      );
      writeRecentItemsToLocalStorage(RECENT_FILES_KEY, recentItemsCache[RECENT_FILES_KEY]);
      writeRecentItemsToLocalStorage(RECENT_FOLDERS_KEY, recentItemsCache[RECENT_FOLDERS_KEY]);
      renderRecentMenus();
      scheduleRecentProfileWrite();
    } catch (error) {
      // First launch is expected to have no profile data file yet. Seed it from localStorage.
      scheduleRecentProfileWrite();
    }
  }

  function createRecentEntry(entry) {
    const path = entry && entry.path ? String(entry.path) : null;
    const handleName = entry && entry.handle && entry.handle.name ? entry.handle.name : null;
    const name = entry && entry.name ? String(entry.name) : (path ? getFileName(path) : handleName);
    const label = entry && entry.label ? String(entry.label) : (name || path || handleName || "Untitled");
    return {
      name: name || label,
      label,
      path,
      handleName,
      updatedAt: Date.now()
    };
  }

  function rememberRecentItem(storageKey, entry, handleStore) {
    const recentEntry = createRecentEntry(entry);
    const key = getRecentItemKey(recentEntry);
    if (!key) return;

    if (entry && entry.handle) {
      handleStore.set(key, entry.handle);
      persistRecentHandle(storageKey, key, entry.handle);
    }

    const items = readRecentItems(storageKey).filter((item) => getRecentItemKey(item) !== key);
    items.unshift(recentEntry);
    writeRecentItems(storageKey, items);
    renderRecentMenus();
  }

  function rememberRecentFile(entry) {
    rememberRecentItem(RECENT_FILES_KEY, entry, recentFileHandles);
  }

  function rememberRecentFolder(entry) {
    rememberRecentItem(RECENT_FOLDERS_KEY, entry, recentFolderHandles);
  }

  function getRecentSubmenuMarkup(kind, iconClass, title) {
    return `
      <div class="dropdown-submenu action-menu-submenu recent-${kind}-submenu">
        <button class="dropdown-item action-menu-item dropdown-toggle" type="button" aria-haspopup="true" aria-expanded="false">
          <i class="bi ${iconClass} me-2"></i> ${title}
        </button>
        <div class="dropdown-menu action-submenu recent-${kind}-menu" aria-label="${title}"></div>
      </div>`;
  }

  function ensureRecentMenuContainers() {
    document.querySelectorAll(".action-menu").forEach((menu) => {
      const openFolderButton = menu.querySelector("#import-from-folder");
      if (!openFolderButton || menu.querySelector(".recent-files-submenu")) return;

      openFolderButton.insertAdjacentHTML("afterend", getRecentSubmenuMarkup("folders", "bi-clock-history", "Recent folders"));
      openFolderButton.insertAdjacentHTML("afterend", getRecentSubmenuMarkup("files", "bi-clock-history", "Recent files"));
    });
    renderRecentMenus();
  }

  function renderRecentMenu(menu, items, emptyText, itemType) {
    menu.innerHTML = "";

    if (!items.length) {
      const emptyItem = document.createElement("button");
      emptyItem.type = "button";
      emptyItem.className = "dropdown-item action-menu-item recent-empty-item";
      emptyItem.disabled = true;
      emptyItem.textContent = emptyText;
      menu.appendChild(emptyItem);
      return;
    }

    items.slice(0, MAX_RECENT_ITEMS).forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dropdown-item action-menu-item recent-menu-item";
      button.dataset.recentType = itemType;
      button.dataset.recentKey = getRecentItemKey(item);
      button.title = item.path || item.label || item.name;
      button.innerHTML = `<span class="recent-menu-label">${escapeHtml(item.label || item.name || item.path || "Untitled")}</span>`;
      menu.appendChild(button);
    });
  }

  function renderRecentMenus() {
    const recentFiles = readRecentItems(RECENT_FILES_KEY);
    const recentFolders = readRecentItems(RECENT_FOLDERS_KEY);

    document.querySelectorAll(".recent-files-menu").forEach((menu) => {
      renderRecentMenu(menu, recentFiles, "No recent files", "file");
    });

    document.querySelectorAll(".recent-folders-menu").forEach((menu) => {
      renderRecentMenu(menu, recentFolders, "No recent folders", "folder");
    });
  }

  async function openRecentFile(key) {
    const item = readRecentItems(RECENT_FILES_KEY).find((recentItem) => getRecentItemKey(recentItem) === key);
    if (!item) return;

    const handle = await getPersistedRecentHandle(RECENT_FILES_KEY, key);
    const sourceFile = {
      name: item.name || item.label || (item.path ? getFileName(item.path) : null),
      path: item.path || null,
      handle
    };

    const isGraphFile = isGraphFilePath(sourceFile.path || sourceFile.name);
    const existingTab = isGraphFile ? findGraphTabForSourceFile(sourceFile) : findTabForSourceFile(sourceFile);
    if (existingTab) {
      switchTab(existingTab.id);
      pinTemporaryTab(existingTab.id);
      rememberRecentFile(sourceFile);
      return;
    }

    if (!item.path && !handle) {
      alert("This recent file was opened with a browser picker that did not provide a reusable file handle. Please choose it again with Open file ...");
      return;
    }

    try {
      if (handle && !(await ensureFileSystemHandlePermission(handle))) {
        alert("Permission is required to reopen this recent file. Please allow access or choose it again with Open file ...");
        return;
      }
      await openDocumentSourceFile(sourceFile);
    } catch (error) {
      console.error("Failed to open recent file:", error);
      alert("Unable to open the recent file.");
    }
  }

  async function openRecentFolder(key) {
    const item = readRecentItems(RECENT_FOLDERS_KEY).find((recentItem) => getRecentItemKey(recentItem) === key);
    if (!item) return;

    const handle = await getPersistedRecentHandle(RECENT_FOLDERS_KEY, key);
    if (typeof NL_VERSION !== "undefined" && item.path) {
      try {
        await openFolderTreeFromNeutralinoPath(item.path);
      } catch (error) {
        console.error("Failed to open recent folder:", error);
        alert("Unable to open the recent folder.");
      }
      return;
    }

    if (handle) {
      try {
        if (!(await ensureFileSystemHandlePermission(handle))) {
          alert("Permission is required to reopen this recent folder. Please allow access or choose it again with Open folder ...");
          return;
        }
        activeFolderName = handle.name || item.name || "Graph View";
        activeFolderHandle = handle;
        activeFolderPath = null;
        const nodes = await listMarkdownTree(handle);
        folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
        renderFolderTree(nodes);
        rememberRecentFolder({ name: activeFolderName, label: activeFolderName, handle });
      } catch (error) {
        console.error("Failed to open recent folder:", error);
        alert("Unable to open the recent folder.");
      }
      return;
    }

    alert("This recent folder was opened with a browser picker that did not provide a reusable folder handle. Please choose it again with Open folder ...");
  }

  document.addEventListener("click", function(event) {
    const recentButton = event.target.closest(".recent-menu-item");
    if (!recentButton) return;

    event.preventDefault();

    if (recentButton.dataset.recentType === "folder") {
      openRecentFolder(recentButton.dataset.recentKey);
    } else {
      openRecentFile(recentButton.dataset.recentKey);
    }
  });

  markdownPreview.addEventListener("click", handlePreviewLinkClick);
  markdownPreview.addEventListener("mouseover", handlePreviewLinkMouseOver);
  markdownPreview.addEventListener("mouseout", handlePreviewLinkMouseOut);

  function ensureFolderTreePane() {
    let pane = document.getElementById("folder-tree-pane");
    if (pane || !contentContainer) return;

    pane = document.createElement("aside");
    pane.className = "folder-tree-pane";
    pane.id = "folder-tree-pane";
    pane.innerHTML = `
      <div class="folder-tree-topbar">
        <div class="folder-tree-toolbar" role="toolbar" aria-label="Folder tree tools">
          <button class="folder-tree-tool-button toggle-folder-tree-expanded" type="button" title="Open a folder to expand or collapse folders" aria-label="Expand or collapse all folders" disabled aria-disabled="true">
            <i class="bi bi-arrows-expand" aria-hidden="true"></i>
          </button>
          <button class="folder-tree-tool-button toggle-auto-select-file" type="button" title="Open a folder to enable Auto select file" aria-label="Auto select file Off" aria-pressed="true" disabled aria-disabled="true">
            <i class="bi bi-crosshair" aria-hidden="true"></i>
            <span class="auto-select-file-label visually-hidden">Auto select file Off</span>
          </button>
          <button class="folder-tree-tool-button open-graph-view" type="button" title="Open Graph View" aria-label="Open Graph View">
            <i class="bi bi-diagram-3" aria-hidden="true"></i>
          </button>
          <div class="folder-tree-sort-menu dropdown">
            <button class="folder-tree-tool-button folder-tree-sort-menu-button dropdown-toggle" type="button" id="folderTreeSortMenu" data-bs-toggle="dropdown" aria-expanded="false" title="Open a folder to sort files and folders" aria-label="Sort files and folders" disabled aria-disabled="true">
              <i class="bi bi-sort-alpha-down" aria-hidden="true"></i>
            </button>
            <div class="dropdown-menu action-menu folder-tree-sort-options" aria-labelledby="folderTreeSortMenu">
              <button class="dropdown-item action-menu-item folder-tree-sort-option" type="button" data-folder-sort="name-asc">
                <span>File name (A to Z)</span><i class="bi bi-check-lg ms-auto folder-tree-sort-check" aria-hidden="true"></i>
              </button>
              <button class="dropdown-item action-menu-item folder-tree-sort-option" type="button" data-folder-sort="name-desc">
                <span>File name (Z to A)</span><i class="bi bi-check-lg ms-auto folder-tree-sort-check" aria-hidden="true"></i>
              </button>
              <hr class="dropdown-divider">
              <button class="dropdown-item action-menu-item folder-tree-sort-option" type="button" data-folder-sort="modified-desc">
                <span>Modified time (new to old)</span><i class="bi bi-check-lg ms-auto folder-tree-sort-check" aria-hidden="true"></i>
              </button>
              <button class="dropdown-item action-menu-item folder-tree-sort-option" type="button" data-folder-sort="modified-asc">
                <span>Modified time (old to new)</span><i class="bi bi-check-lg ms-auto folder-tree-sort-check" aria-hidden="true"></i>
              </button>
              <hr class="dropdown-divider">
              <button class="dropdown-item action-menu-item folder-tree-sort-option" type="button" data-folder-sort="created-desc">
                <span>Created time (new to old)</span><i class="bi bi-check-lg ms-auto folder-tree-sort-check" aria-hidden="true"></i>
              </button>
              <button class="dropdown-item action-menu-item folder-tree-sort-option" type="button" data-folder-sort="created-asc">
                <span>Created time (old to new)</span><i class="bi bi-check-lg ms-auto folder-tree-sort-check" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <button class="folder-tree-tool-button toggle-folder-tree-filter" type="button" title="Open a folder to filter files and folders" aria-label="Filter files and folders" aria-expanded="false" disabled aria-disabled="true">
            <i class="bi bi-funnel" aria-hidden="true"></i>
          </button>
          <input id="folder-tree-filter-input" class="folder-tree-filter-input" type="search" placeholder="Filter files..." aria-label="Filter files and folders" hidden disabled>
        </div>
      </div>
      <div id="folder-tree-root" class="folder-tree-root">
        <p class="folder-tree-placeholder">Open a folder to browse Markdown and graph files.</p>
      </div>
      <div class="sidebar-dropzone-resizer" id="sidebar-dropzone-resizer" role="separator" aria-orientation="horizontal" aria-label="Resize sidebar dropzone" tabindex="0"></div>
      <div class="sidebar-dropzone-panel">
        <div id="dropzone" class="dropzone">
          <button id="close-dropzone" class="close-btn" title="Close dropzone">
            <i class="bi bi-x-lg"></i>
          </button>
          <p class="mb-0"><i class="bi bi-cloud-arrow-up me-2"></i>Drop a Markdown file, graph file, or folder here, or click to browse</p>
        </div>
      </div>
    `;

    contentContainer.insertBefore(pane, contentContainer.firstChild);
    console.error("[FolderTree] pane dynamically inserted.");
  }

  ensureFolderTreePane();
  folderTreeRoot = document.getElementById("folder-tree-root");
  const folderTreePane = document.getElementById("folder-tree-pane");
  ensureRecentMenuContainers();
  hydrateRecentItemsFromProfile();
  hydrateRecentHandlesFromIndexedDB();
  const sidebarDropzonePanel = document.querySelector(".sidebar-dropzone-panel");
  const sidebarDropzoneResizer = document.getElementById("sidebar-dropzone-resizer");
  const toggleDropzonePanelButtons = document.querySelectorAll(".toggle-dropzone-panel");
  const toggleSidebarButtons = document.querySelectorAll(".toggle-sidebar");
  const toggleAutoSelectFileButtons = document.querySelectorAll(".toggle-auto-select-file");
  const folderTreeSortMenuButtons = document.querySelectorAll(".folder-tree-sort-menu-button");
  const folderTreeSortOptionButtons = document.querySelectorAll(".folder-tree-sort-option");
  updateFolderImportHint();
  updateFolderTreeToolbarState();
  toggleAutoSelectFileButtons.forEach(function(button) {
    button.addEventListener("click", function() {
      if (button.classList.contains("folder-tree-tool-button") && !isFolderOpen) return;
      setAutoSelectFileEnabled(!autoSelectFileEnabled);
    });
  });

  folderTreeExpandToggleButtons.forEach(function(button) {
    button.addEventListener("click", function() {
      if (!isFolderOpen) return;
      setAllFolderTreeDetails(hasCollapsedFolderTreeDetails());
    });
  });

  folderTreeFilterToggleButtons.forEach(function(button) {
    button.addEventListener("click", function() {
      if (!isFolderOpen || !folderTreeFilterInput) return;
      const shouldShow = folderTreeFilterInput.hidden;
      folderTreeFilterInput.hidden = !shouldShow;
      updateFolderTreeFilterControls();
      if (shouldShow) {
        folderTreeFilterInput.focus();
        folderTreeFilterInput.select();
        return;
      }
      folderTreeFilterText = "";
      folderTreeFilterInput.value = "";
      renderFilteredFolderTree();
    });
  });

  if (folderTreeFilterInput) {
    folderTreeFilterInput.addEventListener("input", function() {
      folderTreeFilterText = folderTreeFilterInput.value;
      renderFilteredFolderTree();
      updateFolderTreeFilterControls();
    });
  }

  folderTreeSortOptionButtons.forEach(function(button) {
    button.addEventListener("click", function() {
      if (!isFolderOpen) return;
      applyFolderSortMode(button.dataset.folderSort || "name-asc");
    });
  });


  // Mobile View Mode Elements - Story 1.4
  const mobileViewModeButtons = document.querySelectorAll(".mobile-view-mode-btn");

  // Resize Divider Elements - Story 1.3
  const resizeDivider = document.querySelector(".resize-divider");
  const editorPaneElement = document.querySelector(".editor-pane");
  const previewPaneElement = document.querySelector(".preview-pane");
  let isResizing = false;
  let isSidebarDropzoneResizing = false;
  let resizePointerOffset = 0;
  let editorWidthPercent = 50; // Default 50%
  const MIN_PANE_PERCENT = 20; // Minimum 20% width
  const MIN_SIDEBAR_PANEL_HEIGHT = 120;
  const SIDEBAR_VISIBILITY_ANIMATION_MS = 240;
  let sidebarVisibilityAnimationTimer = null;

  const mobileMenuToggle    = document.getElementById("mobile-menu-toggle");
  const mobileMenuPanel     = document.getElementById("mobile-menu-panel");
  const mobileMenuOverlay   = document.getElementById("mobile-menu-overlay");
  const mobileCloseMenu     = document.getElementById("close-mobile-menu");
  const mobileReadingTime   = document.getElementById("mobile-reading-time");
  const mobileWordCount     = document.getElementById("mobile-word-count");
  const mobileCharCount     = document.getElementById("mobile-char-count");
  const mobileImportBtn     = document.getElementById("mobile-import-button");
  const mobileImportGithubBtn = document.getElementById("mobile-import-github-button");
  const mobileExportMd      = document.getElementById("mobile-export-md");
  const mobileExportHtml    = document.getElementById("mobile-export-html");
  const mobileExportPdf     = document.getElementById("mobile-export-pdf");
  const mobileCopyMarkdown  = document.getElementById("mobile-copy-markdown");
  const mobileThemeToggle   = document.getElementById("mobile-theme-toggle");
  const mobileOpenGraphView = document.getElementById("mobile-open-graph-view");
  const desktopOpenGraphButtons = document.querySelectorAll(".open-graph-view");
  const graphViewCanvas = document.getElementById("graph-view-canvas");
  const shareButton         = document.getElementById("share-button");
  const mobileShareButton   = document.getElementById("mobile-share-button");
  const githubImportModal = document.getElementById("github-import-modal");
  const githubImportTitle = document.getElementById("github-import-title");
  const githubImportUrlInput = document.getElementById("github-import-url");
  const githubImportFileSelect = document.getElementById("github-import-file-select");
  const githubImportSelectionToolbar = document.getElementById("github-import-selection-toolbar");
  const githubImportSelectedCount = document.getElementById("github-import-selected-count");
  const githubImportSelectAllBtn = document.getElementById("github-import-select-all");
  const githubImportTree = document.getElementById("github-import-tree");
  const githubImportError = document.getElementById("github-import-error");
  const githubImportCancelBtn = document.getElementById("github-import-cancel");
  const githubImportSubmitBtn = document.getElementById("github-import-submit");

  // ========================================
  // GLOBAL STATE (persisted across reloads)
  // ========================================
  const GLOBAL_STATE_KEY = 'markdownViewerGlobalState';
  currentFolderSortMode = getValidFolderSortMode(loadGlobalState().folderSortMode || currentFolderSortMode);
  const graphSettings = {
    magneticEnabled: loadGlobalState().graphMagneticEnabled !== false
  };
  autoSelectFileEnabled = loadGlobalState().autoSelectFileEnabled !== false;
  updateAutoSelectFileButtons();

  setSidebarVisible(loadGlobalState().sidebarVisible !== false, false);

  function loadGlobalState() {
    try { return JSON.parse(localStorage.getItem(GLOBAL_STATE_KEY)) || {}; }
    catch { return {}; }
  }

  function saveGlobalState(patch) {
    localStorage.setItem(GLOBAL_STATE_KEY, JSON.stringify({ ...loadGlobalState(), ...patch }));
  }

  function getComparableFilePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
  }

  function getTabTreeFileCandidates(tab) {
    if (!tab || tab.type === "graph") return [];
    return [tab.sourceFilePath, tab.sourceFileName, tab.title]
      .filter(Boolean)
      .map(getComparableFilePath);
  }

  function updateAutoSelectFileButtons() {
    const label = autoSelectFileEnabled ? "Auto select file Off" : "Auto select file On";
    const title = autoSelectFileEnabled ? "Disable Auto select file" : "Enable Auto select file";

    toggleAutoSelectFileButtons.forEach(function(button) {
      const labelElement = button.querySelector(".auto-select-file-label");
      if (labelElement) {
        labelElement.textContent = label;
      } else {
        button.textContent = label;
      }
      button.title = isFolderOpen ? title : "Open a folder to enable Auto select file";
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-pressed", String(autoSelectFileEnabled));
      if (button.classList.contains("folder-tree-tool-button")) {
        button.disabled = !isFolderOpen;
        button.setAttribute("aria-disabled", isFolderOpen ? "false" : "true");
      }
    });
  }

  function hasCollapsedFolderTreeDetails() {
    return !!folderTreeRoot && Array.from(folderTreeRoot.querySelectorAll("details")).some(function(details) {
      return !details.open;
    });
  }

  function updateFolderTreeExpandToggleButtons() {
    const hasFolder = !!isFolderOpen;
    const shouldExpand = hasCollapsedFolderTreeDetails();
    const title = !hasFolder
      ? "Open a folder to expand or collapse folders"
      : shouldExpand
        ? "Expand all folders"
        : "Collapse all folders";
    const iconClass = shouldExpand ? "bi bi-arrows-expand" : "bi bi-arrows-collapse";

    folderTreeExpandToggleButtons.forEach(function(button) {
      const icon = button.querySelector("i");
      if (icon) icon.className = iconClass;
      button.disabled = !hasFolder;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });
  }

  function setAllFolderTreeDetails(open) {
    if (!folderTreeRoot) return;
    folderTreeRoot.querySelectorAll("details").forEach(function(details) {
      resetFolderTreeAnimation(details, getFolderTreeChildrenContainer(details));
      details.open = open;
    });
    updateFolderTreeExpandToggleButtons();
  }

  function getFilteredFolderTreeNodes(nodes, filterText) {
    const normalizedFilter = String(filterText || "").trim().toLowerCase();
    if (!normalizedFilter) return nodes;

    return (nodes || []).reduce(function(matches, node) {
      const nameMatches = String(node.name || "").toLowerCase().includes(normalizedFilter);

      if (node.kind === "directory") {
        const filteredChildren = getFilteredFolderTreeNodes(node.children || [], normalizedFilter);
        if (nameMatches || filteredChildren.length) {
          matches.push({ ...node, children: filteredChildren });
        }
        return matches;
      }

      if (nameMatches) {
        matches.push(node);
      }
      return matches;
    }, []);
  }

  function renderFilteredFolderTree() {
    if (!folderTreeRoot || !isFolderOpen) return;
    const nodes = getFilteredFolderTreeNodes(currentFolderTreeNodes, folderTreeFilterText);
    renderFolderTree(nodes, { preserveNodes: true });
    if (folderTreeFilterText) {
      setAllFolderTreeDetails(true);
    }
  }

  function updateFolderTreeFilterControls() {
    const hasFolder = !!isFolderOpen;
    const isVisible = !!(folderTreeFilterInput && !folderTreeFilterInput.hidden);
    folderTreeFilterToggleButtons.forEach(function(button) {
      button.disabled = !hasFolder;
      button.title = hasFolder ? "Filter files and folders" : "Open a folder to filter files and folders";
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
      button.setAttribute("aria-expanded", String(hasFolder && isVisible));
      button.setAttribute("aria-pressed", String(hasFolder && (isVisible || !!folderTreeFilterText)));
    });

    if (folderTreeFilterInput) {
      folderTreeFilterInput.disabled = !hasFolder;
      if (!hasFolder) {
        folderTreeFilterInput.value = "";
        folderTreeFilterInput.hidden = true;
      }
    }
  }

  function getFolderSortLabel(mode) {
    const labels = {
      "name-asc": "File name (A to Z)",
      "name-desc": "File name (Z to A)",
      "modified-desc": "Modified time (new to old)",
      "modified-asc": "Modified time (old to new)",
      "created-desc": "Created time (new to old)",
      "created-asc": "Created time (old to new)"
    };
    return labels[getValidFolderSortMode(mode)];
  }

  function updateFolderTreeSortControls() {
    const hasFolder = !!isFolderOpen;
    const activeLabel = getFolderSortLabel(currentFolderSortMode);
    const title = hasFolder ? `Sort files and folders: ${activeLabel}` : "Open a folder to sort files and folders";

    folderTreeSortMenuButtons.forEach(function(button) {
      button.disabled = !hasFolder;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });

    folderTreeSortOptionButtons.forEach(function(button) {
      const isActive = button.dataset.folderSort === currentFolderSortMode;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-checked", String(isActive));
    });
  }

  function updateFolderTreeToolbarState() {
    updateAutoSelectFileButtons();
    updateFolderTreeExpandToggleButtons();
    updateFolderTreeFilterControls();
    updateFolderTreeSortControls();
  }

  function setAutoSelectFileEnabled(enabled) {
    autoSelectFileEnabled = !!enabled;
    saveGlobalState({ autoSelectFileEnabled });
    updateAutoSelectFileButtons();
    syncFolderTreeSelectionToActiveTab({ scroll: autoSelectFileEnabled });
  }

  function findFolderTreeFileButtonForTab(tab) {
    if (!folderTreeRoot) return null;
    const candidates = getTabTreeFileCandidates(tab);
    if (!candidates.length) return null;

    return Array.from(folderTreeRoot.querySelectorAll(".folder-tree-file")).find(function(button) {
      const buttonCandidates = [button.dataset.fullPath, button.dataset.path, button.dataset.name, button.textContent]
        .filter(Boolean)
        .map(getComparableFilePath);

      return candidates.some(function(candidate) {
        return buttonCandidates.some(function(buttonCandidate) {
          return buttonCandidate === candidate || buttonCandidate.endsWith(`/${candidate}`) || candidate.endsWith(`/${buttonCandidate}`);
        });
      });
    }) || null;
  }

  function syncFolderTreeSelectionToActiveTab(options = {}) {
    if (!folderTreeRoot) return;
    folderTreeRoot.querySelectorAll(".folder-tree-file.auto-selected").forEach(function(button) {
      button.classList.remove("auto-selected");
      button.removeAttribute("aria-current");
    });

    if (!autoSelectFileEnabled) return;

    const activeTab = tabs.find(function(tab) { return tab.id === activeTabId; });
    const selectedButton = findFolderTreeFileButtonForTab(activeTab);
    if (!selectedButton) return;

    selectedButton.classList.add("auto-selected");
    selectedButton.setAttribute("aria-current", "page");

    if (options.scroll !== false) {
      selectedButton.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }

  // Check dark mode preference first for proper initialization
  const prefersDarkMode =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const savedTheme = loadGlobalState().theme;
  const initialTheme = savedTheme ?? (prefersDarkMode ? "dark" : "light");

  document.documentElement.setAttribute("data-theme", initialTheme);

  function updateThemeButtonLabels(theme) {
    const nextThemeLabel = theme === "dark" ? "Light" : "Dark";
    const icon = theme === "dark" ? "bi-sun" : "bi-moon";
    themeToggle.innerHTML = `<i class="bi ${icon} me-2"></i> ${nextThemeLabel} Mode`;
    mobileThemeToggle.innerHTML = `<i class="bi ${icon} me-2"></i> ${nextThemeLabel} Mode`;
  }

  updateThemeButtonLabels(initialTheme);

  const initMermaid = () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const mermaidTheme = currentTheme === "dark" ? "dark" : "default";
    
    mermaid.initialize({
      startOnLoad: false,
      theme: mermaidTheme,
      securityLevel: 'loose',
      flowchart: { useMaxWidth: true, htmlLabels: true },
      fontSize: 16
    });
  };

  try {
    initMermaid();
  } catch (e) {
    console.warn("Mermaid initialization failed:", e);
  }

  const markedOptions = {
    gfm: true,
    breaks: false,
    pedantic: false,
    sanitize: false,
    smartypants: false,
    xhtml: false,
    headerIds: true,
    mangle: false,
  };

  const renderer = new marked.Renderer();
  renderer.code = function (code, language) {
    const normalizedLanguage = (language || "").trim().split(/\s+/)[0].toLowerCase();

    if (normalizedLanguage === 'mermaid') {
      const uniqueId = 'mermaid-diagram-' + Math.random().toString(36).substr(2, 9);
      return `<div class="mermaid-container"><div class="mermaid" id="${uniqueId}">${code}</div></div>`;
    }
    
    const validLanguage = hljs.getLanguage(normalizedLanguage) ? normalizedLanguage : "plaintext";
    const highlightedCode = hljs.highlight(code, {
      language: validLanguage,
    }).value;
    return `<pre><code class="hljs ${validLanguage}">${highlightedCode}</code></pre>`;
  };

  marked.setOptions({
    ...markedOptions,
    renderer: renderer,
  });

  const GITHUB_ALERT_META = {
    note: {
      label: "Note",
      viewBox: "0 0 512 512",
      path: "M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z",
    },
    tip: {
      label: "Tip",
      viewBox: "0 0 384 512",
      path: "M297.2 248.9C311.6 228.3 320 203.2 320 176c0-70.7-57.3-128-128-128S64 105.3 64 176c0 27.2 8.4 52.3 22.8 72.9c3.7 5.3 8.1 11.3 12.8 17.7c0 0 0 0 0 0c12.9 17.7 28.3 38.9 39.8 59.8c10.4 19 15.7 38.8 18.3 57.5L109 384c-2.2-12-5.9-23.7-11.8-34.5c-9.9-18-22.2-34.9-34.5-51.8c0 0 0 0 0 0s0 0 0 0c-5.2-7.1-10.4-14.2-15.4-21.4C27.6 247.9 16 213.3 16 176C16 78.8 94.8 0 192 0s176 78.8 176 176c0 37.3-11.6 71.9-31.4 100.3c-5 7.2-10.2 14.3-15.4 21.4c0 0 0 0 0 0s0 0 0 0c-12.3 16.8-24.6 33.7-34.5 51.8c-5.9 10.8-9.6 22.5-11.8 34.5l-48.6 0c2.6-18.7 7.9-38.6 18.3-57.5c11.5-20.9 26.9-42.1 39.8-59.8c0 0 0 0 0 0s0 0 0 0s0 0 0 0c4.7-6.4 9-12.4 12.7-17.7zM192 128c-26.5 0-48 21.5-48 48c0 8.8-7.2 16-16 16s-16-7.2-16-16c0-44.2 35.8-80 80-80c8.8 0 16 7.2 16 16s-7.2 16-16 16zm0 384c-44.2 0-80-35.8-80-80l0-16 160 0 0 16c0 44.2-35.8 80-80 80z",
    },
    important: {
      label: "Important",
      viewBox: "0 0 512 512",
      path: "M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm0-384c13.3 0 24 10.7 24 24l0 112c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-112c0-13.3 10.7-24 24-24zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z",
    },
    warning: {
      label: "Warning",
      viewBox: "0 0 512 512",
      path: "M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z",
    },
    caution: {
      label: "Caution",
      viewBox: "0 0 512 512",
      path: "M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z",
    },
  };
  const GITHUB_ALERT_MARKER_REGEX = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s+|$)/i;

  function enhanceGitHubAlerts(container) {
    if (!container) return;

    const blockquotes = container.querySelectorAll("blockquote");
    blockquotes.forEach((blockquote) => {
      let firstParagraph = null;
      for (const child of blockquote.children) {
        if (child.tagName === "P") {
          firstParagraph = child;
          break;
        }
      }
      if (!firstParagraph) return;

      const firstParagraphHtml = firstParagraph.innerHTML.trim();
      const markerMatch = firstParagraphHtml.match(GITHUB_ALERT_MARKER_REGEX);
      if (!markerMatch) return;

      const alertType = markerMatch[1].toLowerCase();
      blockquote.classList.add("markdown-alert", `markdown-alert-${alertType}`);

      const title = document.createElement("p");
      title.className = "markdown-alert-title";
      const alertMeta = GITHUB_ALERT_META[alertType] || { label: markerMatch[1], path: "" };
      const icon = document.createElement("span");
      icon.className = "markdown-alert-icon";
      icon.setAttribute("aria-hidden", "true");

      if (alertMeta.path) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", alertMeta.viewBox || "0 0 512 512");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", alertMeta.path);
        svg.appendChild(path);
        icon.appendChild(svg);
      }

      const label = document.createElement("span");
      label.textContent = alertMeta.label;
      title.appendChild(icon);
      title.appendChild(label);

      blockquote.insertBefore(title, blockquote.firstChild);

      const remainingHtml = firstParagraphHtml
        .replace(GITHUB_ALERT_MARKER_REGEX, "")
        .trim();
      if (remainingHtml) {
        firstParagraph.innerHTML = remainingHtml;
      } else {
        firstParagraph.remove();
      }
    });
  }

  function parseFrontmatter(markdown) {
    const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
    if (!match) return { frontmatter: null, body: markdown };
    try {
      const data = jsyaml.load(match[1]) || {};
      return { frontmatter: data, body: markdown.slice(match[0].length) };
    } catch (e) {
      console.warn('Frontmatter YAML parse error:', e);
      return { frontmatter: null, body: markdown };
    }
  }

  function renderFrontmatterValue(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) {
      const y = value.getUTCFullYear();
      const m = String(value.getUTCMonth() + 1).padStart(2, '0');
      const d = String(value.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if (Array.isArray(value)) {
      const allPrimitive = value.every(v => v === null || typeof v !== 'object');
      if (allPrimitive) {
        return value
          .map(v => `<span class="fm-tag">${escapeHtml(String(v ?? ''))}</span>`)
          .join('');
      }
      return `<pre class="fm-complex">${escapeHtml(jsyaml.dump(value).trimEnd())}</pre>`;
    }
    if (typeof value === 'object') {
      return `<pre class="fm-complex">${escapeHtml(jsyaml.dump(value).trimEnd())}</pre>`;
    }
    return escapeHtml(String(value));
  }

  function renderFrontmatterTable(data) {
    const rows = Object.entries(data).map(([key, value]) =>
      `<tr><th>${escapeHtml(key)}</th><td>${renderFrontmatterValue(value)}</td></tr>`
    );
    return `<table class="frontmatter-table"><tbody>${rows.join('')}</tbody></table>`;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getWikiLinkParts(rawLink) {
    const value = String(rawLink || "").trim();
    const pipeIndex = value.indexOf("|");
    const target = (pipeIndex >= 0 ? value.slice(0, pipeIndex) : value).trim();
    const label = (pipeIndex >= 0 ? value.slice(pipeIndex + 1) : target).trim() || target;
    return { target, label };
  }

  function isExternalOrSpecialLinkTarget(target) {
    return /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(String(target || "").trim());
  }

  function isExternalWebLinkTarget(target) {
    return /^(?:https?:\/\/|\/\/)/i.test(String(target || "").trim());
  }

  function normalizeExternalWebLinkTarget(target) {
    const trimmedTarget = String(target || "").trim();
    return trimmedTarget.startsWith("//") ? `${window.location.protocol}${trimmedTarget}` : trimmedTarget;
  }

  async function openExternalWebLink(target) {
    const url = normalizeExternalWebLinkTarget(target);
    if (!url) return;

    try {
      if (typeof Neutralino !== "undefined" && Neutralino.os && typeof Neutralino.os.open === "function") {
        await Neutralino.os.open(url);
        return;
      }
    } catch (error) {
      console.error("Failed to open external link with the OS:", error);
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  function getWikiLinkHref(target) {
    const trimmedTarget = String(target || "").trim();
    if (!trimmedTarget) return "#";
    if (trimmedTarget.startsWith("#")) return trimmedTarget;
    if (isExternalOrSpecialLinkTarget(trimmedTarget)) return "#";

    const hashIndex = trimmedTarget.indexOf("#");
    const pathPart = hashIndex >= 0 ? trimmedTarget.slice(0, hashIndex) : trimmedTarget;
    const suffix = hashIndex >= 0 ? trimmedTarget.slice(hashIndex) : "";
    const pathWithExtension = /\.[^/\\]+$/.test(pathPart) ? pathPart : `${pathPart}.md`;
    return encodeURI(`${pathWithExtension}${suffix}`);
  }

  function splitLinkTarget(target) {
    const rawTarget = String(target || "").trim();
    const hashIndex = rawTarget.indexOf("#");
    const queryIndex = rawTarget.indexOf("?");
    const cutIndexes = [hashIndex, queryIndex].filter((index) => index >= 0);
    const firstCutIndex = cutIndexes.length ? Math.min(...cutIndexes) : -1;
    const path = firstCutIndex >= 0 ? rawTarget.slice(0, firstCutIndex) : rawTarget;
    const suffix = firstCutIndex >= 0 ? rawTarget.slice(firstCutIndex) : "";
    const hash = hashIndex >= 0 ? rawTarget.slice(hashIndex + 1).split("?")[0] : "";
    return { path, suffix, hash };
  }

  function safeDecodeLinkPath(path) {
    try {
      return decodeURIComponent(String(path || ""));
    } catch (_) {
      return String(path || "");
    }
  }

  function normalizeMarkdownLinkPath(path) {
    const normalized = safeDecodeLinkPath(path)
      .replace(/\\/g, "/")
      .replace(/^\.\//, "");
    const segments = [];

    normalized.split("/").forEach((segment) => {
      if (!segment || segment === ".") return;
      if (segment === "..") {
        if (segments.length && segments[segments.length - 1] !== "..") {
          segments.pop();
        } else {
          segments.push(segment);
        }
        return;
      }
      segments.push(segment);
    });

    return segments.join("/");
  }

  function getDirectoryPath(path) {
    const normalized = String(path || "").replace(/\\/g, "/");
    const index = normalized.lastIndexOf("/");
    return index >= 0 ? normalized.slice(0, index) : "";
  }

  function getLinkPathExtension(path) {
    const fileName = getFileName(splitLinkTarget(path).path);
    const extensionMatch = fileName.match(/\.([^.]*)$/);
    return extensionMatch ? extensionMatch[1].toLowerCase() : "";
  }

  function isMarkdownDocumentLinkPath(path) {
    const { path: targetPath } = splitLinkTarget(path);
    if (!targetPath) return false;
    const extension = getLinkPathExtension(targetPath);
    return !extension || extension === "md" || extension === "markdown";
  }

  function ensureMarkdownLinkExtension(path) {
    if (!path || getLinkPathExtension(path)) return path;
    return `${path}.md`;
  }

  function isSameOriginMarkdownUrl(target) {
    try {
      const url = new URL(String(target || ""), window.location.href);
      return url.origin === window.location.origin && isMarkdownDocumentLinkPath(url.pathname);
    } catch (_) {
      return false;
    }
  }

  function getSameOriginMarkdownUrlPath(target) {
    const url = new URL(String(target || ""), window.location.href);
    return `${url.pathname.replace(/^\/+/, "")}${url.search}${url.hash}`;
  }

  function isAbsoluteFilesystemPath(path) {
    const value = String(path || "");
    return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value) || value.startsWith("/");
  }

  function normalizeFilesystemLinkPath(path) {
    const rawPath = safeDecodeLinkPath(path).replace(/\\/g, "/");
    const driveMatch = rawPath.match(/^[a-zA-Z]:\//);
    const prefix = driveMatch ? driveMatch[0] : (rawPath.startsWith("/") ? "/" : "");
    const pathWithoutPrefix = prefix ? rawPath.slice(prefix.length) : rawPath;
    return prefix + normalizeMarkdownLinkPath(pathWithoutPrefix);
  }

  function resolveMarkdownLinkPath(targetPath, basePath) {
    const decodedTarget = safeDecodeLinkPath(targetPath).replace(/\\/g, "/");
    if (!decodedTarget) return "";
    if (isAbsoluteFilesystemPath(decodedTarget)) {
      return normalizeFilesystemLinkPath(decodedTarget);
    }

    const decodedBasePath = safeDecodeLinkPath(basePath || "").replace(/\\/g, "/");
    if (isAbsoluteFilesystemPath(decodedBasePath)) {
      const baseDirectory = getDirectoryPath(decodedBasePath);
      return normalizeFilesystemLinkPath(baseDirectory ? `${baseDirectory}/${decodedTarget}` : decodedTarget);
    }

    const normalizedBasePath = normalizeMarkdownLinkPath(decodedBasePath);
    const baseDirectory = getDirectoryPath(normalizedBasePath);
    return normalizeMarkdownLinkPath(baseDirectory ? `${baseDirectory}/${decodedTarget}` : decodedTarget);
  }

  function getActiveMarkdownSourcePath() {
    const activeTab = getActiveMarkdownTab();
    return activeTab && activeTab.sourceFilePath ? activeTab.sourceFilePath : "";
  }

  function getFolderEntryPathCandidates(entry) {
    const candidates = [
      entry && entry.path,
      entry && entry.fullPath,
      entry && entry.file && entry.file.webkitRelativePath,
      entry && entry.file && entry.file.name
    ];
    return candidates
      .filter(Boolean)
      .map((path) => normalizeMarkdownLinkPath(path));
  }

  function findOpenFolderMarkdownEntry(resolvedPath, rawTargetPath) {
    const normalizedResolvedPath = normalizeMarkdownLinkPath(resolvedPath);
    const normalizedRawTargetPath = normalizeMarkdownLinkPath(ensureMarkdownLinkExtension(rawTargetPath || ""));
    const rawTargetIsBareFileName = !!normalizedRawTargetPath && !normalizedRawTargetPath.includes("/");
    const rawTargetFileName = rawTargetIsBareFileName ? getFileName(normalizedRawTargetPath).toLowerCase() : "";
    const resolvedWithoutFolderRoot = activeFolderName && normalizedResolvedPath.startsWith(`${activeFolderName}/`)
      ? normalizedResolvedPath.slice(activeFolderName.length + 1)
      : normalizedResolvedPath;

    const exactMatch = (folderMarkdownFiles || []).find((entry) => {
      const candidates = getFolderEntryPathCandidates(entry);
      return candidates.some((candidate) => {
        const candidateWithoutFolderRoot = activeFolderName && candidate.startsWith(`${activeFolderName}/`)
          ? candidate.slice(activeFolderName.length + 1)
          : candidate;
        return candidate === normalizedResolvedPath
          || candidate === resolvedWithoutFolderRoot
          || candidateWithoutFolderRoot === normalizedResolvedPath
          || candidateWithoutFolderRoot === resolvedWithoutFolderRoot;
      });
    });

    if (exactMatch || !rawTargetIsBareFileName) return exactMatch || null;

    return (folderMarkdownFiles || []).find((entry) => {
      return getFolderEntryPathCandidates(entry).some((candidate) => {
        return getFileName(candidate).toLowerCase() === rawTargetFileName;
      });
    }) || null;
  }

  function getMarkdownLinkSourceFile(target) {
    const { path: rawTargetPath } = splitLinkTarget(target);
    if (!rawTargetPath || !isMarkdownDocumentLinkPath(rawTargetPath)) return null;

    const targetPath = ensureMarkdownLinkExtension(rawTargetPath);
    const activeSourcePath = getActiveMarkdownSourcePath();
    const resolvedPath = resolveMarkdownLinkPath(targetPath, activeSourcePath);
    const folderEntry = findOpenFolderMarkdownEntry(resolvedPath, rawTargetPath);

    if (folderEntry) {
      return {
        name: folderEntry.name || getFileName(folderEntry.path || folderEntry.fullPath || targetPath),
        file: folderEntry.file || null,
        handle: folderEntry.handle || null,
        path: folderEntry.fullPath || folderEntry.path || resolvedPath
      };
    }

    if (typeof NL_VERSION !== "undefined") {
      if (isAbsoluteFilesystemPath(resolvedPath)) {
        return {
          name: getFileName(resolvedPath),
          path: resolvedPath
        };
      }
      if (activeFolderPath) {
        const folderRelativePath = normalizeMarkdownLinkPath(resolvedPath).replace(new RegExp(`^${activeFolderName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`), "");
        const fullPath = joinPath(activeFolderPath, folderRelativePath);
        return {
          name: getFileName(fullPath),
          path: fullPath
        };
      }
    }

    return null;
  }

  function scrollMarkdownPreviewToHash(hash) {
    if (!hash) return;
    requestAnimationFrame(() => {
      const decodedHash = safeDecodeLinkPath(String(hash).replace(/^#/, ""));
      const target = markdownPreview.querySelector(`#${CSS.escape(decodedHash)}`)
        || markdownPreview.querySelector(`[name="${CSS.escape(decodedHash)}"]`);
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  async function openMarkdownLinkFromPreview(rawTarget) {
    const { hash } = splitLinkTarget(rawTarget);
    const sourceFile = getMarkdownLinkSourceFile(rawTarget);

    if (!sourceFile) {
      alert("Unable to open this Markdown link. Open the containing folder or use the desktop app so Markdown Viewer can read linked local files.");
      return;
    }

    const existingTab = findTabForSourceFile(sourceFile);
    if (existingTab) {
      switchTab(existingTab.id);
      pinTemporaryTab(existingTab.id);
      scrollMarkdownPreviewToHash(hash);
      return;
    }

    try {
      const openedTab = await openDocumentSourceFile(sourceFile);
      if (openedTab) {
        pinTemporaryTab(openedTab.id);
        scrollMarkdownPreviewToHash(hash);
      }
    } catch (error) {
      console.error("Failed to open linked Markdown file:", error);
      alert("Unable to open linked Markdown file.");
    }
  }

  function annotatePreviewMarkdownLinks(container) {
    if (!container) return;

    container.querySelectorAll("a[href]").forEach((anchor) => {
      const rawHref = anchor.getAttribute("href") || "";
      if (!rawHref || rawHref.startsWith("#")) return;

      let markdownTarget = "";
      if (!isExternalOrSpecialLinkTarget(rawHref) && isMarkdownDocumentLinkPath(rawHref)) {
        markdownTarget = rawHref;
      } else if (isSameOriginMarkdownUrl(rawHref)) {
        markdownTarget = getSameOriginMarkdownUrlPath(rawHref);
      }

      if (!markdownTarget) return;

      anchor.dataset.markdownLinkTarget = markdownTarget;
      anchor.setAttribute("href", "#");
      anchor.setAttribute("role", "button");
      anchor.title = anchor.title || `Open Markdown file: ${splitLinkTarget(markdownTarget).path}`;
    });
  }

  function getPreviewLinkStatusUrl(anchor) {
    if (!anchor) return "";

    const markdownTarget = anchor.dataset.markdownLinkTarget || "";
    if (markdownTarget) return markdownTarget;

    const rawHref = anchor.getAttribute("href") || "";
    if (!rawHref) return "";

    return anchor.href || rawHref;
  }

  function handlePreviewLinkMouseOver(event) {
    const anchor = event.target.closest("a[href], a[data-markdown-link-target]");
    if (!anchor || !markdownPreview.contains(anchor)) return;

    previewHoveredLinkUrl = getPreviewLinkStatusUrl(anchor);
    updateStatusLine();
  }

  function handlePreviewLinkMouseOut(event) {
    const anchor = event.target.closest("a[href], a[data-markdown-link-target]");
    if (!anchor || !markdownPreview.contains(anchor)) return;
    if (event.relatedTarget && anchor.contains(event.relatedTarget)) return;

    previewHoveredLinkUrl = "";
    updateStatusLine();
  }

  function handlePreviewLinkClick(event) {
    const anchor = event.target.closest("a[href], a[data-markdown-link-target]");
    if (!anchor || !markdownPreview.contains(anchor)) return;

    const markdownTarget = anchor.dataset.markdownLinkTarget || "";
    const rawHref = markdownTarget || anchor.getAttribute("href") || "";
    if (!rawHref) return;

    if (!markdownTarget && rawHref.startsWith("#") && rawHref.length > 1) {
      event.preventDefault();
      event.stopPropagation();
      scrollMarkdownPreviewToHash(rawHref);
      return;
    }

    let linkTarget = rawHref;
    if (!markdownTarget && isSameOriginMarkdownUrl(rawHref)) {
      linkTarget = getSameOriginMarkdownUrlPath(rawHref);
    } else if (!markdownTarget && isExternalWebLinkTarget(rawHref)) {
      event.preventDefault();
      event.stopPropagation();
      openExternalWebLink(rawHref);
      return;
    } else if (!markdownTarget && isExternalOrSpecialLinkTarget(rawHref)) {
      return;
    }

    if (!isMarkdownDocumentLinkPath(linkTarget)) return;

    event.preventDefault();
    event.stopPropagation();
    openMarkdownLinkFromPreview(linkTarget);
  }

  function createWikiLinkAnchor(rawLink) {
    const { target, label } = getWikiLinkParts(rawLink);
    const anchor = document.createElement("a");
    anchor.className = "wiki-link";
    anchor.href = getWikiLinkHref(target);
    anchor.textContent = label;
    anchor.title = `Wiki link: ${target}`;
    anchor.dataset.wikiTarget = target;
    return anchor;
  }

  function shouldSkipWikiLinkTextNode(node) {
    const parent = node && node.parentElement;
    return !parent || !!parent.closest("a, code, pre, script, style, textarea");
  }

  function enhanceWikiLinks(container) {
    if (!container) return;

    const textNodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (shouldSkipWikiLinkTextNode(node) || !/\[\[[^\]\n]+\]\]/.test(node.nodeValue || "")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    textNodes.forEach((textNode) => {
      const fragment = document.createDocumentFragment();
      const text = textNode.nodeValue || "";
      const wikiLinkRegex = /\[\[([^\]\n]+)\]\]/g;
      let lastIndex = 0;
      let match;

      while ((match = wikiLinkRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        fragment.appendChild(createWikiLinkAnchor(match[1]));
        lastIndex = wikiLinkRegex.lastIndex;
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      textNode.parentNode.replaceChild(fragment, textNode);
    });
  }

  const sampleMarkdown = `---
title: Welcome to Markdown Viewer
description: A GitHub-style Markdown renderer with live preview, math, diagrams, and export support.
author: ThisIs-Developer
tags: ["markdown", "preview", "mermaid", "latex", "open-source"]
---

# Welcome to Markdown Viewer

## ✨ Key Features
- **Live Preview** with GitHub styling
- **Smart Import/Export** (MD, HTML, PDF)
- **Mermaid Diagrams** for visual documentation
- **LaTeX Math Support** for scientific notation
- **Emoji Support** 😄 👍 🎉

## 💻 Code with Syntax Highlighting
\`\`\`javascript
  function renderMarkdown() {
    const markdown = markdownEditor.value;
    const html = marked.parse(markdown);
    const sanitizedHtml = DOMPurify.sanitize(html);
    markdownPreview.innerHTML = sanitizedHtml;
    
    // Syntax highlighting is handled automatically
    // during the parsing phase by the marked renderer.
    // Themes are applied instantly via CSS variables.
  }
\`\`\`

## 🧮 Mathematical Expressions
Write complex formulas with LaTeX syntax:

Inline equation: $$E = mc^2$$

Display equations:
$$\\frac{\\partial f}{\\partial x} = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}$$

$$\\sum_{i=1}^{n} i^2 = \\frac{n(n+1)(2n+1)}{6}$$

## 📊 Mermaid Diagrams
Create powerful visualizations directly in markdown:

\`\`\`mermaid
flowchart LR
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    C --> E[Deploy]
    D --> B
\`\`\`

### Sequence Diagram Example
\`\`\`mermaid
sequenceDiagram
    User->>Editor: Type markdown
    Editor->>Preview: Render content
    User->>Editor: Make changes
    Editor->>Preview: Update rendering
    User->>Export: Save as PDF
\`\`\`

## 📋 Task Management
- [x] Create responsive layout
- [x] Implement live preview with GitHub styling
- [x] Add syntax highlighting for code blocks
- [x] Support math expressions with LaTeX
- [x] Enable mermaid diagrams

## 🆚 Feature Comparison

| Feature                  | Markdown Viewer (Ours) | Other Markdown Editors  |
|:-------------------------|:----------------------:|:-----------------------:|
| Live Preview             | ✅ GitHub-Styled       | ✅                     |
| Sync Scrolling           | ✅ Two-way             | 🔄 Partial/None        |
| Mermaid Support          | ✅                     | ❌/Limited             |
| LaTeX Math Rendering     | ✅                     | ❌/Limited             |

### 📝 Multi-row Headers Support

<table>
  <thead>
    <tr>
      <th rowspan="2">Document Type</th>
      <th colspan="2">Support</th>
    </tr>
    <tr>
      <th>Markdown Viewer (Ours)</th>
      <th>Other Markdown Editors</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Technical Docs</td>
      <td>Full + Diagrams</td>
      <td>Limited/Basic</td>
    </tr>
    <tr>
      <td>Research Notes</td>
      <td>Full + Math</td>
      <td>Partial</td>
    </tr>
    <tr>
      <td>Developer Guides</td>
      <td>Full + Export Options</td>
      <td>Basic</td>
    </tr>
  </tbody>
</table>

## 📝 Text Formatting Examples

### Text Formatting

Text can be formatted in various ways for ~~strikethrough~~, **bold**, *italic*, or ***bold italic***.

For highlighting important information, use <mark>highlighted text</mark> or add <u>underlines</u> where appropriate.

### Superscript and Subscript

Chemical formulas: H<sub>2</sub>O, CO<sub>2</sub>  
Mathematical notation: x<sup>2</sup>, e<sup>iπ</sup>

### Keyboard Keys

Press <kbd>Ctrl</kbd> + <kbd>B</kbd> for bold text.

### Abbreviations

<abbr title="Graphical User Interface">GUI</abbr>  
<abbr title="Application Programming Interface">API</abbr>

### Text Alignment

<div style="text-align: center">
Centered text for headings or important notices
</div>

<div style="text-align: right">
Right-aligned text (for dates, signatures, etc.)
</div>

### **Lists**

Create bullet points:
* Item 1
* Item 2
  * Nested item
    * Nested further

### **Links and Images**

Add a [link](https://github.com/ThisIs-Developer/Markdown-Viewer) to important resources.

Embed an image:
![Markdown Logo](https://markdownviewer.pages.dev/assets/icon.jpg)

### **Blockquotes**

Quote someone famous:
> "The best way to predict the future is to invent it." - Alan Kay

---

## 🛡️ Security Note

This is a fully client-side application. Your content never leaves your browser and stays secure on your device.`;

  markdownEditor.value = sampleMarkdown;

  // ========================================
  // DOCUMENT TABS & SESSION MANAGEMENT
  // ========================================

  const STORAGE_KEY = 'markdownViewerTabs';
  const ACTIVE_TAB_KEY = 'markdownViewerActiveTab';
  const UNTITLED_COUNTER_KEY = 'markdownViewerUntitledCounter';
  let tabs = [];
  let activeTabId = null;
  let folderMarkdownFiles = [];
  let activeFolderName = "Graph View";
  let activeFolderHandle = null;
  let activeFolderPath = null;
  let draggedTabId = null;
  let saveTabStateTimeout = null;
  let graphLayoutSaveTimeout = null;
  let untitledCounter = 0;
  const graphRenderCache = new Map();
  const GRAPH_DOCUMENT_SCHEMA_VERSION = 1;

  function cloneGraphPersistenceValue(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      console.warn("Failed to clone graph persistence value:", e);
      return null;
    }
  }

  function normalizeGraphTimestamp(value, fallback) {
    const timestamp = typeof value === "string" ? Date.parse(value) : Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback;
  }

  function normalizeGraphDocument(document) {
    const source = document && typeof document === "object" ? document : {};
    const snapshot = cloneGraphPersistenceValue(source.snapshot || source.graphSnapshot || null);
    const hasViewConfig = Object.prototype.hasOwnProperty.call(source, "viewConfig");
    const viewConfig = cloneGraphPersistenceValue(hasViewConfig ? source.viewConfig : (source.graphViewConfig || null));
    const layoutSource = source.graphLayout !== undefined ? source.graphLayout : (
      source.graphLayoutData !== undefined ? source.graphLayoutData : (
        source.layout !== undefined ? source.layout : source.layoutData
      )
    );
    const createdAt = normalizeGraphTimestamp(source.createdAt || snapshot?.createdAt, Date.now());
    const normalized = {
      schemaVersion: source.schemaVersion || GRAPH_DOCUMENT_SCHEMA_VERSION,
      folderName: source.folderName || snapshot?.folderName || source.title || "Graph View",
      createdAt,
      updatedAt: normalizeGraphTimestamp(source.updatedAt, createdAt),
      snapshot,
      viewConfig
    };

    if (layoutSource !== undefined && layoutSource !== null) {
      normalized.graphLayout = cloneGraphPersistenceValue(layoutSource);
    }

    return normalized;
  }

  function serializeGraphTab(tab) {
    const existingDocument = tab?.graphDocument && typeof tab.graphDocument === "object" ? tab.graphDocument : {};
    return normalizeGraphDocument({
      ...existingDocument,
      folderName: tab?.folderName || tab?.title || existingDocument.folderName || "Graph View",
      createdAt: existingDocument.createdAt || tab?.createdAt,
      updatedAt: Date.now(),
      snapshot: tab?.graphSnapshot !== undefined ? tab.graphSnapshot : existingDocument.snapshot,
      viewConfig: tab?.graphViewConfig !== undefined ? tab.graphViewConfig : existingDocument.viewConfig,
      graphLayout: tab?.graphLayout !== undefined ? tab.graphLayout : (existingDocument.graphLayout !== undefined ? existingDocument.graphLayout : existingDocument.layout)
    });
  }

  function deserializeGraphDocument(document) {
    const normalizedDocument = normalizeGraphDocument(document);
    const graphData = {
      folderName: normalizedDocument.folderName,
      graphSnapshot: normalizedDocument.snapshot,
      graphViewConfig: normalizedDocument.viewConfig,
      graphDocument: normalizedDocument
    };

    if (Object.prototype.hasOwnProperty.call(normalizedDocument, "graphLayout")) {
      graphData.graphLayout = normalizedDocument.graphLayout;
    }

    return graphData;
  }

  function syncGraphTabDocument(tab) {
    if (!tab || tab.type !== "graph") return tab;
    const graphDocument = serializeGraphTab(tab);
    tab.folderName = graphDocument.folderName;
    tab.graphSnapshot = graphDocument.snapshot;
    tab.graphViewConfig = graphDocument.viewConfig;
    tab.graphDocument = graphDocument;
    if (Object.prototype.hasOwnProperty.call(graphDocument, "graphLayout")) tab.graphLayout = graphDocument.graphLayout;
    return tab;
  }

  function getActiveGraphTab() {
    return tabs.find((tab) => tab.id === activeTabId && tab.type === "graph") || null;
  }

  function getSuggestedGraphFileName(tab) {
    const rawName = (tab?.folderName || tab?.title || "graph-view").trim() || "graph-view";
    const safeName = rawName.replace(/[\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "graph-view";
    return /\.mdviewer-graph\.json$/i.test(safeName) ? safeName : `${safeName}.mdviewer-graph.json`;
  }

  function isFileBackedGraphTab(tab) {
    return !!(tab && tab.type === "graph" && (tab.sourceFileHandle || tab.sourceFilePath || tab.sourceFileName));
  }

  function markGraphTabAsChanged(tab) {
    if (!isFileBackedGraphTab(tab)) return;
    tab.graphHasUnsavedChanges = true;
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
  }

  function clearGraphTabUnsavedChanges(tab) {
    if (!tab || tab.type !== "graph") return;
    tab.graphHasUnsavedChanges = false;
  }

  function getGraphFileSignature(files) {
    return (files || []).map((fileEntry) => {
      const file = fileEntry.file || fileEntry;
      return {
        path: fileEntry.path || file?.webkitRelativePath || file?.name || "",
        name: file?.name || "",
        size: file?.size || 0,
        lastModified: file?.lastModified || 0
      };
    });
  }

  function getGraphViewSignature(files, graphViewConfig) {
    return JSON.stringify({
      files: getGraphFileSignature(files),
      config: graphViewConfig || null
    });
  }

  async function createGraphSnapshot(files, folderName) {
    const nodes = [];
    const links = [];
    const seenEdges = new Set();
    const nodeIndex = new Map();
    const snapshotFiles = [];

    for (const fileEntry of (files || [])) {
      const path = fileEntry.path || fileEntry.file?.webkitRelativePath || fileEntry.file?.name || "";
      const name = getFileName(path || fileEntry.file?.name || "document.md");
      let content = fileEntry.content;
      if (content === undefined) {
        if (fileEntry.file) {
          content = await fileEntry.file.text();
        } else if (fileEntry.handle) {
          const file = await fileEntry.handle.getFile();
          content = await file.text();
        } else if (typeof NL_VERSION !== "undefined" && fileEntry.fullPath) {
          content = await Neutralino.filesystem.readFile(fileEntry.fullPath);
        } else {
          content = "";
        }
      }

      const id = normalizeGraphNodeName(path);
      nodeIndex.set(id, path);
      nodes.push({ id, label: getGraphDisplayLabel(path), fullPath: path });
      snapshotFiles.push({
        id,
        path,
        name,
        content: content || "",
        fullPath: fileEntry.fullPath || null
      });
    }

    for (const snapshotFile of snapshotFiles) {
      const source = snapshotFile.id;
      extractMarkdownLinks(snapshotFile.content).forEach((ref) => {
        const target = resolveGraphTargetId(ref, snapshotFile.path, nodeIndex);
        if (!target || target === source) return;
        const edgeKey = `${source}->${target}`;
        if (seenEdges.has(edgeKey)) return;
        seenEdges.add(edgeKey);
        links.push({ source, target });
      });
    }

    return {
      version: 1,
      folderName: folderName || "Graph View",
      createdAt: Date.now(),
      nodes,
      links,
      files: snapshotFiles
    };
  }

  function getGraphSnapshotSignature(snapshot, graphViewConfig) {
    return JSON.stringify({
      snapshot: {
        version: snapshot?.version || 0,
        folderName: snapshot?.folderName || "",
        createdAt: snapshot?.createdAt || 0,
        nodes: (snapshot?.nodes || []).map((node) => node.id),
        links: (snapshot?.links || []).map((link) => `${link.source}->${link.target}`)
      },
      config: graphViewConfig || null
    });
  }

  function toFiniteNumber(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function getSavedGraphNodeLayout(graphLayout, nodeId) {
    if (!graphLayout || !nodeId) return null;
    if (graphLayout.nodes && typeof graphLayout.nodes === "object") return graphLayout.nodes[nodeId] || null;
    if (Array.isArray(graphLayout.nodePositions)) {
      return graphLayout.nodePositions.find((entry) => entry && entry.id === nodeId) || null;
    }
    return null;
  }

  function applySavedGraphLayout(nodes, graphLayout) {
    (nodes || []).forEach((node) => {
      const savedNode = getSavedGraphNodeLayout(graphLayout, node.id);
      if (!savedNode) return;
      const x = toFiniteNumber(savedNode.x);
      const y = toFiniteNumber(savedNode.y);
      const fx = toFiniteNumber(savedNode.fx);
      const fy = toFiniteNumber(savedNode.fy);
      if (x !== null) node.x = x;
      if (y !== null) node.y = y;
      if (fx !== null) node.fx = fx;
      if (fy !== null) node.fy = fy;
    });
  }

  function getSavedGraphZoomTransform(graphLayout) {
    const zoom = graphLayout?.zoom || graphLayout?.transform || null;
    if (!zoom) return null;
    const x = toFiniteNumber(zoom.x);
    const y = toFiniteNumber(zoom.y);
    const k = toFiniteNumber(zoom.k ?? zoom.scale);
    if (x === null || y === null || k === null || k <= 0) return null;
    return { x, y, k };
  }

  function captureGraphLayout(tab, nodes, zoomTransform, options) {
    if (!tab || tab.type !== "graph") return null;
    const storePinnedPositions = !!options?.storePinnedPositions;
    const existingLayout = tab.graphLayout && typeof tab.graphLayout === "object" ? tab.graphLayout : {};
    const existingNodes = existingLayout.nodes && typeof existingLayout.nodes === "object" ? existingLayout.nodes : {};
    const nextNodes = { ...existingNodes };

    (nodes || []).forEach((node) => {
      if (!node?.id) return;
      const x = toFiniteNumber(node.x);
      const y = toFiniteNumber(node.y);
      const fx = toFiniteNumber(node.fx);
      const fy = toFiniteNumber(node.fy);
      const entry = {};
      if (x !== null) entry.x = x;
      if (y !== null) entry.y = y;
      if (storePinnedPositions && fx !== null) entry.fx = fx;
      if (storePinnedPositions && fy !== null) entry.fy = fy;
      if (Object.keys(entry).length) nextNodes[node.id] = entry;
    });

    const zoom = zoomTransform ? { x: zoomTransform.x, y: zoomTransform.y, k: zoomTransform.k } : getSavedGraphZoomTransform(existingLayout);
    const nextLayout = {
      ...existingLayout,
      magneticEnabled: graphSettings.magneticEnabled,
      nodes: nextNodes,
      updatedAt: Date.now()
    };
    if (zoom) nextLayout.zoom = zoom;

    tab.graphLayout = nextLayout;
    if (tab.graphDocument && typeof tab.graphDocument === "object") {
      tab.graphDocument.graphLayout = nextLayout;
      tab.graphDocument.updatedAt = Date.now();
    }
    return nextLayout;
  }

  function hideInactiveGraphRenders(activeGraphTabId) {
    graphRenderCache.forEach((entry, tabId) => {
      if (!entry || !entry.wrapper) return;
      entry.wrapper.classList.toggle("hidden", tabId !== activeGraphTabId);
    });
  }

  function suspendGraphRender(tabId) {
    const entry = graphRenderCache.get(tabId);
    if (entry && entry.simulation) entry.simulation.stop();
  }

  function suspendActiveGraphRender() {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (activeTab && activeTab.type === "graph") suspendGraphRender(activeTab.id);
  }

  function loadTabsFromStorage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveTabsToStorage(tabsArr) {
    try {
      (tabsArr || []).forEach((tab) => syncGraphTabDocument(tab));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tabsArr));
    } catch (e) {
      console.warn('Failed to save tabs to localStorage:', e);
    }
  }

  function scheduleGraphLayoutStorageSave() {
    clearTimeout(graphLayoutSaveTimeout);
    graphLayoutSaveTimeout = setTimeout(() => {
      graphLayoutSaveTimeout = null;
      saveTabsToStorage(tabs);
    }, 750);
  }

  function loadActiveTabId() {
    return localStorage.getItem(ACTIVE_TAB_KEY);
  }

  function saveActiveTabId(id) {
    localStorage.setItem(ACTIVE_TAB_KEY, id);
  }

  function loadUntitledCounter() {
    return parseInt(localStorage.getItem(UNTITLED_COUNTER_KEY) || '0', 10);
  }

  function saveUntitledCounter(val) {
    localStorage.setItem(UNTITLED_COUNTER_KEY, String(val));
  }

  function normalizeEditorContent(content) {
    // Textareas normalize CRLF/CR line endings to LF, so compare and store
    // tab contents the same way to avoid false unsaved markers after switching tabs.
    return String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function tabHasUnsavedChanges(tab, currentContent) {
    if (!tab) return false;
    if (tab.type === "graph") {
      return isFileBackedGraphTab(tab) && tab.graphHasUnsavedChanges === true;
    }
    const contentToCompare = currentContent === undefined ? tab.content : currentContent;
    return normalizeEditorContent(tab.savedContent) !== normalizeEditorContent(contentToCompare);
  }

  function nextUntitledTitle() {
    untitledCounter += 1;
    saveUntitledCounter(untitledCounter);
    return 'Untitled ' + untitledCounter;
  }

  function createTab(content, title, viewMode) {
    if (content === undefined) content = '';
    content = normalizeEditorContent(content);
    if (title === undefined) title = null;
    if (viewMode === undefined) viewMode = 'split';
    return {
      id: 'tab_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      title: title || 'Untitled',
      content: content,
      scrollPos: 0,
      viewMode: viewMode,
      createdAt: Date.now(),
      isTemporary: false,
      sourceFileName: null,
      sourceFileHandle: null,
      sourceFilePath: null,
      savedContent: content,
      type: "markdown",
      folderName: null
    };
  }

  function createGraphTab(folderName, options) {
    if (options === undefined) options = {};
    const graphDocument = normalizeGraphDocument({
      ...(options.graphDocument || {}),
      folderName: folderName || options.folderName || "Graph View",
      snapshot: options.graphSnapshot !== undefined ? options.graphSnapshot : options.graphDocument?.snapshot,
      viewConfig: options.graphViewConfig !== undefined ? options.graphViewConfig : options.graphDocument?.viewConfig,
      graphLayout: options.graphLayout !== undefined ? options.graphLayout : (options.graphDocument?.graphLayout !== undefined ? options.graphDocument.graphLayout : options.graphDocument?.layout)
    });
    const graphData = deserializeGraphDocument(graphDocument);
    const tab = createTab("", graphData.folderName, "preview");
    tab.type = "graph";
    tab.folderName = graphData.folderName;
    tab.graphViewConfig = graphData.graphViewConfig;
    tab.graphSnapshot = graphData.graphSnapshot;
    tab.graphDocument = graphData.graphDocument;
    if (Object.prototype.hasOwnProperty.call(graphData, "graphLayout")) tab.graphLayout = graphData.graphLayout;
    return tab;
  }

  function getGraphTitleFromFileName(fileName) {
    return (fileName || "Saved Graph")
      .replace(/\.mdviewer-graph\.json$/i, "")
      .replace(/\.mdgraph\.json$/i, "")
      .replace(/\.json$/i, "");
  }

  function getGraphTabTitle(tab) {
    if (!tab || tab.type !== "graph") return tab?.title || 'Untitled';
    if (tab.sourceFileName) return getGraphTitleFromFileName(tab.sourceFileName) || "Saved Graph";
    if (tab.sourceFilePath) return getGraphTitleFromFileName(getFileName(tab.sourceFilePath)) || "Saved Graph";
    return tab.title || tab.folderName || "Graph View";
  }

  function getTabDisplayName(tab) {
    const baseName = tab && tab.type === "graph" ? getGraphTabTitle(tab) : (tab.title || 'Untitled');
    return tabHasUnsavedChanges(tab) ? baseName + ' *' : baseName;
  }

  function getTabTooltipText(tab) {
    if (!tab) return 'Untitled';
    return tab.sourceFilePath || tab.sourceFileName || tab.title || tab.folderName || 'Untitled';
  }

  function updateTabScrollControls() {
    const tabList = document.getElementById('tab-list');
    const scrollLeftBtn = document.getElementById('tab-scroll-left');
    const scrollRightBtn = document.getElementById('tab-scroll-right');
    if (!tabList || !scrollLeftBtn || !scrollRightBtn) return;

    const hasOverflow = tabList.scrollWidth > tabList.clientWidth + 1;
    scrollLeftBtn.classList.toggle('visible', hasOverflow);
    scrollRightBtn.classList.toggle('visible', hasOverflow);

    const maxScrollLeft = Math.max(0, tabList.scrollWidth - tabList.clientWidth);
    scrollLeftBtn.disabled = !hasOverflow || tabList.scrollLeft <= 1;
    scrollRightBtn.disabled = !hasOverflow || tabList.scrollLeft >= maxScrollLeft - 1;
  }

  function scrollTabsBy(delta) {
    const tabList = document.getElementById('tab-list');
    if (!tabList) return;

    tabList.scrollBy({ left: delta, behavior: 'smooth' });
    window.setTimeout(updateTabScrollControls, 180);
  }

  function setupTabScrolling() {
    const tabList = document.getElementById('tab-list');
    const scrollLeftBtn = document.getElementById('tab-scroll-left');
    const scrollRightBtn = document.getElementById('tab-scroll-right');
    if (!tabList || !scrollLeftBtn || !scrollRightBtn) return;

    const getScrollAmount = function() {
      return Math.max(160, Math.floor(tabList.clientWidth * 0.75));
    };

    scrollLeftBtn.addEventListener('click', function() {
      scrollTabsBy(-getScrollAmount());
    });

    scrollRightBtn.addEventListener('click', function() {
      scrollTabsBy(getScrollAmount());
    });

    tabList.addEventListener('wheel', function(e) {
      if (tabList.scrollWidth <= tabList.clientWidth) return;

      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;

      e.preventDefault();
      tabList.scrollLeft += delta;
      updateTabScrollControls();
    }, { passive: false });

    tabList.addEventListener('scroll', updateTabScrollControls);
    window.addEventListener('resize', updateTabScrollControls);
    updateTabScrollControls();
  }

  setupTabScrolling();

  function renderTabBar(tabsArr, currentActiveTabId) {
    const tabList = document.getElementById('tab-list');
    if (!tabList) return;
    tabList.innerHTML = '';
    tabsArr.forEach(function(tab) {
      const item = document.createElement('div');
      item.className = 'tab-item' + (tab.id === currentActiveTabId ? ' active' : '') + (tabHasUnsavedChanges(tab) ? ' unsaved' : '');
      item.setAttribute('data-tab-id', tab.id);
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', tab.id === currentActiveTabId ? 'true' : 'false');
      item.setAttribute('draggable', 'true');

      const displayName = getTabDisplayName(tab);
      const tooltipText = getTabTooltipText(tab);
      item.title = tooltipText;
      item.setAttribute('aria-label', tooltipText);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'tab-title' + (tab.isTemporary ? ' temporary' : '');
      titleSpan.title = tooltipText;
      if (tab.type === "graph") {
        const graphIcon = document.createElement("i");
        graphIcon.className = "bi bi-diagram-3 me-1";
        titleSpan.appendChild(graphIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else {
        titleSpan.textContent = displayName;
      }

      // Three-dot menu button
      const menuBtn = document.createElement('button');
      menuBtn.className = 'tab-menu-btn';
      menuBtn.setAttribute('aria-label', 'File options');
      menuBtn.title = 'File options';
      menuBtn.innerHTML = '&#8943;';

      // Dropdown
      const dropdown = document.createElement('div');
      dropdown.className = 'tab-menu-dropdown';
      dropdown.innerHTML =
        (tab.type === "graph" ? '' : '<button class="tab-menu-item" data-action="rename"><i class="bi bi-pencil"></i> Rename</button>' +
        '<button class="tab-menu-item" data-action="duplicate"><i class="bi bi-files"></i> Duplicate</button>') +
        '<button class="tab-menu-item tab-menu-item-danger" data-action="close"><i class="bi bi-x-lg"></i> Close</button>';

      menuBtn.appendChild(dropdown);

      menuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        // Close all other open dropdowns first
        document.querySelectorAll('.tab-menu-btn.open').forEach(function(btn) {
          if (btn !== menuBtn) btn.classList.remove('open');
        });
        menuBtn.classList.toggle('open');
        // Position the dropdown relative to the viewport so it escapes the
        // overflow scroll container on .tab-list
        if (menuBtn.classList.contains('open')) {
          var rect = menuBtn.getBoundingClientRect();
          dropdown.style.top = (rect.bottom + 4) + 'px';
          dropdown.style.right = (window.innerWidth - rect.right) + 'px';
          dropdown.style.left = 'auto';
        }
      });

      dropdown.querySelectorAll('.tab-menu-item').forEach(function(actionBtn) {
        actionBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          menuBtn.classList.remove('open');
          const action = actionBtn.getAttribute('data-action');
          if (action === 'rename') renameTab(tab.id);
          else if (action === 'duplicate') duplicateTab(tab.id);
          else if (action === 'close') closeTab(tab.id, { promptForUnsaved: true });
        });
      });

      item.appendChild(titleSpan);
      item.appendChild(menuBtn);

      item.addEventListener('click', function() {
        switchTab(tab.id);
      });

      item.addEventListener('dblclick', function() {
        pinTemporaryTab(tab.id);
      });

      item.addEventListener('dragstart', function() {
        draggedTabId = tab.id;
        setTimeout(function() { item.classList.add('dragging'); }, 0);
      });

      item.addEventListener('dragend', function() {
        item.classList.remove('dragging');
        draggedTabId = null;
      });

      item.addEventListener('dragover', function(e) {
        e.preventDefault();
        item.classList.add('drag-over');
      });

      item.addEventListener('dragleave', function() {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', function(e) {
        e.preventDefault();
        item.classList.remove('drag-over');
        if (!draggedTabId || draggedTabId === tab.id) return;
        const fromIdx = tabs.findIndex(function(t) { return t.id === draggedTabId; });
        const toIdx = tabs.findIndex(function(t) { return t.id === tab.id; });
        if (fromIdx === -1 || toIdx === -1) return;
        const moved = tabs.splice(fromIdx, 1)[0];
        tabs.splice(toIdx, 0, moved);
        saveTabsToStorage(tabs);
        renderTabBar(tabs, activeTabId);
      });

      tabList.appendChild(item);
    });

    // "+ Create" button at end of tab list
    const newBtn = document.createElement('button');
    newBtn.className = 'tab-new-btn';
    newBtn.title = 'New Tab (Ctrl+T)';
    newBtn.setAttribute('aria-label', 'Open new tab');
    newBtn.innerHTML = '<i class="bi bi-plus-lg"></i>';
    newBtn.addEventListener('click', function() { newTab(); });
    tabList.appendChild(newBtn);

    // Auto-scroll active tab into view
    const activeItem = tabList.querySelector('.tab-item.active');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    updateTabScrollControls();
    requestAnimationFrame(updateTabScrollControls);

    renderMobileTabList(tabsArr, currentActiveTabId);
    updateSaveCurrentFileButtons();
  }

  function renderMobileTabList(tabsArr, currentActiveTabId) {
    const mobileTabList = document.getElementById('mobile-tab-list');
    if (!mobileTabList) return;
    mobileTabList.innerHTML = '';
    tabsArr.forEach(function(tab) {
      const item = document.createElement('div');
      item.className = 'mobile-tab-item' + (tab.id === currentActiveTabId ? ' active' : '') + (tabHasUnsavedChanges(tab) ? ' unsaved' : '');
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', tab.id === currentActiveTabId ? 'true' : 'false');
      item.setAttribute('data-tab-id', tab.id);

      const displayName = getTabDisplayName(tab);
      const tooltipText = getTabTooltipText(tab);
      item.title = tooltipText;
      item.setAttribute('aria-label', tooltipText);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'mobile-tab-title' + (tab.isTemporary ? ' temporary' : '');
      titleSpan.title = tooltipText;
      if (tab.type === "graph") {
        const graphIcon = document.createElement("i");
        graphIcon.className = "bi bi-diagram-3 me-1";
        titleSpan.appendChild(graphIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else {
        titleSpan.textContent = displayName;
      }

      // Three-dot menu button (same as desktop)
      const menuBtn = document.createElement('button');
      menuBtn.className = 'tab-menu-btn';
      menuBtn.setAttribute('aria-label', 'File options');
      menuBtn.title = 'File options';
      menuBtn.innerHTML = '&#8943;';

      // Dropdown (same as desktop)
      const dropdown = document.createElement('div');
      dropdown.className = 'tab-menu-dropdown';
      dropdown.innerHTML =
        (tab.type === "graph" ? '' : '<button class="tab-menu-item" data-action="rename"><i class="bi bi-pencil"></i> Rename</button>' +
        '<button class="tab-menu-item" data-action="duplicate"><i class="bi bi-files"></i> Duplicate</button>') +
        '<button class="tab-menu-item tab-menu-item-danger" data-action="close"><i class="bi bi-x-lg"></i> Close</button>';

      menuBtn.appendChild(dropdown);

      menuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        document.querySelectorAll('.tab-menu-btn.open').forEach(function(btn) {
          if (btn !== menuBtn) btn.classList.remove('open');
        });
        menuBtn.classList.toggle('open');
        if (menuBtn.classList.contains('open')) {
          const rect = menuBtn.getBoundingClientRect();
          dropdown.style.top = (rect.bottom + 4) + 'px';
          dropdown.style.right = (window.innerWidth - rect.right) + 'px';
          dropdown.style.left = 'auto';
        }
      });

      dropdown.querySelectorAll('.tab-menu-item').forEach(function(actionBtn) {
        actionBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          menuBtn.classList.remove('open');
          const action = actionBtn.getAttribute('data-action');
          if (action === 'rename') {
            closeMobileMenu();
            renameTab(tab.id);
          } else if (action === 'duplicate') {
            duplicateTab(tab.id);
            closeMobileMenu();
          } else if (action === 'close') {
            closeTab(tab.id, { promptForUnsaved: true });
            closeMobileMenu();
          }
        });
      });

      item.appendChild(titleSpan);
      item.appendChild(menuBtn);

      item.addEventListener('click', function() {
        switchTab(tab.id);
        closeMobileMenu();
      });

      mobileTabList.appendChild(item);
    });
  }

  // Close any open tab dropdown when clicking elsewhere in the document
  document.addEventListener('click', function() {
    document.querySelectorAll('.tab-menu-btn.open').forEach(function(btn) {
      btn.classList.remove('open');
    });
  });

  function saveCurrentTabState() {
    const tab = tabs.find(function(t) { return t.id === activeTabId; });
    if (!tab) return;
    if (tab.type === "graph") return;
    tab.content = markdownEditor.value;
    tab.scrollPos = markdownEditor.scrollTop;
    tab.viewMode = currentViewMode || 'split';
    saveTabsToStorage(tabs);
  }

  function getActiveMarkdownTab() {
    const tab = tabs.find(function(t) { return t.id === activeTabId; });
    if (!tab || tab.type === "graph") return null;
    return tab;
  }

  function activeTabHasUnsavedChanges() {
    const tab = getActiveMarkdownTab();
    return tabHasUnsavedChanges(tab, markdownEditor.value);
  }

  function getUnsavedTabs() {
    return tabs.filter(function(tab) {
      if (!tab) return false;
      if (tab.type === "graph") return tabHasUnsavedChanges(tab);
      const currentContent = tab.id === activeTabId ? markdownEditor.value : tab.content;
      return tabHasUnsavedChanges(tab, currentContent);
    });
  }

  function confirmDiscardUnsavedChangesBeforeExit() {
    const unsavedTabs = getUnsavedTabs();
    if (!unsavedTabs.length) return true;

    const pluralSuffix = unsavedTabs.length === 1 ? "" : "s";
    return window.confirm(
      `You have unsaved changes in ${unsavedTabs.length} open tab${pluralSuffix}. ` +
      "Exit without saving? Your changes will be lost."
    );
  }

  window.markdownViewerHasUnsavedChanges = function() {
    return getUnsavedTabs().length > 0;
  };
  window.markdownViewerConfirmDiscardUnsavedBeforeExit = confirmDiscardUnsavedChangesBeforeExit;

  function updateSaveCurrentFileButtons() {
    const graphTab = getActiveGraphTab();
    const tab = getActiveMarkdownTab();
    const hasUnsavedChanges = activeTabHasUnsavedChanges();
    const graphHasUnsavedChanges = tabHasUnsavedChanges(graphTab);
    const graphNeedsSave = !!(graphTab && (!isFileBackedGraphTab(graphTab) || graphHasUnsavedChanges));
    const hasWritableSource = !!(tab && (tab.sourceFileHandle || (isNeutralinoRuntime() && tab.sourceFilePath)));
    const title = graphTab
      ? (graphNeedsSave ? "Save graph changes" : "No graph changes to save")
      : (hasUnsavedChanges
        ? (hasWritableSource ? "Save changes to current file" : "Save changes as Markdown")
        : "No changes to save");

    document.querySelectorAll(".save-current-file-button").forEach(function(button) {
      button.disabled = graphTab ? !graphNeedsSave : !hasUnsavedChanges;
      button.title = title;
      button.setAttribute("aria-label", title);
    });

    const unsavedCount = getUnsavedTabs().length;
    const saveAllTitle = unsavedCount
      ? `Save all unsaved changes in ${unsavedCount} tab${unsavedCount === 1 ? "" : "s"}`
      : "No changes to save";
    document.querySelectorAll(".save-all-files-button").forEach(function(button) {
      button.disabled = unsavedCount === 0;
      button.title = saveAllTitle;
      button.setAttribute("aria-label", saveAllTitle);
    });
  }

  async function saveChangedTab(tab) {
    if (!tab) return false;
    if (tab.type === "graph") {
      if (!tabHasUnsavedChanges(tab)) return true;
      return (await saveGraphTabToSource(tab)) || (await saveGraphTabWithSaveDialog(tab));
    }

    const content = getMarkdownTabContentForSave(tab);
    if (!tabHasUnsavedChanges(tab, content)) return true;
    return (await saveMarkdownTabToSource(tab)) || (await saveMarkdownTabWithSaveDialog(tab));
  }

  async function saveAllChangedTabs() {
    saveCurrentTabState();
    const changedTabs = getUnsavedTabs();
    if (!changedTabs.length) {
      updateSaveCurrentFileButtons();
      return;
    }

    const failedTabs = [];
    let wasCanceled = false;

    for (const tab of changedTabs) {
      try {
        const saved = await saveChangedTab(tab);
        if (!saved) {
          wasCanceled = true;
          break;
        }
      } catch (error) {
        if (error && error.name === "AbortError") {
          wasCanceled = true;
          break;
        }
        console.error("Failed to save changed tab:", error);
        failedTabs.push(getTabDisplayName(tab));
      }
    }

    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();

    if (failedTabs.length) {
      alert("Unable to save: " + failedTabs.join(", "));
    } else if (wasCanceled && getUnsavedTabs().length) {
      console.info("Save All canceled before all changed tabs were saved.");
    }
  }

  async function saveCurrentFileIfChanged() {
    const activeGraphTab = getActiveGraphTab();
    if (activeGraphTab) {
      if (isFileBackedGraphTab(activeGraphTab) && !tabHasUnsavedChanges(activeGraphTab)) {
        updateSaveCurrentFileButtons();
        return;
      }
      if (!(await saveActiveGraphToSource())) {
        await saveActiveGraphWithSaveDialog();
      }
      updateSaveCurrentFileButtons();
      return;
    }

    if (!activeTabHasUnsavedChanges()) {
      updateSaveCurrentFileButtons();
      return;
    }

    exportMd.click();
  }

  function getEditorLineColumn(text, position) {
    const safePosition = Math.max(0, Math.min(position, text.length));
    const beforeCursor = text.slice(0, safePosition);
    const line = beforeCursor.split("\n").length;
    const lastLineBreak = beforeCursor.lastIndexOf("\n");
    const column = safePosition - lastLineBreak;

    return { line, column };
  }

  function getSelectionLineCount(text, selectionStart, selectionEnd) {
    if (selectionStart === selectionEnd) return 0;
    return text.slice(selectionStart, selectionEnd).split("\n").length;
  }

  function updateEditorTextpadStatus(activeTab) {
    if (!editorTextpadStatusElement) return;

    const shouldShowEditorStatus = !!activeTab && activeTab.type !== "graph" && document.activeElement === markdownEditor;
    editorTextpadStatusElement.classList.toggle("hidden", !shouldShowEditorStatus);
    if (!shouldShowEditorStatus) return;

    const text = markdownEditor.value;
    const selectionStart = Math.min(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0);
    const selectionEnd = Math.max(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0);
    const hasSelection = selectionStart !== selectionEnd;
    const cursorPosition = hasSelection ? selectionEnd : selectionStart;
    const cursorLocation = getEditorLineColumn(text, cursorPosition);
    const totalLines = text.length ? text.split("\n").length : 1;

    if (editorTotalLengthElement) editorTotalLengthElement.textContent = text.length.toLocaleString();
    if (editorTotalLinesElement) editorTotalLinesElement.textContent = totalLines.toLocaleString();
    if (editorCursorLineElement) editorCursorLineElement.textContent = cursorLocation.line.toLocaleString();
    if (editorCursorColumnElement) editorCursorColumnElement.textContent = cursorLocation.column.toLocaleString();

    if (editorPositionLabelElement) editorPositionLabelElement.textContent = hasSelection ? "Sel" : "Pos";
    if (editorPositionValueElement) {
      editorPositionValueElement.textContent = hasSelection
        ? `${(selectionEnd - selectionStart).toLocaleString()} | ${getSelectionLineCount(text, selectionStart, selectionEnd).toLocaleString()}`
        : (cursorPosition + 1).toLocaleString();
    }
  }

  function updateStatusLine(options = {}) {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    const activeGraphTab = activeTab && activeTab.type === "graph" ? activeTab : null;
    const visiblePointCount = typeof options.visiblePointCount === "number"
      ? options.visiblePointCount
      : (typeof activeGraphTab?.visiblePointCount === "number" ? activeGraphTab.visiblePointCount : 0);

    if (statusTipElement) {
      statusTipElement.textContent = previewHoveredLinkUrl || (activeGraphTab
        ? "Tip: hold ctrl / shift to see out / back links"
        : "Tip: drag in Markdown files, use split preview, or open a folder to build a graph.");
    }

    if (graphPointsStatusElement && graphPointsCountElement) {
      graphPointsCountElement.textContent = visiblePointCount.toLocaleString();
      graphPointsStatusElement.classList.toggle("hidden", !activeGraphTab);
    }

    updateEditorTextpadStatus(activeTab);
  }

  function restoreViewMode(mode) {
    currentViewMode = null;
    setViewMode(mode || 'split');
  }

  function switchTab(tabId) {
    if (tabId === activeTabId) return;
    suspendActiveGraphRender();
    saveCurrentTabState();
    activeTabId = tabId;
    saveActiveTabId(activeTabId);
    const tab = tabs.find(function(t) { return t.id === tabId; });
    if (!tab) return;
    if (tab.type === "graph") {
      setViewMode('preview');
      setGraphViewMode(true);
      renderTabBar(tabs, activeTabId);
      syncFolderTreeSelectionToActiveTab();
      renderGraphView();
      return;
    }
    setGraphViewMode(false);
    markdownEditor.value = tab.content;
    restoreViewMode(tab.viewMode);
    renderMarkdown();
    requestAnimationFrame(function() {
      markdownEditor.scrollTop = tab.scrollPos || 0;
    });
    renderTabBar(tabs, activeTabId);
    syncFolderTreeSelectionToActiveTab();
  }



  function pinTemporaryTab(tabId) {
    const tab = tabs.find(function(t) { return t.id === tabId; });
    if (!tab || !tab.isTemporary) return;
    tab.isTemporary = false;
    // Promote preview tab to a normal tab without marking it dirty.
    tab.savedContent = tab.content;
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
  }

  function findTemporaryTab() {
    return tabs.find(function(t) { return !!t.isTemporary; }) || null;
  }

  function applySidebarFileMetadata(tab, sourceFile) {
    tab.sourceFileName = sourceFile && sourceFile.name ? sourceFile.name : null;
    tab.sourceFileHandle = sourceFile && sourceFile.handle ? sourceFile.handle : null;
    tab.sourceFilePath = sourceFile && sourceFile.path ? sourceFile.path : null;
  }

  function activateSidebarTab(tab) {
    activeTabId = tab.id;
    saveActiveTabId(activeTabId);
    setGraphViewMode(false);
    markdownEditor.value = tab.content;
    restoreViewMode(tab.viewMode);
    renderMarkdown();
    requestAnimationFrame(function() {
      markdownEditor.scrollTop = tab.scrollPos || 0;
    });
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    syncFolderTreeSelectionToActiveTab();
    markdownEditor.focus();
  }

  function openSidebarFileInTab(content, title, sourceFile, options) {
    options = options || {};
    const isTemporary = options.temporary !== false;
    saveCurrentTabState();

    let tab = isTemporary ? findTemporaryTab() : null;
    if (!tab && tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
      return null;
    }

    if (!tab) {
      const normalizedContent = normalizeEditorContent(content);
      tab = createTab(normalizedContent, title || 'Untitled', currentViewMode || 'split');
      tab.isTemporary = isTemporary;
      applySidebarFileMetadata(tab, sourceFile);
      tab.savedContent = normalizedContent;
      tabs.push(tab);
    } else {
      const normalizedContent = normalizeEditorContent(content);
      tab.title = title || 'Untitled';
      tab.content = normalizedContent;
      tab.scrollPos = 0;
      tab.viewMode = currentViewMode || tab.viewMode || 'split';
      tab.isTemporary = isTemporary;
      applySidebarFileMetadata(tab, sourceFile);
      tab.savedContent = normalizedContent;
    }

    activateSidebarTab(tab);
    return tab;
  }

  function openSidebarFileInTemporaryTab(content, title, sourceFile) {
    return openSidebarFileInTab(content, title, sourceFile, { temporary: true });
  }

  function openSidebarFileInPermanentTab(content, title, sourceFile) {
    return openSidebarFileInTab(content, title, sourceFile, { temporary: false });
  }

  function findTabForSourceFile(sourceFile) {
    if (!sourceFile) return null;

    if (sourceFile.handle) {
      const handleMatch = tabs.find(function(tab) {
        return tab.type !== "graph" && tab.sourceFileHandle === sourceFile.handle;
      });
      if (handleMatch) return handleMatch;
    }

    if (sourceFile.path) {
      const pathMatch = tabs.find(function(tab) {
        return tab.type !== "graph" && tab.sourceFilePath === sourceFile.path;
      });
      if (pathMatch) return pathMatch;
    }

    const title = sourceFile.name ? getMarkdownTitleFromFileName(sourceFile.name) : null;
    return tabs.find(function(tab) {
      return tab.type !== "graph" && ((sourceFile.name && tab.sourceFileName === sourceFile.name) || (title && tab.title === title));
    }) || null;
  }

  function findGraphTabForSourceFile(sourceFile) {
    if (!sourceFile) return null;

    if (sourceFile.handle) {
      const handleMatch = tabs.find(function(tab) {
        return tab.type === "graph" && tab.sourceFileHandle === sourceFile.handle;
      });
      if (handleMatch) return handleMatch;
    }

    if (sourceFile.path) {
      const pathMatch = tabs.find(function(tab) {
        return tab.type === "graph" && tab.sourceFilePath === sourceFile.path;
      });
      if (pathMatch) return pathMatch;
    }

    const title = sourceFile.name ? getGraphTitleFromFileName(sourceFile.name) : null;
    return tabs.find(function(tab) {
      return tab.type === "graph" && ((sourceFile.name && tab.sourceFileName === sourceFile.name) || (title && tab.title === title));
    }) || null;
  }

  async function openGraphNodeFileInPermanentTab(graphNode) {
    if (!graphNode) return null;

    const activeGraphTab = tabs.find((tab) => tab.id === activeTabId && tab.type === "graph");
    const snapshotFile = activeGraphTab?.graphSnapshot?.files?.find((file) => file.id === graphNode.id);
    const fileEntry = snapshotFile || (folderMarkdownFiles || []).find(function(entry) {
      const entryPath = entry.path || entry.file?.webkitRelativePath || entry.file?.name || "";
      return normalizeGraphNodeName(entryPath) === graphNode.id;
    });

    if (!fileEntry) {
      alert("Unable to find the selected file in this graph snapshot.");
      return null;
    }

    const path = fileEntry.path || fileEntry.file?.webkitRelativePath || fileEntry.file?.name || graphNode.fullPath || null;
    const name = fileEntry.name || getFileName(path || graphNode.fullPath || graphNode.label || "document.md");
    const sourceFile = {
      name,
      handle: fileEntry.handle || null,
      path: fileEntry.fullPath || path
    };

    const existingTab = findTabForSourceFile(sourceFile);
    if (existingTab) {
      switchTab(existingTab.id);
      pinTemporaryTab(existingTab.id);
      return existingTab;
    }

    try {
      let content = fileEntry.content;
      if (content === undefined) {
        if (fileEntry.file) {
          content = await fileEntry.file.text();
        } else if (fileEntry.handle) {
          const file = await fileEntry.handle.getFile();
          content = await file.text();
        } else if (typeof NL_VERSION !== "undefined" && fileEntry.fullPath) {
          content = await Neutralino.filesystem.readFile(fileEntry.fullPath);
          sourceFile.path = fileEntry.fullPath;
        } else {
          throw new Error("No readable Markdown file was provided.");
        }
      }

      return openSidebarFileInPermanentTab(content, getMarkdownTitleFromFileName(name), sourceFile);
    } catch (error) {
      console.error("Failed to open graph node file:", error);
      alert("Unable to open selected file.");
      return null;
    }
  }

  function newTab(content, title) {
    if (content === undefined) content = '';
    if (tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
      return;
    }
    if (!title) title = nextUntitledTitle();
    const tab = createTab(content, title);
    tabs.push(tab);
    switchTab(tab.id);
    markdownEditor.focus();
  }

  function closeTab(tabId, options) {
    if (options === undefined) options = {};
    const tabToClose = tabs.find(function(t) { return t.id === tabId; });
    if (!tabToClose) return;
    const hasUnsavedChanges = tabHasUnsavedChanges(tabToClose);
    if (options.promptForUnsaved && hasUnsavedChanges) {
      const shouldClose = window.confirm('You have unsaved changes. Are you sure you want to close this tab?');
      if (!shouldClose) return;
    }

    const idx = tabs.findIndex(function(t) { return t.id === tabId; });
    if (idx === -1) return;
    const cachedGraphRender = graphRenderCache.get(tabId);
    if (cachedGraphRender) {
      if (cachedGraphRender.simulation) cachedGraphRender.simulation.stop();
      if (cachedGraphRender.wrapper) cachedGraphRender.wrapper.remove();
      graphRenderCache.delete(tabId);
    }
    tabs.splice(idx, 1);
    if (tabs.length === 0) {
      // Auto-create new "Untitled" when last tab is deleted
      const newT = createTab('', nextUntitledTitle());
      tabs.push(newT);
      activeTabId = newT.id;
      saveActiveTabId(activeTabId);
      setGraphViewMode(false);
      markdownEditor.value = '';
      restoreViewMode('split');
      renderMarkdown();
    } else if (activeTabId === tabId) {
      const newIdx = Math.max(0, idx - 1);
      activeTabId = tabs[newIdx].id;
      saveActiveTabId(activeTabId);
      const newActiveTab = tabs[newIdx];
      if (newActiveTab.type === 'graph') {
        setGraphViewMode(true);
        renderTabBar(tabs, activeTabId);
        syncFolderTreeSelectionToActiveTab();
        renderGraphView();
        saveTabsToStorage(tabs);
        return;
      }
      setGraphViewMode(false);
      markdownEditor.value = newActiveTab.content;
      restoreViewMode(newActiveTab.viewMode);
      renderMarkdown();
      requestAnimationFrame(function() {
        markdownEditor.scrollTop = newActiveTab.scrollPos || 0;
      });
    }
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
  }

  function renameUnsourcedTabTitle(tab) {
    const modal = document.getElementById('rename-modal');
    const input = document.getElementById('rename-modal-input');
    const confirmBtn = document.getElementById('rename-modal-confirm');
    const cancelBtn = document.getElementById('rename-modal-cancel');
    const title = document.getElementById('rename-modal-title');
    if (!modal || !input || !confirmBtn || !cancelBtn) return;
    if (title) title.textContent = 'Rename tab';
    input.placeholder = 'Tab name';
    input.value = tab.title;
    confirmBtn.textContent = 'Rename';
    modal.style.display = 'flex';
    input.focus();
    input.select();

    function doRename() {
      const newName = input.value.trim();
      if (newName) {
        tab.title = newName;
        saveTabsToStorage(tabs);
        renderTabBar(tabs, activeTabId);
      }
      modal.style.display = 'none';
      cleanup();
    }

    function cleanup() {
      confirmBtn.removeEventListener('click', doRename);
      cancelBtn.removeEventListener('click', doCancel);
      input.removeEventListener('keydown', onKey);
    }

    function doCancel() {
      modal.style.display = 'none';
      cleanup();
    }

    function onKey(e) {
      if (e.key === 'Enter') doRename();
      else if (e.key === 'Escape') doCancel();
    }

    confirmBtn.addEventListener('click', doRename);
    cancelBtn.addEventListener('click', doCancel);
    input.addEventListener('keydown', onKey);
  }

  async function renameTab(tabId) {
    const tab = tabs.find(function(t) { return t.id === tabId; });
    if (!tab) return;

    const sourceName = tab.sourceFileName || (tab.sourceFilePath ? getFileName(tab.sourceFilePath) : tab.sourceFileHandle?.name);
    if (!sourceName || (!tab.sourceFileHandle && !tab.sourceFilePath)) {
      renameUnsourcedTabTitle(tab);
      return;
    }

    try {
      await renameSidebarNodeOnDisk({
        kind: "file",
        name: sourceName,
        handle: tab.sourceFileHandle || null,
        fullPath: isNeutralinoRuntime() ? tab.sourceFilePath : null,
        path: tab.sourceFilePath || null
      }, "file");
    } catch (error) {
      console.error("Failed to rename tab source file:", error);
      alert("Unable to rename this file.");
    }
  }

  function duplicateTab(tabId) {
    const tab = tabs.find(function(t) { return t.id === tabId; });
    if (!tab) return;
    if (tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
      return;
    }
    saveCurrentTabState();
    const dupTitle = tab.title + ' (copy)';
    const dup = createTab(tab.content, dupTitle, tab.viewMode);
    dup.savedContent = tab.savedContent;
    const idx = tabs.findIndex(function(t) { return t.id === tabId; });
    tabs.splice(idx + 1, 0, dup);
    switchTab(dup.id);
  }

  function resetAllTabs() {
    const modal = document.getElementById('reset-confirm-modal');
    const confirmBtn = document.getElementById('reset-modal-confirm');
    const cancelBtn = document.getElementById('reset-modal-cancel');
    if (!modal) return;
    modal.style.display = 'flex';

    function doReset() {
      modal.style.display = 'none';
      cleanup();
      tabs = [];
      untitledCounter = 0;
      saveUntitledCounter(0);
      const welcome = createTab(sampleMarkdown, 'Welcome to Markdown');
      tabs.push(welcome);
      activeTabId = welcome.id;
      saveActiveTabId(activeTabId);
      saveTabsToStorage(tabs);
      setGraphViewMode(false);
      markdownEditor.value = sampleMarkdown;
      restoreViewMode('split');
      renderMarkdown();
      renderTabBar(tabs, activeTabId);
    }

    function doCancel() {
      modal.style.display = 'none';
      cleanup();
    }

    function cleanup() {
      confirmBtn.removeEventListener('click', doReset);
      cancelBtn.removeEventListener('click', doCancel);
    }

    confirmBtn.addEventListener('click', doReset);
    cancelBtn.addEventListener('click', doCancel);
  }

  function initTabs() {
    untitledCounter = loadUntitledCounter();
    tabs = loadTabsFromStorage();
    tabs.forEach(function(tab) {
      tab.content = normalizeEditorContent(tab.content);
      if (typeof tab.savedContent !== 'string') tab.savedContent = tab.content || '';
      tab.savedContent = normalizeEditorContent(tab.savedContent);
      if (!tab.type) tab.type = 'markdown';
      if (tab.type === 'graph') {
        const graphData = deserializeGraphDocument({
          ...(tab.graphDocument || tab),
          graphLayout: tab.graphLayout !== undefined
            ? tab.graphLayout
            : (tab.graphDocument?.graphLayout !== undefined ? tab.graphDocument.graphLayout : tab.graphDocument?.layout)
        });
        tab.folderName = graphData.folderName;
        tab.graphSnapshot = graphData.graphSnapshot;
        tab.graphViewConfig = graphData.graphViewConfig;
        tab.graphDocument = graphData.graphDocument;
        if (Object.prototype.hasOwnProperty.call(graphData, "graphLayout")) tab.graphLayout = graphData.graphLayout;
      }
    });
    activeTabId = loadActiveTabId();
    if (tabs.length === 0) {
      const tab = createTab(sampleMarkdown, 'Welcome to Markdown');
      tabs.push(tab);
      activeTabId = tab.id;
      saveTabsToStorage(tabs);
      saveActiveTabId(activeTabId);
    } else if (!tabs.find(function(t) { return t.id === activeTabId; })) {
      activeTabId = tabs[0].id;
      saveActiveTabId(activeTabId);
    }
    const activeTab = tabs.find(function(t) { return t.id === activeTabId; });
    if (activeTab.type === 'graph') {
      setViewMode('preview');
      setGraphViewMode(true);
      renderTabBar(tabs, activeTabId);
      renderGraphView();
      return;
    }
    setGraphViewMode(false);
    markdownEditor.value = activeTab.content;
    restoreViewMode(activeTab.viewMode);
    renderMarkdown();
    requestAnimationFrame(function() {
      markdownEditor.scrollTop = activeTab.scrollPos || 0;
    });
    renderTabBar(tabs, activeTabId);
  }

  function renderMarkdown() {
    updateEditorLineNumbers();
    try {
      const { frontmatter, body } = parseFrontmatter(markdownEditor.value);
      const tableHtml = frontmatter ? renderFrontmatterTable(frontmatter) : '';
      const html = tableHtml + marked.parse(body);
      const sanitizedHtml = DOMPurify.sanitize(html, {
        ADD_TAGS: ['mjx-container'],
        ADD_ATTR: ['id', 'class', 'style']
      });
      markdownPreview.innerHTML = sanitizedHtml;
      enhanceWikiLinks(markdownPreview);
      annotatePreviewMarkdownLinks(markdownPreview);
      enhanceGitHubAlerts(markdownPreview);

      processEmojis(markdownPreview);
      
      // Reinitialize mermaid with current theme before rendering diagrams
      initMermaid();
      
      try {
        const mermaidNodes = markdownPreview.querySelectorAll('.mermaid');
        if (mermaidNodes.length > 0) {
          Promise.resolve(mermaid.init(undefined, mermaidNodes))
            .then(() => addMermaidToolbars())
            .catch((e) => {
              console.warn("Mermaid rendering failed:", e);
              addMermaidToolbars();
            });
        }
      } catch (e) {
        console.warn("Mermaid rendering failed:", e);
      }
      
      if (window.MathJax) {
        try {
          MathJax.typesetPromise([markdownPreview]).catch((err) => {
            console.warn('MathJax typesetting failed:', err);
          });
        } catch (e) {
          console.warn("MathJax rendering failed:", e);
        }
      }

      updateDocumentStats();
    } catch (e) {
      console.error("Markdown rendering failed:", e);
      markdownPreview.innerHTML = `<div class="alert alert-danger">
              <strong>Error rendering markdown:</strong> ${e.message}
          </div>
          <pre>${markdownEditor.value}</pre>`;
    }
  }



  async function listMarkdownTree(dirHandle, parentPath = "") {
    const entries = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === "directory") {
        const currentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
        const children = await listMarkdownTree(entry, currentPath);
        entries.push({ kind: "directory", name: entry.name, path: currentPath, children, handle: entry });
      } else if (entry.kind === "file" && isSidebarDocumentPath(entry.name)) {
        const currentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
        let file = null;
        try {
          file = await entry.getFile();
        } catch (error) {
          console.warn("Failed to read file metadata:", currentPath, error);
        }
        const modifiedAt = Number(file?.lastModified || 0) || 0;
        entries.push({ kind: "file", name: entry.name, path: currentPath, handle: entry, modifiedAt, createdAt: modifiedAt });
      }
    }
    return sortFolderTreeNodes(entries);
  }

  async function collectMarkdownFilesFromTree(nodes, parentPath = "") {
    const files = [];
    for (const node of (nodes || [])) {
      const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
      if (node.kind === "directory") {
        const nestedFiles = await collectMarkdownFilesFromTree(node.children || [], currentPath);
        files.push(...nestedFiles);
      } else if (node.kind === "file" && isMarkdownPath(node.name)) {
        if (node.file) {
          files.push({ path: currentPath, file: node.file, handle: node.handle || null });
        } else if (node.handle) {
          try {
            const file = await node.handle.getFile();
            files.push({ path: currentPath, file, handle: node.handle });
          } catch (error) {
            console.warn("Failed to read file handle for graph view:", currentPath, error);
          }
        }
      }
    }
    return files;
  }

  function getClosedFolderPlaceholder() {
    return '<p class="folder-tree-placeholder">Open a folder to browse Markdown and graph files.</p>';
  }

  function updateCloseFolderButtons() {
    document.querySelectorAll(".close-folder-button").forEach((button) => {
      button.disabled = !isFolderOpen;
      button.setAttribute("aria-disabled", isFolderOpen ? "false" : "true");
      button.title = isFolderOpen ? "Close the currently open folder" : "Open a folder before closing it";
    });
  }

  function closeFolderTree() {
    hideLinkAutocomplete();
    folderMarkdownFiles = [];
    currentFolderTreeNodes = [];
    folderTreeFilterText = "";
    activeFolderName = "Graph View";
    activeFolderHandle = null;
    activeFolderPath = null;
    isFolderOpen = false;
    if (folderTreeFilterInput) {
      folderTreeFilterInput.value = "";
      folderTreeFilterInput.hidden = true;
    }
    if (folderTreeRoot) {
      folderTreeRoot.removeEventListener("contextmenu", handleFolderTreeRootContextMenu);
      folderTreeRoot.addEventListener("contextmenu", handleFolderTreeRootContextMenu);
      folderTreeRoot.innerHTML = getClosedFolderPlaceholder();
    }
    updateCloseFolderButtons();
    updateFolderTreeToolbarState();
  }

  function renderFolderTree(nodes, options = {}) {
    isFolderOpen = true;
    if (!options.preserveNodes) {
      currentFolderTreeNodes = nodes || [];
      folderTreeFilterText = "";
      if (folderTreeFilterInput) {
        folderTreeFilterInput.value = "";
      }
    }
    hideSidebarClosedFolderContextMenu();
    folderTreeRoot.removeEventListener("contextmenu", handleFolderTreeRootContextMenu);
    folderTreeRoot.addEventListener("contextmenu", handleFolderTreeRootContextMenu);
    folderTreeRoot.innerHTML = "";
    if (!nodes.length) {
      folderTreeRoot.innerHTML = folderTreeFilterText
        ? '<p class="folder-tree-placeholder">No files or folders match this filter.</p>'
        : '<p class="folder-tree-placeholder">No Markdown or graph files found in this folder.</p>';
      updateCloseFolderButtons();
      updateFolderTreeToolbarState();
      return;
    }

    const ul = document.createElement("ul");
    ul.className = "folder-tree-list";
    nodes.forEach((node) => ul.appendChild(renderFolderTreeNode(node)));
    folderTreeRoot.appendChild(ul);
    updateCloseFolderButtons();
    updateFolderTreeToolbarState();
    syncFolderTreeSelectionToActiveTab({ scroll: false });
    renderLinkAutocomplete();
  }

  async function reloadOpenFolderTree() {
    if (typeof NL_VERSION !== "undefined" && activeFolderPath) {
      const nodes = await listMarkdownTreeNeutralino(activeFolderPath);
      folderMarkdownFiles = await collectMarkdownFilesFromTreeNeutralino(nodes);
      renderFolderTree(nodes);
      return true;
    }

    if (activeFolderHandle) {
      const nodes = await listMarkdownTree(activeFolderHandle);
      folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
      renderFolderTree(nodes);
      rememberRecentFolder({ name: activeFolderName, label: activeFolderName });
      return true;
    }

    return false;
  }

  async function refreshOpenFolderTreeAfterFileDelete(filePath) {
    if (!isFolderOpen || !filePath) return false;

    if (activeFolderPath && !isPathInsideFolder(filePath, activeFolderPath)) {
      return false;
    }

    try {
      return await reloadOpenFolderTree();
    } catch (error) {
      console.warn("Failed to refresh folder tree after deleting file:", error);
      return false;
    }
  }

  function isPathInsideFolder(filePath, folderPath) {
    if (!filePath || !folderPath) return false;
    const normalize = (path) => String(path).replace(/\\/g, "/").replace(/\/+$/, "");
    const normalizedFile = normalize(filePath);
    const normalizedFolder = normalize(folderPath);
    return normalizedFile === normalizedFolder || normalizedFile.startsWith(normalizedFolder + "/");
  }

  function normalizeDeletedPathComparison(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  }

  function getDeletedPathCandidates(path) {
    const candidates = new Set();
    if (!path) return candidates;

    const addCandidate = (candidate) => {
      const normalized = normalizeDeletedPathComparison(candidate);
      if (normalized) candidates.add(normalized);
    };

    addCandidate(path);
    if (activeFolderPath) {
      const relativePath = getPathRelativeToFolder(path, activeFolderPath);
      addCandidate(relativePath);
      if (!isPathInsideFolder(path, activeFolderPath)) {
        addCandidate(joinPath(activeFolderPath, path));
      }
    }

    return candidates;
  }

  function tabMatchesDeletedPath(tab, deletedPath, options = {}) {
    if (!tab || !deletedPath) return false;
    if (options.targetHandle && tab.sourceFileHandle === options.targetHandle) return true;

    const tabCandidates = getDeletedPathCandidates(tab.sourceFilePath);
    const deletedCandidates = getDeletedPathCandidates(deletedPath);
    if (!tabCandidates.size || !deletedCandidates.size) return false;

    for (const tabPath of tabCandidates) {
      for (const deletedPathCandidate of deletedCandidates) {
        if (options.kind === "folder") {
          if (tabPath === deletedPathCandidate || tabPath.startsWith(deletedPathCandidate + "/")) {
            return true;
          }
        } else if (tabPath === deletedPathCandidate) {
          return true;
        }
      }
    }

    return false;
  }

  function closeTabsForDeletedPath(deletedPath, options = {}) {
    const tabIdsToClose = tabs
      .filter((tab) => tabMatchesDeletedPath(tab, deletedPath, options))
      .map((tab) => tab.id);

    tabIdsToClose.forEach((tabId) => closeTab(tabId, { promptForUnsaved: false }));
    return tabIdsToClose.length;
  }


  function getValidFolderSortMode(mode) {
    return ["name-asc", "name-desc", "modified-desc", "modified-asc", "created-desc", "created-asc"].includes(mode)
      ? mode
      : "name-asc";
  }

  function getNodeTimestamp(node, field) {
    const value = Number(node?.[field] || 0);
    if (value > 0) return value;
    return Number(node?.modifiedAt || node?.file?.lastModified || 0) || 0;
  }

  function compareFolderTreeNodes(a, b) {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;

    const mode = getValidFolderSortMode(currentFolderSortMode);
    if (mode === "name-desc") return String(b.name || "").localeCompare(String(a.name || ""));
    if (mode === "modified-desc" || mode === "modified-asc") {
      const diff = getNodeTimestamp(a, "modifiedAt") - getNodeTimestamp(b, "modifiedAt");
      if (diff !== 0) return mode === "modified-desc" ? -diff : diff;
    }
    if (mode === "created-desc" || mode === "created-asc") {
      const diff = getNodeTimestamp(a, "createdAt") - getNodeTimestamp(b, "createdAt");
      if (diff !== 0) return mode === "created-desc" ? -diff : diff;
    }

    return String(a.name || "").localeCompare(String(b.name || ""));
  }

  function sortFolderTreeNodes(nodes) {
    nodes.sort(compareFolderTreeNodes);
    nodes.forEach((node) => {
      if (node.kind === "directory") sortFolderTreeNodes(node.children || []);
    });
    return nodes;
  }

  async function updateFolderMarkdownFileOrderFromTree() {
    if (typeof NL_VERSION !== "undefined" && activeFolderPath) {
      folderMarkdownFiles = await collectMarkdownFilesFromTreeNeutralino(currentFolderTreeNodes);
      return;
    }
    folderMarkdownFiles = await collectMarkdownFilesFromTree(currentFolderTreeNodes);
  }

  async function applyFolderSortMode(mode) {
    currentFolderSortMode = getValidFolderSortMode(mode);
    saveGlobalState({ folderSortMode: currentFolderSortMode });
    sortFolderTreeNodes(currentFolderTreeNodes);
    await updateFolderMarkdownFileOrderFromTree();
    updateFolderTreeSortControls();
    renderFilteredFolderTree();
  }

  async function openFolderTreeFromNeutralinoPath(selectedPath) {
    if (!selectedPath) return;
    activeFolderName = selectedPath.split(/[\\/]/).pop() || "Graph View";
    activeFolderHandle = null;
    activeFolderPath = selectedPath;
    const nodes = await listMarkdownTreeNeutralino(selectedPath);
    folderMarkdownFiles = await collectMarkdownFilesFromTreeNeutralino(nodes);
    renderFolderTree(nodes);
    rememberRecentFolder({ name: activeFolderName, label: activeFolderName, path: selectedPath });
  }

  function getMarkdownTitleFromFileName(fileName) {
    return (fileName || "document.md").replace(/\.(md|markdown)$/i, "");
  }

  async function openMarkdownSourceFile(sourceFile) {
    if (!sourceFile) return null;

    let content = sourceFile.content;
    let file = sourceFile.file || null;
    const handle = sourceFile.handle || null;
    const path = sourceFile.path || null;
    let name = sourceFile.name || (path ? getFileName(path) : null);

    if (content === undefined) {
      if (typeof NL_VERSION !== "undefined" && path) {
        content = await Neutralino.filesystem.readFile(path);
      } else {
        if (!file && handle) {
          file = await handle.getFile();
        }
        if (!file) {
          throw new Error("No readable Markdown file was provided.");
        }
        content = await file.text();
        name = name || file.name;
      }
    }

    name = name || (file && file.name) || "document.md";
    const tab = openSidebarFileInPermanentTab(content, getMarkdownTitleFromFileName(name), {
      name,
      handle,
      path
    });
    rememberRecentFile({
      name,
      label: name,
      path,
      handle
    });
    return tab;
  }

  function isGraphFilePath(path) {
    return /\.(mdviewer-graph\.json|mdgraph\.json|json)$/i.test(path || "");
  }

  function isSidebarDocumentPath(path) {
    return isMarkdownPath(path) || isGraphFilePath(path);
  }

  function looksLikeGraphDocument(document) {
    if (!document || typeof document !== "object" || Array.isArray(document)) return false;
    return Object.prototype.hasOwnProperty.call(document, "snapshot")
      || Object.prototype.hasOwnProperty.call(document, "graphSnapshot")
      || Object.prototype.hasOwnProperty.call(document, "viewConfig")
      || Object.prototype.hasOwnProperty.call(document, "graphViewConfig")
      || Object.prototype.hasOwnProperty.call(document, "graphLayout")
      || Object.prototype.hasOwnProperty.call(document, "layout")
      || (Object.prototype.hasOwnProperty.call(document, "schemaVersion") && Object.prototype.hasOwnProperty.call(document, "folderName"));
  }

  async function readOpenFileSourceContent(sourceFile) {
    if (sourceFile.content !== undefined) return sourceFile.content;
    if (typeof NL_VERSION !== "undefined" && sourceFile.path) {
      return Neutralino.filesystem.readFile(sourceFile.path);
    }
    let file = sourceFile.file || null;
    if (!file && sourceFile.handle) file = await sourceFile.handle.getFile();
    if (!file) throw new Error("No readable file was provided.");
    return file.text();
  }

  async function openDocumentSourceFile(sourceFile) {
    if (!sourceFile) return null;
    const path = sourceFile.path || null;
    const name = sourceFile.name || (path ? getFileName(path) : sourceFile.file?.name || sourceFile.handle?.name || "document.md");
    const filePath = path || name;

    if (isGraphFilePath(filePath)) {
      return openSavedGraphDocument({ ...sourceFile, name });
    }

    if (isMarkdownPath(filePath)) {
      return openMarkdownSourceFile({ ...sourceFile, name });
    }

    const content = await readOpenFileSourceContent(sourceFile);
    try {
      const parsed = JSON.parse(content);
      if (looksLikeGraphDocument(parsed)) {
        return openSavedGraphDocument({ ...sourceFile, name, content });
      }
    } catch (_) {
      // Non-JSON files without a known extension are treated as Markdown.
    }

    return openMarkdownSourceFile({ ...sourceFile, name, content });
  }

  async function openDocumentFileFromPicker() {
    if (typeof NL_VERSION !== "undefined") {
      try {
        const selected = await Neutralino.os.showOpenDialog("Open file", {
          filters: [
            { name: "Markdown and graph files", extensions: ["md", "markdown", "mdviewer-graph.json", "mdgraph.json", "json"] }
          ]
        });
        const selectedPath = Array.isArray(selected) ? selected[0] : selected;
        if (!selectedPath) return;
        await openDocumentSourceFile({
          name: getFileName(selectedPath),
          path: selectedPath
        });
      } catch (error) {
        if (error && error.name === "AbortError") return;
        console.error("Neutralino file picker error:", error);
        alert("Unable to open selected file: " + error.message);
      }
      return;
    }

    if (typeof window.showOpenFilePicker === "function") {
      let handle = null;
      try {
        const handles = await window.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: "Markdown and graph files",
              accept: {
                "text/markdown": [".md", ".markdown"],
                "text/plain": [".md", ".markdown"],
                "application/json": [".json"]
              }
            }
          ]
        });
        handle = handles && handles[0];
      } catch (error) {
        if (error && error.name === "AbortError") return;
        console.warn("File picker unavailable, using fallback input.", error);
        fileInput.click();
        return;
      }

      if (!handle) return;
      try {
        await openDocumentSourceFile({
          name: handle.name,
          handle
        });
      } catch (error) {
        console.error("Failed to open selected file:", error);
        alert("Unable to open selected file: " + error.message);
      }
      return;
    }

    fileInput.click();
  }

  async function getFileSystemHandlesFromDrop(dataTransfer) {
    const items = Array.from((dataTransfer && dataTransfer.items) || []);
    const handles = [];

    for (const item of items) {
      if (typeof item.getAsFileSystemHandle !== "function") continue;
      try {
        const handle = await item.getAsFileSystemHandle();
        if (handle) handles.push(handle);
      } catch (error) {
        console.warn("Unable to read dropped file system handle:", error);
      }
    }

    return handles;
  }

  async function getDirectoryHandleFromDrop(dataTransfer, fileSystemHandles) {
    const handles = fileSystemHandles || await getFileSystemHandlesFromDrop(dataTransfer);
    return handles.find((handle) => handle && handle.kind === "directory") || null;
  }

  function getDirectoryEntryFromDrop(dataTransfer) {
    const items = Array.from((dataTransfer && dataTransfer.items) || []);
    for (const item of items) {
      if (typeof item.webkitGetAsEntry !== "function") continue;
      const entry = item.webkitGetAsEntry();
      if (entry && entry.isDirectory) return entry;
    }
    return null;
  }

  function readDirectoryEntries(directoryEntry) {
    const reader = directoryEntry.createReader();
    const entries = [];

    return new Promise((resolve, reject) => {
      function readNextBatch() {
        reader.readEntries((batch) => {
          if (!batch.length) {
            resolve(entries);
            return;
          }
          entries.push(...batch);
          readNextBatch();
        }, reject);
      }

      readNextBatch();
    });
  }

  function getFileFromEntry(fileEntry) {
    return new Promise((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });
  }

  async function listMarkdownTreeFromEntry(directoryEntry) {
    const entries = [];
    const childEntries = await readDirectoryEntries(directoryEntry);

    for (const entry of childEntries) {
      if (entry.isDirectory) {
        const children = await listMarkdownTreeFromEntry(entry);
        entries.push({ kind: "directory", name: entry.name, children, handle: entry });
      } else if (entry.isFile && isSidebarDocumentPath(entry.name)) {
        try {
          const file = await getFileFromEntry(entry);
          const modifiedAt = Number(file?.lastModified || 0) || 0;
          entries.push({ kind: "file", name: entry.name, file, path: entry.fullPath || entry.name, modifiedAt, createdAt: modifiedAt });
        } catch (error) {
          console.warn("Failed to read dropped document file:", entry.name, error);
        }
      }
    }

    return sortFolderTreeNodes(entries);
  }

  async function getDocumentFileHandleFromDrop(dataTransfer, fileSystemHandles) {
    const handles = fileSystemHandles || await getFileSystemHandlesFromDrop(dataTransfer);
    return handles.find((handle) => handle && handle.kind === "file" && (isMarkdownPath(handle.name) || isGraphFilePath(handle.name))) || null;
  }

  async function getDocumentFileFromEntryDrop(dataTransfer) {
    const items = Array.from((dataTransfer && dataTransfer.items) || []);
    for (const item of items) {
      if (typeof item.webkitGetAsEntry !== "function") continue;
      const entry = item.webkitGetAsEntry();
      if (!entry || !entry.isFile || (!isMarkdownPath(entry.name) && !isGraphFilePath(entry.name))) continue;
      try {
        const file = await getFileFromEntry(entry);
        return { file, name: entry.name };
      } catch (error) {
        console.warn("Failed to read dropped file entry:", entry.name, error);
      }
    }
    return null;
  }

  async function openDroppedDocumentFile(dataTransfer, fileSystemHandles) {
    const files = Array.from((dataTransfer && dataTransfer.files) || []);

    if (typeof NL_VERSION !== "undefined") {
      const droppedPath = files.find((file) => file && file.path && (isMarkdownPath(file.path || file.name) || isGraphFilePath(file.path || file.name)));
      if (droppedPath) {
        await openDocumentSourceFile({
          name: getFileName(droppedPath.path || droppedPath.name),
          path: droppedPath.path
        });
        return true;
      }
    }

    const handle = await getDocumentFileHandleFromDrop(dataTransfer, fileSystemHandles);
    if (handle) {
      await openDocumentSourceFile({
        name: handle.name,
        handle
      });
      return true;
    }

    const entryFile = await getDocumentFileFromEntryDrop(dataTransfer);
    if (entryFile) {
      await openDocumentSourceFile(entryFile);
      return true;
    }

    const file = files.find((candidate) => candidate && (isMarkdownPath(candidate.name) || isGraphFilePath(candidate.name)));
    if (file) {
      await openDocumentSourceFile({
        name: file.name,
        file
      });
      return true;
    }

    return false;
  }

  async function openDroppedFolder(dataTransfer, fileSystemHandles) {
    if (typeof NL_VERSION !== "undefined") {
      const files = Array.from((dataTransfer && dataTransfer.files) || []);
      const droppedPath = files.find((file) => file && file.path && !isMarkdownPath(file.path || file.name) && !isGraphFilePath(file.path || file.name));
      if (droppedPath) {
        await openFolderTreeFromNeutralinoPath(droppedPath.path);
        return true;
      }
    }

    const dirHandle = await getDirectoryHandleFromDrop(dataTransfer, fileSystemHandles);
    if (dirHandle) {
      activeFolderName = dirHandle.name || "Graph View";
      activeFolderHandle = dirHandle;
      activeFolderPath = null;
      const nodes = await listMarkdownTree(dirHandle);
      folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
      renderFolderTree(nodes);
      rememberRecentFolder({ name: activeFolderName, label: activeFolderName, handle: dirHandle });
      return true;
    }

    const directoryEntry = getDirectoryEntryFromDrop(dataTransfer);
    if (directoryEntry) {
      activeFolderName = directoryEntry.name || "Graph View";
      activeFolderHandle = null;
      activeFolderPath = null;
      const nodes = await listMarkdownTreeFromEntry(directoryEntry);
      folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
      renderFolderTree(nodes);
      rememberRecentFolder({ name: activeFolderName, label: activeFolderName });
      return true;
    }

    return false;
  }

async function listMarkdownTreeNeutralino(dirPath) {
  const entries = [];
  try {
    const items = await Neutralino.filesystem.readDirectory(dirPath);
    for (const item of items) {
      if (item.entry === "." || item.entry === "..") continue;
      const fullPath = `${dirPath}/${item.entry}`;
      let stats = null;
      try {
        stats = await Neutralino.filesystem.getStats(fullPath);
      } catch (error) {
        console.warn("Failed to read file metadata:", fullPath, error);
      }
      if (item.type === "DIRECTORY") {
        const children = await listMarkdownTreeNeutralino(fullPath);
        entries.push({ kind: "directory", name: item.entry, children, fullPath, createdAt: Number(stats?.createdAt || 0), modifiedAt: Number(stats?.modifiedAt || 0) });
      } else if (item.type === "FILE" && isSidebarDocumentPath(item.entry)) {
        entries.push({ kind: "file", name: item.entry, fullPath, createdAt: Number(stats?.createdAt || stats?.modifiedAt || 0), modifiedAt: Number(stats?.modifiedAt || 0) });
      }
    }
  } catch (error) {
    console.warn("Failed to read directory:", dirPath, error);
  }
  return sortFolderTreeNodes(entries);
}

async function collectMarkdownFilesFromTreeNeutralino(nodes, parentPath = "") {
  const files = [];
  for (const node of (nodes || [])) {
    const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    if (node.kind === "directory") {
      const nestedFiles = await collectMarkdownFilesFromTreeNeutralino(node.children || [], currentPath);
      files.push(...nestedFiles);
    } else if (node.kind === "file" && isMarkdownPath(node.name)) {
      try {
        const content = await Neutralino.filesystem.readFile(node.fullPath);
        const file = new File([content], node.name, { type: "text/markdown" });
        files.push({ path: currentPath, fullPath: node.fullPath, file });
      } catch (error) {
        console.warn("Failed to read file:", currentPath, error);
      }
    }
  }
  return files;
}


  let sidebarFileContextMenu = null;
  let sidebarFolderContextMenu = null;
  let sidebarClosedFolderContextMenu = null;
  let sidebarContextTarget = null;

  const CONTEXT_MENU_ACTIONS = Object.freeze({
    openInNewTab: { label: "Open in a new tab", icon: "bi bi-box-arrow-up-right" },
    openWithDefaultApp: { label: "Open with default app", icon: "bi bi-window" },
    revealInFileExplorer: { label: "Reveal in file explorer", icon: "bi bi-folder2-open" },
    rename: { label: "Rename", icon: "bi bi-pencil" },
    copy: { label: "Copy", icon: "bi bi-clipboard" },
    copyPath: { label: "Copy path", icon: "bi bi-file-earmark-text" },
    copyContent: { label: "Copy content", icon: "bi bi-file-text" },
    share: { label: "Share", icon: "bi bi-share" },
    deleteFile: { label: "Delete file", icon: "bi bi-trash3" },
    deleteFolder: { label: "Delete folder", icon: "bi bi-trash3" },
    export: { label: "Export", icon: "bi bi-download" },
    exportMarkdown: { label: "Export as Markdown", icon: "bi bi-file-earmark-text" },
    exportHtml: { label: "Export as HTML", icon: "bi bi-file-earmark-code" },
    exportPdf: { label: "Export as PDF", icon: "bi bi-file-earmark-pdf" },
    showGraphView: { label: "Show graph view", icon: "bi bi-diagram-3" },
    refresh: { label: "Refresh", icon: "bi bi-arrow-clockwise" },
    newFile: { label: "New file ...", icon: "bi bi-file-earmark-plus" },
    newFolder: { label: "New folder ...", icon: "bi bi-folder-plus" },
    removePoint: { label: "Remove this point", icon: "bi bi-eye-slash" },
    showLocalGraph: { label: "Show local graph", icon: "bi bi-diagram-2" },
    showFullLocalGraph: { label: "Show full local graph", icon: "bi bi-diagram-3" },
    turnMagneticForcesOff: { label: "Turn magnetic forces off", icon: "bi bi-magnet" },
    copyDependencies: { label: "Copy dependencies", icon: "bi bi-list-ul" },
    copyFullDependencies: { label: "Copy full dependencies", icon: "bi bi-bezier2" },
    copyBacklinks: { label: "Copy backlinks", icon: "bi bi-arrow-left-circle" },
    openFolder: { label: "Open folder", icon: "bi bi-folder2-open" }
  });

  function createFileContextMenuButton(labelText, iconClass, tooltipText) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "graph-context-menu-item graph-context-menu-tooltip";
    button.dataset.tooltip = tooltipText;
    const icon = document.createElement("i");
    icon.className = iconClass;
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "graph-context-menu-item-label";
    label.textContent = labelText;
    button.appendChild(icon);
    button.appendChild(label);
    return button;
  }

  function getSidebarNodeSource(node) {
    if (!node) return null;
    return {
      name: node.name,
      file: node.file || null,
      handle: node.handle || null,
      path: node.fullPath || node.path || null
    };
  }

  function getSidebarNodeClipboardPath(node) {
    if (!node) return "";
    return node.fullPath || node.path || node.name || "";
  }

  async function readSidebarNodeContent(node) {
    if (!node) throw new Error("No sidebar file was selected.");
    if (isNeutralinoRuntime() && node.fullPath) {
      return Neutralino.filesystem.readFile(node.fullPath);
    }
    if (node.file) return node.file.text();
    if (node.handle) {
      const file = await node.handle.getFile();
      return file.text();
    }
    throw new Error("No readable file was provided.");
  }

  function runWithTemporaryEditorContent(content, action) {
    const previousValue = markdownEditor.value;
    markdownEditor.value = content || "";
    try {
      action();
    } finally {
      markdownEditor.value = previousValue;
      updateEditorLineNumbers();
    }
  }

  function exportMarkdownContent(content, name) {
    const suggestedName = sanitizeMarkdownFileName(name || "document");
    saveAs(new Blob([content || ""], { type: "text/markdown;charset=utf-8" }), suggestedName);
  }

  function exportHtmlContent(content) {
    runWithTemporaryEditorContent(content, () => exportHtml.click());
  }

  function exportPdfContent(content) {
    runWithTemporaryEditorContent(content, () => exportPdf.click());
  }

  function getSidebarNodeFilesystemPath(node) {
    if (!node || !isNeutralinoRuntime()) return null;
    if (node.fullPath) return node.fullPath;
    if (activeFolderPath && node.path) return joinPath(activeFolderPath, node.path);
    return null;
  }

  async function copySidebarContextText(text) {
    if (isNeutralinoRuntime() && Neutralino.clipboard?.writeText) {
      await Neutralino.clipboard.writeText(text || "");
      showCopiedMessage();
      return;
    }
    await copyToClipboard(text || "");
  }

  function hideSidebarFileContextMenu() {
    if (!sidebarFileContextMenu) return;
    sidebarFileContextMenu.classList.add("hidden");
    sidebarContextTarget = null;
  }

  function hideSidebarFolderContextMenu() {
    if (!sidebarFolderContextMenu) return;
    sidebarFolderContextMenu.classList.add("hidden");
    sidebarContextTarget = null;
  }

  function hideSidebarClosedFolderContextMenu() {
    if (!sidebarClosedFolderContextMenu) return;
    sidebarClosedFolderContextMenu.classList.add("hidden");
    sidebarContextTarget = null;
  }

  function hideSidebarContextMenus() {
    hideSidebarFileContextMenu();
    hideSidebarFolderContextMenu();
    hideSidebarClosedFolderContextMenu();
  }

  function positionSidebarContextMenu(menu, event, fallbackHeight) {
    if (!menu) return;
    const menuWidth = menu.offsetWidth || 230;
    const menuHeight = menu.offsetHeight || fallbackHeight || 280;
    const left = Math.max(0, Math.min(event.clientX, window.innerWidth - menuWidth - 8));
    const top = Math.max(0, Math.min(event.clientY, window.innerHeight - menuHeight - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function positionSidebarFileContextMenu(event) {
    positionSidebarContextMenu(sidebarFileContextMenu, event, 320);
  }

  function positionSidebarFolderContextMenu(event) {
    positionSidebarContextMenu(sidebarFolderContextMenu, event, 250);
  }

  function positionSidebarClosedFolderContextMenu(event) {
    positionSidebarContextMenu(sidebarClosedFolderContextMenu, event, 80);
  }

  function getOpenFolderMainMenuButton() {
    return document.querySelector("#import-from-folder");
  }

  function getOpenFolderActionLabel() {
    const button = getOpenFolderMainMenuButton();
    const buttonLabel = button ? button.textContent.replace(/\s+/g, " ").trim() : "";
    return buttonLabel ? buttonLabel.replace(/\s*\.\.\.$/, "") : CONTEXT_MENU_ACTIONS.openFolder.label;
  }

  function getOpenFolderActionTitle() {
    const button = getOpenFolderMainMenuButton();
    return (button && button.title) || "Open a folder to browse Markdown and graph files.";
  }

  function getPathDirectory(path) {
    if (!path) return "";
    const normalized = String(path);
    const lastSlash = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
    return lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
  }

  function getRenamedSiblingPath(path, newName) {
    const directory = getPathDirectory(path);
    return directory ? joinPath(directory, newName) : newName;
  }

  function validateSidebarRenameName(name, kind) {
    const value = String(name || "").trim();
    if (!value) return `Enter a name before ${kind === "new-file" ? "creating the file" : "renaming"}.`;
    if (/[\\/]/.test(value)) return "Enter a name only, without folder separators.";
    if (/^\.+$/.test(value)) return "Enter a name that is not only dots.";
    if (kind === "file" && !isSidebarDocumentPath(value)) {
      return "File names must end in .md, .markdown, .mdviewer-graph.json, .mdgraph.json, or .json.";
    }
    return "";
  }

  function promptSidebarRename(node, kind) {
    return new Promise((resolve) => {
      const modal = document.getElementById('rename-modal');
      const title = document.getElementById('rename-modal-title');
      const input = document.getElementById('rename-modal-input');
      const confirmBtn = document.getElementById('rename-modal-confirm');
      const cancelBtn = document.getElementById('rename-modal-cancel');
      if (!modal || !input || !confirmBtn || !cancelBtn) {
        resolve(null);
        return;
      }

      if (title) title.textContent = kind === "folder" ? "Rename folder" : "Rename file";
      input.value = node?.name || "";
      input.placeholder = kind === "folder" ? "Folder name" : "File name";
      confirmBtn.textContent = "Rename";
      modal.style.display = 'flex';
      input.focus();
      input.select();

      function cleanup(result) {
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
        modal.style.display = 'none';
        resolve(result);
      }

      function onConfirm() {
        const newName = input.value.trim();
        const validationMessage = validateSidebarRenameName(newName, kind);
        if (validationMessage) {
          alert(validationMessage);
          input.focus();
          return;
        }
        cleanup(newName);
      }

      function onCancel() {
        cleanup(null);
      }

      function onKey(event) {
        if (event.key === 'Enter') onConfirm();
        else if (event.key === 'Escape') onCancel();
      }

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
    });
  }

  function promptSidebarNewFileName(parentNode) {
    return new Promise((resolve) => {
      const modal = document.getElementById('rename-modal');
      const title = document.getElementById('rename-modal-title');
      const input = document.getElementById('rename-modal-input');
      const confirmBtn = document.getElementById('rename-modal-confirm');
      const cancelBtn = document.getElementById('rename-modal-cancel');
      if (!modal || !input || !confirmBtn || !cancelBtn) {
        resolve(null);
        return;
      }

      if (title) title.textContent = `New file in ${parentNode?.name || "folder"}`;
      input.value = "Untitled.md";
      input.placeholder = "File name (for example, notes.md)";
      confirmBtn.textContent = "Create";
      modal.style.display = 'flex';
      input.focus();
      input.select();

      function cleanup(result) {
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
        modal.style.display = 'none';
        confirmBtn.textContent = "Rename";
        resolve(result);
      }

      function onConfirm() {
        const fileName = input.value.trim();
        const validationMessage = validateSidebarRenameName(fileName, "new-file");
        if (validationMessage) {
          alert(validationMessage);
          input.focus();
          return;
        }
        cleanup(fileName);
      }

      function onCancel() {
        cleanup(null);
      }

      function onKey(event) {
        if (event.key === 'Enter') onConfirm();
        else if (event.key === 'Escape') onCancel();
      }

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
    });
  }

  function promptSidebarNewFolderName(parentNode) {
    return new Promise((resolve) => {
      const modal = document.getElementById('rename-modal');
      const title = document.getElementById('rename-modal-title');
      const input = document.getElementById('rename-modal-input');
      const confirmBtn = document.getElementById('rename-modal-confirm');
      const cancelBtn = document.getElementById('rename-modal-cancel');
      if (!modal || !input || !confirmBtn || !cancelBtn) {
        resolve(null);
        return;
      }

      if (title) title.textContent = `New folder in ${parentNode?.name || "folder"}`;
      input.value = "";
      input.placeholder = "Folder name";
      confirmBtn.textContent = "Create";
      modal.style.display = 'flex';
      input.focus();

      function cleanup(result) {
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
        modal.style.display = 'none';
        confirmBtn.textContent = "Rename";
        resolve(result);
      }

      function onConfirm() {
        const folderName = input.value.trim();
        const validationMessage = validateSidebarRenameName(folderName, "folder");
        if (validationMessage) {
          alert(validationMessage);
          input.focus();
          return;
        }
        if ((parentNode?.children || []).some((child) => child.kind === "directory" && child.name.toLowerCase() === folderName.toLowerCase())) {
          alert("A folder with this name already exists here.");
          input.focus();
          return;
        }
        cleanup(folderName);
      }

      function onCancel() {
        cleanup(null);
      }

      function onKey(event) {
        if (event.key === 'Enter') onConfirm();
        else if (event.key === 'Escape') onCancel();
      }

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
    });
  }

  function updateTabsAfterSidebarFileRename(target, oldPath, newPath, newName) {
    let changed = false;
    tabs.forEach((tab) => {
      const matchesPath = oldPath && tab.sourceFilePath === oldPath;
      const matchesHandle = target?.handle && tab.sourceFileHandle === target.handle;
      if (!matchesPath && !matchesHandle) return;
      tab.sourceFileName = newName;
      if (newPath) tab.sourceFilePath = newPath;
      if (tab.type !== "graph") {
        tab.title = isGraphFilePath(newName) ? getGraphTitleFromFileName(newName) : getMarkdownTitleFromFileName(newName);
      }
      changed = true;
    });
    changed = updateGraphTabsAfterPathRename(getSidebarRenamePathMappings(oldPath || target?.path, newPath, "file")) || changed;
    if (changed) {
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
      if (getActiveGraphTab()) renderGraphView();
    }
  }

  function stripMarkdownExtension(path) {
    return String(path || "").replace(/\.(md|markdown)$/i, "");
  }

  function splitMarkdownLinkSuffix(reference) {
    const value = String(reference || "");
    let suffixIndex = -1;
    ["#", "?"].forEach((marker) => {
      const index = value.indexOf(marker);
      if (index >= 0 && (suffixIndex < 0 || index < suffixIndex)) suffixIndex = index;
    });
    if (suffixIndex < 0) return { target: value, suffix: "" };
    return {
      target: value.slice(0, suffixIndex),
      suffix: value.slice(suffixIndex)
    };
  }

  function getRelativePathBetweenFiles(sourcePath, targetPath) {
    const sourceParts = String(sourcePath || "").replace(/\\/g, "/").split("/").filter(Boolean);
    const targetParts = String(targetPath || "").replace(/\\/g, "/").split("/").filter(Boolean);
    sourceParts.pop();
    while (sourceParts.length && targetParts.length && sourceParts[0].toLowerCase() === targetParts[0].toLowerCase()) {
      sourceParts.shift();
      targetParts.shift();
    }
    return [...sourceParts.map(() => ".."), ...targetParts].join("/");
  }

  function getRenameReferenceTargetPath(referenceTarget, sourcePath, oldPath, newPath, kind, resolvedTargetPath) {
    const normalizedTarget = String(referenceTarget || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
    const targetHasMarkdownExtension = /\.(md|markdown)$/i.test(normalizedTarget);
    const useExtension = targetHasMarkdownExtension;
    const isBareReference = !normalizedTarget.includes("/");
    const oldRelativePath = activeFolderPath ? getPathRelativeToFolder(oldPath, activeFolderPath) : oldPath;
    const newRelativePath = activeFolderPath ? getPathRelativeToFolder(newPath, activeFolderPath) : newPath;
    const normalizedOldRelativePath = String(oldRelativePath || oldPath || "").replace(/\\/g, "/");
    const normalizedNewRelativePath = String(newRelativePath || newPath || "").replace(/\\/g, "/");
    if (!normalizedOldRelativePath || !normalizedNewRelativePath) return null;

    const renamedPath = kind === "folder"
      ? stripMarkdownExtension(replacePathPrefix(resolvedTargetPath, normalizedOldRelativePath, normalizedNewRelativePath))
      : stripMarkdownExtension(normalizedNewRelativePath);

    if (!renamedPath || renamedPath === normalizedTarget) return null;

    const sourceAfterRename = kind === "folder"
      ? replacePathPrefix(sourcePath, normalizedOldRelativePath, normalizedNewRelativePath)
      : sourcePath;
    let replacement = isBareReference
      ? (renamedPath.split("/").pop() || renamedPath)
      : getRelativePathBetweenFiles(sourceAfterRename, useExtension ? `${renamedPath}.md` : renamedPath);
    if (!useExtension) replacement = stripMarkdownExtension(replacement);
    if (useExtension && !/\.(md|markdown)$/i.test(replacement)) replacement += ".md";
    if (String(referenceTarget || "").startsWith("./") && !replacement.startsWith(".") && !replacement.startsWith("/")) {
      replacement = `./${replacement}`;
    }
    if (String(referenceTarget || "").startsWith("/") && !replacement.startsWith("/")) {
      replacement = `/${useExtension ? `${renamedPath}.md` : stripMarkdownExtension(renamedPath)}`;
    }
    return replacement;
  }

  function updateMarkdownRenameLinks(content, sourcePath, nodeIndex, oldPath, newPath, kind) {
    if (!content || !oldPath || !newPath) return content;
    const oldRelativePath = activeFolderPath ? getPathRelativeToFolder(oldPath, activeFolderPath) : oldPath;
    const oldTargetId = normalizeGraphNodeName(oldRelativePath || oldPath);
    const getResolvedRenameTarget = (reference) => {
      const target = resolveGraphTargetId(reference, sourcePath, nodeIndex);
      if (!target) return null;
      const isMatch = kind === "folder" ? (target === oldTargetId || target.startsWith(oldTargetId + "/")) : target === oldTargetId;
      return isMatch ? { id: target, path: nodeIndex.get(target) || target } : null;
    };
    const renameReference = (reference) => {
      const { target, suffix } = splitMarkdownLinkSuffix(reference);
      const resolvedTarget = getResolvedRenameTarget(target);
      if (!resolvedTarget) return reference;
      const renamedTarget = getRenameReferenceTargetPath(target, sourcePath, oldPath, newPath, kind, resolvedTarget.path);
      return renamedTarget ? `${renamedTarget}${suffix}` : reference;
    };

    return String(content)
      .replace(/\[\[([^\]]+)\]\]/g, (fullMatch, inner) => {
        const pipeIndex = String(inner).indexOf("|");
        const target = pipeIndex >= 0 ? String(inner).slice(0, pipeIndex) : String(inner);
        const alias = pipeIndex >= 0 ? String(inner).slice(pipeIndex) : "";
        const renamedTarget = renameReference(target.trim());
        return renamedTarget === target.trim() ? fullMatch : `[[${renamedTarget}${alias}]]`;
      })
      .replace(/(\[[^\]]*?\]\()([^\s)]+)(\))/g, (fullMatch, prefix, url, suffix) => {
        if (/^(https?:|mailto:|tel:|#)/i.test(url)) return fullMatch;
        const renamedUrl = renameReference(url);
        return renamedUrl === url ? fullMatch : `${prefix}${renamedUrl}${suffix}`;
      });
  }

  async function writeFolderMarkdownEntryContent(entry, content, oldPath, newPath, kind) {
    const entryFullPath = entry.fullPath || null;
    let writePath = entryFullPath;
    if (kind === "folder") writePath = replacePathPrefix(entryFullPath, oldPath, newPath);
    if (kind === "file" && entryFullPath === oldPath) writePath = newPath;

    if (isNeutralinoRuntime()) {
      if (!writePath || !Neutralino.filesystem?.writeFile) throw new Error("No writable filesystem path is available.");
      await Neutralino.filesystem.writeFile(writePath, content);
      return writePath;
    }

    if (entry.handle?.createWritable) {
      const writable = await entry.handle.createWritable();
      await writable.write(content);
      await writable.close();
      return entry.path;
    }

    throw new Error("No writable file handle is available.");
  }

  function getEntryContent(entry) {
    if (entry.content !== undefined) return Promise.resolve(entry.content);
    if (entry.file) return entry.file.text();
    if (entry.handle) return entry.handle.getFile().then((file) => file.text());
    if (isNeutralinoRuntime() && entry.fullPath) return Neutralino.filesystem.readFile(entry.fullPath);
    return Promise.reject(new Error("No readable Markdown file is available."));
  }

  function updateOpenTabsAfterMarkdownLinkRename(changedFiles) {
    if (!changedFiles || !changedFiles.size) return;
    let changed = false;
    tabs.forEach((tab) => {
      if (tab.type === "graph") return;
      const pathKey = tab.sourceFilePath || "";
      const handleEntry = Array.from(changedFiles.values()).find((item) => item.handle && item.handle === tab.sourceFileHandle);
      const changedEntry = changedFiles.get(pathKey) || handleEntry;
      if (!changedEntry) return;
      const normalizedContent = normalizeEditorContent(changedEntry.content);
      tab.content = normalizedContent;
      tab.savedContent = normalizedContent;
      if (tab.id === activeTabId) {
        markdownEditor.value = normalizedContent;
        renderMarkdown();
      }
      changed = true;
    });
    if (changed) {
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
    }
  }

  async function updateOpenFolderLinksAfterSidebarRename(oldPath, newPath, kind) {
    if (!oldPath || !newPath || !folderMarkdownFiles.length) return 0;
    const files = folderMarkdownFiles.slice();
    const nodeIndex = new Map();
    files.forEach((entry) => {
      const path = entry.path || entry.file?.webkitRelativePath || entry.file?.name || "";
      const id = normalizeGraphNodeName(path);
      if (id) nodeIndex.set(id, path);
    });

    const changedFiles = new Map();
    for (const entry of files) {
      const sourcePath = entry.path || entry.file?.webkitRelativePath || entry.file?.name || "";
      if (!sourcePath) continue;
      try {
        const content = await getEntryContent(entry);
        const updatedContent = updateMarkdownRenameLinks(content, sourcePath, nodeIndex, oldPath, newPath, kind);
        if (updatedContent === content) continue;
        const writePath = await writeFolderMarkdownEntryContent(entry, updatedContent, oldPath, newPath, kind);
        const changedEntry = {
          content: updatedContent,
          handle: entry.handle || null
        };
        [writePath, entry.fullPath, entry.path, sourcePath]
          .filter(Boolean)
          .forEach((pathKey) => changedFiles.set(pathKey, changedEntry));
      } catch (error) {
        console.warn(`Failed to update Markdown links in ${sourcePath}:`, error);
      }
    }
    updateOpenTabsAfterMarkdownLinkRename(changedFiles);
    return changedFiles.size;
  }

  function replacePathPrefix(path, oldPrefix, newPrefix) {
    if (!path || !oldPrefix || !newPrefix) return path;
    const originalPath = String(path);
    const normalize = (value) => String(value).replace(/\\/g, "/").replace(/\/+$/, "");
    const normalizedPath = originalPath.replace(/\\/g, "/");
    const normalizedOldPrefix = normalize(oldPrefix);
    if (normalizedPath !== normalizedOldPrefix && !normalizedPath.startsWith(normalizedOldPrefix + "/")) {
      return path;
    }
    return String(newPrefix).replace(/\/+$/, "") + normalizedPath.slice(normalizedOldPrefix.length);
  }

  function getPathRelativeToFolder(path, folderPath) {
    if (!path || !folderPath || !isPathInsideFolder(path, folderPath)) return "";
    const normalize = (value) => String(value).replace(/\\/g, "/").replace(/\/+$/, "");
    const normalizedFolder = normalize(folderPath);
    const normalizedPath = String(path).replace(/\\/g, "/");
    return normalizedPath === normalizedFolder ? "" : normalizedPath.slice(normalizedFolder.length + 1);
  }

  function renameGraphSnapshotPathReferences(snapshot, pathMappings) {
    if (!snapshot || !Array.isArray(pathMappings) || !pathMappings.length) return false;
    let changed = false;
    const idMappings = new Map();
    const getRenamedPath = (path) => {
      for (const mapping of pathMappings) {
        const renamed = mapping.isPrefix
          ? replacePathPrefix(path, mapping.oldPath, mapping.newPath)
          : (path === mapping.oldPath ? mapping.newPath : path);
        if (renamed !== path) return renamed;
      }
      return path;
    };

    (snapshot.nodes || []).forEach((node) => {
      const oldId = node.id;
      const oldPath = node.fullPath || oldId;
      const newPath = getRenamedPath(oldPath);
      if (newPath === oldPath) return;
      const newId = normalizeGraphNodeName(newPath);
      if (oldId && newId && oldId !== newId) idMappings.set(oldId, newId);
      node.id = newId || oldId;
      node.label = getGraphDisplayLabel(newPath);
      node.fullPath = newPath;
      changed = true;
    });

    (snapshot.files || []).forEach((file) => {
      const oldId = file.id;
      const oldPath = file.path || oldId;
      const oldFullPath = file.fullPath || "";
      const newPath = getRenamedPath(oldPath);
      const newFullPath = getRenamedPath(oldFullPath);
      if (newPath === oldPath && newFullPath === oldFullPath) return;
      const idPath = newPath !== oldPath ? newPath : (newFullPath || oldPath);
      const newId = normalizeGraphNodeName(idPath);
      if (oldId && newId && oldId !== newId) idMappings.set(oldId, newId);
      file.id = newId || oldId;
      file.path = newPath;
      file.name = getFileName(newPath || newFullPath || file.name);
      if (file.fullPath !== undefined) file.fullPath = newFullPath || file.fullPath;
      changed = true;
    });

    if (idMappings.size) {
      (snapshot.links || []).forEach((link) => {
        const newSource = idMappings.get(link.source);
        const newTarget = idMappings.get(link.target);
        if (newSource) {
          link.source = newSource;
          changed = true;
        }
        if (newTarget) {
          link.target = newTarget;
          changed = true;
        }
      });
    }

    return { changed, idMappings };
  }

  function updateGraphTabConfigAfterNodeRename(tab, idMappings) {
    if (!tab || !idMappings || !idMappings.size) return false;
    let changed = false;
    const renameId = (id) => idMappings.get(id) || id;
    const renameIds = (ids) => Array.isArray(ids) ? ids.map(renameId) : ids;

    if (tab.graphViewConfig) {
      if (tab.graphViewConfig.focusNodeId && idMappings.has(tab.graphViewConfig.focusNodeId)) {
        tab.graphViewConfig.focusNodeId = renameId(tab.graphViewConfig.focusNodeId);
        changed = true;
      }
      ["allowedNodeIds", "hiddenNodeIds"].forEach((key) => {
        const renamedIds = renameIds(tab.graphViewConfig[key]);
        if (renamedIds && renamedIds !== tab.graphViewConfig[key]) {
          tab.graphViewConfig[key] = renamedIds;
          changed = true;
        }
      });
    }

    if (tab.graphLayout?.nodes && typeof tab.graphLayout.nodes === "object") {
      idMappings.forEach((newId, oldId) => {
        if (!Object.prototype.hasOwnProperty.call(tab.graphLayout.nodes, oldId)) return;
        tab.graphLayout.nodes[newId] = tab.graphLayout.nodes[oldId];
        delete tab.graphLayout.nodes[oldId];
        changed = true;
      });
    }

    return changed;
  }

  function updateGraphTabsAfterPathRename(pathMappings) {
    if (!Array.isArray(pathMappings) || !pathMappings.length) return false;
    let changed = false;
    tabs.forEach((tab) => {
      if (tab.type !== "graph" || !tab.graphSnapshot) return;
      const result = renameGraphSnapshotPathReferences(tab.graphSnapshot, pathMappings);
      if (!result?.changed) return;
      updateGraphTabConfigAfterNodeRename(tab, result.idMappings);
      const cachedRender = graphRenderCache.get(tab.id);
      if (cachedRender?.simulation) cachedRender.simulation.stop();
      if (cachedRender?.wrapper) cachedRender.wrapper.remove();
      graphRenderCache.delete(tab.id);
      changed = true;
    });
    return changed;
  }

  function getSidebarRenamePathMappings(oldPath, newPath, kind) {
    const mappings = [];
    if (oldPath && newPath) {
      mappings.push({ oldPath, newPath, isPrefix: kind === "folder" });
    }
    if (activeFolderPath && oldPath && newPath) {
      const oldRelativePath = getPathRelativeToFolder(oldPath, activeFolderPath);
      const newRelativePath = getPathRelativeToFolder(newPath, activeFolderPath);
      if (oldRelativePath && newRelativePath) {
        mappings.push({ oldPath: oldRelativePath, newPath: newRelativePath, isPrefix: kind === "folder" });
      }
    }
    return mappings;
  }

  function updateTabsAfterSidebarFolderRename(oldPath, newPath) {
    if (!oldPath || !newPath) return;
    let changed = false;
    tabs.forEach((tab) => {
      const renamedPath = replacePathPrefix(tab.sourceFilePath, oldPath, newPath);
      if (renamedPath === tab.sourceFilePath) return;
      tab.sourceFilePath = renamedPath;
      changed = true;
    });
    changed = updateGraphTabsAfterPathRename(getSidebarRenamePathMappings(oldPath, newPath, "folder")) || changed;
    if (changed) {
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
      if (getActiveGraphTab()) renderGraphView();
    }
  }

  async function sidebarFileExists(parentNode, fileName) {
    if (!parentNode || !fileName) return false;

    if (isNeutralinoRuntime()) {
      const parentPath = getSidebarFolderFilesystemPath(parentNode);
      if (!parentPath || !Neutralino.filesystem?.readDirectory) return false;
      const entries = await Neutralino.filesystem.readDirectory(parentPath);
      return entries.some((entry) => entry.entry.toLowerCase() === fileName.toLowerCase());
    }

    if (parentNode.handle && typeof parentNode.handle.getFileHandle === "function") {
      try {
        await parentNode.handle.getFileHandle(fileName, { create: false });
        return true;
      } catch (error) {
        if (error && (error.name === "NotFoundError" || error.code === 8)) return false;
        throw error;
      }
    }

    return (parentNode.children || []).some((child) => child.kind === "file" && child.name.toLowerCase() === fileName.toLowerCase());
  }

  async function createSidebarFileOnDisk(node) {
    if (!node || node.kind !== "directory") return;
    const fileName = await promptSidebarNewFileName(node);
    if (!fileName) return;

    if (await sidebarFileExists(node, fileName)) {
      alert("A file with this name already exists here.");
      return;
    }

    if (isNeutralinoRuntime()) {
      const parentPath = getSidebarFolderFilesystemPath(node);
      if (!parentPath || !Neutralino.filesystem?.writeFile) {
        alert("Creating files is available only in the desktop app for folders opened from disk.");
        return;
      }
      const filePath = joinPath(parentPath, fileName);
      await Neutralino.filesystem.writeFile(filePath, "");
    } else if (node.handle && typeof node.handle.getFileHandle === "function") {
      const fileHandle = await node.handle.getFileHandle(fileName, { create: true });
      if (!fileHandle || typeof fileHandle.createWritable !== "function") {
        alert("Creating files from the folder tree requires write access to the opened folder.");
        return;
      }
      const writable = await fileHandle.createWritable();
      await writable.write("");
      await writable.close();
    } else {
      alert("Creating files from the folder tree is available in the desktop app or in browsers when the folder was opened with write access.");
      return;
    }

    await reloadOpenFolderTree();
  }

  async function createSidebarFolderOnDisk(node) {
    if (!node || node.kind !== "directory") return;
    const folderName = await promptSidebarNewFolderName(node);
    if (!folderName) return;

    if (isNeutralinoRuntime()) {
      const parentPath = getSidebarFolderFilesystemPath(node);
      if (!parentPath || !Neutralino.filesystem?.createDirectory) {
        alert("Creating folders is available only in the desktop app for folders opened from disk.");
        return;
      }
      await Neutralino.filesystem.createDirectory(joinPath(parentPath, folderName));
    } else if (node.handle && typeof node.handle.getDirectoryHandle === "function") {
      await node.handle.getDirectoryHandle(folderName, { create: true });
    } else {
      alert("Creating folders from the folder tree is available in the desktop app or in browsers when the folder was opened with write access.");
      return;
    }

    await reloadOpenFolderTree();
  }

  async function renameSidebarNodeOnDisk(node, kind) {
    if (!node) return;
    const oldName = node.name || "";
    const newName = await promptSidebarRename(node, kind);
    if (!newName || newName === oldName) return;

    const oldPath = kind === "folder" ? getSidebarFolderFilesystemPath(node) : getSidebarNodeFilesystemPath(node);
    const newPath = oldPath ? getRenamedSiblingPath(oldPath, newName) : (node.path ? getRenamedSiblingPath(node.path, newName) : newName);

    if (isNeutralinoRuntime()) {
      if (!oldPath || !Neutralino.filesystem?.move) {
        alert(`Renaming ${kind}s requires filesystem.move permission in the desktop app for ${kind}s opened from disk.`);
        return;
      }
      await Neutralino.filesystem.move(oldPath, newPath);
    } else if (node.handle && typeof node.handle.move === "function") {
      await node.handle.move(newName);
    } else {
      alert(`Renaming ${kind}s from the folder tree is available in the desktop app for ${kind}s opened from disk.`);
      return;
    }

    try {
      await updateOpenFolderLinksAfterSidebarRename(oldPath || node.path, newPath, kind);
    } catch (error) {
      console.warn(`Renamed ${kind}, but failed to update Markdown links:`, error);
    }

    if (kind === "folder") {
      updateTabsAfterSidebarFolderRename(oldPath || node.path, newPath);
    } else {
      updateTabsAfterSidebarFileRename(node, oldPath || node.path, newPath, newName);
    }

    try {
      await reloadOpenFolderTree();
    } catch (error) {
      console.warn(`Renamed ${kind}, but failed to refresh the folder tree:`, error);
    }
  }

  function ensureSidebarFileContextMenu() {
    if (sidebarFileContextMenu) return sidebarFileContextMenu;

    const menu = document.createElement("div");
    menu.className = "graph-context-menu sidebar-file-context-menu hidden";

    const title = document.createElement("div");
    title.className = "graph-context-menu-title";
    const separator = document.createElement("div");
    separator.className = "graph-context-menu-separator";

    const openFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.openInNewTab.label,
      CONTEXT_MENU_ACTIONS.openInNewTab.icon,
      "Open this file in a dedicated tab from the sidebar tree."
    );
    const openDefaultAppBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.openWithDefaultApp.label,
      CONTEXT_MENU_ACTIONS.openWithDefaultApp.icon,
      "Ask the operating system to open this file with its configured default application."
    );
    const revealFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.label,
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.icon,
      "Open the file's folder in the system file explorer and select this file when supported."
    );
    const renameFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.rename.label,
      CONTEXT_MENU_ACTIONS.rename.icon,
      "Rename this file on disk and refresh the folder tree."
    );

    const copySubmenu = document.createElement("div");
    copySubmenu.className = "graph-context-menu-submenu";
    const copySubmenuBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.copy.label,
      CONTEXT_MENU_ACTIONS.copy.icon,
      "Open copy actions for this file, including its path and content."
    );
    copySubmenuBtn.setAttribute("aria-haspopup", "true");
    const copySubmenuArrow = document.createElement("span");
    copySubmenuArrow.className = "graph-context-menu-submenu-arrow";
    copySubmenuArrow.textContent = "›";
    copySubmenuBtn.appendChild(copySubmenuArrow);
    const copySubmenuPanel = document.createElement("div");
    copySubmenuPanel.className = "graph-context-menu-submenu-panel";
    const copyPathBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyPath.label,
      CONTEXT_MENU_ACTIONS.copyPath.icon,
      "Copy this file's path and file name to the clipboard."
    );
    const copyContentBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyContent.label,
      CONTEXT_MENU_ACTIONS.copyContent.icon,
      "Copy the entire content of this file to the clipboard."
    );
    copySubmenuPanel.appendChild(copyPathBtn);
    copySubmenuPanel.appendChild(copyContentBtn);
    copySubmenu.appendChild(copySubmenuBtn);
    copySubmenu.appendChild(copySubmenuPanel);

    const shareFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.share.label,
      CONTEXT_MENU_ACTIONS.share.icon,
      "Copy a shareable URL containing this file's Markdown content."
    );

    const deleteFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.deleteFile.label,
      CONTEXT_MENU_ACTIONS.deleteFile.icon,
      "Delete this file from disk after confirmation."
    );
    deleteFileBtn.classList.add("graph-context-menu-item-danger");

    const exportSubmenu = document.createElement("div");
    exportSubmenu.className = "graph-context-menu-submenu";
    const exportSubmenuBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.export.label,
      CONTEXT_MENU_ACTIONS.export.icon,
      "Open export actions for this file."
    );
    exportSubmenuBtn.setAttribute("aria-haspopup", "true");
    const exportSubmenuArrow = document.createElement("span");
    exportSubmenuArrow.className = "graph-context-menu-submenu-arrow";
    exportSubmenuArrow.textContent = "›";
    exportSubmenuBtn.appendChild(exportSubmenuArrow);
    const exportSubmenuPanel = document.createElement("div");
    exportSubmenuPanel.className = "graph-context-menu-submenu-panel";
    const exportMarkdownBtn = createFileContextMenuButton(CONTEXT_MENU_ACTIONS.exportMarkdown.label, CONTEXT_MENU_ACTIONS.exportMarkdown.icon, "Download this file as Markdown.");
    const exportHtmlBtn = createFileContextMenuButton(CONTEXT_MENU_ACTIONS.exportHtml.label, CONTEXT_MENU_ACTIONS.exportHtml.icon, "Download this file as HTML.");
    const exportPdfBtn = createFileContextMenuButton(CONTEXT_MENU_ACTIONS.exportPdf.label, CONTEXT_MENU_ACTIONS.exportPdf.icon, "Download this file as PDF.");
    [exportMarkdownBtn, exportHtmlBtn, exportPdfBtn].forEach((button) => exportSubmenuPanel.appendChild(button));
    exportSubmenu.appendChild(exportSubmenuBtn);
    exportSubmenu.appendChild(exportSubmenuPanel);

    const deleteFileTopSeparator = document.createElement("div");
    deleteFileTopSeparator.className = "graph-context-menu-separator";
    const deleteFileBottomSeparator = document.createElement("div");
    deleteFileBottomSeparator.className = "graph-context-menu-separator";

    [
      title,
      separator,
      openFileBtn,
      openDefaultAppBtn,
      revealFileBtn,
      renameFileBtn,
      copySubmenu,
      shareFileBtn,
      deleteFileTopSeparator,
      deleteFileBtn,
      exportSubmenu,
      deleteFileBottomSeparator
    ].forEach((item) => {
      menu.appendChild(item);
    });
    document.body.appendChild(menu);

    openFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await openDocumentSourceFile({ ...getSidebarNodeSource(target), content: await readSidebarNodeContent(target) });
        rememberRecentFile(getSidebarNodeSource(target));
      } catch (error) {
        console.error("Failed to open sidebar context file:", error);
        alert("Unable to open selected file.");
      }
    });

    openDefaultAppBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      const filePath = getSidebarNodeFilesystemPath(target);
      hideSidebarFileContextMenu();
      if (!filePath || !isNeutralinoRuntime() || !Neutralino.os?.open) {
        alert("Opening with the default app is available only in the desktop app for files opened from disk.");
        return;
      }
      try {
        await Neutralino.os.open(filePath);
      } catch (error) {
        console.error("Failed to open sidebar file with default app:", error);
        alert("Unable to open this file with the default app.");
      }
    });

    revealFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      const filePath = getSidebarNodeFilesystemPath(target);
      hideSidebarFileContextMenu();
      if (!filePath || !isNeutralinoRuntime()) {
        alert("Revealing files is available only in the desktop app for files opened from disk.");
        return;
      }
      try {
        if (typeof NL_OS !== "undefined" && NL_OS === "Windows" && Neutralino.os?.execCommand) {
          const windowsPath = filePath.replace(/"/g, "").replace(/\//g, "\\");
          await Neutralino.os.execCommand(`explorer.exe /select,"${windowsPath}"`);
        } else if (Neutralino.os?.open) {
          const normalized = filePath.replace(/\\/g, "/");
          const folderPath = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : normalized;
          await Neutralino.os.open(folderPath);
        } else {
          throw new Error("No supported reveal command is available.");
        }
      } catch (error) {
        console.error("Failed to reveal sidebar file:", error);
        alert("Unable to reveal this file in the file explorer.");
      }
    });

    renameFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      try {
        await renameSidebarNodeOnDisk(target, "file");
      } catch (error) {
        console.error("Failed to rename sidebar file:", error);
        alert("Unable to rename this file.");
      }
    });

    copyPathBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await copySidebarContextText(getSidebarNodeClipboardPath(target));
      } catch (error) {
        console.error("Failed to copy sidebar file path:", error);
        alert("Unable to copy this file path.");
      }
    });

    copyContentBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await copySidebarContextText(await readSidebarNodeContent(target));
      } catch (error) {
        console.error("Failed to copy sidebar file content:", error);
        alert("Unable to copy this file content.");
      }
    });

    shareFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        copyShareUrlFromText(await readSidebarNodeContent(target), shareFileBtn);
      } catch (error) {
        console.error("Failed to share sidebar file:", error);
        alert("Unable to share this file.");
      }
    });

    exportMarkdownBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        exportMarkdownContent(await readSidebarNodeContent(target), target.name);
      } catch (error) {
        console.error("Failed to export sidebar file as Markdown:", error);
        alert("Unable to export this file as Markdown.");
      }
    });

    exportHtmlBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        exportHtmlContent(await readSidebarNodeContent(target));
      } catch (error) {
        console.error("Failed to export sidebar file as HTML:", error);
        alert("Unable to export this file as HTML.");
      }
    });

    exportPdfBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        exportPdfContent(await readSidebarNodeContent(target));
      } catch (error) {
        console.error("Failed to export sidebar file as PDF:", error);
        alert("Unable to export this file as PDF.");
      }
    });

    deleteFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      const filePath = getSidebarNodeFilesystemPath(target);
      hideSidebarFileContextMenu();
      if (!filePath || !isNeutralinoRuntime() || !Neutralino.filesystem?.remove) {
        alert("Deleting files is available only in the desktop app for files opened from disk.");
        return;
      }
      const confirmed = window.confirm(`Delete "${target.name}" from disk? This action cannot be undone.`);
      if (!confirmed) return;
      try {
        await Neutralino.filesystem.remove(filePath);
        closeTabsForDeletedPath(filePath, { kind: "file", targetHandle: target.handle || null });
        await refreshOpenFolderTreeAfterFileDelete(filePath);
      } catch (error) {
        console.error("Failed to delete sidebar file:", error);
        alert("Unable to delete this file.");
      }
    });

    document.addEventListener("click", hideSidebarContextMenus);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideSidebarContextMenus();
    });
    window.addEventListener("blur", hideSidebarContextMenus);

    sidebarFileContextMenu = menu;
    return sidebarFileContextMenu;
  }

  function isOpenFolderRootContextNode(node) {
    return !!(node && node.isOpenFolderRootContext === true);
  }

  function getOpenFolderRootContextNode() {
    return {
      kind: "directory",
      name: activeFolderName || "Folder",
      path: "",
      fullPath: activeFolderPath || "",
      handle: activeFolderHandle || null,
      isOpenFolderRootContext: true
    };
  }

  function getSidebarFolderClipboardPath(node) {
    if (!node) return "";
    if (isOpenFolderRootContextNode(node)) {
      return activeFolderPath || activeFolderName || "";
    }
    return node.fullPath || node.path || node.name || "";
  }

  function getSidebarFolderFilesystemPath(node) {
    if (!node || !isNeutralinoRuntime()) return null;
    if (isOpenFolderRootContextNode(node)) return activeFolderPath || null;
    if (node.fullPath) return node.fullPath;
    if (activeFolderPath && node.path) return joinPath(activeFolderPath, node.path);
    return null;
  }

  function getSidebarFolderGraphTitle(node) {
    const folderPath = getSidebarFolderClipboardPath(node);
    return folderPath ? `Graph View: ${folderPath}` : `Graph View: ${node?.name || "Folder"}`;
  }

  async function collectMarkdownFilesForSidebarFolder(node) {
    if (!node || node.kind !== "directory") return [];
    const parentPath = node.path || node.name || "";
    if (isNeutralinoRuntime()) {
      return collectMarkdownFilesFromTreeNeutralino(node.children || [], parentPath);
    }
    return collectMarkdownFilesFromTree(node.children || [], parentPath);
  }

  async function openSidebarFolderGraphView(node) {
    if (!node || node.kind !== "directory") return;
    if (isOpenFolderRootContextNode(node)) {
      await openGraphView();
      return;
    }
    if (tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
      return;
    }

    const folderFiles = await collectMarkdownFilesForSidebarFolder(node);
    if (!folderFiles.length) {
      alert("This folder does not contain Markdown files to graph.");
      return;
    }

    const folderName = getSidebarFolderGraphTitle(node);
    const graphSnapshot = await createGraphSnapshot(folderFiles, folderName);
    const graphTab = createGraphTab(folderName, { graphSnapshot, graphViewConfig: null });
    tabs.push(graphTab);
    switchTab(graphTab.id);
    saveTabsToStorage(tabs);
  }

  async function revealSidebarFolder(node) {
    const folderPath = getSidebarFolderFilesystemPath(node);
    if (!folderPath || !isNeutralinoRuntime() || !Neutralino.os?.open) {
      alert("Revealing folders is available only in the desktop app for folders opened from disk.");
      return;
    }
    await Neutralino.os.open(folderPath);
  }

  async function deleteSidebarFolder(node) {
    const folderPath = getSidebarFolderFilesystemPath(node);
    if (!folderPath || !isNeutralinoRuntime() || !Neutralino.filesystem?.remove) {
      alert("Deleting folders is available only in the desktop app for folders opened from disk.");
      return;
    }
    const confirmed = window.confirm(`Delete folder "${node.name}" and its contents from disk? This action cannot be undone.`);
    if (!confirmed) return;
    await Neutralino.filesystem.remove(folderPath);
    closeTabsForDeletedPath(folderPath, { kind: "folder" });
    if (isOpenFolderRootContextNode(node)) {
      closeFolderTree();
    } else {
      await reloadOpenFolderTree();
    }
  }

  function ensureSidebarFolderContextMenu() {
    if (sidebarFolderContextMenu) return sidebarFolderContextMenu;

    const menu = document.createElement("div");
    menu.className = "graph-context-menu sidebar-folder-context-menu hidden";

    const title = document.createElement("div");
    title.className = "graph-context-menu-title";
    const separator = document.createElement("div");
    separator.className = "graph-context-menu-separator";

    const showGraphBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.showGraphView.label,
      CONTEXT_MENU_ACTIONS.showGraphView.icon,
      "Open a graph view containing only Markdown files in this folder and its sub-folders."
    );
    const refreshFolderTreeBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.refresh.label,
      CONTEXT_MENU_ACTIONS.refresh.icon,
      "Reload the open folder tree from disk to show file system changes."
    );
    const revealFolderBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.label,
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.icon,
      "Open this folder in the system file explorer."
    );
    const copyPathBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyPath.label,
      CONTEXT_MENU_ACTIONS.copyPath.icon,
      "Copy this folder path to the clipboard."
    );
    const newFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.newFile.label,
      CONTEXT_MENU_ACTIONS.newFile.icon,
      "Create a new empty text file under this folder."
    );
    const newFolderBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.newFolder.label,
      CONTEXT_MENU_ACTIONS.newFolder.icon,
      "Create a new folder under this folder."
    );
    const renameFolderBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.rename.label,
      CONTEXT_MENU_ACTIONS.rename.icon,
      "Rename this folder on disk and refresh the folder tree."
    );
    const deleteFolderBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.deleteFolder.label,
      CONTEXT_MENU_ACTIONS.deleteFolder.icon,
      "Delete this folder and its contents from disk after confirmation."
    );
    const deleteFolderSeparator = document.createElement("div");
    deleteFolderSeparator.className = "graph-context-menu-separator";
    renameFolderBtn.dataset.sidebarFolderAction = "rename";
    deleteFolderBtn.dataset.sidebarFolderAction = "delete";
    deleteFolderSeparator.dataset.sidebarFolderAction = "delete";
    deleteFolderBtn.classList.add("graph-context-menu-item-danger");

    [
      title,
      separator,
      showGraphBtn,
      refreshFolderTreeBtn,
      revealFolderBtn,
      renameFolderBtn,
      copyPathBtn,
      newFileBtn,
      newFolderBtn,
      deleteFolderSeparator,
      deleteFolderBtn
    ].forEach((item) => menu.appendChild(item));
    document.body.appendChild(menu);

    refreshFolderTreeBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      hideSidebarFolderContextMenu();
      try {
        const refreshed = await reloadOpenFolderTree();
        if (!refreshed) {
          alert("Unable to refresh the folder tree because no reusable folder source is available. Please reopen the folder.");
        }
      } catch (error) {
        console.error("Failed to refresh folder tree:", error);
        alert("Unable to refresh the folder tree.");
      }
    });

    showGraphBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await openSidebarFolderGraphView(target);
      } catch (error) {
        console.error("Failed to open sidebar folder graph view:", error);
        alert("Unable to open a graph view for this folder.");
      }
    });

    newFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await createSidebarFileOnDisk(target);
      } catch (error) {
        console.error("Failed to create sidebar file:", error);
        alert("Unable to create a new file here.");
      }
    });

    newFolderBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await createSidebarFolderOnDisk(target);
      } catch (error) {
        console.error("Failed to create sidebar folder:", error);
        alert("Unable to create a new folder here.");
      }
    });

    revealFolderBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await revealSidebarFolder(target);
      } catch (error) {
        console.error("Failed to reveal sidebar folder:", error);
        alert("Unable to reveal this folder in the file explorer.");
      }
    });

    renameFolderBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await renameSidebarNodeOnDisk(target, "folder");
      } catch (error) {
        console.error("Failed to rename sidebar folder:", error);
        alert("Unable to rename this folder.");
      }
    });

    copyPathBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      if (!target) return;
      try {
        await copySidebarContextText(getSidebarFolderClipboardPath(target));
      } catch (error) {
        console.error("Failed to copy sidebar folder path:", error);
        alert("Unable to copy this folder path.");
      }
    });

    deleteFolderBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await deleteSidebarFolder(target);
      } catch (error) {
        console.error("Failed to delete sidebar folder:", error);
        alert("Unable to delete this folder.");
      }
    });

    document.addEventListener("click", hideSidebarContextMenus);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideSidebarContextMenus();
    });
    window.addEventListener("blur", hideSidebarContextMenus);

    sidebarFolderContextMenu = menu;
    return sidebarFolderContextMenu;
  }

  function showSidebarFileContextMenu(event, node) {
    if (!node || node.kind !== "file") return;
    event.preventDefault();
    event.stopPropagation();
    hideSidebarFolderContextMenu();
    sidebarContextTarget = node;
    const menu = ensureSidebarFileContextMenu();
    const title = menu.querySelector(".graph-context-menu-title");
    if (title) title.textContent = node.name || "File";
    menu.classList.remove("hidden");
    positionSidebarFileContextMenu(event);
  }

  function showSidebarFolderContextMenu(event, node) {
    if (!node || node.kind !== "directory") return;
    event.preventDefault();
    event.stopPropagation();
    hideSidebarFileContextMenu();
    sidebarContextTarget = node;
    const menu = ensureSidebarFolderContextMenu();
    const isRootContext = isOpenFolderRootContextNode(node);
    const title = menu.querySelector(".graph-context-menu-title");
    if (title) title.textContent = isRootContext ? (activeFolderName || "Folder") : (node.name || "Folder");
    menu.querySelectorAll('[data-sidebar-folder-action="rename"], [data-sidebar-folder-action="delete"]').forEach((item) => {
      item.classList.toggle("hidden", isRootContext);
    });
    menu.classList.remove("hidden");
    positionSidebarFolderContextMenu(event);
  }

  function ensureSidebarClosedFolderContextMenu() {
    if (sidebarClosedFolderContextMenu) return sidebarClosedFolderContextMenu;

    const menu = document.createElement("div");
    menu.className = "graph-context-menu sidebar-closed-folder-context-menu hidden";

    const openFolderBtn = createFileContextMenuButton(
      getOpenFolderActionLabel(),
      CONTEXT_MENU_ACTIONS.openFolder.icon,
      getOpenFolderActionTitle()
    );
    openFolderBtn.dataset.sidebarClosedFolderAction = "open-folder";

    menu.appendChild(openFolderBtn);
    document.body.appendChild(menu);

    openFolderBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      hideSidebarClosedFolderContextMenu();
      await openFolderTree(event);
    });

    document.addEventListener("click", hideSidebarContextMenus);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideSidebarContextMenus();
    });
    window.addEventListener("blur", hideSidebarContextMenus);

    sidebarClosedFolderContextMenu = menu;
    return sidebarClosedFolderContextMenu;
  }

  function showSidebarClosedFolderContextMenu(event) {
    if (isFolderOpen) return;
    event.preventDefault();
    event.stopPropagation();
    hideSidebarFileContextMenu();
    hideSidebarFolderContextMenu();
    const menu = ensureSidebarClosedFolderContextMenu();
    const openFolderBtn = menu.querySelector('[data-sidebar-closed-folder-action="open-folder"]');
    if (openFolderBtn) {
      const label = openFolderBtn.querySelector(".graph-context-menu-item-label");
      if (label) label.textContent = getOpenFolderActionLabel();
      openFolderBtn.dataset.tooltip = getOpenFolderActionTitle();
    }
    menu.classList.remove("hidden");
    positionSidebarClosedFolderContextMenu(event);
  }

  function handleFolderTreeRootContextMenu(event) {
    if (!folderTreeRoot) return;
    if (!isFolderOpen) {
      showSidebarClosedFolderContextMenu(event);
      return;
    }
    const targetElement = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (targetElement?.closest(".folder-tree-label, .folder-tree-file")) return;
    showSidebarFolderContextMenu(event, getOpenFolderRootContextNode());
  }

  const folderTreeAnimationTimers = new WeakMap();

  function getFolderTreeChildrenContainer(details) {
    return details.querySelector(":scope > .folder-tree-children");
  }

  function resetFolderTreeAnimation(details, childrenContainer) {
    const existingTimer = folderTreeAnimationTimers.get(details);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      folderTreeAnimationTimers.delete(details);
    }

    details.classList.remove("is-expanding", "is-collapsing");
    if (childrenContainer) {
      childrenContainer.style.height = "";
      childrenContainer.style.opacity = "";
    }
  }

  function finishFolderTreeAnimation(details, childrenContainer, shouldOpen) {
    details.open = shouldOpen;
    resetFolderTreeAnimation(details, childrenContainer);
  }

  function prefersReducedFolderTreeMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function toggleFolderTreeDetails(details) {
    const childrenContainer = getFolderTreeChildrenContainer(details);
    if (!childrenContainer || prefersReducedFolderTreeMotion()) {
      resetFolderTreeAnimation(details, childrenContainer);
      details.open = !details.open;
      updateFolderTreeExpandToggleButtons();
      return;
    }

    const shouldExpand = !details.open || details.classList.contains("is-collapsing");
    resetFolderTreeAnimation(details, childrenContainer);

    if (shouldExpand) {
      details.open = true;
      details.classList.add("is-expanding");
      childrenContainer.style.height = "0px";
      childrenContainer.style.opacity = "0";

      window.requestAnimationFrame(() => {
        childrenContainer.style.height = `${childrenContainer.scrollHeight}px`;
        childrenContainer.style.opacity = "1";
      });

      const timer = window.setTimeout(() => {
        finishFolderTreeAnimation(details, childrenContainer, true);
        updateFolderTreeExpandToggleButtons();
      }, 220);
      folderTreeAnimationTimers.set(details, timer);
      return;
    }

    details.classList.add("is-collapsing");
    childrenContainer.style.height = `${childrenContainer.scrollHeight}px`;
    childrenContainer.style.opacity = "1";

    window.requestAnimationFrame(() => {
      childrenContainer.style.height = "0px";
      childrenContainer.style.opacity = "0";
    });

    const timer = window.setTimeout(() => {
      finishFolderTreeAnimation(details, childrenContainer, false);
      updateFolderTreeExpandToggleButtons();
    }, 220);
    folderTreeAnimationTimers.set(details, timer);
  }

  function renderFolderTreeNode(node, parentPath = "") {
    const li = document.createElement("li");
    li.className = "folder-tree-item";
    if (node.kind === "directory") {
      const currentPath = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);
      node.path = currentPath;
      const details = document.createElement("details");
      details.open = true;
      const summary = document.createElement("summary");
      summary.className = "folder-tree-label";
      const icon = document.createElement("i");
      icon.className = "bi bi-folder";
      const label = document.createElement("span");
      label.textContent = node.name;
      summary.appendChild(icon);
      summary.appendChild(label);
      summary.addEventListener("click", (event) => {
        event.preventDefault();
        toggleFolderTreeDetails(details);
      });
      summary.addEventListener("contextmenu", (event) => showSidebarFolderContextMenu(event, node));
      details.appendChild(summary);

      const childrenContainer = document.createElement("div");
      childrenContainer.className = "folder-tree-children";
      const ul = document.createElement("ul");
      ul.className = "folder-tree-list";
      node.children.forEach((child) => ul.appendChild(renderFolderTreeNode(child, currentPath)));
      childrenContainer.appendChild(ul);
      details.appendChild(childrenContainer);
      li.appendChild(details);
      return li;
    }

    const button = document.createElement("button");
    let sidebarOpenClickTimer = null;
    const isGraphFile = isGraphFilePath(node.name);
    button.type = "button";
    button.className = "folder-tree-file" + (isGraphFile ? " folder-tree-graph-file" : "");
    button.title = isGraphFile ? "Click to open graph" : "Click to preview; double-click to keep open";
    button.dataset.name = node.name || "";
    button.dataset.path = node.path || "";
    button.dataset.fullPath = node.fullPath || "";
    button.innerHTML = `<i class="bi ${isGraphFile ? "bi-diagram-3" : "bi-file-earmark-text"}"></i><span>${node.name}</span>`;

    async function readSidebarFileContent() {
      if (typeof NL_VERSION !== "undefined" && node.fullPath) {
        // Desktop: read file via Neutralino filesystem
        return Neutralino.filesystem.readFile(node.fullPath);
      }

      // Browser: read file via File System Access API or upload fallback
      const file = node.file ? node.file : await node.handle.getFile();
      return file.text();
    }

    function getSidebarFileSource() {
      return {
        name: node.name,
        handle: node.handle || null,
        path: node.fullPath || node.path || null
      };
    }

    async function openSidebarFile(options) {
      try {
        const existingTab = findTabForSidebarFile(node);
        if (existingTab) {
          switchTab(existingTab.id);
          if (options && options.temporary === false) {
            pinTemporaryTab(existingTab.id);
          }
          rememberRecentFile(getSidebarFileSource());
          return;
        }

        const content = await readSidebarFileContent();
        const sourceFile = getSidebarFileSource();
        if (isGraphFile) {
          await openSavedGraphDocument({ ...sourceFile, content });
        } else {
          const title = getMarkdownTitleFromFileName(node.name);
          if (options && options.temporary === false) {
            openSidebarFileInPermanentTab(content, title, sourceFile);
          } else {
            openSidebarFileInTemporaryTab(content, title, sourceFile);
          }
        }
        rememberRecentFile(sourceFile);
      } catch (error) {
        console.error("Failed to open sidebar file:", error);
        alert("Unable to open selected file.");
      }
    }

    button.addEventListener("click", () => {
      window.clearTimeout(sidebarOpenClickTimer);
      sidebarOpenClickTimer = window.setTimeout(() => {
        openSidebarFile({ temporary: true });
      }, 200);
    });

    button.addEventListener("dblclick", (event) => {
      event.preventDefault();
      window.clearTimeout(sidebarOpenClickTimer);
      openSidebarFile({ temporary: false });
    });

    button.addEventListener("contextmenu", (event) => {
      window.clearTimeout(sidebarOpenClickTimer);
      showSidebarFileContextMenu(event, node);
    });

    li.appendChild(button);
    return li;
  }

  function findTabForSidebarFile(node) {
    if (!node || node.kind !== "file") return null;

    if (node.handle) {
      const handleMatch = tabs.find(function(tab) {
        return tab.sourceFileHandle === node.handle;
      });
      if (handleMatch) return handleMatch;
    }

    const nodePath = node.fullPath || node.path || null;
    if (nodePath) {
      const pathMatch = tabs.find(function(tab) {
        return tab.sourceFilePath === nodePath;
      });
      if (pathMatch) return pathMatch;
    }

    const title = isGraphFilePath(node.name) ? getGraphTitleFromFileName(node.name) : getMarkdownTitleFromFileName(node.name);
    return tabs.find(function(tab) {
      return tab.sourceFileName === node.name || tab.title === title;
    }) || null;
  }

  function buildTreeFromFileList(fileList) {
    const root = [];
    const ensureDir = (nodes, name) => {
      let dir = nodes.find((n) => n.kind === "directory" && n.name === name);
      if (!dir) {
        dir = { kind: "directory", name, children: [] };
        nodes.push(dir);
      }
      return dir;
    };

    Array.from(fileList).forEach((file) => {
      if (!isSidebarDocumentPath(file.name)) return;
      const relPath = (file.webkitRelativePath || file.name).split("/");
      const fileName = relPath.pop();
      let cursor = root;
      relPath.forEach((segment) => {
        cursor = ensureDir(cursor, segment).children;
      });
      const modifiedAt = Number(file?.lastModified || 0) || 0;
      cursor.push({ kind: "file", name: fileName, file, path: (file.webkitRelativePath || file.name), modifiedAt, createdAt: modifiedAt });
    });

    return sortFolderTreeNodes(root);
  }
  async function openFolderTree(event) {
  // Desktop app: use Neutralino native folder picker (no permission dialog)
  if (typeof NL_VERSION !== "undefined") {
    try {
      const selectedPath = await Neutralino.os.showFolderDialog("Select a folder");
      await openFolderTreeFromNeutralinoPath(selectedPath);
    } catch (error) {
      if (error && error.name === "AbortError") return;
      console.error("Neutralino folder picker error:", error);
    }
    return;
  }

  // Browser: use the read-only input by default to avoid Chrome/Edge's
  // unavoidable "view and copy files" permission prompt. Holding Alt opts into
  // File System Access handles for users who want in-place saves.
  if (shouldUseNativeDirectoryPicker(event)) {
    try {
      const dirHandle = await window.showDirectoryPicker();
      activeFolderName = dirHandle && dirHandle.name ? dirHandle.name : "Graph View";
      activeFolderHandle = dirHandle || null;
      activeFolderPath = null;
      const nodes = await listMarkdownTree(dirHandle);
      folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
      renderFolderTree(nodes);
      rememberRecentFolder({ name: activeFolderName, label: activeFolderName, handle: dirHandle });
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
      console.warn("Directory picker unavailable, using browser folder input.", error);
    }
  }

  if (folderInput) {
    if (!shownFolderInputFallbackNotice) {
      console.info(getFolderPickerFallbackMessage());
      shownFolderInputFallbackNotice = true;
    }
    folderInput.click();
  } else {
    alert("Folder selection is not supported in this environment.");
  }
}

  async function importDocumentFile(file) {
    try {
      await openDocumentSourceFile({
        name: file.name,
        file
      });
    } catch (error) {
      console.error("Failed to open file:", error);
      alert("Unable to open selected file: " + error.message);
    }
  }

  function isSidebarDropzoneVisible() {
    return !!sidebarDropzonePanel && sidebarDropzonePanel.style.display !== "none";
  }

  function updateDropzoneToggleButtons() {
    const isVisible = isSidebarDropzoneVisible();
    const label = isVisible ? "Hide Dropzone Panel" : "Show Dropzone Panel";
    const title = `${label}`;

    toggleDropzonePanelButtons.forEach(function(button) {
      const labelElement = button.querySelector(".dropzone-toggle-label");
      if (labelElement) {
        labelElement.textContent = label;
      } else {
        button.textContent = label;
      }
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-pressed", String(!isVisible));
    });
  }

  function hideSidebarDropzone() {
    if (dropzone) {
      dropzone.style.display = "none";
    }
    if (sidebarDropzonePanel) {
      if (sidebarDropzonePanel.style.flex && sidebarDropzonePanel.style.flex !== "0 0 0px") {
        sidebarDropzonePanel.dataset.previousFlex = sidebarDropzonePanel.style.flex;
      }
      sidebarDropzonePanel.style.display = "none";
      sidebarDropzonePanel.style.flex = "0 0 0px";
      sidebarDropzonePanel.style.padding = "0";
      sidebarDropzonePanel.style.minHeight = "0";
    }
    if (sidebarDropzoneResizer) {
      sidebarDropzoneResizer.style.display = "none";
      sidebarDropzoneResizer.style.flex = "0 0 0px";
    }
    updateDropzoneToggleButtons();
  }

  function showSidebarDropzone() {
    if (dropzone) {
      dropzone.style.display = "";
    }
    if (sidebarDropzonePanel) {
      sidebarDropzonePanel.style.display = "";
      sidebarDropzonePanel.style.flex = sidebarDropzonePanel.dataset.previousFlex || "";
      sidebarDropzonePanel.style.padding = "";
      sidebarDropzonePanel.style.minHeight = "";
    }
    if (sidebarDropzoneResizer) {
      sidebarDropzoneResizer.style.display = "";
      sidebarDropzoneResizer.style.flex = "";
    }
    updateDropzoneToggleButtons();
  }

  function toggleSidebarDropzone() {
    if (isSidebarDropzoneVisible()) {
      hideSidebarDropzone();
    } else {
      showSidebarDropzone();
    }
  }

  function isSidebarVisible() {
    return !!folderTreePane && !contentContainer.classList.contains("sidebar-hidden");
  }

  function updateSidebarToggleButtons() {
    const isVisible = isSidebarVisible();
    const label = isVisible ? "Hide Sidebar" : "Show Sidebar";

    toggleSidebarButtons.forEach(function(button) {
      const labelElement = button.querySelector(".sidebar-toggle-label");
      if (labelElement) {
        labelElement.textContent = label;
      } else {
        button.textContent = label;
      }
      button.title = label;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(!isVisible));
    });
  }

  function setSidebarVisible(isVisible, shouldPersist = true, shouldAnimate = shouldPersist) {
    if (!folderTreePane || !contentContainer) return;

    if (sidebarVisibilityAnimationTimer) {
      window.clearTimeout(sidebarVisibilityAnimationTimer);
      sidebarVisibilityAnimationTimer = null;
    }

    const shouldUseAnimation = shouldAnimate && !prefersReducedFolderTreeMotion();
    folderTreePane.hidden = false;

    if (isVisible) {
      if (shouldUseAnimation) {
        contentContainer.classList.add("sidebar-animating");
        window.requestAnimationFrame(() => {
          contentContainer.classList.remove("sidebar-hidden");
        });
        sidebarVisibilityAnimationTimer = window.setTimeout(() => {
          contentContainer.classList.remove("sidebar-animating");
          sidebarVisibilityAnimationTimer = null;
        }, SIDEBAR_VISIBILITY_ANIMATION_MS);
      } else {
        contentContainer.classList.remove("sidebar-hidden", "sidebar-animating");
      }
    } else if (shouldUseAnimation) {
      contentContainer.classList.add("sidebar-animating", "sidebar-hidden");
      sidebarVisibilityAnimationTimer = window.setTimeout(() => {
        folderTreePane.hidden = true;
        contentContainer.classList.remove("sidebar-animating");
        sidebarVisibilityAnimationTimer = null;
      }, SIDEBAR_VISIBILITY_ANIMATION_MS);
    } else {
      contentContainer.classList.add("sidebar-hidden");
      contentContainer.classList.remove("sidebar-animating");
      folderTreePane.hidden = true;
    }

    if (shouldPersist) {
      saveGlobalState({ sidebarVisible: isVisible });
    }

    updateSidebarToggleButtons();

    if (currentViewMode === 'split') {
      requestAnimationFrame(applyPaneWidths);
    }
  }

  function toggleSidebar() {
    setSidebarVisible(!isSidebarVisible());
  }

  function isFirefoxBrowser() {
    return /firefox\//i.test(navigator.userAgent || "");
  }

  function sanitizeMarkdownFileName(fileName) {
    const fallback = "document";
    let cleaned = String(fileName || fallback)
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ");
    cleaned = cleaned.replace(/^\.+$/, "") || fallback;
    if (!/\.(md|markdown)$/i.test(cleaned)) {
      cleaned += ".md";
    }
    return cleaned;
  }

  function getSuggestedMarkdownFileName(tab) {
    return sanitizeMarkdownFileName((tab && tab.title) || "document");
  }

  function joinPath(dirPath, fileName) {
    if (!dirPath) return fileName;
    return dirPath.replace(/[\\/]+$/, "") + "/" + fileName;
  }

  function updateTabAfterSave(tab, content, metadata) {
    const normalizedContent = normalizeEditorContent(content);
    tab.content = normalizedContent;
    tab.savedContent = normalizedContent;
    if (metadata) {
      if (metadata.name) {
        tab.sourceFileName = metadata.name;
        tab.title = getMarkdownTitleFromFileName(metadata.name);
      }
      if (metadata.handle) tab.sourceFileHandle = metadata.handle;
      if (metadata.path) tab.sourceFilePath = metadata.path;
    }
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
  }

  function getMarkdownTabContentForSave(tab) {
    if (!tab) return '';
    return normalizeEditorContent(tab.id === activeTabId ? markdownEditor.value : tab.content);
  }

  async function saveMarkdownTabToSource(tab) {
    if (!tab || tab.type === "graph" || (!tab.sourceFileHandle && !tab.sourceFilePath)) return false;

    try {
      const content = getMarkdownTabContentForSave(tab);
      if (tab.sourceFileHandle && typeof tab.sourceFileHandle.createWritable === "function") {
        const writable = await tab.sourceFileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        updateTabAfterSave(tab, content, {
          name: tab.sourceFileHandle.name || tab.sourceFileName,
          handle: tab.sourceFileHandle
        });
      } else if (typeof NL_VERSION !== "undefined" && tab.sourceFilePath) {
        await Neutralino.filesystem.writeFile(tab.sourceFilePath, content);
        updateTabAfterSave(tab, content, {
          name: getFileName(tab.sourceFilePath),
          path: tab.sourceFilePath
        });
      } else {
        return false;
      }
      return true;
    } catch (error) {
      console.error("Failed to save file to original location:", error);
      return false;
    }
  }

  async function saveMarkdownTabWithSaveDialog(tab) {
    if (!tab || tab.type === "graph") return false;

    const content = getMarkdownTabContentForSave(tab);
    const suggestedName = getSuggestedMarkdownFileName(tab);

    if (typeof NL_VERSION !== "undefined") {
      const defaultPath = activeFolderPath ? joinPath(activeFolderPath, suggestedName) : suggestedName;
      const selectedPath = await Neutralino.os.showSaveDialog("Save Markdown file", {
        defaultPath,
        filters: [
          { name: "Markdown files", extensions: ["md", "markdown"] }
        ]
      });
      if (!selectedPath) return false;
      const finalPath = /\.(md|markdown)$/i.test(selectedPath) ? selectedPath : selectedPath + ".md";
      await Neutralino.filesystem.writeFile(finalPath, content);
      updateTabAfterSave(tab, content, {
        name: getFileName(finalPath),
        path: finalPath
      });
      if (isPathInsideFolder(finalPath, activeFolderPath)) {
        await reloadOpenFolderTree();
      }
      return true;
    }

    if (typeof window.showSaveFilePicker === "function" && !isFirefoxBrowser()) {
      const pickerOptions = {
        suggestedName,
        types: [
          {
            description: "Markdown files",
            accept: {
              "text/markdown": [".md", ".markdown"],
              "text/plain": [".md", ".markdown"]
            }
          }
        ]
      };
      if (activeFolderHandle) {
        pickerOptions.startIn = activeFolderHandle;
      }
      const handle = await window.showSaveFilePicker(pickerOptions);
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      updateTabAfterSave(tab, content, {
        name: handle.name,
        handle
      });
      if (activeFolderHandle) {
        await reloadOpenFolderTree();
      }
      return true;
    }

    const blob = new Blob([content], {
      type: "text/markdown;charset=utf-8",
    });
    saveAs(blob, suggestedName);
    updateTabAfterSave(tab, content, {
      name: suggestedName
    });
    return true;
  }

  async function saveActiveTabWithSaveDialog() {
    const tab = getActiveMarkdownTab();
    return saveMarkdownTabWithSaveDialog(tab);
  }

  async function saveActiveTabToSource() {
    const tab = tabs.find(function(t) { return t.id === activeTabId; });
    return saveMarkdownTabToSource(tab);
  }

  function isMarkdownPath(path) {
    return /\.(md|markdown)$/i.test(path || "");
  }
  const MAX_GITHUB_FILES_SHOWN = 30;
  const GITHUB_IMPORT_MIN_REQUEST_INTERVAL_MS = 800;
  let lastGitHubImportRequestAt = 0;
  const selectedGitHubImportPaths = new Set();
  let availableGitHubImportPaths = [];

  function getFileName(path) {
    return (path || "").split(/[\\/]/).pop() || "document.md";
  }

  function buildRawGitHubUrl(owner, repo, ref, filePath) {
    const encodedPath = filePath
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${encodedPath}`;
  }

  async function fetchGitHubJson(url) {
    const now = Date.now();
    const waitTime = GITHUB_IMPORT_MIN_REQUEST_INTERVAL_MS - (now - lastGitHubImportRequestAt);
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    lastGitHubImportRequestAt = Date.now();
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json"
      }
    });
    if (!response.ok) {
      throw new Error(`GitHub API request failed (${response.status})`);
    }
    return response.json();
  }

  async function fetchTextContent(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file (${response.status})`);
    }
    return response.text();
  }

  function parseGitHubImportUrl(input) {
    let parsedUrl;
    try {
      parsedUrl = new URL((input || "").trim());
    } catch (_) {
      return null;
    }

    const host = parsedUrl.hostname.replace(/^www\./, "");
    const segments = parsedUrl.pathname.split("/").filter(Boolean);

    if (host === "raw.githubusercontent.com") {
      if (segments.length < 5) return null;
      const [owner, repo, ref, ...rest] = segments;
      const filePath = rest.join("/");
      return { owner, repo, ref, type: "file", filePath };
    }

    if (host !== "github.com" || segments.length < 2) return null;

    const owner = segments[0];
    const repo = segments[1].replace(/\.git$/i, "");
    if (segments.length === 2) {
      return { owner, repo, type: "repo" };
    }

    const mode = segments[2];
    if (mode === "blob" && segments.length >= 5) {
      return {
        owner,
        repo,
        type: "file",
        ref: segments[3],
        filePath: segments.slice(4).join("/")
      };
    }

    if (mode === "tree" && segments.length >= 4) {
      return {
        owner,
        repo,
        type: "tree",
        ref: segments[3],
        basePath: segments.slice(4).join("/")
      };
    }

    return { owner, repo, type: "repo" };
  }

  async function getDefaultBranch(owner, repo) {
    const repoInfo = await fetchGitHubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
    return repoInfo.default_branch;
  }

  async function listMarkdownFiles(owner, repo, ref, basePath) {
    const treeResponse = await fetchGitHubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
    const normalizedBasePath = (basePath || "").replace(/^\/+|\/+$/g, "");

    return (treeResponse.tree || [])
      .filter((entry) => entry.type === "blob" && isMarkdownPath(entry.path))
      .filter((entry) => !normalizedBasePath || entry.path === normalizedBasePath || entry.path.startsWith(normalizedBasePath + "/"))
      .map((entry) => entry.path)
      .sort((a, b) => a.localeCompare(b));
  }

  function buildMarkdownFileTree(paths) {
    const root = { folders: {}, files: [] };
    (paths || []).forEach((path) => {
      const segments = (path || "").split("/").filter(Boolean);
      if (!segments.length) return;
      const fileName = segments.pop();
      let node = root;
      segments.forEach((segment) => {
        if (!node.folders[segment]) {
          node.folders[segment] = { folders: {}, files: [] };
        }
        node = node.folders[segment];
      });
      node.files.push({ name: fileName, path });
    });
    return root;
  }

  function updateGitHubImportSelectedCount() {
    if (!githubImportSelectedCount) return;
    const count = selectedGitHubImportPaths.size;
    githubImportSelectedCount.textContent = `${count} selected`;
  }

  function updateGitHubSelectAllButtonLabel() {
    if (!githubImportSelectAllBtn) return;
    const total = availableGitHubImportPaths.length;
    const allSelected = total > 0 && selectedGitHubImportPaths.size === total;
    githubImportSelectAllBtn.textContent = allSelected ? "Clear All" : "Select All";
  }

  function syncGitHubSelectionToButtons() {
    if (!githubImportTree) return;
    Array.from(githubImportTree.querySelectorAll(".github-tree-file-btn")).forEach((btn) => {
      const isSelected = selectedGitHubImportPaths.has(btn.dataset.path);
      btn.classList.toggle("is-selected", isSelected);
      btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  }

  function setGitHubSelectedPaths(paths) {
    selectedGitHubImportPaths.clear();
    (paths || []).forEach((path) => selectedGitHubImportPaths.add(path));
    updateGitHubImportSelectedCount();
    syncGitHubSelectionToButtons();
    updateGitHubSelectAllButtonLabel();
  }

  function toggleGitHubSelectedPath(path) {
    if (!path) return;
    if (selectedGitHubImportPaths.has(path)) {
      selectedGitHubImportPaths.delete(path);
    } else {
      selectedGitHubImportPaths.add(path);
    }
    updateGitHubImportSelectedCount();
    syncGitHubSelectionToButtons();
    updateGitHubSelectAllButtonLabel();
  }

  function renderGitHubImportTree(paths) {
    if (!githubImportTree || !githubImportFileSelect) return;
    githubImportTree.innerHTML = "";
    const tree = buildMarkdownFileTree(paths);

    const createTreeBranch = function(node, parentPath) {
      const list = document.createElement("ul");
      const folderNames = Object.keys(node.folders).sort((a, b) => a.localeCompare(b));
      folderNames.forEach((folderName) => {
        const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;
        const item = document.createElement("li");
        const folderLabel = document.createElement("span");
        folderLabel.className = "github-tree-folder-label";
        folderLabel.textContent = `📁 ${folderName}`;
        item.appendChild(folderLabel);
        item.appendChild(createTreeBranch(node.folders[folderName], folderPath));
        list.appendChild(item);
      });

      node.files
        .sort((a, b) => a.path.localeCompare(b.path))
        .forEach((file) => {
          const fileItem = document.createElement("li");
          const fileButton = document.createElement("button");
          fileButton.type = "button";
          fileButton.className = "github-tree-file-btn";
          fileButton.dataset.path = file.path;
          fileButton.setAttribute("aria-pressed", "false");
          fileButton.textContent = `📄 ${file.name}`;
          fileButton.addEventListener("click", function() {
            toggleGitHubSelectedPath(file.path);
          });
          fileItem.appendChild(fileButton);
          list.appendChild(fileItem);
        });

      return list;
    };

    githubImportTree.appendChild(createTreeBranch(tree, ""));
    syncGitHubSelectionToButtons();
  }

  function setGitHubImportLoading(isLoading) {
    if (!githubImportSubmitBtn) return;
    if (isLoading) {
      githubImportSubmitBtn.dataset.loadingText = githubImportSubmitBtn.textContent;
      githubImportSubmitBtn.textContent = "Importing...";
    } else if (githubImportSubmitBtn.dataset.loadingText) {
      githubImportSubmitBtn.textContent = githubImportSubmitBtn.dataset.loadingText;
      delete githubImportSubmitBtn.dataset.loadingText;
    }
  }

  function setGitHubImportMessage(message, options = {}) {
    if (!githubImportError) return;
    const { isError = true } = options;
    githubImportError.classList.toggle("is-info", !isError);
    if (!message) {
      githubImportError.textContent = "";
      githubImportError.style.display = "none";
      return;
    }
    githubImportError.textContent = message;
    githubImportError.style.display = "block";
  }

  function resetGitHubImportModal() {
    if (!githubImportUrlInput || !githubImportFileSelect || !githubImportSubmitBtn) return;
    if (githubImportTitle) {
      githubImportTitle.textContent = "Import Markdown from GitHub";
    }
    githubImportUrlInput.value = "";
    githubImportUrlInput.style.display = "block";
    githubImportUrlInput.disabled = false;
    githubImportFileSelect.innerHTML = "";
    githubImportFileSelect.style.display = "none";
    githubImportFileSelect.disabled = false;
    if (githubImportSelectionToolbar) {
      githubImportSelectionToolbar.style.display = "none";
    }
    availableGitHubImportPaths = [];
    setGitHubSelectedPaths([]);
    if (githubImportTree) {
      githubImportTree.innerHTML = "";
      githubImportTree.style.display = "none";
    }
    githubImportSubmitBtn.dataset.step = "url";
    delete githubImportSubmitBtn.dataset.owner;
    delete githubImportSubmitBtn.dataset.repo;
    delete githubImportSubmitBtn.dataset.ref;
    githubImportSubmitBtn.textContent = "Import";
    setGitHubImportMessage("");
  }

  function openGitHubImportModal() {
    if (!githubImportModal || !githubImportUrlInput || !githubImportSubmitBtn) return;
    resetGitHubImportModal();
    githubImportModal.style.display = "flex";
    githubImportUrlInput.focus();
  }

  function closeGitHubImportModal() {
    if (!githubImportModal) return;
    githubImportModal.style.display = "none";
    resetGitHubImportModal();
  }

  async function handleGitHubImportSubmit() {
    if (!githubImportSubmitBtn || !githubImportUrlInput || !githubImportFileSelect) return;
    const setGitHubImportDialogDisabled = (disabled) => {
      githubImportSubmitBtn.disabled = disabled;
      if (githubImportCancelBtn) {
        githubImportCancelBtn.disabled = disabled;
      }
      if (githubImportSelectAllBtn) {
        githubImportSelectAllBtn.disabled = disabled;
      }
    };
    const step = githubImportSubmitBtn.dataset.step || "url";
    if (step === "select") {
      const selectedPaths = Array.from(selectedGitHubImportPaths);
      const owner = githubImportSubmitBtn.dataset.owner;
      const repo = githubImportSubmitBtn.dataset.repo;
      const ref = githubImportSubmitBtn.dataset.ref;
      if (!owner || !repo || !ref || !selectedPaths.length) {
        setGitHubImportMessage("Please select at least one file to import.");
        return;
      }
      setGitHubImportLoading(true);
      setGitHubImportDialogDisabled(true);
      try {
        for (const selectedPath of selectedPaths) {
          const markdown = await fetchTextContent(buildRawGitHubUrl(owner, repo, ref, selectedPath));
          newTab(markdown, getFileName(selectedPath).replace(/\.(md|markdown)$/i, ""));
        }
        closeGitHubImportModal();
      } catch (error) {
        console.error("GitHub import failed:", error);
        setGitHubImportMessage("GitHub import failed: " + error.message);
      } finally {
        setGitHubImportDialogDisabled(false);
        setGitHubImportLoading(false);
      }
      return;
    }

    const urlInput = githubImportUrlInput.value.trim();
    if (!urlInput) {
      setGitHubImportMessage("Please enter a GitHub URL.");
      return;
    }

    const parsed = parseGitHubImportUrl(urlInput);
    if (!parsed || !parsed.owner || !parsed.repo) {
      setGitHubImportMessage("Please enter a valid GitHub URL.");
      return;
    }

    setGitHubImportMessage("");
    setGitHubImportLoading(true);
    setGitHubImportDialogDisabled(true);
    try {
      if (parsed.type === "file") {
        if (!isMarkdownPath(parsed.filePath)) {
          throw new Error("The provided URL does not point to a Markdown file.");
        }
        const markdown = await fetchTextContent(buildRawGitHubUrl(parsed.owner, parsed.repo, parsed.ref, parsed.filePath));
        newTab(markdown, getFileName(parsed.filePath).replace(/\.(md|markdown)$/i, ""));
        closeGitHubImportModal();
        return;
      }

      const ref = parsed.ref || await getDefaultBranch(parsed.owner, parsed.repo);
      const files = await listMarkdownFiles(parsed.owner, parsed.repo, ref, parsed.basePath || "");

      if (!files.length) {
        setGitHubImportMessage("No Markdown files were found at that GitHub location.");
        return;
      }

      const shownFiles = files.slice(0, MAX_GITHUB_FILES_SHOWN);
      if (files.length === 1) {
        const targetPath = files[0];
        const markdown = await fetchTextContent(buildRawGitHubUrl(parsed.owner, parsed.repo, ref, targetPath));
        newTab(markdown, getFileName(targetPath).replace(/\.(md|markdown)$/i, ""));
        closeGitHubImportModal();
        return;
      }

      githubImportFileSelect.innerHTML = "";
      githubImportUrlInput.style.display = "none";
      githubImportFileSelect.style.display = "none";
      if (githubImportSelectionToolbar) {
        githubImportSelectionToolbar.style.display = "flex";
      }
      if (githubImportTree) {
        githubImportTree.style.display = "block";
      }
      shownFiles.forEach((filePath) => {
        const option = document.createElement("option");
        option.value = filePath;
        option.textContent = filePath;
        githubImportFileSelect.appendChild(option);
      });
      availableGitHubImportPaths = shownFiles.slice();
      setGitHubSelectedPaths(shownFiles[0] ? [shownFiles[0]] : []);
      renderGitHubImportTree(shownFiles);
      if (files.length > MAX_GITHUB_FILES_SHOWN) {
        setGitHubImportMessage(`Showing first ${MAX_GITHUB_FILES_SHOWN} of ${files.length} Markdown files.`, { isError: false });
      } else {
        setGitHubImportMessage("");
      }
      if (githubImportTitle) {
        githubImportTitle.textContent = "Select Markdown file(s) to import";
      }
      githubImportSubmitBtn.dataset.step = "select";
      githubImportSubmitBtn.dataset.owner = parsed.owner;
      githubImportSubmitBtn.dataset.repo = parsed.repo;
      githubImportSubmitBtn.dataset.ref = ref;
      githubImportSubmitBtn.textContent = "Import Selected";
    } catch (error) {
      console.error("GitHub import failed:", error);
      setGitHubImportMessage("GitHub import failed: " + error.message);
    } finally {
      setGitHubImportDialogDisabled(false);
      setGitHubImportLoading(false);
    }
  }

  function processEmojis(element) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      let parent = node.parentNode;
      let isInCode = false;
      while (parent && parent !== element) {
        if (parent.tagName === 'PRE' || parent.tagName === 'CODE') {
          isInCode = true;
          break;
        }
        parent = parent.parentNode;
      }
      
      if (!isInCode && node.nodeValue.includes(':')) {
        textNodes.push(node);
      }
    }
    
    textNodes.forEach(textNode => {
      const text = textNode.nodeValue;
      const emojiRegex = /:([\w+-]+):/g;
      
      let match;
      let lastIndex = 0;
      let result = '';
      let hasEmoji = false;
      
      while ((match = emojiRegex.exec(text)) !== null) {
        const shortcode = match[1];
        const emoji = joypixels.shortnameToUnicode(`:${shortcode}:`);
        
        if (emoji !== `:${shortcode}:`) { // If conversion was successful
          hasEmoji = true;
          result += text.substring(lastIndex, match.index) + emoji;
          lastIndex = emojiRegex.lastIndex;
        } else {
          result += text.substring(lastIndex, emojiRegex.lastIndex);
          lastIndex = emojiRegex.lastIndex;
        }
      }
      
      if (hasEmoji) {
        result += text.substring(lastIndex);
        const span = document.createElement('span');
        span.innerHTML = result;
        textNode.parentNode.replaceChild(span, textNode);
      }
    });
  }

  function debouncedRender() {
    clearTimeout(markdownRenderTimeout);
    markdownRenderTimeout = setTimeout(renderMarkdown, RENDER_DELAY);
  }

  function updateDocumentStats() {
    const text = markdownEditor.value;

    const charCount = text.length;
    charCountElement.textContent = charCount.toLocaleString();

    const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
    wordCountElement.textContent = wordCount.toLocaleString();

    const readingTimeMinutes = Math.ceil(wordCount / 200);
    readingTimeElement.textContent = readingTimeMinutes;
  }

  function syncEditorToPreview() {
    if (!syncScrollingEnabled || isPreviewScrolling) return;

    isEditorScrolling = true;
    clearTimeout(scrollSyncTimeout);

    scrollSyncTimeout = setTimeout(() => {
      const editorScrollRatio =
        editorPane.scrollTop /
        (editorPane.scrollHeight - editorPane.clientHeight);
      const previewScrollPosition =
        (previewPane.scrollHeight - previewPane.clientHeight) *
        editorScrollRatio;

      if (!isNaN(previewScrollPosition) && isFinite(previewScrollPosition)) {
        previewPane.scrollTop = previewScrollPosition;
      }

      setTimeout(() => {
        isEditorScrolling = false;
      }, 50);
    }, SCROLL_SYNC_DELAY);
  }

  function syncPreviewToEditor() {
    if (!syncScrollingEnabled || isEditorScrolling) return;

    isPreviewScrolling = true;
    clearTimeout(scrollSyncTimeout);

    scrollSyncTimeout = setTimeout(() => {
      const previewScrollRatio =
        previewPane.scrollTop /
        (previewPane.scrollHeight - previewPane.clientHeight);
      const editorScrollPosition =
        (editorPane.scrollHeight - editorPane.clientHeight) *
        previewScrollRatio;

      if (!isNaN(editorScrollPosition) && isFinite(editorScrollPosition)) {
        editorPane.scrollTop = editorScrollPosition;
      }

      setTimeout(() => {
        isPreviewScrolling = false;
      }, 50);
    }, SCROLL_SYNC_DELAY);
  }

  function updateSyncToggleButtons() {
    syncToggleButtons.forEach((button) => {
      if (syncScrollingEnabled) {
        button.innerHTML = '<i class="bi bi-link-45deg"></i> <span>Sync Off</span>';
        button.classList.add("sync-disabled");
        button.classList.remove("sync-enabled");
        button.classList.add("border-primary");
        button.setAttribute("aria-label", "Turn sync scrolling off");
      } else {
        button.innerHTML = '<i class="bi bi-link"></i> <span>Sync On</span>';
        button.classList.add("sync-enabled");
        button.classList.remove("sync-disabled");
        button.classList.remove("border-primary");
        button.setAttribute("aria-label", "Turn sync scrolling on");
      }
    });
  }

  function toggleSyncScrolling() {
    syncScrollingEnabled = !syncScrollingEnabled;
    updateSyncToggleButtons();
    saveGlobalState({ syncScrollingEnabled });
  }

  // View Mode Functions - Story 1.1 & 1.2
  function setViewMode(mode) {
    if (mode === currentViewMode) return;

    const previousMode = currentViewMode;
    currentViewMode = mode;

    // Update content container class
    contentContainer.classList.remove('view-editor-only', 'view-preview-only', 'view-split');
    contentContainer.classList.add('view-' + (mode === 'editor' ? 'editor-only' : mode === 'preview' ? 'preview-only' : 'split'));

    // Update button active states (desktop)
    viewModeButtons.forEach(btn => {
      const btnMode = btn.getAttribute('data-mode');
      if (btnMode === mode) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
      }
    });

    // Story 1.4: Update mobile button active states
    mobileViewModeButtons.forEach(btn => {
      const btnMode = btn.getAttribute('data-mode');
      if (btnMode === mode) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
      }
    });

    // Story 1.2: Show/hide sync toggle based on view mode
    updateSyncToggleVisibility(mode);

    // Story 1.3: Handle pane widths when switching modes
    if (mode === 'split') {
      // Restore preserved pane widths when entering split mode
      applyPaneWidths();
    } else {
      // Reset inline pane widths when not in split mode
      resetPaneWidths();
    }

    // Re-render markdown when switching to a view that includes preview
    if (mode === 'split' || mode === 'preview') {
      renderMarkdown();
    } else {
      scheduleEditorLineNumbersUpdate();
    }
  }

  // Story 1.2: Update sync toggle visibility
  function updateSyncToggleVisibility(mode) {
    const isSplitView = mode === 'split';

    syncToggleButtons.forEach((button) => {
      button.style.display = isSplitView ? '' : 'none';
      button.setAttribute('aria-hidden', !isSplitView);
    });
  }

  // Story 1.3: Resize Divider Functions
  function initResizer() {
    if (!resizeDivider) return;

    resizeDivider.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    window.addEventListener('resize', applyPaneWidths);

    // Touch support for tablets (though disabled via CSS, keeping for future)
    resizeDivider.addEventListener('touchstart', startResizeTouch);
    document.addEventListener('touchmove', handleResizeTouch);
    document.addEventListener('touchend', stopResize);

    if (sidebarDropzoneResizer) {
      sidebarDropzoneResizer.addEventListener('mousedown', startSidebarDropzoneResize);
      document.addEventListener('mousemove', handleSidebarDropzoneResize);
      document.addEventListener('mouseup', stopSidebarDropzoneResize);
    }
  }

  function startSidebarDropzoneResize(e) {
    if (!folderTreePane || !sidebarDropzonePanel) return;
    e.preventDefault();
    isSidebarDropzoneResizing = true;
    document.body.classList.add('resizing');
  }

  function handleSidebarDropzoneResize(e) {
    if (!isSidebarDropzoneResizing || !folderTreePane || !sidebarDropzonePanel) return;
    const paneRect = folderTreePane.getBoundingClientRect();
    const resizerHeight = sidebarDropzoneResizer ? sidebarDropzoneResizer.offsetHeight : 0;
    const newDropzoneHeight = paneRect.bottom - e.clientY;
    const maxDropzoneHeight = paneRect.height - MIN_SIDEBAR_PANEL_HEIGHT - resizerHeight;
    const clampedHeight = Math.max(MIN_SIDEBAR_PANEL_HEIGHT, Math.min(maxDropzoneHeight, newDropzoneHeight));
    sidebarDropzonePanel.style.flex = `0 0 ${clampedHeight}px`;
  }

  function stopSidebarDropzoneResize() {
    if (!isSidebarDropzoneResizing) return;
    isSidebarDropzoneResizing = false;
    document.body.classList.remove('resizing');
  }

  function startResize(e) {
    if (currentViewMode !== 'split') return;
    e.preventDefault();
    isResizing = true;
    resizePointerOffset = getResizePointerOffset(e.clientX);
    resizeDivider.classList.add('dragging');
    document.body.classList.add('resizing');
  }

  function startResizeTouch(e) {
    if (currentViewMode !== 'split' || !e.touches[0]) return;
    e.preventDefault();
    isResizing = true;
    resizePointerOffset = getResizePointerOffset(e.touches[0].clientX);
    resizeDivider.classList.add('dragging');
    document.body.classList.add('resizing');
  }

  function getResizePointerOffset(clientX) {
    const dividerRect = resizeDivider.getBoundingClientRect();
    return clientX - dividerRect.left;
  }

  function getSplitResizeMetrics() {
    const editorRect = editorPaneElement.getBoundingClientRect();
    const containerRect = contentContainer.getBoundingClientRect();
    const dividerWidth = resizeDivider.getBoundingClientRect().width;

    return {
      left: editorRect.left,
      width: containerRect.right - editorRect.left,
      dividerWidth,
      dividerMidpoint: dividerWidth / 2,
    };
  }

  function updateResizePosition(clientX) {
    const resizeMetrics = getSplitResizeMetrics();
    if (resizeMetrics.width <= 0) return;

    const dividerLeft = clientX - resizePointerOffset - resizeMetrics.left;
    let newEditorPercent = ((dividerLeft + resizeMetrics.dividerMidpoint) / resizeMetrics.width) * 100;
    newEditorPercent = Math.max(MIN_PANE_PERCENT, Math.min(100 - MIN_PANE_PERCENT, newEditorPercent));

    editorWidthPercent = newEditorPercent;
    applyPaneWidths();
    scheduleEditorLineNumbersUpdate();
  }

  function handleResize(e) {
    if (!isResizing) return;
    updateResizePosition(e.clientX);
  }

  function handleResizeTouch(e) {
    if (!isResizing || !e.touches[0]) return;
    updateResizePosition(e.touches[0].clientX);
  }

  function stopResize() {
    if (!isResizing) return;
    isResizing = false;
    resizeDivider.classList.remove('dragging');
    document.body.classList.remove('resizing');
  }

  function applyPaneWidths() {
    if (currentViewMode !== 'split') return;

    const resizeMetrics = getSplitResizeMetrics();
    if (resizeMetrics.width <= resizeMetrics.dividerWidth) return;

    const editorBasis = (resizeMetrics.width * editorWidthPercent / 100) - resizeMetrics.dividerMidpoint;
    const previewBasis = resizeMetrics.width - resizeMetrics.dividerWidth - editorBasis;

    editorPaneElement.style.flex = `0 0 ${editorBasis}px`;
    previewPaneElement.style.flex = `0 0 ${previewBasis}px`;
    scheduleEditorLineNumbersUpdate();
  }

  function resetPaneWidths() {
    editorPaneElement.style.flex = '';
    previewPaneElement.style.flex = '';
    scheduleEditorLineNumbersUpdate();
  }

  function openMobileMenu() {
    mobileMenuPanel.classList.add("active");
    mobileMenuOverlay.classList.add("active");
  }
  function closeMobileMenu() {
    mobileMenuPanel.classList.remove("active");
    mobileMenuOverlay.classList.remove("active");
  }
  mobileMenuToggle.addEventListener("click", openMobileMenu);
  mobileCloseMenu.addEventListener("click", closeMobileMenu);
  mobileMenuOverlay.addEventListener("click", closeMobileMenu);

  function updateMobileStats() {
    if (mobileCharCount) mobileCharCount.textContent = charCountElement.textContent;
    if (mobileWordCount) mobileWordCount.textContent = wordCountElement.textContent;
    if (mobileReadingTime) mobileReadingTime.textContent = readingTimeElement.textContent;
  }

  const origUpdateStats = updateDocumentStats;
  updateDocumentStats = function() {
    origUpdateStats();
    updateMobileStats();
    updateStatusLine();
  };

  mobileImportBtn.addEventListener("click", () => openDocumentFileFromPicker());
  mobileImportGithubBtn.addEventListener("click", () => {
    closeMobileMenu();
    openGitHubImportModal();
  });
  mobileExportMd.addEventListener("click", () => exportMd.click());
  mobileExportHtml.addEventListener("click", () => exportHtml.click());
  mobileExportPdf.addEventListener("click", () => exportPdf.click());
  mobileCopyMarkdown.addEventListener("click", () => copyMarkdownButton.click());
  mobileThemeToggle.addEventListener("click", () => {
    themeToggle.click();
  });

  const mobileNewTabBtn = document.getElementById("mobile-new-tab-btn");
  if (mobileNewTabBtn) {
    mobileNewTabBtn.addEventListener("click", function() {
      newTab();
      closeMobileMenu();
    });
  }

  const mobileTabResetBtn = document.getElementById("mobile-tab-reset-btn");
  if (mobileTabResetBtn) {
    mobileTabResetBtn.addEventListener("click", function() {
      closeMobileMenu();
      resetAllTabs();
    });
  }
  
  initTabs();
  if (loadGlobalState().syncScrollingEnabled === false) toggleSyncScrolling();
  updateSyncToggleButtons();
  updateMobileStats();
  updateStatusLine();
  updateEditorLineNumbers();

  // Initialize resizer - Story 1.3
  initResizer();

  // View Mode Button Event Listeners - Story 1.1
  viewModeButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const mode = this.getAttribute('data-mode');
      setViewMode(mode);
      saveCurrentTabState();
    });
  });

  // Story 1.4: Mobile View Mode Button Event Listeners
  mobileViewModeButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const mode = this.getAttribute('data-mode');
      setViewMode(mode);
      saveCurrentTabState();
      closeMobileMenu();
    });
  });

  markdownEditor.addEventListener("input", function() {
    renderLinkAutocomplete();
    updateEditorLineNumbers();
    updateEditorSelectionHighlights();
    updateStatusLine();
    const activeTab = tabs.find(function(t) { return t.id === activeTabId; });
    if (activeTab) {
      activeTab.content = markdownEditor.value;
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
    }
    debouncedRender();
    clearTimeout(saveTabStateTimeout);
    saveTabStateTimeout = setTimeout(saveCurrentTabState, 500);
  });
  
  // Tab key handler to insert indentation instead of moving focus
  markdownEditor.addEventListener("keydown", function(e) {
    if (handleLinkAutocompleteKeydown(e)) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      
      const start = this.selectionStart;
      const end = this.selectionEnd;
      const value = this.value;
      
      // Insert 2 spaces
      const indent = '  '; // 2 spaces
      
      // Update textarea value
      this.value = value.substring(0, start) + indent + value.substring(end);
      
      // Update cursor position
      this.selectionStart = this.selectionEnd = start + indent.length;
      
      // Trigger input event to update preview
      this.dispatchEvent(new Event('input'));
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
    }
  });
  
  ["click", "keyup", "select"].forEach(function(eventName) {
    markdownEditor.addEventListener(eventName, function() {
      renderLinkAutocomplete();
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
    });
  });
  markdownEditor.addEventListener("focus", function() {
    renderLinkAutocomplete();
    updateEditorLineNumbers();
    updateEditorSelectionHighlights();
    updateStatusLine();
  });
  markdownEditor.addEventListener("blur", function() {
    window.setTimeout(function() {
      if (!linkAutocompleteLayer || !linkAutocompleteLayer.matches(":hover")) hideLinkAutocomplete();
      updateEditorSelectionHighlights();
      updateStatusLine();
    }, 0);
  });
  document.addEventListener("selectionchange", function() {
    if (document.activeElement === markdownEditor) {
      updateEditorLineNumbers();
      updateEditorSelectionHighlights();
      updateStatusLine();
    }
  });
  markdownEditor.addEventListener("scroll", function() {
    positionLinkAutocompleteLayer();
    syncEditorLineNumberScroll();
    syncEditorSelectionHighlightsScroll();
  });
  window.addEventListener("resize", positionLinkAutocompleteLayer);

  if (typeof ResizeObserver !== "undefined") {
    const editorLineNumberResizeObserver = new ResizeObserver(scheduleEditorLineNumbersUpdate);
    editorLineNumberResizeObserver.observe(markdownEditor);
  } else {
    window.addEventListener("resize", scheduleEditorLineNumbersUpdate);
  }

  editorPane.addEventListener("scroll", syncEditorToPreview);
  previewPane.addEventListener("scroll", syncPreviewToEditor);
  syncToggleButtons.forEach((button) => {
    button.addEventListener("click", toggleSyncScrolling);
  });
  themeToggle.addEventListener("click", function () {
    const theme =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    saveGlobalState({ theme });

    updateThemeButtonLabels(theme);
    
    renderMarkdown();
  });

  importFromFileButtons.forEach(function(button) {
    button.addEventListener("click", function (e) {
      e.preventDefault();
      openDocumentFileFromPicker();
    });
  });

  newDocumentButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      newTab();
      if (button.classList.contains("mobile-menu-item")) {
        closeMobileMenu();
      }
    });
  });

  document.querySelectorAll("#import-from-folder").forEach(function(button) {
    button.addEventListener("click", function (e) {
      e.preventDefault();
      openFolderTree(e);
    });
  });

  document.querySelectorAll(".close-folder-button").forEach((button) => {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      closeFolderTree();
    });
  });
  updateCloseFolderButtons();
  if (folderTreeRoot) {
    folderTreeRoot.addEventListener("contextmenu", handleFolderTreeRootContextMenu);
  }

  if (importFromGithubButton) {
    importFromGithubButton.addEventListener("click", function (e) {
      e.preventDefault();
      openGitHubImportModal();
    });
  }

  if (githubImportSubmitBtn) {
    githubImportSubmitBtn.addEventListener("click", handleGitHubImportSubmit);
  }
  if (githubImportCancelBtn) {
    githubImportCancelBtn.addEventListener("click", closeGitHubImportModal);
  }
  const handleGitHubImportInputKeydown = function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleGitHubImportSubmit();
    } else if (e.key === "Escape") {
      closeGitHubImportModal();
    }
  };
  if (githubImportUrlInput) {
    githubImportUrlInput.addEventListener("keydown", handleGitHubImportInputKeydown);
  }
  if (githubImportFileSelect) {
    githubImportFileSelect.addEventListener("keydown", handleGitHubImportInputKeydown);
  }
  if (githubImportSelectAllBtn) {
    githubImportSelectAllBtn.addEventListener("click", function() {
      const allPaths = availableGitHubImportPaths.slice();
      const shouldSelectAll = selectedGitHubImportPaths.size !== allPaths.length;
      setGitHubSelectedPaths(shouldSelectAll ? allPaths : []);
    });
  }

  setTimeout(() => {
    const pane = document.getElementById("folder-tree-pane");
    if (!pane) {
      console.warn("[FolderTree] pane element not found in DOM.");
      return;
    }
    const rect = pane.getBoundingClientRect();
    const style = window.getComputedStyle(pane);
    console.error("[FolderTree] pane layout", {
      rect: { width: rect.width, left: rect.left, right: rect.right },
      display: style.display,
      visibility: style.visibility,
      flex: style.flex,
      minWidth: style.minWidth
    });
  }, 0);

  fileInput.addEventListener("change", async function (e) {
    const file = e.target.files[0];
    if (file) {
      await importDocumentFile(file);
    }
    this.value = "";
  });



  if (folderInput) {
    folderInput.addEventListener("change", async function(e) {
      const files = e.target.files;
      const firstRelativePath = Array.from(files || []).find((file) => file.webkitRelativePath)?.webkitRelativePath || "";
      activeFolderName = firstRelativePath.split("/")[0] || "Graph View";
      activeFolderHandle = null;
      activeFolderPath = null;
      const nodes = buildTreeFromFileList(files || []);
      folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
      renderFolderTree(nodes);
      rememberRecentFolder({ name: activeFolderName, label: activeFolderName });
      this.value = "";
    });
  }

  function normalizeGraphNodeName(path) {
    return (path || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .replace(/\.(md|markdown)$/i, "")
      .replace(/\/+/g, "/")
      .toLowerCase();
  }

  function getGraphDisplayLabel(path) {
    const normalized = (path || "").replace(/\\/g, "/").replace(/\/+/g, "/");
    const fileName = normalized.split("/").pop() || normalized;
    return fileName.replace(/\.(md|markdown)$/i, "") || fileName;
  }

  function getGraphContextMenuTitle(node) {
    const source = node?.fullPath || node?.label || node?.id || "";
    const normalized = String(source).replace(/\\/g, "/").replace(/\/+/g, "/");
    const fileName = normalized.split("/").pop() || normalized || "Untitled";
    return fileName.replace(/\.[^/.]+$/, "") || fileName;
  }

  function resolveGraphTargetId(reference, sourcePath, nodeIndex) {
    const ref = (reference || "").trim();
    if (!ref) return null;
    if (/^(https?:)?\/\//i.test(ref)) return null;

    const cleanedRef = ref
      .replace(/^\.\//, "")
      .replace(/^\/+/, "")
      .replace(/\\/g, "/");

    const sourceDir = (sourcePath || "").split("/").slice(0, -1).join("/");
    const relativeCandidate = normalizeGraphNodeName(sourceDir ? `${sourceDir}/${cleanedRef}` : cleanedRef);
    if (nodeIndex.has(relativeCandidate)) return relativeCandidate;

    const directCandidate = normalizeGraphNodeName(cleanedRef);
    if (nodeIndex.has(directCandidate)) return directCandidate;

    const basenameCandidate = normalizeGraphNodeName(cleanedRef.split("/").pop() || "");
    if (!basenameCandidate) return null;

    const suffixMatches = Array.from(nodeIndex.keys()).filter((id) =>
      id === basenameCandidate || id.endsWith(`/${basenameCandidate}`)
    );

    if (suffixMatches.length === 1) return suffixMatches[0];
    return null;
  }

  function stripMarkdownCodeForLinkExtraction(markdown) {
    return String(markdown || "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/~~~[\s\S]*?~~~/g, "")
      .replace(/`[^`\n]*`/g, "");
  }

  function getMarkdownLinkTarget(rawDestination) {
    const destination = String(rawDestination || "").trim();
    if (!destination) return "";

    const angleMatch = destination.match(/^<([^>]+)>/);
    if (angleMatch) return angleMatch[1].trim();

    const titleSeparatorMatch = destination.match(/^(\S+)(?:\s+["'(].*)?$/);
    return (titleSeparatorMatch ? titleSeparatorMatch[1] : destination).trim();
  }

  function normalizeExtractedLinkTarget(link) {
    const target = String(link || "").split("#")[0].split("?")[0].trim();
    if (!target || isExternalOrSpecialLinkTarget(target)) return "";

    try {
      return decodeURIComponent(target);
    } catch (_error) {
      return target;
    }
  }

  function extractMarkdownLinks(markdown) {
    const links = [];
    const searchableMarkdown = stripMarkdownCodeForLinkExtraction(markdown);
    const mdLinkRegex = /\[[^\]\n]*?\]\(([^)]+)\)/g;
    const wikiLinkRegex = /\[\[([^\]\n]+)\]\]/g;
    let match;

    while ((match = mdLinkRegex.exec(searchableMarkdown)) !== null) {
      if (searchableMarkdown[match.index - 1] !== "!") {
        links.push(getMarkdownLinkTarget(match[1]));
      }
    }

    while ((match = wikiLinkRegex.exec(searchableMarkdown)) !== null) {
      links.push(getWikiLinkParts(match[1]).target);
    }

    return links.map(normalizeExtractedLinkTarget).filter(Boolean);
  }

  async function openGraphView() {
    if (!folderMarkdownFiles.length) {
      alert("Open a folder first to build the graph view.");
      return;
    }
    if (tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
      return;
    }

    const folderName = activeFolderName || "Graph View";
    const graphTab = createGraphTab(folderName, { graphViewConfig: null });
    tabs.push(graphTab);
    switchTab(graphTab.id);
    saveTabsToStorage(tabs);
  }


  function getActiveGraphSaveContent(graphTab) {
    const cachedRender = graphRenderCache.get(graphTab.id);
    if (cachedRender?.nodes) {
      captureGraphLayout(graphTab, cachedRender.nodes, cachedRender.getZoomTransform?.());
    }
    syncGraphTabDocument(graphTab);
    const graphDocument = serializeGraphTab(graphTab);
    return JSON.stringify(graphDocument, null, 2);
  }

  function updateGraphTabAfterSave(tab, metadata) {
    if (!tab) return;
    if (metadata) {
      if (metadata.name) {
        tab.sourceFileName = metadata.name;
        tab.title = getGraphTitleFromFileName(metadata.name) || metadata.name;
      }
      if (metadata.handle) tab.sourceFileHandle = metadata.handle;
      if (metadata.path) tab.sourceFilePath = metadata.path;
    }
    syncGraphTabDocument(tab);
    clearGraphTabUnsavedChanges(tab);
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
  }

  async function saveGraphTabToSource(graphTab) {
    if (!graphTab || (!graphTab.sourceFileHandle && !graphTab.sourceFilePath)) return false;

    try {
      const content = getActiveGraphSaveContent(graphTab);
      if (graphTab.sourceFileHandle && typeof graphTab.sourceFileHandle.createWritable === "function") {
        const writable = await graphTab.sourceFileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        updateGraphTabAfterSave(graphTab, { name: graphTab.sourceFileHandle.name || graphTab.sourceFileName });
      } else if (typeof NL_VERSION !== "undefined" && graphTab.sourceFilePath) {
        await Neutralino.filesystem.writeFile(graphTab.sourceFilePath, content);
        updateGraphTabAfterSave(graphTab, {
          name: getFileName(graphTab.sourceFilePath),
          path: graphTab.sourceFilePath
        });
      } else {
        return false;
      }
      return true;
    } catch (error) {
      console.error("Failed to save graph to original location:", error);
      return false;
    }
  }

  async function saveActiveGraphToSource() {
    return saveGraphTabToSource(getActiveGraphTab());
  }

  async function saveGraphTabWithSaveDialog(graphTab) {
    if (!graphTab) {
      return false;
    }

    const content = getActiveGraphSaveContent(graphTab);
    const suggestedName = getSuggestedGraphFileName(graphTab);

    try {
      if (typeof NL_VERSION !== "undefined") {
        const defaultPath = activeFolderPath ? joinPath(activeFolderPath, suggestedName) : suggestedName;
        const selectedPath = await Neutralino.os.showSaveDialog("Save Graph", {
          defaultPath,
          filters: [
            { name: "Markdown Viewer graph files", extensions: ["mdviewer-graph.json", "mdgraph.json", "json"] }
          ]
        });
        if (!selectedPath) return false;
        const finalPath = /\.(mdviewer-graph\.json|mdgraph\.json|json)$/i.test(selectedPath) ? selectedPath : `${selectedPath}.mdviewer-graph.json`;
        await Neutralino.filesystem.writeFile(finalPath, content);
        updateGraphTabAfterSave(graphTab, {
          name: getFileName(finalPath),
          path: finalPath
        });
        return true;
      }

      if (typeof window.showSaveFilePicker === "function" && !isFirefoxBrowser()) {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: "Markdown Viewer graph files",
              accept: { "application/json": [".json"] }
            }
          ]
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        updateGraphTabAfterSave(graphTab, {
          name: handle.name,
          handle
        });
        return true;
      }

      saveAs(new Blob([content], { type: "application/json;charset=utf-8" }), suggestedName);
      updateGraphTabAfterSave(graphTab, { name: suggestedName });
      return true;
    } catch (error) {
      if (error && error.name === "AbortError") return false;
      console.error("Failed to save graph:", error);
      alert("Failed to save graph: " + error.message);
      return false;
    }
  }

  async function saveActiveGraphWithSaveDialog() {
    return saveGraphTabWithSaveDialog(getActiveGraphTab());
  }

  async function openSavedGraphDocument(source) {
    if (!source) return null;
    if (tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a saved graph.');
      return null;
    }
    let content = source.content;
    let name = source.name || "Saved Graph";

    if (content === undefined) {
      if (typeof NL_VERSION !== "undefined" && source.path) {
        content = await Neutralino.filesystem.readFile(source.path);
        name = getFileName(source.path) || name;
      } else {
        let file = source.file || null;
        if (!file && source.handle) file = await source.handle.getFile();
        if (!file) throw new Error("No readable graph file was provided.");
        content = await file.text();
        name = file.name || name;
      }
    }

    let graphDocument;
    try {
      graphDocument = JSON.parse(content);
    } catch (error) {
      throw new Error("The selected graph file is not valid JSON.");
    }

    if (!looksLikeGraphDocument(graphDocument)) {
      throw new Error("The selected JSON file is not a Markdown Viewer graph file.");
    }

    const graphData = deserializeGraphDocument(graphDocument);
    const fallbackName = getGraphTitleFromFileName(name) || "Saved Graph";
    const graphTab = createGraphTab(graphData.folderName || fallbackName, { graphDocument });
    graphTab.sourceFileName = name;
    graphTab.title = fallbackName;
    if (source.handle) graphTab.sourceFileHandle = source.handle;
    if (source.path) graphTab.sourceFilePath = source.path;
    clearGraphTabUnsavedChanges(graphTab);
    tabs.push(graphTab);
    saveTabsToStorage(tabs);
    switchTab(graphTab.id);
    return graphTab;
  }

  function setGraphViewMode(enabled) {
    const contentContainer = document.querySelector(".content-container");
    if (!contentContainer || !graphViewCanvas) return;
    if (enabled) {
      contentContainer.classList.add("graph-view-active");
      if (!graphViewCanvas.parentElement || !graphViewCanvas.closest(".preview-pane")) {
        const previewPane = document.querySelector(".preview-pane");
        if (previewPane) previewPane.appendChild(graphViewCanvas);
      }
      graphViewCanvas.classList.add("tab-graph-canvas");
    } else {
      contentContainer.classList.remove("graph-view-active");
      graphViewCanvas.classList.remove("tab-graph-canvas");
      const graphViewContent = document.querySelector("#graph-view-modal .graph-view-content");
      if (graphViewContent && graphViewCanvas.parentElement !== graphViewContent) {
        graphViewContent.appendChild(graphViewCanvas);
      }
    }
  }

  async function renderGraphView() {
    if (!graphViewCanvas) return;
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    const graphViewConfig = activeTab && activeTab.type === "graph" ? (activeTab.graphViewConfig || null) : null;
    hideInactiveGraphRenders(activeTab?.id);
    graphViewCanvas.querySelectorAll(".folder-tree-placeholder").forEach((node) => node.remove());
    if (!activeTab || activeTab.type !== "graph") {
      updateStatusLine({ visiblePointCount: 0 });
      return;
    }

    let graphSnapshot = activeTab.graphSnapshot || null;
    if (!graphSnapshot && folderMarkdownFiles.length) {
      const snapshotFiles = folderMarkdownFiles.slice();
      const loadingMessage = document.createElement("p");
      loadingMessage.className = "folder-tree-placeholder";
      loadingMessage.textContent = "Building graph view…";
      graphViewCanvas.appendChild(loadingMessage);
      graphSnapshot = await createGraphSnapshot(snapshotFiles, activeTab.folderName || activeTab.title);
      activeTab.graphSnapshot = graphSnapshot;
      saveTabsToStorage(tabs);
      if (activeTabId !== activeTab.id) {
        loadingMessage.remove();
        return;
      }
      graphViewCanvas.querySelectorAll(".folder-tree-placeholder").forEach((node) => node.remove());
    }

    if (!graphSnapshot || !graphSnapshot.nodes?.length) {
      graphRenderCache.forEach((entry) => {
        if (entry?.simulation) entry.simulation.stop();
        if (entry?.wrapper) entry.wrapper.remove();
      });
      graphRenderCache.clear();
      activeTab.visiblePointCount = 0;
      updateStatusLine({ visiblePointCount: 0 });
      graphViewCanvas.innerHTML = '<p class="folder-tree-placeholder">This graph tab does not have a saved graph snapshot.</p>';
      return;
    }

    const graphSignature = getGraphSnapshotSignature(graphSnapshot, graphViewConfig);
    const cachedRender = graphRenderCache.get(activeTab.id);
    if (cachedRender && cachedRender.signature === graphSignature && cachedRender.wrapper) {
      if (cachedRender.wrapper.parentElement !== graphViewCanvas) graphViewCanvas.appendChild(cachedRender.wrapper);
      cachedRender.wrapper.classList.remove("hidden");
      hideInactiveGraphRenders(activeTab.id);
      activeTab.visiblePointCount = cachedRender.visiblePointCount || 0;
      updateStatusLine({ visiblePointCount: activeTab.visiblePointCount });
      return;
    }

    if (cachedRender) {
      if (cachedRender.simulation) cachedRender.simulation.stop();
      if (cachedRender.wrapper) cachedRender.wrapper.remove();
      graphRenderCache.delete(activeTab.id);
    }

    const graphRenderWrapper = document.createElement("div");
    graphRenderWrapper.className = "graph-tab-render";
    graphRenderWrapper.dataset.graphTabId = activeTab.id;
    graphViewCanvas.appendChild(graphRenderWrapper);
    hideInactiveGraphRenders(activeTab.id);
    const nodes = (graphSnapshot.nodes || []).map((node) => ({ ...node }));
    const links = (graphSnapshot.links || []).map((link) => ({ ...link }));
    if (graphViewConfig && Array.isArray(graphViewConfig.allowedNodeIds) && graphViewConfig.allowedNodeIds.length) {
      const allowedNodeIds = new Set(graphViewConfig.allowedNodeIds);
      const allowedNodes = nodes.filter((n) => allowedNodeIds.has(n.id));
      const allowedLinks = links.filter((l) => allowedNodeIds.has(l.source) && allowedNodeIds.has(l.target));
      nodes.length = 0;
      nodes.push(...allowedNodes);
      links.length = 0;
      links.push(...allowedLinks);
    }

    if (graphViewConfig && Array.isArray(graphViewConfig.hiddenNodeIds) && graphViewConfig.hiddenNodeIds.length) {
      const hiddenNodeIds = new Set(graphViewConfig.hiddenNodeIds);
      const visibleNodes = nodes.filter((n) => !hiddenNodeIds.has(n.id));
      const visibleLinks = links.filter((l) => !hiddenNodeIds.has(l.source) && !hiddenNodeIds.has(l.target));
      nodes.length = 0;
      nodes.push(...visibleNodes);
      links.length = 0;
      links.push(...visibleLinks);
    }

    const filterGraphToNodeIds = (nodeIds) => {
      const filteredNodes = nodes.filter((n) => nodeIds.has(n.id));
      const filteredLinks = links.filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target));
      nodes.length = 0;
      nodes.push(...filteredNodes);
      links.length = 0;
      links.push(...filteredLinks);
    };

    const getLinkSourceId = (link) => link?.source?.id || link?.source;
    const getLinkTargetId = (link) => link?.target?.id || link?.target;

    const getDirectOutgoingNodeIds = (nodeId) => links
      .filter((link) => getLinkSourceId(link) === nodeId)
      .map(getLinkTargetId)
      .filter(Boolean);

    const getFullOutgoingNodeIds = (nodeId) => {
      const outgoingNodeIds = new Set();
      const nodesToVisit = [...getDirectOutgoingNodeIds(nodeId)];

      while (nodesToVisit.length) {
        const currentNodeId = nodesToVisit.shift();
        if (!currentNodeId || currentNodeId === nodeId || outgoingNodeIds.has(currentNodeId)) continue;
        outgoingNodeIds.add(currentNodeId);
        nodesToVisit.push(...getDirectOutgoingNodeIds(currentNodeId));
      }

      return outgoingNodeIds;
    };

    if (graphViewConfig && graphViewConfig.mode === "local" && graphViewConfig.focusNodeId) {
      const focusNodeId = graphViewConfig.focusNodeId;
      filterGraphToNodeIds(new Set([focusNodeId, ...getDirectOutgoingNodeIds(focusNodeId)]));
    }

    if (graphViewConfig && graphViewConfig.mode === "full-local" && graphViewConfig.focusNodeId) {
      const focusNodeId = graphViewConfig.focusNodeId;
      filterGraphToNodeIds(new Set([focusNodeId, ...getFullOutgoingNodeIds(focusNodeId)]));
    }

    activeTab.visiblePointCount = nodes.length;
    updateStatusLine({ visiblePointCount: nodes.length });

    applySavedGraphLayout(nodes, activeTab.graphLayout);
    if (typeof activeTab.graphLayout?.magneticEnabled === "boolean") {
      graphSettings.magneticEnabled = activeTab.graphLayout.magneticEnabled;
    }

    const outgoingAdjacency = new Map();
    const outgoingDegree = new Map();
    nodes.forEach((n) => outgoingAdjacency.set(n.id, new Set([n.id])));
    nodes.forEach((n) => outgoingDegree.set(n.id, 0));
    links.forEach((l) => {
      outgoingAdjacency.get(l.source)?.add(l.target);
      outgoingDegree.set(l.source, (outgoingDegree.get(l.source) || 0) + 1);
    });
    const maxOutgoing = Math.max(1, ...Array.from(outgoingDegree.values()));
    const GRAPH_NODE_RADIUS_SCALE = 0.8;
    const graphBaseNodeRadius = (nodeId) => {
      const outCount = outgoingDegree.get(nodeId) || 0;
      return 6 + (outCount / maxOutgoing) * 12;
    };
    const nodeRadius = (nodeId) => graphBaseNodeRadius(nodeId) * GRAPH_NODE_RADIUS_SCALE;
    const GRAPH_LINK_SOURCE_PADDING = 1;
    const GRAPH_LINK_TARGET_PADDING = 0;
    const getLinkEndpoint = (d) => {
      const dx = d.target.x - d.source.x;
      const dy = d.target.y - d.source.y;
      const distance = Math.hypot(dx, dy) || 1;
      const ux = dx / distance;
      const uy = dy / distance;
      const sourceOffset = nodeRadius(d.source.id) + GRAPH_LINK_SOURCE_PADDING;
      const targetOffset = nodeRadius(d.target.id) + GRAPH_LINK_TARGET_PADDING;
      return {
        x1: d.source.x + ux * sourceOffset,
        y1: d.source.y + uy * sourceOffset,
        x2: d.target.x - ux * targetOffset,
        y2: d.target.y - uy * targetOffset
      };
    };
    const width = graphRenderWrapper.clientWidth || graphViewCanvas.clientWidth || 900;
    const height = graphRenderWrapper.clientHeight || graphViewCanvas.clientHeight || 560;
    const svg = d3.select(graphRenderWrapper).append("svg").attr("width", width).attr("height", height);
    const graphLayer = svg.append("g").attr("class", "graph-layer");

    let currentZoomTransform = d3.zoomIdentity;
    const zoomBehavior = d3.zoom()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        currentZoomTransform = event.transform;
        graphLayer.attr("transform", currentZoomTransform);
        captureGraphLayout(activeTab, nodes, currentZoomTransform);
        scheduleGraphLayoutStorageSave();
        if (event.sourceEvent) markGraphTabAsChanged(activeTab);
      });

    svg.call(zoomBehavior).on("dblclick.zoom", null);
    const savedZoomTransform = getSavedGraphZoomTransform(activeTab.graphLayout);
    if (savedZoomTransform) {
      currentZoomTransform = d3.zoomIdentity
        .translate(savedZoomTransform.x, savedZoomTransform.y)
        .scale(savedZoomTransform.k);
      svg.call(zoomBehavior.transform, currentZoomTransform);
    }

    const simulation = d3.forceSimulation(nodes);
    const baseLinkForce = d3.forceLink(links).id((d) => d.id).distance(170).strength(0.4);
    const baseChargeForce = d3.forceManyBody().strength(-650);
    const baseCenterForce = d3.forceCenter(width / 2, height / 2);
    const baseCollisionForce = d3.forceCollide().radius((d) => nodeRadius(d.id) + 30).strength(0.9);
    simulation
      .force("link", baseLinkForce)
      .force("charge", baseChargeForce)
      .force("center", baseCenterForce)
      .force("collision", baseCollisionForce);
    // Keep the former marker dimensions: 9x8 viewBox scaled into a 5x5 marker viewport.
    const arrowheadLength = 5;
    const arrowheadHalfHeight = 20 / 9;
    const lineLayer = graphLayer.append("g").attr("class", "graph-line-layer");
    const arrowheadLayer = graphLayer.append("g").attr("class", "graph-arrowhead-layer");
    const nodeLayer = graphLayer.append("g").attr("class", "graph-node-layer");
    const labelLayer = graphLayer.append("g").attr("class", "graph-label-layer");

    const link = lineLayer.selectAll("line").data(links).enter().append("line")
      .attr("class", "graph-link");
    const arrowhead = arrowheadLayer.selectAll("path").data(links).enter().append("path")
      .attr("class", "graph-arrowhead");
    const node = nodeLayer.selectAll("circle").data(nodes).enter().append("circle")
      .attr("r", (d) => nodeRadius(d.id)).attr("class", "graph-node")
      .call(d3.drag()
        .on("start", (event, d) => {
          if (graphSettings.magneticEnabled && !event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.x = event.x;
          d.y = event.y;
          d.fx = event.x;
          d.fy = event.y;
          renderGraphTick();
          captureGraphLayout(activeTab, nodes, currentZoomTransform);
        })
        .on("end", (event, d) => {
          if (graphSettings.magneticEnabled && !event.active) simulation.alphaTarget(0);
          d.x = event.x;
          d.y = event.y;
          d.fx = null;
          d.fy = null;
          renderGraphTick();
          captureGraphLayout(activeTab, nodes, currentZoomTransform);
          markGraphTabAsChanged(activeTab);
          saveTabsToStorage(tabs);
        }));
    const graphTooltipPathsById = new Map((graphSnapshot.files || []).map((file) => [file.id, file.fullPath || file.path]));
    node.append("title").text((d) => graphTooltipPathsById.get(d.id) || d.fullPath || d.label);
    const label = labelLayer.selectAll("text").data(nodes).enter().append("text").text((d) => d.label).attr("class", "graph-label");

    const contextMenu = document.createElement("div");
    contextMenu.className = "graph-context-menu hidden";
    const contextMenuTitle = document.createElement("div");
    contextMenuTitle.className = "graph-context-menu-title hidden";

    const createContextMenuButton = (labelText, iconClass, tooltipText) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "graph-context-menu-item graph-context-menu-tooltip";
      button.dataset.tooltip = tooltipText;
      const icon = document.createElement("i");
      icon.className = iconClass;
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "graph-context-menu-item-label";
      label.textContent = labelText;
      button.appendChild(icon);
      button.appendChild(label);
      return button;
    };

    const setContextMenuButtonLabel = (button, labelText) => {
      const label = button.querySelector(".graph-context-menu-item-label");
      if (label) label.textContent = labelText;
    };

    const magneticToggleBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.turnMagneticForcesOff.label,
      CONTEXT_MENU_ACTIONS.turnMagneticForcesOff.icon,
      "Toggle whether graph nodes continue to pull and push each other after you move them."
    );
    const contextMenuTitleSeparator = document.createElement("div");
    contextMenuTitleSeparator.className = "graph-context-menu-separator hidden";
    const contextMenuActionSeparator = document.createElement("div");
    contextMenuActionSeparator.className = "graph-context-menu-separator hidden";
    const openFileBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.openInNewTab.label,
      CONTEXT_MENU_ACTIONS.openInNewTab.icon,
      "Open this Markdown file in a dedicated editor tab without changing the graph tab."
    );
    openFileBtn.classList.add("hidden");
    const openDefaultAppBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.openWithDefaultApp.label,
      CONTEXT_MENU_ACTIONS.openWithDefaultApp.icon,
      "Ask the operating system to open this file with its configured default application."
    );
    openDefaultAppBtn.classList.add("hidden");
    const revealFileBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.label,
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.icon,
      "Open the file's folder in the system file explorer and select this file when supported."
    );
    revealFileBtn.classList.add("hidden");
    const renameFileBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.rename.label,
      CONTEXT_MENU_ACTIONS.rename.icon,
      "Rename this Markdown file on disk and update open graph views that include it."
    );
    renameFileBtn.classList.add("hidden");
    const hidePointBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.removePoint.label,
      CONTEXT_MENU_ACTIONS.removePoint.icon,
      "Remove this point from the current graph view while keeping the original file on disk."
    );
    hidePointBtn.classList.add("hidden");
    const localGraphBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.showLocalGraph.label,
      CONTEXT_MENU_ACTIONS.showLocalGraph.icon,
      "Open a graph focused on this point and the points it directly links to."
    );
    localGraphBtn.classList.add("hidden");
    const fullLocalGraphBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.showFullLocalGraph.label,
      CONTEXT_MENU_ACTIONS.showFullLocalGraph.icon,
      "Open a graph that follows every outgoing dependency reachable from this point."
    );
    fullLocalGraphBtn.classList.add("hidden");
    const deleteFileBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.deleteFile.label,
      CONTEXT_MENU_ACTIONS.deleteFile.icon,
      "Delete this Markdown file after confirmation and remove its point from the graph."
    );
    deleteFileBtn.classList.add("hidden", "graph-context-menu-item-danger");
    const sharePointBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.share.label,
      CONTEXT_MENU_ACTIONS.share.icon,
      "Copy a shareable URL containing this point's Markdown content."
    );
    sharePointBtn.classList.add("hidden");
    const contextMenuDeleteSeparator = document.createElement("div");
    contextMenuDeleteSeparator.className = "graph-context-menu-separator hidden";

    const copySubmenu = document.createElement("div");
    copySubmenu.className = "graph-context-menu-submenu hidden";
    const copySubmenuBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copy.label,
      CONTEXT_MENU_ACTIONS.copy.icon,
      "Open copy actions for this point, including its path, content, dependencies, and backlinks."
    );
    copySubmenuBtn.setAttribute("aria-haspopup", "true");
    const copySubmenuArrow = document.createElement("span");
    copySubmenuArrow.className = "graph-context-menu-submenu-arrow";
    copySubmenuArrow.textContent = "›";
    copySubmenuBtn.appendChild(copySubmenuArrow);
    const copySubmenuPanel = document.createElement("div");
    copySubmenuPanel.className = "graph-context-menu-submenu-panel";
    const copyPathBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyPath.label,
      CONTEXT_MENU_ACTIONS.copyPath.icon,
      "Copy this file's full path and file name to the clipboard."
    );
    const copyContentBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyContent.label,
      CONTEXT_MENU_ACTIONS.copyContent.icon,
      "Copy the entire Markdown content of this file to the clipboard."
    );
    const copyDependenciesBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyDependencies.label,
      CONTEXT_MENU_ACTIONS.copyDependencies.icon,
      "Copy direct outgoing linked file names, one file name per line."
    );
    const copyFullDependenciesBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyFullDependencies.label,
      CONTEXT_MENU_ACTIONS.copyFullDependencies.icon,
      "Copy all direct and indirect outgoing linked file names, one file name per line."
    );
    const copyBacklinksBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyBacklinks.label,
      CONTEXT_MENU_ACTIONS.copyBacklinks.icon,
      "Copy file names that directly link to this point, one file name per line."
    );
    [copyPathBtn, copyContentBtn, copyDependenciesBtn, copyFullDependenciesBtn, copyBacklinksBtn].forEach((button) => {
      copySubmenuPanel.appendChild(button);
    });
    copySubmenu.appendChild(copySubmenuBtn);
    copySubmenu.appendChild(copySubmenuPanel);

    const exportSubmenu = document.createElement("div");
    exportSubmenu.className = "graph-context-menu-submenu hidden";
    const exportSubmenuBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.export.label,
      CONTEXT_MENU_ACTIONS.export.icon,
      "Open export actions for this point."
    );
    exportSubmenuBtn.setAttribute("aria-haspopup", "true");
    const exportSubmenuArrow = document.createElement("span");
    exportSubmenuArrow.className = "graph-context-menu-submenu-arrow";
    exportSubmenuArrow.textContent = "›";
    exportSubmenuBtn.appendChild(exportSubmenuArrow);
    const exportSubmenuPanel = document.createElement("div");
    exportSubmenuPanel.className = "graph-context-menu-submenu-panel";
    const exportMarkdownBtn = createContextMenuButton(CONTEXT_MENU_ACTIONS.exportMarkdown.label, CONTEXT_MENU_ACTIONS.exportMarkdown.icon, "Download this point as Markdown.");
    const exportHtmlBtn = createContextMenuButton(CONTEXT_MENU_ACTIONS.exportHtml.label, CONTEXT_MENU_ACTIONS.exportHtml.icon, "Download this point as HTML.");
    const exportPdfBtn = createContextMenuButton(CONTEXT_MENU_ACTIONS.exportPdf.label, CONTEXT_MENU_ACTIONS.exportPdf.icon, "Download this point as PDF.");
    [exportMarkdownBtn, exportHtmlBtn, exportPdfBtn].forEach((button) => exportSubmenuPanel.appendChild(button));
    exportSubmenu.appendChild(exportSubmenuBtn);
    exportSubmenu.appendChild(exportSubmenuPanel);

    contextMenu.appendChild(contextMenuTitle);
    contextMenu.appendChild(contextMenuTitleSeparator);
    contextMenu.appendChild(openFileBtn);
    contextMenu.appendChild(openDefaultAppBtn);
    contextMenu.appendChild(revealFileBtn);
    contextMenu.appendChild(renameFileBtn);
    contextMenu.appendChild(copySubmenu);
    contextMenu.appendChild(sharePointBtn);
    contextMenu.appendChild(hidePointBtn);
    contextMenu.appendChild(localGraphBtn);
    contextMenu.appendChild(fullLocalGraphBtn);
    contextMenu.appendChild(contextMenuDeleteSeparator);
    contextMenu.appendChild(deleteFileBtn);
    contextMenu.appendChild(exportSubmenu);
    contextMenu.appendChild(contextMenuActionSeparator);
    contextMenu.appendChild(magneticToggleBtn);
    graphRenderWrapper.appendChild(contextMenu);

    let contextTargetNode = null;

    const getActiveGraphTab = () => tabs.find((tab) => tab.id === activeTabId && tab.type === "graph") || null;

    const getFolderMarkdownEntryForNode = (graphNode) => {
      if (!graphNode) return null;
      return (folderMarkdownFiles || []).find((entry) => {
        const entryPath = entry.path || entry.fullPath || entry.file?.webkitRelativePath || entry.file?.name || "";
        return normalizeGraphNodeName(entryPath) === graphNode.id;
      }) || null;
    };

    const getSnapshotFileForNode = (graphNode) => {
      if (!graphNode) return null;
      const activeGraphTab = getActiveGraphTab();
      const snapshotFile = activeGraphTab?.graphSnapshot?.files?.find((file) => file.id === graphNode.id);
      return snapshotFile || getFolderMarkdownEntryForNode(graphNode);
    };

    const getNodeFileName = (nodeId) => {
      const graphNode = nodes.find((n) => n.id === nodeId);
      const snapshotFile = graphNode ? getSnapshotFileForNode(graphNode) : null;
      const sourcePath = snapshotFile?.path || snapshotFile?.fullPath || graphNode?.fullPath || graphNode?.label || nodeId;
      return getFileName(sourcePath || nodeId);
    };

    const getNodeClipboardPath = (graphNode) => {
      const snapshotFile = getSnapshotFileForNode(graphNode);
      return snapshotFile?.fullPath || snapshotFile?.path || graphNode?.fullPath || graphNode?.label || graphNode?.id || "";
    };

    const isAbsoluteFilesystemPath = (path) => {
      if (!path) return false;
      return /^[a-zA-Z]:[\\/]/.test(path) || /^\\\\/.test(path) || path.startsWith("/");
    };

    const resolveFilesystemPath = (path) => {
      if (!path || !isNeutralinoRuntime()) return null;
      if (isAbsoluteFilesystemPath(path)) return path;
      return activeFolderPath ? joinPath(activeFolderPath, path) : null;
    };

    const getNodeFilesystemPath = (graphNode) => {
      const snapshotFile = getSnapshotFileForNode(graphNode);
      const candidatePaths = [
        snapshotFile?.fullPath,
        snapshotFile?.path,
        graphNode?.fullPath
      ];
      for (const candidatePath of candidatePaths) {
        const resolvedPath = resolveFilesystemPath(candidatePath);
        if (resolvedPath) return resolvedPath;
      }
      return null;
    };

    const readGraphNodeContent = async (graphNode) => {
      const snapshotFile = getSnapshotFileForNode(graphNode);
      if (!snapshotFile) throw new Error("Unable to find the selected file in this graph snapshot.");
      if (snapshotFile.content !== undefined) return snapshotFile.content || "";
      if (snapshotFile.file) return snapshotFile.file.text();
      if (snapshotFile.handle) {
        const file = await snapshotFile.handle.getFile();
        return file.text();
      }
      if (isNeutralinoRuntime() && snapshotFile.fullPath) return Neutralino.filesystem.readFile(snapshotFile.fullPath);
      throw new Error("No readable Markdown file was provided.");
    };

    const copyGraphText = async (text) => {
      if (isNeutralinoRuntime() && Neutralino.clipboard?.writeText) {
        await Neutralino.clipboard.writeText(text || "");
        showCopiedMessage();
        return;
      }
      await copyToClipboard(text || "");
    };

    const getDirectOutgoingDependencyIds = (nodeId) => links
      .filter((l) => l.source?.id === nodeId || l.source === nodeId)
      .map((l) => l.target?.id || l.target)
      .filter(Boolean);

    const getFullOutgoingDependencyIds = (nodeId) => {
      const dependencyIds = new Set();
      const nodesToVisit = [...getDirectOutgoingDependencyIds(nodeId)];
      while (nodesToVisit.length) {
        const currentNodeId = nodesToVisit.shift();
        if (!currentNodeId || currentNodeId === nodeId || dependencyIds.has(currentNodeId)) continue;
        dependencyIds.add(currentNodeId);
        nodesToVisit.push(...getDirectOutgoingDependencyIds(currentNodeId));
      }
      return Array.from(dependencyIds);
    };

    const getBacklinkIds = (nodeId) => links
      .filter((l) => (l.target?.id || l.target) === nodeId)
      .map((l) => l.source?.id || l.source)
      .filter(Boolean);

    const copyNodeFileNameList = async (nodeIds) => {
      await copyGraphText(Array.from(new Set(nodeIds)).map(getNodeFileName).join("\n"));
    };

    const hideGraphPoint = (nodeId) => {
      simulation.stop();

      // Re-render by reusing temporary in-memory file graph and hiding this node for this tab view only.
      const activeGraphTab = getActiveGraphTab();
      if (activeGraphTab) {
        activeGraphTab.graphViewConfig = {
          ...(activeGraphTab.graphViewConfig || {}),
          hiddenNodeIds: Array.from(new Set([...(activeGraphTab.graphViewConfig?.hiddenNodeIds || []), nodeId]))
        };
        markGraphTabAsChanged(activeGraphTab);
        saveTabsToStorage(tabs);
        graphRenderCache.delete(activeGraphTab.id);
      }
      graphRenderWrapper.remove();
      renderGraphView();
    };

    const removeGraphPointFromSnapshot = (nodeId) => {
      const activeGraphTab = getActiveGraphTab();
      if (!activeGraphTab?.graphSnapshot) return;
      activeGraphTab.graphSnapshot = {
        ...activeGraphTab.graphSnapshot,
        nodes: (activeGraphTab.graphSnapshot.nodes || []).filter((n) => n.id !== nodeId),
        links: (activeGraphTab.graphSnapshot.links || []).filter((l) => l.source !== nodeId && l.target !== nodeId),
        files: (activeGraphTab.graphSnapshot.files || []).filter((file) => file.id !== nodeId)
      };
      activeGraphTab.graphViewConfig = {
        ...(activeGraphTab.graphViewConfig || {}),
        hiddenNodeIds: (activeGraphTab.graphViewConfig?.hiddenNodeIds || []).filter((id) => id !== nodeId)
      };
      folderMarkdownFiles = (folderMarkdownFiles || []).filter((entry) => {
        const entryPath = entry.path || entry.fullPath || entry.file?.webkitRelativePath || entry.file?.name || "";
        return normalizeGraphNodeName(entryPath) !== nodeId;
      });
      markGraphTabAsChanged(activeGraphTab);
      saveTabsToStorage(tabs);
      graphRenderCache.delete(activeGraphTab.id);
    };

    const applyMagneticSetting = () => {
      if (graphSettings.magneticEnabled) {
        simulation
          .force("link", baseLinkForce)
          .force("charge", baseChargeForce)
          .force("center", baseCenterForce)
          .force("collision", baseCollisionForce)
          .alpha(0.7)
          .restart();
      } else {
        simulation
          .force("link", null)
          .force("charge", null)
          .force("center", null)
          .force("collision", null)
          .alphaTarget(0)
          .stop();
        renderGraphTick();
        captureGraphLayout(activeTab, nodes, currentZoomTransform);
      }
      setContextMenuButtonLabel(
        magneticToggleBtn,
        graphSettings.magneticEnabled ? "Turn magnetic forces off" : "Turn magnetic forces on"
      );
    };

    const nodeContextMenuItems = [
      openFileBtn,
      openDefaultAppBtn,
      revealFileBtn,
      renameFileBtn,
      copySubmenu,
      sharePointBtn,
      hidePointBtn,
      localGraphBtn,
      fullLocalGraphBtn,
      contextMenuDeleteSeparator,
      deleteFileBtn,
      exportSubmenu
    ];

    const setNodeContextItemsHidden = (hidden) => {
      nodeContextMenuItems.forEach((item) => item.classList.toggle("hidden", hidden));
    };

    const positionContextMenu = (event) => {
      const bounds = graphViewCanvas.getBoundingClientRect();
      contextMenu.style.left = `${Math.max(0, Math.min(event.clientX - bounds.left, bounds.width - 230))}px`;
      contextMenu.style.top = `${Math.max(0, Math.min(event.clientY - bounds.top, bounds.height - 280))}px`;
    };

    const hideContextMenu = () => {
      contextMenu.classList.add("hidden");
      contextTargetNode = null;
      contextMenuTitle.classList.add("hidden");
      contextMenuTitle.textContent = "";
      contextMenuTitleSeparator.classList.add("hidden");
      contextMenuActionSeparator.classList.add("hidden");
      setNodeContextItemsHidden(true);
    };

    graphRenderWrapper.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      contextTargetNode = null;
      contextMenuTitle.classList.add("hidden");
      contextMenuTitle.textContent = "";
      contextMenuTitleSeparator.classList.add("hidden");
      contextMenuActionSeparator.classList.add("hidden");
      setNodeContextItemsHidden(true);
      positionContextMenu(event);
      contextMenu.classList.remove("hidden");
    });

    node.on("contextmenu", (event, d) => {
      event.preventDefault();
      event.stopPropagation();
      contextTargetNode = d;
      contextMenuTitle.textContent = getGraphContextMenuTitle(d);
      contextMenuTitle.classList.remove("hidden");
      contextMenuTitleSeparator.classList.remove("hidden");
      contextMenuActionSeparator.classList.remove("hidden");
      setNodeContextItemsHidden(false);
      positionContextMenu(event);
      contextMenu.classList.remove("hidden");
    });

    graphRenderWrapper.addEventListener("click", hideContextMenu);
    window.addEventListener("blur", hideContextMenu);

    magneticToggleBtn.addEventListener("click", () => {
      graphSettings.magneticEnabled = !graphSettings.magneticEnabled;
      saveGlobalState({ graphMagneticEnabled: graphSettings.magneticEnabled });
      applyMagneticSetting();
      captureGraphLayout(activeTab, nodes, currentZoomTransform);
      markGraphTabAsChanged(activeTab);
      hideContextMenu();
    });

    openFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      await openGraphNodeFileInPermanentTab(targetNode);
    });

    openDefaultAppBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const filePath = getNodeFilesystemPath(contextTargetNode);
      hideContextMenu();
      if (!filePath || !isNeutralinoRuntime() || !Neutralino.os?.open) {
        alert("Opening with the default app is available only in the desktop app for files opened from disk.");
        return;
      }
      try {
        await Neutralino.os.open(filePath);
      } catch (error) {
        console.error("Failed to open file with default app:", error);
        alert("Unable to open this file with the default app.");
      }
    });

    revealFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const filePath = getNodeFilesystemPath(contextTargetNode);
      hideContextMenu();
      if (!filePath || !isNeutralinoRuntime()) {
        alert("Revealing files is available only in the desktop app for files opened from disk.");
        return;
      }
      try {
        if (typeof NL_OS !== "undefined" && NL_OS === "Windows" && Neutralino.os?.execCommand) {
          const windowsPath = filePath.replace(/"/g, "").replace(/\//g, "\\");
          await Neutralino.os.execCommand(`explorer.exe /select,"${windowsPath}"`);
        } else if (Neutralino.os?.open) {
          const normalized = filePath.replace(/\\/g, "/");
          const folderPath = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : normalized;
          await Neutralino.os.open(folderPath);
        } else {
          throw new Error("No supported reveal command is available.");
        }
      } catch (error) {
        console.error("Failed to reveal file:", error);
        alert("Unable to reveal this file in the file explorer.");
      }
    });

    renameFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      const snapshotFile = getSnapshotFileForNode(targetNode);
      const folderEntry = getFolderMarkdownEntryForNode(targetNode);
      const filePath = getNodeFilesystemPath(targetNode);
      hideContextMenu();
      try {
        await renameSidebarNodeOnDisk({
          kind: "file",
          name: getFileName(snapshotFile?.path || snapshotFile?.fullPath || targetNode.fullPath || targetNode.label || targetNode.id),
          file: folderEntry?.file || snapshotFile?.file || null,
          handle: folderEntry?.handle || snapshotFile?.handle || null,
          fullPath: filePath || snapshotFile?.fullPath || null,
          path: snapshotFile?.path || folderEntry?.path || targetNode.fullPath || null
        }, "file");
      } catch (error) {
        console.error("Failed to rename graph file:", error);
        alert("Unable to rename this file.");
      }
    });

    copyPathBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      try {
        await copyGraphText(getNodeClipboardPath(targetNode));
      } catch (error) {
        console.error("Failed to copy path:", error);
        alert("Unable to copy this file path.");
      }
    });

    copyContentBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      try {
        await copyGraphText(await readGraphNodeContent(targetNode));
      } catch (error) {
        console.error("Failed to copy content:", error);
        alert("Unable to copy this file content.");
      }
    });

    sharePointBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      try {
        copyShareUrlFromText(await readGraphNodeContent(targetNode), sharePointBtn);
      } catch (error) {
        console.error("Failed to share point:", error);
        alert("Unable to share this point.");
      }
    });

    exportMarkdownBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      try {
        exportMarkdownContent(await readGraphNodeContent(targetNode), getNodeFileName(targetNode.id));
      } catch (error) {
        console.error("Failed to export point as Markdown:", error);
        alert("Unable to export this point as Markdown.");
      }
    });

    exportHtmlBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      try {
        exportHtmlContent(await readGraphNodeContent(targetNode));
      } catch (error) {
        console.error("Failed to export point as HTML:", error);
        alert("Unable to export this point as HTML.");
      }
    });

    exportPdfBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      try {
        exportPdfContent(await readGraphNodeContent(targetNode));
      } catch (error) {
        console.error("Failed to export point as PDF:", error);
        alert("Unable to export this point as PDF.");
      }
    });

    copyDependenciesBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const nodeId = contextTargetNode.id;
      hideContextMenu();
      await copyNodeFileNameList(getDirectOutgoingDependencyIds(nodeId));
    });

    copyFullDependenciesBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const nodeId = contextTargetNode.id;
      hideContextMenu();
      await copyNodeFileNameList(getFullOutgoingDependencyIds(nodeId));
    });

    copyBacklinksBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const nodeId = contextTargetNode.id;
      hideContextMenu();
      await copyNodeFileNameList(getBacklinkIds(nodeId));
    });

    hidePointBtn.addEventListener("click", () => {
      if (!contextTargetNode) return;
      const nodeId = contextTargetNode.id;
      hideContextMenu();
      hideGraphPoint(nodeId);
    });

    deleteFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      const nodeId = targetNode.id;
      const filePath = getNodeFilesystemPath(targetNode);
      hideContextMenu();
      if (!filePath || !isNeutralinoRuntime() || !Neutralino.filesystem?.remove) {
        alert("Deleting files is available only in the desktop app for files opened from disk.");
        return;
      }
      const confirmed = window.confirm(`Delete "${getNodeFileName(nodeId)}" from disk? This action cannot be undone.`);
      if (!confirmed) return;
      try {
        const snapshotFile = getSnapshotFileForNode(targetNode);
        await Neutralino.filesystem.remove(filePath);
        closeTabsForDeletedPath(filePath, { kind: "file", targetHandle: snapshotFile?.handle || null });
        simulation.stop();
        removeGraphPointFromSnapshot(nodeId);
        await refreshOpenFolderTreeAfterFileDelete(filePath);
        graphRenderWrapper.remove();
        renderGraphView();
      } catch (error) {
        console.error("Failed to delete file:", error);
        alert("Unable to delete this file.");
      }
    });

    const openLocalGraphTab = (mode, titlePrefix) => {
      if (!contextTargetNode) return;
      const focusNodeId = contextTargetNode.id;
      if (tabs.length >= 20) {
        alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
        return;
      }
      const activeGraphTab = tabs.find((tab) => tab.id === activeTabId);
      const parentConfig = activeGraphTab?.graphViewConfig || {};
      const localTabTitle = `${titlePrefix}: ${contextTargetNode.label}`;
      const localGraphTab = createGraphTab(localTabTitle, {
        graphSnapshot: activeGraphTab?.graphSnapshot || null,
        graphViewConfig: {
          mode,
          focusNodeId,
          hiddenNodeIds: [...(parentConfig.hiddenNodeIds || [])]
        },
        graphLayout: activeGraphTab?.graphLayout || null
      });
      tabs.push(localGraphTab);
      saveTabsToStorage(tabs);
      hideContextMenu();
      switchTab(localGraphTab.id);
    };

    localGraphBtn.addEventListener("click", () => {
      openLocalGraphTab("local", "Local Graph");
    });

    fullLocalGraphBtn.addEventListener("click", () => {
      openLocalGraphTab("full-local", "Full Local Graph");
    });

    let hoveredGraphNode = null;
    let hoveredGraphModifiers = { shiftKey: false, ctrlKey: false };

    const getGraphLinkSourceId = (linkData) => linkData?.source?.id || linkData?.source;
    const getGraphLinkTargetId = (linkData) => linkData?.target?.id || linkData?.target;

    const getRecursiveOutgoingHighlight = (focusNodeId) => {
      const highlightedNodes = new Set([focusNodeId]);
      const highlightedLinks = new Set();
      const visitedNodeIds = new Set([focusNodeId]);
      const nodesToVisit = [focusNodeId];

      while (nodesToVisit.length) {
        const currentNodeId = nodesToVisit.shift();
        links.forEach((linkData) => {
          if (getGraphLinkSourceId(linkData) !== currentNodeId) return;
          highlightedLinks.add(linkData);
          const targetNodeId = getGraphLinkTargetId(linkData);
          if (!targetNodeId) return;
          highlightedNodes.add(targetNodeId);
          if (!visitedNodeIds.has(targetNodeId)) {
            visitedNodeIds.add(targetNodeId);
            nodesToVisit.push(targetNodeId);
          }
        });
      }

      return { highlightedNodes, highlightedLinks };
    };

    const getBacklinkHighlight = (focusNodeId) => {
      const highlightedNodes = new Set([focusNodeId]);
      const highlightedLinks = new Set();

      links.forEach((linkData) => {
        if (getGraphLinkTargetId(linkData) !== focusNodeId) return;
        highlightedLinks.add(linkData);
        const sourceNodeId = getGraphLinkSourceId(linkData);
        if (sourceNodeId) highlightedNodes.add(sourceNodeId);
      });

      return { highlightedNodes, highlightedLinks };
    };

    function highlightNeighborhood(focusNode, modifiers = hoveredGraphModifiers) {
      if (!focusNode) return;
      const focusNodeId = focusNode.id;
      const isBacklinkHighlight = Boolean(modifiers.ctrlKey);
      const highlight = isBacklinkHighlight
        ? getBacklinkHighlight(focusNodeId)
        : (modifiers.shiftKey
          ? getRecursiveOutgoingHighlight(focusNodeId)
          : {
            highlightedNodes: outgoingAdjacency.get(focusNodeId) || new Set([focusNodeId]),
            highlightedLinks: new Set(links.filter((l) => getGraphLinkSourceId(l) === focusNodeId))
          });
      const isHighlightedLink = (l) => highlight.highlightedLinks.has(l);

      node.classed("dimmed", (n) => !highlight.highlightedNodes.has(n.id));
      label.classed("dimmed", (n) => !highlight.highlightedNodes.has(n.id));
      link
        .classed("dimmed", (l) => !isHighlightedLink(l))
        .classed("highlighted-direct", (l) => !isBacklinkHighlight && isHighlightedLink(l))
        .classed("highlighted-backlink", (l) => isBacklinkHighlight && isHighlightedLink(l));
      arrowhead
        .classed("dimmed", (l) => !isHighlightedLink(l))
        .classed("highlighted-direct", (l) => !isBacklinkHighlight && isHighlightedLink(l))
        .classed("highlighted-backlink", (l) => isBacklinkHighlight && isHighlightedLink(l));
    }

    function clearNeighborhoodHighlight() {
      node.classed("dimmed", false);
      label.classed("dimmed", false);
      link.classed("dimmed", false).classed("highlighted-direct", false).classed("highlighted-backlink", false);
      arrowhead.classed("dimmed", false).classed("highlighted-direct", false).classed("highlighted-backlink", false);
    }

    const updateHoveredGraphHighlight = (event) => {
      hoveredGraphModifiers = {
        shiftKey: Boolean(event?.shiftKey),
        ctrlKey: Boolean(event?.ctrlKey)
      };
      if (hoveredGraphNode) highlightNeighborhood(hoveredGraphNode, hoveredGraphModifiers);
    };

    node
      .on("mouseenter", (event, d) => {
        hoveredGraphNode = d;
        updateHoveredGraphHighlight(event);
      })
      .on("mouseleave", () => {
        hoveredGraphNode = null;
        clearNeighborhoodHighlight();
      });

    window.addEventListener("keydown", updateHoveredGraphHighlight);
    window.addEventListener("keyup", updateHoveredGraphHighlight);

    function renderGraphTick() {
      link.each(function(d) {
        const endpoint = getLinkEndpoint(d);
        d.endpoint = endpoint;
        d3.select(this)
          .attr("x1", endpoint.x1)
          .attr("y1", endpoint.y1)
          .attr("x2", endpoint.x2)
          .attr("y2", endpoint.y2);
      });
      arrowhead.attr("d", (d) => {
        const endpoint = d.endpoint || getLinkEndpoint(d);
        const dx = endpoint.x2 - endpoint.x1;
        const dy = endpoint.y2 - endpoint.y1;
        const distance = Math.hypot(dx, dy) || 1;
        const ux = dx / distance;
        const uy = dy / distance;
        const baseX = endpoint.x2 - ux * arrowheadLength;
        const baseY = endpoint.y2 - uy * arrowheadLength;
        const px = -uy * arrowheadHalfHeight;
        const py = ux * arrowheadHalfHeight;
        return `M${baseX + px},${baseY + py}L${endpoint.x2},${endpoint.y2}L${baseX - px},${baseY - py}`;
      });
      node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
      label.attr("x", (d) => d.x + 10).attr("y", (d) => d.y + 4);
      captureGraphLayout(activeTab, nodes, currentZoomTransform);
      scheduleGraphLayoutStorageSave();
    }

    simulation.on("tick", renderGraphTick);

    graphRenderCache.set(activeTab.id, {
      signature: graphSignature,
      wrapper: graphRenderWrapper,
      simulation,
      nodes,
      visiblePointCount: nodes.length,
      getZoomTransform: () => currentZoomTransform
    });

    applyMagneticSetting();
  }

  document.querySelectorAll(".save-current-file-button").forEach(function(button) {
    button.addEventListener("click", saveCurrentFileIfChanged);
  });

  document.querySelectorAll(".save-all-files-button").forEach(function(button) {
    button.addEventListener("click", saveAllChangedTabs);
  });

  exportMd.addEventListener("click", async function () {
    try {
      saveCurrentTabState();
      if (await saveActiveTabToSource()) {
        return;
      }
      await saveActiveTabWithSaveDialog();
    } catch (e) {
      if (e && e.name === "AbortError") return;
      console.error("Export failed:", e);
      alert("Export failed: " + e.message);
    }
  });

  desktopOpenGraphButtons.forEach((button) => button.addEventListener("click", openGraphView));
  if (mobileOpenGraphView) mobileOpenGraphView.addEventListener("click", openGraphView);

  exportHtml.addEventListener("click", function () {
    try {
      const markdown = markdownEditor.value;
      const html = marked.parse(markdown);
      const sanitizedHtml = DOMPurify.sanitize(html, {
        ADD_TAGS: ['mjx-container'], 
        ADD_ATTR: ['id', 'class', 'style']
      });
      const tempContainer = document.createElement("div");
      tempContainer.innerHTML = sanitizedHtml;
      enhanceGitHubAlerts(tempContainer);
      const enhancedHtml = tempContainer.innerHTML;
      const isDarkTheme =
        document.documentElement.getAttribute("data-theme") === "dark";
      const cssTheme = isDarkTheme
        ? "https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.3.0/github-markdown-dark.min.css"
        : "https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.3.0/github-markdown.min.css";
      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown Export</title>
  <link rel="stylesheet" href="${cssTheme}">
  <script>
      window.MathJax = {
          tex: {
              inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
              displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
              processEscapes: true
          }
      };
  </script>
  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-mml-chtml.min.js"></script>
  <style>
      body {
          background-color: ${isDarkTheme ? "#0d1117" : "#ffffff"};
          color: ${isDarkTheme ? "#c9d1d9" : "#24292e"};
      }
      .markdown-body {
          box-sizing: border-box;
          min-width: 200px;
          max-width: 980px;
          margin: 0 auto;
          padding: 45px;
          background-color: ${isDarkTheme ? "#0d1117" : "#ffffff"};
          color: ${isDarkTheme ? "#c9d1d9" : "#24292e"};
      }

      /* Syntax Highlighting */
      .hljs-doctag, .hljs-keyword, .hljs-template-tag, .hljs-template-variable, .hljs-type, .hljs-variable.language_ { color: ${isDarkTheme ? "#ff7b72" : "#d73a49"}; }
      .hljs-title, .hljs-title.class_, .hljs-title.class_.inherited__, .hljs-title.function_ { color: ${isDarkTheme ? "#d2a8ff" : "#6f42c1"}; }
      .hljs-attr, .hljs-attribute, .hljs-literal, .hljs-meta, .hljs-number, .hljs-operator, .hljs-variable, .hljs-selector-attr, .hljs-selector-class, .hljs-selector-id { color: ${isDarkTheme ? "#79c0ff" : "#005cc5"}; }
      .hljs-regexp, .hljs-string, .hljs-meta .hljs-string { color: ${isDarkTheme ? "#a5d6ff" : "#032f62"}; }
      .hljs-built_in, .hljs-symbol { color: ${isDarkTheme ? "#ffa657" : "#e36209"}; }
      .hljs-comment, .hljs-code, .hljs-formula { color: ${isDarkTheme ? "#8b949e" : "#6a737d"}; }
      .hljs-name, .hljs-quote, .hljs-selector-tag, .hljs-selector-pseudo { color: ${isDarkTheme ? "#7ee787" : "#22863a"}; }
      .hljs-subst { color: ${isDarkTheme ? "#c9d1d9" : "#24292e"}; }
      .hljs-section { color: ${isDarkTheme ? "#1f6feb" : "#005cc5"}; font-weight: bold; }
      .hljs-bullet { color: ${isDarkTheme ? "#79c0ff" : "#005cc5"}; }
      .hljs-emphasis { font-style: italic; }
      .hljs-strong { font-weight: bold; }
      .hljs-addition { color: ${isDarkTheme ? "#aff5b4" : "#22863a"}; background-color: ${isDarkTheme ? "#033a16" : "#f0fff4"}; }
      .hljs-deletion { color: ${isDarkTheme ? "#ffdcd7" : "#b31d28"}; background-color: ${isDarkTheme ? "#67060c" : "#ffeef0"}; }

      .markdown-alert {
          padding: 0.5rem 1rem;
          margin-bottom: 16px;
          border-left: 0.25em solid;
          border-radius: 0.375rem;
      }
      .markdown-alert > :last-child {
          margin-bottom: 0;
      }
      .markdown-alert-title {
          margin: 0 0 8px;
          font-weight: 600;
          line-height: 1.25;
          display: flex;
          align-items: center;
          gap: 8px;
      }
      .markdown-alert-icon {
          display: inline-flex;
          width: 16px;
          height: 16px;
      }
      .markdown-alert-icon svg {
          width: 16px;
          height: 16px;
          fill: currentColor;
      }
      .markdown-alert-note { color: ${isDarkTheme ? "#4493f8" : "#0969da"}; border-left-color: ${isDarkTheme ? "#4493f8" : "#0969da"}; background-color: ${isDarkTheme ? "rgba(31, 111, 235, 0.15)" : "#ddf4ff"}; }
      .markdown-alert-tip { color: ${isDarkTheme ? "#3fb950" : "#1a7f37"}; border-left-color: ${isDarkTheme ? "#3fb950" : "#1a7f37"}; background-color: ${isDarkTheme ? "rgba(35, 134, 54, 0.15)" : "#dafbe1"}; }
      .markdown-alert-important { color: ${isDarkTheme ? "#ab7df8" : "#8250df"}; border-left-color: ${isDarkTheme ? "#ab7df8" : "#8250df"}; background-color: ${isDarkTheme ? "rgba(137, 87, 229, 0.15)" : "#fbefff"}; }
      .markdown-alert-warning { color: ${isDarkTheme ? "#d29922" : "#9a6700"}; border-left-color: ${isDarkTheme ? "#d29922" : "#9a6700"}; background-color: ${isDarkTheme ? "rgba(210, 153, 34, 0.18)" : "#fff8c5"}; }
      .markdown-alert-caution { color: ${isDarkTheme ? "#f85149" : "#cf222e"}; border-left-color: ${isDarkTheme ? "#f85149" : "#cf222e"}; background-color: ${isDarkTheme ? "rgba(248, 81, 73, 0.18)" : "#ffebe9"}; }
      .markdown-alert > *:not(.markdown-alert-title) { color: ${isDarkTheme ? "#c9d1d9" : "#24292e"}; }

      @media (max-width: 767px) {
          .markdown-body {
              padding: 15px;
          }
      }
  </style>
</head>
<body>
  <article class="markdown-body">
      ${enhancedHtml}
  </article>
  <script>
      window.addEventListener('load', function () {
          if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
              window.MathJax.typesetPromise().catch(function (err) {
                  console.warn('MathJax typeset failed:', err);
              });
          }
      });
  </script>
</body>
</html>`;
      const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
      saveAs(blob, "document.html");
    } catch (e) {
      console.error("HTML export failed:", e);
      alert("HTML export failed: " + e.message);
    }
  });

  // ============================================
  // Page-Break Detection Functions (Story 1.1)
  // ============================================

  // Page configuration constants for A4 PDF export
  const PAGE_CONFIG = {
    a4Width: 210,           // mm
    a4Height: 297,          // mm
    margin: 15,             // mm each side
    contentWidth: 180,      // 210 - 30 (margins)
    contentHeight: 267,     // 297 - 30 (margins)
    windowWidth: 1000,      // html2canvas config
    scale: 2                // html2canvas scale factor
  };

  /**
   * Task 1: Identifies all graphic elements that may need page-break handling
   * @param {HTMLElement} container - The container element to search within
   * @returns {Array} Array of {element, type} objects
   */
  function identifyGraphicElements(container) {
    const graphics = [];

    // Query for images
    container.querySelectorAll('img').forEach(el => {
      graphics.push({ element: el, type: 'img' });
    });

    // Query for SVGs (Mermaid diagrams)
    container.querySelectorAll('svg').forEach(el => {
      graphics.push({ element: el, type: 'svg' });
    });

    // Query for pre elements (code blocks)
    container.querySelectorAll('pre').forEach(el => {
      graphics.push({ element: el, type: 'pre' });
    });

    // Query for tables
    container.querySelectorAll('table').forEach(el => {
      graphics.push({ element: el, type: 'table' });
    });

    return graphics;
  }

  /**
   * Task 2: Calculates element positions relative to the container
   * @param {Array} elements - Array of {element, type} objects
   * @param {HTMLElement} container - The container element
   * @returns {Array} Array with position data added
   */
  function calculateElementPositions(elements, container) {
    const containerRect = container.getBoundingClientRect();

    return elements.map(item => {
      const rect = item.element.getBoundingClientRect();
      const top = rect.top - containerRect.top;
      const height = rect.height;
      const bottom = top + height;

      return {
        element: item.element,
        type: item.type,
        top: top,
        height: height,
        bottom: bottom
      };
    });
  }

  /**
   * Task 3: Calculates page boundary positions
   * @param {number} totalHeight - Total height of content in pixels
   * @param {number} elementWidth - Actual width of the rendered element in pixels
   * @param {Object} pageConfig - Page configuration object
   * @returns {Array} Array of y-coordinates where pages end
   */
  function calculatePageBoundaries(totalHeight, elementWidth, pageConfig) {
    // Calculate pixel height per page based on the element's actual width
    // This must match how PDF pagination will split the canvas
    // The aspect ratio of content area determines page height relative to width
    const aspectRatio = pageConfig.contentHeight / pageConfig.contentWidth;
    const pageHeightPx = elementWidth * aspectRatio;

    const boundaries = [];
    let y = pageHeightPx;

    while (y < totalHeight) {
      boundaries.push(y);
      y += pageHeightPx;
    }

    return { boundaries, pageHeightPx };
  }

  /**
   * Task 4: Detects which elements would be split across page boundaries
   * @param {Array} elements - Array of elements with position data
   * @param {Array} pageBoundaries - Array of page break y-coordinates
   * @returns {Array} Array of split elements with additional split info
   */
  function detectSplitElements(elements, pageBoundaries) {
    // Handle edge case: empty elements array
    if (!elements || elements.length === 0) {
      return [];
    }

    // Handle edge case: no page boundaries (single page)
    if (!pageBoundaries || pageBoundaries.length === 0) {
      return [];
    }

    const splitElements = [];

    for (const item of elements) {
      // Find which page the element starts on
      let startPage = 0;
      for (let i = 0; i < pageBoundaries.length; i++) {
        if (item.top >= pageBoundaries[i]) {
          startPage = i + 1;
        } else {
          break;
        }
      }

      // Find which page the element ends on
      let endPage = 0;
      for (let i = 0; i < pageBoundaries.length; i++) {
        if (item.bottom > pageBoundaries[i]) {
          endPage = i + 1;
        } else {
          break;
        }
      }

      // Element is split if it spans multiple pages
      if (endPage > startPage) {
        // Calculate overflow amount (how much crosses into next page)
        const boundaryY = pageBoundaries[startPage] || pageBoundaries[0];
        const overflowAmount = item.bottom - boundaryY;

        splitElements.push({
          element: item.element,
          type: item.type,
          top: item.top,
          height: item.height,
          splitPageIndex: startPage,
          overflowAmount: overflowAmount
        });
      }
    }

    return splitElements;
  }

  /**
   * Task 5: Main entry point for analyzing graphics for page breaks
   * @param {HTMLElement} tempElement - The rendered content container
   * @returns {Object} Analysis result with totalElements, splitElements, pageCount
   */
  function analyzeGraphicsForPageBreaks(tempElement) {
    try {
      // Step 1: Identify all graphic elements
      const graphics = identifyGraphicElements(tempElement);
      console.log('Step 1 - Graphics found:', graphics.length, graphics.map(g => g.type));

      // Step 2: Calculate positions for each element
      const elementsWithPositions = calculateElementPositions(graphics, tempElement);
      console.log('Step 2 - Element positions:', elementsWithPositions.map(e => ({
        type: e.type,
        top: Math.round(e.top),
        height: Math.round(e.height),
        bottom: Math.round(e.bottom)
      })));

      // Step 3: Calculate page boundaries using the element's ACTUAL width
      const totalHeight = tempElement.scrollHeight;
      const elementWidth = tempElement.offsetWidth;
      const { boundaries: pageBoundaries, pageHeightPx } = calculatePageBoundaries(
        totalHeight,
        elementWidth,
        PAGE_CONFIG
      );

      console.log('Step 3 - Page boundaries:', {
        elementWidth,
        totalHeight,
        pageHeightPx: Math.round(pageHeightPx),
        boundaries: pageBoundaries.map(b => Math.round(b))
      });

      // Step 4: Detect split elements
      const splitElements = detectSplitElements(elementsWithPositions, pageBoundaries);
      console.log('Step 4 - Split elements detected:', splitElements.length);

      // Calculate page count
      const pageCount = pageBoundaries.length + 1;

      return {
        totalElements: graphics.length,
        splitElements: splitElements,
        pageCount: pageCount,
        pageBoundaries: pageBoundaries,
        pageHeightPx: pageHeightPx
      };
    } catch (error) {
      console.error('Page-break analysis failed:', error);
      return {
        totalElements: 0,
        splitElements: [],
        pageCount: 1,
        pageBoundaries: [],
        pageHeightPx: 0
      };
    }
  }

  // ============================================
  // End Page-Break Detection Functions
  // ============================================

  // ============================================
  // Page-Break Insertion Functions (Story 1.2)
  // ============================================

  // Threshold for whitespace optimization (30% of page height)
  const PAGE_BREAK_THRESHOLD = 0.3;

  /**
   * Task 3: Categorizes split elements by whether they fit on a single page
   * @param {Array} splitElements - Array of split elements from detection
   * @param {number} pageHeightPx - Page height in pixels
   * @returns {Object} { fittingElements, oversizedElements }
   */
  function categorizeBySize(splitElements, pageHeightPx) {
    const fittingElements = [];
    const oversizedElements = [];

    for (const item of splitElements) {
      if (item.height <= pageHeightPx) {
        fittingElements.push(item);
      } else {
        oversizedElements.push(item);
      }
    }

    return { fittingElements, oversizedElements };
  }

  /**
   * Task 1: Inserts page breaks by adjusting margins for fitting elements
   * @param {Array} fittingElements - Elements that fit on a single page
   * @param {number} pageHeightPx - Page height in pixels
   */
  function insertPageBreaks(fittingElements, pageHeightPx) {
    for (const item of fittingElements) {
      // Calculate where the current page ends
      const currentPageBottom = (item.splitPageIndex + 1) * pageHeightPx;

      // Calculate remaining space on current page
      const remainingSpace = currentPageBottom - item.top;
      const remainingRatio = remainingSpace / pageHeightPx;

      console.log('Processing split element:', {
        type: item.type,
        top: Math.round(item.top),
        height: Math.round(item.height),
        splitPageIndex: item.splitPageIndex,
        currentPageBottom: Math.round(currentPageBottom),
        remainingSpace: Math.round(remainingSpace),
        remainingRatio: remainingRatio.toFixed(2)
      });

      // Task 4: Whitespace optimization
      // If remaining space is more than threshold and element almost fits, skip
      // (Will be handled by Story 1.3 scaling instead)
      if (remainingRatio > PAGE_BREAK_THRESHOLD) {
        const scaledHeight = item.height * 0.9; // 90% scale
        if (scaledHeight <= remainingSpace) {
          console.log('  -> Skipping (can fit with 90% scaling)');
          continue;
        }
      }

      // Calculate margin needed to push element to next page
      const marginNeeded = currentPageBottom - item.top + 5; // 5px buffer

      console.log('  -> Applying marginTop:', marginNeeded, 'px');

      // Determine which element to apply margin to
      // For SVG elements (Mermaid diagrams), apply to parent container for proper layout
      let targetElement = item.element;
      if (item.type === 'svg' && item.element.parentElement) {
        targetElement = item.element.parentElement;
        console.log('  -> Using parent element:', targetElement.tagName, targetElement.className);
      }

      // Apply margin to push element to next page
      const currentMargin = parseFloat(targetElement.style.marginTop) || 0;
      targetElement.style.marginTop = `${currentMargin + marginNeeded}px`;

      console.log('  -> Element after margin:', targetElement.tagName, 'marginTop =', targetElement.style.marginTop);
    }
  }

  /**
   * Task 2: Applies page breaks with cascading adjustment handling
   * @param {HTMLElement} tempElement - The rendered content container
   * @param {Object} pageConfig - Page configuration object (unused, kept for API compatibility)
   * @param {number} maxIterations - Maximum iterations to prevent infinite loops
   * @returns {Object} Final analysis result
   */
  function applyPageBreaksWithCascade(tempElement, pageConfig, maxIterations = 10) {
    let iteration = 0;
    let analysis;
    let previousSplitCount = -1;

    do {
      // Re-analyze after each adjustment
      analysis = analyzeGraphicsForPageBreaks(tempElement);

      // Use pageHeightPx from analysis (calculated from actual element width)
      const pageHeightPx = analysis.pageHeightPx;

      // Categorize elements by size
      const { fittingElements, oversizedElements } = categorizeBySize(
        analysis.splitElements,
        pageHeightPx
      );

      // Store oversized elements for Story 1.3
      analysis.oversizedElements = oversizedElements;

      // If no fitting elements need adjustment, we're done
      if (fittingElements.length === 0) {
        break;
      }

      // Check if we're making progress (prevent infinite loops)
      if (fittingElements.length === previousSplitCount) {
        console.warn('Page-break adjustment not making progress, stopping');
        break;
      }
      previousSplitCount = fittingElements.length;

      // Apply page breaks to fitting elements
      insertPageBreaks(fittingElements, pageHeightPx);
      iteration++;

    } while (iteration < maxIterations);

    if (iteration >= maxIterations) {
      console.warn('Page-break stabilization reached max iterations:', maxIterations);
    }

    console.log('Page-break cascade complete:', {
      iterations: iteration,
      finalSplitCount: analysis.splitElements.length,
      oversizedCount: analysis.oversizedElements ? analysis.oversizedElements.length : 0
    });

    return analysis;
  }

  // ============================================
  // End Page-Break Insertion Functions
  // ============================================

  // ============================================
  // Oversized Graphics Scaling Functions (Story 1.3)
  // ============================================

  // Minimum scale factor to maintain readability (50%)
  const MIN_SCALE_FACTOR = 0.6;

  /**
   * Task 1 & 2: Calculates scale factor with minimum enforcement
   * @param {number} elementHeight - Original height of element in pixels
   * @param {number} availableHeight - Available page height in pixels
   * @param {number} buffer - Small buffer to prevent edge overflow
   * @returns {Object} { scaleFactor, wasClampedToMin }
   */
  function calculateScaleFactor(elementHeight, availableHeight, buffer = 5) {
    const targetHeight = availableHeight - buffer;
    let scaleFactor = targetHeight / elementHeight;
    let wasClampedToMin = false;

    // Enforce minimum scale for readability
    if (scaleFactor < MIN_SCALE_FACTOR) {
      console.warn(
        `Warning: Large graphic requires ${(scaleFactor * 100).toFixed(0)}% scaling. ` +
        `Clamping to minimum ${MIN_SCALE_FACTOR * 100}%. Content may be cut off.`
      );
      scaleFactor = MIN_SCALE_FACTOR;
      wasClampedToMin = true;
    }

    return { scaleFactor, wasClampedToMin };
  }

  /**
   * Task 3: Applies CSS transform scaling to an element
   * @param {HTMLElement} element - The element to scale
   * @param {number} scaleFactor - Scale factor (0.5 = 50%)
   * @param {string} elementType - Type of element (svg, pre, img, table)
   */
  function applyGraphicScaling(element, scaleFactor, elementType) {
    // Get original dimensions before transform
    const originalHeight = element.offsetHeight;

    // Task 4: Handle SVG elements (Mermaid diagrams)
    if (elementType === 'svg') {
      // Remove max-width constraint that may interfere
      element.style.maxWidth = 'none';
    }

    // Apply CSS transform
    element.style.transform = `scale(${scaleFactor})`;
    element.style.transformOrigin = 'top left';

    // Calculate margin adjustment to collapse visual space
    const scaledHeight = originalHeight * scaleFactor;
    const marginAdjustment = originalHeight - scaledHeight;

    // Apply negative margin to pull subsequent content up
    element.style.marginBottom = `-${marginAdjustment}px`;
  }

  /**
   * Task 6: Handles all oversized elements by applying appropriate scaling
   * @param {Array} oversizedElements - Array of oversized element data
   * @param {number} pageHeightPx - Page height in pixels
   */
  function handleOversizedElements(oversizedElements, pageHeightPx) {
    if (!oversizedElements || oversizedElements.length === 0) {
      return;
    }

    let scaledCount = 0;
    let clampedCount = 0;

    for (const item of oversizedElements) {
      // Calculate required scale factor
      const { scaleFactor, wasClampedToMin } = calculateScaleFactor(
        item.height,
        pageHeightPx
      );

      // Apply scaling to the element
      applyGraphicScaling(item.element, scaleFactor, item.type);

      scaledCount++;
      if (wasClampedToMin) {
        clampedCount++;
      }
    }

    console.log('Oversized graphics scaling complete:', {
      totalScaled: scaledCount,
      clampedToMinimum: clampedCount
    });
  }

  // ============================================
  // End Oversized Graphics Scaling Functions
  // ============================================

  exportPdf.addEventListener("click", async function () {
    try {
      const originalText = exportPdf.innerHTML;
      exportPdf.innerHTML = '<i class="bi bi-hourglass-split"></i> Generating...';
      exportPdf.disabled = true;

      const progressContainer = document.createElement('div');
      progressContainer.style.position = 'fixed';
      progressContainer.style.top = '50%';
      progressContainer.style.left = '50%';
      progressContainer.style.transform = 'translate(-50%, -50%)';
      progressContainer.style.padding = '15px 20px';
      progressContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      progressContainer.style.color = 'white';
      progressContainer.style.borderRadius = '5px';
      progressContainer.style.zIndex = '9999';
      progressContainer.style.textAlign = 'center';

      const statusText = document.createElement('div');
      statusText.textContent = 'Generating PDF...';
      progressContainer.appendChild(statusText);
      document.body.appendChild(progressContainer);

      const markdown = markdownEditor.value;
      const html = marked.parse(markdown);
      const sanitizedHtml = DOMPurify.sanitize(html, {
        ADD_TAGS: ['mjx-container', 'svg', 'path', 'g', 'marker', 'defs', 'pattern', 'clipPath'],
        ADD_ATTR: ['id', 'class', 'style', 'viewBox', 'd', 'fill', 'stroke', 'transform', 'marker-end', 'marker-start']
      });

      const tempElement = document.createElement("div");
      tempElement.className = "markdown-body pdf-export";
      tempElement.innerHTML = sanitizedHtml;
      enhanceGitHubAlerts(tempElement);
      tempElement.style.padding = "20px";
      tempElement.style.width = "210mm";
      tempElement.style.margin = "0 auto";
      tempElement.style.fontSize = "14px";
      tempElement.style.position = "fixed";
      tempElement.style.left = "-9999px";
      tempElement.style.top = "0";

      const currentTheme = document.documentElement.getAttribute("data-theme");
      tempElement.style.backgroundColor = currentTheme === "dark" ? "#0d1117" : "#ffffff";
      tempElement.style.color = currentTheme === "dark" ? "#c9d1d9" : "#24292e";

      document.body.appendChild(tempElement);

      await new Promise(resolve => setTimeout(resolve, 200));

      try {
        await mermaid.run({
          nodes: tempElement.querySelectorAll('.mermaid'),
          suppressErrors: true
        });
      } catch (mermaidError) {
        console.warn("Mermaid rendering issue:", mermaidError);
      }

      if (window.MathJax) {
        try {
          await MathJax.typesetPromise([tempElement]);
        } catch (mathJaxError) {
          console.warn("MathJax rendering issue:", mathJaxError);
        }

        // Hide MathJax assistive elements that cause duplicate text in PDF
        // These are screen reader elements that html2canvas captures as visible
        // Use multiple CSS properties to ensure html2canvas doesn't render them
        const assistiveElements = tempElement.querySelectorAll('mjx-assistive-mml');
        assistiveElements.forEach(el => {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
          el.style.position = 'absolute';
          el.style.width = '0';
          el.style.height = '0';
          el.style.overflow = 'hidden';
          el.remove(); // Remove entirely from DOM
        });

        // Also hide any MathJax script elements that might contain source
        const mathScripts = tempElement.querySelectorAll('script[type*="math"], script[type*="tex"]');
        mathScripts.forEach(el => el.remove());
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // Analyze and apply page-breaks for graphics (Story 1.1 + 1.2)
      const pageBreakAnalysis = applyPageBreaksWithCascade(tempElement, PAGE_CONFIG);

      // Scale oversized graphics that can't fit on a single page (Story 1.3)
      if (pageBreakAnalysis.oversizedElements && pageBreakAnalysis.pageHeightPx) {
        handleOversizedElements(pageBreakAnalysis.oversizedElements, pageBreakAnalysis.pageHeightPx);
      }

      const pdfOptions = {
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
        hotfixes: ["px_scaling"]
      };

      const pdf = new jspdf.jsPDF(pdfOptions);
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);

      const canvas = await html2canvas(tempElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        windowWidth: 1000,
        windowHeight: tempElement.scrollHeight
      });

      const scaleFactor = canvas.width / contentWidth;
      const imgHeight = canvas.height / scaleFactor;
      const pagesCount = Math.ceil(imgHeight / (pageHeight - margin * 2));

      for (let page = 0; page < pagesCount; page++) {
        if (page > 0) pdf.addPage();

        const sourceY = page * (pageHeight - margin * 2) * scaleFactor;
        const sourceHeight = Math.min(canvas.height - sourceY, (pageHeight - margin * 2) * scaleFactor);
        const destHeight = sourceHeight / scaleFactor;

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sourceHeight;

        const ctx = pageCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);

        const imgData = pageCanvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', margin, margin, contentWidth, destHeight);
      }

      pdf.save("document.pdf");

      statusText.textContent = 'Download successful!';
      setTimeout(() => {
        document.body.removeChild(progressContainer);
      }, 1500);

      document.body.removeChild(tempElement);
      exportPdf.innerHTML = originalText;
      exportPdf.disabled = false;

    } catch (error) {
      console.error("PDF export failed:", error);
      alert("PDF export failed: " + error.message);
      exportPdf.innerHTML = '<i class="bi bi-file-earmark-pdf"></i> Export';
      exportPdf.disabled = false;

      const progressContainer = document.querySelector('div[style*="Preparing PDF"]');
      if (progressContainer) {
        document.body.removeChild(progressContainer);
      }
    }
  });

  copyMarkdownButton.addEventListener("click", function () {
    try {
      const markdownText = markdownEditor.value;
      copyToClipboard(markdownText);
    } catch (e) {
      console.error("Copy failed:", e);
      alert("Failed to copy Markdown: " + e.message);
    }
  });

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        showCopiedMessage();
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (successful) {
          showCopiedMessage();
        } else {
          throw new Error("Copy command was unsuccessful");
        }
      }
    } catch (err) {
      console.error("Copy failed:", err);
      alert("Failed to copy HTML: " + err.message);
    }
  }

  function showCopiedMessage() {
    const originalText = copyMarkdownButton.innerHTML;
    copyMarkdownButton.innerHTML = '<i class="bi bi-check-lg"></i> Copied!';

    setTimeout(() => {
      copyMarkdownButton.innerHTML = originalText;
    }, 2000);
  }

  // ============================================
  // Share via URL (pako compression + base64url)
  // ============================================

  const MAX_SHARE_URL_LENGTH = 32000;

  function encodeMarkdownForShare(text) {
    const compressed = pako.deflate(new TextEncoder().encode(text));
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < compressed.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, compressed.subarray(i, i + chunkSize));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeMarkdownFromShare(encoded) {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(pako.inflate(bytes));
  }

  function copyShareUrlFromText(markdownText, btn) {
    let encoded;
    try {
      encoded = encodeMarkdownForShare(markdownText || "");
    } catch (e) {
      console.error("Share encoding failed:", e);
      alert("Failed to encode content for sharing: " + e.message);
      return;
    }

    const shareUrl = window.location.origin + window.location.pathname + '#share=' + encoded;
    const tooLarge = shareUrl.length > MAX_SHARE_URL_LENGTH;

    const originalHTML = btn.innerHTML;
    const copiedHTML = '<i class="bi bi-check-lg"></i> Copied!';

    function onCopied() {
      if (!tooLarge) {
        window.location.hash = 'share=' + encoded;
      }
      btn.innerHTML = copiedHTML;
      setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(shareUrl).then(onCopied).catch(() => {
        // clipboard.writeText failed; nothing further to do in secure context
      });
    } else {
      try {
        const tempInput = document.createElement("textarea");
        tempInput.value = shareUrl;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        onCopied();
      } catch (_) {
        // copy failed silently
      }
    }
  }

  function copyShareUrl(btn) {
    copyShareUrlFromText(markdownEditor.value, btn);
  }

  shareButton.addEventListener("click", function () { copyShareUrl(shareButton); });
  mobileShareButton.addEventListener("click", function () { copyShareUrl(mobileShareButton); });

  function loadFromShareHash() {
    if (typeof pako === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.startsWith('#share=')) return;
    const encoded = hash.slice('#share='.length);
    if (!encoded) return;
    try {
      const decoded = decodeMarkdownFromShare(encoded);
      markdownEditor.value = decoded;
      renderMarkdown();
      saveCurrentTabState();
    } catch (e) {
      console.error("Failed to load shared content:", e);
      alert("The shared URL could not be decoded. It may be corrupted or incomplete.");
    }
  }

  loadFromShareHash();

  const dropEvents = ["dragenter", "dragover", "dragleave", "drop"];

  dropEvents.forEach((eventName) => {
    dropzone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, highlight, false);
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, unhighlight, false);
  });

  function highlight() {
    dropzone.classList.add("active");
  }

  function unhighlight() {
    dropzone.classList.remove("active");
  }

  dropzone.addEventListener("drop", handleDrop, false);
  dropzone.addEventListener("click", function (e) {
    if (e.target !== closeDropzoneBtn && !closeDropzoneBtn.contains(e.target)) {
      openDocumentFileFromPicker();
    }
  });
  closeDropzoneBtn.addEventListener("click", function(e) {
    e.stopPropagation(); 
    hideSidebarDropzone();
  });
  toggleDropzonePanelButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebarDropzone();
    });
  });
  toggleSidebarButtons.forEach(function(button) {
    button.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
    });
  });
  updateDropzoneToggleButtons();
  updateSidebarToggleButtons();

  async function handleDrop(e) {
    const dt = e.dataTransfer;

    try {
      // Folder drops can expose their contained files through dataTransfer.files,
      // so check for a dropped directory before falling back to a single document file.
      // Cache File System Access handles because some browsers do not reliably
      // return the same dropped file handle after a previous directory check.
      const fileSystemHandles = await getFileSystemHandlesFromDrop(dt);
      if (await openDroppedFolder(dt, fileSystemHandles)) {
        return;
      }
      if (await openDroppedDocumentFile(dt, fileSystemHandles)) {
        return;
      }
    } catch (error) {
      console.error("Failed to open dropped item:", error);
      alert("Unable to open the dropped file or folder.");
      return;
    }

    const files = dt.files;
    if (files.length) {
      alert("Please open a Markdown file (.md or .markdown), a graph file (.mdviewer-graph.json, .mdgraph.json, or .json), or a folder that contains Markdown files.");
    }
  }

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveCurrentFileIfChanged();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      const activeEl = document.activeElement;
      const isTextControl = activeEl && (activeEl.tagName === "TEXTAREA" || activeEl.tagName === "INPUT");
      const hasSelection = window.getSelection && window.getSelection().toString().trim().length > 0;
      const editorHasSelection = markdownEditor.selectionStart !== markdownEditor.selectionEnd;
      if (!isTextControl && !hasSelection && !editorHasSelection) {
        e.preventDefault();
        copyMarkdownButton.click();
      }
    }
    // Story 1.2: Only allow sync toggle shortcut when in split view
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
      e.preventDefault();
      if (currentViewMode === 'split') {
        toggleSyncScrolling();
      }
    }
    // New tab
    if ((e.ctrlKey || e.metaKey) && e.key === "t") {
      e.preventDefault();
      newTab();
    }
    // Close tab
    if ((e.ctrlKey || e.metaKey) && e.key === "w") {
      e.preventDefault();
      closeTab(activeTabId);
    }
    // Close Mermaid zoom modal with Escape
    if (e.key === "Escape") {
      closeMermaidModal();
    }
  });

  document.getElementById('tab-reset-btn').addEventListener('click', function() {
    resetAllTabs();
  });

  // ========================================
  // MERMAID DIAGRAM TOOLBAR
  // ========================================

  /**
   * Serialises an SVG element to a data URL suitable for use as an image source.
   * Inline styles and dimensions are preserved so the PNG matches the rendered diagram.
   */
  function svgToDataUrl(svgEl) {
    const clone = svgEl.cloneNode(true);
    // Ensure explicit width/height so the canvas has the right dimensions
    const bbox = svgEl.getBoundingClientRect();
    if (!clone.getAttribute('width'))  clone.setAttribute('width',  Math.round(bbox.width));
    if (!clone.getAttribute('height')) clone.setAttribute('height', Math.round(bbox.height));
    const serialized = new XMLSerializer().serializeToString(clone);
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialized);
  }

  /**
   * Renders an SVG element onto a canvas and resolves with the canvas.
   */
  function svgToCanvas(svgEl) {
    return new Promise((resolve, reject) => {
      const bbox = svgEl.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      const width  = Math.max(Math.round(bbox.width),  1);
      const height = Math.max(Math.round(bbox.height), 1);

      const canvas = document.createElement('canvas');
      canvas.width  = width  * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);

      // Fill background matching current theme using the CSS variable value
      const bgColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--bg-color').trim() || '#ffffff';
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      const img = new Image();
      img.onload  = () => { ctx.drawImage(img, 0, 0, width, height); resolve(canvas); };
      img.onerror = reject;
      img.src = svgToDataUrl(svgEl);
    });
  }

  /** Downloads the diagram in the given container as a PNG file. */
  async function downloadMermaidPng(container, btn) {
    const svgEl = container.querySelector('svg');
    if (!svgEl) return;
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    try {
      const canvas = await svgToCanvas(svgEl);
      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `diagram-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        btn.innerHTML = '<i class="bi bi-check-lg"></i>';
        setTimeout(() => { btn.innerHTML = original; }, 1500);
      }, 'image/png');
    } catch (e) {
      console.error('Mermaid PNG export failed:', e);
      btn.innerHTML = original;
    }
  }

  /** Copies the diagram in the given container as a PNG image to the clipboard. */
  async function copyMermaidImage(container, btn) {
    const svgEl = container.querySelector('svg');
    if (!svgEl) return;
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    try {
      const canvas = await svgToCanvas(svgEl);
      canvas.toBlob(async blob => {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          btn.innerHTML = '<i class="bi bi-check-lg"></i> Copied!';
        } catch (clipErr) {
          console.error('Clipboard write failed:', clipErr);
          btn.innerHTML = '<i class="bi bi-x-lg"></i>';
        }
        setTimeout(() => { btn.innerHTML = original; }, 1800);
      }, 'image/png');
    } catch (e) {
      console.error('Mermaid copy failed:', e);
      btn.innerHTML = original;
    }
  }

  /** Downloads the SVG source of a diagram. */
  function downloadMermaidSvg(container, btn) {
    const svgEl = container.querySelector('svg');
    if (!svgEl) return;
    const clone = svgEl.cloneNode(true);
    const serialized = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([serialized], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagram-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-check-lg"></i>';
    setTimeout(() => { btn.innerHTML = original; }, 1500);
  }

  // ---- Zoom modal state ----
  let modalZoomScale = 1;
  let modalPanX = 0;
  let modalPanY = 0;
  let modalIsDragging = false;
  let modalDragStart = { x: 0, y: 0 };
  let modalCurrentSvgEl = null;

  const mermaidZoomModal   = document.getElementById('mermaid-zoom-modal');
  const mermaidModalDiagram = document.getElementById('mermaid-modal-diagram');

  function applyModalTransform() {
    if (modalCurrentSvgEl) {
      modalCurrentSvgEl.style.transform =
        `translate(${modalPanX}px, ${modalPanY}px) scale(${modalZoomScale})`;
    }
  }

  function closeMermaidModal() {
    if (!mermaidZoomModal.classList.contains('active')) return;
    mermaidZoomModal.classList.remove('active');
    mermaidModalDiagram.innerHTML = '';
    modalCurrentSvgEl = null;
    modalZoomScale = 1;
    modalPanX = 0;
    modalPanY = 0;
  }

  /** Opens the zoom modal with the SVG from the given container. */
  function openMermaidZoomModal(container) {
    const svgEl = container.querySelector('svg');
    if (!svgEl) return;

    mermaidModalDiagram.innerHTML = '';
    modalZoomScale = 1;
    modalPanX = 0;
    modalPanY = 0;

    const svgClone = svgEl.cloneNode(true);
    // Remove fixed dimensions so it sizes naturally inside the modal
    svgClone.removeAttribute('width');
    svgClone.removeAttribute('height');
    svgClone.style.width  = 'auto';
    svgClone.style.height = 'auto';
    svgClone.style.maxWidth  = '80vw';
    svgClone.style.maxHeight = '60vh';
    svgClone.style.transformOrigin = 'center';
    mermaidModalDiagram.appendChild(svgClone);
    modalCurrentSvgEl = svgClone;

    mermaidZoomModal.classList.add('active');
  }

  // Modal close button
  document.getElementById('mermaid-modal-close').addEventListener('click', closeMermaidModal);
  // Click backdrop to close
  mermaidZoomModal.addEventListener('click', function(e) {
    if (e.target === mermaidZoomModal) closeMermaidModal();
  });

  // Zoom controls
  document.getElementById('mermaid-modal-zoom-in').addEventListener('click', () => {
    modalZoomScale = Math.min(modalZoomScale + 0.25, 10);
    applyModalTransform();
  });
  document.getElementById('mermaid-modal-zoom-out').addEventListener('click', () => {
    modalZoomScale = Math.max(modalZoomScale - 0.25, 0.1);
    applyModalTransform();
  });
  document.getElementById('mermaid-modal-zoom-reset').addEventListener('click', () => {
    modalZoomScale = 1; modalPanX = 0; modalPanY = 0;
    applyModalTransform();
  });

  // Mouse-wheel zoom inside modal
  mermaidModalDiagram.addEventListener('wheel', function(e) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    modalZoomScale = Math.min(Math.max(modalZoomScale + delta, 0.1), 10);
    applyModalTransform();
  }, { passive: false });

  // Drag to pan inside modal
  mermaidModalDiagram.addEventListener('mousedown', function(e) {
    modalIsDragging = true;
    modalDragStart = { x: e.clientX - modalPanX, y: e.clientY - modalPanY };
    mermaidModalDiagram.classList.add('dragging');
  });
  document.addEventListener('mousemove', function(e) {
    if (!modalIsDragging) return;
    modalPanX = e.clientX - modalDragStart.x;
    modalPanY = e.clientY - modalDragStart.y;
    applyModalTransform();
  });
  document.addEventListener('mouseup', function() {
    if (modalIsDragging) {
      modalIsDragging = false;
      mermaidModalDiagram.classList.remove('dragging');
    }
  });

  // Modal download buttons (operate on the currently displayed SVG)
  document.getElementById('mermaid-modal-download-png').addEventListener('click', async function() {
    if (!modalCurrentSvgEl) return;
    const btn = this;
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    try {
      // Use the original SVG (with dimensions) for proper PNG rendering
      const canvas = await svgToCanvas(modalCurrentSvgEl);
      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `diagram-${Date.now()}.png`; a.click();
        URL.revokeObjectURL(url);
        btn.innerHTML = '<i class="bi bi-check-lg"></i>';
        setTimeout(() => { btn.innerHTML = original; }, 1500);
      }, 'image/png');
    } catch (e) {
      console.error('Modal PNG export failed:', e);
      btn.innerHTML = original;
    }
  });

  document.getElementById('mermaid-modal-copy').addEventListener('click', async function() {
    if (!modalCurrentSvgEl) return;
    const btn = this;
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    try {
      const canvas = await svgToCanvas(modalCurrentSvgEl);
      canvas.toBlob(async blob => {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          btn.innerHTML = '<i class="bi bi-check-lg"></i> Copied!';
        } catch (clipErr) {
          console.error('Clipboard write failed:', clipErr);
          btn.innerHTML = '<i class="bi bi-x-lg"></i>';
        }
        setTimeout(() => { btn.innerHTML = original; }, 1800);
      }, 'image/png');
    } catch (e) {
      console.error('Modal copy failed:', e);
      btn.innerHTML = original;
    }
  });

  document.getElementById('mermaid-modal-download-svg').addEventListener('click', function() {
    if (!modalCurrentSvgEl) return;
    const serialized = new XMLSerializer().serializeToString(modalCurrentSvgEl);
    const blob = new Blob([serialized], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `diagram-${Date.now()}.svg`; a.click();
    URL.revokeObjectURL(url);
  });

  /**
   * Adds the hover toolbar to every rendered Mermaid container.
   * Safe to call multiple times – existing toolbars are not duplicated.
   */
  function addMermaidToolbars() {
    markdownPreview.querySelectorAll('.mermaid-container').forEach(container => {
      if (container.querySelector('.mermaid-toolbar')) return; // already added
      const svgEl = container.querySelector('svg');
      if (!svgEl) return; // diagram not yet rendered

      const toolbar = document.createElement('div');
      toolbar.className = 'mermaid-toolbar';
      toolbar.setAttribute('aria-label', 'Diagram actions');

      const btnZoom = document.createElement('button');
      btnZoom.className = 'mermaid-toolbar-btn';
      btnZoom.title = 'Zoom diagram';
      btnZoom.setAttribute('aria-label', 'Zoom diagram');
      btnZoom.innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
      btnZoom.addEventListener('click', () => openMermaidZoomModal(container));

      const btnPng = document.createElement('button');
      btnPng.className = 'mermaid-toolbar-btn';
      btnPng.title = 'Download PNG';
      btnPng.setAttribute('aria-label', 'Download PNG');
      btnPng.innerHTML = '<i class="bi bi-file-image"></i> PNG';
      btnPng.addEventListener('click', () => downloadMermaidPng(container, btnPng));

      const btnCopy = document.createElement('button');
      btnCopy.className = 'mermaid-toolbar-btn';
      btnCopy.title = 'Copy image to clipboard';
      btnCopy.setAttribute('aria-label', 'Copy image to clipboard');
      btnCopy.innerHTML = '<i class="bi bi-clipboard-image"></i> Copy';
      btnCopy.addEventListener('click', () => copyMermaidImage(container, btnCopy));

      const btnSvg = document.createElement('button');
      btnSvg.className = 'mermaid-toolbar-btn';
      btnSvg.title = 'Download SVG';
      btnSvg.setAttribute('aria-label', 'Download SVG');
      btnSvg.innerHTML = '<i class="bi bi-filetype-svg"></i> SVG';
      btnSvg.addEventListener('click', () => downloadMermaidSvg(container, btnSvg));

      toolbar.appendChild(btnZoom);
      toolbar.appendChild(btnCopy);
      toolbar.appendChild(btnPng);
      toolbar.appendChild(btnSvg);
      container.appendChild(toolbar);
    });
  }
});
