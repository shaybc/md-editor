(function(window) {
  "use strict";

  window.registerMarkdownViewerLargeFileViewer = function registerMarkdownViewerLargeFileViewer(app, deps) {
    const api = {};
    const views = new Map();

    const LARGE_FILE_VIEWER_BYTES = 8 * 1024 * 1024;
    const LARGE_FILE_VIEWER_LINE_CHARS = 200000;
    const HEAVY_TEXT_VIEWER_BYTES = 1024 * 1024;
    const HEAVY_JSON_VIEWER_BYTES = 512 * 1024;
    const HEAVY_JSON_VIEWER_LINES = 2000;
    const VISUAL_CHUNK_CHARS = 10000;
    const WRAPPED_ROW_MIN_CHARS = 20;
    const WRAPPED_ROW_MAX_CHARS = 1000;
    const WRAPPED_ROW_FALLBACK_CHARS = 120;
    const ROW_HEIGHT = 22;
    const BUFFER_ROWS = 12;

    function getSourceName(sourceFile, fallbackName) {
      return fallbackName
        || sourceFile?.name
        || (sourceFile?.path || sourceFile?.fullPath ? deps.getFileName(sourceFile.path || sourceFile.fullPath) : "")
        || sourceFile?.file?.name
        || sourceFile?.handle?.name
        || "large-file.txt";
    }

    function getSourceSize(sourceFile, content) {
      if (typeof content === "string") return content.length;
      const size = Number(sourceFile?.size ?? sourceFile?.file?.size);
      return Number.isFinite(size) ? size : 0;
    }

    function getViewerLogErrorDetails(error) {
      return {
        name: error?.name || "Error",
        message: error?.message || String(error || "Unknown error")
      };
    }

    function logLargeFileViewer(level, message, details) {
      if (typeof deps.appDebugLog === "function") {
        void deps.appDebugLog(level, `[large-file-viewer] ${message}`, details);
      }
    }

    function getLongestLineLength(content, limit = LARGE_FILE_VIEWER_LINE_CHARS) {
      const text = String(content || "");
      let currentLength = 0;
      let longestLength = 0;
      for (let index = 0; index < text.length; index += 1) {
        const char = text.charAt(index);
        if (char === "\n" || char === "\r") {
          if (currentLength > longestLength) longestLength = currentLength;
          currentLength = 0;
          if (longestLength > limit) return longestLength;
          if (char === "\r" && text.charAt(index + 1) === "\n") index += 1;
        } else {
          currentLength += 1;
          if (currentLength > limit) return currentLength;
        }
      }
      return Math.max(longestLength, currentLength);
    }

    function getLineCount(content, limit) {
      const text = String(content || "");
      let count = 1;
      for (let index = 0; index < text.length; index += 1) {
        if (text.charAt(index) === "\n") {
          count += 1;
          if (limit && count > limit) return count;
        }
      }
      return count;
    }

    function isConverterReportJsonPath(name) {
      const leafName = String(name || "").split(/[\\/]/).pop();
      return /^missing_dependencies_report\.json$/i.test(leafName)
        || /^_[a-z0-9_-]*converter_report\.json$/i.test(leafName)
        || /^_java_converter_report\.json$/i.test(leafName);
    }

    function classifyLargeDocumentOpen(sourceFile, name, content) {
      const sourceName = getSourceName(sourceFile, name);
      const size = getSourceSize(sourceFile, content);
      const isJson = /\.json$/i.test(sourceName);
      const isTextDocument = deps.isTextDocumentPath(sourceName);
      const result = {
        useViewer: false,
        reason: "",
        readOnly: true,
        displayName: sourceName
      };

      if (!isTextDocument) return result;
      if (isConverterReportJsonPath(sourceName)) {
        return { ...result, useViewer: true, reason: "converter-report-json" };
      }
      if (isJson && size > HEAVY_JSON_VIEWER_BYTES) {
        return { ...result, useViewer: true, reason: "large-json" };
      }
      if (isJson && typeof content === "string" && getLineCount(content, HEAVY_JSON_VIEWER_LINES) > HEAVY_JSON_VIEWER_LINES) {
        return { ...result, useViewer: true, reason: "large-json-lines" };
      }
      if (!isJson && size > HEAVY_TEXT_VIEWER_BYTES) {
        return { ...result, useViewer: true, reason: "large-text" };
      }
      if (size > LARGE_FILE_VIEWER_BYTES) {
        return { ...result, useViewer: true, reason: "large-file" };
      }
      if (typeof content === "string" && getLongestLineLength(content) > LARGE_FILE_VIEWER_LINE_CHARS) {
        return { ...result, useViewer: true, reason: "long-line" };
      }
      return result;
    }

    function shouldUseLargeFileViewer(sourceFile, name, content) {
      const sourceName = getSourceName(sourceFile, name);
      const classification = classifyLargeDocumentOpen(sourceFile, name, content);
      if (!deps.isTextDocumentPath(sourceName)) {
        logLargeFileViewer("debug", "decision: unsupported path", { sourceName, size: getSourceSize(sourceFile, content) });
        return false;
      }
      logLargeFileViewer("debug", "decision: classified", {
        sourceName,
        size: getSourceSize(sourceFile, content),
        hasContent: typeof content === "string",
        reason: classification.reason || "editable",
        shouldUse: classification.useViewer
      });
      return classification.useViewer;
    }

    function createLargeFileViewSource(sourceFile, name, content, reason) {
      const sourceName = getSourceName(sourceFile, name);
      return {
        name: sourceName,
        path: sourceFile?.path || sourceFile?.fullPath || null,
        handle: sourceFile?.handle || null,
        file: sourceFile?.file || null,
        content: typeof content === "string" ? content : undefined,
        size: getSourceSize(sourceFile, content),
        reason: reason || classifyLargeDocumentOpen(sourceFile, sourceName, content).reason || "large-file",
        readOnly: sourceFile?.readOnly !== false
      };
    }

    async function readLargeFileSource(source) {
      if (typeof source?.content === "string") return source.content;
      if (typeof deps.NL_VERSION !== "undefined" && source?.path) {
        logLargeFileViewer("debug", "reading viewer source through Neutralino", {
          name: source.name || "",
          path: source.path,
          size: Number(source.size || 0)
        });
        return deps.Neutralino.filesystem.readFile(source.path);
      }
      let file = source?.file || null;
      if (!file && source?.handle) file = await source.handle.getFile();
      if (!file) throw new Error("No readable file was provided.");
      logLargeFileViewer("debug", "reading viewer source through browser file", {
        name: source.name || file.name || "",
        size: Number(source.size || file.size || 0)
      });
      return file.text();
    }

    function normalizeWrapColumn(wrapColumn) {
      const numeric = Math.floor(Number(wrapColumn));
      if (!Number.isFinite(numeric) || numeric <= 0) return WRAPPED_ROW_FALLBACK_CHARS;
      return Math.max(WRAPPED_ROW_MIN_CHARS, Math.min(WRAPPED_ROW_MAX_CHARS, numeric));
    }

    function getWrapColumnForView(view) {
      if (!view?.scroller) return WRAPPED_ROW_FALLBACK_CHARS;
      const sample = view.rowsNode || view.scroller;
      const computed = window.getComputedStyle ? window.getComputedStyle(sample) : null;
      const fontSize = Number.parseFloat(computed?.fontSize) || 14;
      const charWidth = Math.max(7, fontSize * 0.58);
      const gutterWidth = view.scroller.querySelector?.(".large-file-viewer-line-number")?.getBoundingClientRect?.().width || 72;
      const contentWidth = Math.max(0, view.scroller.clientWidth - gutterWidth - 28);
      return normalizeWrapColumn(Math.floor(contentWidth / charWidth));
    }

    function buildRows(text, options = {}) {
      const source = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const rows = [];
      let lineNumber = 1;
      let lineStart = 0;
      const wordWrap = options.wordWrap === true;
      const wrapColumn = normalizeWrapColumn(options.wrapColumn);

      for (let index = 0; index <= source.length; index += 1) {
        if (index !== source.length && source.charAt(index) !== "\n") continue;
        const line = source.slice(lineStart, index);
        const chunkSize = wordWrap ? wrapColumn : VISUAL_CHUNK_CHARS;
        const chunkCount = Math.max(1, Math.ceil(line.length / chunkSize));
        for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
          const start = chunkIndex * chunkSize;
          rows.push({
            lineNumber,
            chunkIndex,
            chunkCount,
            text: line.slice(start, start + chunkSize)
          });
        }
        lineNumber += 1;
        lineStart = index + 1;
      }

      return rows;
    }

    function calculateDocumentStats(content) {
      const text = String(content || "");
      const trimmed = text.trim();
      const wordCount = trimmed === "" ? 0 : trimmed.split(/\s+/).length;
      return {
        charCount: text.length,
        wordCount,
        readingTimeMinutes: Math.ceil(wordCount / 200)
      };
    }

    function getLargeFileDocumentStats(tabOrId) {
      const tabId = typeof tabOrId === "string" ? tabOrId : tabOrId?.id;
      const view = tabId ? views.get(tabId) : null;
      return view?.tab?.largeFileDocumentStats || (typeof tabOrId === "object" ? tabOrId?.largeFileDocumentStats : null) || null;
    }

    function formatBytes(bytes) {
      const value = Number(bytes) || 0;
      if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
      if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
      return `${value} B`;
    }

    function createViewerShell(tab) {
      const shell = document.createElement("div");
      shell.className = "large-file-viewer";
      shell.innerHTML = `
        <div class="large-file-viewer-toolbar">
          <div class="large-file-viewer-title">
            <i class="bi bi-file-earmark-text" aria-hidden="true"></i>
            <span></span>
          </div>
          <label class="large-file-viewer-search">
            <span class="visually-hidden">Search large file</span>
            <input type="search" placeholder="Search" autocomplete="off">
          </label>
          <button class="large-file-viewer-button" type="button" data-action="prev" title="Previous match" aria-label="Previous match">
            <i class="bi bi-chevron-up" aria-hidden="true"></i>
          </button>
          <button class="large-file-viewer-button" type="button" data-action="next" title="Next match" aria-label="Next match">
            <i class="bi bi-chevron-down" aria-hidden="true"></i>
          </button>
          <span class="large-file-viewer-badge">Read-only</span>
          <span class="large-file-viewer-status"></span>
        </div>
        <div class="large-file-viewer-scroller" tabindex="0" role="region" aria-label="Large file content">
          <div class="large-file-viewer-spacer"></div>
          <div class="large-file-viewer-rows"></div>
        </div>
      `;
      shell.querySelector(".large-file-viewer-title span").textContent = tab.sourceFileName || tab.title || "Large file";
      return shell;
    }

    function updateStatus(view, message) {
      if (view.status) view.status.textContent = message || "";
    }

    function renderRows(view) {
      if (!view.rows.length) {
        view.rowsNode.innerHTML = "";
        view.rowsNode.style.transform = "translateY(0px)";
        return;
      }

      const visibleCount = Math.ceil(view.scroller.clientHeight / ROW_HEIGHT) + (BUFFER_ROWS * 2);
      const firstRow = Math.max(0, Math.floor(view.scroller.scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
      const lastRow = Math.min(view.rows.length, firstRow + visibleCount);
      const fragment = document.createDocumentFragment();
      const activeMatchRow = view.searchMatches[view.activeMatchIndex]?.rowIndex;

      for (let rowIndex = firstRow; rowIndex < lastRow; rowIndex += 1) {
        const row = view.rows[rowIndex];
        const line = document.createElement("div");
        line.className = "large-file-viewer-row";
        if (rowIndex === activeMatchRow) line.classList.add("search-active");

        const gutter = document.createElement("span");
        gutter.className = "large-file-viewer-line-number";
        gutter.textContent = row.chunkIndex === 0 ? String(row.lineNumber) : ">";

        const text = document.createElement("span");
        text.className = "large-file-viewer-line-text";
        text.textContent = row.text || " ";

        line.append(gutter, text);
        fragment.appendChild(line);
      }

      view.rowsNode.style.transform = `translateY(${firstRow * ROW_HEIGHT}px)`;
      view.rowsNode.replaceChildren(fragment);
    }

    function rebuildRowsForView(view) {
      if (!view) return;
      view.wrapColumn = view.wordWrapEnabled ? getWrapColumnForView(view) : 0;
      view.rows = buildRows(view.content || "", {
        wordWrap: view.wordWrapEnabled,
        wrapColumn: view.wrapColumn
      });
      if (view.spacer) view.spacer.style.height = `${Math.max(1, view.rows.length) * ROW_HEIGHT}px`;
      updateSearchStatus(view);
      renderRows(view);
    }

    function scrollToRow(view, rowIndex) {
      if (!Number.isFinite(rowIndex)) return;
      view.scroller.scrollTop = Math.max(0, rowIndex * ROW_HEIGHT - ROW_HEIGHT * 3);
      renderRows(view);
    }

    function updateSearchStatus(view) {
      if (!view.searchQuery) {
        const reason = view.reason ? `${view.reason.replace(/-/g, " ")} - ` : "";
        updateStatus(view, `${reason}${view.rows.length.toLocaleString()} visual rows, ${formatBytes(view.sourceSize)}`);
        return;
      }
      if (!view.searchMatches.length) {
        updateStatus(view, "No matches");
        return;
      }
      updateStatus(view, `${view.activeMatchIndex + 1} of ${view.searchMatches.length}`);
    }

    async function runSearch(view) {
      const query = view.searchInput.value;
      const previousActiveMatchIndex = view.activeMatchIndex;
      view.searchQuery = query;
      saveViewState(view);
      view.searchMatches = [];
      view.activeMatchIndex = -1;
      if (!query) {
        updateSearchStatus(view);
        renderRows(view);
        return;
      }

      updateStatus(view, "Searching...");
      const needle = query.toLowerCase();
      for (let index = 0; index < view.rows.length; index += 1) {
        if (view.rows[index].text.toLowerCase().includes(needle)) {
          view.searchMatches.push({ rowIndex: index });
        }
        if (index > 0 && index % 2500 === 0) {
          updateStatus(view, `Searching ${index.toLocaleString()} rows...`);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      view.activeMatchIndex = view.searchMatches.length
        ? Math.max(0, Math.min(previousActiveMatchIndex, view.searchMatches.length - 1))
        : -1;
      saveViewState(view);
      updateSearchStatus(view);
      if (view.activeMatchIndex >= 0) scrollToRow(view, view.searchMatches[0].rowIndex);
      else renderRows(view);
    }

    function moveSearchMatch(view, delta) {
      if (!view.searchMatches.length) return;
      view.activeMatchIndex = (view.activeMatchIndex + delta + view.searchMatches.length) % view.searchMatches.length;
      saveViewState(view);
      updateSearchStatus(view);
      scrollToRow(view, view.searchMatches[view.activeMatchIndex].rowIndex);
    }

    function saveViewState(view) {
      if (!view?.tab) return;
      view.tab.largeFileViewState = {
        scrollTop: view.scroller ? view.scroller.scrollTop : 0,
        searchQuery: view.searchQuery || "",
        activeMatchIndex: view.activeMatchIndex
      };
    }

    function bindViewer(view) {
      let searchTimer = null;
      view.scroller.addEventListener("scroll", () => {
        saveViewState(view);
        if (view.renderFrame) cancelAnimationFrame(view.renderFrame);
        view.renderFrame = requestAnimationFrame(() => renderRows(view));
      });
      view.searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { void runSearch(view); }, 180);
      });
      view.shell.querySelector('[data-action="prev"]')?.addEventListener("click", () => moveSearchMatch(view, -1));
      view.shell.querySelector('[data-action="next"]')?.addEventListener("click", () => moveSearchMatch(view, 1));
      if (typeof ResizeObserver === "function") {
        view.resizeObserver = new ResizeObserver(() => {
          if (!view.wordWrapEnabled) return;
          const nextWrapColumn = getWrapColumnForView(view);
          if (nextWrapColumn === view.wrapColumn) return;
          const previousScrollTop = view.scroller.scrollTop;
          rebuildRowsForView(view);
          view.scroller.scrollTop = previousScrollTop;
          saveViewState(view);
          if (view.searchQuery) void runSearch(view);
        });
        view.resizeObserver.observe(view.scroller);
      }
    }

    async function mountLargeFileTab(tab, root) {
      if (!tab?.id || !root) return null;
      let view = views.get(tab.id);
      if (view && view.root === root) return view;

      logLargeFileViewer("info", "mount started", {
        tabId: tab.id,
        title: tab.title,
        sourceName: tab.largeFileSource?.name || tab.sourceFileName || "",
        sourcePath: tab.largeFileSource?.path || tab.sourceFilePath || "",
        sourceSize: Number(tab.largeFileSource?.size || 0)
      });
      root.innerHTML = "";
      const shell = createViewerShell(tab);
      root.appendChild(shell);
      const savedState = tab.largeFileViewState || {};

      view = {
        tabId: tab.id,
        tab,
        root,
        shell,
        sourceSize: tab.largeFileSource?.size || 0,
        reason: tab.largeFileSource?.reason || "",
        rows: [],
        searchQuery: savedState.searchQuery || "",
        searchMatches: [],
        activeMatchIndex: Number.isFinite(savedState.activeMatchIndex) ? savedState.activeMatchIndex : -1,
        content: "",
        wordWrapEnabled: deps.getWordWrapEnabled?.() === true,
        wrapColumn: 0,
        renderFrame: null,
        scroller: shell.querySelector(".large-file-viewer-scroller"),
        spacer: shell.querySelector(".large-file-viewer-spacer"),
        rowsNode: shell.querySelector(".large-file-viewer-rows"),
        status: shell.querySelector(".large-file-viewer-status"),
        searchInput: shell.querySelector(".large-file-viewer-search input")
      };
      views.set(tab.id, view);
      bindViewer(view);
      if (view.searchInput) view.searchInput.value = view.searchQuery;
      updateStatus(view, "Loading...");

      try {
        const content = await readLargeFileSource(tab.largeFileSource || {});
        logLargeFileViewer("debug", "source read completed", {
          tabId: tab.id,
          length: content.length
        });
        view.sourceSize = content.length;
        view.content = content;
        tab.largeFileDocumentStats = calculateDocumentStats(content);
        view.wrapColumn = view.wordWrapEnabled ? getWrapColumnForView(view) : 0;
        view.rows = buildRows(content, {
          wordWrap: view.wordWrapEnabled,
          wrapColumn: view.wrapColumn
        });
        view.spacer.style.height = `${Math.max(1, view.rows.length) * ROW_HEIGHT}px`;
        logLargeFileViewer("info", "rows built", {
          tabId: tab.id,
          rows: view.rows.length,
          sourceSize: view.sourceSize
        });
        updateSearchStatus(view);
        if (view.searchQuery) await runSearch(view);
        if (Number.isFinite(savedState.scrollTop)) view.scroller.scrollTop = Math.max(0, savedState.scrollTop);
        renderRows(view);
        if (deps.getActiveTab?.()?.id === tab.id && typeof deps.updateDocumentStats === "function") {
          deps.updateDocumentStats();
        }
      } catch (error) {
        logLargeFileViewer("error", "mount failed", {
          tabId: tab.id,
          sourceName: tab.largeFileSource?.name || "",
          sourcePath: tab.largeFileSource?.path || "",
          error: getViewerLogErrorDetails(error)
        });
        console.error("Failed to open large file viewer:", error);
        updateStatus(view, "Unable to read this file");
      }

      return view;
    }

    function destroyLargeFileTab(tabId) {
      const view = views.get(tabId);
      if (!view) return;
      if (view.renderFrame) cancelAnimationFrame(view.renderFrame);
      view.resizeObserver?.disconnect?.();
      view.root.innerHTML = "";
      views.delete(tabId);
    }

    function setWordWrap(enabled) {
      const wordWrapEnabled = enabled === true;
      views.forEach(function(view) {
        if (view.wordWrapEnabled === wordWrapEnabled) return;
        view.wordWrapEnabled = wordWrapEnabled;
        const previousScrollTop = view.scroller?.scrollTop || 0;
        rebuildRowsForView(view);
        if (view.scroller) view.scroller.scrollTop = previousScrollTop;
        saveViewState(view);
        if (view.searchQuery) void runSearch(view);
      });
    }

    Object.assign(api, {
      LARGE_FILE_VIEWER_BYTES,
      LARGE_FILE_VIEWER_LINE_CHARS,
      HEAVY_TEXT_VIEWER_BYTES,
      HEAVY_JSON_VIEWER_BYTES,
      HEAVY_JSON_VIEWER_LINES,
      VISUAL_CHUNK_CHARS,
      WRAPPED_ROW_FALLBACK_CHARS,
      getLongestLineLength,
      getLineCount,
      classifyLargeDocumentOpen,
      shouldUseLargeFileViewer,
      createLargeFileViewSource,
      calculateDocumentStats,
      getLargeFileDocumentStats,
      mountLargeFileTab,
      destroyLargeFileTab,
      setWordWrap,
      _test: { buildRows, calculateDocumentStats, normalizeWrapColumn }
    });

    app.services.largeFileViewer = api;
    app.registerModule("largeFileViewer", api);
    return api;
  };
})(window);
