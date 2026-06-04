(function(window) {
  window.registerMarkdownViewerFileOpen = function registerMarkdownViewerFileOpen(app, deps) {
    with (deps) {
  function isPerfLoggingEnabled() {
    return window.MD_VIEWER_PERF === true || window.localStorage?.getItem("MD_VIEWER_PERF") === "1";
  }

  function logFolderPerf(label, startTime, details = {}) {
    if (!isPerfLoggingEnabled() || typeof performance === "undefined") return;
    const duration = Math.round((performance.now() - startTime) * 10) / 10;
    console.info(`[Perf] ${label}: ${duration}ms`, details);
  }

  async function openFolderTreeFromNeutralinoPath(selectedPath) {
    if (!selectedPath) return;
    const folderOpenStart = typeof performance !== "undefined" ? performance.now() : 0;
    activeFolderName = selectedPath.split(/[\\/]/).pop() || "Graph View";
    activeFolderHandle = null;
    activeFolderPath = selectedPath;
    renderFolderLoadingState?.(`Loading ${activeFolderName}...`);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      const scanStart = typeof performance !== "undefined" ? performance.now() : 0;
      const nodes = await listMarkdownTreeNeutralino(selectedPath);
      logFolderPerf("folder scan", scanStart, { folder: activeFolderName, rootCount: nodes.length });
      const collectStart = typeof performance !== "undefined" ? performance.now() : 0;
      folderMarkdownFiles = await collectMarkdownFilesFromTreeNeutralino(nodes);
      logFolderPerf("folder markdown index", collectStart, { files: folderMarkdownFiles.length });
      const renderStart = typeof performance !== "undefined" ? performance.now() : 0;
      renderFolderTree(nodes);
      logFolderPerf("folder tree render", renderStart);
      rememberRecentFolder({ name: activeFolderName, label: activeFolderName, path: selectedPath });
      await promptActiveSavedGraphForCurrentFolder?.();
      logFolderPerf("open folder total", folderOpenStart, { folder: activeFolderName, files: folderMarkdownFiles.length });
    } catch (error) {
      renderFolderLoadingError?.("Unable to load this folder.");
      throw error;
    }
  }

  async function openMarkdownSourceFile(sourceFile) {
    if (!sourceFile) return null;

    let content = sourceFile.content;
    let file = sourceFile.file || null;
    const handle = sourceFile.handle || null;
    const path = sourceFile.path || null;
    let name = sourceFile.name || (path ? getFileName(path) : null);

    if (content === undefined) {
      if (typeof NL_VERSION !== "undefined" && path) {
        content = await Neutralino.filesystem.readFile(path);
      } else {
        if (!file && handle) {
          file = await handle.getFile();
        }
        if (!file) {
          throw new Error("No readable Markdown file was provided.");
        }
        content = await file.text();
        name = name || file.name;
      }
    }

    name = name || (file && file.name) || "document.md";
    const tab = openSidebarFileInPermanentTab(content, getMarkdownTitleFromFileName(name), {
      name,
      handle,
      path
    });
    rememberRecentFile({
      name,
      label: name,
      path,
      handle
    });
    return tab;
  }

  async function readOpenFileSourceContent(sourceFile) {
    if (sourceFile.content !== undefined) return sourceFile.content;
    if (typeof NL_VERSION !== "undefined" && sourceFile.path) {
      return Neutralino.filesystem.readFile(sourceFile.path);
    }
    let file = sourceFile.file || null;
    if (!file && sourceFile.handle) file = await sourceFile.handle.getFile();
    if (!file) throw new Error("No readable file was provided.");
    return file.text();
  }

  async function openDocumentSourceFile(sourceFile) {
    if (!sourceFile) return null;
    const path = sourceFile.path || null;
    const name = sourceFile.name || (path ? getFileName(path) : sourceFile.file?.name || sourceFile.handle?.name || "document.md");
    const filePath = path || name;

    if (isGraphFilePath(filePath)) {
      return openSavedGraphDocument({ ...sourceFile, name });
    }

    if (isMarkdownPath(filePath)) {
      return openMarkdownSourceFile({ ...sourceFile, name });
    }

    const content = await readOpenFileSourceContent(sourceFile);
    if (isJsonPath(filePath)) {
      try {
        const parsed = JSON.parse(content);
        if (looksLikeGraphDocument(parsed)) {
          return openSavedGraphDocument({ ...sourceFile, name, content });
        }
      } catch (_) {
        // Invalid JSON is still text and can be edited in the basic text editor.
      }
    }

    return openMarkdownSourceFile({ ...sourceFile, name, content });
  }

  async function openDocumentFileFromPicker() {
    if (typeof NL_VERSION !== "undefined") {
      try {
        const selected = await Neutralino.os.showOpenDialog("Open file", {
          filters: [
            { name: "Text-based files", extensions: ["md", "markdown", "mdviewer-graph.json", "mdgraph.json", "json", "txt", "java", "cs", "css", "js", "ts", "html", "xml", "csv", "yml", "yaml", "toml", "ini", "log"] }
          ]
        });
        const selectedPath = Array.isArray(selected) ? selected[0] : selected;
        if (!selectedPath) return;
        await openDocumentSourceFile({
          name: getFileName(selectedPath),
          path: selectedPath
        });
      } catch (error) {
        if (error && error.name === "AbortError") return;
        console.error("Neutralino file picker error:", error);
        alert("Unable to open selected file: " + error.message);
      }
      return;
    }

    if (typeof window.showOpenFilePicker === "function") {
      let handle = null;
      try {
        const handles = await window.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: "Text-based files",
              accept: {
                "text/markdown": [".md", ".markdown"],
                "text/plain": [".txt", ".text", ".java", ".cs", ".css", ".js", ".ts", ".html", ".xml", ".csv", ".yml", ".yaml", ".toml", ".ini", ".log"],
                "application/json": [".json"]
              }
            }
          ]
        });
        handle = handles && handles[0];
      } catch (error) {
        if (error && error.name === "AbortError") return;
        console.warn("File picker unavailable, using fallback input.", error);
        fileInput.click();
        return;
      }

      if (!handle) return;
      try {
        await openDocumentSourceFile({
          name: handle.name,
          handle
        });
      } catch (error) {
        console.error("Failed to open selected file:", error);
        alert("Unable to open selected file: " + error.message);
      }
      return;
    }

    fileInput.click();
  }

  async function importDocumentFile(file) {
    try {
      await openDocumentSourceFile({
        name: file.name,
        file
      });
    } catch (error) {
      console.error("Failed to open file:", error);
      alert("Unable to open selected file: " + error.message);
    }
  }

  return {
    openFolderTreeFromNeutralinoPath,
    openMarkdownSourceFile,
    readOpenFileSourceContent,
    openDocumentSourceFile,
    openDocumentFileFromPicker,
    importDocumentFile
  };
    }
  };
})(window);
