(function(window) {
  window.registerMarkdownViewerDroppedItems = function registerMarkdownViewerDroppedItems(app, deps) {
    with (deps) {
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
      } else if (entry.isFile) {
        try {
          const file = await getFileFromEntry(entry);
          const modifiedAt = Number(file?.lastModified || 0) || 0;
          const isGraphDocumentFile = await fileContainsGraphDocument(file);
          entries.push({ kind: "file", name: entry.name, file, path: entry.fullPath || entry.name, modifiedAt, createdAt: modifiedAt, isGraphDocumentFile });
        } catch (error) {
          console.warn("Failed to read dropped document file:", entry.name, error);
        }
      }
    }

    return sortFolderTreeNodes(entries);
  }

  async function getDocumentFileHandleFromDrop(dataTransfer, fileSystemHandles) {
    const handles = fileSystemHandles || await getFileSystemHandlesFromDrop(dataTransfer);
    return handles.find((handle) => handle && handle.kind === "file") || null;
  }

  async function getDocumentFileFromEntryDrop(dataTransfer) {
    const items = Array.from((dataTransfer && dataTransfer.items) || []);
    for (const item of items) {
      if (typeof item.webkitGetAsEntry !== "function") continue;
      const entry = item.webkitGetAsEntry();
      if (!entry || !entry.isFile) continue;
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
      const droppedPath = files.find((file) => file && file.path && (isTextDocumentPath(file.path || file.name) || isTextFileLike(file)));
      if (droppedPath) {
        await openDocumentSourceFile({
          name: getFileName(droppedPath.path || droppedPath.name),
          path: droppedPath.path
        });
        return true;
      }
      const previewPath = files.find((file) => file && file.path);
      if (previewPath) {
        await openDocumentSourceFile({
          name: getFileName(previewPath.path || previewPath.name),
          path: previewPath.path,
          size: Number(previewPath.size || 0)
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

    const file = files.find((candidate) => candidate);
    if (file) {
      await openDocumentSourceFile({
        name: file.name,
        file
      });
      return true;
    }

    return false;
  }

  function waitForFolderLoadingFrame() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(resolve);
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  async function showDroppedFolderLoadingState() {
    if (typeof renderFolderLoadingState === "function") {
      renderFolderLoadingState(`Loading ${activeFolderName}...`);
      await waitForFolderLoadingFrame();
    }
  }

  function showDroppedFolderLoadingError() {
    if (typeof renderFolderLoadingError === "function") {
      renderFolderLoadingError("Unable to load this folder.");
    }
  }

  async function openDroppedFolder(dataTransfer, fileSystemHandles) {
    if (typeof NL_VERSION !== "undefined") {
      const files = Array.from((dataTransfer && dataTransfer.files) || []);
      for (const file of files) {
        const path = file?.path || "";
        if (!path || isTextDocumentPath(path || file.name)) continue;
        try {
          const stats = await Neutralino?.filesystem?.getStats?.(path);
          const type = String(stats?.type || stats?.entryType || "").toUpperCase();
          if (stats?.isDirectory === true || type === "DIRECTORY") {
            await openFolderTreeFromNeutralinoPath(path);
            return true;
          }
        } catch (_error) {
          // Non-directory drops continue through the file open path.
        }
      }
    }

    const dirHandle = await getDirectoryHandleFromDrop(dataTransfer, fileSystemHandles);
    if (dirHandle) {
      activeFolderName = dirHandle.name || "Graph View";
      activeFolderHandle = dirHandle;
      activeFolderPath = null;
      await showDroppedFolderLoadingState();
      try {
        const nodes = await listMarkdownTree(dirHandle);
        folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
        renderFolderTree(nodes);
        rememberRecentFolder({ name: activeFolderName, label: activeFolderName, handle: dirHandle });
        await promptActiveSavedGraphForCurrentFolder?.();
      } catch (error) {
        showDroppedFolderLoadingError();
        throw error;
      }
      return true;
    }

    const directoryEntry = getDirectoryEntryFromDrop(dataTransfer);
    if (directoryEntry) {
      activeFolderName = directoryEntry.name || "Graph View";
      activeFolderHandle = null;
      activeFolderPath = null;
      await showDroppedFolderLoadingState();
      try {
        const nodes = await listMarkdownTreeFromEntry(directoryEntry);
        folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
        renderFolderTree(nodes);
        rememberRecentFolder({ name: activeFolderName, label: activeFolderName });
        await promptActiveSavedGraphForCurrentFolder?.();
      } catch (error) {
        showDroppedFolderLoadingError();
        throw error;
      }
      return true;
    }

    return false;
  }

  async function handleDrop(e) {
    const dt = e.dataTransfer;

    try {
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
      alert("Unable to open the dropped file or folder.");
    }
  }

  return {
    getFileSystemHandlesFromDrop,
    getDirectoryHandleFromDrop,
    getDirectoryEntryFromDrop,
    readDirectoryEntries,
    getFileFromEntry,
    listMarkdownTreeFromEntry,
    getDocumentFileHandleFromDrop,
    getDocumentFileFromEntryDrop,
    openDroppedDocumentFile,
    openDroppedFolder,
    handleDrop
  };
    }
  };
})(window);
