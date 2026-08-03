(function(global) {
  /**
   * Owns the flat folder view index, scoped desktop scans, and virtual row rendering.
   * @param {object} app - Application module registry.
   * @param {object} deps - Runtime dependencies supplied by the main desktop script.
   * @returns {object} Public flat folder view API.
   */
  global.registerMarkdownViewerFlatFolderView = function registerMarkdownViewerFlatFolderView(app, deps) {
    const api = {};

    const ROW_HEIGHT = 30;
    const OVERSCAN_ROWS = 12;
    const SCAN_BATCH_SIZE = 50;
    const SCANNING_STATUS_HEIGHT = 30;

    let scanGeneration = 0;
    let indexedFolderPath = "";
    let indexedRootNodes = null;
    let rootFiles = [];
    let rootDirectories = [];
    let scopedFiles = new Map();
    let expandedGroupKeys = new Set();
    let expandedScopeKeys = new Set();
    let scanningScopeKeys = new Set();
    let scannedScopeKeys = new Set();
    let renderedRoot = null;
    let scrollHandler = null;
    let lastRenderOptions = null;

    with (deps) {
  function normalizePath(value) {
    return String(value || "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/+$/g, "");
  }

  function getComparableFilePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
  }

  function getActiveFolderRootPath() {
    return normalizePath(typeof activeFolderPath === "function" ? activeFolderPath() : activeFolderPath);
  }

  function joinFolderPath(parentPath, name) {
    const parent = normalizePath(parentPath);
    return parent ? `${parent}/${name}` : String(name || "");
  }

  function getFileName(path) {
    const normalized = normalizePath(path);
    return normalized.split("/").pop() || "";
  }

  function getPathRelativeToActiveFolder(path) {
    const root = getActiveFolderRootPath();
    const normalizedPath = normalizePath(path);
    if (root && normalizedPath.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
      return normalizedPath.slice(root.length + 1);
    }
    return normalizedPath;
  }

  function getTopLevelPath(path) {
    return normalizePath(path).split("/").filter(Boolean)[0] || "";
  }

  function isPathInsideScope(path, scopePath) {
    const normalizedPath = normalizePath(path);
    const normalizedScope = normalizePath(scopePath);
    return normalizedScope && (normalizedPath === normalizedScope || normalizedPath.startsWith(`${normalizedScope}/`));
  }

  function getFlatDisplayPath(path) {
    return normalizePath(path).split("/").filter((segment) => segment && segment !== "ROOT").join("/");
  }

  function getFlatFolderPrefix(file) {
    const displayPath = getFlatDisplayPath(getFlatFileGroupPath(file));
    return displayPath ? `${displayPath}/` : "";
  }

  function getFlatFileGroupPath(file) {
    const relativePath = normalizePath(file?.path || getPathRelativeToActiveFolder(file?.fullPath || ""));
    const slashIndex = relativePath.lastIndexOf("/");
    return slashIndex >= 0 ? relativePath.slice(0, slashIndex) : "";
  }

  function getFlatFilePathKey(file) {
    return getComparableFilePath(file?.fullPath || file?.path || file?.name || "");
  }

  function getFlatGroupKey(groupPath) {
    return `group:${getComparableFilePath(groupPath || "__root__")}`;
  }

  function getFlatScopeKey(scopePath) {
    return `scope:${getComparableFilePath(scopePath || "__root__")}`;
  }

  function createFlatFileNode(node, parentPath = "") {
    const relativePath = normalizePath(node?.path || (parentPath ? `${parentPath}/${node?.name || ""}` : node?.name || ""));
    const fullPath = normalizePath(node?.fullPath || (getActiveFolderRootPath() && relativePath ? joinFolderPath(getActiveFolderRootPath(), relativePath) : ""));
    return {
      kind: "file",
      name: node?.name || getFileName(relativePath || fullPath),
      path: relativePath,
      fullPath,
      file: node?.file || null,
      handle: node?.handle || null,
      size: Number(node?.size || node?.file?.size || 0),
      modifiedAt: Number(node?.modifiedAt || node?.file?.lastModified || 0),
      createdAt: Number(node?.createdAt || node?.modifiedAt || node?.file?.lastModified || 0),
      tags: Array.isArray(node?.tags) ? node.tags : undefined,
      isGraphDocumentFile: node?.isGraphDocumentFile === true
    };
  }

  function createScopeNode(node, parentPath = "") {
    const path = normalizePath(node?.path || (parentPath ? `${parentPath}/${node?.name || ""}` : node?.name || ""));
    const fullPath = normalizePath(node?.fullPath || (getActiveFolderRootPath() && path ? joinFolderPath(getActiveFolderRootPath(), path) : ""));
    return {
      type: "scope",
      key: getFlatScopeKey(path),
      name: node?.name || getFileName(path),
      label: getFlatDisplayPath(path || node?.name || ""),
      path,
      fullPath,
      node
    };
  }

  function shouldSkipDirectory(name) {
    if (name === ".git" && !(typeof shouldShowGitProjectFolder === "function" && shouldShowGitProjectFolder())) return true;
    if (name === ".md-editor" && !(typeof shouldShowMdEditorProjectFolder === "function" && shouldShowMdEditorProjectFolder())) return true;
    if (typeof shouldSkipCustomHiddenFolder === "function" && shouldSkipCustomHiddenFolder(name)) return true;
    return false;
  }

  function indexRootLevelNodes(nodes) {
    (nodes || []).forEach((node) => {
      if (!node || node.isParentNavigation) return;
      if (node.kind === "directory") {
        if (!shouldSkipDirectory(node.name)) rootDirectories.push(createScopeNode(node));
        return;
      }
      if (node.kind === "file") rootFiles.push(createFlatFileNode(node));
    });
  }

  function collectLoadedScopeFiles(nodes, queue, parentPath = "") {
    (nodes || []).forEach((node) => {
      if (!node || node.isParentNavigation) return;
      if (node.kind === "directory") {
        if (shouldSkipDirectory(node.name)) return;
        const relativePath = normalizePath(node.path || (parentPath ? `${parentPath}/${node.name}` : node.name));
        const fullPath = normalizePath(node.fullPath || (getActiveFolderRootPath() ? joinFolderPath(getActiveFolderRootPath(), relativePath) : ""));
        if (node.childrenLazy === true && fullPath) {
          queue.push({ fullPath, relativePath });
          return;
        }
        collectLoadedScopeFiles(node.children || [], queue, relativePath);
        return;
      }
      if (node.kind === "file") queue.files.push(createFlatFileNode(node, parentPath));
    });
  }

  async function readDirectoryChildren(folderPath, relativePath) {
    if (!folderPath || typeof Neutralino === "undefined" || !Neutralino.filesystem?.readDirectory) return [];
    const entries = await Neutralino.filesystem.readDirectory(folderPath);
    const children = [];
    for (let index = 0; index < (entries || []).length; index += 1) {
      const item = entries[index];
      const name = item?.entry || item?.name || "";
      if (!name || name === "." || name === "..") continue;
      const type = String(item?.type || item?.kind || "").toUpperCase();
      const fullPath = joinFolderPath(folderPath, name);
      const childRelativePath = relativePath ? `${relativePath}/${name}` : name;
      const metadata = typeof getFilesystemMetadata === "function" ? getFilesystemMetadata(item) : {};
      if (type === "DIRECTORY" || item?.isDirectory === true) {
        if (!shouldSkipDirectory(name)) children.push({ kind: "directory", name, fullPath, relativePath: childRelativePath, ...metadata });
      } else if (type === "FILE" || item?.isFile === true || !type) {
        children.push(createFlatFileNode({ kind: "file", name, path: childRelativePath, fullPath, ...metadata }));
      }
    }
    return children;
  }

  function appendScopedFile(scopeKey, file) {
    if (!scopedFiles.has(scopeKey)) scopedFiles.set(scopeKey, []);
    scopedFiles.get(scopeKey).push(file);
  }

  async function scanQueuedDirectories(generation, scope, queue) {
    let processed = 0;
    scanningScopeKeys.add(scope.key);
    renderLastFlatFolderView();
    while (queue.length && generation === scanGeneration) {
      const directory = queue.shift();
      try {
        const children = await readDirectoryChildren(directory.fullPath, directory.relativePath);
        children.forEach((child) => {
          if (child.kind === "directory") queue.push({ fullPath: child.fullPath, relativePath: child.relativePath });
          else if (child.kind === "file") appendScopedFile(scope.key, child);
        });
      } catch (error) {
        console.warn("Failed to scan flat folder directory:", directory.fullPath, error);
      }
      processed += 1;
      if (processed % SCAN_BATCH_SIZE === 0) {
        renderLastFlatFolderView();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    if (generation !== scanGeneration) return;
    scanningScopeKeys.delete(scope.key);
    scannedScopeKeys.add(scope.key);
    renderLastFlatFolderView();
  }

  function startScopeScan(scope) {
    if (!scope || scannedScopeKeys.has(scope.key) || scanningScopeKeys.has(scope.key)) return;
    const queue = [];
    queue.files = [];
    if (scope.node?.childrenLazy === true && scope.fullPath) {
      queue.push({ fullPath: scope.fullPath, relativePath: scope.path });
    } else {
      collectLoadedScopeFiles(scope.node?.children || [], queue, scope.path);
    }
    scopedFiles.set(scope.key, queue.files.slice());
    if (!queue.length) {
      scannedScopeKeys.add(scope.key);
      return;
    }
    void scanQueuedDirectories(scanGeneration, scope, queue);
  }

  function ensureFlatIndex(nodes) {
    const rootPath = getActiveFolderRootPath();
    if (indexedFolderPath === rootPath && indexedRootNodes === nodes) return;
    scanGeneration += 1;
    indexedFolderPath = rootPath;
    indexedRootNodes = nodes;
    rootFiles = [];
    rootDirectories = [];
    scopedFiles = new Map();
    expandedGroupKeys = new Set();
    expandedScopeKeys = new Set();
    scanningScopeKeys = new Set();
    scannedScopeKeys = new Set();
    indexRootLevelNodes(nodes || []);
  }

  function getEntryTags(file, tagIndex) {
    if (Array.isArray(file?.tags)) return normalizeFileTagList(file.tags);
    const key = getFlatFilePathKey(file);
    return key && tagIndex.has(key) ? tagIndex.get(key) : [];
  }

  function createTagIndex() {
    const index = new Map();
    (folderMarkdownFiles || []).forEach((entry) => {
      const key = getComparableFilePath(entry.fullPath || entry.path || entry.file?.webkitRelativePath || entry.file?.name || entry.name || "");
      if (key) index.set(key, normalizeFileTagList(entry.tags || []));
    });
    return index;
  }

  function fileMatchesCurrentFilters(file, tagIndex) {
    if (!showUnsupportedFolderFiles && !isSupportedFolderTreeDocumentNode(file)) return false;
    const filterText = String(folderTreeFilterText || "").trim().toLowerCase();
    const searchablePath = normalizePath(file.path || file.fullPath || file.name).toLowerCase();
    const groupPath = getFlatFileGroupPath(file).toLowerCase();
    if (filterText && !matchesFolderFilterText(searchablePath, filterText) && !matchesFolderFilterText(groupPath, filterText) && !matchesFolderFilterText(file.name, filterText)) return false;
    const selectedTags = Array.from(selectedFolderTreeTags || []);
    if (!selectedTags.length) return true;
    const fileTags = getEntryTags(file, tagIndex);
    return selectedTags.some((tag) => fileTags.includes(tag));
  }

  function scopeMatchesCurrentFilter(scope) {
    const filterText = String(folderTreeFilterText || "").trim().toLowerCase();
    return matchesFolderFilterText(scope.path || scope.label, filterText);
  }

  function getNodeTimestamp(node, field) {
    const value = Number(node?.[field] || 0);
    if (value > 0) return value;
    return Number(node?.modifiedAt || node?.file?.lastModified || 0) || 0;
  }

  function compareFlatFiles(left, right) {
    const mode = typeof getValidFolderSortMode === "function" ? getValidFolderSortMode(currentFolderSortMode) : currentFolderSortMode;
    if (mode === "name-desc") return String(right.name || "").localeCompare(String(left.name || ""));
    if (mode === "modified-desc" || mode === "modified-asc") {
      const diff = getNodeTimestamp(left, "modifiedAt") - getNodeTimestamp(right, "modifiedAt");
      if (diff !== 0) return mode === "modified-desc" ? -diff : diff;
    }
    if (mode === "created-desc" || mode === "created-asc") {
      const diff = getNodeTimestamp(left, "createdAt") - getNodeTimestamp(right, "createdAt");
      if (diff !== 0) return mode === "created-desc" ? -diff : diff;
    }
    const nameDiff = String(left.name || "").localeCompare(String(right.name || ""));
    return nameDiff || String(left.path || "").localeCompare(String(right.path || ""));
  }

  function compareFlatGroups(left, right) {
    const mode = typeof getValidFolderSortMode === "function" ? getValidFolderSortMode(currentFolderSortMode) : currentFolderSortMode;
    if (mode === "modified-desc" || mode === "modified-asc") {
      const diff = getNodeTimestamp(left, "modifiedAt") - getNodeTimestamp(right, "modifiedAt");
      if (diff !== 0) return mode === "modified-desc" ? -diff : diff;
    }
    if (mode === "created-desc" || mode === "created-asc") {
      const diff = getNodeTimestamp(left, "createdAt") - getNodeTimestamp(right, "createdAt");
      if (diff !== 0) return mode === "created-desc" ? -diff : diff;
    }
    const pathDiff = String(left.path || "").localeCompare(String(right.path || ""));
    return mode === "name-desc" ? -pathDiff : pathDiff;
  }

  function getVisibleFiles(files) {
    const tagIndex = createTagIndex();
    return (files || []).filter((file) => fileMatchesCurrentFilters(file, tagIndex));
  }

  function createFlatGroup(path, files, options = {}) {
    const sortedFiles = files.slice().sort(compareFlatFiles);
    return {
      type: "group",
      key: getFlatGroupKey(path),
      path,
      label: getFlatDisplayPath(options.label || path || ""),
      files: sortedFiles,
      level: options.level || 0,
      modifiedAt: Math.max(...sortedFiles.map((file) => getNodeTimestamp(file, "modifiedAt")), 0),
      createdAt: Math.max(...sortedFiles.map((file) => getNodeTimestamp(file, "createdAt")), 0)
    };
  }

  function createFlatGroups(files, options = {}) {
    const groups = new Map();
    getVisibleFiles(files).forEach((file) => {
      const groupPath = getFlatFileGroupPath(file);
      if (!groups.has(groupPath)) groups.set(groupPath, []);
      groups.get(groupPath).push(file);
    });
    return Array.from(groups.entries()).map(([path, files]) => createFlatGroup(path, files, options)).sort(compareFlatGroups);
  }

  function getVisibleFlatGroups() {
    return rootDirectories.filter(scopeMatchesCurrentFilter).sort(compareFlatGroups);
  }

  function getFlatFolderGroupFiles() {
    const files = [];
    getVisibleFlatGroups().forEach((scope) => {
      startScopeScan(scope);
      files.push(...(scopedFiles.get(scope.key) || []));
    });
    return files;
  }

  function getFlatRows() {
    const rows = [];
    createFlatGroups(getFlatFolderGroupFiles()).forEach((group) => {
      rows.push(group);
      if (expandedGroupKeys.has(group.key)) {
        group.files.forEach((file) => rows.push({ type: "file", groupKey: group.key, file }));
      }
    });
    getVisibleFiles(rootFiles).slice().sort(compareFlatFiles).forEach((file) => rows.push({ type: "file", groupKey: "root-files", file }));
    return rows;
  }

  function calculateVirtualRange(scrollTop, viewportHeight, itemCount) {
    const start = Math.max(0, Math.floor(Number(scrollTop || 0) / ROW_HEIGHT) - OVERSCAN_ROWS);
    const visibleCount = Math.ceil(Number(viewportHeight || 0) / ROW_HEIGHT) + (OVERSCAN_ROWS * 2);
    const end = Math.min(itemCount, start + Math.max(visibleCount, OVERSCAN_ROWS * 2));
    return { start, end };
  }

  function getFlatFileSource(file, isUnsupportedFile) {
    return {
      name: file.name,
      file: file.file || null,
      handle: file.handle || null,
      path: file.fullPath || file.path || null,
      fullPath: file.fullPath || null,
      size: Number(file.size || file.file?.size || 0),
      isUnsupportedFile
    };
  }

  function createFlatGroupRow(group) {
    const row = document.createElement("button");
    const expanded = expandedGroupKeys.has(group.key);
    row.type = "button";
    row.className = "folder-flat-group";
    row.title = getFlatDisplayPath(group.path || "");
    row.dataset.path = group.path || "";
    row.dataset.groupKey = group.key;
    row.setAttribute("aria-expanded", String(expanded));
    const icon = document.createElement("i");
    icon.className = expanded ? "bi bi-folder2-open" : "bi bi-folder";
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "folder-flat-group-name";
    label.textContent = group.label;
    const count = document.createElement("span");
    count.className = "folder-flat-group-count";
    count.textContent = String(group.files.length);
    row.append(icon, label, count);
    row.addEventListener("click", () => {
      if (expandedGroupKeys.has(group.key)) expandedGroupKeys.delete(group.key);
      else expandedGroupKeys.add(group.key);
      renderCurrentFlatRows();
    });
    return row;
  }

  function createFlatScopeRow(scope) {
    const row = document.createElement("button");
    const expanded = expandedScopeKeys.has(scope.key);
    const files = scopedFiles.get(scope.key) || [];
    row.type = "button";
    row.className = "folder-flat-group folder-flat-scope";
    row.title = getFlatDisplayPath(scope.path);
    row.dataset.path = scope.path || "";
    row.dataset.groupKey = scope.key;
    row.setAttribute("aria-expanded", String(expanded));
    const icon = document.createElement("i");
    icon.className = expanded ? "bi bi-folder2-open" : "bi bi-folder";
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "folder-flat-group-name";
    label.textContent = scope.label;
    const count = document.createElement("span");
    count.className = "folder-flat-group-count";
    count.textContent = scanningScopeKeys.has(scope.key) ? "..." : (scannedScopeKeys.has(scope.key) ? String(getVisibleFiles(files).length) : "");
    row.append(icon, label, count);
    row.addEventListener("click", () => {
      if (expandedScopeKeys.has(scope.key)) expandedScopeKeys.delete(scope.key);
      else {
        expandedScopeKeys.add(scope.key);
        startScopeScan(scope);
      }
      renderCurrentFlatRows();
    });
    return row;
  }

  function createFlatFileRow(file) {
    const row = document.createElement("button");
    const isGraphFile = isGraphFilePath(file.name) || file.isGraphDocumentFile === true;
    const isUnsupportedFile = !isSupportedFolderTreeDocumentNode(file);
    const fileLanguageClass = isUnsupportedFile || typeof getFileLanguageClass !== "function" ? "" : getFileLanguageClass(file.name || file.path || file.fullPath);
    const fileIconClass = typeof getFileIconClass === "function"
      ? getFileIconClass(file.name, { isGraphFile, isUnsupportedFile })
      : (isUnsupportedFile ? "bi-file-earmark-x" : "bi-file-text");
    row.type = "button";
    row.className = "folder-tree-file folder-flat-file"
      + (isGraphFile ? " folder-tree-graph-file" : "")
      + (fileLanguageClass ? ` folder-tree-language-file ${fileLanguageClass}` : "")
      + (isUnsupportedFile ? " folder-tree-unsupported-file" : "");
    row.title = getFlatDisplayPath(file.path || getPathRelativeToActiveFolder(file.fullPath || "") || file.name || "");
    row.dataset.name = file.name || "";
    row.dataset.path = file.path || "";
    row.dataset.fullPath = file.fullPath || "";
    const icon = document.createElement("i");
    icon.className = `bi ${fileIconClass}`;
    icon.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "folder-flat-file-name";
    name.textContent = file.name || "";
    row.append(icon, name);
    app.modules?.sidebarContextTree?.applySidebarSelectionStateToElement?.(row, file);
    row.addEventListener("click", (event) => {
      if (app.modules?.sidebarContextTree?.handleSidebarSelectionClick?.(event, file)) return;
      void openDocumentSourceFile(getFlatFileSource(file, isUnsupportedFile), { temporary: true });
    });
    row.addEventListener("dblclick", (event) => {
      event.preventDefault();
      void openDocumentSourceFile(getFlatFileSource(file, isUnsupportedFile), { temporary: false });
    });
    row.addEventListener("contextmenu", (event) => {
      if (typeof showSidebarFileContextMenu === "function") showSidebarFileContextMenu(event, file);
    });
    return row;
  }

  function createFlatRow(row) {
    if (row.type === "scope") return createFlatScopeRow(row);
    return row.type === "group" ? createFlatGroupRow(row) : createFlatFileRow(row.file);
  }

  function markActiveFlatRow(container) {
    const activeTab = (tabs || []).find((tab) => tab.id === activeTabId);
    const activeKey = getComparableFilePath(activeTab?.sourceFilePath || activeTab?.openedSource?.path || "");
    if (!activeKey) return;
    Array.from(container.querySelectorAll(".folder-flat-file")).forEach((row) => {
      const rowKeys = [row.dataset.fullPath, row.dataset.path].filter(Boolean).map(getComparableFilePath);
      const selected = rowKeys.includes(activeKey);
      row.classList.toggle("auto-selected", selected);
      if (selected) row.setAttribute("aria-current", "page");
      else row.removeAttribute("aria-current");
    });
  }

  function renderFlatRows(rows, options = {}) {
    const scrollRoot = options.scrollRoot || folderTreeRoot;
    const list = options.list || scrollRoot?.querySelector('.folder-flat-list');
    if (!scrollRoot || !list) return;
    const scopeTop = options.scopeTop || 0;
    const localScrollTop = Math.max(0, Number(scrollRoot.scrollTop || 0) - scopeTop);
    const range = calculateVirtualRange(localScrollTop, scrollRoot.clientHeight || 1, rows.length);
    list.innerHTML = '';
    const before = document.createElement('div');
    before.className = 'folder-flat-spacer';
    before.style.height = (range.start * ROW_HEIGHT) + 'px';
    list.appendChild(before);
    rows.slice(range.start, range.end).forEach((row) => list.appendChild(createFlatRow(row)));
    const after = document.createElement('div');
    after.className = 'folder-flat-spacer';
    after.style.height = Math.max(0, (rows.length - range.end) * ROW_HEIGHT) + 'px';
    list.appendChild(after);
    if (scanningScopeKeys.size > 0) {
      const status = document.createElement('div');
      status.className = 'folder-flat-scan-status';
      status.style.height = SCANNING_STATUS_HEIGHT + 'px';
      status.textContent = 'Scanning...';
      list.appendChild(status);
    }
    markActiveFlatRow(list);
  }

  function renderCurrentFlatRows() {
    if (!lastRenderOptions) return;
    renderFlatRows(getFlatRows(), lastRenderOptions);
  }

  function renderLastFlatFolderView() {
    renderCurrentFlatRows();
  }

  function attachFlatScrollRenderer(scrollRoot, options) {
    if (!scrollRoot) return;
    if (renderedRoot !== scrollRoot) {
      if (renderedRoot && scrollHandler) renderedRoot.removeEventListener('scroll', scrollHandler);
      renderedRoot = scrollRoot;
      scrollHandler = () => renderCurrentFlatRows();
      renderedRoot.addEventListener('scroll', scrollHandler);
    }
    lastRenderOptions = options;
  }

  function renderFlatFolderView(nodes) {
    if (!folderTreeRoot) return;
    ensureFlatIndex(nodes || []);
    const rows = getFlatRows();
    folderTreeRoot.innerHTML = '';
    if (!rows.length && !scanningScopeKeys.size) {
      const placeholder = document.createElement('p');
      placeholder.className = 'folder-tree-placeholder';
      placeholder.textContent = folderTreeFilterText
        ? 'No files or folders match this filter.'
        : selectedFolderTreeTags?.size > 0
          ? 'No Markdown files match the selected tag filter.'
          : 'No files found in flat view.';
      folderTreeRoot.appendChild(placeholder);
      return;
    }
    const list = document.createElement('div');
    list.className = 'folder-flat-list';
    list.setAttribute('role', 'tree');
    folderTreeRoot.appendChild(list);
    const options = { nodes: nodes || [], list, scrollRoot: folderTreeRoot, scopeTop: 0 };
    attachFlatScrollRenderer(folderTreeRoot, options);
    renderFlatRows(rows, options);
  }

  function renderFlatFolderScope(options = {}) {
    const list = options.list || null;
    const node = options.node || null;
    const scrollRoot = options.scrollRoot || folderTreeRoot;
    if (!list || !node || !scrollRoot) return false;
    ensureFlatIndex(node.children || []);
    const rows = getFlatRows();
    list.innerHTML = '';
    const flatList = document.createElement('div');
    flatList.className = 'folder-flat-list folder-flat-scope-list';
    flatList.setAttribute('role', 'tree');
    list.appendChild(flatList);
    const renderOptions = { nodes: node.children || [], list: flatList, scrollRoot, scopeTop: flatList.offsetTop || 0 };
    attachFlatScrollRenderer(scrollRoot, renderOptions);
    if (!rows.length && !scanningScopeKeys.size) {
      const placeholder = document.createElement('li');
      placeholder.className = 'folder-tree-item folder-tree-loading-child';
      placeholder.textContent = folderTreeFilterText ? 'No files or folders match this filter.' : 'No files found in flat view.';
      list.innerHTML = '';
      list.appendChild(placeholder);
      return true;
    }
    renderFlatRows(rows, renderOptions);
    return true;
  }
  function syncFlatFolderSelectionToActiveTab(options = {}) {
    if (!folderTreeRoot || !renderedRoot || renderedRoot !== folderTreeRoot) return false;
    const activeTab = (tabs || []).find((tab) => tab.id === activeTabId);
    const activeKey = getComparableFilePath(activeTab?.sourceFilePath || activeTab?.openedSource?.path || "");
    if (!activeKey) return false;
    const activePath = normalizePath(activeTab?.sourceFilePath || activeTab?.openedSource?.path || "");
    const relativePath = getPathRelativeToActiveFolder(activePath);
    const topLevel = getTopLevelPath(relativePath);
    const scope = rootDirectories.find((candidate) => getComparableFilePath(candidate.path) === getComparableFilePath(topLevel));
    if (scope) {
      expandedScopeKeys.add(scope.key);
      startScopeScan(scope);
    }
    const rows = getFlatRows();
    const group = rows.find((row) => row.type === "group" && row.files.some((file) => [file.fullPath, file.path].filter(Boolean).map(getComparableFilePath).includes(activeKey)));
    if (group) expandedGroupKeys.add(group.key);
    const nextRows = getFlatRows();
    const index = nextRows.findIndex((row) => row.type === "file" && [row.file.fullPath, row.file.path].filter(Boolean).map(getComparableFilePath).includes(activeKey));
    if (index < 0) return false;
    if (options.scroll !== false) folderTreeRoot.scrollTop = Math.max(0, index * ROW_HEIGHT);
    renderFlatRows(nextRows);
    return true;
  }

  Object.assign(api, {
    calculateVirtualRange,
    getFlatFolderPrefix,
    getFlatFileGroupPath,
    getVisibleFlatGroups,
    getFlatRows,
    renderFlatFolderView,
    renderFlatFolderScope,
    renderLastFlatFolderView,
    syncFlatFolderSelectionToActiveTab
  });
    }

    app.registerModule?.("flatFolderView", api);
    return api;
  };
})(window);
