(function(global) {
  "use strict";
  const DEFAULT_MAX_SEARCH_RESULTS = 300;

  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function normalizePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/");
  }

  function getEntryPath(entry) {
    return normalizePath(entry?.fullPath || entry?.path || entry?.file?.webkitRelativePath || entry?.file?.name || entry?.name || "");
  }

  function getEntryName(entry) {
    const path = getEntryPath(entry);
    return entry?.name || path.split("/").pop() || "document";
  }

  function normalizeSearchResultLimit(value) {
    const limit = Number(value);
    if (!Number.isFinite(limit)) return DEFAULT_MAX_SEARCH_RESULTS;
    return Math.max(1, Math.min(100000, Math.floor(limit)));
  }

  function normalizeOptions(options) {
    return {
      query: String(options?.query || ""),
      include: String(options?.include || ""),
      exclude: String(options?.exclude || ""),
      replacement: String(options?.replacement || ""),
      matchCase: Boolean(options?.matchCase),
      includeUnsupported: Boolean(options?.includeUnsupported),
      searchSubfolders: options?.searchSubfolders !== false,
      maxResults: normalizeSearchResultLimit(options?.maxResults)
    };
  }

  function parsePathPatterns(value) {
    return String(value || "").split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);
  }

  function globToRegex(pattern) {
    const escaped = String(pattern || "").replace(/[.+^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escaped.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, "."), "i");
  }

  function pathMatchesPattern(path, pattern) {
    const target = normalizePath(path).toLowerCase().replace(/^\.\//, "");
    const normalized = normalizePath(pattern).toLowerCase();
    if (!normalized) return false;
    if (normalized.startsWith("./") && normalized.endsWith("/**")) {
      const folderScope = normalized.slice(2, -3).replace(/\/+$/, "");
      return !folderScope || target === folderScope || target.startsWith(`${folderScope}/`);
    }
    if (normalized.includes("*") || normalized.includes("?")) return globToRegex(normalized).test(target);
    return target.includes(normalized);
  }

  function matchesPathFilters(entry, options) {
    const pathCandidates = Array.from(new Set([
      getEntryPath(entry),
      entry?.path,
      entry?.file?.webkitRelativePath,
      entry?.file?.name,
      entry?.name,
      getEntryName(entry)
    ].filter(Boolean)));
    const includes = parsePathPatterns(options.include);
    const excludes = parsePathPatterns(options.exclude);
    const matchesAnyPath = (pattern) => pathCandidates.some((path) => pathMatchesPattern(path, pattern));
    if (includes.length && !includes.some(matchesAnyPath)) return false;
    return !excludes.some(matchesAnyPath);
  }

  function renderValue(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(renderValue).join(" ");
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key} ${renderValue(item)}`).join(" ");
    return String(value);
  }

  function buildMetadataText(content, deps) {
    const parsed = deps.parseFrontmatter ? deps.parseFrontmatter(content) : { frontmatter: null };
    const tags = deps.getFileTagsFromContent ? deps.getFileTagsFromContent(content) : [];
    return {
      frontmatter: parsed.frontmatter,
      tags,
      text: [renderValue(parsed.frontmatter), tags.map((tag) => `#${tag} ${tag}`).join(" ")].filter(Boolean).join("\n")
    };
  }

  function getLineStartOffsets(content) {
    const offsets = [0];
    String(content || "").replace(/\n/g, function(match, offset) {
      offsets.push(offset + 1);
      return match;
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

  function normalizeEditorContent(content) {
    return String(content || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function getEditorOffsetForSourceIndex(content, index) {
    return normalizeEditorContent(String(content || "").slice(0, Math.max(0, Number(index) || 0))).length;
  }

  function findLiteralMatches(content, query, matchCase) {
    const source = String(content || "");
    if (!query) return [];
    const haystack = matchCase ? source : source.toLowerCase();
    const needle = matchCase ? query : query.toLowerCase();
    const offsets = getLineStartOffsets(source);
    const matches = [];
    let index = 0;
    while (needle && index <= haystack.length) {
      const found = haystack.indexOf(needle, index);
      if (found === -1) break;
      const lineNumber = getLineForIndex(offsets, found);
      matches.push({ index: getEditorOffsetForSourceIndex(source, found), length: normalizeEditorContent(source.slice(found, found + query.length)).length, lineNumber, preview: getPreviewLine(source, lineNumber).trim() });
      index = found + Math.max(needle.length, 1);
    }
    return matches;
  }

  function findSearchMatches(content, query, options, metadata) {
    const contentMatches = findLiteralMatches(content, query, options.matchCase);
    if (contentMatches.length || !query) return contentMatches;
    const metadataText = metadata?.text || "";
    const haystack = options.matchCase ? metadataText : metadataText.toLowerCase();
    const needle = options.matchCase ? query : query.toLowerCase();
    if (!haystack.includes(needle)) return [];
    return [{ index: -1, length: query.length, lineNumber: 1, preview: `metadata: ${metadataText.replace(/\s+/g, " ").trim()}` }];
  }

  function createResult(entry, content, options, deps) {
    const normalized = normalizeOptions(options);
    if (!matchesPathFilters(entry, normalized)) return null;
    const metadata = buildMetadataText(content, deps);
    const matches = findSearchMatches(content, normalized.query, normalized, metadata);
    if (normalized.query && !matches.length) return null;
    return { entry, name: getEntryName(entry), path: getEntryPath(entry), content, tags: metadata.tags, frontmatter: metadata.frontmatter, matches };
  }

  async function* iterateSearchEntries(entries) {
    const source = await entries;
    if (!source) return;
    for await (const entry of source) yield entry;
  }

  async function runSearch(entries, options, deps, onResult, isStopped) {
    const normalizedOptions = normalizeOptions(options);
    const results = [];
    let foundResultCount = 0;
    for await (const entry of iterateSearchEntries(entries)) {
      if (isStopped?.()) break;
      try {
        const content = await deps.readEntryContent(entry);
        if (isStopped?.()) break;
        const result = createResult(entry, content, normalizedOptions, deps);
        if (result) {
          results.push(result);
          foundResultCount += 1;
          if (foundResultCount >= normalizedOptions.maxResults) {
            results.limitReached = true;
            results.resultLimit = normalizedOptions.maxResults;
          }
          onResult?.(result, results);
          if (results.limitReached) break;
        }
      } catch (error) {
        if (isStopped?.()) break;
        const result = { entry, name: getEntryName(entry), path: getEntryPath(entry), error: error.message || String(error), matches: [] };
        results.push(result);
        onResult?.(result, results);
      }
    }
    return results;
  }

  function replaceAllLiteral(content, query, replacement, matchCase) {
    const source = String(content || "");
    if (!query) return source;
    const haystack = matchCase ? source : source.toLowerCase();
    const needle = matchCase ? query : query.toLowerCase();
    let cursor = 0;
    let output = "";
    while (cursor <= source.length) {
      const found = haystack.indexOf(needle, cursor);
      if (found === -1) return output + source.slice(cursor);
      output += source.slice(cursor, found) + replacement;
      cursor = found + query.length;
    }
    return output;
  }

  function previewReplace(results, options) {
    const normalized = normalizeOptions(options);
    if (!normalized.query) return { options: normalized, files: [], totalMatches: 0 };
    const files = (results || []).filter((result) => !result.error && result.matches?.some((match) => match.index >= 0)).map((result) => {
      const nextContent = replaceAllLiteral(result.content, normalized.query, normalized.replacement, normalized.matchCase);
      return { entry: result.entry, name: result.name, path: result.path, previousContent: result.content, nextContent, matches: result.matches.filter((match) => match.index >= 0), changed: nextContent !== result.content };
    }).filter((file) => file.changed);
    return { options: normalized, files, totalMatches: files.reduce((sum, file) => sum + file.matches.length, 0) };
  }

  function registerWorkspaceSearch(app, deps) {
    let lastResults = [];
    let lastPreview = null;
    let debounceTimer = null;
    let searchRunId = 0;
    let activeSearch = null;
    const panel = document.getElementById("workspace-search-panel");
    const queryInput = document.getElementById("workspace-search-query");
    const includeInput = document.getElementById("workspace-search-include");
    const excludeInput = document.getElementById("workspace-search-exclude");
    const replaceInput = document.getElementById("workspace-search-replace");
    const matchCaseButton = document.getElementById("workspace-search-match-case");
    const includeUnsupportedInput = document.getElementById("workspace-search-include-unsupported");
    const searchSubfoldersInput = document.getElementById("workspace-search-subfolders");
    const busyIndicator = document.getElementById("workspace-search-busy");
    const status = document.getElementById("workspace-search-status");
    const resultsList = document.getElementById("workspace-search-results");
    const searchButton = document.getElementById("workspace-search-run");
    const clearButton = document.getElementById("workspace-search-clear");
    const previewButton = document.getElementById("workspace-search-preview-replace");
    const applyButton = document.getElementById("workspace-search-apply-replace");
    const folderTreeRoot = document.getElementById("folder-tree-root");
    global.registerMarkdownViewerWorkspaceSearchResultCopy?.({
      container: resultsList,
      getResults: () => lastResults,
      copyText: deps.copyTextToClipboard
    });

    function confirmWorkspaceSearchAction(message) {
      if (typeof app?.services?.confirm === "function") return app.services.confirm(message);
      return Promise.resolve(typeof global.confirm === "function" ? global.confirm(message) : false);
    }
    const gitPanel = document.getElementById("workspace-git-panel");
    const apiClientPanel = document.getElementById("api-client-sidebar-panel");
    const soapClientPanel = document.getElementById("soap-client-sidebar-panel");
    const regexTesterPanel = document.getElementById("regex-tester-sidebar-panel");
    const folderTreePane = document.getElementById("folder-tree-pane");
    const folderTreeTopbar = document.querySelector(".folder-tree-topbar");
    const dropzonePanel = document.querySelector(".sidebar-dropzone-panel");
    const dropzoneResizer = document.getElementById("sidebar-dropzone-resizer");

    function isMatchCase() {
      return matchCaseButton?.getAttribute("aria-pressed") === "true";
    }

    function getOptions() {
      return normalizeOptions({ query: queryInput?.value, include: includeInput?.value, exclude: excludeInput?.value, replacement: replaceInput?.value, matchCase: isMatchCase(), includeUnsupported: includeUnsupportedInput?.checked, searchSubfolders: searchSubfoldersInput?.checked !== false });
    }

    function setSearching(isSearching) {
      panel?.classList.toggle("is-searching", isSearching);
      if (busyIndicator) busyIndicator.hidden = !isSearching;
      if (searchButton) {
        searchButton.classList.toggle("is-active", isSearching);
        searchButton.title = isSearching ? "Stop search" : "Refresh search";
        searchButton.setAttribute("aria-label", isSearching ? "Stop search" : "Refresh search");
        const icon = searchButton.querySelector("i");
        if (icon) icon.className = isSearching ? "bi bi-stop-fill" : "bi bi-arrow-clockwise";
      }
    }

    function stopWorkspaceSearch() {
      if (!activeSearch) return lastResults;
      activeSearch.stopped = true;
      if (status) status.textContent = "Stopping...";
      return lastResults;
    }

    function collectTreeFiles(nodes, files) {
      (nodes || []).forEach((node) => node.kind === "directory" ? collectTreeFiles(node.children || [], files) : files.push(node));
      return files;
    }

    function dedupeEntries(entries) {
      const seen = new Set();
      return (entries || []).filter((entry) => {
        const key = (getEntryPath(entry) || getEntryName(entry)).toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    async function* getWorkspaceSearchEntries(options) {
      if (typeof deps.getWorkspaceSearchFiles === "function") {
        const entries = await deps.getWorkspaceSearchFiles(options);
        if (entries) {
          yield* iterateSearchEntries(entries);
          return;
        }
      }
      if (typeof deps.getWorkspaceMarkdownFiles === "function") {
        const entries = await deps.getWorkspaceMarkdownFiles(options);
        if (entries) {
          yield* iterateSearchEntries(entries);
          return;
        }
      }
      yield* iterateSearchEntries(deps.getFolderMarkdownFiles ? deps.getFolderMarkdownFiles() : []);
    }

    function entryMatchesSubfolderScope(entry, options) {
      if (options.searchSubfolders !== false) return true;
      const path = normalizePath(entry?.path || entry?.file?.webkitRelativePath || entry?.file?.name || entry?.name || getEntryPath(entry));
      return !path.includes("/");
    }

    function isSupportedWorkspaceEntry(entry) {
      if (!deps.isSupportedFolderTreeDocumentNode) return true;
      if (deps.isSupportedFolderTreeDocumentNode(entry)) return true;
      if (entry && !entry.kind) return deps.isSupportedFolderTreeDocumentNode({ ...entry, kind: "file" });
      return false;
    }

    function entryMatchesSearchScope(entry, options) {
      if (!entryMatchesSubfolderScope(entry, options)) return false;
      const path = getEntryPath(entry) || getEntryName(entry);
      if (deps.isMarkdownPath?.(path)) return true;
      if (options.includeUnsupported) return deps.isTextDocumentPath ? deps.isTextDocumentPath(path) : true;
      return isSupportedWorkspaceEntry(entry);
    }

    async function* getSearchEntries(options) {
      const seen = new Set();
      for await (const entry of getWorkspaceSearchEntries(options)) {
        const key = (getEntryPath(entry) || getEntryName(entry)).toLowerCase();
        if (!key || seen.has(key) || !entryMatchesSearchScope(entry, options)) continue;
        seen.add(key);
        yield entry;
      }
      const treeEntries = collectTreeFiles(deps.getCurrentFolderTreeNodes ? deps.getCurrentFolderTreeNodes() : [], []);
      for (const entry of treeEntries) {
        const key = (getEntryPath(entry) || getEntryName(entry)).toLowerCase();
        if (!key || seen.has(key) || !entryMatchesSearchScope(entry, options)) continue;
        seen.add(key);
        yield entry;
      }
    }

    function getAiCompanionPanel() {
      return app.modules?.aiCompanionPanel || null;
    }

    function setSidebarView(view) {
      const targetView = view || "files";
      const searchView = targetView === "search";
      const gitView = targetView === "git";
      const apiClientView = targetView === "api-client";
      const soapClientView = targetView === "soap-client";
      const regexTesterView = targetView === "regex-tester";
      const aiCompanionView = targetView === "ai-companion";
      const toolView = searchView || gitView || apiClientView || soapClientView || regexTesterView;
      const hideFolderView = toolView || aiCompanionView;
      const previousSidebarView = getActiveSidebarView();
      if (aiCompanionView) {
        getAiCompanionPanel()?.setWorkspaceOpen?.(true, { previousSidebarView });
      } else {
        getAiCompanionPanel()?.closeWorkspaceForExternalNavigation?.();
      }
      if (panel) panel.hidden = !searchView;
      if (gitPanel) gitPanel.hidden = !gitView;
      if (regexTesterPanel) regexTesterPanel.hidden = !regexTesterView;
      if (apiClientPanel) apiClientPanel.hidden = !apiClientView;
      if (soapClientView) app.modules?.soapClient?.activateSoapClientSidebar?.();
      else if (soapClientPanel) soapClientPanel.hidden = true;
      folderTreePane?.classList.toggle("workspace-search-open", toolView);
      folderTreePane?.classList.toggle("regex-tester-open", regexTesterView);
      folderTreePane?.classList.toggle("api-client-open", apiClientView);
      folderTreePane?.classList.toggle("soap-client-open", soapClientView);
      folderTreePane?.classList.toggle("ai-companion-workspace-rail", aiCompanionView);
      if (folderTreeTopbar) folderTreeTopbar.hidden = searchView || gitView || regexTesterView || soapClientView;
      if (folderTreeRoot) folderTreeRoot.hidden = hideFolderView;
      if (dropzonePanel) dropzonePanel.hidden = hideFolderView;
      if (dropzoneResizer) dropzoneResizer.hidden = hideFolderView;
      document.querySelectorAll(".sidebar-view-option").forEach((button) => {
        const isActive = button.dataset.sidebarView === targetView;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
      document.querySelectorAll(".open-regex-tester").forEach((button) => {
        button.classList.toggle("active", regexTesterView);
        button.setAttribute("aria-pressed", regexTesterView ? "true" : "false");
      });
      if (searchView) setTimeout(() => queryInput?.focus(), 0);
      if (gitView) app.modules?.workspaceGit?.refreshWorkspaceGitStatus?.();
    }

    function getActiveSidebarView() {
      if (regexTesterPanel && !regexTesterPanel.hidden) return "regex-tester";
      if (soapClientPanel && !soapClientPanel.hidden) return "soap-client";
      return document.querySelector(".sidebar-view-option.active")?.dataset?.sidebarView || "files";
    }

    function toggleSidebarView(view) {
      const targetView = view || "files";
      const sidebarVisible = deps.isSidebarVisible ? deps.isSidebarVisible() : true;
      if (targetView !== "ai-companion" && sidebarVisible && getActiveSidebarView() === targetView) {
        deps.setSidebarVisible?.(false);
        return;
      }
      if (!sidebarVisible) {
        deps.setSidebarVisible?.(true, true, false);
      }
      setSidebarView(targetView);
    }
    function renderEmpty(message) {
      if (resultsList) resultsList.innerHTML = `<div class="workspace-search-empty">${escapeHtml(message)}</div>`;
    }
    const collapsedResultPaths = new Set();

    function getResultCollapseKey(result) {
      return (result?.path || result?.name || getEntryPath(result?.entry) || getEntryName(result?.entry) || "").toLowerCase();
    }

    function renderSearchResult(result, resultIndex, isCollapsed = false) {
      if (result.error) return `<section class="workspace-search-result error"><h4>${escapeHtml(result.path || result.name)}</h4><p>${escapeHtml(result.error)}</p></section>`;
      const previews = result.matches.slice(0, 20).map((match, matchIndex) => `<button class="workspace-search-match" type="button" data-result-index="${resultIndex}" data-match-index="${matchIndex}" data-line="${match.lineNumber}"><span class="workspace-search-line">:${match.lineNumber}</span><span>${escapeHtml(match.preview || "(blank line)")}</span></button>`).join("");
      const fileName = escapeHtml(result.path || result.name);
      const collapseLabel = isCollapsed ? "Expand file results" : "Collapse file results";
      return `<section class="workspace-search-result${isCollapsed ? " is-collapsed" : ""}"><div class="workspace-search-file-row"><button class="workspace-search-collapse" type="button" data-result-index="${resultIndex}" aria-expanded="${isCollapsed ? "false" : "true"}" title="${collapseLabel}" aria-label="${collapseLabel}"><i class="bi ${isCollapsed ? "bi-chevron-right" : "bi-chevron-down"}" aria-hidden="true"></i></button><button class="workspace-search-file" type="button" data-result-index="${resultIndex}" title="${fileName}"><i class="bi bi-file-text" aria-hidden="true"></i><span>${fileName}</span><strong>${result.matches.length}</strong></button></div><div class="workspace-search-matches">${previews}</div></section>`;
    }
    function renderResults(results) {
      if (!resultsList) return;
      const filesWithMatches = results.filter((result) => result.matches?.length);
      const matchCount = filesWithMatches.reduce((sum, result) => sum + result.matches.length, 0);
      const errorCount = results.filter((result) => result.error).length;
      if (status) status.textContent = getOptions().query ? `${matchCount} result${matchCount === 1 ? "" : "s"} in ${filesWithMatches.length} file${filesWithMatches.length === 1 ? "" : "s"}${errorCount ? `, ${errorCount} read error${errorCount === 1 ? "" : "s"}` : ""}${results.limitReached ? ` - limited to ${normalizeSearchResultLimit(results.resultLimit)} files; narrow filters to find more` : ""}` : "Enter a search term.";
      if (!getOptions().query) return renderEmpty("Search content, frontmatter, and tags.");
      if (!results.length) return renderEmpty("No results found.");
      resultsList.innerHTML = results.map((result, resultIndex) => {
        const collapseKey = getResultCollapseKey(result);
        return renderSearchResult(result, resultIndex, collapseKey && collapsedResultPaths.has(collapseKey));
      }).join("");
    }

    function renderReplacePreview(preview) {
      if (!resultsList) return;
      if (status) status.textContent = `Replace preview: ${preview.totalMatches} result${preview.totalMatches === 1 ? "" : "s"} in ${preview.files.length} file${preview.files.length === 1 ? "" : "s"}`;
      if (!preview.files.length) return renderEmpty("No content replacements would be made.");
      resultsList.innerHTML = preview.files.map((file) => {
        const first = file.matches[0];
        const before = first ? getPreviewLine(file.previousContent, first.lineNumber).trim() : "";
        const after = replaceAllLiteral(before, preview.options.query, preview.options.replacement, preview.options.matchCase);
        return `<section class="workspace-search-result replace-preview"><h4>${escapeHtml(file.path || file.name)} <strong>${file.matches.length}</strong></h4><p><span>Before</span>${escapeHtml(before)}</p><p><span>After</span>${escapeHtml(after)}</p></section>`;
      }).join("");
    }

    async function runWorkspaceSearch(options) {
      if (activeSearch) activeSearch.stopped = true;
      const runId = ++searchRunId;
      activeSearch = null;
      const requestedOptions = options || getOptions();
      const normalized = normalizeOptions({ ...requestedOptions, maxResults: requestedOptions?.maxResults ?? deps.getWorkspaceSearchResultLimit?.() });
      if (!deps.isFolderOpen?.()) {
        setSearching(false);
        lastResults = [];
        if (status) status.textContent = "Open a folder to search the workspace.";
        renderEmpty("Open a folder to search all workspace files.");
        return lastResults;
      }
      if (!normalized.query) {
        setSearching(false);
        lastResults = [];
        if (applyButton) applyButton.disabled = true;
        if (status) status.textContent = "Enter a search term.";
        renderEmpty("Search content, frontmatter, and tags.");
        return lastResults;
      }
      setSearching(true);
      if (status) status.textContent = "Searching...";
      if (applyButton) applyButton.disabled = true;
      collapsedResultPaths.clear();
      lastResults = [];
      lastPreview = null;
      renderEmpty("Searching...");
      const searchState = { stopped: false };
      activeSearch = searchState;
      try {
        const results = await runSearch(getSearchEntries(normalized), normalized, { readEntryContent: deps.readWorkspaceEntryContent, parseFrontmatter: deps.parseFrontmatter, getFileTagsFromContent: deps.getFileTagsFromContent }, function(_result, partialResults) {
          if (runId !== searchRunId) return;
          lastResults = partialResults;
          renderResults(lastResults);
        }, function() {
          return searchState.stopped || runId !== searchRunId;
        });
        if (runId !== searchRunId) return results;
        lastResults = results;
        renderResults(lastResults);
        return lastResults;
      } finally {
        if (activeSearch === searchState) activeSearch = null;
        if (runId === searchRunId) setSearching(false);
      }
    }

    function scheduleWorkspaceSearch() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runWorkspaceSearch(), 220);
    }

    function previewWorkspaceReplace(options) {
      lastPreview = previewReplace(lastResults, options || getOptions());
      renderReplacePreview(lastPreview);
      if (applyButton) applyButton.disabled = !lastPreview.files.length;
      return lastPreview;
    }

    async function applyWorkspaceReplace(preview) {
      const replacePreview = preview || lastPreview;
      if (!replacePreview?.files?.length) return { changed: 0, failed: 0 };
      if (!await confirmWorkspaceSearchAction(`Replace ${replacePreview.totalMatches} result${replacePreview.totalMatches === 1 ? "" : "s"} in ${replacePreview.files.length} file${replacePreview.files.length === 1 ? "" : "s"}?`)) return { changed: 0, failed: 0 };
      let changed = 0;
      let failed = 0;
      for (const file of replacePreview.files) {
        try {
          await deps.writeWorkspaceEntryContent(file.entry, file.nextContent);
          changed += 1;
        } catch (error) {
          failed += 1;
          console.error("Workspace replace failed:", file.path || file.name, error);
          continue;
        }
        try {
          await deps.onWorkspaceEntryChanged?.(file.entry, file.nextContent);
        } catch (error) {
          console.warn("Workspace refresh after replace failed:", file.path || file.name, error);
        }
      }
      if (failed) global.alert(`Unable to replace matches in ${failed} file${failed === 1 ? "" : "s"}.`);
      await runWorkspaceSearch(getOptions());
      return { changed, failed };
    }

    function openWorkspaceSearchModal(initialQuery) {
      setSidebarView("search");
      if (initialQuery && typeof initialQuery === "object") {
        if (Object.prototype.hasOwnProperty.call(initialQuery, "query") && queryInput) queryInput.value = String(initialQuery.query || "");
        if (Object.prototype.hasOwnProperty.call(initialQuery, "include") && includeInput) includeInput.value = String(initialQuery.include || "");
        if (Object.prototype.hasOwnProperty.call(initialQuery, "exclude") && excludeInput) excludeInput.value = String(initialQuery.exclude || "");
        if (Object.prototype.hasOwnProperty.call(initialQuery, "replacement") && replaceInput) replaceInput.value = String(initialQuery.replacement || "");
      } else if (initialQuery !== undefined && queryInput) {
        queryInput.value = String(initialQuery || "");
      }
      if (queryInput?.value) runWorkspaceSearch();
    }

    function closeWorkspaceSearchModal() {
      setSidebarView("files");
    }

    document.querySelectorAll(".sidebar-view-option").forEach((button) => button.addEventListener("click", () => toggleSidebarView(button.dataset.sidebarView || "files")));
    [queryInput, includeInput, excludeInput].forEach((input) => input?.addEventListener("input", scheduleWorkspaceSearch));
    replaceInput?.addEventListener("input", () => { if (applyButton) applyButton.disabled = true; });
    searchButton?.addEventListener("click", () => {
      if (activeSearch) {
        stopWorkspaceSearch();
        return;
      }
      runWorkspaceSearch();
    });
    clearButton?.addEventListener("click", () => {
      [queryInput, includeInput, excludeInput, replaceInput].forEach((input) => { if (input) input.value = ""; });
      runWorkspaceSearch();
    });
    matchCaseButton?.addEventListener("click", () => {
      const pressed = matchCaseButton.getAttribute("aria-pressed") === "true";
      matchCaseButton.setAttribute("aria-pressed", String(!pressed));
      scheduleWorkspaceSearch();
    });
    includeUnsupportedInput?.addEventListener("change", scheduleWorkspaceSearch);
    searchSubfoldersInput?.addEventListener("change", scheduleWorkspaceSearch);
    previewButton?.addEventListener("click", async () => { if (!lastResults.length) await runWorkspaceSearch(); previewWorkspaceReplace(); });
    applyButton?.addEventListener("click", () => applyWorkspaceReplace());
    resultsList?.addEventListener("click", (event) => {
      const collapseButton = event.target.closest(".workspace-search-collapse");
      if (collapseButton) {
        const result = lastResults[Number(collapseButton.dataset.resultIndex)];
        const collapseKey = getResultCollapseKey(result);
        if (collapseKey) {
          if (collapsedResultPaths.has(collapseKey)) collapsedResultPaths.delete(collapseKey);
          else collapsedResultPaths.add(collapseKey);
          renderResults(lastResults);
        }
        return;
      }
      const button = event.target.closest("[data-result-index]");
      if (!button) return;
      const result = lastResults[Number(button.dataset.resultIndex)];
      if (!result || result.error) return;
      const match = result.matches?.[Number(button.dataset.matchIndex)] || result.matches?.[0] || null;
      deps.openWorkspaceEntry?.(result.entry, {
        lineNumber: Number(button.dataset.line || match?.lineNumber || 1) || 1,
        matchStart: Number.isFinite(match?.index) && match.index >= 0 ? match.index : null,
        matchLength: Number.isFinite(match?.length) && match.length > 0 ? match.length : 0
      });
    });

    const api = { openWorkspaceSearchModal, closeWorkspaceSearchModal, runWorkspaceSearch, setSidebarView, getActiveSidebarView, stopWorkspaceSearch, previewWorkspaceReplace, applyWorkspaceReplace, _test: { createResult, findLiteralMatches, findSearchMatches, getResultCollapseKey, matchesPathFilters, parsePathPatterns, previewReplace, renderSearchResult, replaceAllLiteral, runSearch, normalizeSearchResultLimit, entryMatchesSubfolderScope } };
    app.registerModule("workspaceSearch", api);
    return api;
  }

  global.registerMarkdownViewerWorkspaceSearch = registerWorkspaceSearch;
})(typeof window !== "undefined" ? window : globalThis);
