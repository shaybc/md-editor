(function(global) {
  global.registerMarkdownViewerFolderToolbar = function registerMarkdownViewerFolderToolbar(app, deps) {
    const api = {};

    with (deps) {
  function getComparableFilePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
  }

  function getDeleteTagChoices() {
    const tags = typeof getAvailableTags === "function" ? getAvailableTags() : [];
    return normalizeFileTagList(tags).sort((a, b) => a.localeCompare(b));
  }

  async function showDeleteTagPicker() {
    const tags = getDeleteTagChoices();
    const notify = app?.services?.notify;
    if (!tags.length) {
      if (notify?.show) {
        await notify.show({
          title: "Delete tag",
          message: "No tags are available to delete.",
          buttons: [{ id: "ok", label: "OK", value: null, variant: "primary", autoFocus: true }]
        });
      } else {
        alert("No tags are available to delete.");
      }
      return null;
    }

    if (!notify?.show) return null;

    const suggestedTag = normalizeTagName(tagManagementSearch?.value || "");
    const initialTag = tags.includes(suggestedTag) ? suggestedTag : tags[0];
    let tagSelect = null;
    const selectedTag = await notify.show({
      title: "Delete tag",
      message: "Choose the tag to delete. This removes it from every file that has the tag and saves those files.",
      dismissValue: null,
      buttons: [
        { id: "cancel", label: "Cancel", value: null, variant: "cancel" },
        { id: "delete", label: "Delete", variant: "danger", autoFocus: true, action: () => tagSelect?.value || null }
      ],
      renderBody(body) {
        tagSelect = document.createElement("select");
        tagSelect.className = "rename-modal-input";
        tagSelect.setAttribute("aria-label", "Tag to delete");
        tags.forEach((tag) => {
          const option = document.createElement("option");
          option.value = tag;
          option.textContent = `#${tag}`;
          tagSelect.appendChild(option);
        });
        tagSelect.value = initialTag;
        body.appendChild(tagSelect);
      }
    });
    return typeof selectedTag === "string" ? selectedTag : null;
  }

  if (createTagButton) {
    createTagButton.addEventListener("click", async () => {
      const suggestedTag = tagManagementSearch?.value || "";
      const tag = await promptForNewTag({
        title: "Create tag",
        message: "Enter a tag name.",
        defaultValue: suggestedTag,
        confirmLabel: "Create"
      });
      createTag(tag);
    });
  }

  if (deleteTagButton) {
    deleteTagButton.addEventListener("click", async () => {
      const tag = await showDeleteTagPicker();
      if (!tag) return;
      await deleteTag(tag, { skipConfirmation: true });
    });
  }

  if (clearTagFilterButton) {
    clearTagFilterButton.addEventListener("click", () => {
      clearFolderTreeTagFilters();
    });
  }

  if (tagManagementSearch) {
    tagManagementSearch.addEventListener("input", () => renderTagManagementList());
    tagManagementSearch.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      createTag(tagManagementSearch.value);
    });
  }

  function getTabTreeFileCandidates(tab) {
    if (!tab || tab.type === "graph" || hasTabTreeAuthoritativePath(tab)) return [];
    return [tab.sourceFileName, tab.openedSource?.name, tab.title]
      .filter(Boolean)
      .map(getComparableFilePath);
  }

  function getTabTreeAuthoritativePathCandidates(tab) {
    if (!tab || tab.type === "graph") return [];
    return [
      tab.sourceFilePath,
      tab.openedSource?.path,
      tab.graphDocument?.sourceFilePath
    ].filter(Boolean);
  }

  function hasTabTreeAuthoritativePath(tab) {
    return getTabTreeAuthoritativePathCandidates(tab).length > 0;
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

  function getRootFolderTreeDetails() {
    if (!folderTreeRoot) return [];
    return Array.from(folderTreeRoot.querySelectorAll(":scope > .folder-tree-list > .folder-tree-item > details"));
  }

  function isGitFolderTreePath(path) {
    const normalizedPath = String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
    return normalizedPath.split("/").pop()?.toLowerCase() === ".git";
  }

  function isGitFolderTreeNode(node) {
    return node?.kind === "directory" && (
      String(node.name || "").toLowerCase() === ".git"
      || isGitFolderTreePath(node.path)
      || isGitFolderTreePath(node.fullPath)
    );
  }

  function isGitFolderTreeDetails(details) {
    if (!details) return false;
    return isGitFolderTreeNode(details._folderTreeNode)
      || isGitFolderTreePath(details.dataset?.path)
      || isGitFolderTreePath(details.dataset?.fullPath);
  }

  function shouldExpandAllFolderTreeDetails() {
    const rootDetails = getRootFolderTreeDetails().filter(function(details) {
      return !isGitFolderTreeDetails(details);
    });
    return rootDetails.length > 0 && rootDetails.every(function(details) {
      return !details.open;
    });
  }

  function updateFolderTreeExpandToggleButtons() {
    const hasFolder = !!isFolderOpen;
    const title = !hasFolder
      ? "Open a folder to expand or collapse folders"
      : "Collapse all folders";

    folderTreeExpandToggleButtons.forEach(function(button) {
      const icon = button.querySelector("i");
      if (icon) icon.className = "bi bi-arrows-collapse";
      button.disabled = !hasFolder;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });
  }

  function countFolderTreeNodeFolders(nodes) {
    return (nodes || []).reduce(function(count, node) {
      if (node?.kind !== "directory") return count;
      if (isGitFolderTreeNode(node)) return count;
      return count + 1 + countFolderTreeNodeFolders(node.children || []);
    }, 0);
  }

  function countFolderTreeFolders() {
    const modelCount = countFolderTreeNodeFolders(currentFolderTreeNodes || []);
    if (modelCount > 0) return modelCount;
    return folderTreeRoot
      ? Array.from(folderTreeRoot.querySelectorAll("details")).filter(function(details) {
        return !isGitFolderTreeDetails(details);
      }).length
      : 0;
  }

  async function setFolderTreeDetailsOpen(details, open, options = {}) {
    if (!details) return;
    if (open && isGitFolderTreeDetails(details)) return;
    const depth = Number.isFinite(options.depth) ? options.depth : 1;
    const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : Infinity;
    const shouldOpen = open && depth <= maxDepth;
    resetFolderTreeAnimation(details, getFolderTreeChildrenContainer(details));
    if (shouldOpen && typeof renderFolderTreeLazyChildren === "function") {
      await renderFolderTreeLazyChildren(details);
    }
    details.open = shouldOpen;
    const childDetailsList = Array.from(details.querySelectorAll(":scope > .folder-tree-children > .folder-tree-list > .folder-tree-item > details"));
    for (let index = 0; index < childDetailsList.length; index += 8) {
      const childDetailsBatch = childDetailsList.slice(index, index + 8);
      await Promise.all(childDetailsBatch.map((childDetails) => (
        setFolderTreeDetailsOpen(childDetails, open, { depth: depth + 1, maxDepth })
      )));
    }
  }

  async function setAllFolderTreeDetails(open) {
    if (!folderTreeRoot) return;
    const folderCount = countFolderTreeFolders();
    const threshold = typeof getFolderTreeExpandLimitThreshold === "function" ? getFolderTreeExpandLimitThreshold() : 1000;
    const limitedDepth = typeof getFolderTreeExpandLimitDepth === "function" ? getFolderTreeExpandLimitDepth() : 5;
    const maxDepth = open && folderCount > threshold ? limitedDepth : Infinity;
    const rootDetails = getRootFolderTreeDetails();
    for (const details of rootDetails) {
      await setFolderTreeDetailsOpen(details, open, { depth: 1, maxDepth });
    }
    updateFolderTreeExpandToggleButtons();
  }

  function getUnsupportedFileToggleButtons() {
    return document.querySelectorAll(".toggle-unsupported-files");
  }

  function getFolderTreeGraphViewButtons() {
    return document.querySelectorAll(".open-graph-view");
  }

  function getFolderTreeGraphExportButtons() {
    return document.querySelectorAll(".export-folder-to-graph");
  }

  function getTagManagementMenuButtons() {
    return document.querySelectorAll(".tag-management-menu-button");
  }

  function getVisibleFolderTreeNodes(nodes) {
    return (nodes || []).reduce(function(visibleNodes, node) {
      if (node.kind === "directory") {
        if (node.name === ".git" && !(typeof shouldShowGitProjectFolder === "function" && shouldShowGitProjectFolder())) return visibleNodes;
        if (node.name === ".md-editor" && !(typeof shouldShowMdEditorProjectFolder === "function" && shouldShowMdEditorProjectFolder())) return visibleNodes;
        if (typeof shouldSkipCustomHiddenFolder === "function" && shouldSkipCustomHiddenFolder(node.name)) return visibleNodes;
        const visibleChildren = getVisibleFolderTreeNodes(node.children || []);
        visibleNodes.push({ ...node, children: visibleChildren });
        return visibleNodes;
      }

      if (node.kind === "file" && (showUnsupportedFolderFiles || isSupportedFolderTreeDocumentNode(node))) {
        visibleNodes.push(node);
      }
      return visibleNodes;
    }, []);
  }

  function getFolderTreeNodePathKey(node) {
    return getComparableFilePath(node?.fullPath || node?.path || node?.file?.webkitRelativePath || node?.file?.name || node?.name || "");
  }


  function createFolderMarkdownTagIndex() {
    const index = new Map();
    (folderMarkdownFiles || []).forEach((entry) => {
      const entryPathKey = getComparableFilePath(entry.fullPath || entry.path || entry.file?.webkitRelativePath || entry.file?.name || entry.name || "");
      if (entryPathKey) index.set(entryPathKey, normalizeFileTagList(entry.tags || []));
    });
    return index;
  }

  function getFolderTreeNodeTags(node, tagIndex) {
    if (!node || node.kind !== "file") return [];
    if (Array.isArray(node.tags)) return normalizeFileTagList(node.tags);
    const nodePathKey = getFolderTreeNodePathKey(node);
    if (nodePathKey && tagIndex?.has(nodePathKey)) {
      return tagIndex.get(nodePathKey) || [];
    }
    const matchingEntry = (folderMarkdownFiles || []).find((entry) => {
      const entryPathKey = getComparableFilePath(entry.fullPath || entry.path || entry.file?.webkitRelativePath || entry.file?.name || entry.name || "");
      return entryPathKey && nodePathKey && entryPathKey === nodePathKey;
    });
    return normalizeFileTagList(matchingEntry?.tags || []);
  }

  function getFolderMarkdownEntryPath(entry) {
    return String(entry?.path || entry?.file?.webkitRelativePath || entry?.fullPath || entry?.file?.name || entry?.name || "").replace(/\\/g, "/");
  }

  function getLazyFolderEntryRelativePath(folderNode, entry) {
    const folderPath = String(folderNode?.path || "").replace(/\\/g, "/").replace(/\/+$/g, "");
    const folderFullPath = String(folderNode?.fullPath || "").replace(/\\/g, "/").replace(/\/+$/g, "");
    const entryPath = getFolderMarkdownEntryPath(entry);
    const entryFullPath = String(entry?.fullPath || "").replace(/\\/g, "/");
    if (folderPath && entryPath.startsWith(`${folderPath}/`)) return entryPath.slice(folderPath.length + 1);
    if (folderFullPath && entryFullPath.startsWith(`${folderFullPath}/`)) return entryFullPath.slice(folderFullPath.length + 1);
    return "";
  }

  function createLazyTagFilteredFolderTreeNodes(folderNode, selectedTags) {
    const rootNodes = [];
    const directories = new Map();
    const folderPath = String(folderNode?.path || "").replace(/\\/g, "/").replace(/\/+$/g, "");
    const folderFullPath = String(folderNode?.fullPath || "").replace(/\\/g, "/").replace(/\/+$/g, "");

    const ensureDirectory = (relativeParts, parentChildren) => {
      let children = parentChildren;
      let directoryPath = folderPath;
      let directoryFullPath = folderFullPath;
      relativeParts.forEach((part) => {
        directoryPath = directoryPath ? `${directoryPath}/${part}` : part;
        directoryFullPath = directoryFullPath ? `${directoryFullPath}/${part}` : "";
        const key = getComparableFilePath(directoryFullPath || directoryPath);
        if (!directories.has(key)) {
          const node = { kind: "directory", name: part, path: directoryPath, fullPath: directoryFullPath, children: [], childrenLazy: false };
          directories.set(key, node);
          children.push(node);
        }
        children = directories.get(key).children;
      });
      return children;
    };

    (folderMarkdownFiles || []).forEach((entry) => {
      const tags = normalizeFileTagList(entry.tags || []);
      if (!selectedTags.some((tag) => tags.includes(tag))) return;
      const relativePath = getLazyFolderEntryRelativePath(folderNode, entry);
      if (!relativePath || relativePath === getFolderMarkdownEntryPath(entry)) return;
      const parts = relativePath.split("/").filter(Boolean);
      if (!parts.length) return;
      const fileName = parts.pop();
      const parentChildren = ensureDirectory(parts, rootNodes);
      parentChildren.push({
        kind: "file",
        name: fileName,
        path: entry.path || (folderPath ? `${folderPath}/${relativePath}` : relativePath),
        fullPath: entry.fullPath || (folderFullPath ? `${folderFullPath}/${relativePath}` : ""),
        tags,
        size: entry.size,
        modifiedAt: entry.modifiedAt,
        createdAt: entry.createdAt,
        isGraphDocumentFile: entry.isGraphDocumentFile
      });
    });

    return rootNodes;
  }
  function getTagFilteredFolderTreeNodes(nodes, tagIndex = createFolderMarkdownTagIndex()) {
    const selectedTags = Array.from(selectedFolderTreeTags || []);
    if (!selectedTags.length) return nodes;

    return (nodes || []).reduce(function(matches, node) {
      if (node.kind === "directory") {
        let filteredChildren = getTagFilteredFolderTreeNodes(node.children || [], tagIndex);
        if (!filteredChildren.length && node.childrenLazy === true) {
          filteredChildren = createLazyTagFilteredFolderTreeNodes(node, selectedTags);
        }
        if (filteredChildren.length) {
          matches.push({ ...node, children: filteredChildren });
        }
        return matches;
      }

      const nodeTags = getFolderTreeNodeTags(node, tagIndex);
      if (selectedTags.some((tag) => nodeTags.includes(tag))) {
        matches.push(node);
      }
      return matches;
    }, []);
  }

  function toggleFolderTreeTagFilter(tagName) {
    const normalizedTag = normalizeTagName(tagName);
    if (!normalizedTag) return;
    selectedFolderTreeTags = new Set(selectedFolderTreeTags);
    if (selectedFolderTreeTags.has(normalizedTag)) {
      selectedFolderTreeTags.delete(normalizedTag);
    } else {
      selectedFolderTreeTags.add(normalizedTag);
    }
    renderTagManagementList();
    renderFilteredFolderTree();
    updateTagManagementMenuButtons();
  }

  function clearFolderTreeTagFilters() {
    if (!selectedFolderTreeTags.size) return;
    selectedFolderTreeTags = new Set();
    renderTagManagementList();
    renderFilteredFolderTree();
    updateTagManagementMenuButtons();
  }

  /**
   * Compile one reusable folder-view matcher for a filter operation.
   * @param {string} filterText - User-entered filter supporting progressive `*` and `?` wildcards.
   * @returns {Function} Predicate that evaluates a file or folder name.
   */
  function createFolderFilterMatcher(filterText) {
    const normalizedFilter = String(filterText || "").trim().toLowerCase();
    if (!normalizedFilter) return () => true;
    if (!/[*?]/.test(normalizedFilter)) {
      return (candidate) => String(candidate || "").toLowerCase().includes(normalizedFilter);
    }
    const escapedFilter = normalizedFilter.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const wildcardPattern = escapedFilter.replace(/\*/g, ".*").replace(/\?/g, ".");
    const wildcardExpression = new RegExp(`^${wildcardPattern}`);
    return (candidate) => wildcardExpression.test(String(candidate || "").toLowerCase());
  }

  function matchesFolderFilterText(candidate, filterText) {
    return createFolderFilterMatcher(filterText)(candidate);
  }

  function getFilteredFolderTreeNodes(nodes, filterText, matchesFilter = createFolderFilterMatcher(filterText)) {
    const normalizedFilter = String(filterText || "").trim().toLowerCase();
    if (!normalizedFilter) return nodes;

    return (nodes || []).reduce(function(matches, node) {
      const nameMatches = matchesFilter(node.name);

      if (node.kind === "directory") {
        const filteredChildren = getFilteredFolderTreeNodes(node.children || [], normalizedFilter, matchesFilter);
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

  function getCollapsedFolderTreeNodes(nodes) {
    return (nodes || []).map((node) => {
      if (node?.kind !== "directory") return node;
      return {
        ...node,
        children: getCollapsedFolderTreeNodes(node.children || []),
        childrenLazy: true
      };
    });
  }
  function getFolderFilterRelativePath(fullPath, rootPath) {
    const normalizedFullPath = String(fullPath || "").replace(/\\/g, "/");
    const normalizedRootPath = String(rootPath || "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (!normalizedRootPath || !normalizedFullPath.toLowerCase().startsWith(`${normalizedRootPath.toLowerCase()}/`)) return "";
    return normalizedFullPath.slice(normalizedRootPath.length + 1).replace(/^\/+/, "");
  }

  function shouldSkipFolderFilterPath(pathSegments) {
    return pathSegments.some((segment) => (
      (segment === ".git" && !(typeof shouldShowGitProjectFolder === "function" && shouldShowGitProjectFolder()))
      || (segment === ".md-editor" && !(typeof shouldShowMdEditorProjectFolder === "function" && shouldShowMdEditorProjectFolder()))
      || (typeof shouldSkipCustomHiddenFolder === "function" && shouldSkipCustomHiddenFolder(segment))
    ));
  }

  /**
   * Builds a minimal folder tree containing wildcard matches and their ancestors.
   * @param {Array} entries - Recursive Neutralino directory entries.
   * @param {string} rootPath - Absolute path of the open workspace.
   * @param {string} filterText - Wildcard filter to apply to entry names.
   * @returns {Array} Matching folder tree nodes.
   */
  function buildWildcardFilteredFolderTreeNodes(entries, rootPath, filterText) {
    const nodes = [];
    const directoriesByPath = new Map();
    const normalizedRootPath = String(rootPath || "").replace(/\\/g, "/").replace(/\/+$/, "");
    const matchesFilter = createFolderFilterMatcher(filterText);

    function ensureDirectory(segments) {
      let children = nodes;
      let relativePath = "";
      let directory = null;
      segments.forEach((segment) => {
        relativePath = relativePath ? `${relativePath}/${segment}` : segment;
        directory = directoriesByPath.get(relativePath);
        if (!directory) {
          directory = {
            kind: "directory",
            name: segment,
            path: relativePath,
            fullPath: `${normalizedRootPath}/${relativePath}`,
            children: [],
            childrenLazy: false
          };
          directoriesByPath.set(relativePath, directory);
          children.push(directory);
        }
        children = directory.children;
      });
      return directory;
    }

    (entries || []).forEach((entry) => {
      const relativePath = getFolderFilterRelativePath(entry?.path, rootPath);
      if (!relativePath) return;
      const segments = relativePath.split("/").filter(Boolean);
      const name = segments[segments.length - 1] || entry?.entry || "";
      const entryType = String(entry?.type || "").toUpperCase();
      const directorySegments = entryType === "DIRECTORY" ? segments : segments.slice(0, -1);
      if (shouldSkipFolderFilterPath(directorySegments)) return;

      if (entryType === "DIRECTORY") {
        if (matchesFilter(name)) ensureDirectory(segments);
        return;
      }
      if (entryType !== "FILE" || !matchesFilter(name)) return;

      const fileNode = {
        kind: "file",
        name,
        path: relativePath,
        fullPath: String(entry.path || "").replace(/\\/g, "/")
      };
      if (!showUnsupportedFolderFiles && !isSupportedFolderTreeDocumentNode(fileNode)) return;
      const parentDirectory = ensureDirectory(directorySegments);
      (parentDirectory ? parentDirectory.children : nodes).push(fileNode);
    });

    if (typeof sortFolderTreeNodes === "function") sortFolderTreeNodes(nodes);
    return nodes;
  }

  let wildcardFolderEntryCachePath = "";
  let wildcardFolderEntryCache = null;
  const wildcardFolderResultCache = new Map();
  let wildcardFolderEntryLoadPromise = null;

  /**
   * Align the wildcard entry cache with the currently open folder.
   * @returns {string} Comparable path key for the active folder.
   */
  function prepareWildcardFolderEntryCache() {
    const activeFolderPathKey = getComparableFilePath(activeFolderPath);
    if (wildcardFolderEntryCachePath !== activeFolderPathKey) {
      wildcardFolderEntryCachePath = activeFolderPathKey;
      wildcardFolderEntryCache = null;
      wildcardFolderResultCache.clear();
      wildcardFolderEntryLoadPromise = null;
    }
    return activeFolderPathKey;
  }

  /**
   * Mark cached filter directories for immediate child rendering.
   * @param {Array} nodes - Filtered directory nodes backed by the completed scan.
   * @returns {Array} The same nodes prepared for eager rendering.
   */
  function markFolderTreeNodesForImmediateRendering(nodes) {
    (nodes || []).forEach((node) => {
      if (node?.kind !== "directory") return;
      node.renderChildrenImmediately = true;
      markFolderTreeNodesForImmediateRendering(node.children);
    });
    return nodes;
  }
  /**
   * Build the cache key for one wildcard query and file-visibility mode.
   * @returns {string} Stable result-cache key.
   */
  function getWildcardFolderResultCacheKey(filterText) {
    return `${String(filterText || "").trim().toLowerCase()}\u0000${showUnsupportedFolderFiles ? "all" : "supported"}`;
  }

  function cacheWildcardFolderFilterResult(filterText, nodes) {
    wildcardFolderResultCache.set(getWildcardFolderResultCacheKey(filterText), nodes);
    return nodes;
  }

  function getCachedWildcardFilteredFolderTreeNodes(filterText) {
    prepareWildcardFolderEntryCache();
    if (!Array.isArray(wildcardFolderEntryCache)) return null;
    const resultCacheKey = getWildcardFolderResultCacheKey(filterText);
    const cachedNodes = wildcardFolderResultCache.get(resultCacheKey);
    const nodes = cachedNodes || cacheWildcardFolderFilterResult(filterText, buildWildcardFilteredFolderTreeNodes(wildcardFolderEntryCache, activeFolderPath, filterText));
    return markFolderTreeNodesForImmediateRendering(nodes);
  }

  async function loadWildcardFilteredFolderTreeNodes(filterText) {
    if (!activeFolderPath || typeof readFolderTreeRecursiveEntriesFromDisk !== "function") return null;
    const folderPath = activeFolderPath;
    const folderPathKey = prepareWildcardFolderEntryCache();
    try {
      let entries = wildcardFolderEntryCache;
      if (!Array.isArray(entries)) {
        if (!wildcardFolderEntryLoadPromise) {
          wildcardFolderEntryLoadPromise = Promise.resolve(readFolderTreeRecursiveEntriesFromDisk(folderPath))
            .then((loadedEntries) => {
              if (wildcardFolderEntryCachePath === folderPathKey && Array.isArray(loadedEntries)) {
                wildcardFolderEntryCache = loadedEntries;
              }
              return loadedEntries;
            });
        }
        const entryLoadPromise = wildcardFolderEntryLoadPromise;
        try {
          entries = await entryLoadPromise;
        } finally {
          if (wildcardFolderEntryLoadPromise === entryLoadPromise) wildcardFolderEntryLoadPromise = null;
        }
      }
      return Array.isArray(entries) ? cacheWildcardFolderFilterResult(filterText, buildWildcardFilteredFolderTreeNodes(entries, folderPath, filterText)) : null;
    } catch (error) {
      console.warn("Failed to read folder entries for wildcard filtering:", error);
      return null;
    }

  }
  let folderTreeFilterRenderVersion = 0;

  function renderFolderTreeFilterResults(sourceNodes = currentFolderTreeNodes) {
    const visibleNodes = getVisibleFolderTreeNodes(sourceNodes);
    const tagFilteredNodes = getTagFilteredFolderTreeNodes(visibleNodes);
    const nodes = getFilteredFolderTreeNodes(tagFilteredNodes, folderTreeFilterText);
    const hasActiveFilter = !!folderTreeFilterText || selectedFolderTreeTags.size > 0;
    renderFolderTree(hasActiveFilter ? nodes : getCollapsedFolderTreeNodes(nodes), { preserveNodes: true, skipTagRefresh: true, skipDerivedRefresh: true });
    if (hasActiveFilter) {
      folderTreeRoot.querySelectorAll("details").forEach((details) => {
        details.open = true;
      });
      updateFolderTreeExpandToggleButtons();
    }
  }

  async function materializeWildcardFolderTreeResults() {
    const rootDetails = getRootFolderTreeDetails();
    for (const details of rootDetails) {
      await setFolderTreeDetailsOpen(details, true, { depth: 1, maxDepth: Infinity });
    }
    updateFolderTreeExpandToggleButtons();
  }

  function showWildcardFolderTreeSearchState() {
    folderTreeRoot.setAttribute?.("aria-busy", "true");
    const placeholder = folderTreeRoot.querySelector?.(".folder-tree-placeholder");
    if (placeholder) placeholder.textContent = "Searching files and folders...";
  }

  async function loadLazyFolderTreeNodesForWildcardFilter(rootDetails) {
    for (const details of rootDetails || []) {
      await setFolderTreeDetailsOpen(details, true, { depth: 1, maxDepth: Infinity });
    }
    return currentFolderTreeNodes;
  }

  function renderFilteredFolderTree() {
    if (!folderTreeRoot || !isFolderOpen) return;
    const renderVersion = ++folderTreeFilterRenderVersion;
    if (!/[*?]/.test(folderTreeFilterText)) {
      renderFolderTreeFilterResults();
      return;
    }
    const lazyRootDetails = getRootFolderTreeDetails();
    const cachedFilteredNodes = getCachedWildcardFilteredFolderTreeNodes(folderTreeFilterText);
    if (cachedFilteredNodes) {
      renderFolderTreeFilterResults(cachedFilteredNodes);
      return;
    }
    renderFolderTreeFilterResults();
    showWildcardFolderTreeSearchState();
    return new Promise((resolve) => setTimeout(resolve, 150))
      .then(() => {
        if (renderVersion !== folderTreeFilterRenderVersion) return null;
        return loadWildcardFilteredFolderTreeNodes(folderTreeFilterText);
      })
      .then(async (filteredNodes) => {
        if (renderVersion !== folderTreeFilterRenderVersion) return null;
        return filteredNodes || loadLazyFolderTreeNodesForWildcardFilter(lazyRootDetails);
      })
      .then((filteredNodes) => {
        if (!filteredNodes || renderVersion !== folderTreeFilterRenderVersion) return;
        renderFolderTreeFilterResults(filteredNodes);
        return materializeWildcardFolderTreeResults();
      });
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


  function updateUnsupportedFileToggleButtons() {
    const hasFolder = !!isFolderOpen;
    const label = showUnsupportedFolderFiles ? "Hide unsupported file types" : "Show unsupported file types";
    const title = hasFolder ? `${label} in the folder view` : "Open a folder to show unsupported file types";

    getUnsupportedFileToggleButtons().forEach(function(button) {
      const labelElement = button.querySelector(".unsupported-files-toggle-label");
      if (labelElement) {
        labelElement.textContent = label;
      }
      if (button.classList.contains("folder-tree-tool-button")) {
        button.disabled = !hasFolder;
        button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
      }
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-pressed", String(hasFolder && showUnsupportedFolderFiles));
    });
  }

  function updateFolderTreeGraphViewButtons() {
    const hasFolder = !!isFolderOpen;
    const title = hasFolder ? "Open Graph View" : "Open a folder to open Graph View";
    getFolderTreeGraphViewButtons().forEach(function(button) {
      button.disabled = !hasFolder;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });
  }

  function updateFolderTreeGraphExportButtons() {
    const hasFolder = !!isFolderOpen;
    const label = "Export Folder to Graph";
    const description = "Create a portable graph archive that includes Markdown file contents.";
    const title = hasFolder ? description : "Create a portable graph archive that includes Markdown file contents.";
    getFolderTreeGraphExportButtons().forEach(function(button) {
      button.disabled = !hasFolder;
      button.title = title;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });
  }

  function updateTagManagementMenuButtons() {
    const hasFolder = !!isFolderOpen;
    const hasTagFilter = hasFolder && selectedFolderTreeTags.size > 0;
    const selectedTagList = Array.from(selectedFolderTreeTags).map((tag) => `#${tag}`).join(", ");
    const title = hasTagFilter ? `Tag filter active: ${selectedTagList}` : (hasFolder ? "Manage tags" : "Open a folder to manage tags");
    getTagManagementMenuButtons().forEach(function(button) {
      button.disabled = !hasFolder;
      button.classList.toggle("tag-filter-active", hasTagFilter);
      button.title = title;
      button.setAttribute("aria-label", hasTagFilter ? `Manage tags. ${title}` : title);
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
      button.setAttribute("aria-pressed", hasTagFilter ? "true" : "false");
    });
    [createTagButton, deleteTagButton, tagManagementSearch].forEach(function(control) {
      if (!control) return;
      control.disabled = !hasFolder;
      control.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });
    if (clearTagFilterButton) {
      clearTagFilterButton.disabled = !hasTagFilter;
      clearTagFilterButton.title = hasTagFilter ? `Clear tag filter: ${selectedTagList}` : "No tag filter is active";
      clearTagFilterButton.setAttribute("aria-disabled", hasTagFilter ? "false" : "true");
    }
  }

  function setShowUnsupportedFolderFiles(enabled) {
    showUnsupportedFolderFiles = !!enabled;
    saveGlobalState({ showUnsupportedFolderFiles });
    updateUnsupportedFileToggleButtons();
    renderFilteredFolderTree();
  }

  function updateFolderTreeToolbarState() {
    updateAutoSelectFileButtons();
    updateFolderTreeGraphViewButtons();
    updateFolderTreeGraphExportButtons();
    updateTagManagementMenuButtons();
    updateUnsupportedFileToggleButtons();
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

  function findFolderTreeFileButtonForAuthoritativePaths(tab) {
    if (!folderTreeRoot) return null;
    const candidates = getTabTreeAuthoritativePathCandidates(tab).map(getComparableFilePath);
    if (!candidates.length) return null;
    return Array.from(folderTreeRoot.querySelectorAll(".folder-tree-file")).find(function(button) {
      const buttonCandidates = [button.dataset.fullPath, button.dataset.path]
        .filter(Boolean)
        .map(getComparableFilePath);
      return candidates.some((candidate) => buttonCandidates.includes(candidate));
    }) || null;
  }

  function findFolderTreeFileButtonForTab(tab) {
    if (!folderTreeRoot) return null;
    if (hasTabTreeAuthoritativePath(tab)) return findFolderTreeFileButtonForAuthoritativePaths(tab);
    const candidates = getTabTreeFileCandidates(tab);
    if (!candidates.length) return null;

    const scoredButtons = Array.from(folderTreeRoot.querySelectorAll(".folder-tree-file")).map(function(button) {
      const buttonCandidates = [button.dataset.fullPath, button.dataset.path, button.dataset.name, button.textContent]
        .filter(Boolean)
        .map(getComparableFilePath);

      const score = candidates.reduce(function(bestScore, candidate) {
        return Math.max(bestScore, buttonCandidates.reduce(function(bestButtonScore, buttonCandidate) {
          if (!candidate || !buttonCandidate) return bestButtonScore;
          if (buttonCandidate === candidate) return Math.max(bestButtonScore, 10000 + buttonCandidate.length);
          if (buttonCandidate.endsWith(`/${candidate}`)) return Math.max(bestButtonScore, 5000 + candidate.length);
          if (candidate.endsWith(`/${buttonCandidate}`)) return Math.max(bestButtonScore, 1000 + buttonCandidate.length);
          return bestButtonScore;
        }, 0));
      }, 0);

      return { button, score };
    });

    const bestMatch = scoredButtons.reduce(function(best, candidate) {
      if (!candidate.score) return best;
      if (!best || candidate.score > best.score) return candidate;
      return best;
    }, null);

    return bestMatch?.button || null;
  }

  function getTabTreeRevealPathCandidates(tab) {
    return getTabTreeAuthoritativePathCandidates(tab);
  }

  function revealFolderTreeButton(button) {
    let ancestor = button?.parentElement || null;
    while (ancestor) {
      if (ancestor.tagName === "DETAILS") ancestor.open = true;
      ancestor = ancestor.parentElement;
    }
  }

  function markFolderTreeButtonAutoSelected(button, options = {}) {
    if (!button) return;
    revealFolderTreeButton(button);
    button.classList.add("auto-selected");
    button.setAttribute("aria-current", "page");

    if (options.scroll !== false) {
      button.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }

  async function syncFolderTreeSelectionToActiveTab(options = {}) {
    if (!folderTreeRoot) return;
    folderTreeRoot.querySelectorAll(".folder-tree-file.auto-selected").forEach(function(button) {
      button.classList.remove("auto-selected");
      button.removeAttribute("aria-current");
    });

    if (!autoSelectFileEnabled) return;

    const activeTab = tabs.find(function(tab) { return tab.id === activeTabId; });
    let selectedButton = null;
    if (typeof revealFolderTreeFileByPath === "function") {
      const candidates = getTabTreeRevealPathCandidates(activeTab);
      const revealOptions = { allowFileNameOnlyMatch: !hasTabTreeAuthoritativePath(activeTab) };
      for (const candidatePath of candidates) {
        selectedButton = await revealFolderTreeFileByPath(candidatePath, revealOptions);
        if (selectedButton) break;
      }
    }
    if (!selectedButton && hasTabTreeAuthoritativePath(activeTab)) return;
    if (!selectedButton) selectedButton = findFolderTreeFileButtonForTab(activeTab);
    if (!selectedButton) return;
    if (!selectedButton.classList.contains("multi-selected")) {
      app.modules?.sidebarContextTree?.clearSidebarTreeSelection?.();
    }

    markFolderTreeButtonAutoSelected(selectedButton, options);
    updateFolderTreeExpandToggleButtons();
  }

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


    Object.assign(api, {
      getComparableFilePath,
      getTabTreeFileCandidates,
      updateAutoSelectFileButtons,
      shouldExpandAllFolderTreeDetails,
      updateFolderTreeExpandToggleButtons,
      setAllFolderTreeDetails,
      getUnsupportedFileToggleButtons,
      getFolderTreeGraphViewButtons,
      getFolderTreeGraphExportButtons,
      getTagManagementMenuButtons,
      getVisibleFolderTreeNodes,
      getFolderTreeNodePathKey,
      getFolderTreeNodeTags,
      getTagFilteredFolderTreeNodes,
      toggleFolderTreeTagFilter,
      clearFolderTreeTagFilters,
      getDeleteTagChoices,
      showDeleteTagPicker,
      matchesFolderFilterText,
      getFilteredFolderTreeNodes,
      getCollapsedFolderTreeNodes,
      buildWildcardFilteredFolderTreeNodes,
      loadWildcardFilteredFolderTreeNodes,
      renderFilteredFolderTree,
      updateFolderTreeFilterControls,
      getFolderSortLabel,
      updateFolderTreeSortControls,
      updateUnsupportedFileToggleButtons,
      updateFolderTreeGraphViewButtons,
      updateFolderTreeGraphExportButtons,
      updateTagManagementMenuButtons,
      setShowUnsupportedFolderFiles,
      updateFolderTreeToolbarState,
      setAutoSelectFileEnabled,
      findFolderTreeFileButtonForTab,
      syncFolderTreeSelectionToActiveTab,
      enhanceGitHubAlerts,
    });
    }

    app.services.folderToolbar = api;
    app.registerModule("folderToolbar", api);
    return api;
  };
})(window);
