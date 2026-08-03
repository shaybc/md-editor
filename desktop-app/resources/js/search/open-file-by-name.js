(function(global) {
  "use strict";

  /**
   * Owns the Ctrl+Shift+N file-name search dialog and opens selected workspace files.
   */
  function registerOpenFileByName(app, deps) {
    const modal = document.getElementById("open-file-by-name-modal");
    const input = document.getElementById("open-file-by-name-input");
    const status = document.getElementById("open-file-by-name-status");
    const resultsList = document.getElementById("open-file-by-name-results");
    const closeButton = document.getElementById("open-file-by-name-close");

    let indexedFiles = [];
    let lastFolderKey = "";
    let lastQuery = "";
    let lastResults = [];
    let lastStatus = "Start typing to search files by name.";
    let indexReady = false;
    let indexRunId = 0;

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function normalizePath(path) {
      return String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/+$/, "");
    }

    function getNodeName(node) {
      return node?.name || deps.getFileName?.(node?.fullPath || node?.path) || "document";
    }

    function getFilePath(node) {
      return normalizePath(node?.fullPath || node?.path || node?.file?.webkitRelativePath || node?.file?.name || node?.name || "");
    }

    function getRelativePath(node, rootPath, parentPath) {
      const directPath = normalizePath(node?.path || node?.file?.webkitRelativePath || "");
      if (directPath && !/^[A-Za-z]:\//.test(directPath) && !directPath.startsWith("/")) return directPath;

      const fullPath = normalizePath(node?.fullPath || node?.path || "");
      const root = normalizePath(rootPath);
      if (fullPath && root && (fullPath === root || fullPath.startsWith(`${root}/`))) {
        return fullPath.slice(root.length).replace(/^\/+/, "") || getNodeName(node);
      }

      return parentPath ? `${parentPath}/${getNodeName(node)}` : getNodeName(node);
    }

    function getFolderKey() {
      if (!deps.isFolderOpen?.()) return "";
      const rootPath = normalizePath(deps.getActiveFolderPath?.() || "");
      if (rootPath) return rootPath;
      const roots = deps.getCurrentFolderTreeNodes?.() || [];
      return `browser:${roots.length}:${roots.map((node) => `${node.kind}:${node.path || node.name || ""}`).join("|")}`;
    }

    function createFileResult(node, rootPath, parentPath) {
      const name = getNodeName(node);
      const relativePath = getRelativePath(node, rootPath, parentPath);
      return {
        name,
        path: relativePath || name,
        fullPath: normalizePath(node?.fullPath || ""),
        file: node?.file || null,
        handle: node?.handle || null,
        size: Number(node?.size || node?.file?.size || 0),
        iconClass: deps.getFileIconClass?.(name) || "bi-file-text"
      };
    }

    async function getDirectoryChildren(node, rootPath) {
      if (node?.childrenLazy === true && node.fullPath && typeof deps.readNeutralinoDirectoryChildren === "function") {
        return deps.readNeutralinoDirectoryChildren(node.fullPath, rootPath);
      }
      return node?.children || [];
    }

    async function collectFileResults(nodes, rootPath, parentPath = "") {
      const files = [];
      for (let index = 0; index < (nodes || []).length; index += 1) {
        const node = nodes[index];
        if (!node || node.isParentNavigation) continue;
        if (index > 0 && index % 100 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        const currentPath = node.path || (parentPath ? `${parentPath}/${node.name || ""}` : node.name || "");
        if (node.kind === "directory") {
          const children = await getDirectoryChildren(node, rootPath);
          files.push(...await collectFileResults(children, rootPath, currentPath));
        } else if (node.kind === "file") {
          files.push(createFileResult(node, rootPath, parentPath));
        }
      }
      return files;
    }

    function dedupeFiles(files) {
      const seen = new Set();
      return (files || []).filter((file) => {
        const key = normalizePath(file.fullPath || file.path || file.name).toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function getMatchRank(file, query) {
      const name = String(file?.name || "").toLowerCase();
      const needle = String(query || "").toLowerCase();
      if (name === needle) return 0;
      if (name.startsWith(needle)) return 1;
      if (name.includes(needle)) return 2;
      return 3;
    }

    function findMatchingFiles(files, query) {
      const needle = String(query || "").trim().toLowerCase();
      if (!needle) return [];
      return (files || [])
        .filter((file) => String(file.name || "").toLowerCase().includes(needle))
        .sort((a, b) => {
          const rankDiff = getMatchRank(a, needle) - getMatchRank(b, needle);
          if (rankDiff !== 0) return rankDiff;
          const nameDiff = String(a.name || "").localeCompare(String(b.name || ""));
          if (nameDiff !== 0) return nameDiff;
          return String(a.path || "").localeCompare(String(b.path || ""));
        });
    }

    function setStatus(message) {
      lastStatus = message || "";
      if (status) status.textContent = lastStatus;
    }

    function renderEmpty(message) {
      if (!resultsList) return;
      resultsList.innerHTML = `<div class="open-file-by-name-empty">${escapeHtml(message)}</div>`;
    }

    function renderResults(results) {
      if (!resultsList) return;
      lastResults = results || [];
      if (!lastResults.length) {
        renderEmpty(lastQuery ? "No matching files." : "Start typing to search files by name.");
        return;
      }
      resultsList.innerHTML = lastResults.map((result, index) => (
        `<button class="open-file-by-name-result" type="button" data-result-index="${index}">`
        + `<i class="bi ${escapeHtml(result.iconClass)}" aria-hidden="true"></i>`
        + `<span class="open-file-by-name-result-name">${escapeHtml(result.name)}</span>`
        + `<span class="open-file-by-name-result-path">(${escapeHtml(result.path || result.name)})</span>`
        + "</button>"
      )).join("");
    }

    function renderCurrentState() {
      if (input && input.value !== lastQuery) input.value = lastQuery;
      setStatus(lastStatus);
      renderResults(lastResults);
    }

    function updateMatches() {
      const query = String(input?.value || lastQuery || "");
      lastQuery = query;
      if (!deps.isFolderOpen?.()) {
        setStatus("Open a folder to search files.");
        renderEmpty("Open a folder to search files.");
        return;
      }
      if (!indexReady) {
        setStatus("Indexing files...");
        return;
      }
      lastResults = findMatchingFiles(indexedFiles, lastQuery);
      setStatus(lastQuery ? `${lastResults.length} matching file${lastResults.length === 1 ? "" : "s"}.` : "Start typing to search files by name.");
      renderResults(lastResults);
    }

    async function rebuildIndexIfNeeded() {
      const folderKey = getFolderKey();
      if (!folderKey) {
        indexReady = false;
        indexedFiles = [];
        updateMatches();
        return [];
      }
      if (folderKey === lastFolderKey && indexReady) {
        updateMatches();
        return indexedFiles;
      }

      const runId = ++indexRunId;
      lastFolderKey = folderKey;
      indexReady = false;
      indexedFiles = [];
      setStatus("Indexing files...");
      renderEmpty("Indexing files...");
      const rootPath = normalizePath(deps.getActiveFolderPath?.() || "");
      const files = dedupeFiles(await collectFileResults(deps.getCurrentFolderTreeNodes?.() || [], rootPath));
      if (runId !== indexRunId) return indexedFiles;
      indexedFiles = files;
      indexReady = true;
      updateMatches();
      return indexedFiles;
    }

    function setVisible(visible) {
      if (!modal) return;
      modal.style.display = visible ? "flex" : "none";
      modal.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    function openFileByNameModal() {
      setVisible(true);
      renderCurrentState();
      setTimeout(() => input?.focus(), 0);
      void rebuildIndexIfNeeded();
    }

    function closeFileByNameModal() {
      setVisible(false);
    }

    async function openResult(result) {
      if (!result) return null;
      closeFileByNameModal();
      return deps.openDocumentSourceFile?.({
        name: result.name,
        path: result.fullPath || result.path || null,
        fullPath: result.fullPath || null,
        file: result.file || null,
        handle: result.handle || null,
        size: Number(result.size || 0)
      }, { temporary: false });
    }

    input?.addEventListener("input", updateMatches);
    closeButton?.addEventListener("click", closeFileByNameModal);
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) closeFileByNameModal();
    });
    modal?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFileByNameModal();
      }
    });
    resultsList?.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-result-index]");
      if (!button) return;
      void openResult(lastResults[Number(button.dataset.resultIndex)]);
    });
    document.querySelectorAll(".open-file-by-name-dialog").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        openFileByNameModal();
        deps.closeMobileMenu?.();
      });
    });

    const api = {
      openFileByNameModal,
      closeFileByNameModal,
      rebuildIndexIfNeeded,
      _test: {
        collectFileResults,
        dedupeFiles,
        findMatchingFiles,
        getMatchRank,
        getRelativePath,
        normalizePath
      }
    };
    app.registerModule("openFileByName", api);
    return api;
  }

  global.registerMarkdownViewerOpenFileByName = registerOpenFileByName;
})(typeof window !== "undefined" ? window : globalThis);
