(function(window) {
  window.registerMarkdownViewerFileSave = function registerMarkdownViewerFileSave(app, deps) {
    with (deps) {
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
    syncMarkdownTabTagsToFolderState(tab, normalizedContent);
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

  return {
    updateTabAfterSave,
    getMarkdownTabContentForSave,
    saveMarkdownTabToSource,
    saveMarkdownTabWithSaveDialog,
    saveActiveTabWithSaveDialog,
    saveActiveTabToSource
  };
    }
  };
})(window);
