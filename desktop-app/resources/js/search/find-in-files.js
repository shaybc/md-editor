(function(global) {
  "use strict";

  const HISTORY_LIMIT = 20;
  const DEFAULT_FILE_TYPES = "*.md;*.markdown;*.txt;*.js;*.ts;*.java;*.cs;*.json;*.css;*.html;*.xml;*.yml;*.yaml";
  const DEFAULT_PANEL_HEIGHT = 220;
  const MIN_PANEL_HEIGHT = 120;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/");
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function parseFileTypePatterns(value) {
    const text = String(value || "").trim();
    if (!text) return parseFileTypePatterns(DEFAULT_FILE_TYPES);
    return text
      .split(/[,;\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        if (item === "*.*" || item === "*") return "*";
        if (/^\.[a-z0-9+_-]+$/i.test(item)) return `*${item}`;
        if (/^[a-z0-9+_-]+$/i.test(item)) return `*.${item}`;
        return item;
      });
  }

  function globToRegex(pattern) {
    const normalized = normalizePath(pattern).toLowerCase();
    const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${escaped.replace(/\*\*/g, ".*").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
  }

  function matchesFileType(path, patterns) {
    const normalizedPath = normalizePath(path).toLowerCase();
    if (!normalizedPath) return false;
    const activePatterns = patterns && patterns.length ? patterns : parseFileTypePatterns(DEFAULT_FILE_TYPES);
    return activePatterns.some((pattern) => {
      if (pattern === "*") return true;
      const normalizedPattern = normalizePath(pattern).toLowerCase();
      if (normalizedPattern.includes("*") || normalizedPattern.includes("?")) {
        return globToRegex(normalizedPattern).test(normalizedPath) || globToRegex(`**/${normalizedPattern}`).test(normalizedPath);
      }
      return normalizedPath.endsWith(normalizedPattern);
    });
  }

  function normalizeHistoryList(values) {
    const seen = new Set();
    const output = [];
    (Array.isArray(values) ? values : []).forEach((value) => {
      const text = String(value || "").trim();
      const key = text.toLowerCase();
      if (!text || seen.has(key)) return;
      seen.add(key);
      output.push(text);
    });
    return output.slice(0, HISTORY_LIMIT);
  }

  function addHistoryValue(values, value) {
    return normalizeHistoryList([String(value || "").trim(), ...(Array.isArray(values) ? values : [])]);
  }

  function getLineStartOffsets(content) {
    const offsets = [0];
    String(content || "").replace(/\n/g, function(_match, offset) {
      offsets.push(offset + 1);
      return _match;
    });
    return offsets;
  }

  function getLineForIndex(offsets, index) {
    let low = 0;
    let high = offsets.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (offsets[mid] <= index && (mid === offsets.length - 1 || offsets[mid + 1] > index)) return mid + 1;
      if (offsets[mid] > index) high = mid - 1;
      else low = mid + 1;
    }
    return 1;
  }

  function getPreviewLine(content, lineNumber) {
    return String(content || "").split(/\r?\n/)[Math.max(0, lineNumber - 1)] || "";
  }

  function isWordChar(char) {
    return /[A-Za-z0-9_]/.test(char || "");
  }

  function isWholeWordMatch(content, index, length) {
    return !isWordChar(content[index - 1]) && !isWordChar(content[index + length]);
  }

  function createSearchRegex(query, options = {}) {
    if (!query) return null;
    const flags = `g${options.matchCase ? "" : "i"}`;
    if (options.useRegex) {
      const source = options.wholeWord ? `\\b(?:${query})\\b` : query;
      return new RegExp(source, flags);
    }
    return new RegExp(escapeRegExp(query), flags);
  }

  function findContentMatches(content, query, options = {}) {
    const source = String(content || "");
    const regex = createSearchRegex(query, options);
    if (!regex) return [];
    const offsets = getLineStartOffsets(source);
    const matches = [];
    let match;
    while ((match = regex.exec(source)) !== null) {
      const text = match[0] || "";
      if (!text.length) {
        regex.lastIndex += 1;
        continue;
      }
      const index = match.index;
      if (options.wholeWord && !options.useRegex && !isWholeWordMatch(source, index, text.length)) continue;
      const lineNumber = getLineForIndex(offsets, index);
      const lineStart = offsets[lineNumber - 1] || 0;
      matches.push({
        index,
        length: text.length,
        lineNumber,
        column: index - lineStart + 1,
        preview: getPreviewLine(source, lineNumber)
      });
    }
    return matches;
  }

  function getMatchPreviewHtml(match) {
    const preview = String(match.preview || "");
    const columnIndex = Math.max(0, Number(match.column || 1) - 1);
    const before = preview.slice(0, columnIndex);
    const text = preview.slice(columnIndex, columnIndex + Number(match.length || 0));
    const after = preview.slice(columnIndex + Number(match.length || 0));
    return `${escapeHtml(before)}<mark>${escapeHtml(text)}</mark>${escapeHtml(after)}`;
  }

  function normalizeSearchOptions(options = {}) {
    return {
      query: String(options.query || ""),
      fileTypes: String(options.fileTypes || DEFAULT_FILE_TYPES),
      folder: String(options.folder || ""),
      matchCase: Boolean(options.matchCase),
      wholeWord: Boolean(options.wholeWord),
      useRegex: Boolean(options.useRegex),
      includeSubfolders: options.includeSubfolders !== false
    };
  }

  async function yieldToUi() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function registerFindInFiles(app, deps) {
    let currentBrowserFolderHandle = null;
    let currentBrowserFolderLabel = "";
    let activeSearch = null;
    let selectedResultButton = null;
    const stateKey = "findInFiles";

    const modal = document.getElementById("find-in-files-modal");
    const findInput = document.getElementById("find-in-files-query");
    const typesInput = document.getElementById("find-in-files-types");
    const folderInput = document.getElementById("find-in-files-folder");
    const matchCaseInput = document.getElementById("find-in-files-match-case");
    const wholeWordInput = document.getElementById("find-in-files-whole-word");
    const regexInput = document.getElementById("find-in-files-regex");
    const includeSubfoldersInput = document.getElementById("find-in-files-include-subfolders");
    const findButton = document.getElementById("find-in-files-run");
    const cancelButton = document.getElementById("find-in-files-cancel");
    const closeButton = document.getElementById("find-in-files-close");
    const browseButton = document.getElementById("find-in-files-browse");
    const status = document.getElementById("find-in-files-status");
    const panel = document.getElementById("find-in-files-results-panel");
    const panelStatus = document.getElementById("find-in-files-results-status");
    const panelCloseButton = document.getElementById("find-in-files-results-close");
    const panelBody = document.getElementById("find-in-files-results-body");
    const panelResizer = document.getElementById("find-in-files-results-resizer");
    const contextMenu = document.getElementById("find-in-files-results-menu");
    const clearResultsButton = document.getElementById("find-in-files-clear-results");
    const openResultButton = document.getElementById("find-in-files-open-result");
    const copyResultButton = document.getElementById("find-in-files-copy-result");
    const copyAllButton = document.getElementById("find-in-files-copy-all");
    const comboInputs = [
      { key: "queries", input: findInput, list: document.getElementById("find-in-files-query-history") },
      { key: "types", input: typesInput, list: document.getElementById("find-in-files-types-history") },
      { key: "folders", input: folderInput, list: document.getElementById("find-in-files-folder-history") }
    ];

    const counters = {
      filesSearched: 0,
      filesMatched: 0,
      hits: 0,
      errors: 0,
      currentFile: ""
    };

    function getFeatureState() {
      return deps.loadGlobalState?.()[stateKey] || {};
    }

    function saveFeatureState(patch) {
      deps.saveGlobalState?.({ [stateKey]: { ...getFeatureState(), ...patch } });
    }

    function getHistory(key) {
      return normalizeHistoryList(getFeatureState().history?.[key] || []);
    }

    function saveHistoryValue(key, value) {
      const history = { ...(getFeatureState().history || {}) };
      history[key] = addHistoryValue(history[key], value);
      saveFeatureState({ history });
      renderHistoryOptions();
    }

    function renderHistoryOptions() {
      comboInputs.forEach(({ key, list }) => {
        if (!list) return;
        list.innerHTML = getHistory(key).map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
      });
    }

    function cycleHistory(input, key, direction) {
      const history = getHistory(key);
      if (!input || !history.length) return false;
      const current = String(input.value || "").trim().toLowerCase();
      let index = history.findIndex((item) => item.toLowerCase() === current);
      index = index === -1 ? (direction > 0 ? -1 : 0) : index;
      const next = (index + direction + history.length) % history.length;
      input.value = history[next] || "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }

    function bindHistoryInputs() {
      comboInputs.forEach(({ key, input }) => {
        input?.addEventListener("keydown", (event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          if (!cycleHistory(input, key, event.key === "ArrowDown" ? 1 : -1)) return;
          event.preventDefault();
        });
      });
    }

    function setModalVisible(visible) {
      if (!modal) return;
      modal.style.display = visible ? "flex" : "none";
      modal.setAttribute("aria-hidden", visible ? "false" : "true");
      if (visible) setTimeout(() => findInput?.focus(), 0);
    }

    function setStatus(message) {
      if (status) status.textContent = message || "";
    }

    function setPanelStatus(message) {
      if (panelStatus) panelStatus.textContent = message || "";
    }

    function showPanel() {
      if (!panel) return;
      if (deps.bottomPanel?.activateTab) {
        deps.bottomPanel.activateTab(deps.bottomPanel.SEARCH_RESULTS_TAB_ID || "search-results");
        applyPanelHeight();
        return;
      }
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
      applyPanelHeight();
    }

    function hidePanel() {
      if (!panel) return;
      if (deps.bottomPanel?.hidePanel) {
        deps.bottomPanel.hidePanel();
        hideContextMenu();
        return;
      }
      panel.hidden = true;
      panel.setAttribute("aria-hidden", "true");
      hideContextMenu();
    }

    function toggleResultsPanel() {
      if (!panel) return;
      if (deps.bottomPanel?.activateTab && deps.bottomPanel?.hidePanel) {
        const searchResultsTabId = deps.bottomPanel.SEARCH_RESULTS_TAB_ID || "search-results";
        const searchResultsAreActive = deps.bottomPanel.getActiveTabId?.() === searchResultsTabId;
        const bottomPanelIsVisible = deps.bottomPanel.isPanelVisible?.() ?? panel.hidden !== true;
        if (bottomPanelIsVisible && searchResultsAreActive) {
          deps.bottomPanel.hidePanel();
          hideContextMenu();
        } else {
          deps.bottomPanel.activateTab(searchResultsTabId);
          applyPanelHeight();
        }
        return;
      }
      if (panel.hidden) {
        showPanel();
      } else {
        hidePanel();
      }
    }

    function clearResults() {
      selectedResultButton = null;
      if (panelBody) panelBody.innerHTML = `<div class="find-in-files-empty">No search results.</div>`;
      setPanelStatus("Search results");
    }

    function resetCounters() {
      Object.assign(counters, { filesSearched: 0, filesMatched: 0, hits: 0, errors: 0, currentFile: "" });
    }

    function getCounterText(prefix) {
      const parts = [
        `${counters.hits} hit${counters.hits === 1 ? "" : "s"}`,
        `${counters.filesMatched} matched file${counters.filesMatched === 1 ? "" : "s"}`,
        `${counters.filesSearched} searched`
      ];
      if (counters.errors) parts.push(`${counters.errors} error${counters.errors === 1 ? "" : "s"}`);
      if (counters.currentFile) parts.push(counters.currentFile);
      return `${prefix}: ${parts.join(" | ")}`;
    }

    function updateProgress(prefix = "Searching") {
      const text = getCounterText(prefix);
      setStatus(text);
      setPanelStatus(text);
    }

    function getOptionsFromForm() {
      return normalizeSearchOptions({
        query: findInput?.value,
        fileTypes: typesInput?.value || DEFAULT_FILE_TYPES,
        folder: folderInput?.value,
        matchCase: matchCaseInput?.checked,
        wholeWord: wholeWordInput?.checked,
        useRegex: regexInput?.checked,
        includeSubfolders: includeSubfoldersInput?.checked
      });
    }

    function setRunning(isRunning) {
      if (findButton) findButton.disabled = isRunning;
      if (cancelButton) cancelButton.disabled = !isRunning;
      modal?.classList.toggle("find-in-files-running", isRunning);
    }

    function getSearchModeLabel(options) {
      if (options.useRegex) return "Regular expression";
      return options.wholeWord ? "Normal, whole word" : "Normal";
    }

    function appendSummary(options) {
      if (!panelBody) return;
      panelBody.innerHTML = "";
      const summary = document.createElement("div");
      summary.className = "find-in-files-summary";
      summary.textContent = `Search "${options.query}" in ${options.folder || currentBrowserFolderLabel || "selected folder"} [${getSearchModeLabel(options)}]`;
      panelBody.appendChild(summary);
    }

    function appendFileResult(file, matches) {
      if (!panelBody || !matches.length) return;
      const fileSection = document.createElement("section");
      fileSection.className = "find-in-files-file-result";
      const fileHeader = document.createElement("div");
      fileHeader.className = "find-in-files-file-header";
      fileHeader.textContent = `${file.path || file.name} (${matches.length} hit${matches.length === 1 ? "" : "s"})`;
      fileSection.appendChild(fileHeader);
      matches.forEach((match) => {
        const row = document.createElement("button");
        row.className = "find-in-files-result-row";
        row.type = "button";
        row.dataset.path = file.path || "";
        row.dataset.name = file.name || "";
        row.dataset.line = String(match.lineNumber);
        row.dataset.index = String(match.index);
        row.dataset.length = String(match.length);
        row.dataset.preview = match.preview || "";
        row.innerHTML = `<span class="find-in-files-line">Line ${match.lineNumber}</span><span class="find-in-files-preview">${getMatchPreviewHtml(match)}</span>`;
        row.addEventListener("click", () => selectResultRow(row));
        row.addEventListener("dblclick", () => openResultRow(row));
        fileSection.appendChild(row);
      });
      panelBody.appendChild(fileSection);
    }

    function appendFileError(file, error) {
      if (!panelBody) return;
      const row = document.createElement("div");
      row.className = "find-in-files-error";
      row.textContent = `${file.path || file.name}: ${error?.message || error || "Unable to read file"}`;
      panelBody.appendChild(row);
    }

    function selectResultRow(row) {
      selectedResultButton?.classList.remove("selected");
      selectedResultButton = row;
      selectedResultButton?.classList.add("selected");
    }

    async function openResultRow(row) {
      const target = row || selectedResultButton;
      if (!target) return;
      hideContextMenu();
      const source = activeSearch?.filesByPath?.get(target.dataset.path) || {
        name: target.dataset.name || deps.getFileName?.(target.dataset.path) || "document",
        path: target.dataset.path
      };
      const content = source.content !== undefined ? source.content : await readFileContent(source);
      await deps.openDocumentSourceFile?.({
        name: source.name || deps.getFileName?.(source.path),
        path: source.path || null,
        handle: source.handle || null,
        file: source.file || null,
        content
      }, { temporary: false, title: source.name || deps.getFileName?.(source.path) });
      const start = Number(target.dataset.index);
      const length = Number(target.dataset.length);
      if (Number.isFinite(start) && start >= 0) {
        deps.selectEditorTextRange?.(start, start + Math.max(0, Number.isFinite(length) ? length : 0));
      }
    }

    async function copyText(text) {
      try {
        await navigator.clipboard?.writeText?.(text);
      } catch (_) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
    }

    function getAllResultText() {
      return Array.from(panelBody?.querySelectorAll(".find-in-files-summary, .find-in-files-file-header, .find-in-files-result-row, .find-in-files-error") || [])
        .map((node) => node.textContent.trim())
        .filter(Boolean)
        .join("\n");
    }

    function showContextMenu(x, y, target) {
      if (!contextMenu) return;
      const row = target?.closest?.(".find-in-files-result-row");
      if (row) selectResultRow(row);
      contextMenu.classList.remove("hidden");
      contextMenu.style.left = `${Math.max(4, x)}px`;
      contextMenu.style.top = `${Math.max(4, y)}px`;
      if (openResultButton) openResultButton.disabled = !selectedResultButton;
      if (copyResultButton) copyResultButton.disabled = !selectedResultButton;
    }

    function hideContextMenu() {
      contextMenu?.classList.add("hidden");
    }

    function getPanelHeight() {
      const sharedHeight = Number(deps.bottomPanel?.getPanelHeight?.());
      if (Number.isFinite(sharedHeight) && sharedHeight >= MIN_PANEL_HEIGHT) return sharedHeight;
      const saved = Number(getFeatureState().panelHeight);
      return Number.isFinite(saved) && saved >= MIN_PANEL_HEIGHT ? saved : DEFAULT_PANEL_HEIGHT;
    }

    function applyPanelHeight() {
      if (panel) panel.style.height = `${getPanelHeight()}px`;
    }

    function bindPanelResizer() {
      let dragging = false;
      function onMove(event) {
        if (!dragging || !panel) return;
        const rect = panel.getBoundingClientRect();
        const maxHeight = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - 180);
        const nextHeight = Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, rect.bottom - event.clientY));
        panel.style.height = `${nextHeight}px`;
      }
      function onUp() {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove("find-in-files-resizing");
        const panelHeight = Math.round(panel?.getBoundingClientRect().height || DEFAULT_PANEL_HEIGHT);
        deps.bottomPanel?.setPanelHeight?.(panelHeight);
        saveFeatureState({ panelHeight });
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      }
      panelResizer?.addEventListener("pointerdown", (event) => {
        if (!panel) return;
        dragging = true;
        document.body.classList.add("find-in-files-resizing");
        panelResizer.setPointerCapture?.(event.pointerId);
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        event.preventDefault();
      });
    }

    async function chooseFolder() {
      if (deps.isNeutralinoRuntime?.() && deps.Neutralino?.os?.showFolderDialog) {
        const selected = await deps.Neutralino.os.showFolderDialog("Find in Files");
        if (selected && folderInput) {
          folderInput.value = selected;
          currentBrowserFolderHandle = null;
          currentBrowserFolderLabel = "";
          saveHistoryValue("folders", selected);
        }
        return selected || "";
      }
      if (typeof global.showDirectoryPicker === "function") {
        const handle = await global.showDirectoryPicker();
        if (!handle) return "";
        currentBrowserFolderHandle = handle;
        currentBrowserFolderLabel = handle.name || "Selected folder";
        if (folderInput) folderInput.value = currentBrowserFolderLabel;
        saveHistoryValue("folders", currentBrowserFolderLabel);
        return currentBrowserFolderLabel;
      }
      throw new Error("Folder picker is not available in this environment.");
    }

    async function* walkBrowserDirectory(handle, options, parentPath = "") {
      if (!handle || activeSearch?.cancelled) return;
      for await (const entry of handle.values()) {
        if (activeSearch?.cancelled) return;
        const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
        if (entry.kind === "directory") {
          if (options.includeSubfolders) yield* walkBrowserDirectory(entry, options, path);
        } else if (entry.kind === "file") {
          yield { name: entry.name, path, handle: entry };
        }
        await yieldToUi();
      }
    }

    async function* walkNeutralinoDirectory(dirPath, options, rootPath = dirPath) {
      if (!dirPath || activeSearch?.cancelled) return;
      const entries = await deps.Neutralino.filesystem.readDirectory(dirPath);
      for (const entry of entries || []) {
        if (activeSearch?.cancelled) return;
        const name = entry?.entry || entry?.name;
        if (!name || name === "." || name === ".." || name === ".md-editor") continue;
        const fullPath = `${String(dirPath || "").replace(/[\\/]+$/, "")}/${name}`;
        const relativePath = normalizePath(fullPath).replace(new RegExp(`^${escapeRegExp(normalizePath(rootPath).replace(/\/+$/, ""))}/?`, "i"), "");
        const type = String(entry?.type || "").toUpperCase();
        if (type === "DIRECTORY" || entry?.isDirectory === true) {
          if (options.includeSubfolders) yield* walkNeutralinoDirectory(fullPath, options, rootPath);
        } else if (type === "FILE" || entry?.isFile === true) {
          yield { name, path: normalizePath(fullPath), relativePath };
        }
        await yieldToUi();
      }
    }

    async function readFileContent(file) {
      if (file.content !== undefined) return file.content;
      if (file.handle?.getFile) return (await file.handle.getFile()).text();
      if (file.file?.text) return file.file.text();
      if (file.path && deps.isNeutralinoRuntime?.() && deps.Neutralino?.filesystem?.readFile) {
        return deps.Neutralino.filesystem.readFile(file.path);
      }
      throw new Error("Unable to read this file.");
    }

    function isSearchableFile(file, patterns) {
      const path = file.relativePath || file.path || file.name || "";
      if (!matchesFileType(path, patterns)) return false;
      if (deps.isTextDocumentPath?.(path)) return true;
      return patterns.includes("*");
    }

    async function runFindInFiles() {
      const options = getOptionsFromForm();
      if (!options.query) {
        setStatus("Enter text to search for.");
        findInput?.focus();
        return null;
      }
      try {
        createSearchRegex(options.query, options);
      } catch (error) {
        setStatus(`Invalid regular expression: ${error.message}`);
        regexInput?.focus();
        return null;
      }
      if (!options.folder && !currentBrowserFolderHandle) {
        setStatus("Choose where to search.");
        folderInput?.focus();
        return null;
      }
      if (!deps.isNeutralinoRuntime?.() && !currentBrowserFolderHandle) {
        setStatus("Use the folder button to grant access to a search folder.");
        browseButton?.focus();
        return null;
      }

      comboInputs.forEach(({ key, input }) => saveHistoryValue(key, input?.value));
      showPanel();
      clearResults();
      appendSummary(options);
      resetCounters();
      updateProgress("Searching");
      setRunning(true);
      const patterns = parseFileTypePatterns(options.fileTypes);
      activeSearch = { cancelled: false, filesByPath: new Map(), options };

      try {
        const walker = deps.isNeutralinoRuntime?.() && options.folder
          ? walkNeutralinoDirectory(options.folder, options)
          : walkBrowserDirectory(currentBrowserFolderHandle, options);
        for await (const file of walker) {
          if (activeSearch.cancelled) break;
          if (!isSearchableFile(file, patterns)) continue;
          counters.filesSearched += 1;
          counters.currentFile = file.path || file.name;
          updateProgress("Searching");
          try {
            const content = await readFileContent(file);
            file.content = content;
            const matches = findContentMatches(content, options.query, options);
            if (matches.length) {
              counters.filesMatched += 1;
              counters.hits += matches.length;
              activeSearch.filesByPath.set(file.path || file.name, file);
              appendFileResult(file, matches);
              updateProgress("Searching");
            }
          } catch (error) {
            counters.errors += 1;
            appendFileError(file, error);
            updateProgress("Searching");
          }
        }
        counters.currentFile = "";
        updateProgress(activeSearch.cancelled ? "Canceled" : "Done");
        setStatus(activeSearch.cancelled ? getCounterText("Canceled") : getCounterText("Done"));
      } finally {
        setRunning(false);
      }
      return { ...counters, cancelled: !!activeSearch?.cancelled };
    }

    function cancelSearch() {
      if (!activeSearch) return;
      activeSearch.cancelled = true;
      setStatus(getCounterText("Canceling"));
    }

    function openFindInFilesModal(initialQuery) {
      renderHistoryOptions();
      if (typesInput && !typesInput.value) typesInput.value = getHistory("types")[0] || DEFAULT_FILE_TYPES;
      if (folderInput && !folderInput.value) folderInput.value = getHistory("folders")[0] || "";
      if (initialQuery !== undefined && findInput) findInput.value = String(initialQuery || "");
      if (includeSubfoldersInput) includeSubfoldersInput.checked = includeSubfoldersInput.checked !== false;
      setModalVisible(true);
      setStatus(activeSearch ? getCounterText(activeSearch.cancelled ? "Canceled" : "Ready") : "Ready.");
    }

    function closeFindInFilesModal() {
      setModalVisible(false);
    }

    findButton?.addEventListener("click", () => { void runFindInFiles(); });
    cancelButton?.addEventListener("click", cancelSearch);
    closeButton?.addEventListener("click", closeFindInFilesModal);
    browseButton?.addEventListener("click", async () => {
      try {
        await chooseFolder();
      } catch (error) {
        setStatus(error.message || String(error));
      }
    });
    modal?.addEventListener("click", (event) => {
      if (event.target === modal && !activeSearch) closeFindInFilesModal();
    });
    modal?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeFindInFilesModal();
      if (event.key === "Enter" && event.target?.tagName === "INPUT") {
        event.preventDefault();
        void runFindInFiles();
      }
    });
    panelCloseButton?.addEventListener("click", hidePanel);
    clearResultsButton?.addEventListener("click", () => {
      clearResults();
      hideContextMenu();
    });
    openResultButton?.addEventListener("click", () => { void openResultRow(); });
    copyResultButton?.addEventListener("click", () => {
      if (selectedResultButton) void copyText(selectedResultButton.textContent.trim());
      hideContextMenu();
    });
    copyAllButton?.addEventListener("click", () => {
      void copyText(getAllResultText());
      hideContextMenu();
    });
    document.querySelectorAll(".open-find-in-files-dialog").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        openFindInFilesModal();
        deps.closeMobileMenu?.();
      });
    });
    panelBody?.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showContextMenu(event.clientX, event.clientY, event.target);
    });
    document.addEventListener("click", (event) => {
      if (!contextMenu || contextMenu.classList.contains("hidden")) return;
      if (!contextMenu.contains(event.target)) hideContextMenu();
    });

    bindHistoryInputs();
    bindPanelResizer();
    renderHistoryOptions();
    applyPanelHeight();
    clearResults();

    const api = {
      openFindInFilesModal,
      closeFindInFilesModal,
      toggleResultsPanel,
      runFindInFiles,
      cancelSearch,
      clearResults,
      _test: {
        DEFAULT_FILE_TYPES,
        addHistoryValue,
        createSearchRegex,
        findContentMatches,
        matchesFileType,
        normalizeHistoryList,
        parseFileTypePatterns
      }
    };
    app.registerModule("findInFiles", api);
    return api;
  }

  global.registerMarkdownViewerFindInFiles = registerFindInFiles;
})(typeof window !== "undefined" ? window : globalThis);
