(function(window) {
  window.registerMarkdownViewerFileOpen = function registerMarkdownViewerFileOpen(app, deps) {
    with (deps) {
  function isPerfLoggingEnabled() {
    return window.MD_VIEWER_PERF === true || window.localStorage?.getItem("MD_VIEWER_PERF") === "1";
  }

  function getPerfDurationMs(startTime) {
    if (!startTime || typeof performance === "undefined") return 0;
    return Math.round((performance.now() - startTime) * 10) / 10;
  }

  function logFolderPerf(label, startTime, details = {}) {
    if (!isPerfLoggingEnabled() || typeof performance === "undefined") return;
    const duration = getPerfDurationMs(startTime);
    console.info(`[Perf] ${label}: ${duration}ms`, details);
  }

  function logFolderOpenInfo(message, details = {}) {
    console.info(`[FolderOpen] ${message}`, details);
    if (typeof appDebugLog === "function") {
      void appDebugLog("info", `[folder-open] ${message}`, details);
    }
  }

  function logFolderOpenStage(message, startTime, details = {}) {
    logFolderOpenInfo(message, {
      ...details,
      durationMs: getPerfDurationMs(startTime)
    });
  }

  function getOpenLogErrorDetails(error) {
    return {
      name: error?.name || "Error",
      message: error?.message || String(error || "Unknown error")
    };
  }

  function logLargeFileOpen(level, message, details) {
    if (typeof appDebugLog === "function") {
      void appDebugLog(level, `[large-file-open] ${message}`, details);
    }
  }

  function isKubernetesTopologyOpenPath(filePath) {
    return typeof isKubernetesTopologyFilePath === "function" && isKubernetesTopologyFilePath(filePath);
  }

  function looksLikeKubernetesTopologyOpenDocument(document) {
    return typeof looksLikeKubernetesTopologyDocument === "function" && looksLikeKubernetesTopologyDocument(document);
  }

  function openExistingKubernetesTopologyTab(sourceFile, name, path, openOptions) {
    const existingTopologyTab = typeof findTabForSourceFile === "function"
      ? findTabForSourceFile({ ...sourceFile, name, path }, "kubernetes-topology")
      : null;
    if (!existingTopologyTab) return null;
    switchTab(existingTopologyTab.id);
    if (openOptions?.pinExisting && typeof pinTemporaryTab === "function") pinTemporaryTab(existingTopologyTab.id);
    rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
    return existingTopologyTab;
  }

  async function readNeutralinoFileWithForegroundWait(path) {
    const releaseWait = deps.foregroundWaitIndicator?.begin?.();
    try {
      return await Neutralino.filesystem.readFile(path);
    } finally {
      releaseWait?.();
    }
  }

  function getParentFolderPath(path) {
    const normalized = String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
    const slashIndex = normalized.lastIndexOf("/");
    return slashIndex > 0 ? normalized.slice(0, slashIndex) : "";
  }

  function addParentNavigationNode(nodes, selectedPath) {
    const parentPath = getParentFolderPath(selectedPath);
    if (!parentPath) return nodes;
    return [{
      kind: "directory",
      name: "..",
      path: "..",
      fullPath: parentPath,
      createdAt: 0,
      modifiedAt: 0,
      size: 0,
      children: [],
      isParentNavigation: true
    }, ...(nodes || [])];
  }

  function startFolderMarkdownIndexRefresh(nodes, selectedPath) {
    const runIndexRefresh = () => {
      const collectStart = typeof performance !== "undefined" ? performance.now() : 0;
      Promise.resolve()
        .then(() => collectMarkdownFilesFromTreeNeutralino(nodes, "", { resolveLazyDirectories: true }))
        .then((files) => {
          if (activeFolderPath !== selectedPath) return;
          folderMarkdownFiles = files;
          logFolderOpenStage("markdown index", collectStart, { files: folderMarkdownFiles.length });
          logFolderPerf("folder markdown index", collectStart, { files: folderMarkdownFiles.length });
        })
        .catch((error) => {
          if (activeFolderPath !== selectedPath) return;
          console.warn("Failed to build folder markdown index:", selectedPath, error);
          if (typeof appDebugLog === "function") {
            void appDebugLog("warning", "[folder-open] markdown index failed", {
              path: selectedPath,
              error: getOpenLogErrorDetails(error)
            });
          }
        });
    };

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        if (typeof setTimeout === "function") {
          setTimeout(runIndexRefresh, 0);
        } else {
          runIndexRefresh();
        }
      });
      return;
    }

    if (typeof setTimeout === "function") {
      setTimeout(runIndexRefresh, 0);
      return;
    }

    Promise.resolve().then(runIndexRefresh);
  }

  async function openFolderTreeFromNeutralinoPath(selectedPath, options = {}) {
    if (!selectedPath) return;
    const folderOpenStart = typeof performance !== "undefined" ? performance.now() : 0;
    activeFolderName = selectedPath.split(/[\\/]/).pop() || "Graph View";
    activeFolderHandle = null;
    activeFolderPath = selectedPath;
    folderMarkdownFiles = [];
    renderFolderLoadingState?.(`Loading ${activeFolderName}...`);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      const scanStart = typeof performance !== "undefined" ? performance.now() : 0;
      let nodes = await listMarkdownTreeNeutralino(selectedPath, {
        preferLazyRoot: options.preferLazyRoot === true
      });
      const scanDetails = typeof getNeutralinoFolderScanDetails === "function"
        ? getNeutralinoFolderScanDetails()
        : null;
      if (options.includeParentNavigation) {
        nodes = addParentNavigationNode(nodes, selectedPath);
      }
      const scanLogDetails = {
        folder: activeFolderName,
        path: selectedPath,
        rootCount: nodes.length,
        ...(scanDetails || {})
      };
      logFolderOpenInfo("scan method", scanLogDetails);
      logFolderPerf("folder scan", scanStart, scanLogDetails);
      const renderStart = typeof performance !== "undefined" ? performance.now() : 0;
      renderFolderTree(nodes);
      logFolderOpenStage("tree render", renderStart, { rootCount: nodes.length });
      logFolderPerf("folder tree render", renderStart);
      startFolderMarkdownIndexRefresh(nodes, selectedPath);
      const rememberStart = typeof performance !== "undefined" ? performance.now() : 0;
      rememberRecentFolder({ name: activeFolderName, label: activeFolderName, path: selectedPath });
      saveGlobalState({ lastOpenFolderPath: selectedPath });
      logFolderOpenStage("remember recent folder", rememberStart, { folder: activeFolderName });
      if (typeof refreshSourceRootMetadata === "function") {
        const sourceMetadataStart = typeof performance !== "undefined" ? performance.now() : 0;
        await refreshSourceRootMetadata({ force: true });
        logFolderOpenStage("source root metadata", sourceMetadataStart, { folder: activeFolderName });
      }
      if (typeof onDesktopFolderOpened === "function") {
        const desktopFolderStart = typeof performance !== "undefined" ? performance.now() : 0;
        await onDesktopFolderOpened(selectedPath);
        logFolderOpenStage("desktop folder opened hooks", desktopFolderStart, { folder: activeFolderName });
      }
      if (options.skipSavedGraphPrompt !== true) {
        const savedGraphPromptStart = typeof performance !== "undefined" ? performance.now() : 0;
        await promptActiveSavedGraphForCurrentFolder?.();
        logFolderOpenStage("saved graph prompt", savedGraphPromptStart, { folder: activeFolderName });
      }
      const totalLogDetails = {
        folder: activeFolderName,
        path: selectedPath,
        rootCount: nodes.length,
        markdownFiles: folderMarkdownFiles.length,
        totalDurationMs: getPerfDurationMs(folderOpenStart),
        scanMethod: scanDetails?.method || null,
        scanReason: scanDetails?.reason || null,
        scanDurationMs: scanDetails?.durationMs || null
      };
      logFolderOpenInfo("loaded", totalLogDetails);
      logFolderPerf("open folder total", folderOpenStart, totalLogDetails);
      deps.statistics?.recordProject?.(selectedPath);
    } catch (error) {
      renderFolderLoadingError?.("Unable to load this folder.");
      throw error;
    }
  }

  async function openMarkdownSourceFile(sourceFile, options = {}) {
    if (!sourceFile) return null;

    let content = sourceFile.content;
    let file = sourceFile.file || null;
    const handle = sourceFile.handle || null;
    const path = sourceFile.path || null;
    let name = sourceFile.name || (path ? getFileName(path) : null);

    if (content === undefined) {
      if (typeof NL_VERSION !== "undefined" && path) {
        logLargeFileOpen("debug", "reading markdown source through Neutralino", { name, path });
        content = await readNeutralinoFileWithForegroundWait(path);
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
    return openSidebarFileInTab(content, options.title || getMarkdownTitleFromFileName(name), {
      name,
      handle,
      path,
      largeFileView: sourceFile.largeFileView || null,
      isUnsupportedFile: sourceFile.isUnsupportedFile === true
    }, {
      temporary: options.temporary === true,
      pinExisting: options.pinExisting,
      viewMode: options.viewMode || null,
      skipExistingSourceTab: options.skipExistingSourceTab === true
    });
  }

  async function readOpenFileSourceContent(sourceFile) {
    if (sourceFile.content !== undefined) return sourceFile.content;
    const path = sourceFile.path || sourceFile.fullPath || null;
    if (typeof NL_VERSION !== "undefined" && path) {
      logLargeFileOpen("debug", "reading source content through Neutralino", {
        name: sourceFile.name || getFileName(path),
        path,
        size: Number(sourceFile.size || 0)
      });
      return readNeutralinoFileWithForegroundWait(path);
    }
    let file = sourceFile.file || null;
    if (!file && sourceFile.handle) file = await sourceFile.handle.getFile();
    if (!file) throw new Error("No readable file was provided.");
    return file.text();
  }

  async function openLargeFileSourceFile(sourceFile, options = {}) {
    if (!sourceFile || typeof openLargeFileInTab !== "function") return null;
    const name = getOpenDocumentSourceName(sourceFile);
    const classification = largeFileViewer?.classifyLargeDocumentOpen?.(sourceFile, name, sourceFile.content) || {};
    const source = largeFileViewer?.createLargeFileViewSource?.(
      { ...sourceFile, readOnly: classification.readOnly !== false },
      name,
      sourceFile.content,
      sourceFile.largeFileReason || classification.reason
    );
    if (!source) return null;
    logLargeFileOpen("info", "routing to virtual viewer", {
      name,
      path: source.path || sourceFile.path || sourceFile.fullPath || null,
      size: Number(source.size || sourceFile.size || 0),
      hasInlineContent: typeof source.content === "string",
      reason: source.reason || sourceFile.largeFileReason || "large-file"
    });
    return openLargeFileInTab(source, options.title || name, {
      temporary: options.temporary === true,
      pinExisting: options.pinExisting
    });
  }

  function getOpenDocumentSourceName(sourceFile) {
    const path = sourceFile?.path || sourceFile?.fullPath || null;
    return sourceFile?.name || (path ? getFileName(path) : sourceFile?.file?.name || sourceFile?.handle?.name || "document.md");
  }

  function isFilePreviewSource(sourceFile, name) {
    if (!sourceFile) return false;
    const path = sourceFile.path || sourceFile.fullPath || sourceFile.file?.name || sourceFile.handle?.name || name || "";
    if (sourceFile.file && isTextFileLike?.(sourceFile.file)) return false;
    return !!path && !isTextDocumentPath(path);
  }

  function createFilePreviewSource(sourceFile, name) {
    return {
      name,
      path: sourceFile.path || sourceFile.fullPath || null,
      fullPath: sourceFile.fullPath || null,
      handle: sourceFile.handle || null,
      file: sourceFile.file || null,
      size: Number(sourceFile.size || sourceFile.file?.size || 0)
    };
  }

  function rememberOpenDocumentSourceFile(sourceFile, name, options) {
    if (options.rememberRecent === false) return;
    rememberRecentFile({
      name,
      label: name,
      path: sourceFile?.path || sourceFile?.fullPath || null,
      handle: sourceFile?.handle || null
    });
  }

  function getOpenFileStatSize(stats) {
    const size = Number(stats?.size ?? stats?.fileSize ?? stats?.length ?? 0);
    return Number.isFinite(size) ? size : 0;
  }

  function normalizeOpenFilePath(value) {
    return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  }

  function getProjectRelativeSuffix(path) {
    const normalized = normalizeOpenFilePath(path);
    const srcIndex = normalized.toLowerCase().indexOf("/src/");
    return srcIndex >= 0 ? normalized.slice(srcIndex + 1) : "";
  }

  function getDirectoryEntryName(entry) {
    return entry?.name || entry?.entry || entry?.path || entry?.fullPath || "";
  }

  function getDirectoryEntryPath(parentPath, entry) {
    const explicitPath = entry?.path || entry?.fullPath || "";
    if (explicitPath && (/^[a-zA-Z]:\//.test(normalizeOpenFilePath(explicitPath)) || normalizeOpenFilePath(explicitPath).startsWith("/"))) {
      return normalizeOpenFilePath(explicitPath);
    }
    const name = getDirectoryEntryName(entry);
    return name ? `${normalizeOpenFilePath(parentPath)}/${name}` : "";
  }

  function isDirectoryEntry(entry) {
    return entry?.type === "DIRECTORY" || entry?.type === "directory" || entry?.isDirectory === true;
  }

  function getOpenFileBaseName(path) {
    const normalized = normalizeOpenFilePath(path);
    const slash = normalized.lastIndexOf("/");
    return slash >= 0 ? normalized.slice(slash + 1) : normalized;
  }

  async function openFilePathExists(path) {
    if (!path || !Neutralino?.filesystem?.getStats) return false;
    try {
      await Neutralino.filesystem.getStats(path);
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function readFallbackChildDirectories(parentPath, ignoredDirectories) {
    let entries = [];
    try {
      entries = await Neutralino.filesystem.readDirectory(parentPath) || [];
    } catch (_error) {
      return [];
    }
    return entries
      .filter((entry) => isDirectoryEntry(entry))
      .map((entry) => getDirectoryEntryPath(parentPath, entry))
      .filter((entryPath) => entryPath && !ignoredDirectories.has(getOpenFileBaseName(entryPath)));
  }

  async function findUniqueWorkspaceFileBySuffix(suffix) {
    const root = normalizeOpenFilePath(activeFolderPath);
    const targetSuffix = normalizeOpenFilePath(suffix);
    if (!root || !targetSuffix || typeof NL_VERSION === "undefined" || !Neutralino?.filesystem?.readDirectory || !Neutralino?.filesystem?.getStats) return "";
    const matches = [];
    const ignoredDirectories = new Set([".git", ".idea", ".mvn", "node_modules", "target", "build", ".gradle", "src", "docs", "resources"]);
    const queue = [{ path: root, depth: 0 }];
    const visited = new Set();
    while (queue.length && matches.length < 2) {
      const current = queue.shift();
      const directory = normalizeOpenFilePath(current.path);
      if (!directory || visited.has(directory)) continue;
      visited.add(directory);
      const candidatePath = `${directory}/${targetSuffix}`;
      if (await openFilePathExists(candidatePath)) matches.push(candidatePath);
      if (matches.length > 1 || current.depth >= 3) continue;
      const childDirectories = await readFallbackChildDirectories(directory, ignoredDirectories);
      childDirectories.forEach((childPath) => queue.push({ path: childPath, depth: current.depth + 1 }));
    }
    return matches.length === 1 ? matches[0] : "";
  }

  async function resolveOpenFallbackSourceFile(sourceFile, error) {
    const requestedPath = sourceFile?.path || sourceFile?.fullPath || "";
    const suffix = getProjectRelativeSuffix(requestedPath);
    if (!suffix) return null;
    const fallbackPath = await findUniqueWorkspaceFileBySuffix(suffix);
    if (!fallbackPath || normalizeOpenFilePath(fallbackPath).toLowerCase() === normalizeOpenFilePath(requestedPath).toLowerCase()) return null;
    logLargeFileOpen("warning", "recovered stale file path", {
      requestedPath,
      fallbackPath,
      error: getOpenLogErrorDetails(error)
    });
    return {
      ...sourceFile,
      name: sourceFile?.name || getFileName(fallbackPath),
      path: fallbackPath,
      fullPath: fallbackPath,
      sourceFilePath: fallbackPath
    };
  }

  async function withOpenFileStats(sourceFile, path) {
    if (!sourceFile || Number(sourceFile.size || 0) > 0 || typeof NL_VERSION === "undefined" || !path || !Neutralino.filesystem?.getStats) {
      logLargeFileOpen("debug", "skipping stat probe", {
        name: sourceFile?.name || (path ? getFileName(path) : null),
        path,
        existingSize: Number(sourceFile?.size || 0),
        hasNeutralino: typeof NL_VERSION !== "undefined",
        hasGetStats: !!Neutralino?.filesystem?.getStats
      });
      return sourceFile;
    }
    try {
      logLargeFileOpen("debug", "stat probe started", { name: sourceFile.name || getFileName(path), path });
      const stats = await Neutralino.filesystem.getStats(path);
      const size = getOpenFileStatSize(stats);
      logLargeFileOpen("debug", "stat probe completed", { name: sourceFile.name || getFileName(path), path, size, stats });
      return size > 0 ? { ...sourceFile, size } : sourceFile;
    } catch (error) {
      logLargeFileOpen("warning", "stat probe failed", {
        name: sourceFile.name || getFileName(path),
        path,
        error: getOpenLogErrorDetails(error)
      });
      console.warn("Unable to read file stats before opening:", path, error);
      return sourceFile;
    }
  }

  async function openDocumentSourceFile(sourceFile, options = {}) {
    if (!sourceFile) return null;
    const path = sourceFile.path || sourceFile.fullPath || null;
    const name = getOpenDocumentSourceName(sourceFile);
    const filePath = path || name;
    logLargeFileOpen("info", "open requested", {
      name,
      path,
      size: Number(sourceFile.size || sourceFile.file?.size || 0),
      hasContent: sourceFile.content !== undefined,
      hasFile: !!sourceFile.file,
      hasHandle: !!sourceFile.handle,
      temporary: options.temporary === true
    });
    const openOptions = {
      temporary: options.temporary === true,
      rememberRecent: options.rememberRecent !== false,
      pinExisting: Object.prototype.hasOwnProperty.call(options, "pinExisting")
        ? options.pinExisting !== false
        : options.temporary !== true,
      title: options.title || null,
      viewMode: options.viewMode || null,
      forceText: options.forceText === true,
      forceHex: options.forceHex === true,
      skipExistingSourceTab: options.skipExistingSourceTab === true
    };

    if (openOptions.forceHex && typeof openHexEditorInTab === "function") {
      const sourceFileWithStats = await withOpenFileStats(sourceFile, path);
      const tab = openHexEditorInTab({
        ...sourceFileWithStats,
        name,
        path,
        fullPath: sourceFileWithStats.fullPath || path
      }, openOptions.title || name, openOptions);
      if (tab) rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
      return tab;
    }

    if (!openOptions.forceText && /\.mdimage$/i.test(filePath) && typeof openImageEditorInTab === "function") {
      const tab = openImageEditorInTab({
        ...sourceFile,
        name,
        path,
        mimeType: "application/vnd.md-editor.image+zip"
      }, openOptions);
      if (tab) rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
      return tab;
    }

    if (!openOptions.forceText && isKubernetesTopologyOpenPath(filePath)) {
      const existingTopologyTab = openExistingKubernetesTopologyTab(sourceFile, name, path, openOptions);
      if (existingTopologyTab) return existingTopologyTab;
      logLargeFileOpen("debug", "opening as Kubernetes topology file", { name, path: filePath });
      const tab = await openSavedKubernetesTopologyDocument?.({ ...sourceFile, name, path }, openOptions);
      if (tab) rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
      return tab;
    }

    const existingGraphTab = isGraphFilePath(filePath) && typeof findGraphTabForSourceFile === "function"
      ? findGraphTabForSourceFile({ ...sourceFile, name })
      : null;
    if (existingGraphTab) {
      switchTab(existingGraphTab.id);
      rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
      return existingGraphTab;
    }

    if (isGraphFilePath(filePath)) {
      logLargeFileOpen("debug", "opening as graph file", { name, path: filePath });
      const tab = await openSavedGraphDocument({ ...sourceFile, name, path });
      if (tab) rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
      return tab;
    }

    if (!openOptions.forceText && isDiagramCandidatePath(filePath) && typeof openDiagramEditorInTab === "function") {
      let diagramContent;
      try {
        diagramContent = await readOpenFileSourceContent(sourceFile);
      } catch (error) {
        const fallbackSourceFile = await resolveOpenFallbackSourceFile(sourceFile, error);
        if (fallbackSourceFile) return openDocumentSourceFile(fallbackSourceFile, options);
        throw error;
      }
      const shouldOpenAsDiagram = isDiagramPath(filePath) || looksLikeDiagramXml(diagramContent);
      if (shouldOpenAsDiagram) {
        if (!looksLikeDiagramXml(diagramContent)) {
          throw new Error("This .drawio file does not contain a valid draw.io diagram.");
        }
        const tab = openDiagramEditorInTab({
          ...sourceFile,
          name,
          path,
          content: diagramContent,
          xml: diagramContent
        }, openOptions);
        if (tab) rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
        return tab;
      }
    }

    const sourceFileWithStats = await withOpenFileStats(sourceFile, path);

    if (!openOptions.forceText && isFilePreviewSource(sourceFileWithStats, name)) {
      logLargeFileOpen("debug", "opening binary-looking file as browser preview", {
        name,
        path: filePath,
        size: Number(sourceFileWithStats.size || sourceFileWithStats.file?.size || 0)
      });
      const tab = openFilePreviewInTab?.(createFilePreviewSource(sourceFileWithStats, name), name, openOptions);
      if (tab) rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
      return tab;
    }

    const statClassification = largeFileViewer?.classifyLargeDocumentOpen?.(sourceFileWithStats, name);
    if (statClassification?.useViewer) {
      logLargeFileOpen("debug", "large viewer selected before content read", {
        name,
        path,
        size: Number(sourceFileWithStats.size || 0),
        reason: statClassification.reason
      });
      const tab = await openLargeFileSourceFile({ ...sourceFileWithStats, largeFileReason: statClassification.reason }, openOptions);
      if (tab) rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
      return tab;
    }

    if (isMarkdownPath(filePath) || isMermaidPath(filePath)) {
      logLargeFileOpen("debug", "opening markdown or Mermaid source path", { name, path: filePath });
      let content;
      try {
        content = await readOpenFileSourceContent(sourceFileWithStats);
      } catch (error) {
        const fallbackSourceFile = await resolveOpenFallbackSourceFile(sourceFileWithStats, error);
        if (fallbackSourceFile) return openDocumentSourceFile(fallbackSourceFile, options);
        throw error;
      }
      if (largeFileViewer?.shouldUseLargeFileViewer?.(sourceFileWithStats, name, content)) {
        const tab = await openLargeFileSourceFile({ ...sourceFileWithStats, name, content, largeFileReason: "large-markdown" }, openOptions);
        if (tab) rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
        return tab;
      }
      const tab = await openMarkdownSourceFile({ ...sourceFileWithStats, name, content }, openOptions);
      if (tab) rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
      return tab;
    }

    let content;
    try {
      content = await readOpenFileSourceContent(sourceFileWithStats);
    } catch (error) {
      const fallbackSourceFile = await resolveOpenFallbackSourceFile(sourceFileWithStats, error);
      if (fallbackSourceFile) return openDocumentSourceFile(fallbackSourceFile, options);
      throw error;
    }
    if (isJsonPath(filePath)) {
      try {
        logLargeFileOpen("debug", "parsing json for graph detection", {
          name,
          path: filePath,
          contentLength: content.length
        });
        const parsed = JSON.parse(content);
        if (isKubernetesTopologyOpenPath(filePath) || looksLikeKubernetesTopologyOpenDocument(parsed)) {
          const existingTopologyTab = openExistingKubernetesTopologyTab(sourceFile, name, path, openOptions);
          if (existingTopologyTab) return existingTopologyTab;
          const openedTopologyTab = await openSavedKubernetesTopologyDocument?.({ ...sourceFile, name, content }, openOptions);
          if (openedTopologyTab) rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
          return openedTopologyTab;
        }
        if (looksLikeGraphDocument(parsed)) {
          const graphTab = typeof findGraphTabForSourceFile === "function"
            ? findGraphTabForSourceFile({ ...sourceFile, name })
            : null;
          if (graphTab) {
            switchTab(graphTab.id);
            rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
            return graphTab;
          }
          const openedGraphTab = await openSavedGraphDocument({ ...sourceFile, name, content });
          if (openedGraphTab) rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
          return openedGraphTab;
        }
      } catch (_) {
        logLargeFileOpen("warning", "json parse failed during open", {
          name,
          path: filePath
        });
      }
    }

    if (!openOptions.forceText && openApiDetector?.isOpenApiCandidatePath?.(filePath)) {
      const detection = openApiDetector.detectOpenApiDocument(content, filePath, {
        yamlLibrary: deps.yamlLibrary
      });
      if (detection.openapi && openOpenApiEditorInTab) {
        const tab = openOpenApiEditorInTab({ ...sourceFileWithStats, name, content }, openOptions);
        if (tab) rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
        return tab;
      }
    }

    const contentClassification = largeFileViewer?.classifyLargeDocumentOpen?.(sourceFileWithStats, name, content);
    if (contentClassification?.useViewer) {
      logLargeFileOpen("debug", "large viewer selected after content read", {
        name,
        path,
        size: Number(sourceFileWithStats.size || 0),
        contentLength: content.length,
        reason: contentClassification.reason
      });
      const tab = await openLargeFileSourceFile({ ...sourceFileWithStats, name, content, largeFileReason: contentClassification.reason }, openOptions);
      if (tab) rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
      return tab;
    }

    if (isJsonPath(filePath)) {
      try {
        const parsed = JSON.parse(content);
        const safeJsonSourceFile = largeJsonOpen?.prepareLargeJsonForOpen?.(sourceFile, name, content, parsed);
        if (safeJsonSourceFile) {
          const tab = await openMarkdownSourceFile(safeJsonSourceFile, openOptions);
          if (tab) rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
          return tab;
        }
      } catch (_) {
        // Invalid JSON is still text and can be edited in the basic text editor.
        const safeJsonSourceFile = largeJsonOpen?.prepareLargeJsonForOpen?.(sourceFile, name, content);
        if (safeJsonSourceFile) {
          const tab = await openMarkdownSourceFile(safeJsonSourceFile, openOptions);
          if (tab) rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
          return tab;
        }
      }
    }

    const tab = await openMarkdownSourceFile({ ...sourceFile, name, content }, openOptions);
    if (tab) rememberOpenDocumentSourceFile(sourceFile, name, openOptions);
    return tab;
  }

  async function openDocumentFileFromPicker() {
    if (typeof NL_VERSION !== "undefined") {
      try {
        const selected = await Neutralino.os.showOpenDialog("Open file", {
          filters: [
            { name: "MD-Editor layered images", extensions: ["mdimage"] },
            { name: "Draw.io diagrams", extensions: ["drawio", "xml"] },
            { name: "Text-based files", extensions: ["md", "markdown", "mermaid", "mdviewer-graph.json", "mdgraph.json", "mdviewer-k8s-topology.json", "json", "txt", "java", "cs", "css", "js", "ts", "html", "xml", "csv", "yml", "yaml", "toml", "ini", "log"] },
            { name: "All files", extensions: ["*"] }
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
                "application/vnd.md-editor.image+zip": [".mdimage"],
                "application/xml": [".drawio", ".xml"],
                "text/markdown": [".md", ".markdown", ".mermaid"],
                "text/plain": [".txt", ".text", ".java", ".cs", ".css", ".js", ".ts", ".html", ".xml", ".csv", ".yml", ".yaml", ".toml", ".ini", ".log"],
                "application/json": [".json"]
              }
            }
          ],
          excludeAcceptAllOption: false
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
    openLargeFileSourceFile,
    openDocumentFileFromPicker,
    importDocumentFile
  };
    }
  };
})(window);
