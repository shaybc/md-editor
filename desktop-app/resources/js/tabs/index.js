(function(global) {
  global.registerMarkdownViewerTabs = function registerMarkdownViewerTabs(app, deps) {
    const api = {};
    const tabViewManager = deps.tabViewManager || null;
    let persistCurrentSessionOnLifecycle = true;
    let tabParseAsMenu = null;
    const tabMaximizeState = {
      active: false,
      bottomPanelWasVisible: false,
      bottomPanelActiveTabId: null,
      aiCompanionWasVisible: false
    };

    with (deps) {
  function hasReachedOpenTabLimit(actionText) {
    const maxOpenTabs = typeof getMaxOpenTabs === "function" ? getMaxOpenTabs() : 40;
    if (tabs.length < maxOpenTabs) return false;
    alert(`Maximum of ${maxOpenTabs} tabs reached. Please close an existing tab to ${actionText}.`);
    return true;
  }

  function getActiveEditorContent() {
    return activeEditorCommands?.getActiveEditorValue?.() ?? markdownEditor.value;
  }

  function setActiveEditorContent(content) {
    if (activeEditorCommands?.setActiveEditorValue) {
      activeEditorCommands.setActiveEditorValue(content);
    } else {
      markdownEditor.value = content;
    }
  }

  function nextUntitledTitle() {
    untitledCounter += 1;
    saveUntitledCounter(untitledCounter);
    return 'Untitled ' + untitledCounter;
  }

  function createTab(content, title, viewMode, options = {}) {
    if (content === undefined) content = '';
    content = normalizeEditorContent(content);
    if (title === undefined) title = null;
    if (viewMode === undefined) viewMode = loadGlobalState().viewMode || 'split';
    return {
      id: 'tab_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      title: title || 'Untitled',
      content: content,
      scrollPos: 0,
      viewMode: viewMode,
      splitViewEditorWidthPercent: Number.isFinite(options.splitViewEditorWidthPercent)
        ? options.splitViewEditorWidthPercent
        : Number(loadGlobalState().editorWidthPercent) || 50,
      createdAt: Date.now(),
      isTemporary: false,
      sourceFileName: null,
      sourceFileHandle: null,
      sourceFilePath: null,
      openedSource: normalizeOpenedSource(options.openedSource || null),
      linkBasePath: options.linkBasePath || null,
      savedContent: content,
      type: "markdown",
      folderName: null,
      isUnsupportedFile: false,
      largeFileSource: null,
      filePreviewSource: null,
      parseAsLanguageId: null
    };
  }

  function inferOpenedSourceKind(path, fallbackKind) {
    const explicitKind = String(fallbackKind || "").trim();
    if (explicitKind) return explicitKind;
    const value = String(path || "").toLowerCase();
    if (/\.mdviewer-graph\.json$|\.mdgraph\.json$/.test(value)) return "graph-file";
    if (/\.md$|\.markdown$/.test(value)) return "markdown";
    if (value) return "file";
    return "unknown";
  }

  function normalizeOpenedSource(source, fallbackKind) {
    if (!source || typeof source !== "object") return null;
    const path = String(source.path || source.fullPath || "").trim();
    const name = String(source.name || (path ? getFileName(path) : "") || "").trim();
    const kind = inferOpenedSourceKind(path || name, source.kind || fallbackKind);
    if (!path && !name) return null;
    return {
      path: path || null,
      name: name || null,
      kind
    };
  }

  function createOpenedSource(path, name, kind) {
    return normalizeOpenedSource({ path, name, kind }, kind);
  }

  function createOpenedSourceFromSourceFile(sourceFile, kind) {
    if (!sourceFile) return null;
    return normalizeOpenedSource({
      path: sourceFile.path || sourceFile.fullPath || null,
      name: sourceFile.name || sourceFile.handle?.name || sourceFile.file?.name || null,
      kind
    }, kind);
  }

  function setTabOpenedSource(tab, source, fallbackKind) {
    if (!tab) return null;
    const openedSource = normalizeOpenedSource(source, fallbackKind);
    tab.openedSource = openedSource;
    return openedSource;
  }

  function getNow() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function createActivationPerfSession(tab, action) {
    const enabled = typeof appDebugLog === "function";
    const start = getNow();
    let last = start;
    const steps = [];

    function mark(step, details = {}) {
      if (!enabled) return;
      const now = getNow();
      steps.push({
        step,
        deltaMs: Math.round((now - last) * 10) / 10,
        totalMs: Math.round((now - start) * 10) / 10,
        ...details
      });
      last = now;
    }

    function finish(details = {}) {
      if (!enabled) return;
      const totalMs = Math.round((getNow() - start) * 10) / 10;
      void appDebugLog("info", "[tab-activation-perf] " + action, {
        tabId: tab?.id || null,
        title: tab?.title || null,
        type: tab?.type || "markdown",
        viewMode: tab?.viewMode || null,
        totalMs,
        steps,
        ...details
      });
    }

    return { mark, finish };
  }

  const LARGE_EDITABLE_AUTO_FOCUS_BYTES = 512 * 1024;
  let lastTabBarSignature = "";
  let draggedTabId = null;
  let tabMouseDrag = null;
  let suppressTabClickAfterDrag = false;
  let selectedTabIds = new Set();
  let tabSelectionAnchorId = null;
  function getEditableTabContentLength(tab) {
    return typeof tab?.content === "string" ? tab.content.length : 0;
  }

  function isLargeEditableTab(tab) {
    return !!tab && tab.type !== "graph" && tab.type !== "large-file" && tab.type !== "file-preview" && tab.type !== "image-editor" && tab.type !== "diagram-editor" && tab.type !== "hex-editor" && tab.type !== "file-compare" && tab.type !== "api-client" && tab.type !== "soap-client" && tab.type !== "regex-tester" && tab.type !== "base64-tool" && tab.type !== "certificate-decoder" && tab.type !== "jwt-tool" && tab.type !== "json-yaml-tool" && tab.type !== "jsonpath-tool" && tab.type !== "xpath-tool" && tab.type !== "xslt-runner-tool" && tab.type !== "xml-tree-grid" && tab.type !== "uuid-tool" && tab.type !== "qr-tool" && tab.type !== "hash-tool" && tab.type !== "json-array-table-tool" && tab.type !== "text-escape-tool" &&
      getEditableTabContentLength(tab) > LARGE_EDITABLE_AUTO_FOCUS_BYTES;
  }

  function isLargeSplitEditableTab(tab) {
    return isLargeEditableTab(tab) && (tab.viewMode || "") === "split";
  }

  function shouldSkipEditableAutoFocus(tab, options = {}) {
    if (options.focus === false) return true;
    if (options.forceFocus === true) return false;
    return getEditableTabContentLength(tab) > LARGE_EDITABLE_AUTO_FOCUS_BYTES;
  }

  function focusEditableTab(tab, options = {}) {
    if (shouldSkipEditableAutoFocus(tab, options)) {
      return {
        focused: false,
        reason: options.focus === false ? "disabled" : "large-document",
        contentLength: getEditableTabContentLength(tab),
        threshold: LARGE_EDITABLE_AUTO_FOCUS_BYTES
      };
    }
    if (activeEditorCommands?.focusActiveEditor) activeEditorCommands.focusActiveEditor();
    else markdownEditor.focus();
    return { focused: true };
  }

  function pruneTabSelection() {
    const existingTabIds = new Set(tabs.map(function(tab) { return tab.id; }));
    selectedTabIds.forEach(function(tabId) {
      if (!existingTabIds.has(tabId)) selectedTabIds.delete(tabId);
    });
    if (tabSelectionAnchorId && !existingTabIds.has(tabSelectionAnchorId)) tabSelectionAnchorId = null;
  }

  function getOrderedExistingTabIds(tabIds) {
    const requestedTabIds = new Set(tabIds || []);
    return tabs
      .filter(function(tab) { return requestedTabIds.has(tab.id); })
      .map(function(tab) { return tab.id; });
  }

  function getEffectiveSelectedTabIds() {
    if (selectedTabIds.size === 0) return [];
    const effectiveTabIds = new Set(selectedTabIds);
    if (activeTabId) effectiveTabIds.add(activeTabId);
    return getOrderedExistingTabIds(Array.from(effectiveTabIds));
  }

  function isTabEffectivelySelected(tabId) {
    return getEffectiveSelectedTabIds().includes(tabId);
  }

  function clearTabSelection(options = {}) {
    const hadSelection = selectedTabIds.size > 0 || !!tabSelectionAnchorId;
    selectedTabIds.clear();
    tabSelectionAnchorId = null;
    if (hadSelection && options.render) renderTabBar(tabs, activeTabId);
    return hadSelection;
  }

  function toggleTabSelection(tabId) {
    if (!tabs.some(function(tab) { return tab.id === tabId; })) return;
    if (selectedTabIds.has(tabId)) selectedTabIds.delete(tabId);
    else selectedTabIds.add(tabId);
    tabSelectionAnchorId = tabId;
    renderTabBar(tabs, activeTabId);
  }

  function selectTabRange(tabId) {
    const orderedTabIds = tabs.map(function(tab) { return tab.id; });
    const tabIndex = orderedTabIds.indexOf(tabId);
    if (tabIndex === -1) return;
    let anchorId = tabSelectionAnchorId && orderedTabIds.includes(tabSelectionAnchorId)
      ? tabSelectionAnchorId
      : activeTabId;
    if (!anchorId || !orderedTabIds.includes(anchorId)) anchorId = tabId;
    const anchorIndex = orderedTabIds.indexOf(anchorId);
    const startIndex = Math.min(anchorIndex, tabIndex);
    const endIndex = Math.max(anchorIndex, tabIndex);
    selectedTabIds = new Set(orderedTabIds.slice(startIndex, endIndex + 1));
    tabSelectionAnchorId = anchorId;
    renderTabBar(tabs, activeTabId);
  }

  function handleTabClick(event, tab) {
    if (suppressTabClickAfterDrag) {
      suppressTabClickAfterDrag = false;
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      toggleTabSelection(tab.id);
      return;
    }
    if (event.shiftKey) {
      event.preventDefault();
      selectTabRange(tab.id);
      return;
    }
    clearTabSelection({ render: tab.id === activeTabId });
    app.modules?.sidebarContextTree?.clearSidebarTreeSelection?.();
    switchTab(tab.id);
  }

  function getTabContextTargetIds(tab, options = {}) {
    if (!tab) return [];
    if (options.closeMobileMenuOnAction) {
      clearTabSelection({ render: true });
      return [tab.id];
    }
    pruneTabSelection();
    if (isTabEffectivelySelected(tab.id)) return getEffectiveSelectedTabIds();
    clearTabSelection({ render: true });
    return [tab.id];
  }
  function scheduleDeferredLargeSplitActivation(tab, shouldInitializeRender) {
    const tabId = tab?.id;
    if (!tabId) return;
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        if (activeTabId !== tabId) return;
        const activeTab = tabs.find((candidate) => candidate.id === tabId);
        if (!activeTab || !isLargeSplitEditableTab(activeTab)) return;
        restoreViewMode("split", { skipRender: true });
        if (shouldInitializeRender) {
          renderMarkdown({
            reason: "deferred-large-split",
            deferHeavyEnhancements: true,
            reuseCache: true
          });
        }
        if (typeof refreshActiveResizeTarget === "function") refreshActiveResizeTarget();
        if (typeof refreshEditorLineNumberResizeObserver === "function") refreshEditorLineNumberResizeObserver();
        if (typeof appDebugLog === "function") {
          void appDebugLog("info", "[tab-activation-perf] deferred large split layout", {
            tabId,
            title: activeTab.title || null,
            contentLength: getEditableTabContentLength(activeTab)
          });
        }
      });
    });
  }

  function getGraphNodeCountForDisplayDefaults(options = {}) {
    const snapshot = options.graphSnapshot !== undefined ? options.graphSnapshot : options.graphDocument?.snapshot;
    const viewConfig = options.graphViewConfig != null
      ? options.graphViewConfig
      : (options.graphDocument?.viewConfig != null ? options.graphDocument.viewConfig : options.graphDocument?.graphViewConfig);
    return getGraphNodeCountForViewConfig(snapshot, viewConfig);
  }

  function getGraphLinkSourceIdForNodeCount(link) {
    return link?.source?.id || link?.source;
  }

  function getGraphLinkTargetIdForNodeCount(link) {
    return link?.target?.id || link?.target;
  }

  function isMarkdownGraphLinkForNodeCount(link) {
    return (link?.type || "link") === "link";
  }

  function getGraphNodeCountForViewConfig(snapshot, viewConfig) {
    const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
    if (!nodes.length) return 0;
    const hiddenNodeIds = new Set(Array.isArray(viewConfig?.hiddenNodeIds) ? viewConfig.hiddenNodeIds : []);
    const nodeIds = new Set(nodes.map((node) => node?.id).filter((nodeId) => nodeId && !hiddenNodeIds.has(nodeId)));
    const config = viewConfig || {};
    const focusNodeId = config.focusNodeId;

    const getDirectOutgoingNodeIds = (nodeId) => (snapshot?.links || [])
      .filter((link) => isMarkdownGraphLinkForNodeCount(link) && getGraphLinkSourceIdForNodeCount(link) === nodeId)
      .map(getGraphLinkTargetIdForNodeCount)
      .filter((nodeId) => nodeIds.has(nodeId));

    const getDirectIncomingNodeIds = (nodeId) => (snapshot?.links || [])
      .filter((link) => isMarkdownGraphLinkForNodeCount(link) && getGraphLinkTargetIdForNodeCount(link) === nodeId)
      .map(getGraphLinkSourceIdForNodeCount)
      .filter((nodeId) => nodeIds.has(nodeId));

    const getRecursiveNodeIds = (nodeId, getNextNodeIds) => {
      const collectedNodeIds = new Set();
      const nodesToVisit = [...getNextNodeIds(nodeId)];
      while (nodesToVisit.length) {
        const currentNodeId = nodesToVisit.shift();
        if (!currentNodeId || currentNodeId === nodeId || collectedNodeIds.has(currentNodeId)) continue;
        collectedNodeIds.add(currentNodeId);
        nodesToVisit.push(...getNextNodeIds(currentNodeId));
      }
      return collectedNodeIds;
    };

    if (config.mode === "local" && focusNodeId) {
      return new Set([focusNodeId, ...getDirectOutgoingNodeIds(focusNodeId)].filter((nodeId) => nodeIds.has(nodeId))).size;
    }
    if (config.mode === "full-local" && focusNodeId) {
      const outgoingNodeIds = getRecursiveNodeIds(focusNodeId, getDirectOutgoingNodeIds);
      return new Set([focusNodeId, ...outgoingNodeIds].filter((nodeId) => nodeIds.has(nodeId))).size;
    }
    if (config.mode === "full-network" && focusNodeId) {
      const outgoingNodeIds = getRecursiveNodeIds(focusNodeId, getDirectOutgoingNodeIds);
      const incomingNodeIds = getRecursiveNodeIds(focusNodeId, getDirectIncomingNodeIds);
      return new Set([focusNodeId, ...incomingNodeIds, ...outgoingNodeIds].filter((nodeId) => nodeIds.has(nodeId))).size;
    }
    if (config.mode === "cluster" && Array.isArray(config.clusterNodeIds)) {
      return new Set(config.clusterNodeIds.filter((nodeId) => nodeIds.has(nodeId))).size;
    }
    return nodes.length;
  }

  function getDefaultGraphViewConfigForNodeCount(nodeCount) {
    const preferenceDefaults = typeof getGraphViewPreferenceDefaults === "function" ? getGraphViewPreferenceDefaults() : {};
    const config = { ...DEFAULT_GRAPH_VIEW_CONFIG, ...preferenceDefaults };
    const largeGraphDisplayLimit = typeof getGraphRenderWarningThreshold === "function" ? getGraphRenderWarningThreshold() : LARGE_GRAPH_DISPLAY_NODE_LIMIT;
    if (nodeCount > largeGraphDisplayLimit) {
      if (!Object.prototype.hasOwnProperty.call(preferenceDefaults, "showArrows")) config.showArrows = false;
      if (!Object.prototype.hasOwnProperty.call(preferenceDefaults, "showOrphans")) config.showOrphans = false;
      if (!Object.prototype.hasOwnProperty.call(preferenceDefaults, "showLabels")) config.showLabels = false;
    }
    return config;
  }

  function shouldOpenGraphForNodeCount(nodeCount, folderName) {
    const warningThreshold = typeof getGraphRenderWarningThreshold === "function" ? getGraphRenderWarningThreshold() : LARGE_GRAPH_DISPLAY_NODE_LIMIT;
    if (!warningThreshold || nodeCount <= warningThreshold) return true;
    if (typeof app?.services?.confirm === "function") {
      return app.services.confirm(`Open graph "${folderName || "Graph View"}" with ${nodeCount} nodes?\n\nVery large graphs may be slow to render.`);
    }
    return window.confirm(`Open graph "${folderName || "Graph View"}" with ${nodeCount} nodes?\n\nVery large graphs may be slow to render.`);
  }

  function createGraphTab(folderName, options) {
    if (options === undefined) options = {};
    const nodeCount = getGraphNodeCountForDisplayDefaults(options);
    if (options.skipGraphRenderWarning !== true) {
      const shouldOpen = shouldOpenGraphForNodeCount(nodeCount, folderName || options.folderName);
      if (shouldOpen && typeof shouldOpen.then === "function") {
        return shouldOpen.then((confirmed) => confirmed
          ? createGraphTab(folderName, Object.assign({}, options, { skipGraphRenderWarning: true }))
          : null);
      }
      if (!shouldOpen) return null;
    }
    const hasExplicitViewConfig = options.graphViewConfig != null || options.graphDocument?.viewConfig != null;
    const viewConfig = hasExplicitViewConfig
      ? (options.graphViewConfig != null ? options.graphViewConfig : options.graphDocument?.viewConfig)
      : getDefaultGraphViewConfigForNodeCount(nodeCount);
    const graphDocument = normalizeGraphDocument({
      ...(options.graphDocument || {}),
      folderName: folderName || options.folderName || "Graph View",
      snapshot: options.graphSnapshot !== undefined ? options.graphSnapshot : options.graphDocument?.snapshot,
      viewConfig,
      graphLayout: options.graphLayout !== undefined ? options.graphLayout : (options.graphDocument?.graphLayout !== undefined ? options.graphDocument.graphLayout : options.graphDocument?.layout)
    });
    const graphData = deserializeGraphDocument(graphDocument);
    const tab = createTab("", graphData.folderName, "preview");
    tab.type = "graph";
    tab.folderName = graphData.folderName;
    tab.graphViewConfig = graphData.graphViewConfig;
    tab.graphSnapshot = graphData.graphSnapshot;
    tab.graphDocument = graphData.graphDocument;
    setTabOpenedSource(tab, options.openedSource || graphData.graphDocument?.openedSource || null, "graph");
    if (options.graphScopeKey || graphData.graphScopeKey) tab.graphScopeKey = options.graphScopeKey || graphData.graphScopeKey;
    if (Object.prototype.hasOwnProperty.call(graphData, "graphLayout")) tab.graphLayout = graphData.graphLayout;
    if (!hasExplicitViewConfig && nodeCount === 0) {
      tab.pendingLargeGraphDisplayDefaults = true;
    }
    return tab;
  }

  function normalizeGraphScopePath(value) {
    return String(value || "")
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .replace(/\/+$|^\s+|\s+$/g, "")
      .toLowerCase();
  }

  function createFolderGraphScopeKey(scope, value) {
    const normalizedPath = normalizeGraphScopePath(value);
    return normalizedPath ? `${scope}:${normalizedPath}` : "";
  }

  function getRootFolderGraphScopeKey() {
    return createFolderGraphScopeKey("root-folder", activeFolderPath || activeFolderName || "Graph View");
  }

  function findExistingFolderGraphTab(scopeKey, fallbackTitle) {
    if (!scopeKey && !fallbackTitle) return null;
    return tabs.find((tab) => {
      if (!tab || tab.type !== "graph" || isFileBackedGraphTab(tab)) return false;
      if (scopeKey && tab.graphScopeKey === scopeKey) return true;
      return !!(fallbackTitle && !tab.graphScopeKey && getGraphTabTitle(tab) === fallbackTitle);
    }) || null;
  }

  function focusExistingFolderGraphTab(scopeKey, fallbackTitle) {
    const existingGraphTab = findExistingFolderGraphTab(scopeKey, fallbackTitle);
    if (!existingGraphTab) return false;
    switchTab(existingGraphTab.id);
    saveActiveTabId(existingGraphTab.id);
    return true;
  }

  function getGraphTitleFromFileName(fileName) {
    return (fileName || "Saved Graph")
      .replace(/\.mdviewer-graph\.json$/i, "")
      .replace(/\.mdgraph\.json$/i, "")
      .replace(/\.json$/i, "");
  }

  function getGraphTabTitle(tab) {
    if (!tab || tab.type !== "graph") return tab?.title || 'Untitled';
    if (tab.graphViewKind === "health-report") return tab.title || "Health report";
    if (tab.sourceFileName) return getGraphTitleFromFileName(tab.sourceFileName) || "Saved Graph";
    if (tab.sourceFilePath) return getGraphTitleFromFileName(getFileName(tab.sourceFilePath)) || "Saved Graph";
    return tab.title || tab.folderName || "Graph View";
  }

  function tabHasPendingChanges(tab, content) {
    if (tab?.type === "image-editor") return deps.imageEditor?.hasUnsavedChanges?.(tab) === true;
    if (tab?.type === "diagram-editor") return deps.diagramEditor?.hasUnsavedChanges?.(tab) === true;
    if (tab?.type === "hex-editor") return deps.hexEditor?.hasUnsavedChanges?.(tab) === true;
    return tabHasUnsavedChanges(tab, content);
  }

  function isSourceFileTab(tab) {
    return !!(tab && (tab.sourceFileName || tab.sourceFilePath || tab.sourceFileHandle?.name));
  }

  function getTabDisplayName(tab) {
    const baseName = tab && tab.type === "graph" ? getGraphTabTitle(tab) : (tab.title || 'Untitled');
    return tabHasPendingChanges(tab) ? baseName + ' *' : baseName;
  }

  function getTabTooltipText(tab) {
    if (!tab) return 'Untitled';
    return tab.sourceFilePath || tab.sourceFileName || tab.title || tab.folderName || 'Untitled';
  }

  let tabScrollbarOverlay = null;

  function updateTabScrollControls() {
    const tabList = document.getElementById('tab-list');
    const scrollLeftBtn = document.getElementById('tab-scroll-left');
    const scrollRightBtn = document.getElementById('tab-scroll-right');
    if (!tabList || !scrollLeftBtn || !scrollRightBtn) return;

    const hasOverflow = tabList.scrollWidth > tabList.clientWidth + 1;
    scrollLeftBtn.classList.toggle('visible', hasOverflow);
    scrollRightBtn.classList.toggle('visible', hasOverflow);

    const maxScrollLeft = Math.max(0, tabList.scrollWidth - tabList.clientWidth);
    scrollLeftBtn.disabled = !hasOverflow || tabList.scrollLeft <= 1;
    scrollRightBtn.disabled = !hasOverflow || tabList.scrollLeft >= maxScrollLeft - 1;
    tabScrollbarOverlay?.update?.();
  }

  function scrollTabsBy(delta) {
    const tabList = document.getElementById('tab-list');
    if (!tabList) return;

    tabList.scrollBy({ left: delta, behavior: 'smooth' });
    tabScrollbarOverlay?.reveal?.();
    window.setTimeout(updateTabScrollControls, 180);
  }

  function setupTabScrolling() {
    const tabList = document.getElementById('tab-list');
    const tabBar = document.getElementById('tab-bar');
    const scrollLeftBtn = document.getElementById('tab-scroll-left');
    const scrollRightBtn = document.getElementById('tab-scroll-right');
    if (!tabList || !scrollLeftBtn || !scrollRightBtn) return;

    if (typeof window.createMarkdownViewerTabScrollbarOverlay === "function") {
      tabScrollbarOverlay = window.createMarkdownViewerTabScrollbarOverlay({ tabBar, tabList, hideDelayMs: 1000 });
    }

    const getScrollAmount = function() {
      return Math.max(160, Math.floor(tabList.clientWidth * 0.75));
    };

    scrollLeftBtn.addEventListener('click', function() {
      scrollTabsBy(-getScrollAmount());
    });

    scrollRightBtn.addEventListener('click', function() {
      scrollTabsBy(getScrollAmount());
    });

    tabList.addEventListener('dblclick', function(e) {
      if (e.target !== tabList) return;
      newTab();
    });

    tabList.addEventListener('scroll', function() {
      updateTabScrollControls();
    });
    window.addEventListener('resize', updateTabScrollControls);
    updateTabScrollControls();
  }

  setupTabScrolling();

  function getBottomPanelTabs() {
    return app.modules?.bottomPanelTabs || null;
  }

  function getAiCompanionPanel() {
    return app.modules?.aiCompanionPanel || null;
  }

  function isAiCompanionPanelVisible() {
    return document.body?.classList?.contains?.("ai-companion-open") === true;
  }

  function maximizeEditorTabs() {
    const bottomPanelTabs = getBottomPanelTabs();
    const aiCompanionPanel = getAiCompanionPanel();
    tabMaximizeState.bottomPanelWasVisible = !!bottomPanelTabs?.isPanelVisible?.();
    tabMaximizeState.bottomPanelActiveTabId = bottomPanelTabs?.getActiveTabId?.() || null;
    tabMaximizeState.aiCompanionWasVisible = isAiCompanionPanelVisible();
    tabMaximizeState.active = true;
    setSidebarVisible?.(false, false, false);
    bottomPanelTabs?.hidePanel?.();
    aiCompanionPanel?.setOpen?.(false, { persist: false });
  }

  function restoreEditorTabs() {
    const bottomPanelTabs = getBottomPanelTabs();
    const aiCompanionPanel = getAiCompanionPanel();
    const bottomPanelWasVisible = tabMaximizeState.bottomPanelWasVisible;
    const bottomPanelActiveTabId = tabMaximizeState.bottomPanelActiveTabId;
    const aiCompanionWasVisible = tabMaximizeState.aiCompanionWasVisible;
    tabMaximizeState.active = false;
    tabMaximizeState.bottomPanelWasVisible = false;
    tabMaximizeState.bottomPanelActiveTabId = null;
    tabMaximizeState.aiCompanionWasVisible = false;
    setSidebarVisible?.(true, false, false);
    if (bottomPanelWasVisible) {
      bottomPanelTabs?.activateTab?.(bottomPanelActiveTabId || bottomPanelTabs.SEARCH_RESULTS_TAB_ID);
    } else {
      bottomPanelTabs?.hidePanel?.();
    }
    aiCompanionPanel?.setOpen?.(aiCompanionWasVisible, { persist: false });
  }

  function toggleEditorTabsMaximized() {
    if (tabMaximizeState.active) {
      restoreEditorTabs();
    } else {
      maximizeEditorTabs();
    }
  }

  function isTabCloseButtonEvent(event) {
    return !!event?.target?.closest?.('.tab-close-btn');
  }

  function reorderTabById(sourceTabId, targetTabId) {
    if (!sourceTabId || !targetTabId || sourceTabId === targetTabId) return false;
    const fromIdx = tabs.findIndex(function(t) { return t.id === sourceTabId; });
    const toIdx = tabs.findIndex(function(t) { return t.id === targetTabId; });
    if (fromIdx === -1 || toIdx === -1) return false;
    const moved = tabs.splice(fromIdx, 1)[0];
    tabs.splice(toIdx, 0, moved);
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    return true;
  }

  function clearTabMouseDrag() {
    document.removeEventListener('mousemove', handleTabMouseMove, true);
    document.removeEventListener('mouseup', finishTabMouseDrag, true);
    if (tabMouseDrag?.item) tabMouseDrag.item.classList.remove('dragging');
    document.querySelectorAll('.tab-item.drag-over').forEach(function(item) {
      item.classList.remove('drag-over');
    });
    tabMouseDrag = null;
  }

  function getTabItemAtPoint(x, y) {
    return document.elementFromPoint(x, y)?.closest?.('.tab-item[data-tab-id]') || null;
  }

  function startTabMouseDrag(event, tabId, item) {
    if (event.button !== 0 || isTabCloseButtonEvent(event)) return;
    tabMouseDrag = {
      tabId,
      item,
      startX: event.clientX,
      startY: event.clientY,
      isDragging: false
    };
    document.addEventListener('mousemove', handleTabMouseMove, true);
    document.addEventListener('mouseup', finishTabMouseDrag, true);
  }

  function handleTabMouseMove(event) {
    if (!tabMouseDrag) return;
    const distanceX = Math.abs(event.clientX - tabMouseDrag.startX);
    const distanceY = Math.abs(event.clientY - tabMouseDrag.startY);
    if (!tabMouseDrag.isDragging && distanceX < 4 && distanceY < 4) return;
    tabMouseDrag.isDragging = true;
    draggedTabId = tabMouseDrag.tabId;
    tabMouseDrag.item.classList.add('dragging');
    document.querySelectorAll('.tab-item.drag-over').forEach(function(item) {
      item.classList.remove('drag-over');
    });
    const targetItem = getTabItemAtPoint(event.clientX, event.clientY);
    if (targetItem && targetItem.getAttribute('data-tab-id') !== tabMouseDrag.tabId) {
      targetItem.classList.add('drag-over');
    }
    event.preventDefault();
  }

  function finishTabMouseDrag(event) {
    if (!tabMouseDrag) return;
    const dragState = tabMouseDrag;
    const shouldReorder = dragState.isDragging;
    const targetItem = shouldReorder ? getTabItemAtPoint(event.clientX, event.clientY) : null;
    clearTabMouseDrag();
    if (!shouldReorder) return;
    suppressTabClickAfterDrag = true;
    draggedTabId = null;
    if (targetItem) reorderTabById(dragState.tabId, targetItem.getAttribute('data-tab-id'));
    event.preventDefault();
    event.stopPropagation();
  }
  function renderTabBar(tabsArr, currentActiveTabId) {
    const tabList = document.getElementById('tab-list');
    if (!tabList) return;
    pruneTabSelection();
    const nextSignature = getTabBarSignature(tabsArr);
    if (lastTabBarSignature === nextSignature && updateTabBarActiveState(currentActiveTabId)) {
      updateSaveCurrentFileButtons();
      return;
    }
    lastTabBarSignature = nextSignature;
    tabList.innerHTML = '';
    tabsArr.forEach(function(tab) {
      const item = document.createElement('div');
      item.className = 'tab-item' + (isSourceFileTab(tab) ? ' source-file-tab' : '') + (tab.id === currentActiveTabId ? ' active' : '') + (isTabEffectivelySelected(tab.id) ? ' selected' : '') + (tabHasPendingChanges(tab) ? ' unsaved' : '');
      item.setAttribute('data-tab-id', tab.id);
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', tab.id === currentActiveTabId ? 'true' : 'false');
      item.setAttribute('draggable', 'false');

      const displayName = getTabDisplayName(tab);
      const tooltipText = getTabTooltipText(tab);
      item.title = tooltipText;
      item.setAttribute('aria-label', tooltipText);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'tab-title' + (tab.isTemporary ? ' temporary' : '');
      titleSpan.title = tooltipText;
      if (tab.type === "graph") {
        const graphIcon = document.createElement("i");
        graphIcon.className = `bi ${tab.graphViewKind === "health-report" ? "bi-clipboard2-pulse" : "bi-diagram-3"} me-1`;
        titleSpan.appendChild(graphIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "large-file") {
        const largeFileIcon = document.createElement("i");
        largeFileIcon.className = "bi bi-file-earmark-text me-1";
        titleSpan.appendChild(largeFileIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "image-editor") {
        const imageEditorIcon = document.createElement("i");
        imageEditorIcon.className = "bi bi-pencil-square me-1";
        titleSpan.appendChild(imageEditorIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "hex-editor") {
        const hexIcon = document.createElement("i");
        hexIcon.className = "bi bi-file-binary me-1";
        titleSpan.appendChild(hexIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "file-preview") {
        const previewIcon = document.createElement("i");
        previewIcon.className = `bi ${getFileIconClass(tab.sourceFileName || tab.sourceFilePath || tab.title)} me-1`;
        titleSpan.appendChild(previewIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "file-compare") {
        const compareIcon = document.createElement("i");
        compareIcon.className = "bi bi-file-diff me-1";
        titleSpan.appendChild(compareIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "api-client") {
        const apiClientIcon = document.createElement("i");
        apiClientIcon.className = "bi bi-send me-1";
        titleSpan.appendChild(apiClientIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "regex-tester") {
        const regexTesterIcon = document.createElement("i");
        regexTesterIcon.className = "bi bi-regex me-1";
        titleSpan.appendChild(regexTesterIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "base64-tool") {
        const base64Icon = document.createElement("i");
        base64Icon.className = "bi bi-file-binary me-1";
        titleSpan.appendChild(base64Icon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "certificate-decoder") {
        const certificateIcon = document.createElement("i");
        certificateIcon.className = "bi bi-award me-1";
        titleSpan.appendChild(certificateIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "jwt-tool") {
        const jwtIcon = document.createElement("i");
        jwtIcon.className = "bi bi-key me-1";
        titleSpan.appendChild(jwtIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "json-yaml-tool") {
        const jsonYamlIcon = document.createElement("i");
        jsonYamlIcon.className = "bi bi-braces me-1";
        titleSpan.appendChild(jsonYamlIcon);
      } else if (tab.type === "jsonpath-tool") {
        const jsonPathIcon = document.createElement("i");
        jsonPathIcon.className = "bi bi-signpost-split me-1";
        titleSpan.appendChild(jsonPathIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "xpath-tool") {
        const xpathIcon = document.createElement("i");
        xpathIcon.className = "bi bi-signpost-split me-1";
        titleSpan.appendChild(xpathIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "xml-tree-grid") {
        const xmlTreeIcon = document.createElement("i");
        xmlTreeIcon.className = "bi bi-diagram-3 me-1";
        titleSpan.appendChild(xmlTreeIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "uuid-tool") {
        const uuidIcon = document.createElement("i");
        uuidIcon.className = "bi bi-hash me-1";
        titleSpan.appendChild(uuidIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "qr-tool") {
        const qrIcon = document.createElement("i");
        qrIcon.className = "bi bi-qr-code me-1";
        titleSpan.appendChild(qrIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "hash-tool") {
        const hashIcon = document.createElement("i");
        hashIcon.className = "bi bi-fingerprint me-1";
        titleSpan.appendChild(hashIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "json-array-table-tool") {
        const tableIcon = document.createElement("i");
        tableIcon.className = "bi bi-database me-1";
        titleSpan.appendChild(tableIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "text-escape-tool") {
        const textEscapeIcon = document.createElement("i");
        textEscapeIcon.className = "bi bi-textarea-t me-1";
        titleSpan.appendChild(textEscapeIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else {
        const tabIcon = document.createElement("i");
        tabIcon.className = `bi ${getFileIconClass(tab.sourceFileName || tab.sourceFilePath || tab.title)} me-1`;
        titleSpan.appendChild(tabIcon);
        titleSpan.append(document.createTextNode(displayName));
      }

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close-btn';
      closeBtn.setAttribute('aria-label', 'Close tab');
      closeBtn.title = 'Close tab';
      closeBtn.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
      closeBtn.addEventListener('click', async function(e) {
        e.stopPropagation();
        await closeTab(tab.id, { promptForUnsaved: true });
      });

      item.appendChild(titleSpan);
      item.appendChild(closeBtn);

      item.addEventListener('click', function(e) {
        handleTabClick(e, tab);
      });

      item.addEventListener('contextmenu', function(e) {
        showTabContextMenu(e, tab);
      });

      item.addEventListener('dblclick', function(e) {
        if (isTabCloseButtonEvent(e)) return;
        pinTemporaryTab(tab.id);
        toggleEditorTabsMaximized();
      });

      item.addEventListener('mousedown', function(e) {
        startTabMouseDrag(e, tab.id, item);
      });

      item.addEventListener('dragstart', function(e) {
        draggedTabId = tab.id;
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', tab.id);
        }
        setTimeout(function() { item.classList.add('dragging'); }, 0);
      });

      item.addEventListener('dragend', function() {
        item.classList.remove('dragging');
        draggedTabId = null;
        clearTabMouseDrag();
      });

      item.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        item.classList.add('drag-over');
      });

      item.addEventListener('dragleave', function() {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', function(e) {
        e.preventDefault();
        item.classList.remove('drag-over');
        if (!draggedTabId || draggedTabId === tab.id) return;
        reorderTabById(draggedTabId, tab.id);
        draggedTabId = null;
        clearTabMouseDrag();
      });

      tabList.appendChild(item);
    });

    // "+ Create" button at end of tab list
    const newBtn = document.createElement('button');
    newBtn.className = 'tab-new-btn';
    newBtn.title = 'New Tab (Ctrl+T)';
    newBtn.setAttribute('aria-label', 'Open new tab');
    newBtn.innerHTML = '<i class="bi bi-plus-lg"></i>';
    newBtn.addEventListener('click', function() { newTab(); });
    tabList.appendChild(newBtn);

    // Auto-scroll active tab into view
    const activeItem = tabList.querySelector('.tab-item.active');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    updateTabScrollControls();
    requestAnimationFrame(updateTabScrollControls);

    renderMobileTabList(tabsArr, currentActiveTabId);
    updateSaveCurrentFileButtons();
  }

  function getTabBarSignature(tabsArr) {
    return tabsArr.map(function(tab) {
      return [
        tab.id,
        getTabDisplayName(tab),
        getTabTooltipText(tab),
        tab.type || "markdown",
        tab.graphViewKind || "",
        tab.isTemporary ? "temporary" : "",
        tabHasPendingChanges(tab) ? "unsaved" : ""
      ].join("\u001f");
    }).join("\u001e");
  }

  function updateTabBarActiveState(currentActiveTabId) {
    const tabList = document.getElementById('tab-list');
    if (!tabList) return false;
    const tabItems = Array.from(tabList.querySelectorAll('.tab-item[data-tab-id]'));
    if (tabItems.length !== tabs.length) return false;
    let foundActiveTab = false;
    tabItems.forEach(function(item) {
      const tabId = item.getAttribute('data-tab-id');
      const isActive = tabId === currentActiveTabId;
      foundActiveTab = foundActiveTab || isActive;
      item.classList.toggle('active', isActive);
      item.classList.toggle('selected', isTabEffectivelySelected(tabId));
      item.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    const mobileTabList = document.getElementById('mobile-tab-list');
    if (mobileTabList) {
      mobileTabList.querySelectorAll('.mobile-tab-item[data-tab-id]').forEach(function(item) {
        const isActive = item.getAttribute('data-tab-id') === currentActiveTabId;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }
    updateTabScrollControls();
    requestAnimationFrame(updateTabScrollControls);
    return foundActiveTab;
  }

  function renderMobileTabList(tabsArr, currentActiveTabId) {
    const mobileTabList = document.getElementById('mobile-tab-list');
    if (!mobileTabList) return;
    mobileTabList.innerHTML = '';
    tabsArr.forEach(function(tab) {
      const item = document.createElement('div');
      item.className = 'mobile-tab-item' + (tab.id === currentActiveTabId ? ' active' : '') + (tabHasPendingChanges(tab) ? ' unsaved' : '');
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', tab.id === currentActiveTabId ? 'true' : 'false');
      item.setAttribute('data-tab-id', tab.id);

      const displayName = getTabDisplayName(tab);
      const tooltipText = getTabTooltipText(tab);
      item.title = tooltipText;
      item.setAttribute('aria-label', tooltipText);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'mobile-tab-title' + (tab.isTemporary ? ' temporary' : '');
      titleSpan.title = tooltipText;
      if (tab.type === "graph") {
        const graphIcon = document.createElement("i");
        graphIcon.className = `bi ${tab.graphViewKind === "health-report" ? "bi-clipboard2-pulse" : "bi-diagram-3"} me-1`;
        titleSpan.appendChild(graphIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "api-client") {
        const apiClientIcon = document.createElement("i");
        apiClientIcon.className = "bi bi-send me-1";
        titleSpan.appendChild(apiClientIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "regex-tester") {
        const regexTesterIcon = document.createElement("i");
        regexTesterIcon.className = "bi bi-regex me-1";
        titleSpan.appendChild(regexTesterIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "base64-tool") {
        const base64Icon = document.createElement("i");
        base64Icon.className = "bi bi-file-binary me-1";
        titleSpan.appendChild(base64Icon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "certificate-decoder") {
        const certificateIcon = document.createElement("i");
        certificateIcon.className = "bi bi-award me-1";
        titleSpan.appendChild(certificateIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "jwt-tool") {
        const jwtIcon = document.createElement("i");
        jwtIcon.className = "bi bi-key me-1";
        titleSpan.appendChild(jwtIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "json-yaml-tool") {
        const jsonYamlIcon = document.createElement("i");
        jsonYamlIcon.className = "bi bi-braces me-1";
        titleSpan.appendChild(jsonYamlIcon);
      } else if (tab.type === "jsonpath-tool") {
        const jsonPathIcon = document.createElement("i");
        jsonPathIcon.className = "bi bi-signpost-split me-1";
        titleSpan.appendChild(jsonPathIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "xpath-tool") {
        const xpathIcon = document.createElement("i");
        xpathIcon.className = "bi bi-signpost-split me-1";
        titleSpan.appendChild(xpathIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "xml-tree-grid") {
        const xmlTreeIcon = document.createElement("i");
        xmlTreeIcon.className = "bi bi-diagram-3 me-1";
        titleSpan.appendChild(xmlTreeIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "uuid-tool") {
        const uuidIcon = document.createElement("i");
        uuidIcon.className = "bi bi-hash me-1";
        titleSpan.appendChild(uuidIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "qr-tool") {
        const qrIcon = document.createElement("i");
        qrIcon.className = "bi bi-qr-code me-1";
        titleSpan.appendChild(qrIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "hash-tool") {
        const hashIcon = document.createElement("i");
        hashIcon.className = "bi bi-fingerprint me-1";
        titleSpan.appendChild(hashIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "json-array-table-tool") {
        const tableIcon = document.createElement("i");
        tableIcon.className = "bi bi-database me-1";
        titleSpan.appendChild(tableIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "text-escape-tool") {
        const textEscapeIcon = document.createElement("i");
        textEscapeIcon.className = "bi bi-textarea-t me-1";
        titleSpan.appendChild(textEscapeIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else if (tab.type === "large-file" || tab.type === "file-preview" || tab.type === "image-editor" || tab.type === "hex-editor" || tab.type === "file-compare") {
        titleSpan.textContent = displayName;
      } else {
        titleSpan.textContent = displayName;
      }

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close-btn';
      closeBtn.setAttribute('aria-label', 'Close tab');
      closeBtn.title = 'Close tab';
      closeBtn.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
      closeBtn.addEventListener('click', async function(e) {
        e.stopPropagation();
        await closeTab(tab.id, { promptForUnsaved: true });
        closeMobileMenu();
      });

      item.appendChild(titleSpan);
      item.appendChild(closeBtn);

      item.addEventListener('click', function() {
        app.modules?.sidebarContextTree?.clearSidebarTreeSelection?.();
        switchTab(tab.id);
        closeMobileMenu();
      });

      item.addEventListener('contextmenu', function(e) {
        showTabContextMenu(e, tab, { closeMobileMenuOnAction: true });
      });

      mobileTabList.appendChild(item);
    });
  }

  let tabContextMenu = null;
  let tabContextTargetId = null;
  let tabContextTargetIds = [];
  let tabContextCloseMobileMenuOnAction = false;

  function getTabCompareSource(tab) {
    if (!tab || ['graph', 'file-compare', 'api-client', 'soap-client', 'regex-tester', 'base64-tool', 'certificate-decoder', 'jwt-tool', 'json-yaml-tool', 'jsonpath-tool', 'xml-tree-grid', 'kubernetes-topology'].includes(tab.type)) return null;
    const path = tab.sourceFilePath || tab.openedSource?.path || tab.largeFileSource?.path || tab.filePreviewSource?.path || null;
    const handle = tab.sourceFileHandle || tab.largeFileSource?.handle || tab.filePreviewSource?.handle || null;
    const file = tab.filePreviewSource?.file || null;
    if (!path && !handle && !file) return null;
    const source = {
      name: tab.sourceFileName || tab.openedSource?.name || tab.largeFileSource?.name || tab.filePreviewSource?.name || (path ? getFileName(path) : tab.title),
      path,
      handle,
      file
    };
    if (tab.type === 'large-file' && tab.largeFileSource?.content !== undefined) {
      source.content = tab.largeFileSource.content;
    } else if (tab.type === 'file-preview' && tab.filePreviewSource?.content !== undefined) {
      source.content = tab.filePreviewSource.content;
    } else if (tab.type !== 'file-preview' && typeof tab.content === 'string') {
      source.content = tab.content;
    }
    return source;
  }

  async function compareSelectedTabs(tabIds) {
    const sources = getOrderedExistingTabIds(tabIds)
      .map(function(tabId) { return getTabCompareSource(tabs.find(function(tab) { return tab.id === tabId; })); })
      .filter(Boolean);
    if (sources.length !== 2) return;
    const compareFiles = app.modules?.fileCompare?.openCompareFiles;
    if (typeof compareFiles !== 'function') {
      alert('File comparison is unavailable.');
      return;
    }
    await compareFiles(sources[0], sources[1]);
  }

  function ensureTabContextMenu() {
    if (tabContextMenu) return tabContextMenu;

    tabContextMenu = document.createElement('div');
    tabContextMenu.className = 'graph-context-menu tab-context-menu hidden';
    tabContextMenu.setAttribute('role', 'menu');
    tabContextMenu.innerHTML =
      '<button class="graph-context-menu-item tab-context-menu-action" type="button" role="menuitem" data-action="rename"><i class="bi bi-pencil" aria-hidden="true"></i><span class="graph-context-menu-item-label">Rename</span></button>' +
      '<button class="graph-context-menu-item tab-context-menu-action" type="button" role="menuitem" data-action="duplicate"><i class="bi bi-files" aria-hidden="true"></i><span class="graph-context-menu-item-label">Duplicate</span></button>' +
      '<button class="graph-context-menu-item tab-context-menu-action" type="button" role="menuitem" data-action="compare"><i class="bi bi-file-diff" aria-hidden="true"></i><span class="graph-context-menu-item-label">Compare with each other</span></button>' +
      '<div class="graph-context-menu-separator" aria-hidden="true"></div>' +
      '<button class="graph-context-menu-item tab-context-menu-action" type="button" role="menuitem" data-action="reveal-in-tree-view"><i class="bi bi-list-ul" aria-hidden="true"></i><span class="graph-context-menu-item-label">Reveal in TreeView</span></button>' +
      '<button class="graph-context-menu-item tab-context-menu-action" type="button" role="menuitem" data-action="open-project-folder"><i class="bi bi-folder2-open" aria-hidden="true"></i><span class="graph-context-menu-item-label">Open file&apos;s project folder</span></button>' +
      '<div class="graph-context-menu-separator tab-context-menu-project-separator" aria-hidden="true"></div>' +
      '<button class="graph-context-menu-item tab-context-menu-action" type="button" role="menuitem" data-action="reopen-closed"><i class="bi bi-clock-history" aria-hidden="true"></i><span class="graph-context-menu-item-label">Reopen Closed Tab</span></button>' +
      '<div class="graph-context-menu-separator" aria-hidden="true"></div>' +
      '<button class="graph-context-menu-item graph-context-menu-item-danger tab-context-menu-action" type="button" role="menuitem" data-action="close"><i class="bi bi-x-lg" aria-hidden="true"></i><span class="graph-context-menu-item-label">Close</span></button>' +
      '<button class="graph-context-menu-item graph-context-menu-item-danger tab-context-menu-action" type="button" role="menuitem" data-action="close-others"><i class="bi bi-x-lg" aria-hidden="true"></i><span class="graph-context-menu-item-label">Close others</span></button>' +
      '<button class="graph-context-menu-item graph-context-menu-item-danger tab-context-menu-action" type="button" role="menuitem" data-action="close-unchanged"><i class="bi bi-x-lg" aria-hidden="true"></i><span class="graph-context-menu-item-label">Close unchanged tabs</span></button>' +
      '<button class="graph-context-menu-item graph-context-menu-item-danger tab-context-menu-action" type="button" role="menuitem" data-action="close-all"><i class="bi bi-x-lg" aria-hidden="true"></i><span class="graph-context-menu-item-label">Close all</span></button>';

    if (typeof createTabParseAsMenu === "function") {
      tabParseAsMenu = createTabParseAsMenu({
        languageRegistry,
        onSelect: applyTabLanguageOverride
      });
      tabContextMenu.insertBefore(tabParseAsMenu.element, tabContextMenu.children[2]);
    }

    tabContextMenu.addEventListener('click', async function(e) {
      e.stopPropagation();
      const actionBtn = e.target.closest('.tab-context-menu-action');
      if (!actionBtn || !tabContextTargetId) return;
      if (actionBtn.disabled) return;
      const action = actionBtn.getAttribute('data-action');
      const targetTab = tabs.find(function(tab) { return tab.id === tabContextTargetId; });
      const targetTabIds = getOrderedExistingTabIds(tabContextTargetIds.length ? tabContextTargetIds : [tabContextTargetId]);
      const shouldCloseMobileMenu = tabContextCloseMobileMenuOnAction;
      hideTabContextMenu();
      if (!targetTab) return;
      if (action === 'rename') renameTab(targetTab.id);
      else if (action === 'duplicate') await duplicateTab(targetTab.id);
      else if (action === 'compare') await compareSelectedTabs(targetTabIds);
      else if (action === 'reveal-in-tree-view') void revealTabInTreeView(targetTab);
      else if (action === 'open-project-folder') void openTabProjectFolder(targetTab);
      else if (action === 'reopen-closed') await reopenClosedTab();
      else if (action === 'close') await closeTabsByIds(targetTabIds);
      else if (action === 'close-others') await closeOtherTabsByIds(targetTabIds);
      else if (action === 'close-unchanged') await closeUnchangedTabs();
      else if (action === 'close-all') await closeAllTabs();
      if (shouldCloseMobileMenu) closeMobileMenu();
    });

    document.body.appendChild(tabContextMenu);
    return tabContextMenu;
  }

  function normalizeTabLanguageOverride(languageId) {
    return languageRegistry?.languages?.some?.(function(language) { return language.id === languageId; }) ? languageId : null;
  }

  function isParseAsEligibleTab(tab) {
    return !!tab && !["graph", "large-file", "file-preview", "image-editor", "diagram-editor", "hex-editor", "file-compare", "api-client", "soap-client", "regex-tester", "base64-tool", "certificate-decoder", "jwt-tool", "json-yaml-tool", "jsonpath-tool", "xml-tree-grid", "uuid-tool", "qr-tool", "hash-tool", "json-array-table-tool", "text-escape-tool"].includes(tab.type);
  }

  function applyTabLanguageOverride(languageId) {
    const targetTab = tabs.find(function(tab) { return tab.id === tabContextTargetId; });
    if (!isParseAsEligibleTab(targetTab)) return;
    targetTab.parseAsLanguageId = normalizeTabLanguageOverride(languageId);
    saveTabsToStorage(tabs);
    editorViewManager?.refreshLanguageForTab?.(targetTab.id);
    if (targetTab.id === activeTabId) deps.onActiveTabChanged?.(targetTab);
    hideTabContextMenu();
  }

  function positionTabContextMenu(menu, event) {
    const margin = 8;
    menu.style.left = '0px';
    menu.style.top = '0px';
    const rect = menu.getBoundingClientRect();
    const left = Math.min(
      Math.max(margin, event.clientX),
      Math.max(margin, window.innerWidth - rect.width - margin)
    );
    const top = Math.min(
      Math.max(margin, event.clientY),
      Math.max(margin, window.innerHeight - rect.height - margin)
    );
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function setTabContextMenuActionEnabled(menu, action, enabled) {
    const button = menu.querySelector('[data-action="' + action + '"]');
    if (!button) return;
    button.disabled = !enabled;
    button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    button.classList.toggle('disabled', !enabled);
  }

  function normalizeTabFilesystemPath(path) {
    return String(path || "").trim().replace(/\\/g, "/").replace(/\/+/g, "/");
  }

  function getTabPathParentFolder(path) {
    const normalized = normalizeTabFilesystemPath(path).replace(/\/+$/, "");
    if (!normalized) return "";
    const slashIndex = normalized.lastIndexOf("/");
    if (slashIndex <= 0) return "";
    return normalized.slice(0, slashIndex);
  }

  function isConverterReportTab(tab) {
    const path = tab?.sourceFilePath || tab?.openedSource?.path || tab?.sourceFileName || tab?.openedSource?.name || tab?.title || "";
    const leafName = String(path || "").split(/[\\/]/).pop();
    return tab?.largeFileView?.reason === "converter-report-json"
      || /^missing_dependencies_report\.json$/i.test(leafName)
      || /^_[a-z0-9_-]*converter_report\.json$/i.test(leafName)
      || /^_java_converter_report\.json$/i.test(leafName);
  }

  function getGraphScopeFolderPath(tab) {
    const scopeKey = String(tab?.graphScopeKey || tab?.graphDocument?.graphScopeKey || "").trim();
    const rootPrefix = "root-folder:";
    return scopeKey.toLowerCase().startsWith(rootPrefix) ? scopeKey.slice(rootPrefix.length) : "";
  }

  function isProjectDerivedTab(tab) {
    if (!tab) return false;
    if (tab.type === "graph" || tab.graphViewKind === "health-report") return true;
    if (isConverterReportTab(tab)) return true;
    const path = tab.sourceFilePath || tab.openedSource?.path || tab.sourceFileName || tab.openedSource?.name || "";
    return isMarkdownPath?.(path) === true;
  }

  function getTabProjectFolderSeeds(tab) {
    const seeds = [];
    const addSeed = (value) => {
      const seed = String(value || "").trim();
      if (seed && !seeds.includes(seed)) seeds.push(seed);
    };
    const sourceTab = tab?.graphHealthSourceTabId
      ? tabs.find(function(openTab) { return openTab.id === tab.graphHealthSourceTabId; })
      : null;
    const addTabSeeds = (sourceTab) => {
      addSeed(sourceTab?.openedSource?.path);
      addSeed(sourceTab?.sourceFilePath);
      addSeed(sourceTab?.graphDocument?.sourceFilePath);
      addSeed(sourceTab?.sourceFileName);
      addSeed(getGraphScopeFolderPath(sourceTab));
    };
    addTabSeeds(tab);
    addTabSeeds(sourceTab);
    addSeed(activeFolderPath);
    return seeds;
  }

  function getTabContainingFolderPath(tab) {
    return getTabPathParentFolder(tab?.sourceFilePath || tab?.openedSource?.path || "");
  }

  function canOpenTabProjectFolder(tab) {
    if (!tab || !isNeutralinoRuntime?.() || typeof openFolderTreeFromNeutralinoPath !== "function") return false;
    return getTabContainingFolderPath(tab) || getTabProjectFolderSeeds(tab).length > 0;
  }

  function getTreeButtonForTab(tab) {
    if (!tab || typeof findFolderTreeFileButtonForTab !== "function") return null;
    return findFolderTreeFileButtonForTab(tab);
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

  function getTabTreeRevealPathCandidates(tab) {
    const authoritativeCandidates = getTabTreeAuthoritativePathCandidates(tab);
    if (authoritativeCandidates.length) return authoritativeCandidates;
    if (!tab || tab.type === "graph") return [];
    return [
      tab.sourceFileName,
      tab.openedSource?.name
    ].filter(Boolean);
  }

  function canRevealApiClientTabInTreeView(tab) {
    return tab?.type === "api-client" && !!String(tab.apiClient?.savedRequestId || "").trim() && typeof app.modules?.apiClient?.revealSavedRequest === "function";
  }

  function canRevealTabInTreeView(tab) {
    if (canRevealApiClientTabInTreeView(tab)) return true;
    if (getTreeButtonForTab(tab)) return true;
    return !!activeFolderPath && getTabTreeRevealPathCandidates(tab).length > 0;
  }

  async function revealTabInTreeView(tab) {
    if (tab?.type === "api-client") {
      const revealed = await app.modules?.apiClient?.revealSavedRequest?.(tab.apiClient?.savedRequestId);
      if (!revealed) alert("Unable to find this API Client request in the tree view.");
      return revealed === true;
    }
    let treeButton = null;
    if (typeof revealFolderTreeFileByPath === "function") {
      const candidates = getTabTreeRevealPathCandidates(tab);
      const revealOptions = { allowFileNameOnlyMatch: !hasTabTreeAuthoritativePath(tab) };
      for (const candidatePath of candidates) {
        treeButton = await revealFolderTreeFileByPath(candidatePath, revealOptions);
        if (treeButton) break;
      }
    }
    if (!treeButton && hasTabTreeAuthoritativePath(tab)) {
      alert("Unable to find this tab's file in the tree view.");
      return false;
    }
    if (!treeButton) treeButton = getTreeButtonForTab(tab);
    if (!treeButton) {
      alert("Unable to find this tab's file in the tree view.");
      return false;
    }

    if (typeof setSidebarVisible === "function") setSidebarVisible(true);
    if (folderTreeRoot) {
      folderTreeRoot.querySelectorAll(".folder-tree-file.auto-selected").forEach(function(button) {
        button.classList.remove("auto-selected");
        button.removeAttribute("aria-current");
      });
    }

    treeButton.closest("details")?.querySelectorAll("details").forEach(function(details) {
      details.open = true;
    });
    let ancestor = treeButton.parentElement;
    while (ancestor) {
      if (ancestor.tagName === "DETAILS") ancestor.open = true;
      ancestor = ancestor.parentElement;
    }

    treeButton.classList.add("auto-selected");
    treeButton.setAttribute("aria-current", "page");
    treeButton.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    treeButton.focus({ preventScroll: true });
    return true;
  }

  async function resolveTabProjectFolderPath(tab) {
    return (await resolveTabProjectFolderTarget(tab)).path;
  }

  async function resolveTabProjectFolderTarget(tab) {
    const fallbackFolder = getTabContainingFolderPath(tab);
    if (!isProjectDerivedTab(tab)) {
      return { path: fallbackFolder, isContainingFolder: true };
    }
    if (typeof findGeneratedProjectFolderFromPath === "function") {
      const seeds = getTabProjectFolderSeeds(tab);
      for (const seedPath of seeds) {
        const projectFolder = await findGeneratedProjectFolderFromPath(seedPath);
        if (projectFolder) return { path: projectFolder, isContainingFolder: false };
      }
    }
    return { path: fallbackFolder, isContainingFolder: true };
  }

  async function openTabProjectFolder(tab) {
    if (!tab || !isNeutralinoRuntime?.() || typeof openFolderTreeFromNeutralinoPath !== "function") {
      alert("Opening a tab folder is available only in the desktop app for files opened from disk.");
      return;
    }
    try {
      const target = await resolveTabProjectFolderTarget(tab);
      const folderPath = target.path;
      if (!folderPath) {
        alert("No folder path is available for this tab.");
        return;
      }
      if (normalizeTabFilesystemPath(folderPath).toLowerCase() === normalizeTabFilesystemPath(activeFolderPath).toLowerCase()) {
        return;
      }
      await openFolderTreeFromNeutralinoPath(folderPath, { includeParentNavigation: target.isContainingFolder === true });
    } catch (error) {
      console.error("Failed to open tab project folder:", error);
      alert("Unable to open this tab's project folder.");
    }
  }

  function updateTabContextMenuActionStates(menu, tab, targetTabIds) {
    const hasTargetTab = !!tab && tabs.some(function(openTab) { return openTab.id === tab.id; });
    const contextTargetIds = getOrderedExistingTabIds(targetTabIds && targetTabIds.length ? targetTabIds : (tab ? [tab.id] : []));
    const hasSingleContextTarget = contextTargetIds.length === 1;
    const canCompareContextTargets = contextTargetIds.length === 2 && contextTargetIds.every(function(tabId) {
      return !!getTabCompareSource(tabs.find(function(openTab) { return openTab.id === tabId; }));
    });
    setTabContextMenuActionEnabled(menu, 'rename', hasTargetTab && hasSingleContextTarget);
    setTabContextMenuActionEnabled(menu, 'duplicate', hasTargetTab && hasSingleContextTarget && tab?.type !== "regex-tester");
    setTabContextMenuActionEnabled(menu, 'compare', canCompareContextTargets);
    setTabContextMenuActionEnabled(menu, 'reveal-in-tree-view', hasTargetTab && hasSingleContextTarget && canRevealTabInTreeView(tab));
    setTabContextMenuActionEnabled(menu, 'open-project-folder', hasTargetTab && hasSingleContextTarget && canOpenTabProjectFolder(tab));
    setTabContextMenuActionEnabled(menu, 'reopen-closed', deps.closedTabHistory?.hasEntries?.() === true);
    setTabContextMenuActionEnabled(menu, 'close', contextTargetIds.length > 0);
    setTabContextMenuActionEnabled(menu, 'close-others', hasTargetTab && contextTargetIds.length > 0 && contextTargetIds.length < tabs.length);
    setTabContextMenuActionEnabled(menu, 'close-unchanged', tabs.some(function(openTab) { return !tabHasPendingChanges(openTab); }));
    setTabContextMenuActionEnabled(menu, 'close-all', tabs.length > 0);
  }

  function showTabContextMenu(event, tab, options) {
    if (!tab) return;
    event.preventDefault();
    event.stopPropagation();
    hideSidebarContextMenus();
    hideTabContextMenu();

    tabContextTargetId = tab.id;
    tabContextTargetIds = getTabContextTargetIds(tab, options || {});
    tabContextCloseMobileMenuOnAction = !!(options && options.closeMobileMenuOnAction);
    const menu = ensureTabContextMenu();
    const isGraphTab = tab.type === 'graph';
    menu.querySelectorAll('[data-action="rename"], [data-action="duplicate"]').forEach(function(button) {
      button.classList.toggle('hidden', isGraphTab);
    });
    const separator = menu.querySelector('.graph-context-menu-separator');
    if (separator) separator.classList.toggle('hidden', isGraphTab);
    updateTabContextMenuActionStates(menu, tab, tabContextTargetIds);
    const compareAction = menu.querySelector('[data-action="compare"]');
    if (compareAction) compareAction.classList.toggle('hidden', compareAction.disabled);
    tabParseAsMenu?.update?.(
      normalizeTabLanguageOverride(tab.parseAsLanguageId),
      tabContextTargetIds.length === 1 && isParseAsEligibleTab(tab)
    );
    menu.classList.remove('hidden');
    positionTabContextMenu(menu, event);
  }

  function hideTabContextMenu() {
    if (tabContextMenu) tabContextMenu.classList.add('hidden');
    tabContextTargetId = null;
    tabContextTargetIds = [];
    tabContextCloseMobileMenuOnAction = false;
  }

  // Close any open tab context menu when clicking elsewhere in the document
  document.addEventListener('click', function() {
    hideTabContextMenu();
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') hideTabContextMenu();
  });

  window.addEventListener('blur', hideTabContextMenu);

  function getActiveDocumentViewModeForSave(tab) {
    if (!tab) return currentViewMode || "split";
    if (tab.type === "graph" || tab.type === "large-file" || tab.type === "file-preview" || tab.type === "image-editor" || tab.type === "diagram-editor" || tab.type === "hex-editor" || tab.type === "file-compare" || tab.type === "api-client" || tab.type === "openapi-editor" || tab.type === "openapi-preview" || tab.type === "soap-client" || tab.type === "regex-tester" || tab.type === "base64-tool" || tab.type === "certificate-decoder" || tab.type === "jwt-tool" || tab.type === "json-yaml-tool" || tab.type === "jsonpath-tool" || tab.type === "xml-tree-grid" || tab.type === "uuid-tool" || tab.type === "qr-tool" || tab.type === "hash-tool" || tab.type === "json-array-table-tool" || tab.type === "text-escape-tool") return "preview";
    if (!isPreviewableDocumentTab(tab)) return "editor";
    const activeContentContainer = deps.contentContainer || document.querySelector(".content-container");
    if (activeContentContainer && activeContentContainer.classList) {
      if (activeContentContainer.classList.contains("view-editor-only")) return "editor";
      if (activeContentContainer.classList.contains("view-preview-only")) return "preview";
      if (activeContentContainer.classList.contains("view-split")) return "split";
    }
    return tab.viewMode || currentViewMode || loadGlobalState().viewMode || "split";
  }

  function saveCurrentTabState() {
    const options = arguments[0] || {};
    if (options.lifecycle && !persistCurrentSessionOnLifecycle) {
      if (typeof appDebugLog === "function") {
        void appDebugLog("debug", "[tabs-session] Skipped lifecycle tab save because current startup session is temporary");
      }
      return;
    }
    const tab = tabs.find(function(t) { return t.id === activeTabId; });
    if (!tab) {
      if (typeof appDebugLog === "function") {
        void appDebugLog("debug", "[tabs-session] Skipped tab save because no active tab was found", {
          lifecycle: !!options.lifecycle,
          activeTabId
        });
      }
      return;
    }
    if (tab.type === "graph" || tab.type === "large-file" || tab.type === "file-preview" || tab.type === "image-editor" || tab.type === "diagram-editor" || tab.type === "hex-editor" || tab.type === "file-compare" || tab.type === "api-client" || tab.type === "openapi-editor" || tab.type === "openapi-preview" || tab.type === "soap-client" || tab.type === "regex-tester" || tab.type === "base64-tool" || tab.type === "certificate-decoder" || tab.type === "jwt-tool" || tab.type === "json-yaml-tool" || tab.type === "jsonpath-tool" || tab.type === "xml-tree-grid" || tab.type === "uuid-tool" || tab.type === "qr-tool" || tab.type === "hash-tool" || tab.type === "json-array-table-tool" || tab.type === "text-escape-tool") {
      if (typeof appDebugLog === "function") {
        void appDebugLog("debug", "[tabs-session] Skipped markdown state save for active non-editor tab", {
          lifecycle: !!options.lifecycle,
          activeTabId
        });
      }
      return;
    }
    const activeEditorSelection = activeEditorCommands?.getActiveEditorSelection?.() || {};
    const activeEditorScroll = activeEditorCommands?.getActiveEditorScroll?.() || {};
    const editorState = editorViewManager?.getActiveEditorView?.()?.tabId === tab.id
      ? {
          content: getActiveEditorContent(),
          scrollPos: activeEditorScroll.top || 0,
          selectionStart: activeEditorSelection.start || 0,
          selectionEnd: activeEditorSelection.end || activeEditorSelection.start || 0
        }
      : null;
    const nextViewMode = getActiveDocumentViewModeForSave(tab);
    const nextContent = editorState ? editorState.content : getActiveEditorContent();
    const nextScrollPos = editorState ? editorState.scrollPos : markdownEditor.scrollTop;
    const hasSessionChange = tab.content !== nextContent ||
      tab.scrollPos !== nextScrollPos ||
      tab.viewMode !== nextViewMode;
    const previousViewMode = tab.viewMode || null;
    if (!persistCurrentSessionOnLifecycle && !options.lifecycle && !hasSessionChange) {
      if (typeof appDebugLog === "function") {
        void appDebugLog("debug", "[tabs-session] Skipped no-op tab save for temporary startup session", {
          activeTabId,
          title: tab.title || null
        });
      }
      return;
    }
    tab.content = nextContent;
    tab.scrollPos = nextScrollPos;
    if (editorState) {
      tab.selectionStart = editorState.selectionStart;
      tab.selectionEnd = editorState.selectionEnd;
    }
    tab.viewMode = nextViewMode;
    if (hasSessionChange) persistCurrentSessionOnLifecycle = true;
    if (typeof appDebugLog === "function") {
      void appDebugLog("debug", "[tabs-session] Saving current tab state", {
        lifecycle: !!options.lifecycle,
        activeTabId,
        title: tab.title || null,
        hasSessionChange,
        previousViewMode,
        nextViewMode,
        currentViewMode: currentViewMode || null,
        persistCurrentSessionOnLifecycle
      });
    }
    saveTabsToStorage(tabs);
  }

  function setActiveMarkdownTabViewMode(mode) {
    const tab = getActiveMarkdownTab();
    if (!tab) return;
    const nextViewMode = isPreviewableDocumentTab(tab) ? getAllowedViewModeForActiveTab(mode) : "editor";
    const previousViewMode = tab.viewMode || null;
    if (tab.viewMode !== nextViewMode) {
      tab.viewMode = nextViewMode;
      persistCurrentSessionOnLifecycle = true;
    }
    if (typeof appDebugLog === "function") {
      void appDebugLog("info", "[tabs-session] Updated active tab view mode", {
        activeTabId,
        title: tab.title || null,
        previousViewMode,
        viewMode: nextViewMode,
        changed: previousViewMode !== nextViewMode
      });
    }
    saveTabsToStorage(tabs);
  }

  /** Save the split-view separator position for the active editor tab. */
  function setActiveTabSplitViewWidthPercent(editorWidthPercent) {
    const tab = getActiveMarkdownTab();
    const nextWidth = Number(editorWidthPercent);
    if (!tab || !Number.isFinite(nextWidth)) return;
    tab.splitViewEditorWidthPercent = nextWidth;
    persistCurrentSessionOnLifecycle = true;
    saveTabsToStorage(tabs);
  }

  function markCurrentTabSessionDirty() {
    persistCurrentSessionOnLifecycle = true;
    if (typeof appDebugLog === "function") {
      void appDebugLog("debug", "[tabs-session] Marked current tab session dirty for lifecycle persistence", {
        activeTabId
      });
    }
  }

  function getActiveMarkdownTab() {
    const tab = tabs.find(function(t) { return t.id === activeTabId; });
    if (!tab || tab.type === "graph" || tab.type === "large-file" || tab.type === "file-preview" || tab.type === "image-editor" || tab.type === "diagram-editor" || tab.type === "hex-editor" || tab.type === "file-compare" || tab.type === "api-client" || tab.type === "openapi-editor" || tab.type === "openapi-preview" || tab.type === "soap-client" || tab.type === "regex-tester" || tab.type === "base64-tool" || tab.type === "certificate-decoder" || tab.type === "jwt-tool" || tab.type === "json-yaml-tool" || tab.type === "jsonpath-tool" || tab.type === "xml-tree-grid" || tab.type === "uuid-tool" || tab.type === "qr-tool" || tab.type === "hash-tool" || tab.type === "json-array-table-tool" || tab.type === "text-escape-tool") return null;
    return tab;
  }

  function canReadTabFromDisk(tab) {
    if (!tab || tab.type === "graph" || tab.type === "hex-editor" || tab.type === "file-compare" || tab.type === "api-client" || tab.type === "openapi-editor" || tab.type === "openapi-preview" || tab.type === "soap-client" || tab.type === "regex-tester" || tab.type === "base64-tool" || tab.type === "certificate-decoder" || tab.type === "jwt-tool" || tab.type === "json-yaml-tool" || tab.type === "jsonpath-tool" || tab.type === "xml-tree-grid" || tab.type === "uuid-tool" || tab.type === "qr-tool" || tab.type === "hash-tool" || tab.type === "json-array-table-tool" || tab.type === "text-escape-tool") return false;
    if (isNeutralinoRuntime() && tab.sourceFilePath && Neutralino?.filesystem?.readFile) return true;
    if (tab.sourceFileHandle && typeof tab.sourceFileHandle.getFile === "function") return true;
    return false;
  }

  function canReloadActiveTabFromDisk() {
    return canReadTabFromDisk(getActiveTab());
  }

  async function readTabTextFromDisk(tab) {
    if (!canReadTabFromDisk(tab)) {
      throw new Error("The current tab is not backed by a readable disk file.");
    }
    if (isNeutralinoRuntime() && tab.sourceFilePath && Neutralino?.filesystem?.readFile) {
      return Neutralino.filesystem.readFile(tab.sourceFilePath);
    }
    const file = await tab.sourceFileHandle.getFile();
    return file.text();
  }

  function updateTabSourceContent(tab, content) {
    if (tab?.largeFileSource) tab.largeFileSource.content = content;
    if (tab?.openedSource) tab.openedSource = normalizeOpenedSource(tab.openedSource);
  }

  async function reloadActiveTabFromDisk() {
    const tab = getActiveTab();
    if (!tab || !canReadTabFromDisk(tab)) {
      updateSaveCurrentFileButtons();
      return false;
    }

    try {
      if (tab.type === "file-preview") {
        tab.filePreviewSource = {
          ...(tab.filePreviewSource || {}),
          path: tab.sourceFilePath || tab.filePreviewSource?.path || null,
          handle: tab.sourceFileHandle || tab.filePreviewSource?.handle || null,
          name: tab.sourceFileName || tab.filePreviewSource?.name || tab.title || "File preview",
          file: null,
          size: null
        };
        destroyManagedTabView(tab.id);
        activateSidebarTab(tab);
      } else if (tab.type === "large-file") {
        const diskContent = normalizeEditorContent(await readTabTextFromDisk(tab));
        tab.largeFileSource = {
          ...(tab.largeFileSource || {}),
          content: diskContent,
          path: tab.sourceFilePath || tab.largeFileSource?.path || null,
          handle: tab.sourceFileHandle || tab.largeFileSource?.handle || null,
          name: tab.sourceFileName || tab.largeFileSource?.name || tab.title || "Large file",
          size: diskContent.length
        };
        tab.largeFileDocumentStats = null;
        tab.largeFileViewState = null;
        destroyManagedTabView(tab.id);
        activateSidebarTab(tab);
      } else {
        const diskContent = normalizeEditorContent(await readTabTextFromDisk(tab));
        tab.content = diskContent;
        tab.savedContent = diskContent;
        tab.scrollPos = 0;
        tab.selectionStart = 0;
        tab.selectionEnd = 0;
        updateTabSourceContent(tab, diskContent);
        setActiveEditorContent(diskContent);
        activateEditableDocumentTab(tab, { forceRender: true });
        saveTabsToStorage(tabs);
        renderTabBar(tabs, activeTabId);
        syncFolderTreeSelectionToActiveTab();
      }
      persistCurrentSessionOnLifecycle = true;
      updateSaveCurrentFileButtons();
      return true;
    } catch (error) {
      console.error("Failed to reload current tab from disk:", error);
      alert("Unable to reload the current tab from disk.");
      updateSaveCurrentFileButtons();
      return false;
    }
  }

  function topologyTabNeedsInitialSave(tab) {
    return tab?.type === "kubernetes-topology" && !(tab.sourceFileHandle || (isNeutralinoRuntime() && tab.sourceFilePath));
  }

  function activeTabHasUnsavedChanges() {
    const activeTab = getActiveTab();
    if (activeTab?.type === "image-editor") return tabHasPendingChanges(activeTab);
    if (activeTab?.type === "hex-editor") return tabHasPendingChanges(activeTab);
    if (activeTab?.type === "diagram-editor") return tabHasPendingChanges(activeTab);
    if (activeTab?.type === "kubernetes-topology") return topologyTabNeedsInitialSave(activeTab) || tabHasPendingChanges(activeTab);
    if (activeTab?.type === "openapi-editor") return tabHasPendingChanges(activeTab, deps.openApiEditor?.getTabContent?.(activeTab) || activeTab.content);
    const tab = getActiveMarkdownTab();
    const activeContent = getActiveEditorContent();
    return tabHasPendingChanges(tab, activeContent);
  }

  function getUnsavedTabs() {
    return tabs.filter(function(tab) {
      if (!tab) return false;
      if (tab.type === "openapi-editor") return tabHasPendingChanges(tab, deps.openApiEditor?.getTabContent?.(tab) || tab.content);
      if (tab.type === "file-preview" || tab.type === "file-compare" || tab.type === "api-client" || tab.type === "soap-client" || tab.type === "regex-tester" || tab.type === "base64-tool" || tab.type === "certificate-decoder" || tab.type === "jwt-tool" || tab.type === "json-yaml-tool" || tab.type === "jsonpath-tool" || tab.type === "xml-tree-grid" || tab.type === "uuid-tool" || tab.type === "qr-tool" || tab.type === "hash-tool" || tab.type === "json-array-table-tool" || tab.type === "text-escape-tool") return false;
      if (tab.type === "kubernetes-topology") return topologyTabNeedsInitialSave(tab) || tabHasPendingChanges(tab);
      if (tab.type === "graph" || tab.type === "large-file" || tab.type === "image-editor" || tab.type === "diagram-editor" || tab.type === "hex-editor") return tabHasPendingChanges(tab);
      const currentContent = tab.id === activeTabId ? getActiveEditorContent() : tab.content;
      return tabHasPendingChanges(tab, currentContent);
    });
  }

  const confirmDiscardUnsavedChangesBeforeExit = unsavedChanges.bindWindowExitGuards({
    getUnsavedTabs
  });

  function updateSaveCurrentFileButtons() {
    const graphTab = getActiveGraphTab();
    const tab = getActiveMarkdownTab();
    const activeTab = tabs.find(function(candidate) { return candidate.id === activeTabId; }) || null;
    const canSaveAsFile = !!activeTab && activeTab.type !== "graph" && activeTab.type !== "file-preview" && activeTab.type !== "file-compare" && activeTab.type !== "api-client" && activeTab.type !== "openapi-preview" && activeTab.type !== "regex-tester" && activeTab.type !== "base64-tool" && activeTab.type !== "certificate-decoder" && activeTab.type !== "jwt-tool" && activeTab.type !== "json-yaml-tool" && activeTab.type !== "jsonpath-tool" && activeTab.type !== "xml-tree-grid";
    const hasUnsavedChanges = activeTabHasUnsavedChanges();
    const isImageEditor = activeTab?.type === "image-editor";
    const isDiagramEditor = activeTab?.type === "diagram-editor";
    const isKubernetesTopology = activeTab?.type === "kubernetes-topology";
    const isOpenApiEditor = activeTab?.type === "openapi-editor";
    const hasWritableSource = isImageEditor || isDiagramEditor || isKubernetesTopology
      ? !!(activeTab.sourceFileHandle || (isNeutralinoRuntime() && activeTab.sourceFilePath))
      : !!((isOpenApiEditor ? activeTab : tab) && ((isOpenApiEditor ? activeTab : tab).sourceFileHandle || (isNeutralinoRuntime() && (isOpenApiEditor ? activeTab : tab).sourceFilePath)));
    const title = graphTab
      ? (graphTab.graphViewKind === "health-report"
        ? "Save the graph file that backs this health report."
        : "Save layout, groups, filters, hidden points, tags, and connections. File contents are not included.")
      : (hasUnsavedChanges
        ? (hasWritableSource ? "Save changes to current file" : (isImageEditor ? "Save image as a new file" : (isDiagramEditor ? "Save diagram as a new file" : (isKubernetesTopology ? "Save topology as a new file" : isOpenApiEditor ? "Save OpenAPI document as a new file" : "Save changes as Markdown"))))
        : "No changes to save");
    const label = graphTab ? (graphTab.graphViewKind === "health-report" ? "Save Graph Report" : "Save Graph View") : (isImageEditor ? "Save Image" : (isDiagramEditor ? "Save Diagram" : (isKubernetesTopology ? "Save Topology" : isOpenApiEditor ? "Save OpenAPI" : "Save Changes")));

    document.querySelectorAll(".save-current-file-button").forEach(function(button) {
      button.disabled = graphTab ? false : !hasUnsavedChanges;
      button.title = title;
      button.setAttribute("aria-label", title);
      const icon = button.querySelector("i");
      button.textContent = "";
      if (icon) button.append(icon, document.createTextNode(` ${label}`));
      else button.textContent = label;
    });

    document.querySelectorAll(".save-as-file-button").forEach(function(button) {
      button.disabled = !canSaveAsFile;
      button.title = canSaveAsFile ? "Save the current file tab to a new file" : "Open a file tab to use Save As";
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-disabled", canSaveAsFile ? "false" : "true");
    });

    const unsavedCount = getUnsavedTabs().length;
    const saveAllTitle = unsavedCount
      ? `Save all unsaved changes in ${unsavedCount} tab${unsavedCount === 1 ? "" : "s"}`
      : "No changes to save";
    document.querySelectorAll(".save-all-files-button").forEach(function(button) {
      button.disabled = unsavedCount === 0;
      button.title = saveAllTitle;
      button.setAttribute("aria-label", saveAllTitle);
    });

    const hasOpenTabs = tabs.length > 0;
    const closeAllTitle = hasOpenTabs ? "Close all tabs" : "No open tabs to close";
    document.querySelectorAll("#tab-reset-btn, #mobile-tab-reset-btn").forEach(function(button) {
      button.disabled = !hasOpenTabs;
      button.title = closeAllTitle;
      button.setAttribute("aria-label", closeAllTitle);
      button.setAttribute("aria-disabled", hasOpenTabs ? "false" : "true");
    });
    const canReload = canReloadActiveTabFromDisk();
    const reloadTitle = canReload
      ? "Reload the current tab from disk (Ctrl+R)"
      : "Open a disk-backed file tab to reload from disk";
    document.querySelectorAll(".reload-current-file-button").forEach(function(button) {
      button.disabled = !canReload;
      button.title = reloadTitle;
      button.setAttribute("aria-label", reloadTitle);
      button.setAttribute("aria-disabled", canReload ? "false" : "true");
    });
  }

  function activateTabBeforeSaveDialog(tab) {
    if (!tab || tab.id === activeTabId) return;
    switchTab(tab.id);
  }

  async function saveChangedTab(tab, options = {}) {
    if (!tab) return false;
    if (tab.type === "image-editor") {
      if (!tabHasPendingChanges(tab)) return true;
      return await deps.imageEditor?.saveTab?.(tab) === true;
    }
    if (tab.type === "diagram-editor") {
      if (!tabHasPendingChanges(tab)) return true;
      return await deps.diagramEditor?.saveTab?.(tab) === true;
    }
    if (tab.type === "hex-editor") {
      if (!tabHasPendingChanges(tab)) return true;
      return await deps.hexEditor?.saveHexEditorTab?.(tab, { saveAs: options.activateSaveDialog === true && !tab.sourceFilePath }) === true;
    }
    if (tab.type === "graph") {
      if (!tabHasPendingChanges(tab)) return true;
      if (await saveGraphTabToSource(tab)) return true;
      if (options.activateSaveDialog === true) activateTabBeforeSaveDialog(tab);
      return saveGraphTabWithSaveDialog(tab);
    }
    if (tab.type === "kubernetes-topology") {
      if (!topologyTabNeedsInitialSave(tab) && !tabHasPendingChanges(tab) && options.activateSaveDialog !== true) return true;
      if (await deps.kubernetesTopologyDocument?.saveKubernetesTopologyTabToSource?.(tab)) return true;
      if (options.activateSaveDialog === true) activateTabBeforeSaveDialog(tab);
      return await deps.kubernetesTopologyDocument?.saveKubernetesTopologyTabWithSaveDialog?.(tab) === true;
    }
    if (tab.type === "openapi-editor") {
      const content = deps.openApiEditor?.getTabContent?.(tab) || tab.content;
      if (!tabHasPendingChanges(tab, content)) return true;
      const normalizedContent = deps.openApiEditor?.setTabContent?.(tab, content) || content;
      if (await saveMarkdownTabToSource(tab, { content: normalizedContent })) return true;
      if (options.activateSaveDialog === true) activateTabBeforeSaveDialog(tab);
      return saveMarkdownTabWithSaveDialog(tab, { content: normalizedContent });
    }
    if (tab.type === "large-file" || tab.type === "file-preview" || tab.type === "file-compare" || tab.type === "api-client" || tab.type === "soap-client" || tab.type === "regex-tester" || tab.type === "base64-tool" || tab.type === "certificate-decoder" || tab.type === "jwt-tool" || tab.type === "json-yaml-tool" || tab.type === "jsonpath-tool" || tab.type === "xml-tree-grid" || tab.type === "uuid-tool" || tab.type === "qr-tool" || tab.type === "hash-tool" || tab.type === "json-array-table-tool" || tab.type === "text-escape-tool") return true;

    const content = getMarkdownTabContentForSave(tab);
    if (!tabHasPendingChanges(tab, content)) return true;
    if (await saveMarkdownTabToSource(tab)) return true;
    if (options.activateSaveDialog === true) activateTabBeforeSaveDialog(tab);
    return saveMarkdownTabWithSaveDialog(tab);
  }
  async function saveAllChangedTabs() {
    saveCurrentTabState();
    const changedTabs = getUnsavedTabs();
    if (!changedTabs.length) {
      updateSaveCurrentFileButtons();
      return;
    }

    const failedTabs = [];
    let wasCanceled = false;

    for (const tab of changedTabs) {
      try {
        switchTab(tab.id);
        await saveCurrentFileIfChanged();
        const currentTab = tabs.find(function(openTab) { return openTab.id === tab.id; }) || tab;
        if (tabHasPendingChanges(currentTab)) {
          wasCanceled = true;
          break;
        }
      } catch (error) {
        if (error && error.name === "AbortError") {
          wasCanceled = true;
          break;
        }
        console.error("Failed to save changed tab:", error);
        failedTabs.push(getTabDisplayName(tab));
      }
    }

    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();

    if (failedTabs.length) {
      alert("Unable to save: " + failedTabs.join(", "));
    } else if (wasCanceled && getUnsavedTabs().length) {
      console.info("Save All canceled before all changed tabs were saved.");
    }
  }

  async function saveCurrentFileIfChanged() {
    const activeTab = getActiveTab();
    if (activeTab?.type === "image-editor") {
      await deps.imageEditor?.saveTab?.(activeTab);
      updateSaveCurrentFileButtons();
      return;
    }
    if (activeTab?.type === "diagram-editor") {
      await deps.diagramEditor?.saveTab?.(activeTab);
      updateSaveCurrentFileButtons();
      return;
    }
    if (activeTab?.type === "hex-editor") {
      await deps.hexEditor?.saveHexEditorTab?.(activeTab);
      updateSaveCurrentFileButtons();
      return;
    }

    if (activeTab?.type === "api-client") {
      await app.modules?.apiClient?.saveActiveRequest?.();
      updateSaveCurrentFileButtons();
      return;
    }

    const activeGraphTab = getActiveGraphTab();
    if (activeGraphTab) {
      if (!(await saveActiveGraphToSource())) {
        await saveActiveGraphWithSaveDialog();
      }
      updateSaveCurrentFileButtons();
      return;
    }

    if (activeTab?.type === "kubernetes-topology") {
      await saveChangedTab(activeTab, { activateSaveDialog: true });
      updateSaveCurrentFileButtons();
      return;
    }

    if (activeTab?.type === "openapi-editor") {
      const saved = await saveChangedTab(activeTab, { activateSaveDialog: true });
      if (saved) await deps.openApiEditor?.validateTab?.(activeTab, { publishProblems: true });
      updateSaveCurrentFileButtons();
      return;
    }

    if (activeTab?.generatedHtmlSave && typeof saveGeneratedHtmlTabWithSaveDialog === "function") {
      await saveGeneratedHtmlTabWithSaveDialog(activeTab);
      updateSaveCurrentFileButtons();
      return;
    }
    if (!activeTabHasUnsavedChanges()) {
      updateSaveCurrentFileButtons();
      return;
    }

    const tab = getActiveMarkdownTab();
    if (!tab) return;
    if (!(await saveMarkdownTabToSource(tab))) {
      await saveMarkdownTabWithSaveDialog(tab);
    }
    updateSaveCurrentFileButtons();
  }

  function restoreViewMode(mode, options = {}) {
    currentViewMode = null;
    setViewMode(getAllowedViewModeForActiveTab(mode || loadGlobalState().viewMode || 'split'), false, options);
  }

  function setNoOpenTabsMode(enabled) {
    const container = document.querySelector(".content-container");
    if (container) {
      container.classList.toggle("no-open-tabs", !!enabled);
      if (enabled) {
        container.classList.remove("markdown-tab-active", "editor-only-tab-active");
      } else {
        const activeTab = getActiveTab();
        container.classList.toggle("markdown-tab-active", isMarkdownDocumentTab(activeTab));
        container.classList.toggle("editor-only-tab-active", !!(activeTab && activeTab.type !== "graph" && !isPreviewableDocumentTab(activeTab)));
      }
    }
    if (markdownEditor) {
      markdownEditor.disabled = !!enabled;
      markdownEditor.setAttribute("aria-disabled", enabled ? "true" : "false");
    }
  }

  function activateManagedTabView(tab) {
    if (tabViewManager && typeof tabViewManager.activateTabView === "function") {
      tabViewManager.activateTabView(tab);
    }
  }

  function getActiveEditorViewForTab(tab) {
    const view = editorViewManager?.getActiveEditorView?.();
    return view && (!tab || view.tabId === tab.id) ? view : null;
  }

  function hasPendingMermaidPreview(editorView) {
    return typeof global.mermaid?.init === "function" &&
      !!editorView?.preview?.querySelector?.(".mermaid:not([data-processed])");
  }

  function activateEditableDocumentTab(tab, options = {}) {
    if (!tab) return;
    const perf = createActivationPerfSession(tab, "activate editable tab");
    perf.mark("start", { initialized: options.forceRender === true ? "forced" : "auto" });
    activateDocumentTabChrome();
    perf.mark("document chrome");
    setNoOpenTabsMode(false);
    perf.mark("open-tabs mode");
    const editorView = getActiveEditorViewForTab(tab);
    const shouldInitializeRender = !editorView || editorView.activatedExisting !== true || options.forceRender === true;
    const shouldDeferLargeSplit = isLargeSplitEditableTab(tab);
    const activationViewMode = shouldDeferLargeSplit ? "editor" : tab.viewMode;
    const shouldRetryPendingMermaid = !shouldInitializeRender &&
      activationViewMode !== "editor" &&
      hasPendingMermaidPreview(editorView);
    restoreViewMode(activationViewMode, { skipRender: shouldDeferLargeSplit || !shouldInitializeRender });
    perf.mark("restore view mode", {
      restoredViewMode: tab.viewMode || null,
      activationViewMode,
      shouldInitializeRender,
      deferredLargeSplit: shouldDeferLargeSplit
    });
    if (typeof applySyntaxHighlightColorsForActiveLanguage === "function") applySyntaxHighlightColorsForActiveLanguage();
    perf.mark("apply syntax colors");
    app.services?.scrollSync?.refreshActiveScrollTargets?.();
    perf.mark("refresh scroll sync");
    if (typeof refreshActiveResizeTarget === "function") refreshActiveResizeTarget();
    perf.mark("refresh resize target");
    if (typeof refreshEditorLineNumberResizeObserver === "function") refreshEditorLineNumberResizeObserver();
    perf.mark("refresh resize observer");
    app.services?.codeMirrorEditor?.setLanguageForActivePath?.();
    perf.mark("set CodeMirror language");
    if (shouldInitializeRender && !shouldDeferLargeSplit) {
      renderEditorSyntaxHighlights();
      perf.mark("render editor syntax");
      renderMarkdown({
        reason: "tab-activation",
        deferHeavyEnhancements: isLargeEditableTab(tab),
        reuseCache: true
      });
      perf.mark("render markdown preview");
      requestAnimationFrame(function() {
        markdownEditor.scrollTop = tab.scrollPos || 0;
        syncEditorSyntaxHighlightScroll();
      });
    } else if (shouldInitializeRender) {
      renderEditorSyntaxHighlights();
      perf.mark("render editor syntax");
    } else if (shouldRetryPendingMermaid) {
      renderMarkdown({
        reason: "tab-reactivation-pending-mermaid",
        reuseCache: false
      });
      perf.mark("render pending Mermaid preview");
    } else {
      if (typeof updateEditorLineNumbers === "function") updateEditorLineNumbers();
      perf.mark("update line numbers");
      if (typeof updateEditorSelectionHighlights === "function") updateEditorSelectionHighlights();
      perf.mark("update selection highlights");
      if (typeof updateStatusLine === "function") updateStatusLine();
      perf.mark("update status line");
    }
    if (typeof updateDocumentStats === "function") updateDocumentStats();
    perf.mark("update document stats");
    const focusResult = focusEditableTab(tab, options);
    perf.mark(focusResult.focused ? "focus" : "focus skipped", focusResult);
    if (shouldDeferLargeSplit) {
      scheduleDeferredLargeSplitActivation(tab, shouldInitializeRender);
      perf.mark("schedule deferred split");
    }
    perf.finish({
      shouldInitializeRender,
      deferredLargeSplit: shouldDeferLargeSplit,
      editorEngine: app.services?.codeMirrorEditor?.isEnabled?.() ? "CodeMirror" : "textarea"
    });
  }

  function deactivateManagedTabView(tabId) {
    if (tabViewManager && typeof tabViewManager.deactivateTabView === "function") {
      tabViewManager.deactivateTabView(tabId);
    }
  }

  function destroyManagedTabView(tabId) {
    if (tabViewManager && typeof tabViewManager.destroyTabView === "function") {
      tabViewManager.destroyTabView(tabId);
    }
  }

  function refreshGraphModeNotices(tab) {
    if (typeof refreshGraphModeNoticesForTab === "function") {
      refreshGraphModeNoticesForTab(tab || null);
    }
  }

  function activateReusableGraphRender(tab) {
    return !!(app.services?.graphRenderer?.activateCachedGraphRender?.(tab));
  }

  function updateActiveGraphStatusLine(tab) {
    if (typeof updateStatusLine !== "function") return;
    updateStatusLine({
      visiblePointCount: Number.isFinite(tab?.visiblePointCount) ? tab.visiblePointCount : 0,
      graphEdgeCount: Number.isFinite(tab?.graphEdgeCount) ? tab.graphEdgeCount : 0,
      graphZoomScale: Number.isFinite(tab?.graphZoomScale) ? tab.graphZoomScale : undefined,
      selectedGraphNodeCount: Number.isFinite(tab?.selectedGraphNodeCount) ? tab.selectedGraphNodeCount : 0,
      graphClusterCount: Number.isFinite(tab?.graphClusterCount) ? tab.graphClusterCount : 0,
      graphCollapsedNodeCount: Number.isFinite(tab?.graphCollapsedNodeCount) ? tab.graphCollapsedNodeCount : 0
    });
  }

  function activateDocumentTabChrome() {
    setGraphViewMode(false);
    if (typeof hideInactiveGraphRenders === "function") {
      hideInactiveGraphRenders(null);
    } else {
      document.querySelectorAll(".graph-quick-action").forEach((node) => node.classList.add("hidden"));
    }
  }

  function switchTab(tabId) {
    const targetTab = tabs.find(function(t) { return t.id === tabId; });
    deps.closedTabHistory?.removeMatchingTab?.(targetTab);
    if (tabId === activeTabId) {
      const activeTab = targetTab;
      if (activeTab?.type !== "graph") activateDocumentTabChrome();
      deps.onActiveTabChanged?.(activeTab || null);
      return;
    }
    const perf = createActivationPerfSession(targetTab, "switch tab");
    setNoOpenTabsMode(false);
    perf.mark("set open-tabs mode");
    suspendActiveGraphRender();
    perf.mark("suspend graph render");
    saveCurrentTabState();
    perf.mark("save previous tab state");
    const previousActiveTabId = activeTabId;
    const tab = targetTab;
    if (!tab) return;
    deactivateManagedTabView(previousActiveTabId);
    perf.mark("deactivate previous tab view", { previousActiveTabId });
    activeTabId = tabId;
    saveActiveTabId(activeTabId);
    perf.mark("save active tab id");
    refreshGraphModeNotices(tab);
    activateManagedTabView(tab);
    perf.mark("activate managed tab view");
    if (typeof refreshActiveResizeTarget === "function") refreshActiveResizeTarget();
    perf.mark("refresh resize target");
    if (typeof refreshEditorLineNumberResizeObserver === "function") refreshEditorLineNumberResizeObserver();
    perf.mark("refresh resize observer");
    if (tab.type === "graph") {
      setViewMode('preview');
      perf.mark("set graph view mode");
      setGraphViewMode(true);
      perf.mark("enable graph chrome");
      updateActiveGraphStatusLine(tab);
      perf.mark("update graph status line");
      renderTabBar(tabs, activeTabId);
      perf.mark("render tab bar");
      syncFolderTreeSelectionToActiveTab();
      perf.mark("sync folder tree");
      deps.onActiveTabChanged?.(tab);
      perf.mark("try reusable graph render");
      if (activateReusableGraphRender(tab)) {
        perf.finish({ branch: "graph", reusedRender: true });
        return;
      }
      renderGraphView();
      perf.mark("render graph view");
      perf.finish({ branch: "graph", reusedRender: false });
      return;
    }
    if (tab.type === "large-file" || tab.type === "file-preview" || tab.type === "image-editor" || tab.type === "diagram-editor" || tab.type === "hex-editor" || tab.type === "file-compare" || tab.type === "api-client" || tab.type === "openapi-editor" || tab.type === "openapi-preview" || tab.type === "soap-client" || tab.type === "regex-tester" || tab.type === "base64-tool" || tab.type === "certificate-decoder" || tab.type === "jwt-tool" || tab.type === "json-yaml-tool" || tab.type === "jsonpath-tool" || tab.type === "xml-tree-grid" || tab.type === "uuid-tool" || tab.type === "qr-tool" || tab.type === "hash-tool" || tab.type === "json-array-table-tool" || tab.type === "text-escape-tool" || tab.type === "kubernetes-topology") {
      setActiveEditorContent("");
      perf.mark("clear active editor content");
      setViewMode("preview");
      perf.mark("set preview-only view mode");
      setGraphViewMode(false);
      perf.mark("disable graph chrome");
      renderTabBar(tabs, activeTabId);
      perf.mark("render tab bar");
      if (typeof updateDocumentStats === "function") updateDocumentStats();
      perf.mark("update document stats");
      syncFolderTreeSelectionToActiveTab();
      perf.mark("sync folder tree");
      deps.onActiveTabChanged?.(tab);
      perf.finish({ branch: tab.type });
      return;
    }
    activateEditableDocumentTab(tab);
    perf.mark("activate editable document");
    renderTabBar(tabs, activeTabId);
    perf.mark("render tab bar");
    syncFolderTreeSelectionToActiveTab();
    perf.mark("sync folder tree");
    deps.onActiveTabChanged?.(tab);
    perf.finish({ branch: "editable" });
  }



  function pinTemporaryTab(tabId) {
    const tab = tabs.find(function(t) { return t.id === tabId; });
    if (!tab || !tab.isTemporary) return;
    tab.isTemporary = false;
    // Promote preview tab to a normal tab without marking it dirty.
    tab.savedContent = tab.content;
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
  }

  function findTemporaryTab() {
    return tabs.find(function(t) { return !!t.isTemporary; }) || null;
  }

  function applySidebarFileMetadata(tab, sourceFile) {
    const isUnsupported = isUnsupportedSourceFile(sourceFile);
    tab.sourceFileName = sourceFile && sourceFile.name ? sourceFile.name : null;
    tab.sourceFileHandle = sourceFile && sourceFile.handle ? sourceFile.handle : null;
    tab.sourceFilePath = sourceFile && sourceFile.path ? sourceFile.path : null;
    setTabOpenedSource(tab, createOpenedSourceFromSourceFile(sourceFile, isUnsupported ? "unsupported" : null));
    tab.isUnsupportedFile = isUnsupported;
    tab.largeFileView = sourceFile && sourceFile.largeFileView ? { ...sourceFile.largeFileView } : null;
    tab.transformedForViewing = !!tab.largeFileView?.transformedForViewing;
    if (!isPreviewableSourceFile(sourceFile)) tab.viewMode = 'editor';
  }

  function isUnsupportedSourceFile(sourceFile) {
    if (!sourceFile) return false;
    if (sourceFile.isUnsupportedFile === true) return true;
    const path = sourceFile.path || sourceFile.name || sourceFile.file?.name || sourceFile.handle?.name || "";
    return !!path && isTextDocumentPath(path) && !isSupportedFolderTreeDocumentPath(path);
  }

  function isUnsupportedFileTab(tab) {
    if (!tab || tab.type === "graph" || tab.type === "hex-editor" || tab.type === "file-compare" || tab.type === "api-client" || tab.type === "openapi-editor" || tab.type === "openapi-preview" || tab.type === "soap-client" || tab.type === "regex-tester" || tab.type === "base64-tool" || tab.type === "certificate-decoder" || tab.type === "jwt-tool" || tab.type === "json-yaml-tool" || tab.type === "jsonpath-tool" || tab.type === "xml-tree-grid" || tab.type === "uuid-tool" || tab.type === "qr-tool" || tab.type === "hash-tool" || tab.type === "json-array-table-tool" || tab.type === "text-escape-tool" || tab.type === "kubernetes-topology") return false;
    if (tab.isUnsupportedFile === true) return true;
    const path = tab.sourceFilePath || tab.sourceFileName || tab.sourceFileHandle?.name || "";
    return !!path && isTextDocumentPath(path) && !isSupportedFolderTreeDocumentPath(path);
  }

  function isHtmlPath(path) {
    return /\.(html|htm)$/i.test(path || "");
  }

  function isPreviewableSourceFile(sourceFile) {
    if (!sourceFile) return true;
    const path = sourceFile.path || sourceFile.name || sourceFile.file?.name || sourceFile.handle?.name || "";
    return !path || isTextDocumentPath(path) || isHtmlPath(path);
  }

  function isPreviewableDocumentTab(tab) {
    if (!tab || tab.type === "graph" || tab.type === "file-compare" || tab.type === "api-client" || tab.type === "openapi-editor" || tab.type === "openapi-preview" || tab.type === "soap-client" || tab.type === "regex-tester" || tab.type === "base64-tool" || tab.type === "certificate-decoder" || tab.type === "jwt-tool" || tab.type === "json-yaml-tool" || tab.type === "jsonpath-tool" || tab.type === "xml-tree-grid" || tab.type === "uuid-tool" || tab.type === "qr-tool" || tab.type === "hash-tool" || tab.type === "json-array-table-tool" || tab.type === "text-escape-tool" || tab.type === "kubernetes-topology") return false;
    const path = tab.sourceFilePath || tab.sourceFileName || tab.sourceFileHandle?.name || "";
    return !path || isTextDocumentPath(path) || isHtmlPath(path);
  }

  function isMarkdownDocumentTab(tab) {
    if (!tab || tab.type === "graph" || tab.type === "large-file" || tab.type === "file-preview" || tab.type === "image-editor" || tab.type === "diagram-editor" || tab.type === "hex-editor" || tab.type === "file-compare" || tab.type === "api-client" || tab.type === "openapi-editor" || tab.type === "openapi-preview" || tab.type === "soap-client" || tab.type === "regex-tester" || tab.type === "base64-tool" || tab.type === "certificate-decoder" || tab.type === "jwt-tool" || tab.type === "json-yaml-tool" || tab.type === "jsonpath-tool" || tab.type === "xml-tree-grid" || tab.type === "uuid-tool" || tab.type === "qr-tool" || tab.type === "hash-tool" || tab.type === "json-array-table-tool" || tab.type === "text-escape-tool" || tab.type === "kubernetes-topology") return false;
    const path = tab.sourceFilePath || tab.sourceFileName || tab.sourceFileHandle?.name || "";
    return path ? isMarkdownPath(path) : tab.type === "markdown";
  }

  function getActiveTab() {
    return tabs.find(function(tab) { return tab.id === activeTabId; }) || null;
  }

  function getAllowedViewModeForActiveTab(mode) {
    const activeTab = getActiveTab();
    if (activeTab && (activeTab.type === "graph" || activeTab.type === "large-file" || activeTab.type === "file-preview" || activeTab.type === "image-editor" || activeTab.type === "diagram-editor" || activeTab.type === "hex-editor" || activeTab.type === "file-compare" || activeTab.type === "api-client" || activeTab.type === "openapi-editor" || activeTab.type === "openapi-preview" || activeTab.type === "soap-client" || activeTab.type === "base64-tool" || activeTab.type === "certificate-decoder" || activeTab.type === "jwt-tool" || activeTab.type === "json-yaml-tool" || activeTab.type === "jsonpath-tool" || activeTab.type === "xml-tree-grid" || activeTab.type === "kubernetes-topology")) return 'preview';
    return isPreviewableDocumentTab(activeTab) ? (mode || 'split') : 'editor';
  }

  function getDefaultViewModeForOpenedFile(sourceFile) {
    if (!isPreviewableSourceFile(sourceFile)) return 'editor';
    return typeof resolveFileOpeningMode === "function"
      ? resolveFileOpeningMode(sourceFile)
      : (isMarkdownPath(sourceFile?.path || sourceFile?.name || "") ? 'split' : 'editor');
  }

  /** Resolve the configured Markdown opening mode for a newly created document. */
  function getDefaultViewModeForNewMarkdownDocument() {
    return getDefaultViewModeForOpenedFile({ name: "Untitled.md" });
  }

  function createLargeFileTab(source, title, options = {}) {
    const tab = createTab("", title || source?.name || "Large file", "preview");
    tab.type = "large-file";
    tab.largeFileSource = source ? { ...source, content: source.content } : null;
    tab.sourceFileName = source?.name || null;
    tab.sourceFileHandle = source?.handle || null;
    tab.sourceFilePath = source?.path || null;
    setTabOpenedSource(tab, createOpenedSourceFromSourceFile(source, "large-file"));
    tab.savedContent = "";
    tab.isTemporary = options.temporary === true;
    return tab;
  }

  function createFilePreviewTab(source, title, options = {}) {
    const tab = createTab("", title || source?.name || "File preview", "preview");
    tab.type = "file-preview";
    tab.filePreviewSource = source ? { ...source, file: source.file || null, handle: source.handle || null } : null;
    tab.sourceFileName = source?.name || null;
    tab.sourceFileHandle = source?.handle || null;
    tab.sourceFilePath = source?.path || null;
    setTabOpenedSource(tab, createOpenedSourceFromSourceFile(source, "file-preview"));
    tab.savedContent = "";
    tab.isTemporary = options.temporary === true;
    return tab;
  }

  function createImageEditorTab(source, title, options = {}) {
    const sourceName = source?.name || "Image";
    const tab = createTab("", title || `${sourceName} \u2014 Image Editor`, "preview");
    tab.type = "image-editor";
    tab.imageEditorSource = source ? { ...source, file: source.file || null, handle: source.handle || null } : null;
    tab.imageEditorState = { ...(options.state || {}) };
    tab.imageEditorDirty = options.dirty === true;
    tab.imageEditorDraftBytes = options.draftBytes || null;
    tab.sourceFileName = source?.name || null;
    tab.sourceFileHandle = source?.handle || null;
    tab.sourceFilePath = source?.path || source?.fullPath || null;
    setTabOpenedSource(tab, createOpenedSourceFromSourceFile(source, "image-editor"));
    tab.savedContent = "";
    tab.isTemporary = options.temporary === true;
    return tab;
  }

  function createDiagramEditorTab(source, title, options = {}) {
    const sourceName = source?.name || "Untitled Diagram.drawio";
    const xml = String(options.xml || source?.xml || source?.content || "");
    const tab = createTab("", title || sourceName, "preview");
    tab.type = "diagram-editor";
    tab.diagramXml = xml;
    tab.diagramSavedXml = String(options.savedXml ?? xml);
    tab.diagramDirty = options.dirty === true;
    tab.sourceFileName = source?.name || null;
    tab.sourceFileHandle = source?.handle || null;
    tab.sourceFilePath = source?.path || source?.fullPath || null;
    setTabOpenedSource(tab, createOpenedSourceFromSourceFile(source, "diagram-editor"));
    tab.savedContent = "";
    tab.isTemporary = options.temporary === true;
    return tab;
  }

  function createHexEditorTab(source, title, options = {}) {
    const tab = createTab("", title || source?.name || "Hex Editor", "preview");
    tab.type = "hex-editor";
    tab.hexEditorSource = source ? { ...source, file: source.file || null, handle: source.handle || null } : null;
    tab.hexEditorState = { ...(options.state || {}), size: Number(source?.size || options.state?.size || 0) || 0 };
    tab.hexEditorDirty = false;
    tab.sourceFileName = source?.name || null;
    tab.sourceFileHandle = source?.handle || null;
    tab.sourceFilePath = source?.path || source?.fullPath || null;
    setTabOpenedSource(tab, createOpenedSourceFromSourceFile(source, "hex-editor"));
    tab.savedContent = "";
    tab.isTemporary = options.temporary === true;
    return tab;
  }

  function createFileCompareTab(compareDescriptor, options = {}) {
    const tab = createTab("", compareDescriptor?.title || "Compare files", "preview");
    tab.type = "file-compare";
    tab.fileCompare = {
      left: { ...(compareDescriptor?.left || {}) },
      right: { ...(compareDescriptor?.right || {}) },
      gitConflict: compareDescriptor?.gitConflict ? { ...compareDescriptor.gitConflict } : null,
      readOnly: compareDescriptor?.readOnly === true,
      viewMode: compareDescriptor?.viewMode || "side-by-side",
      xmlAwareDiff: compareDescriptor?.xmlAwareDiff ? { ...compareDescriptor.xmlAwareDiff } : null
    };
    tab.savedContent = "";
    tab.isTemporary = options.temporary === true;
    return tab;
  }

  function createKubernetesTopologyTab(graph, result, options = {}) {
    const commandName = String(result?.commandName || result?.tool || "Kubernetes").trim();
    const tab = createTab("", options.title || `${commandName} Topology`, "preview");
    tab.type = "kubernetes-topology";
    tab.kubernetesTopology = {
      graph: graph || { nodes: [], edges: [], warnings: [] },
      result: result || null,
      manifestContent: options.manifestContent || ""
    };
    tab.kubernetesTopologyLayout = options.layout || options.document?.layout || { positions: {} };
    tab.kubernetesTopologyDocument = options.document || null;
    tab.kubernetesTopologyDirty = options.dirty === true;
    tab.sourceFileName = options.sourceFileName || null;
    tab.sourceFileHandle = options.sourceFileHandle || null;
    tab.sourceFilePath = options.sourceFilePath || null;
    if (tab.sourceFileName || tab.sourceFilePath || tab.sourceFileHandle) setTabOpenedSource(tab, createOpenedSourceFromSourceFile({ name: tab.sourceFileName || getFileName(tab.sourceFilePath), path: tab.sourceFilePath, handle: tab.sourceFileHandle }, "kubernetes-topology-file"));
    tab.savedContent = "";
    tab.isTemporary = options.temporary === true;
    return tab;
  }
  function activateSidebarTab(tab) {
    deps.closedTabHistory?.removeMatchingTab?.(tab);
    const previousActiveTabId = activeTabId;
    deactivateManagedTabView(previousActiveTabId);
    activeTabId = tab.id;
    saveActiveTabId(activeTabId);
    refreshGraphModeNotices(tab);
    activateManagedTabView(tab);
    if (tab.type === "large-file" || tab.type === "file-preview" || tab.type === "image-editor" || tab.type === "diagram-editor" || tab.type === "hex-editor" || tab.type === "file-compare" || tab.type === "api-client" || tab.type === "openapi-editor" || tab.type === "openapi-preview" || tab.type === "soap-client" || tab.type === "regex-tester" || tab.type === "base64-tool" || tab.type === "certificate-decoder" || tab.type === "jwt-tool" || tab.type === "json-yaml-tool" || tab.type === "jsonpath-tool" || tab.type === "xml-tree-grid" || tab.type === "uuid-tool" || tab.type === "qr-tool" || tab.type === "hash-tool" || tab.type === "json-array-table-tool" || tab.type === "text-escape-tool" || tab.type === "kubernetes-topology") {
      setActiveEditorContent("");
      setNoOpenTabsMode(false);
      setViewMode("preview");
      setGraphViewMode(false);
      if (typeof updateDocumentStats === "function") updateDocumentStats();
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      syncFolderTreeSelectionToActiveTab();
      deps.onActiveTabChanged?.(tab);
      return;
    }
    activateEditableDocumentTab(tab);
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    syncFolderTreeSelectionToActiveTab();
    deps.onActiveTabChanged?.(tab);
  }

  function openSidebarFileInTab(content, title, sourceFile, options) {
    options = options || {};
    const isTemporary = options.temporary === true;
    const pinExisting = Object.prototype.hasOwnProperty.call(options, "pinExisting")
      ? options.pinExisting !== false
      : !isTemporary;
    saveCurrentTabState();

    if (sourceFile && options.skipExistingSourceTab !== true) {
      const existingTab = findTabForSourceFile(sourceFile);
      if (existingTab) {
        switchTab(existingTab.id);
        if (pinExisting) pinTemporaryTab(existingTab.id);
        return existingTab;
      }
    }

    let tab = isTemporary ? findTemporaryTab() : null;
    if (!tab && hasReachedOpenTabLimit('open a new one')) {
      return null;
    }

    if (!tab) {
      const normalizedContent = normalizeEditorContent(content);
      const requestedViewMode = options.viewMode || getDefaultViewModeForOpenedFile(sourceFile);
      tab = createTab(normalizedContent, title || 'Untitled', requestedViewMode);
      tab.isTemporary = isTemporary;
      applySidebarFileMetadata(tab, sourceFile);
      tab.savedContent = normalizedContent;
      tabs.push(tab);
    } else {
      const normalizedContent = normalizeEditorContent(content);
      destroyManagedTabView(tab.id);
      tab.type = "markdown";
      tab.title = title || 'Untitled';
      tab.content = normalizedContent;
      tab.scrollPos = 0;
      tab.viewMode = options.viewMode || getDefaultViewModeForOpenedFile(sourceFile);
      tab.isTemporary = isTemporary;
      tab.largeFileSource = null;
      tab.largeFileDocumentStats = null;
      tab.largeFileViewState = null;
      tab.filePreviewSource = null;
      applySidebarFileMetadata(tab, sourceFile);
      tab.savedContent = normalizedContent;
    }

    activateSidebarTab(tab);
    return tab;
  }
  /**
   * Opens a named editor tab without creating its file on disk.
   * @param {string} fileName Validated file name, including its optional extension.
   * @returns {object|null} The new unsaved tab, or null when the tab limit is reached.
   */
  function openNewUnsavedFileInTab(fileName) {
    const name = String(fileName || "").trim();
    if (!name) return null;
    const tab = openSidebarFileInTab("", name, { name }, {
      temporary: false,
      skipExistingSourceTab: true
    });
    if (!tab) return null;
    tab.sourceFileHandle = null;
    tab.sourceFilePath = null;
    tab.isNewUnsavedFile = true;
    setTabOpenedSource(tab, { name, kind: "new-file" });
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
    return tab;
  }

  function createApiClientState(options = {}) {
    const request = options.request || options.initialRequest || null;
    const historyEntry = options.historyEntry || null;
    return {
      history: Array.isArray(options.history) ? options.history : (historyEntry ? [historyEntry] : []),
      method: request?.method || "GET",
      url: request?.url || "",
      paramsText: request?.paramsText || "",
      headersText: request?.headersText || "Content-Type: application/json",
      bodyMode: request?.bodyMode || "none",
      bodyText: request?.bodyText || "",
      formDataText: request?.formDataText || "",
      savedRequestId: options.savedRequestId || request?.savedRequestId || null,
      historyEntryKey: options.historyEntryKey || null,
      historyEntry
    };
  }

  function createApiClientTab(options = {}) {
    const tab = createTab("", options.title || "API Client", "preview");
    tab.type = "api-client";
    tab.apiClient = createApiClientState(options);
    tab.savedContent = "";
    tab.isTemporary = options.temporary === true;
    return tab;
  }

  function createOpenApiEditorTab(source = {}, options = {}) {
    const content = normalizeEditorContent(source.content || "");
    const title = options.title || source.name || "OpenAPI";
    const tab = createTab(content, title, "preview");
    tab.type = "openapi-editor";
    tab.sourceFileName = source.name || null;
    tab.sourceFileHandle = source.handle || null;
    tab.sourceFilePath = source.path || source.fullPath || source.sourceFilePath || null;
    tab.openedSource = createOpenedSourceFromSourceFile(source, "openapi-editor");
    tab.savedContent = content;
    tab.isTemporary = options.temporary === true;
    return tab;
  }

  function createOpenApiPreviewTab(options = {}) {
    const sourceName = options.sourceFileName || options.title || "OpenAPI";
    const tab = createTab("", options.title || `${sourceName} Preview`, "preview");
    tab.type = "openapi-preview";
    tab.openapiPreview = {
      spec: options.spec || {},
      requestSpec: options.requestSpec || options.spec || {},
      serverUrl: options.serverUrl || "",
      sourceKey: options.sourceKey || "",
      sourceTabId: options.sourceTabId || null,
      sourceFilePath: options.sourceFilePath || null,
      sourceFileName: options.sourceFileName || null,
      selectedOperation: options.selectedOperation || null
    };
    tab.savedContent = "";
    tab.isTemporary = false;
    return tab;
  }

  function createSoapClientState(options = {}) {
    return {
      wsdlLabel: options.wsdlLabel || options.operationSnapshot?.sourceLabel || "",
      serviceName: options.serviceName || options.operationSnapshot?.serviceName || "",
      portName: options.portName || options.operationSnapshot?.portName || "",
      operationName: options.operationName || options.operationSnapshot?.name || "",
      endpointUrl: options.endpointUrl || options.operationSnapshot?.endpointUrl || "",
      soapAction: options.soapAction || options.operationSnapshot?.soapAction || "",
      soapVersion: options.soapVersion || options.operationSnapshot?.soapVersion || "1.1",
      requestXml: options.requestXml || "",
      responseXml: options.responseXml || "",
      responseMeta: options.responseMeta || null,
      operationSnapshot: options.operationSnapshot || null
    };
  }

  function createSoapClientTab(options = {}) {
    const operationName = options.operationSnapshot?.name || options.operationName || "Request";
    const tab = createTab("", options.title || `SOAP: ${operationName}`, "preview");
    tab.type = "soap-client";
    tab.soapClient = createSoapClientState(options);
    tab.savedContent = "";
    tab.isTemporary = options.temporary === true;
    return tab;
  }
  function createRegexTesterTab() {
    const tab = createTab("", "Regex-Tester", "preview");
    tab.type = "regex-tester";
    tab.savedContent = "";
    tab.isTemporary = false;
    return tab;
  }

  function createBase64ToolTab() {
    const tab = createTab("", "Base64 Encoder/Decoder", "preview");
    tab.type = "base64-tool";
    tab.savedContent = "";
    tab.isTemporary = false;
    return tab;
  }

  function createCertificateDecoderTab() {
    const tab = createTab("", "Certificate Decoder", "preview");
    tab.type = "certificate-decoder";
    tab.savedContent = "";
    tab.isTemporary = false;
    return tab;
  }

  function createJwtToolTab() {
    const tab = createTab("", "JWT Encoder/Decoder", "preview");
    tab.type = "jwt-tool";
    tab.savedContent = "";
    tab.isTemporary = false;
    return tab;
  }

  function createJsonYamlToolTab() {
    const tab = createTab("", "JSON <> YAML Converter", "preview");
    tab.type = "json-yaml-tool";
    tab.savedContent = "";
    tab.isTemporary = false;
    return tab;
  }

  function createJsonPathToolTab() {
    const tab = createTab("", "JSONPath Tester", "preview");
    tab.type = "jsonpath-tool";
    tab.savedContent = "";
    tab.isTemporary = false;
    return tab;
  }

  function createXPathToolTab() {
    const tab = createTab("", "XPath Search", "preview");
    tab.type = "xpath-tool";
    tab.savedContent = "";
    tab.isTemporary = false;
    return tab;
  }

  function createXsltToolTab(options = {}) {
    const tab = createTab("", "XSLT Runner", "preview");
    tab.type = "xslt-runner-tool";
    tab.savedContent = "";
    tab.isTemporary = false;
    tab.xsltRunner = {
      xmlText: options.xmlText || "",
      xsltText: options.xsltText || "",
      resultText: options.resultText || "",
      parameters: Array.isArray(options.parameters) ? options.parameters : []
    };
    return tab;
  }

  function createXmlTreeGridTab(options = {}) {
    const tab = createTab("", "XML Tree/Grid", "preview");
    tab.type = "xml-tree-grid";
    tab.savedContent = "";
    tab.isTemporary = false;
    tab.xmlTreeGrid = {
      text: options.text || "",
      filePath: options.filePath || ""
    };
    return tab;
  }

  function createUuidToolTab() {
    const tab = createTab("", "UUID Generator", "preview");
    tab.type = "uuid-tool";
    tab.savedContent = "";
    tab.isTemporary = false;
    return tab;
  }

  function createQrToolTab() {
    const tab = createTab("", "QR Code Encoder / Decoder", "preview");
    tab.type = "qr-tool";
    tab.savedContent = "";
    tab.isTemporary = false;
    return tab;
  }

  function createHashToolTab() {
    const tab = createTab("", "Hash / Checksum Generator", "preview");
    tab.type = "hash-tool";
    tab.savedContent = "";
    tab.isTemporary = false;
    return tab;
  }

  function createJsonArrayTableToolTab() {
    const tab = createTab("", "JSON Array to Table", "preview");
    tab.type = "json-array-table-tool";
    tab.savedContent = "";
    tab.isTemporary = false;
    return tab;
  }

  function createTextEscapeToolTab() {
    const tab = createTab("", "Text Escape / Unescape", "preview");
    tab.type = "text-escape-tool";
    tab.savedContent = "";
    tab.isTemporary = false;
    return tab;
  }

  function createUnicodeToolTab() {
    const tab = createTab("", "Unicode Encoder / Decoder", "preview");
    tab.type = "unicode-tool";
    tab.savedContent = "";
    tab.isTemporary = false;
    return tab;
  }

  function createStringBytesToolTab() {
    const tab = createTab("", "String to Bytes Converter", "preview");
    tab.type = "string-bytes-tool";
    tab.savedContent = "";
    tab.isTemporary = false;
    return tab;
  }

  function createDatabaseConnectionStringToolTab() {
    const tab = createTab("", "Database Connection String Builder", "preview");
    tab.type = "database-connection-string-tool";
    tab.savedContent = "";
    tab.isTemporary = false;
    return tab;
  }

  function openLargeFileInTab(source, title, options) {
    options = options || {};
    const isTemporary = options.temporary === true;
    const pinExisting = Object.prototype.hasOwnProperty.call(options, "pinExisting")
      ? options.pinExisting !== false
      : !isTemporary;
    saveCurrentTabState();

    const sourceFile = {
      name: source?.name || title,
      path: source?.path || null,
      handle: source?.handle || null
    };
    const existingTab = findTabForSourceFile(sourceFile);
    if (existingTab) {
      switchTab(existingTab.id);
      if (pinExisting) pinTemporaryTab(existingTab.id);
      return existingTab;
    }

    let tab = isTemporary ? findTemporaryTab() : null;
    if (!tab && hasReachedOpenTabLimit('open a new one')) {
      return null;
    }

    if (!tab || tab.type === "graph") {
      tab = createLargeFileTab(source, title, { temporary: isTemporary });
      tabs.push(tab);
    } else {
      destroyManagedTabView(tab.id);
      tab.title = title || source?.name || "Large file";
      tab.content = "";
      tab.scrollPos = 0;
      tab.viewMode = "preview";
      tab.isTemporary = isTemporary;
      tab.type = "large-file";
      tab.largeFileSource = source ? { ...source, content: source.content } : null;
      tab.filePreviewSource = null;
      tab.sourceFileName = source?.name || null;
      tab.sourceFileHandle = source?.handle || null;
      tab.sourceFilePath = source?.path || null;
      setTabOpenedSource(tab, createOpenedSourceFromSourceFile(source, "large-file"));
      tab.savedContent = "";
    }

    activateSidebarTab(tab);
    return tab;
  }

  function openFilePreviewInTab(source, title, options) {
    options = options || {};
    const isTemporary = options.temporary === true;
    const pinExisting = Object.prototype.hasOwnProperty.call(options, "pinExisting")
      ? options.pinExisting !== false
      : !isTemporary;
    saveCurrentTabState();

    const sourceFile = {
      name: source?.name || title,
      path: source?.path || null,
      handle: source?.handle || null
    };
    const existingTab = findTabForSourceFile(sourceFile);
    if (existingTab) {
      switchTab(existingTab.id);
      if (pinExisting) pinTemporaryTab(existingTab.id);
      return existingTab;
    }

    let tab = isTemporary ? findTemporaryTab() : null;
    if (!tab && hasReachedOpenTabLimit('open a new one')) {
      return null;
    }

    if (!tab || tab.type === "graph") {
      tab = createFilePreviewTab(source, title, { temporary: isTemporary });
      tabs.push(tab);
    } else {
      destroyManagedTabView(tab.id);
      tab.title = title || source?.name || "File preview";
      tab.content = "";
      tab.scrollPos = 0;
      tab.viewMode = "preview";
      tab.isTemporary = isTemporary;
      tab.type = "file-preview";
      tab.largeFileSource = null;
      tab.largeFileDocumentStats = null;
      tab.largeFileViewState = null;
      tab.filePreviewSource = source ? { ...source, file: source.file || null, handle: source.handle || null } : null;
      tab.sourceFileName = source?.name || null;
      tab.sourceFileHandle = source?.handle || null;
      tab.sourceFilePath = source?.path || null;
      setTabOpenedSource(tab, createOpenedSourceFromSourceFile(source, "file-preview"));
      tab.savedContent = "";
    }

    activateSidebarTab(tab);
    return tab;
  }

  function openImageEditorInTab(source, options = {}) {
    saveCurrentTabState();
    const sourceFile = {
      name: source?.name,
      path: source?.path || source?.fullPath || null,
      handle: source?.handle || null
    };
    const existingTab = findTabForSourceFile(sourceFile, "image-editor");
    if (existingTab) {
      switchTab(existingTab.id);
      pinTemporaryTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open the image editor")) return null;
    const title = `${source?.name || "Image"} \u2014 Image Editor`;
    const tab = createImageEditorTab(source, title, {
      temporary: false,
      state: options.state,
      dirty: options.dirty,
      draftBytes: options.draftBytes
    });
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openBlankImageEditorInTab(options = {}) {
    saveCurrentTabState();
    if (hasReachedOpenTabLimit("open the image editor")) return null;
    const width = Math.max(16, Number(options.width || 640) || 640);
    const height = Math.max(16, Number(options.height || 360) || 360);
    const name = options.name || `${nextUntitledTitle()} Image`;
    const background = options.background?.mode === "transparent"
      ? { mode: "transparent" }
      : { mode: "solid", color: String(options.background?.color || "#ffffff") };
    const source = { blank: true, name, mimeType: "image/png", width, height, background };
    const tab = createImageEditorTab(source, `${name} - Image Editor`, {
      temporary: false,
      blank: true,
      state: { width, height, mimeType: "image/png" }
    });
    tab.sourceFileName = null;
    tab.sourceFileHandle = null;
    tab.sourceFilePath = null;
    tab.openedSource = { name, kind: "image-editor" };
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openDiagramEditorInTab(source, options = {}) {
    saveCurrentTabState();
    const sourceFile = {
      name: source?.name,
      path: source?.path || source?.fullPath || null,
      handle: source?.handle || null
    };
    const existingTab = options.skipExistingSourceTab === true
      ? null
      : findTabForSourceFile(sourceFile, "diagram-editor");
    if (existingTab) {
      switchTab(existingTab.id);
      pinTemporaryTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open the Diagram Editor")) return null;
    const tab = createDiagramEditorTab(source, options.title || source?.name || "Untitled Diagram.drawio", {
      xml: options.xml || source?.xml || source?.content,
      savedXml: options.savedXml,
      dirty: options.dirty,
      temporary: options.temporary
    });
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openBlankDiagramEditorInTab(options = {}) {
    const name = options.name || "Untitled Diagram.drawio";
    const xml = options.xml || deps.diagramEditor?.createBlankXml?.() || "";
    const tab = openDiagramEditorInTab(
      { name, xml },
      { xml, savedXml: "", dirty: true, skipExistingSourceTab: true }
    );
    if (tab) {
      tab.sourceFileName = null;
      tab.sourceFilePath = null;
      tab.sourceFileHandle = null;
      tab.openedSource = { name, kind: "diagram-editor" };
    }
    return tab;
  }

  function openHexEditorInTab(source, title, options) {
    options = options || {};
    const isTemporary = options.temporary === true;
    const pinExisting = Object.prototype.hasOwnProperty.call(options, "pinExisting")
      ? options.pinExisting !== false
      : !isTemporary;
    saveCurrentTabState();

    const sourceFile = {
      name: source?.name || title,
      path: source?.path || source?.fullPath || null,
      handle: source?.handle || null
    };
    const existingTab = findTabForSourceFile(sourceFile, "hex-editor");
    if (existingTab) {
      switchTab(existingTab.id);
      if (pinExisting) pinTemporaryTab(existingTab.id);
      return existingTab;
    }

    let tab = isTemporary ? findTemporaryTab() : null;
    if (!tab && hasReachedOpenTabLimit("open a new one")) return null;

    if (!tab || tab.type === "graph") {
      tab = createHexEditorTab(source, title, { temporary: isTemporary, state: options.state });
      tabs.push(tab);
    } else {
      destroyManagedTabView(tab.id);
      tab.title = title || source?.name || "Hex Editor";
      tab.content = "";
      tab.scrollPos = 0;
      tab.viewMode = "preview";
      tab.isTemporary = isTemporary;
      tab.type = "hex-editor";
      tab.largeFileSource = null;
      tab.filePreviewSource = null;
      tab.hexEditorSource = source ? { ...source, file: source.file || null, handle: source.handle || null } : null;
      tab.hexEditorState = { ...(options.state || {}), size: Number(source?.size || options.state?.size || 0) || 0 };
      tab.hexEditorDirty = false;
      tab.sourceFileName = source?.name || null;
      tab.sourceFileHandle = source?.handle || null;
      tab.sourceFilePath = source?.path || source?.fullPath || null;
      setTabOpenedSource(tab, createOpenedSourceFromSourceFile(source, "hex-editor"));
      tab.savedContent = "";
    }

    activateSidebarTab(tab);
    return tab;
  }

  function openFileCompareInTab(compareDescriptor, options) {
    options = options || {};
    const isTemporary = options.temporary === true;
    saveCurrentTabState();

    let tab = isTemporary ? findTemporaryTab() : null;
    if (!tab && hasReachedOpenTabLimit('open a new one')) {
      return null;
    }

    if (!tab || tab.type === "graph") {
      tab = createFileCompareTab(compareDescriptor, { temporary: isTemporary });
      tabs.push(tab);
    } else {
      destroyManagedTabView(tab.id);
      tab.title = compareDescriptor?.title || "Compare files";
      tab.content = "";
      tab.scrollPos = 0;
      tab.viewMode = "preview";
      tab.isTemporary = isTemporary;
      tab.type = "file-compare";
      tab.fileCompare = {
        left: { ...(compareDescriptor?.left || {}) },
        right: { ...(compareDescriptor?.right || {}) },
        readOnly: compareDescriptor?.readOnly === true,
        viewMode: compareDescriptor?.viewMode || "side-by-side",
        xmlAwareDiff: compareDescriptor?.xmlAwareDiff ? { ...compareDescriptor.xmlAwareDiff } : null
      };
      tab.largeFileSource = null;
      tab.largeFileDocumentStats = null;
      tab.largeFileViewState = null;
      tab.filePreviewSource = null;
      tab.sourceFileName = null;
      tab.sourceFileHandle = null;
      tab.sourceFilePath = null;
      setTabOpenedSource(tab, null);
      tab.savedContent = "";
    }

    activateSidebarTab(tab);
    return tab;
  }


  function openKubernetesTopologyInTab(graph, result, options = {}) {
    const isTemporary = options.temporary === true;
    saveCurrentTabState();

    let tab = isTemporary ? findTemporaryTab() : null;
    if (!tab && hasReachedOpenTabLimit("open Kubernetes topology")) return null;

    if (!tab || tab.type === "graph") {
      tab = createKubernetesTopologyTab(graph, result, options);
      tabs.push(tab);
    } else {
      const tabIndex = tabs.findIndex(function(candidate) { return candidate.id === tab.id; });
      destroyManagedTabView(tab.id);
      const replacementTab = createKubernetesTopologyTab(graph, result, options);
      if (tabIndex >= 0) tabs.splice(tabIndex, 1, replacementTab);
      tab = replacementTab;
    }

    activateSidebarTab(tab);
    return tab;
  }

  function markKubernetesTopologyTabDirty(tabId, layout) {
    const tab = tabs.find(function(candidate) { return candidate.id === tabId; });
    if (!tab || tab.type !== "kubernetes-topology") return false;
    if (layout) tab.kubernetesTopologyLayout = layout;
    tab.kubernetesTopologyDirty = true;
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
    return true;
  }
  function openOpenApiEditorInTab(source, options = {}) {
    const isTemporary = options.temporary === true;
    const pinExisting = Object.prototype.hasOwnProperty.call(options, "pinExisting")
      ? options.pinExisting !== false
      : !isTemporary;
    saveCurrentTabState();

    const sourceFile = {
      name: source?.name || options.title || "OpenAPI",
      path: source?.path || source?.fullPath || source?.sourceFilePath || null,
      handle: source?.handle || null
    };
    const existingTab = options.skipExistingSourceTab === true ? null : findTabForSourceFile(sourceFile);
    if (existingTab) {
      if (existingTab.type !== "openapi-editor") {
        existingTab.type = "openapi-editor";
        existingTab.content = normalizeEditorContent(source?.content || existingTab.content || "");
        existingTab.savedContent = existingTab.content;
      }
      switchTab(existingTab.id);
      if (pinExisting) pinTemporaryTab(existingTab.id);
      return existingTab;
    }

    let tab = isTemporary ? findTemporaryTab() : null;
    if (!tab && hasReachedOpenTabLimit("open the OpenAPI editor")) return null;

    if (!tab || tab.type === "graph") {
      tab = createOpenApiEditorTab(source, options);
      tabs.push(tab);
    } else {
      destroyManagedTabView(tab.id);
      const replacement = createOpenApiEditorTab(source, options);
      Object.assign(tab, replacement, { id: tab.id, createdAt: tab.createdAt });
    }

    activateSidebarTab(tab);
    return tab;
  }

  function normalizeOpenApiPreviewSourceKey(options = {}) {
    const sourcePath = String(options.sourceFilePath || "").trim().replace(/\\/g, "/").toLowerCase();
    if (sourcePath) return `path:${sourcePath}`;
    const sourceTabId = String(options.sourceTabId || "").trim();
    if (sourceTabId) return `tab:${sourceTabId}`;
    return "";
  }

  function openSwaggerUiPreviewInTab(options = {}) {
    const sourceKey = normalizeOpenApiPreviewSourceKey(options);
    saveCurrentTabState();
    let tab = sourceKey ? tabs.find(function(candidate) {
      return candidate?.type === "openapi-preview" && candidate.openapiPreview?.sourceKey === sourceKey;
    }) : null;
    if (!tab) {
      if (hasReachedOpenTabLimit("open Swagger UI preview")) return null;
      tab = createOpenApiPreviewTab({ ...options, sourceKey });
      tabs.push(tab);
    } else {
      tab.title = options.title || tab.title || "OpenAPI Preview";
      tab.openapiPreview = {
        ...(tab.openapiPreview || {}),
        spec: options.spec || {},
        requestSpec: options.requestSpec || options.spec || tab.openapiPreview?.requestSpec || {},
        serverUrl: options.serverUrl || tab.openapiPreview?.serverUrl || "",
        sourceKey,
        sourceTabId: options.sourceTabId || tab.openapiPreview?.sourceTabId || null,
        sourceFilePath: options.sourceFilePath || tab.openapiPreview?.sourceFilePath || null,
        sourceFileName: options.sourceFileName || tab.openapiPreview?.sourceFileName || null,
        selectedOperation: options.selectedOperation || null
      };
    }
    activateSidebarTab(tab);
    deps.openApiEditor?.refreshOpenApiPreviewTab?.(tab);
    return tab;
  }

  function openApiClientInTab(options) {
    options = options || {};
    const isTemporary = options.temporary === true;
    const forceNew = options.forceNew === true;
    const savedRequestId = String(options.savedRequestId || "").trim();
    const historyEntryKey = String(options.historyEntryKey || "").trim();
    saveCurrentTabState();

    if (savedRequestId && !forceNew) {
      const existingApiClientTab = tabs.find(function(candidate) {
        return candidate?.type === "api-client" && candidate.apiClient?.savedRequestId === savedRequestId;
      });
      if (existingApiClientTab) {
        switchTab(existingApiClientTab.id);
        return existingApiClientTab;
      }
    }

    if (historyEntryKey && !forceNew) {
      const existingApiClientTab = tabs.find(function(candidate) {
        return candidate?.type === "api-client" && candidate.apiClient?.historyEntryKey === historyEntryKey;
      });
      if (existingApiClientTab) {
        switchTab(existingApiClientTab.id);
        return existingApiClientTab;
      }
    }

    let tab = !forceNew && isTemporary ? findTemporaryTab() : null;
    if (!tab && hasReachedOpenTabLimit('open a new one')) {
      return null;
    }

    if (!tab || tab.type === "graph") {
      tab = createApiClientTab(options);
      tabs.push(tab);
    } else {
      destroyManagedTabView(tab.id);
      tab.title = options.title || "API Client";
      tab.content = "";
      tab.scrollPos = 0;
      tab.viewMode = "preview";
      tab.isTemporary = isTemporary;
      tab.type = "api-client";
      tab.apiClient = createApiClientState(options);
      tab.largeFileSource = null;
      tab.largeFileDocumentStats = null;
      tab.largeFileViewState = null;
      tab.filePreviewSource = null;
      tab.fileCompare = null;
      tab.sourceFileName = null;
      tab.sourceFileHandle = null;
      tab.sourceFilePath = null;
      setTabOpenedSource(tab, null);
      tab.savedContent = "";
    }

    activateSidebarTab(tab);
    return tab;
  }
  function openSoapClientInTab(options) {
    options = options || {};
    const operationKey = String(options.operationSnapshot?.id || options.operationName || "").trim();
    saveCurrentTabState();
    if (operationKey) {
      const existingTab = tabs.find(function(candidate) {
        return candidate?.type === "soap-client" && (candidate.soapClient?.operationSnapshot?.id || candidate.soapClient?.operationName) === operationKey;
      });
      if (existingTab) {
        existingTab.soapClient = createSoapClientState({ ...(existingTab.soapClient || {}), ...options });
        existingTab.title = options.title || `SOAP: ${existingTab.soapClient.operationName || "Request"}`;
        switchTab(existingTab.id);
        return existingTab;
      }
    }
    if (hasReachedOpenTabLimit("open SOAP Client")) return null;
    const tab = createSoapClientTab(options);
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }
  function openRegexTesterInTab() {
    saveCurrentTabState();
    const existingTab = tabs.find(function(candidate) { return candidate?.type === "regex-tester"; });
    if (existingTab) {
      switchTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open Regex-Tester")) return null;
    const tab = createRegexTesterTab();
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openBase64ToolInTab() {
    saveCurrentTabState();
    const existingTab = tabs.find(function(candidate) { return candidate?.type === "base64-tool"; });
    if (existingTab) {
      switchTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open Base64 Encoder/Decoder")) return null;
    const tab = createBase64ToolTab();
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openCertificateDecoderInTab() {
    saveCurrentTabState();
    const existingTab = tabs.find(function(candidate) { return candidate?.type === "certificate-decoder"; });
    if (existingTab) {
      switchTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open Certificate Decoder")) return null;
    const tab = createCertificateDecoderTab();
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openJwtToolInTab() {
    saveCurrentTabState();
    const existingTab = tabs.find(function(candidate) { return candidate?.type === "jwt-tool"; });
    if (existingTab) {
      switchTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open JWT Encoder/Decoder")) return null;
    const tab = createJwtToolTab();
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openJsonYamlToolInTab() {
    saveCurrentTabState();
    const existingTab = tabs.find(function(candidate) { return candidate?.type === "json-yaml-tool"; });
    if (existingTab) {
      switchTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open JSON <> YAML Converter")) return null;
    const tab = createJsonYamlToolTab();
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openJsonPathToolInTab() {
    saveCurrentTabState();
    const existingTab = tabs.find(function(candidate) { return candidate?.type === "jsonpath-tool"; });
    if (existingTab) {
      switchTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open JSONPath Tester")) return null;
    const tab = createJsonPathToolTab();
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openXPathToolInTab() {
    saveCurrentTabState();
    const existingTab = tabs.find(function(candidate) { return candidate?.type === "xpath-tool"; });
    if (existingTab) {
      switchTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open XPath Search")) return null;
    const tab = createXPathToolTab();
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }


  function openXsltToolInTab(options = {}) {
    saveCurrentTabState();
    const existingTab = tabs.find(function(candidate) { return candidate?.type === "xslt-runner-tool"; });
    if (existingTab) {
      existingTab.xsltRunner = { ...(existingTab.xsltRunner || {}), ...options };
      switchTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open XSLT Runner")) return null;
    const tab = createXsltToolTab(options);
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openXmlTreeGridTab(options = {}) {
    saveCurrentTabState();
    if (hasReachedOpenTabLimit("open XML Tree/Grid")) return null;
    const tab = createXmlTreeGridTab(options);
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openUuidToolInTab() {
    saveCurrentTabState();
    const existingTab = tabs.find(function(candidate) { return candidate?.type === "uuid-tool"; });
    if (existingTab) {
      switchTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open UUID Generator")) return null;
    const tab = createUuidToolTab();
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openQrToolInTab() {
    saveCurrentTabState();
    const existingTab = tabs.find(function(candidate) { return candidate?.type === "qr-tool"; });
    if (existingTab) {
      switchTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open QR Code Encoder / Decoder")) return null;
    const tab = createQrToolTab();
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openHashToolInTab() {
    saveCurrentTabState();
    const existingTab = tabs.find(function(candidate) { return candidate?.type === "hash-tool"; });
    if (existingTab) {
      switchTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open Hash / Checksum Generator")) return null;
    const tab = createHashToolTab();
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openJsonArrayTableToolInTab() {
    saveCurrentTabState();
    const existingTab = tabs.find(function(candidate) { return candidate?.type === "json-array-table-tool"; });
    if (existingTab) {
      switchTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open JSON Array to Table")) return null;
    const tab = createJsonArrayTableToolTab();
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openTextEscapeToolInTab() {
    saveCurrentTabState();
    const existingTab = tabs.find(function(candidate) { return candidate?.type === "text-escape-tool"; });
    if (existingTab) {
      switchTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open Text Escape / Unescape")) return null;
    const tab = createTextEscapeToolTab();
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openUnicodeToolInTab() {
    saveCurrentTabState();
    const existingTab = tabs.find(function(candidate) { return candidate?.type === "unicode-tool"; });
    if (existingTab) {
      switchTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open Unicode Encoder / Decoder")) return null;
    const tab = createUnicodeToolTab();
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openStringBytesToolInTab() {
    saveCurrentTabState();
    const existingTab = tabs.find(function(candidate) { return candidate?.type === "string-bytes-tool"; });
    if (existingTab) {
      switchTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open String to Bytes Converter")) return null;
    const tab = createStringBytesToolTab();
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openDatabaseConnectionStringToolInTab() {
    saveCurrentTabState();
    const existingTab = tabs.find(function(candidate) { return candidate?.type === "database-connection-string-tool"; });
    if (existingTab) {
      switchTab(existingTab.id);
      return existingTab;
    }
    if (hasReachedOpenTabLimit("open Database Connection String Builder")) return null;
    const tab = createDatabaseConnectionStringToolTab();
    tabs.push(tab);
    activateSidebarTab(tab);
    return tab;
  }

  function openSidebarFileInTemporaryTab(content, title, sourceFile) {
    return openSidebarFileInTab(content, title, sourceFile, { temporary: true });
  }

  function openSidebarFileInPermanentTab(content, title, sourceFile) {
    return openSidebarFileInTab(content, title, sourceFile, { temporary: false });
  }

  function getComparableTabSourcePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
  }

  function findTabForSourceFile(sourceFile, requiredType) {
    if (!sourceFile) return null;

    if (sourceFile.handle) {
      const handleMatch = tabs.find(function(tab) {
        return tab.type !== "graph" && (!requiredType || tab.type === requiredType) && tab.sourceFileHandle === sourceFile.handle;
      });
      if (handleMatch) return handleMatch;
    }

    if (sourceFile.path) {
      const sourcePathKey = getComparableTabSourcePath(sourceFile.path);
      const pathMatch = tabs.find(function(tab) {
        return tab.type !== "graph" && (!requiredType || tab.type === requiredType) && getComparableTabSourcePath(tab.sourceFilePath || "") === sourcePathKey;
      });
      if (pathMatch) return pathMatch;
      return null;
    }

    const title = sourceFile.name ? getMarkdownTitleFromFileName(sourceFile.name) : null;
    return tabs.find(function(tab) {
      return tab.type !== "graph" && ((sourceFile.name && tab.sourceFileName === sourceFile.name) || (title && tab.title === title));
    }) || null;
  }

  /**
   * Return the current editor-backed content and saved baseline state for a source file.
   * @param {string} path Local source path.
   * @returns {object|null} Open tab snapshot, or null when the file is not open.
   */
  function getExternalDocumentSnapshot(path) {
    const tab = findTabForSourceFile({ path });
    if (!tab) return null;
    const content = tab.id === activeTabId ? getActiveEditorContent() : String(tab.content || "");
    const documentContext = tab.id === activeTabId
      ? editorViewManager?.getActiveCodeMirrorEditor?.()?.getLspDocumentContext?.()
      : null;
    return {
      path: tab.sourceFilePath || path,
      content,
      isOpen: true,
      isDirty: content !== String(tab.savedContent ?? ""),
      version: documentContext?.version ?? null
    };
  }

  /**
   * Apply external source content while preserving the file's saved baseline.
   * @param {string} path Local source path.
   * @param {string} content Replacement content.
   * @returns {Promise<object>} Updated tab.
   */
  async function applyExternalDocumentContent(path, content, options = {}) {
    let tab = findTabForSourceFile({ path });
    if (!tab) {
      tab = await openDocumentSourceFile({
        name: getFileName(path),
        path,
        ...(options.createMissing ? { content: "" } : {})
      }, { temporary: false, pinExisting: true });
    }
    if (!tab) throw new Error(`Unable to open external edit target: ${path}`);
    const normalizedContent = normalizeEditorContent(content);
    tab.content = normalizedContent;
    updateTabSourceContent(tab, normalizedContent);
    if (tab.id === activeTabId) {
      setActiveEditorContent(normalizedContent);
      activateEditableDocumentTab(tab, { forceRender: true });
    } else {
      destroyManagedTabView(tab.id);
    }
    markCurrentTabSessionDirty();
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
    return tab;
  }

  async function saveExternalDocuments(paths) {
    saveCurrentTabState();
    for (const path of paths || []) {
      const tab = findTabForSourceFile({ path });
      if (tab && tabHasPendingChanges(tab) && !await saveChangedTab(tab)) return false;
    }
    return true;
  }

  async function syncExternalResourceContent(path, content, options = {}) {
    let tab = findTabForSourceFile({ path });
    if (!tab && options.open) {
      tab = await openDocumentSourceFile({ name: getFileName(path), path }, { temporary: false, pinExisting: true });
    }
    if (!tab) return null;
    const normalizedContent = normalizeEditorContent(content);
    tab.content = normalizedContent;
    tab.savedContent = normalizedContent;
    updateTabSourceContent(tab, normalizedContent);
    if (tab.id === activeTabId) setActiveEditorContent(normalizedContent);
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
    return tab;
  }

  async function applyExternalResourceDelete(path) {
    const tab = findTabForSourceFile({ path });
    if (!tab) return false;
    await closeTab(tab.id, { promptForUnsaved: false });
    return true;
  }

  function applyExternalResourceRename(oldPath, newPath) {
    const tab = findTabForSourceFile({ path: oldPath });
    if (!tab) return null;
    tab.sourceFilePath = newPath;
    tab.sourceFileName = getFileName(newPath);
    if (tab.openedSource) {
      tab.openedSource = normalizeOpenedSource({
        ...tab.openedSource,
        path: newPath,
        name: tab.sourceFileName
      });
    }
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    void editorViewManager?.refreshLicenseHeaderForTab?.(tab.id);
    return tab;
  }

  function findGraphTabForSourceFile(sourceFile) {
    if (!sourceFile) return null;

    if (sourceFile.handle) {
      const handleMatch = tabs.find(function(tab) {
        return tab.type === "graph" && tab.sourceFileHandle === sourceFile.handle;
      });
      if (handleMatch) return handleMatch;
    }

    if (sourceFile.path) {
      const sourcePathKey = getComparableTabSourcePath(sourceFile.path);
      const pathMatch = tabs.find(function(tab) {
        return tab.type === "graph" && getComparableTabSourcePath(tab.sourceFilePath || "") === sourcePathKey;
      });
      if (pathMatch) return pathMatch;
      return null;
    }

    const title = sourceFile.name ? getGraphTitleFromFileName(sourceFile.name) : null;
    return tabs.find(function(tab) {
      return tab.type === "graph" && ((sourceFile.name && tab.sourceFileName === sourceFile.name) || (title && tab.title === title));
    }) || null;
  }

  function showSavedGraphMissingPathDialog() {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "saved-graph-missing-file-modal";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "saved-graph-missing-file-title");
      overlay.innerHTML = `
        <div class="saved-graph-missing-file-dialog">
          <p id="saved-graph-missing-file-title" class="saved-graph-missing-file-message">This file no longer exists at the saved path.</p>
          <div class="saved-graph-missing-file-actions">
            <button class="tool-button saved-graph-locate-file" type="button">Locate file</button>
            <button class="tool-button saved-graph-remove-file" type="button">Remove from graph</button>
            <button class="tool-button saved-graph-cancel-file" type="button">Cancel</button>
          </div>
        </div>
      `;

      const cleanup = (action) => {
        overlay.remove();
        resolve(action);
      };

      overlay.querySelector(".saved-graph-locate-file")?.addEventListener("click", () => cleanup("locate"));
      overlay.querySelector(".saved-graph-remove-file")?.addEventListener("click", () => cleanup("remove"));
      overlay.querySelector(".saved-graph-cancel-file")?.addEventListener("click", () => cleanup("cancel"));
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) cleanup("cancel");
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") cleanup("cancel");
      });

      document.body.appendChild(overlay);
      overlay.querySelector(".saved-graph-locate-file")?.focus({ preventScroll: true });
    });
  }

  async function locateReplacementMarkdownFileForSavedGraphNode() {
    if (isNeutralinoRuntime() && Neutralino.os?.showOpenDialog) {
      const selected = await Neutralino.os.showOpenDialog("Locate Markdown file", {
        multiSelections: false,
        filters: [{ name: "Markdown files", extensions: ["md", "markdown"] }]
      });
      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (!selectedPath) return null;
      return {
        name: getFileName(selectedPath),
        path: selectedPath,
        content: await Neutralino.filesystem.readFile(selectedPath)
      };
    }

    if (typeof window.showOpenFilePicker === "function") {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "Markdown files",
            accept: { "text/markdown": [".md", ".markdown"], "text/plain": [".md", ".markdown"] }
          }
        ]
      });
      const handle = handles && handles[0];
      if (!handle) return null;
      const file = await handle.getFile();
      return {
        name: file.name || handle.name || "document.md",
        handle,
        content: await file.text()
      };
    }

    alert("Locate file is available in browsers that support the file picker or in the desktop app.");
    return null;
  }

  async function openLocatedSavedGraphFile(graphNode) {
    try {
      const locatedFile = await locateReplacementMarkdownFileForSavedGraphNode();
      if (!locatedFile) return null;
      return openDocumentSourceFile({
        name: locatedFile.name,
        handle: locatedFile.handle || null,
        path: locatedFile.path || null,
        content: normalizeEditorContent(locatedFile.content || "")
      }, {
        temporary: false,
        title: getMarkdownTitleFromFileName(locatedFile.name || graphNode?.label || "document.md")
      });
    } catch (error) {
      if (error && error.name === "AbortError") return null;
      console.error("Failed to locate saved graph file:", error);
      alert("Unable to open the located file.");
      return null;
    }
  }

  function removeSavedGraphNodeFromActiveTab(nodeId) {
    const activeGraphTab = tabs.find((tab) => tab.id === activeTabId && tab.type === "graph");
    if (!activeGraphTab?.graphSnapshot || !nodeId) return;
    activeGraphTab.graphSnapshot = {
      ...activeGraphTab.graphSnapshot,
      nodes: (activeGraphTab.graphSnapshot.nodes || []).filter((node) => node.id !== nodeId),
      links: (activeGraphTab.graphSnapshot.links || []).filter((link) => {
        const sourceId = link.source?.id || link.source;
        const targetId = link.target?.id || link.target;
        return sourceId !== nodeId && targetId !== nodeId;
      }),
      files: (activeGraphTab.graphSnapshot.files || []).filter((file) => file.id !== nodeId)
    };
    activeGraphTab.graphDocument = serializeGraphTab(activeGraphTab, { documentType: GRAPH_DOCUMENT_TYPE_VIEW });
    markGraphTabAsChanged(activeGraphTab);
    saveTabsToStorage(tabs);
    graphRenderCache.delete(activeGraphTab.id);
    renderGraphView();
  }

  async function handleMissingSavedGraphNodePath(graphNode) {
    const action = await showSavedGraphMissingPathDialog();
    if (action === "locate") return openLocatedSavedGraphFile(graphNode);
    if (action === "remove") removeSavedGraphNodeFromActiveTab(graphNode?.id);
    return null;
  }

  async function openGraphNodeFileInPermanentTab(graphNode) {
    if (!graphNode) return null;

    const activeGraphTab = tabs.find((tab) => tab.id === activeTabId && tab.type === "graph");
    const keepSavedMode = isKeepSavedGraphMode(activeGraphTab);
    const snapshotFile = activeGraphTab?.graphSnapshot?.files?.find((file) => file.id === graphNode.id)
      || deps.createGraphFileDataFromNode?.(graphNode);
    const folderEntry = keepSavedMode ? null : (folderMarkdownFiles || []).find(function(entry) {
      return getGraphFileEntryNodeId(entry) === graphNode.id;
    });
    const fileEntry = snapshotFile || folderEntry;
    const readableFileEntry = keepSavedMode
      ? snapshotFile
      : ((fileEntry && typeof fileEntry.content === "string") ? fileEntry : (folderEntry || fileEntry));

    if (!fileEntry) {
      alert("Unable to find the selected file in this graph snapshot.");
      return null;
    }

    if (keepSavedMode && readableFileEntry?.content === undefined && !readableFileEntry?.handle && !(isNeutralinoRuntime() && readableFileEntry?.fullPath)) {
      return handleMissingSavedGraphNodePath(graphNode);
    }

    const path = fileEntry.path || fileEntry.file?.webkitRelativePath || fileEntry.file?.name || graphNode.fullPath || null;
    const name = fileEntry.name || getFileName(path || graphNode.fullPath || graphNode.label || "document.md");
    const sourceFile = {
      name,
      handle: fileEntry.handle || readableFileEntry?.handle || null,
      path: fileEntry.fullPath || readableFileEntry?.fullPath || path
    };

    try {
      const content = await readFolderMarkdownFileContent(readableFileEntry);
      if (content === undefined || content === null) throw new Error("No readable Markdown file was provided.");
      if (!sourceFile.handle && readableFileEntry?.handle) sourceFile.handle = readableFileEntry.handle;
      if (readableFileEntry?.fullPath) sourceFile.path = readableFileEntry.fullPath;

      return openDocumentSourceFile(
        { ...sourceFile, content },
        { temporary: false, title: getMarkdownTitleFromFileName(name) }
      );
    } catch (error) {
      console.error("Failed to open graph node file:", error);
      if (keepSavedMode) return handleMissingSavedGraphNodePath(graphNode);
      alert("Unable to open selected file.");
      return null;
    }
  }

  function newTab(content, title, options) {
    if (options === undefined) options = {};
    if (content === undefined) content = '';
    if (hasReachedOpenTabLimit('open a new one')) {
      return;
    }
    if (!title) title = nextUntitledTitle();
    const tab = createTab(content, title, options.viewMode || getDefaultViewModeForNewMarkdownDocument(), options);
    tabs.push(tab);
    const wasEmptyWorkspace = !activeTabId;
    if (wasEmptyWorkspace) {
      activeTabId = tab.id;
      saveActiveTabId(activeTabId);
      refreshGraphModeNotices(tab);
      activateManagedTabView(tab);
      activateEditableDocumentTab(tab);
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
    } else {
      switchTab(tab.id);
    }
    return tab;
  }

  async function confirmCloseImageEditorTab(tab) {
    const choice = await app.services?.notify?.show?.({
      title: "Unsaved image",
      message: `Save changes to ${tab.sourceFileName || "this image"} before closing?`,
      dismissValue: "cancel",
      buttons: [
        { id: "cancel", label: "Cancel", value: "cancel", variant: "cancel" },
        { id: "discard", label: "Discard", value: "discard", variant: "danger" },
        { id: "save", label: "Save", value: "save", variant: "primary", autoFocus: true }
      ]
    });
    if (choice === "save") return await deps.imageEditor?.saveTab?.(tab) === true;
    return choice === "discard";
  }

  async function confirmCloseDiagramEditorTab(tab) {
    const choice = await app.services?.notify?.show?.({
      title: "Unsaved diagram",
      message: `Save changes to ${tab.sourceFileName || "this diagram"} before closing?`,
      dismissValue: "cancel",
      buttons: [
        { id: "cancel", label: "Cancel", value: "cancel", variant: "cancel" },
        { id: "discard", label: "Discard", value: "discard", variant: "danger" },
        { id: "save", label: "Save", value: "save", variant: "primary", autoFocus: true }
      ]
    });
    if (choice === "save") return await deps.diagramEditor?.saveTab?.(tab) === true;
    return choice === "discard";
  }

  async function closeTab(tabId, options) {
    if (options === undefined) options = {};
    const tabToClose = tabs.find(function(t) { return t.id === tabId; });
    if (!tabToClose) return;
    const hasUnsavedChanges = tabHasPendingChanges(tabToClose);
    if (tabToClose.type === "image-editor" && hasUnsavedChanges) {
      if (!await confirmCloseImageEditorTab(tabToClose)) return;
    } else if (tabToClose.type === "diagram-editor" && hasUnsavedChanges) {
      if (!await confirmCloseDiagramEditorTab(tabToClose)) return;
    } else if (options.promptForUnsaved && hasUnsavedChanges) {
      const shouldClose = await confirmCloseUnsavedTabs('You have unsaved changes. Are you sure you want to close this tab?');
      if (!shouldClose) return;
    }

    const idx = tabs.findIndex(function(t) { return t.id === tabId; });
    if (idx === -1) return;
    if (options.recordInHistory !== false) deps.closedTabHistory?.record?.(tabToClose);
    if (deps.tabSessionPersistence?.cleanupDraftForTab) {
      void deps.tabSessionPersistence.cleanupDraftForTab(tabToClose);
    }
    deps.onTabClosed?.(tabToClose);
    const cachedGraphRender = graphRenderCache.get(tabId);
    if (cachedGraphRender) {
      if (cachedGraphRender.simulation) cachedGraphRender.simulation.stop();
      if (cachedGraphRender.wrapper) cachedGraphRender.wrapper.remove();
      graphRenderCache.delete(tabId);
    }
    destroyManagedTabView(tabId);
    tabs.splice(idx, 1);
    if (tabs.length === 0) {
      activeTabId = null;
      saveActiveTabId(activeTabId);
      if (deps.tabSessionPersistence?.cleanupAllDrafts) {
        void deps.tabSessionPersistence.cleanupAllDrafts();
      }
      refreshGraphModeNotices(null);
      activateDocumentTabChrome();
      setNoOpenTabsMode(true);
      setActiveEditorContent("");
      restoreViewMode('split');
      if (typeof refreshActiveResizeTarget === "function") refreshActiveResizeTarget();
      if (typeof refreshEditorLineNumberResizeObserver === "function") refreshEditorLineNumberResizeObserver();
      renderEditorSyntaxHighlights();
      renderMarkdown();
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      deps.onActiveTabChanged?.(null);
      return;
    } else if (activeTabId === tabId) {
      const newIdx = Math.max(0, idx - 1);
      activeTabId = tabs[newIdx].id;
      saveActiveTabId(activeTabId);
      const newActiveTab = tabs[newIdx];
      refreshGraphModeNotices(newActiveTab);
      activateManagedTabView(newActiveTab);
      if (newActiveTab.type === 'graph') {
        setViewMode('preview');
        setGraphViewMode(true);
        updateActiveGraphStatusLine(newActiveTab);
        renderTabBar(tabs, activeTabId);
        syncFolderTreeSelectionToActiveTab();
        deps.onActiveTabChanged?.(newActiveTab);
        if (activateReusableGraphRender(newActiveTab)) {
          saveTabsToStorage(tabs);
          return;
        }
        renderGraphView();
        saveTabsToStorage(tabs);
        return;
      }
      if (newActiveTab.type === "large-file" || newActiveTab.type === "file-preview" || newActiveTab.type === "image-editor" || newActiveTab.type === "diagram-editor" || newActiveTab.type === "hex-editor" || newActiveTab.type === "file-compare" || newActiveTab.type === "api-client" || newActiveTab.type === "regex-tester" || newActiveTab.type === "base64-tool" || newActiveTab.type === "certificate-decoder" || newActiveTab.type === "jwt-tool" || newActiveTab.type === "json-yaml-tool" || newActiveTab.type === "jsonpath-tool" || newActiveTab.type === "xml-tree-grid" || newActiveTab.type === "kubernetes-topology") {
        setActiveEditorContent("");
        setViewMode("preview");
        setGraphViewMode(false);
        if (typeof updateDocumentStats === "function") updateDocumentStats();
        renderTabBar(tabs, activeTabId);
        syncFolderTreeSelectionToActiveTab();
        deps.onActiveTabChanged?.(newActiveTab);
        saveTabsToStorage(tabs);
        return;
      }
      activateEditableDocumentTab(newActiveTab);
      deps.onActiveTabChanged?.(newActiveTab);
    }
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
  }

  function renameUnsourcedTabTitle(tab) {
    const modal = document.getElementById('rename-modal');
    const input = document.getElementById('rename-modal-input');
    const confirmBtn = document.getElementById('rename-modal-confirm');
    const cancelBtn = document.getElementById('rename-modal-cancel');
    const title = document.getElementById('rename-modal-title');
    if (!modal || !input || !confirmBtn || !cancelBtn) return;
    if (title) title.textContent = 'Rename tab';
    input.placeholder = 'Tab name';
    input.value = tab.title;
    confirmBtn.textContent = 'Rename';
    modal.style.display = 'flex';
    input.focus();
    input.select();

    function doRename() {
      const newName = input.value.trim();
      if (newName) {
        tab.title = newName;
        saveTabsToStorage(tabs);
        renderTabBar(tabs, activeTabId);
      }
      modal.style.display = 'none';
      cleanup();
    }

    function cleanup() {
      confirmBtn.removeEventListener('click', doRename);
      cancelBtn.removeEventListener('click', doCancel);
      input.removeEventListener('keydown', onKey);
    }

    function doCancel() {
      modal.style.display = 'none';
      cleanup();
    }

    function onKey(e) {
      if (e.key === 'Enter') doRename();
      else if (e.key === 'Escape') doCancel();
    }

    confirmBtn.addEventListener('click', doRename);
    cancelBtn.addEventListener('click', doCancel);
    input.addEventListener('keydown', onKey);
  }

  async function renameTab(tabId) {
    const tab = tabs.find(function(t) { return t.id === tabId; });
    if (!tab) return;

    const sourceName = tab.sourceFileName || (tab.sourceFilePath ? getFileName(tab.sourceFilePath) : tab.sourceFileHandle?.name);
    if (!sourceName || (!tab.sourceFileHandle && !tab.sourceFilePath)) {
      renameUnsourcedTabTitle(tab);
      return;
    }

    try {
      await renameSidebarNodeOnDisk({
        kind: "file",
        name: sourceName,
        handle: tab.sourceFileHandle || null,
        fullPath: isNeutralinoRuntime() ? tab.sourceFilePath : null,
        path: tab.sourceFilePath || null
      }, "file");
    } catch (error) {
      console.error("Failed to rename tab source file:", error);
      alert("Unable to rename this file.");
    }
  }

  function getTabSourceFileName(tab) {
    return tab?.sourceFileName || (tab?.sourceFilePath ? getFileName(tab.sourceFilePath) : "") || tab?.sourceFileHandle?.name || "";
  }

  function addCopySuffixToFileName(fileName) {
    const name = String(fileName || "").trim();
    if (!name) return "";
    const slashIndex = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
    const pathPrefix = slashIndex >= 0 ? name.slice(0, slashIndex + 1) : "";
    const leafName = slashIndex >= 0 ? name.slice(slashIndex + 1) : name;
    const dotIndex = leafName.lastIndexOf(".");
    if (dotIndex > 0) {
      return `${pathPrefix}${leafName.slice(0, dotIndex)} (copy)${leafName.slice(dotIndex)}`;
    }
    return `${pathPrefix}${leafName} (copy)`;
  }

  function getDuplicateTabTitle(tab, copySourceFileName) {
    if (copySourceFileName) {
      return isMarkdownPath(copySourceFileName) ? getMarkdownTitleFromFileName(copySourceFileName) : copySourceFileName;
    }
    return `${tab.title || "Untitled"} (copy)`;
  }

  async function duplicateImageEditorTab(tab, tabId) {
    const draftBytes = await deps.imageEditor?.getDraftBinary?.(tab);
    if (!draftBytes) return;
    const originalName = getTabSourceFileName(tab) || tab.imageEditorSource?.name;
    const projectName = /\.mdimage$/i.test(originalName || "") ? originalName : String(originalName || "Image").replace(/\.[^.]+$/, "") + ".mdimage";
    const sourceName = addCopySuffixToFileName(projectName) || 'Image (copy).mdimage';
    const source = { blank: true, name: sourceName, mimeType: 'application/vnd.md-editor.image+zip' };
    source.width = tab.imageEditorState?.width;
    source.height = tab.imageEditorState?.height;
    const dup = createImageEditorTab(source, sourceName + ' \u2014 Image Editor', {
      temporary: false,
      state: { ...(tab.imageEditorState || {}), mimeType: 'application/vnd.md-editor.image+zip' },
      dirty: true,
      draftBytes
    });
    const idx = tabs.findIndex(function(t) { return t.id === tabId; });
    if (idx < 0) return;
    tabs.splice(idx + 1, 0, dup);
    switchTab(dup.id);
  }

  async function duplicateTab(tabId) {
    const tab = tabs.find(function(t) { return t.id === tabId; });
    if (!tab) return;
    if (tab.type === "regex-tester" || tab.type === "base64-tool" || tab.type === "certificate-decoder" || tab.type === "jwt-tool" || tab.type === "json-yaml-tool" || tab.type === "jsonpath-tool" || tab.type === "xml-tree-grid" || tab.type === "uuid-tool" || tab.type === "qr-tool" || tab.type === "hash-tool" || tab.type === "json-array-table-tool" || tab.type === "text-escape-tool" || tab.type === "kubernetes-topology") return;
    if (hasReachedOpenTabLimit('open a new one')) {
      return;
    }
    saveCurrentTabState();
    if (tab.type === 'image-editor') {
      await duplicateImageEditorTab(tab, tabId);
      return;
    }
    if (tab.type === "large-file") {
      const dup = createLargeFileTab(tab.largeFileSource, `${tab.title || "Large file"} (copy)`);
      tabs.splice(tabs.findIndex(function(t) { return t.id === tabId; }) + 1, 0, dup);
      switchTab(dup.id);
      return;
    }
    if (tab.type === "hex-editor") {
      const dup = createHexEditorTab(tab.hexEditorSource, `${tab.title || "Hex Editor"} (copy)`, { state: tab.hexEditorState });
      tabs.splice(tabs.findIndex(function(t) { return t.id === tabId; }) + 1, 0, dup);
      switchTab(dup.id);
      return;
    }
    if (tab.type === "file-preview") {
      const dup = createFilePreviewTab(tab.filePreviewSource, `${tab.title || "File preview"} (copy)`);
      tabs.splice(tabs.findIndex(function(t) { return t.id === tabId; }) + 1, 0, dup);
      switchTab(dup.id);
      return;
    }
    if (tab.type === "api-client") {
      const dup = createApiClientTab({ temporary: false, title: `${tab.title || "API Client"} (copy)`, request: tab.apiClient || {}, history: tab.apiClient?.history || [] });
      dup.apiClient.savedRequestId = null;
      dup.apiClient.historyEntry = null;
      dup.apiClient.historyEntryKey = null;
      tabs.splice(tabs.findIndex(function(t) { return t.id === tabId; }) + 1, 0, dup);
      switchTab(dup.id);
      return;
    }
    if (tab.type === "file-compare") {
      const dup = createFileCompareTab(tab.fileCompare, { temporary: false });
      dup.title = `${tab.title || "Compare files"} (copy)`;
      tabs.splice(tabs.findIndex(function(t) { return t.id === tabId; }) + 1, 0, dup);
      switchTab(dup.id);
      return;
    }
    const copySourceFileName = addCopySuffixToFileName(getTabSourceFileName(tab));
    const dupTitle = getDuplicateTabTitle(tab, copySourceFileName);
    const dup = createTab(tab.content, dupTitle, isPreviewableDocumentTab(tab) ? tab.viewMode : 'editor', {
      linkBasePath: tab.linkBasePath,
      splitViewEditorWidthPercent: tab.splitViewEditorWidthPercent
    });
    dup.savedContent = `${tab.content || ""}\n`;
    dup.sourceFileName = copySourceFileName || null;
    setTabOpenedSource(dup, null);
    dup.isUnsupportedFile = isUnsupportedFileTab(tab);
    dup.largeFileView = tab.largeFileView ? { ...tab.largeFileView } : null;
    dup.transformedForViewing = tab.transformedForViewing === true;
    const idx = tabs.findIndex(function(t) { return t.id === tabId; });
    tabs.splice(idx + 1, 0, dup);
    switchTab(dup.id);
  }

  function confirmCloseUnsavedTabs(message) {
    return app.services?.confirm
      ? app.services.confirm({
          title: "Unsaved changes",
          message,
          confirmLabel: "OK",
          confirmVariant: "danger"
        })
      : Promise.resolve(window.confirm(message));
  }

  async function confirmCloseTabsIfNeeded(tabsToClose) {
    const unsavedTabsToClose = tabsToClose.filter(function(tab) {
      return tab.type !== "image-editor" && tab.type !== "diagram-editor" && tabHasPendingChanges(tab);
    });
    if (unsavedTabsToClose.length === 0) return true;
    if (unsavedTabsToClose.length === 1) {
      return confirmCloseUnsavedTabs('You have unsaved changes. Are you sure you want to close this tab?');
    }
    return confirmCloseUnsavedTabs('You have unsaved changes in ' + unsavedTabsToClose.length + ' tabs. Are you sure you want to close them?');
  }

  async function closeTabsByIds(tabIds, options) {
    if (options === undefined) options = {};
    saveCurrentTabState();
    const idsToClose = Array.from(new Set(tabIds));
    const tabsToClose = idsToClose
      .map(function(tabId) { return tabs.find(function(tab) { return tab.id === tabId; }); })
      .filter(Boolean);
    if (tabsToClose.length === 0 || (options.promptForUnsaved !== false && !await confirmCloseTabsIfNeeded(tabsToClose))) return;
    for (const tabId of idsToClose) {
      await closeTab(tabId, { promptForUnsaved: false, allowEmpty: options.allowEmpty, recordInHistory: options.recordInHistory });
    }
  }

  async function closeOtherTabsByIds(tabIds) {
    const targetTabIds = getOrderedExistingTabIds(tabIds);
    if (targetTabIds.length === 0 || tabs.length <= targetTabIds.length) return;
    const targetTabIdSet = new Set(targetTabIds);
    const preferredActiveTabId = targetTabIdSet.has(activeTabId) ? activeTabId : targetTabIds[0];
    await closeTabsByIds(tabs
      .filter(function(tab) { return !targetTabIdSet.has(tab.id); })
      .map(function(tab) { return tab.id; }));
    const fallbackActiveTabId = tabs.some(function(tab) { return tab.id === preferredActiveTabId; })
      ? preferredActiveTabId
      : targetTabIds.find(function(tabId) { return tabs.some(function(tab) { return tab.id === tabId; }); });
    if (fallbackActiveTabId && activeTabId !== fallbackActiveTabId) {
      switchTab(fallbackActiveTabId);
    }
  }

  async function closeOtherTabs(tabId) {
    await closeOtherTabsByIds([tabId]);
  }

  async function closeUnchangedTabs() {
    saveCurrentTabState();
    const unchangedTabIds = tabs
      .filter(function(tab) { return !tabHasPendingChanges(tab); })
      .map(function(tab) { return tab.id; });
    await closeTabsByIds(unchangedTabIds, { allowEmpty: true, promptForUnsaved: false });
  }

  async function reopenClosedTab() {
    if (hasReachedOpenTabLimit('reopen a closed one')) {
      return null;
    }
    const descriptor = deps.closedTabHistory?.pop?.() || null;
    if (!descriptor) return null;
    if (!await deps.closedTabHistory.sourceExists(descriptor)) {
      alert("The last closed tab could not be reopened because its source file no longer exists.");
      return null;
    }
    try {
      const restoredSession = await deps.tabSessionPersistence.restoreTabsFromPayload({
        version: deps.tabSessionPersistence.SESSION_VERSION,
        activeTabId: descriptor.id,
        tabs: [descriptor]
      });
      const reopenedTab = restoredSession.tabs[0] || null;
      if (!reopenedTab || reopenedTab.missingSource) throw new Error("The closed tab source could not be restored.");
      reopenedTab.isTemporary = false;
      tabs.push(reopenedTab);
      switchTab(reopenedTab.id);
      saveTabsToStorage(tabs);
      return reopenedTab;
    } catch (error) {
      console.error("Failed to reopen closed tab:", error);
      alert("The last closed tab could not be reopened.");
      return null;
    }
  }

  async function closeAllTabs(options) {
    if (options === undefined) options = {};
    if (tabs.length === 0) return;
    await closeTabsByIds(tabs.map(function(tab) { return tab.id; }), { allowEmpty: true, promptForUnsaved: options.promptForUnsaved, recordInHistory: options.recordInHistory });
  }

  function resetAllTabs() {
    const modal = document.getElementById('reset-confirm-modal');
    const confirmBtn = document.getElementById('reset-modal-confirm');
    const cancelBtn = document.getElementById('reset-modal-cancel');
    if (!modal) return;
    modal.style.display = 'flex';

    function doReset() {
      modal.style.display = 'none';
      cleanup();
      closeAllTabs({ promptForUnsaved: false, recordInHistory: false });
      untitledCounter = 0;
      saveUntitledCounter(0);
    }

    function doCancel() {
      modal.style.display = 'none';
      cleanup();
    }

    function cleanup() {
      confirmBtn.removeEventListener('click', doReset);
      cancelBtn.removeEventListener('click', doCancel);
    }

    confirmBtn.addEventListener('click', doReset);
    cancelBtn.addEventListener('click', doCancel);
  }

  async function initTabs() {
    const startupPerf = window.markdownViewerStartupPerf || null;
    startupPerf?.mark?.("tabs.init start");
    untitledCounter = loadUntitledCounter();
    const startupBehavior = typeof getStartupBehavior === "function" ? getStartupBehavior() : "last-tabs";
    const restoreLastTabs = startupBehavior === "last-tabs";
    persistCurrentSessionOnLifecycle = restoreLastTabs;
    if (typeof appDebugLog === "function") {
      void appDebugLog("info", "[tabs-session] Initializing tabs", {
        startupBehavior,
        restoreLastTabs,
        persistCurrentSessionOnLifecycle
      });
    }
    const storedSessionPayload = restoreLastTabs ? loadTabsFromStorage() : null;
    startupPerf?.mark?.("tabs.init storage payload loaded", {
      restoreLastTabs,
      storedCount: Array.isArray(storedSessionPayload?.tabs) ? storedSessionPayload.tabs.length : 0
    });
    const restoredSession = restoreLastTabs && deps.tabSessionPersistence?.restoreTabsFromPayload
      ? await deps.tabSessionPersistence.restoreTabsFromPayload(storedSessionPayload)
      : { tabs: [], activeTabId: null };
    startupPerf?.mark?.("tabs.init descriptors restored", {
      restoredCount: Array.isArray(restoredSession.tabs) ? restoredSession.tabs.length : 0
    });
    tabs = Array.isArray(restoredSession.tabs) ? restoredSession.tabs : [];
    tabs.forEach(function(tab) {
      tab.content = normalizeEditorContent(tab.content);
      if (typeof tab.savedContent !== 'string') tab.savedContent = tab.content || '';
      tab.savedContent = normalizeEditorContent(tab.savedContent);
      if (!tab.type) tab.type = 'markdown';
      tab.parseAsLanguageId = normalizeTabLanguageOverride(tab.parseAsLanguageId);
    });
    deps.closedTabHistory?.reconcileOpenTabs?.(tabs);
    activeTabId = restoreLastTabs ? (restoredSession.activeTabId || loadActiveTabId()) : null;
    if (tabs.length === 0) {
      if (startupBehavior !== "welcome" && startupBehavior !== "untitled") {
        if (typeof appDebugLog === "function") {
          void appDebugLog("info", "[tabs-session] Startup opened empty workspace", {
            startupBehavior
          });
        }
        activateDocumentTabChrome();
        setNoOpenTabsMode(true);
        setActiveEditorContent("");
        restoreViewMode('split');
        if (typeof refreshActiveResizeTarget === "function") refreshActiveResizeTarget();
        if (typeof refreshEditorLineNumberResizeObserver === "function") refreshEditorLineNumberResizeObserver();
        renderEditorSyntaxHighlights();
        renderMarkdown();
        renderTabBar(tabs, activeTabId);
        return;
      }
      const tab = startupBehavior === "untitled"
        ? createTab('', nextUntitledTitle())
        : createTab(sampleMarkdown, 'Welcome to MD-Editor');
      tabs.push(tab);
      activeTabId = tab.id;
      if (typeof appDebugLog === "function") {
        void appDebugLog("info", "[tabs-session] Startup created fallback tab", {
          startupBehavior,
          title: tab.title,
          restoreLastTabs
        });
      }
      if (restoreLastTabs) {
        saveTabsToStorage(tabs);
        saveActiveTabId(activeTabId);
      }
    } else if (!tabs.find(function(t) { return t.id === activeTabId; })) {
      activeTabId = tabs[0].id;
      if (typeof appDebugLog === "function") {
        void appDebugLog("warning", "[tabs-session] Saved active tab id was missing; selected first restored tab", {
          activeTabId,
          restoredCount: tabs.length
        });
      }
      saveActiveTabId(activeTabId);
    }
    const activeTab = tabs.find(function(t) { return t.id === activeTabId; });
    if (typeof appDebugLog === "function") {
      void appDebugLog("info", "[tabs-session] Startup resolved active tab", {
        activeTabId,
        activeTitle: activeTab?.title || null,
        restoredCount: tabs.length,
        restoredTitles: tabs.map((tab) => tab?.title).filter(Boolean)
      });
    }
    activateManagedTabView(activeTab);
    startupPerf?.mark?.("tabs.init active tab view activated", {
      activeType: activeTab?.type || null,
      activeTitle: activeTab?.title || null
    });
    if (typeof refreshActiveResizeTarget === "function") refreshActiveResizeTarget();
    if (typeof refreshEditorLineNumberResizeObserver === "function") refreshEditorLineNumberResizeObserver();
    if (activeTab.type === 'graph') {
      setNoOpenTabsMode(false);
      setViewMode('preview');
      setGraphViewMode(true);
      updateActiveGraphStatusLine(activeTab);
      renderTabBar(tabs, activeTabId);
      if (activateReusableGraphRender(activeTab)) return;
      renderGraphView();
      startupPerf?.mark?.("tabs.init graph startup rendered");
      return;
    }
    if (activeTab.type === "large-file" || activeTab.type === "file-preview" || activeTab.type === "image-editor" || activeTab.type === "diagram-editor" || activeTab.type === "hex-editor" || activeTab.type === "file-compare" || activeTab.type === "api-client" || activeTab.type === "openapi-editor" || activeTab.type === "openapi-preview" || activeTab.type === "soap-client" || activeTab.type === "base64-tool" || activeTab.type === "certificate-decoder" || activeTab.type === "jwt-tool" || activeTab.type === "json-yaml-tool" || activeTab.type === "jsonpath-tool" || activeTab.type === "xml-tree-grid" || activeTab.type === "kubernetes-topology") {
      setActiveEditorContent("");
      setNoOpenTabsMode(false);
      setViewMode("preview");
      setGraphViewMode(false);
      if (typeof updateDocumentStats === "function") updateDocumentStats();
      renderTabBar(tabs, activeTabId);
      startupPerf?.mark?.(`tabs.init ${activeTab.type} startup rendered`);
      return;
    }
    activateEditableDocumentTab(activeTab, { focus: false });
    renderTabBar(tabs, activeTabId);
    startupPerf?.mark?.("tabs.init editable startup rendered");
  }


    Object.assign(api, {
      nextUntitledTitle,
      createTab,
      createGraphTab,
      normalizeOpenedSource,
      createOpenedSource,
      createOpenedSourceFromSourceFile,
      setTabOpenedSource,
      normalizeGraphScopePath,
      createFolderGraphScopeKey,
      getRootFolderGraphScopeKey,
      findExistingFolderGraphTab,
      focusExistingFolderGraphTab,
      getGraphTitleFromFileName,
      getGraphTabTitle,
      getTabDisplayName,
      getTabTooltipText,
      updateTabScrollControls,
      scrollTabsBy,
      setupTabScrolling,
      renderTabBar,
      renderMobileTabList,
      ensureTabContextMenu,
      positionTabContextMenu,
      setTabContextMenuActionEnabled,
      updateTabContextMenuActionStates,
      showTabContextMenu,
      hideTabContextMenu,
      getTabContainingFolderPath,
      getTabProjectFolderSeeds,
      isProjectDerivedTab,
      resolveTabProjectFolderPath,
      resolveTabProjectFolderTarget,
      openTabProjectFolder,
      saveCurrentTabState,
      markCurrentTabSessionDirty,
      getActiveMarkdownTab,
      canReloadActiveTabFromDisk,
      reloadActiveTabFromDisk,
      activeTabHasUnsavedChanges,
      getUnsavedTabs,
      updateSaveCurrentFileButtons,
      saveChangedTab,
      saveAllChangedTabs,
      saveCurrentFileIfChanged,
      setActiveMarkdownTabViewMode,
      setActiveTabSplitViewWidthPercent,
      restoreViewMode,
      setNoOpenTabsMode,
      switchTab,
      clearTabSelection,
      pinTemporaryTab,
      findTemporaryTab,
      applySidebarFileMetadata,
      isUnsupportedSourceFile,
      isUnsupportedFileTab,
      isPreviewableDocumentTab,
      isMarkdownDocumentTab,
      isPreviewableSourceFile,
      getActiveTab,
      getAllowedViewModeForActiveTab,
      getDefaultViewModeForOpenedFile,
      createLargeFileTab,
      createFilePreviewTab,
      createImageEditorTab,
      createDiagramEditorTab,
      createHexEditorTab,
      createFileCompareTab,
      createApiClientTab,
      createOpenApiEditorTab,
      createOpenApiPreviewTab,
      createSoapClientTab,
      createKubernetesTopologyTab,
      createRegexTesterTab,
      createBase64ToolTab,
      createCertificateDecoderTab,
      createJwtToolTab,
      createJsonYamlToolTab,
      createJsonPathToolTab,
      createXPathToolTab,
      createXsltToolTab,
      createXmlTreeGridTab,
      createUuidToolTab,
      createQrToolTab,
      createHashToolTab,
      createJsonArrayTableToolTab,
      createTextEscapeToolTab,
      createUnicodeToolTab,
      createStringBytesToolTab,
      createDatabaseConnectionStringToolTab,
      activateSidebarTab,
      openSidebarFileInTab,
      openNewUnsavedFileInTab,
      openLargeFileInTab,
      openFilePreviewInTab,
      openImageEditorInTab,
      openBlankImageEditorInTab,
      openDiagramEditorInTab,
      openBlankDiagramEditorInTab,
      openHexEditorInTab,
      openFileCompareInTab,
      openKubernetesTopologyInTab,
      openOpenApiEditorInTab,
      openSwaggerUiPreviewInTab,
      openApiClientInTab,
      openSoapClientInTab,
      openRegexTesterInTab,
      openBase64ToolInTab,
      openCertificateDecoderInTab,
      openJwtToolInTab,
      openJsonYamlToolInTab,
      openJsonPathToolInTab,
      openXPathToolInTab,
      openXsltToolInTab,
      openXmlTreeGridTab,
      openUuidToolInTab,
      openQrToolInTab,
      openHashToolInTab,
      openJsonArrayTableToolInTab,
      openTextEscapeToolInTab,
      openUnicodeToolInTab,
      openStringBytesToolInTab,
      openDatabaseConnectionStringToolInTab,
      openSidebarFileInTemporaryTab,
      openSidebarFileInPermanentTab,
      findTabForSourceFile,
      getExternalDocumentSnapshot,
      applyExternalDocumentContent,
      saveExternalDocuments,
      syncExternalResourceContent,
      applyExternalResourceDelete,
      applyExternalResourceRename,
      findGraphTabForSourceFile,
      showSavedGraphMissingPathDialog,
      locateReplacementMarkdownFileForSavedGraphNode,
      openLocatedSavedGraphFile,
      removeSavedGraphNodeFromActiveTab,
      handleMissingSavedGraphNodePath,
      openGraphNodeFileInPermanentTab,
      newTab,
      closeTab,
      renameUnsourcedTabTitle,
      renameTab,
      duplicateTab,
      confirmCloseTabsIfNeeded,
      closeTabsByIds,
      closeOtherTabs,
      reopenClosedTab,
      closeAllTabs,
      resetAllTabs,
      initTabs,
    });
    }

    app.services.tabs = api;
    app.registerModule("tabs", api);
    return api;
  };
})(window);
