(function(window) {
  window.registerMarkdownViewerRecentActions = function registerMarkdownViewerRecentActions(app, deps) {
    with (deps) {
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
        await promptActiveSavedGraphForCurrentFolder?.();
      } catch (error) {
        console.error("Failed to open recent folder:", error);
        alert("Unable to open the recent folder.");
      }
      return;
    }

    alert("This recent folder was opened with a browser picker that did not provide a reusable folder handle. Please choose it again with Open folder ...");
  }

  return {
    openRecentFile,
    openRecentFolder
  };
    }
  };
})(window);
