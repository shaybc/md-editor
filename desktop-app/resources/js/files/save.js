(function(window) {
  window.registerMarkdownViewerFileSave = function registerMarkdownViewerFileSave(app, deps) {
    with (deps) {
  function updateTabAfterSave(tab, content, metadata) {
    const normalizedContent = normalizeEditorContent(content);
    tab.content = normalizedContent;
    tab.savedContent = normalizedContent;
    tab.isNewUnsavedFile = false;
    if (metadata?.clearViewTransform) {
      tab.largeFileView = null;
      tab.transformedForViewing = false;
    }
    if (metadata) {
      if (metadata.name) {
        tab.sourceFileName = metadata.name;
        tab.title = getMarkdownTitleFromFileName(metadata.name);
      }
      if (Object.prototype.hasOwnProperty.call(metadata, "handle")) tab.sourceFileHandle = metadata.handle || null;
      else if (metadata.path) tab.sourceFileHandle = null;
      if (Object.prototype.hasOwnProperty.call(metadata, "path")) tab.sourceFilePath = metadata.path || null;
      else if (metadata.handle) tab.sourceFilePath = null;
      if (metadata.openedSource) tab.openedSource = metadata.openedSource;
    }
    syncMarkdownTabTagsToFolderState(tab, normalizedContent);
    saveTabsToStorage(tabs);
    if (deps.tabSessionPersistence?.cleanupDraftForTab) {
      void deps.tabSessionPersistence.cleanupDraftForTab(tab);
    }
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
    deps.onTabSourceMetadataChanged?.(tab);
  }

  function getActiveTabForSaveAs() {
    return (tabs || []).find(function(tab) { return tab.id === activeTabId; }) || null;
  }

  function isSaveAsSupportedFileTab(tab) {
    return !!tab && tab.type !== "graph";
  }

  function getTabSourcePath(tab) {
    return tab?.sourceFilePath || tab?.largeFileSource?.path || tab?.openedSource?.path || "";
  }

  function getTabSourceName(tab) {
    return tab?.sourceFileName
      || tab?.largeFileSource?.name
      || tab?.openedSource?.name
      || (getTabSourcePath(tab) ? getFileName(getTabSourcePath(tab)) : "")
      || tab?.title
      || "document.md";
  }

  function createOpenedSourceForSavedPath(path, kind) {
    return {
      path,
      name: getFileName(path),
      kind: kind || "file"
    };
  }

  function normalizeSaveAsPath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
  }

  function getSaveAsDialogDetails(tab) {
    const suggestedName = getTabSourceName(tab);
    return {
      suggestedName
    };
  }

  async function copyNeutralinoFile(sourcePath, destinationPath) {
    if (Neutralino.filesystem?.copy) {
      try {
        await Neutralino.filesystem.copy(sourcePath, destinationPath);
        return;
      } catch (error) {
        console.warn("Neutralino filesystem.copy failed; falling back to read/write:", sourcePath, destinationPath, error);
      }
    }
    if (Neutralino.filesystem?.readBinaryFile && Neutralino.filesystem?.writeBinaryFile) {
      const data = await Neutralino.filesystem.readBinaryFile(sourcePath);
      await Neutralino.filesystem.writeBinaryFile(destinationPath, data);
      return;
    }
    await Neutralino.filesystem.writeFile(destinationPath, await Neutralino.filesystem.readFile(sourcePath));
  }

  async function readTabSourceContent(tab) {
    const sourcePath = getTabSourcePath(tab);
    if (typeof NL_VERSION !== "undefined" && sourcePath) {
      return Neutralino.filesystem.readFile(sourcePath);
    }
    if (tab?.sourceFileHandle?.getFile) {
      return (await tab.sourceFileHandle.getFile()).text();
    }
    if (tab?.largeFileSource?.handle?.getFile) {
      return (await tab.largeFileSource.handle.getFile()).text();
    }
    if (tab?.largeFileSource?.file?.text) return tab.largeFileSource.file.text();
    if (tab?.largeFileSource && typeof tab.largeFileSource.content === "string") return tab.largeFileSource.content;
    if (typeof tab?.content === "string") return getMarkdownTabContentForSave(tab);
    return "";
  }

  function updateLargeFileTabAfterSaveAs(tab, metadata) {
    const name = metadata.name || getFileName(metadata.path);
    tab.title = name;
    tab.sourceFileName = name;
    tab.sourceFilePath = metadata.path || null;
    tab.sourceFileHandle = metadata.handle || null;
    tab.openedSource = metadata.openedSource || null;
    if (tab.largeFileSource) {
      tab.largeFileSource = {
        ...tab.largeFileSource,
        name,
        path: metadata.path || null,
        handle: metadata.handle || null,
        content: undefined
      };
    }
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
  }

  async function attachSavedAsDestination(tab, destinationPath, content) {
    const metadata = {
      name: getFileName(destinationPath),
      path: destinationPath,
      openedSource: createOpenedSourceForSavedPath(destinationPath, tab.type === "large-file" ? "large-file" : "file")
    };
    if (tab.type === "large-file") {
      updateLargeFileTabAfterSaveAs(tab, metadata);
    } else {
      updateTabAfterSave(tab, content, metadata);
    }
    if (typeof rememberRecentFile === "function") {
      rememberRecentFile({
        name: metadata.name,
        label: metadata.name,
        path: destinationPath
      });
    }
    await updateFolderTreeAfterDocumentSave(metadata);
  }

  async function writeBrowserSaveAs(tab, content) {
    const fileDetails = getSaveAsFileDetails(tab, tab?.transformedForViewing === true);
    if (typeof window.showSaveFilePicker === "function" && !isFirefoxBrowser()) {
      const handle = await window.showSaveFilePicker({
        suggestedName: getTabSourceName(tab),
        types: [
          {
            description: fileDetails.description,
            accept: {
              [fileDetails.mimeType]: fileDetails.extensions,
              "text/plain": fileDetails.extensions
            }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      const metadata = {
        name: handle.name,
        handle,
        openedSource: { path: null, name: handle.name, kind: tab.type === "large-file" ? "large-file" : "file" }
      };
      if (tab.type === "large-file") updateLargeFileTabAfterSaveAs(tab, metadata);
      else updateTabAfterSave(tab, content, metadata);
      return true;
    }
    saveAs(new Blob([content], { type: `${fileDetails.mimeType};charset=utf-8` }), getTabSourceName(tab));
    return true;
  }

  function getMarkdownTabContentForSave(tab) {
    if (!tab) return '';
    const activeContent = activeEditorCommands?.getActiveEditorValue ? activeEditorCommands.getActiveEditorValue() : markdownEditor.value;
    return normalizeEditorContent(tab.id === activeTabId ? activeContent : tab.content);
  }

  function getSaveAsFileDetails(tab, isFormattedView) {
    if (isFormattedView) {
      return {
        suggestedName: tab.largeFileView?.suggestedSaveName || `${getFileName(tab.sourceFilePath || tab.sourceFileName || tab.title || "document").replace(/\.json$/i, "")}.formatted.json`,
        description: "JSON files",
        mimeType: "application/json",
        extensions: [".json"]
      };
    }

    const suggestedName = typeof getSuggestedDocumentFileName === "function"
      ? getSuggestedDocumentFileName(tab)
      : getSuggestedMarkdownFileName(tab);
    const extensionMatch = suggestedName.match(/\.([a-z0-9+_-]+)$/i);
    const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : ".md";
    const isMarkdownDocument = /\.(md|markdown)$/i.test(suggestedName);
    return {
      suggestedName,
      description: isMarkdownDocument ? "Markdown files" : "Text files",
      mimeType: isMarkdownDocument ? "text/markdown" : "text/plain",
      extensions: isMarkdownDocument ? [".md", ".markdown"] : [extension]
    };
  }

  function ensurePathHasSaveExtension(path, extensions) {
    if (!path) return path;
    const extensionList = Array.isArray(extensions) && extensions.length ? extensions : [".md"];
    if (extensionList.some((extension) => path.toLowerCase().endsWith(String(extension).toLowerCase()))) return path;
    return path + extensionList[0];
  }

  function escapeHtmlForExport(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getGeneratedHtmlSaveDetails(tab) {
    const options = tab?.generatedHtmlSave || {};
    const baseName = String(options.suggestedName || tab?.title || "document").trim() || "document";
    return {
      title: String(options.title || tab?.title || "Markdown Export"),
      suggestedName: /\.html?$/i.test(baseName) ? baseName : `${baseName}.html`,
      description: "HTML files",
      mimeType: "text/html",
      extensions: [".html", ".htm"]
    };
  }

  function buildBasicHtmlExport(markdown, title) {
    const parseMarkdown = typeof marked !== "undefined" && marked?.parse
      ? marked.parse.bind(marked)
      : null;
    const rawHtml = parseMarkdown ? parseMarkdown(markdown) : `<pre>${escapeHtmlForExport(markdown)}</pre>`;
    const sanitizedHtml = typeof DOMPurify !== "undefined" && DOMPurify?.sanitize
      ? DOMPurify.sanitize(rawHtml, {
        ADD_TAGS: ["mjx-container"],
        ADD_ATTR: ["id", "class", "style", "title", "data-line-counter-key"]
      })
      : rawHtml;
    const tempContainer = typeof document !== "undefined" ? document.createElement("div") : null;
    let bodyHtml = sanitizedHtml;
    if (tempContainer) {
      tempContainer.innerHTML = sanitizedHtml;
      deps.enhanceGitHubAlerts?.(tempContainer);
      bodyHtml = tempContainer.innerHTML;
    }
    const isDarkTheme = typeof document !== "undefined"
      && document.documentElement?.getAttribute("data-theme") === "dark";
    const cssTheme = isDarkTheme
      ? "https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.3.0/github-markdown-dark.min.css"
      : "https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.3.0/github-markdown.min.css";
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtmlForExport(title)}</title>
  <link rel="stylesheet" href="${cssTheme}">
  <style>
    body { margin: 0; background: ${isDarkTheme ? "#0d1117" : "#ffffff"}; color: ${isDarkTheme ? "#c9d1d9" : "#24292e"}; }
    .markdown-body { box-sizing: border-box; min-width: 200px; max-width: 1180px; margin: 0 auto; padding: 45px; }
    .markdown-body table { width: 100%; }
  </style>
</head>
<body>
  <article class="markdown-body">
${bodyHtml}
  </article>
</body>
</html>`;
  }

  function buildGeneratedHtmlSaveContent(tab) {
    const details = getGeneratedHtmlSaveDetails(tab);
    const markdown = getMarkdownTabContentForSave(tab);
    if (typeof deps.buildMarkdownExportHtml === "function") {
      return deps.buildMarkdownExportHtml(markdown, details.title);
    }
    return buildBasicHtmlExport(markdown, details.title);
  }

  async function updateFolderTreeAfterDocumentSave(metadata) {
    if (!metadata) return false;
    if (typeof NL_VERSION !== "undefined") {
      if (metadata.path && isPathInsideFolder(metadata.path, activeFolderPath)) {
        return app.modules?.sidebarContextTree?.updateSavedDocumentFileInFolderTree?.(metadata) === true;
      }
      return false;
    }
    if (metadata.handle && activeFolderHandle) {
      return app.modules?.sidebarContextTree?.updateSavedDocumentFileInFolderTree?.(metadata) === true;
    }
    return false;
  }

  async function saveMarkdownTabToSource(tab) {
    if (!tab || tab.type === "graph" || (!tab.sourceFileHandle && !tab.sourceFilePath)) return false;
    if (tab.transformedForViewing === true) return false;

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
        suppressFolderWatcher?.(1000);
        await Neutralino.filesystem.writeFile(tab.sourceFilePath, content);
        updateTabAfterSave(tab, content, {
          name: getFileName(tab.sourceFilePath),
          path: tab.sourceFilePath
        });
        suppressFolderWatcher?.(500);
      } else {
        return false;
      }
      deps.refreshWorkspaceGitStatus?.();
      return true;
    } catch (error) {
      console.error("Failed to save file to original location:", error);
      return false;
    }
  }

  async function saveMarkdownTabWithSaveDialog(tab) {
    if (!tab || tab.type === "graph") return false;

    const content = getMarkdownTabContentForSave(tab);
    const isFormattedView = tab.transformedForViewing === true;
    const fileDetails = getSaveAsFileDetails(tab, isFormattedView);
    const suggestedName = fileDetails.suggestedName;

    if (typeof NL_VERSION !== "undefined") {
      const defaultPath = activeFolderPath ? joinPath(activeFolderPath, suggestedName) : suggestedName;
      const selectedPath = await Neutralino.os.showSaveDialog(isFormattedView ? "Save formatted JSON copy" : "Save file", {
        defaultPath,
        filters: [
          { name: fileDetails.description, extensions: fileDetails.extensions.map((extension) => extension.replace(/^\./, "")) }
        ]
      });
      if (!selectedPath) return false;
      const finalPath = ensurePathHasSaveExtension(selectedPath, fileDetails.extensions);
      await Neutralino.filesystem.writeFile(finalPath, content);
      const metadata = {
        name: getFileName(finalPath),
        path: finalPath,
        clearViewTransform: isFormattedView
      };
      updateTabAfterSave(tab, content, metadata);
      await updateFolderTreeAfterDocumentSave(metadata);
      return true;
    }

    if (typeof window.showSaveFilePicker === "function" && !isFirefoxBrowser()) {
      const pickerOptions = {
        suggestedName,
        types: [
          {
            description: fileDetails.description,
            accept: {
              [fileDetails.mimeType]: fileDetails.extensions,
              "text/plain": fileDetails.extensions
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
      const metadata = {
        name: handle.name,
        handle,
        clearViewTransform: isFormattedView
      };
      updateTabAfterSave(tab, content, metadata);
      await updateFolderTreeAfterDocumentSave(metadata);
      return true;
    }

    const blob = new Blob([content], {
      type: `${fileDetails.mimeType};charset=utf-8`,
    });
    saveAs(blob, suggestedName);
    updateTabAfterSave(tab, content, {
      name: suggestedName,
      clearViewTransform: isFormattedView
    });
    return true;
  }

  async function saveGeneratedHtmlTabWithSaveDialog(tab) {
    if (!tab || tab.type === "graph") return false;

    const fileDetails = getGeneratedHtmlSaveDetails(tab);
    const content = buildGeneratedHtmlSaveContent(tab);

    if (typeof NL_VERSION !== "undefined") {
      const defaultPath = activeFolderPath ? joinPath(activeFolderPath, fileDetails.suggestedName) : fileDetails.suggestedName;
      const selectedPath = await Neutralino.os.showSaveDialog("Save HTML report", {
        defaultPath,
        filters: [
          { name: fileDetails.description, extensions: fileDetails.extensions.map((extension) => extension.replace(/^\./, "")) }
        ]
      });
      if (!selectedPath) return false;
      const finalPath = ensurePathHasSaveExtension(selectedPath, fileDetails.extensions);
      await Neutralino.filesystem.writeFile(finalPath, content);
      if (typeof rememberRecentFile === "function") {
        rememberRecentFile({
          name: getFileName(finalPath),
          label: getFileName(finalPath),
          path: finalPath
        });
      }
      await updateFolderTreeAfterDocumentSave({ name: getFileName(finalPath), path: finalPath });
      return true;
    }

    if (typeof window.showSaveFilePicker === "function" && !isFirefoxBrowser()) {
      const pickerOptions = {
        suggestedName: fileDetails.suggestedName,
        types: [
          {
            description: fileDetails.description,
            accept: {
              [fileDetails.mimeType]: fileDetails.extensions,
              "text/html": fileDetails.extensions
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
      await updateFolderTreeAfterDocumentSave({ name: handle.name, handle });
      return true;
    }

    saveAs(new Blob([content], { type: `${fileDetails.mimeType};charset=utf-8` }), fileDetails.suggestedName);
    return true;
  }

  async function saveActiveTabWithSaveDialog() {
    const tab = getActiveMarkdownTab();
    return saveMarkdownTabWithSaveDialog(tab);
  }

  async function saveActiveFileTabAs() {
    const tab = getActiveTabForSaveAs();
    if (!tab) return false;
    if (tab.type === "image-editor") return await deps.imageEditor?.saveTabAs?.(tab) === true;
    if (tab.type === "diagram-editor") return await deps.diagramEditor?.saveTabAs?.(tab) === true;
    if (!isSaveAsSupportedFileTab(tab)) {
      alert?.("Save As is available for file tabs only.");
      return false;
    }

    const isDesktop = typeof NL_VERSION !== "undefined";
    const sourcePath = getTabSourcePath(tab);
    const hasUnsavedChanges = tab.type !== "large-file" && typeof tabHasUnsavedChanges === "function"
      ? tabHasUnsavedChanges(tab, getMarkdownTabContentForSave(tab))
      : false;
    const shouldCopySource = !!sourcePath && (tab.type === "large-file" || !hasUnsavedChanges);
    const content = shouldCopySource ? null : await readTabSourceContent(tab);

    if (!isDesktop) {
      return writeBrowserSaveAs(tab, content ?? await readTabSourceContent(tab));
    }

    const dialogDetails = getSaveAsDialogDetails(tab);
    const defaultPath = activeFolderPath ? joinPath(activeFolderPath, dialogDetails.suggestedName) : dialogDetails.suggestedName;
    const selectedPath = await Neutralino.os.showSaveDialog("Save As", {
      defaultPath
    });
    if (!selectedPath) return false;

    suppressFolderWatcher?.(1000);
    const isSameSourcePath = normalizeSaveAsPath(sourcePath) === normalizeSaveAsPath(selectedPath);
    if (shouldCopySource) {
      if (sourcePath && !isSameSourcePath) {
        await copyNeutralinoFile(sourcePath, selectedPath);
      }
      const attachedContent = tab.type === "large-file" ? "" : getMarkdownTabContentForSave(tab);
      await attachSavedAsDestination(tab, selectedPath, attachedContent);
      return true;
    }

    await Neutralino.filesystem.writeFile(selectedPath, content);
    await attachSavedAsDestination(tab, selectedPath, content);
    return true;
  }

  async function saveActiveTabToSource() {
    const tab = tabs.find(function(t) { return t.id === activeTabId; });
    if (tab?.type === "image-editor") return await deps.imageEditor?.saveTab?.(tab) === true;
    return saveMarkdownTabToSource(tab);
  }

  return {
    updateTabAfterSave,
    getMarkdownTabContentForSave,
    saveMarkdownTabToSource,
    saveMarkdownTabWithSaveDialog,
    saveGeneratedHtmlTabWithSaveDialog,
    saveActiveTabWithSaveDialog,
    saveActiveFileTabAs,
    saveActiveTabToSource
  };
    }
  };
})(window);
