(function(global) {
  global.registerMarkdownViewerTags = function registerMarkdownViewerTags(app, deps) {
    const api = {};

    with (deps) {
  function getKnownTags() {
    return normalizeFileTagList(loadGlobalState().knownTags || []);
  }

  function saveKnownTags(tags) {
    saveGlobalState({ knownTags: normalizeFileTagList(tags).sort((a, b) => a.localeCompare(b)) });
  }

  function getCreatedTags() {
    return normalizeFileTagList(loadGlobalState().createdTags || []);
  }

  function saveCreatedTags(tags) {
    saveGlobalState({ createdTags: normalizeFileTagList(tags).sort((a, b) => a.localeCompare(b)) });
  }

  function addTagsToCountMap(counts, tags) {
    normalizeFileTagList(tags).forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  }

  function removeTagsFromCountMap(counts, tags) {
    normalizeFileTagList(tags).forEach((tag) => {
      const nextCount = (counts.get(tag) || 0) - 1;
      if (nextCount > 0) {
        counts.set(tag, nextCount);
      } else {
        counts.delete(tag);
      }
    });
  }

  function areTagListsEqual(firstTags, secondTags) {
    const first = normalizeFileTagList(firstTags).sort();
    const second = normalizeFileTagList(secondTags).sort();
    return first.length === second.length && first.every((tag, index) => tag === second[index]);
  }

  function getComparableFolderEntryPath(entry) {
    return getComparableFilePath(entry?.fullPath || entry?.path || entry?.file?.webkitRelativePath || entry?.file?.name || entry?.name || "");
  }

  function getFolderMarkdownEntryForTab(tab) {
    if (!tab || tab.type === "graph") return null;

    if (tab.sourceFileHandle) {
      const handleMatch = (folderMarkdownFiles || []).find((entry) => entry.handle && entry.handle === tab.sourceFileHandle);
      if (handleMatch) return handleMatch;
    }

    const tabPathKey = getComparableFilePath(tab.sourceFilePath || "");
    if (tabPathKey) {
      const pathMatch = (folderMarkdownFiles || []).find((entry) => getComparableFolderEntryPath(entry) === tabPathKey);
      if (pathMatch) return pathMatch;
    }

    const tabName = tab.sourceFileName || (tab.sourceFilePath ? getFileName(tab.sourceFilePath) : "");
    if (!tabName) return null;

    return (folderMarkdownFiles || []).find((entry) => {
      const entryName = entry.name || entry.file?.name || (entry.path ? getFileName(entry.path) : "") || (entry.fullPath ? getFileName(entry.fullPath) : "");
      return entryName === tabName;
    }) || null;
  }

  function updateFolderTreeNodeTagsForEntry(fileEntry, tags) {
    const entryPathKey = getComparableFolderEntryPath(fileEntry);
    if (!entryPathKey) return;

    const updateNodes = (nodes) => {
      (nodes || []).forEach((node) => {
        if (node.kind === "directory") {
          updateNodes(node.children || []);
          return;
        }

        if (getFolderTreeNodePathKey(node) === entryPathKey) {
          node.tags = normalizeFileTagList(tags);
        }
      });
    };

    updateNodes(currentFolderTreeNodes);
  }

  function syncMarkdownTabTagsToFolderState(tab, content) {
    const normalizedContent = normalizeEditorContent(content);
    const nextTags = getFileTagsFromContent(normalizedContent);
    const fileEntry = getFolderMarkdownEntryForTab(tab);
    const previousTags = fileEntry
      ? normalizeFileTagList(fileEntry.tags || [])
      : normalizeFileTagList(tab?.graphSyncedTags || getOpenGraphSnapshotTagsForMarkdownTab(tab));

    if (fileEntry) {
      fileEntry.content = normalizedContent;
    }

    if (areTagListsEqual(previousTags, nextTags)) return;

    if (fileEntry) {
      fileEntry.tags = nextTags;
      removeTagsFromCountMap(folderTagCounts, previousTags);
      addTagsToCountMap(folderTagCounts, nextTags);
      updateFolderTreeNodeTagsForEntry(fileEntry, nextTags);
    }
    if (tab) tab.graphSyncedTags = nextTags;

    saveKnownTags([...getKnownTags(), ...nextTags]);
    syncOpenGraphSnapshotsForMarkdownTabTagChange(tab, normalizedContent);
    renderTagManagementList();
    renderLinkAutocomplete();
    if (selectedFolderTreeTags.size) {
      renderFilteredFolderTree();
    }
  }

  function getActiveGraphSnapshotTagCounts() {
    const counts = new Map();
    const activeGraphTab = getActiveGraphTab();
    (activeGraphTab?.graphSnapshot?.files || []).forEach((snapshotFile) => {
      const tags = snapshotFile.tags?.length ? snapshotFile.tags : getFileTagsFromContent(snapshotFile.content || "");
      addTagsToCountMap(counts, tags);
    });
    return counts;
  }

  function getReferencedTagCounts() {
    const graphCounts = getActiveGraphSnapshotTagCounts();
    if (graphCounts.size) return graphCounts;
    return new Map(folderTagCounts || []);
  }

  function getAllKnownAndReferencedTags() {
    const tagSet = new Set(getKnownTags());
    getReferencedTagCounts().forEach((_count, tag) => tagSet.add(tag));
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }

  function getAvailableTags() {
    const tagSet = new Set(getCreatedTags());
    getReferencedTagCounts().forEach((_count, tag) => tagSet.add(tag));
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }

  function getReferencedTags() {
    return Array.from(getReferencedTagCounts().keys()).sort((a, b) => a.localeCompare(b));
  }

  function getGraphFileEntryNodeId(fileEntry) {
    if (!fileEntry) return "";
    return fileEntry.id || normalizeGraphNodeName(fileEntry.path || fileEntry.fullPath || fileEntry.file?.webkitRelativePath || fileEntry.file?.name || fileEntry.name || "");
  }

  function findFolderMarkdownEntryForGraphFile(fileEntry) {
    const fileNodeId = getGraphFileEntryNodeId(fileEntry);
    if (!fileNodeId) return null;
    return (folderMarkdownFiles || []).find((entry) => getGraphFileEntryNodeId(entry) === fileNodeId) || null;
  }

  async function readFolderMarkdownFileContent(fileEntry) {
    if (!fileEntry) return "";
    if (typeof fileEntry.content === "string") return fileEntry.content;
    if (fileEntry.file?.text) return fileEntry.file.text();
    if (fileEntry.handle?.getFile) {
      const file = await fileEntry.handle.getFile();
      return file.text();
    }
    if (typeof NL_VERSION !== "undefined" && fileEntry.fullPath) {
      return Neutralino.filesystem.readFile(fileEntry.fullPath);
    }

    const folderEntry = findFolderMarkdownEntryForGraphFile(fileEntry);
    if (folderEntry && folderEntry !== fileEntry) return readFolderMarkdownFileContent(folderEntry);
    return "";
  }

  async function refreshFolderTagCounts() {
    const refreshId = ++folderTagCountsRefreshId;
    const counts = new Map();
    const files = (folderMarkdownFiles || []).slice();

    for (const fileEntry of files) {
      try {
        const content = await readFolderMarkdownFileContent(fileEntry);
        if (refreshId !== folderTagCountsRefreshId) return;
        fileEntry.content = content || "";
        fileEntry.tags = getFileTagsFromContent(fileEntry.content);
        addTagsToCountMap(counts, fileEntry.tags);
      } catch (error) {
        console.warn("Failed to read folder file tags:", fileEntry.path || fileEntry.fullPath || fileEntry.name, error);
      }
    }

    if (refreshId !== folderTagCountsRefreshId) return;
    folderTagCounts = counts;
    renderTagManagementList();
    renderLinkAutocomplete();
    if (selectedFolderTreeTags.size) {
      renderFilteredFolderTree();
    }
  }

  function clearFolderTagCounts() {
    folderTagCountsRefreshId += 1;
    folderTagCounts = new Map();
    renderTagManagementList();
  }

  function renderTagManagementList() {
    if (!tagManagementList) return;
    tagManagementList.setAttribute("aria-multiselectable", "true");
    const query = String(tagManagementSearch?.value || "").trim().toLowerCase();
    const counts = getReferencedTagCounts();
    const tagSource = query ? getAllKnownAndReferencedTags() : getAvailableTags();
    const tags = tagSource.filter((tag) => !query || tag.includes(query));
    tagManagementList.innerHTML = "";

    if (!tags.length) {
      const empty = document.createElement("div");
      empty.className = "tag-management-list-empty";
      empty.textContent = query ? "No matching tags" : "No known tags yet";
      tagManagementList.appendChild(empty);
      return;
    }

    tags.forEach((tag) => {
      const button = document.createElement("button");
      const isSelected = selectedFolderTreeTags.has(tag);
      button.type = "button";
      button.className = "tag-management-list-item" + (isSelected ? " selected" : "");
      button.dataset.tagName = tag;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", isSelected ? "true" : "false");
      button.title = isSelected ? `Remove #${tag} from the folder tree tag filter` : `Show files tagged #${tag} in the folder tree`;
      button.innerHTML = `<i class="bi ${isSelected ? "bi-tag-fill" : "bi-tag"}" aria-hidden="true"></i><span>#${escapeHtml(tag)}</span><span class="tag-management-list-item-count">${counts.get(tag) || 0}</span>`;
      button.addEventListener("click", () => {
        toggleFolderTreeTagFilter(tag);
      });
      tagManagementList.appendChild(button);
    });
  }

  function createTag(tagName) {
    const normalizedTag = normalizeTagName(tagName);
    if (!normalizedTag) {
      alert("Enter a tag name to create.");
      return false;
    }

    const tags = getKnownTags();
    if (!tags.includes(normalizedTag)) {
      saveKnownTags([...tags, normalizedTag]);
    }
    const createdTags = getCreatedTags();
    if (!createdTags.includes(normalizedTag)) {
      saveCreatedTags([...createdTags, normalizedTag]);
    }
    if (tagManagementSearch) tagManagementSearch.value = "";
    renderTagManagementList();
    const activeGraphTab = getActiveGraphTab();
    if (activeGraphTab) {
      updateGraphTagToolbar(activeGraphTab, activeGraphTab.graphSnapshot || null);
    }
    return true;
  }

  function snapshotFileMatchesTab(snapshotFile, tab) {
    if (!snapshotFile || !tab || tab.type === "graph") return false;
    const candidatePaths = new Set([snapshotFile.fullPath, snapshotFile.path].filter(Boolean).map(getComparableFilePath));
    const candidateNames = new Set([
      snapshotFile.name,
      snapshotFile.path ? getFileName(snapshotFile.path) : null,
      snapshotFile.fullPath ? getFileName(snapshotFile.fullPath) : null
    ].filter(Boolean));

    if (tab.sourceFilePath && candidatePaths.has(getComparableFilePath(tab.sourceFilePath))) return true;
    if (tab.sourceFileName && candidateNames.has(tab.sourceFileName)) return true;
    return !!(tab.title && candidateNames.has(tab.title));
  }

  function updateOpenMarkdownTabsForSnapshotFile(snapshotFile) {
    const normalizedContent = normalizeEditorContent(snapshotFile.content || "");
    tabs.forEach((tab) => {
      if (!snapshotFileMatchesTab(snapshotFile, tab)) return;
      tab.content = normalizedContent;
      if (tab.id === activeTabId) {
        markdownEditor.value = normalizedContent;
        renderEditorSyntaxHighlights();
        updateEditorLineNumbers();
        renderMarkdown();
      }
    });
  }

  function getOpenGraphSnapshotTagsForMarkdownTab(sourceTab) {
    if (!sourceTab || sourceTab.type === "graph") return [];
    for (const tab of tabs) {
      if (tab?.type !== "graph" || !tab.graphSnapshot?.files) continue;
      const matchingSnapshotFile = tab.graphSnapshot.files.find((snapshotFile) => snapshotFileMatchesTab(snapshotFile, sourceTab));
      if (matchingSnapshotFile) {
        return normalizeFileTagList(matchingSnapshotFile.tags?.length ? matchingSnapshotFile.tags : getFileTagsFromContent(matchingSnapshotFile.content || ""));
      }
    }
    return [];
  }

  function updateFolderMarkdownEntryForSnapshotFile(snapshotFile) {
    const snapshotNodeId = snapshotFile.id || normalizeGraphNodeName(snapshotFile.path || snapshotFile.fullPath || snapshotFile.name || "");
    const folderEntry = (folderMarkdownFiles || []).find((entry) => {
      const entryPath = entry.path || entry.fullPath || entry.file?.webkitRelativePath || entry.file?.name || "";
      return normalizeGraphNodeName(entryPath) === snapshotNodeId;
    });
    if (folderEntry) {
      folderEntry.content = snapshotFile.content || "";
      folderEntry.tags = getFileTagsFromContent(folderEntry.content);
      updateFolderTreeNodeTagsForEntry(folderEntry, folderEntry.tags);
    }
  }

  async function syncOpenGraphSnapshotsForMarkdownTabTagChange(sourceTab, content) {
    if (!sourceTab || sourceTab.type === "graph") return false;
    const syncRequestId = ++openGraphSnapshotTagSyncRequestId;
    const normalizedContent = normalizeEditorContent(content);
    let changedActiveGraph = false;

    for (const tab of tabs) {
      if (syncRequestId !== openGraphSnapshotTagSyncRequestId) return false;
      if (tab?.type !== "graph" || !tab.graphSnapshot?.files || isKeepSavedGraphMode(tab)) continue;

      let graphChanged = false;
      tab.graphSnapshot.files.forEach((snapshotFile) => {
        if (!snapshotFileMatchesTab(snapshotFile, sourceTab)) return;
        snapshotFile.content = normalizedContent;
        snapshotFile.tags = getFileTagsFromContent(normalizedContent);
        graphChanged = true;
      });

      if (!graphChanged) continue;
      const currentSnapshot = tab.graphSnapshot;
      tab.graphSnapshot = await createGraphSnapshot(currentSnapshot.files || [], currentSnapshot.folderName || tab.folderName || tab.title);
      if (syncRequestId !== openGraphSnapshotTagSyncRequestId) return false;
      if (currentSnapshot.createdAt) tab.graphSnapshot.createdAt = currentSnapshot.createdAt;
      graphRenderCache.delete(tab.id);
      markGraphTabAsChanged(tab);
      changedActiveGraph = changedActiveGraph || tab.id === activeTabId;
    }

    if (changedActiveGraph) {
      const activeGraphTab = getActiveGraphTab();
      updateGraphTagToolbar(activeGraphTab, activeGraphTab?.graphSnapshot || null);
      renderGraphView();
    }

    saveTabsToStorage(tabs);
    return changedActiveGraph;
  }

  function getTagDeletionEntryKey(entry) {
    return getComparableFilePath(entry?.fullPath || entry?.path || entry?.file?.webkitRelativePath || entry?.file?.name || entry?.name || "");
  }

  function getActiveGraphSnapshotFileDeletionTargets(tagName, existingKeys) {
    const activeGraphTab = getActiveGraphTab();
    if (!activeGraphTab?.graphSnapshot?.files || isKeepSavedGraphMode(activeGraphTab)) return [];

    return activeGraphTab.graphSnapshot.files
      .filter((snapshotFile) => !existingKeys.has(getTagDeletionEntryKey(snapshotFile)))
      .filter((snapshotFile) => getFileTagsFromContent(snapshotFile.content || "").includes(tagName))
      .map((snapshotFile) => ({
        id: snapshotFile.id,
        name: snapshotFile.name || (snapshotFile.path ? getFileName(snapshotFile.path) : "document.md"),
        path: snapshotFile.path || snapshotFile.fullPath || snapshotFile.name || "",
        fullPath: snapshotFile.fullPath || null,
        content: snapshotFile.content || "",
        tags: snapshotFile.tags || []
      }));
  }

  function getNeutralinoTagDeletionWritePath(entry) {
    if (!isNeutralinoRuntime()) return null;
    if (entry.fullPath) return entry.fullPath;
    if (!entry.path) return null;
    const entryPath = String(entry.path);
    const isAbsolutePath = /^[a-zA-Z]:[\\/]/.test(entryPath) || /^\\\\/.test(entryPath) || entryPath.startsWith("/");
    return isAbsolutePath ? entryPath : (activeFolderPath ? joinPath(activeFolderPath, entryPath) : null);
  }

  async function writeTagDeletionTargetContent(entry, content) {
    const neutralinoWritePath = getNeutralinoTagDeletionWritePath(entry);
    if (neutralinoWritePath) {
      if (!Neutralino.filesystem?.writeFile) throw new Error("No writable filesystem path is available.");
      await Neutralino.filesystem.writeFile(neutralinoWritePath, content);
      return;
    }

    if (entry.handle?.createWritable) {
      const writable = await entry.handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    }

    throw new Error("No writable file handle is available.");
  }

  async function updateOpenGraphSnapshotsForChangedTagFiles(changedEntries) {
    if (!changedEntries.length) return false;
    let changedActiveGraph = false;

    for (const tab of tabs) {
      if (tab?.type !== "graph" || !tab.graphSnapshot?.files || isKeepSavedGraphMode(tab)) continue;

      let graphChanged = false;
      tab.graphSnapshot.files.forEach((snapshotFile) => {
        const changedEntry = changedEntries.find((entry) => sidebarNodeMatchesSnapshotFile(entry, snapshotFile));
        if (!changedEntry) return;
        snapshotFile.content = changedEntry.content || "";
        snapshotFile.tags = getFileTagsFromContent(snapshotFile.content);
        graphChanged = true;
      });

      if (!graphChanged) continue;
      const currentSnapshot = tab.graphSnapshot;
      tab.graphSnapshot = await createGraphSnapshot(currentSnapshot.files || [], currentSnapshot.folderName || tab.folderName || tab.title);
      if (currentSnapshot.createdAt) tab.graphSnapshot.createdAt = currentSnapshot.createdAt;
      graphRenderCache.delete(tab.id);
      markGraphTabAsChanged(tab);
      changedActiveGraph = changedActiveGraph || tab.id === activeTabId;
    }

    return changedActiveGraph;
  }

  async function purgeDeletedTagFromOpenGraphSnapshots(tagName) {
    const normalizedTag = normalizeTagName(tagName);
    if (!normalizedTag) return false;
    let changedActiveGraph = false;

    for (const tab of tabs) {
      if (tab?.type !== "graph" || !tab.graphSnapshot?.files || isKeepSavedGraphMode(tab)) continue;

      let graphChanged = false;
      tab.graphSnapshot.files.forEach((snapshotFile) => {
        const currentContent = snapshotFile.content || "";
        const nextContent = removeTagFromContent(currentContent, normalizedTag);
        const currentTags = normalizeFileTagList(snapshotFile.tags || getFileTagsFromContent(currentContent));
        const nextTags = currentTags.filter((tag) => tag !== normalizedTag);
        if (nextContent === currentContent && nextTags.length === currentTags.length) return;
        snapshotFile.content = nextContent;
        snapshotFile.tags = nextTags;
        graphChanged = true;
      });

      if (!graphChanged) continue;
      const currentSnapshot = tab.graphSnapshot;
      tab.graphSnapshot = await createGraphSnapshot(currentSnapshot.files || [], currentSnapshot.folderName || tab.folderName || tab.title);
      if (currentSnapshot.createdAt) tab.graphSnapshot.createdAt = currentSnapshot.createdAt;
      graphRenderCache.delete(tab.id);
      markGraphTabAsChanged(tab);
      changedActiveGraph = changedActiveGraph || tab.id === activeTabId;
    }

    return changedActiveGraph;
  }

  async function deleteTag(tagName) {
    const normalizedTag = normalizeTagName(tagName);
    if (!normalizedTag) {
      alert("Enter a tag name to delete.");
      return false;
    }

    const confirmed = window.confirm(`Delete tag "#${normalizedTag}"? This removes it from every file that has the tag and saves those files.`);
    if (!confirmed) return false;

    const folderTargets = [];
    const targetKeys = new Set();
    for (const fileEntry of (folderMarkdownFiles || [])) {
      try {
        const currentContent = await readFolderMarkdownFileContent(fileEntry);
        const currentTags = getFileTagsFromContent(currentContent);
        fileEntry.content = currentContent || "";
        fileEntry.tags = currentTags;
        updateFolderTreeNodeTagsForEntry(fileEntry, currentTags);
        if (!currentTags.includes(normalizedTag)) continue;
        folderTargets.push(fileEntry);
        const targetKey = getTagDeletionEntryKey(fileEntry);
        if (targetKey) targetKeys.add(targetKey);
      } catch (error) {
        console.warn("Failed to read folder file tags before deleting tag:", fileEntry.path || fileEntry.fullPath || fileEntry.name, error);
      }
    }

    const targets = [
      ...folderTargets,
      ...getActiveGraphSnapshotFileDeletionTargets(normalizedTag, targetKeys)
    ];

    const changedEntries = [];
    const failedEntries = [];
    for (const entry of targets) {
      try {
        const currentContent = typeof entry.content === "string" ? entry.content : await readFolderMarkdownFileContent(entry);
        const nextContent = removeTagFromContent(currentContent, normalizedTag);
        if (nextContent === currentContent) continue;

        await writeTagDeletionTargetContent(entry, nextContent);
        entry.content = nextContent;
        entry.tags = getFileTagsFromContent(nextContent);
        updateFolderTreeNodeTagsForEntry(entry, entry.tags);
        updateOpenMarkdownTabsForSidebarNode(entry, nextContent);
        changedEntries.push(entry);
      } catch (error) {
        failedEntries.push(entry);
        console.error("Failed to delete tag from file:", entry.path || entry.fullPath || entry.name, error);
      }
    }

    let activeGraphChanged = await updateOpenGraphSnapshotsForChangedTagFiles(changedEntries);

    if (selectedFolderTreeTags.has(normalizedTag)) {
      selectedFolderTreeTags = new Set(selectedFolderTreeTags);
      selectedFolderTreeTags.delete(normalizedTag);
    }

    await refreshFolderTagCounts();
    if (!failedEntries.length) {
      saveKnownTags(getKnownTags().filter((tag) => tag !== normalizedTag));
      saveCreatedTags(getCreatedTags().filter((tag) => tag !== normalizedTag));
      activeGraphChanged = await purgeDeletedTagFromOpenGraphSnapshots(normalizedTag) || activeGraphChanged;
    }
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
    renderFilteredFolderTree();
    renderTagManagementList();
    updateTagManagementMenuButtons();
    renderLinkAutocomplete();
    updateGraphTagToolbar(getActiveGraphTab(), getActiveGraphTab()?.graphSnapshot || null);

    if (activeGraphChanged || (getActiveGraphTab() && activeTabId === getActiveGraphTab().id)) {
      renderGraphView();
    }

    if (failedEntries.length) {
      alert(`Unable to delete #${normalizedTag} from ${failedEntries.length} file${failedEntries.length === 1 ? "" : "s"}. Files opened without write permission cannot be saved.`);
      return false;
    }

    return true;
  }



      Object.assign(api, {
        getKnownTags,
        saveKnownTags,
        addTagsToCountMap,
        removeTagsFromCountMap,
        areTagListsEqual,
        getComparableFolderEntryPath,
        getFolderMarkdownEntryForTab,
        updateFolderTreeNodeTagsForEntry,
        syncMarkdownTabTagsToFolderState,
        getActiveGraphSnapshotTagCounts,
        getReferencedTagCounts,
        getAllKnownAndReferencedTags,
        getAvailableTags,
        getReferencedTags,
        getGraphFileEntryNodeId,
        findFolderMarkdownEntryForGraphFile,
        readFolderMarkdownFileContent,
        refreshFolderTagCounts,
        clearFolderTagCounts,
        renderTagManagementList,
        createTag,
        snapshotFileMatchesTab,
        updateOpenMarkdownTabsForSnapshotFile,
        getOpenGraphSnapshotTagsForMarkdownTab,
        updateFolderMarkdownEntryForSnapshotFile,
        syncOpenGraphSnapshotsForMarkdownTabTagChange,
        getTagDeletionEntryKey,
        getActiveGraphSnapshotFileDeletionTargets,
        getNeutralinoTagDeletionWritePath,
        writeTagDeletionTargetContent,
        updateOpenGraphSnapshotsForChangedTagFiles,
        deleteTag
      });
    }

    return api;
  };
})(window);
