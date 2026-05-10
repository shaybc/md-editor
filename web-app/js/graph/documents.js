(function(window) {
  window.registerMarkdownViewerGraphDocuments = function registerMarkdownViewerGraphDocuments(app, deps) {
    with (deps) {
  async function openGraphView() {
    if (!folderMarkdownFiles.length) {
      alert("Open a folder first to build the graph view.");
      return;
    }

    const folderName = activeFolderName || "Graph View";
    const graphScopeKey = getRootFolderGraphScopeKey();
    if (focusExistingFolderGraphTab(graphScopeKey, folderName)) return;

    if (tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
      return;
    }

    const graphTab = createGraphTab(folderName, { graphViewConfig: null, graphScopeKey });
    tabs.push(graphTab);
    switchTab(graphTab.id);
    saveTabsToStorage(tabs);
  }

  function getGraphExportContent(graphSnapshot, folderName, graphViewConfig) {
    const graphTab = createGraphTab(folderName || graphSnapshot?.folderName || "Graph View", {
      graphSnapshot,
      graphViewConfig: graphViewConfig || null
    });
    const graphDocument = serializeGraphExportDocument(graphTab);
    return JSON.stringify(graphDocument, null, 2);
  }

  async function writeGraphExportWithSaveDialog(content, suggestedName, options = {}) {
    const includeMarkdownContents = options.includeMarkdownContents === true;
    const dialogTitle = includeMarkdownContents ? "Export Folder to Graph" : "Save Graph View";
    const fileTypeDescription = includeMarkdownContents
      ? "Create a portable graph archive that includes Markdown file contents."
      : "Save layout, groups, filters, hidden points, tags, and connections. File contents are not included.";

    if (typeof NL_VERSION !== "undefined") {
      const defaultPath = activeFolderPath ? joinPath(activeFolderPath, suggestedName) : suggestedName;
      const selectedPath = await Neutralino.os.showSaveDialog(dialogTitle, {
        defaultPath,
        filters: [
          { name: fileTypeDescription, extensions: ["mdviewer-graph.json", "mdgraph.json", "json"] }
        ]
      });
      if (!selectedPath) return null;
      const finalPath = /\.(mdviewer-graph\.json|mdgraph\.json|json)$/i.test(selectedPath) ? selectedPath : `${selectedPath}.mdviewer-graph.json`;
      await Neutralino.filesystem.writeFile(finalPath, content);
      return { name: getFileName(finalPath), path: finalPath };
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
      return { name: handle.name, handle };
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
    }
    syncGraphTabDocument(tab);
    clearGraphTabUnsavedChanges(tab);
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
  }

  async function saveGraphTabToSource(graphTab) {
    if (!graphTab || (!graphTab.sourceFileHandle && !graphTab.sourceFilePath)) return false;

    try {
      const content = getActiveGraphSaveContent(graphTab);
      if (graphTab.sourceFileHandle && typeof graphTab.sourceFileHandle.createWritable === "function") {
        const writable = await graphTab.sourceFileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        updateGraphTabAfterSave(graphTab, { name: graphTab.sourceFileHandle.name || graphTab.sourceFileName });
      } else if (typeof NL_VERSION !== "undefined" && graphTab.sourceFilePath) {
        await Neutralino.filesystem.writeFile(graphTab.sourceFilePath, content);
        updateGraphTabAfterSave(graphTab, {
          name: getFileName(graphTab.sourceFilePath),
          path: graphTab.sourceFilePath
        });
      } else {
        return false;
      }
      return true;
    } catch (error) {
      console.error("Failed to save graph to original location:", error);
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

    const content = getActiveGraphSaveContent(graphTab);
    const suggestedName = getSuggestedGraphFileName(graphTab);

    try {
      const metadata = await writeGraphExportWithSaveDialog(content, suggestedName);
      if (!metadata) return false;
      updateGraphTabAfterSave(graphTab, metadata);
      return true;
    } catch (error) {
      if (error && error.name === "AbortError") return false;
      console.error("Failed to export graph:", error);
      alert("Failed to export graph: " + error.message);
      return false;
    }
  }

  async function saveActiveGraphWithSaveDialog() {
    return saveGraphTabWithSaveDialog(getActiveGraphTab());
  }

  async function openSavedGraphDocument(source) {
    if (!source) return null;
    if (tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a saved graph.');
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
    const graphTab = createGraphTab(graphData.folderName || fallbackName, { graphDocument: graphData.graphDocument });
    graphTab.keepSavedGraphMode = graphDocumentKind.documentType === GRAPH_DOCUMENT_TYPE_VIEW;
    graphTab.sourceFileName = name;
    graphTab.title = fallbackName;
    if (source.handle) graphTab.sourceFileHandle = source.handle;
    if (source.path) graphTab.sourceFilePath = source.path;
    clearGraphTabUnsavedChanges(graphTab);
    tabs.push(graphTab);
    saveTabsToStorage(tabs);
    switchTab(graphTab.id);
    if (folderMarkdownFiles.length) {
      await refreshFolderFilesForGraphComparison?.();
    }
    await promptForStaleSavedGraphIfNeeded(graphTab, {
      force: graphDocumentKind.documentType === GRAPH_DOCUMENT_TYPE_VIEW || graphDocumentKind.isLegacy,
      legacyExport: graphDocumentKind.isLegacy && graphDocumentKind.documentType === GRAPH_DOCUMENT_TYPE_EXPORT,
      includeExports: graphDocumentKind.documentType === GRAPH_DOCUMENT_TYPE_EXPORT
    });
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
