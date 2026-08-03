(function(window) {
  window.registerMarkdownViewerGraphDocuments = function registerMarkdownViewerGraphDocuments(app, deps) {
    with (deps) {
  const GRAPH_SAVE_CHUNK_SIZE = 256 * 1024;

  function hasReachedOpenTabLimit(actionText) {
    const maxOpenTabs = typeof getMaxOpenTabs === "function" ? getMaxOpenTabs() : 40;
    if (tabs.length < maxOpenTabs) return false;
    alert(`Maximum of ${maxOpenTabs} tabs reached. Please close an existing tab to ${actionText}.`);
    return true;
  }

  async function openGraphView() {
    const perf = typeof createGraphPerfSession === "function"
      ? createGraphPerfSession("open graph view command", {
        folderName: activeFolderName || "Graph View",
        folderFiles: folderMarkdownFiles.length
      })
      : null;
    if (!folderMarkdownFiles.length) {
      perf?.end({ cancelled: true, reason: "no-folder-files" });
      alert("Open a folder first to build the graph view.");
      return;
    }

    const folderName = activeFolderName || "Graph View";
    const graphScopeKey = getRootFolderGraphScopeKey();
    perf?.mark("scope resolved", { graphScopeKey });
    if (focusExistingFolderGraphTab(graphScopeKey, folderName)) {
      perf?.end({ reusedExistingTab: true });
      return;
    }

    if (hasReachedOpenTabLimit('open a new one')) {
      perf?.end({ cancelled: true, reason: "tab-limit" });
      return;
    }

    const graphTab = await createGraphTab(folderName, {
      graphScopeKey,
      openedSource: typeof createOpenedSource === "function"
        ? createOpenedSource(activeFolderPath || "", activeFolderName || folderName, "folder-graph")
        : null
    });
    perf?.mark("graph tab created", { tabId: graphTab?.id || "" });
    if (!graphTab) {
      perf?.end({ cancelled: true, reason: "create-tab-failed" });
      return;
    }
    tabs.push(graphTab);
    perf?.mark("graph tab pushed", { tabCount: tabs.length });
    switchTab(graphTab.id);
    perf?.mark("switch tab requested", { tabId: graphTab.id });
    saveTabsToStorage(tabs);
    perf?.end({ tabId: graphTab.id });
  }

  function getGraphExportContent(graphSnapshot, folderName, graphViewConfig) {
    const graphTab = createGraphTab(folderName || graphSnapshot?.folderName || "Graph View", {
      graphSnapshot,
      graphViewConfig: graphViewConfig || null,
      skipGraphRenderWarning: true
    });
    const graphDocument = serializeGraphExportDocument(graphTab);
    return JSON.stringify(graphDocument, null, 2);
  }

  async function updateFolderTreeViewAfterGraphSave(metadata) {
    if (!metadata) return false;
    if (typeof NL_VERSION !== "undefined") {
      if (metadata.path && isPathInsideFolder(metadata.path, activeFolderPath)) {
        return app.modules?.sidebarContextTree?.updateSavedGraphFileInFolderTree?.(metadata) === true;
      }
      return false;
    }

    if (metadata.handle && activeFolderHandle) {
      return app.modules?.sidebarContextTree?.updateSavedGraphFileInFolderTree?.(metadata) === true;
    }

    return false;
  }

  function getSaveDialogSelectedPath(selection) {
    if (!selection) return "";
    if (typeof selection === "string") return selection;
    if (Array.isArray(selection)) return getSaveDialogSelectedPath(selection[0]);
    if (typeof selection === "object") {
      return selection.path || selection.filePath || selection.file || selection.name || "";
    }
    return "";
  }

  function getGraphSavePath(selectedPath) {
    const path = String(selectedPath || "").trim();
    if (!path) return "";
    return /\.(mdviewer-graph\.json|mdgraph\.json|json)$/i.test(path) ? path : `${path}.mdviewer-graph.json`;
  }

  function getContentByteLength(content) {
    if (typeof Blob === "function") {
      return new Blob([content]).size;
    }
    return String(content || "").length;
  }

  async function logGraphSave(level, message, details) {
    const line = `[graph-save] ${message}${details ? " " + JSON.stringify(details) : ""}`;
    if (typeof appDebugLog === "function") {
      await appDebugLog(level, `[graph-save] ${message}`, details);
    }
    const consoleMethod = level === "error" ? "error" : (level === "warning" ? "warn" : "info");
    if (console && typeof console[consoleMethod] === "function") {
      console[consoleMethod](`[graph-save] ${message}`, details || "");
    }
  }

  async function writeNeutralinoGraphFile(path, content, context = {}) {
    const byteLength = getContentByteLength(content);
    await logGraphSave("info", "write started", {
      path,
      byteLength,
      mode: Neutralino.filesystem.appendFile && byteLength > GRAPH_SAVE_CHUNK_SIZE ? "chunked" : "single",
      ...context
    });

    if (Neutralino.filesystem.appendFile && byteLength > GRAPH_SAVE_CHUNK_SIZE) {
      await Neutralino.filesystem.writeFile(path, "");
      let chunkCount = 0;
      for (let offset = 0; offset < content.length; offset += GRAPH_SAVE_CHUNK_SIZE) {
        await Neutralino.filesystem.appendFile(path, content.slice(offset, offset + GRAPH_SAVE_CHUNK_SIZE));
        chunkCount += 1;
      }
      await logGraphSave("debug", "chunked write completed", { path, chunkCount, byteLength });
    } else {
      await Neutralino.filesystem.writeFile(path, content);
    }

    let stats = null;
    if (Neutralino.filesystem.getStats) {
      stats = await Neutralino.filesystem.getStats(path);
    }
    await logGraphSave("info", "write completed", { path, byteLength, stats });
    return stats;
  }

  function getGraphSaveDiagnostics(graphTab) {
    const snapshot = graphTab?.graphSnapshot || graphTab?.graphDocument?.snapshot || null;
    const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
    const links = Array.isArray(snapshot?.links) ? snapshot.links : [];
    const files = Array.isArray(snapshot?.files) ? snapshot.files : [];
    return {
      tabId: graphTab?.id || "",
      title: graphTab?.title || graphTab?.folderName || "",
      graphViewKind: graphTab?.graphViewKind || "graph",
      hasGraphDocument: !!graphTab?.graphDocument,
      nodes: nodes.length,
      links: links.length,
      files: files.length,
      missingDependencyNodes: nodes.filter((node) => node?.type === "missing-dependency").length,
      missingDependencyLinks: links.filter((link) => link?.type === "missing-dependency").length
    };
  }

  async function getActiveGraphSaveContentForSave(graphTab, context = {}) {
    const diagnostics = getGraphSaveDiagnostics(graphTab);
    await logGraphSave("info", "serialize started", { ...diagnostics, ...context });
    try {
      const cachedRender = graphRenderCache.get(graphTab.id);
      await logGraphSave("debug", "capture layout started", {
        tabId: graphTab.id,
        hasCachedNodes: !!cachedRender?.nodes,
        cachedNodeCount: Array.isArray(cachedRender?.nodes) ? cachedRender.nodes.length : null
      });
      if (cachedRender?.nodes) {
        captureGraphLayout(graphTab, cachedRender.nodes, cachedRender.getZoomTransform?.());
      }

      await logGraphSave("debug", "sync graph document started", { tabId: graphTab.id });
      syncGraphTabDocument(graphTab);

      await logGraphSave("debug", "serialize graph document started", getGraphSaveDiagnostics(graphTab));
      const graphDocument = serializeGraphViewDocument(graphTab);

      await logGraphSave("debug", "stringify graph document started", {
        tabId: graphTab.id,
        documentType: graphDocument?.documentType || "",
        nodes: Array.isArray(graphDocument?.snapshot?.nodes) ? graphDocument.snapshot.nodes.length : null,
        links: Array.isArray(graphDocument?.snapshot?.links) ? graphDocument.snapshot.links.length : null,
        files: Array.isArray(graphDocument?.snapshot?.files) ? graphDocument.snapshot.files.length : null
      });
      const content = JSON.stringify(graphDocument, null, 2);
      await logGraphSave("info", "serialize completed", {
        ...getGraphSaveDiagnostics(graphTab),
        byteLength: getContentByteLength(content),
        charLength: content.length,
        ...context
      });
      return content;
    } catch (error) {
      await logGraphSave("error", "serialize failed", {
        ...diagnostics,
        error: error?.stack || error?.message || String(error),
        ...context
      });
      throw error;
    }
  }

  async function writeGraphExportWithSaveDialog(content, suggestedName, options = {}) {
    const includeMarkdownContents = options.includeMarkdownContents === true;
    const dialogTitle = includeMarkdownContents ? "Export Folder to Graph" : "Save Graph View";
    const fileTypeDescription = includeMarkdownContents
      ? "Create a portable graph archive that includes Markdown file contents."
      : "Save layout, groups, filters, hidden points, tags, and connections. File contents are not included.";

    if (typeof NL_VERSION !== "undefined") {
      const defaultPath = activeFolderPath ? joinPath(activeFolderPath, suggestedName) : suggestedName;
      await logGraphSave("info", "save dialog opened", { defaultPath, suggestedName, includeMarkdownContents });
      const selectedPath = await Neutralino.os.showSaveDialog(dialogTitle, {
        defaultPath,
        filters: [
          { name: fileTypeDescription, extensions: ["json"] }
        ]
      });
      const finalPath = getGraphSavePath(getSaveDialogSelectedPath(selectedPath));
      if (!finalPath) return null;
      await logGraphSave("info", "save dialog selected path", { selectedPath, finalPath });
      await writeNeutralinoGraphFile(finalPath, content, { includeMarkdownContents });
      const metadata = { name: getFileName(finalPath), path: finalPath };
      await updateFolderTreeViewAfterGraphSave(metadata);
      return metadata;
    }

    if (typeof window.showSaveFilePicker === "function" && !isFirefoxBrowser()) {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: fileTypeDescription,
            accept: { "application/json": [".json"] }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      const metadata = { name: handle.name, handle };
      await updateFolderTreeViewAfterGraphSave(metadata);
      return metadata;
    }

    saveAs(new Blob([content], { type: "application/json;charset=utf-8" }), suggestedName);
    return { name: suggestedName };
  }

  async function exportFolderFilesToGraph(folderFiles, folderName) {
    if (!folderFiles.length) {
      alert("This folder does not contain Markdown files to export to a graph archive.");
      return false;
    }

    const graphSnapshot = await createGraphSnapshot(folderFiles, folderName || "Graph View");
    const content = getGraphExportContent(graphSnapshot, folderName || graphSnapshot.folderName || "Graph View", null);
    const suggestedName = getSuggestedGraphFileName({ folderName: folderName || graphSnapshot.folderName || "Graph View" });
    return !!(await writeGraphExportWithSaveDialog(content, suggestedName, { includeMarkdownContents: true }));
  }

  async function exportActiveFolderToGraph() {
    if (!folderMarkdownFiles.length) {
      alert("Open a folder first to export it to a graph archive.");
      return false;
    }
    return exportFolderFilesToGraph(folderMarkdownFiles, activeFolderName || "Graph View");
  }

  function getActiveGraphSaveContent(graphTab) {
    const cachedRender = graphRenderCache.get(graphTab.id);
    if (cachedRender?.nodes) {
      captureGraphLayout(graphTab, cachedRender.nodes, cachedRender.getZoomTransform?.());
    }
    syncGraphTabDocument(graphTab);
    const graphDocument = serializeGraphViewDocument(graphTab);
    return JSON.stringify(graphDocument, null, 2);
  }

  function updateGraphTabAfterSave(tab, metadata) {
    if (!tab) return;
    if (metadata) {
      if (metadata.name) {
        tab.sourceFileName = metadata.name;
        tab.title = getGraphTitleFromFileName(metadata.name) || metadata.name;
      }
      if (metadata.handle) tab.sourceFileHandle = metadata.handle;
      if (metadata.path) tab.sourceFilePath = metadata.path;
      if (metadata.path || metadata.name) {
        if (typeof setTabOpenedSource === "function") setTabOpenedSource(tab, {
          path: metadata.path || null,
          name: metadata.name || null,
          kind: "graph-file"
        });
      }
    }
    syncGraphTabDocument(tab);
    clearGraphTabUnsavedChanges(tab);
    saveTabsToStorage(tabs);
    if (deps.tabSessionPersistence?.cleanupDraftForTab) {
      void deps.tabSessionPersistence.cleanupDraftForTab(tab);
    }
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
  }

  async function saveGraphTabToSource(graphTab) {
    if (!graphTab || (!graphTab.sourceFileHandle && !graphTab.sourceFilePath)) return false;

    try {
      const content = await getActiveGraphSaveContentForSave(graphTab, { target: "source" });
      if (graphTab.sourceFileHandle && typeof graphTab.sourceFileHandle.createWritable === "function") {
        await logGraphSave("info", "browser handle write started", {
          name: graphTab.sourceFileHandle.name || graphTab.sourceFileName,
          byteLength: getContentByteLength(content)
        });
        const writable = await graphTab.sourceFileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        await logGraphSave("info", "browser handle write completed", {
          name: graphTab.sourceFileHandle.name || graphTab.sourceFileName
        });
        const metadata = { name: graphTab.sourceFileHandle.name || graphTab.sourceFileName, handle: graphTab.sourceFileHandle };
        updateGraphTabAfterSave(graphTab, metadata);
        await updateFolderTreeViewAfterGraphSave(metadata);
      } else if (typeof NL_VERSION !== "undefined" && graphTab.sourceFilePath) {
        await writeNeutralinoGraphFile(graphTab.sourceFilePath, content, { source: "existing-graph-file" });
        const metadata = {
          name: getFileName(graphTab.sourceFilePath),
          path: graphTab.sourceFilePath
        };
        updateGraphTabAfterSave(graphTab, metadata);
        await updateFolderTreeViewAfterGraphSave(metadata);
      } else {
        return false;
      }
      return true;
    } catch (error) {
      console.error("Failed to save graph to original location:", error);
      await logGraphSave("error", "save to source failed", {
        ...getGraphSaveDiagnostics(graphTab),
        error: error?.stack || error?.message || String(error)
      });
      return false;
    }
  }

  async function saveActiveGraphToSource() {
    return saveGraphTabToSource(getActiveGraphTab());
  }

  async function saveGraphTabWithSaveDialog(graphTab) {
    if (!graphTab) {
      return false;
    }

    try {
      await logGraphSave("info", "save as started", getGraphSaveDiagnostics(graphTab));
      const content = await getActiveGraphSaveContentForSave(graphTab, { target: "save-dialog" });
      const suggestedName = getSuggestedGraphFileName(graphTab);
      const metadata = await writeGraphExportWithSaveDialog(content, suggestedName);
      if (!metadata) return false;
      await logGraphSave("info", "tab update after save started", { ...getGraphSaveDiagnostics(graphTab), metadata });
      updateGraphTabAfterSave(graphTab, metadata);
      await logGraphSave("info", "save as completed", { ...getGraphSaveDiagnostics(graphTab), metadata });
      return true;
    } catch (error) {
      if (error && error.name === "AbortError") return false;
      console.error("Failed to export graph:", error);
      await logGraphSave("error", "save as failed", {
        ...getGraphSaveDiagnostics(graphTab),
        error: error?.stack || error?.message || String(error)
      });
      alert("Failed to save graph file: " + (error?.message || error || "Unknown error"));
      return false;
    }
  }

  async function saveActiveGraphWithSaveDialog() {
    return saveGraphTabWithSaveDialog(getActiveGraphTab());
  }

  async function openSavedGraphDocument(source) {
    if (!source) return null;
    if (hasReachedOpenTabLimit('open a saved graph')) {
      return null;
    }
    let content = source.content;
    let name = source.name || "Saved Graph";

    if (content === undefined) {
      if (typeof NL_VERSION !== "undefined" && source.path) {
        content = await Neutralino.filesystem.readFile(source.path);
        name = getFileName(source.path) || name;
      } else {
        let file = source.file || null;
        if (!file && source.handle) file = await source.handle.getFile();
        if (!file) throw new Error("No readable graph file was provided.");
        content = await file.text();
        name = file.name || name;
      }
    }

    let graphDocument;
    try {
      graphDocument = JSON.parse(content);
    } catch (error) {
      throw new Error("The selected graph file is not valid JSON.");
    }

    validateParsedGraphDocument(graphDocument);

    const normalizedSnapshot = normalizeGraphSnapshot(graphDocument.snapshot || graphDocument.graphSnapshot || null);
    const graphDocumentKind = getGraphDocumentKind(graphDocument, normalizedSnapshot);
    const graphDocumentForTab = graphDocumentKind.documentType === GRAPH_DOCUMENT_TYPE_EXPORT
      ? graphDocument
      : {
        ...graphDocument,
        documentType: GRAPH_DOCUMENT_TYPE_VIEW,
        snapshot: stripGraphSnapshotContent(normalizedSnapshot),
        graphSnapshot: undefined
      };
    const graphData = deserializeGraphDocument(graphDocumentForTab);
    const fallbackName = getGraphTitleFromFileName(name) || "Saved Graph";
    const graphTab = await createGraphTab(graphData.folderName || fallbackName, {
      graphDocument: graphData.graphDocument,
      openedSource: typeof createOpenedSource === "function"
        ? createOpenedSource(source.path || "", name, "graph-file")
        : null
    });
    if (!graphTab) return;
    graphTab.keepSavedGraphMode = graphDocumentKind.documentType === GRAPH_DOCUMENT_TYPE_VIEW;
    graphTab.sourceFileName = name;
    graphTab.title = fallbackName;
    if (source.handle) graphTab.sourceFileHandle = source.handle;
    if (source.path) graphTab.sourceFilePath = source.path;
    if (typeof setTabOpenedSource === "function") setTabOpenedSource(graphTab, {
      path: source.path || null,
      name,
      kind: "graph-file"
    });
    clearGraphTabUnsavedChanges(graphTab);
    tabs.push(graphTab);
    saveTabsToStorage(tabs);
    switchTab(graphTab.id);
    const stalePromptOptions = {
      force: graphDocumentKind.documentType === GRAPH_DOCUMENT_TYPE_VIEW || graphDocumentKind.isLegacy,
      legacyExport: graphDocumentKind.isLegacy && graphDocumentKind.documentType === GRAPH_DOCUMENT_TYPE_EXPORT,
      includeExports: graphDocumentKind.documentType === GRAPH_DOCUMENT_TYPE_EXPORT
    };
    if (shouldCompareSavedGraphWithCurrentFolder?.(graphTab, stalePromptOptions)) {
      await refreshFolderFilesForGraphComparison?.();
      await promptForStaleSavedGraphIfNeeded(graphTab, stalePromptOptions);
    }
    return graphTab;
  }

  return {
    openGraphView,
    getGraphExportContent,
    writeGraphExportWithSaveDialog,
    exportFolderFilesToGraph,
    exportActiveFolderToGraph,
    getActiveGraphSaveContent,
    updateGraphTabAfterSave,
    saveGraphTabToSource,
    saveActiveGraphToSource,
    saveGraphTabWithSaveDialog,
    saveActiveGraphWithSaveDialog,
    openSavedGraphDocument
  };
    }
  };
})(window);
