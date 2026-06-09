(function(global) {
  global.registerMarkdownViewerGraphRenderer = function registerMarkdownViewerGraphRenderer(app, deps) {
    let renderGraphView;
    let openGraphFindDialog;
    const GRAPH_RENDERER_D3 = "d3";

    with (deps) {
    let graphFindDialogBound = false;
    let graphFindTabId = "";

    const getActiveGraphRender = () => {
      const activeTab = tabs.find((tab) => tab.id === activeTabId && tab.type === "graph");
      if (!activeTab) return null;
      return graphRenderCache.get(activeTab.id) || null;
    };

    const setGraphFindStatus = (message) => {
      if (graphFindStatus) graphFindStatus.textContent = message || "";
    };

    const hideGraphFindDialog = () => {
      if (!graphFindDialog) return;
      graphFindDialog.classList.add("hidden");
      graphFindDialog.classList.remove("transparent");
      graphFindDialog.setAttribute("aria-hidden", "true");
      graphFindTabId = "";
      setGraphFindStatus("");
    };

    const restoreGraphFindDialogOpacity = () => {
      if (!graphFindDialog || graphFindDialog.classList.contains("hidden")) return;
      graphFindDialog.classList.remove("transparent");
      graphFindInput?.focus();
      graphFindInput?.select();
    };

    const getGraphFindRenderForDialog = () => {
      const activeRender = getActiveGraphRender();
      if (activeRender && (!graphFindTabId || activeRender.tabId === graphFindTabId)) return activeRender;
      const dialogRender = graphFindTabId ? graphRenderCache.get(graphFindTabId) : null;
      return dialogRender || activeRender;
    };

    const applyGraphFindFromDialog = () => {
      const activeRender = getGraphFindRenderForDialog();
      if (!activeRender) return;
      const result = typeof activeRender.applyFind === "function" ? activeRender.applyFind(graphFindInput?.value || "") : { count: 0, cleared: true };
      if (result.cleared) {
        hideGraphFindDialog();
        return;
      }
      if (result.count > 0) {
        setGraphFindStatus(`${result.count.toLocaleString()} match${result.count === 1 ? "" : "es"}`);
        graphFindDialog?.classList.add("transparent");
      } else {
        setGraphFindStatus("No matches");
        graphFindDialog?.classList.remove("transparent");
        graphFindInput?.focus();
        graphFindInput?.select();
      }
    };

    const cancelGraphFindFromDialog = () => {
      const activeRender = getGraphFindRenderForDialog();
      if (activeRender && typeof activeRender.clearFind === "function") activeRender.clearFind();
      hideGraphFindDialog();
    };

    const bindGraphFindDialog = () => {
      if (graphFindDialogBound || !graphFindDialog) return;
      graphFindDialogBound = true;
      graphFindOkButton?.addEventListener("click", (event) => {
        event.stopPropagation();
        applyGraphFindFromDialog();
      });
      graphFindCancelButton?.addEventListener("click", (event) => {
        event.stopPropagation();
        cancelGraphFindFromDialog();
      });
      graphFindInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          applyGraphFindFromDialog();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelGraphFindFromDialog();
        }
      });
      graphFindDialog.addEventListener("click", () => {
        if (graphFindDialog.classList.contains("transparent")) restoreGraphFindDialogOpacity();
      });
    };

    openGraphFindDialog = function openGraphFindDialog() {
      const activeTab = tabs.find((tab) => tab.id === activeTabId && tab.type === "graph");
      if (!activeTab || !graphFindDialog || !graphFindInput) return false;
      bindGraphFindDialog();
      graphFindTabId = activeTab.id;
      const cachedRender = graphRenderCache.get(activeTab.id);
      const showDialog = () => {
        graphFindDialog.classList.remove("hidden", "transparent");
        graphFindDialog.setAttribute("aria-hidden", "false");
        setGraphFindStatus("");
        graphFindInput.focus();
        graphFindInput.select();
      };
      if (cachedRender) {
        showDialog();
      } else {
        renderGraphView().then(showDialog).catch((error) => console.warn("Failed to prepare graph find dialog:", error));
      }
      return true;
    };

    renderGraphView = async function renderGraphView(options = {}) {
    if (!graphViewCanvas) return;
    const renderRequestId = ++graphRenderRequestId;
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    const graphPerf = typeof createGraphPerfSession === "function"
      ? createGraphPerfSession("graph render", {
        tabId: activeTab?.id || "",
        title: activeTab?.title || "",
        skipToolbar: Boolean(options.skipToolbar)
      })
      : null;
    let graphInteractiveAt = 0;
    const loggedGraphInteractions = new Set();
    const logGraphInteractionPerf = (name, details = {}) => {
      if (!graphPerf || !graphInteractiveAt || loggedGraphInteractions.has(name) || typeof performance === "undefined") return;
      loggedGraphInteractions.add(name);
      const afterRenderMs = Math.round((performance.now() - graphInteractiveAt) * 10) / 10;
      console.info(`[Perf] first graph interaction ${name} observed ${afterRenderMs}ms after render`, details);
    };
    let graphViewConfig = activeTab && activeTab.type === "graph" ? normalizeGraphViewConfig(activeTab.graphViewConfig) : normalizeGraphViewConfig(null);
    if (activeTab && activeTab.type === "graph") activeTab.graphViewConfig = graphViewConfig;
    hideInactiveGraphRenders(activeTab?.id);
    let graphLoadingLabel = null;
    const removeGraphLoadingState = () => {
      graphViewCanvas.querySelectorAll(".graph-loading-state, .folder-tree-placeholder").forEach((node) => node.remove());
      graphLoadingLabel = null;
    };
    const showGraphLoadingState = async (message = "Building graph view...") => {
      removeGraphLoadingState();
      const loadingState = document.createElement("div");
      loadingState.className = "graph-loading-state";
      loadingState.setAttribute("role", "status");
      loadingState.setAttribute("aria-live", "polite");
      const spinner = document.createElement("span");
      spinner.className = "graph-loading-spinner";
      spinner.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = message;
      graphLoadingLabel = label;
      loadingState.append(spinner, label);
      graphViewCanvas.appendChild(loadingState);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    };
    const updateGraphLoadingState = (message) => {
      if (graphLoadingLabel) graphLoadingLabel.textContent = message;
    };
    removeGraphLoadingState();
    if (!activeTab || activeTab.type !== "graph") {
      updateStatusLine({ visiblePointCount: 0, graphEdgeCount: 0, graphClusterCount: 0, graphCollapsedNodeCount: 0 });
      updateGraphTagToolbar(null, null);
      renderTagManagementList();
      graphPerf?.end({ reason: "no-active-graph-tab" });
      return;
    }

    renderTagManagementList();
    let graphSnapshot = activeTab.graphComparisonSnapshot || activeTab.graphSnapshot || null;
    if (!options.skipToolbar) updateGraphTagToolbar(activeTab, graphSnapshot);
    graphPerf?.mark("initial graph tab state", {
      hasSnapshot: Boolean(graphSnapshot),
      folderFiles: folderMarkdownFiles.length,
      savedGraphMode: Boolean(isKeepSavedGraphMode(activeTab))
    });
    if (!graphSnapshot && folderMarkdownFiles.length && !isKeepSavedGraphMode(activeTab)) {
      const snapshotFiles = folderMarkdownFiles.slice();
      await showGraphLoadingState("Building graph view...");
      if (renderRequestId !== graphRenderRequestId || activeTabId !== activeTab.id) {
        removeGraphLoadingState();
        graphPerf?.end({ cancelled: true, reason: "stale-before-snapshot" });
        return;
      }
      graphSnapshot = await createGraphSnapshot(snapshotFiles, activeTab.folderName || activeTab.title, {
        onProgress(progress) {
          if (!progress || progress.phase !== "reading") return;
          const total = Number(progress.total || 0);
          if (!total) return;
          const completed = Number(progress.completed || 0);
          if (completed === total || completed % 25 === 0) {
            updateGraphLoadingState(`Reading graph files ${completed}/${total}...`);
          }
        }
      });
      graphPerf?.mark("snapshot ready", {
        files: graphSnapshot?.files?.length || 0,
        nodes: graphSnapshot?.nodes?.length || 0,
        links: graphSnapshot?.links?.length || 0
      });
      if (renderRequestId !== graphRenderRequestId || activeTabId !== activeTab.id) {
        removeGraphLoadingState();
        graphPerf?.end({ cancelled: true, reason: "stale-after-snapshot" });
        return;
      }
      activeTab.graphSnapshot = graphSnapshot;
      delete activeTab.graphComparisonSnapshot;
      if (activeTab.pendingLargeGraphDisplayDefaults) {
        const largeGraphDisplayLimit = typeof getGraphRenderWarningThreshold === "function" ? getGraphRenderWarningThreshold() : LARGE_GRAPH_DISPLAY_NODE_LIMIT;
        if ((graphSnapshot.nodes || []).length > largeGraphDisplayLimit) {
          const preferenceDefaults = typeof getGraphViewPreferenceDefaults === "function" ? getGraphViewPreferenceDefaults() : {};
          const largeGraphDefaults = {};
          if (!Object.prototype.hasOwnProperty.call(preferenceDefaults, "showArrows")) largeGraphDefaults.showArrows = false;
          if (!Object.prototype.hasOwnProperty.call(preferenceDefaults, "showOrphans")) largeGraphDefaults.showOrphans = false;
          if (!Object.prototype.hasOwnProperty.call(preferenceDefaults, "showLabels")) largeGraphDefaults.showLabels = false;
          if (Object.keys(largeGraphDefaults).length) {
            activeTab.graphViewConfig = normalizeGraphViewConfig({
              ...(activeTab.graphViewConfig || {}),
              ...largeGraphDefaults
            });
            graphViewConfig = activeTab.graphViewConfig;
          }
        }
        delete activeTab.pendingLargeGraphDisplayDefaults;
      }
      if (!options.skipToolbar) updateGraphTagToolbar(activeTab, graphSnapshot);
      saveTabsToStorage(tabs);
    }

    if (!graphSnapshot || !graphSnapshot.nodes?.length) {
      graphRenderCache.forEach((entry) => {
        if (typeof entry?.destroy === "function") entry.destroy();
        else {
          if (entry?.simulation) entry.simulation.stop();
          if (entry?.wrapper) entry.wrapper.remove();
        }
      });
      graphRenderCache.clear();
      activeTab.visiblePointCount = 0;
      activeTab.graphEdgeCount = 0;
      activeTab.graphClusterCount = 0;
      activeTab.graphCollapsedNodeCount = 0;
      if (!options.skipToolbar) updateGraphTagToolbar(activeTab, graphSnapshot);
      updateStatusLine({ visiblePointCount: 0, graphEdgeCount: 0, graphClusterCount: 0, graphCollapsedNodeCount: 0 });
      graphViewCanvas.innerHTML = '<p class="folder-tree-placeholder">This graph tab does not have a saved graph snapshot.</p>';
      graphPerf?.end({ reason: "empty-snapshot" });
      return;
    }

    const graphRendererType = GRAPH_RENDERER_D3;
    const autoClusterLargeMapsEnabled = typeof isGraphAutoClusterLargeMapsEnabled === "function" ? isGraphAutoClusterLargeMapsEnabled() : true;
    const getGraphRenderSignature = () => JSON.stringify({
      base: getGraphSnapshotSignature(graphSnapshot, graphViewConfig),
      autoClusterLargeMapsEnabled,
      largeMapHoverPreferences: typeof getLargeMapHoverPreferences === "function" ? getLargeMapHoverPreferences() : null
    });
    let graphSignature = getGraphRenderSignature();
    const cachedRender = graphRenderCache.get(activeTab.id);
    if (cachedRender && cachedRender.renderer === graphRendererType && cachedRender.signature === graphSignature && cachedRender.wrapper) {
      if (cachedRender.wrapper.parentElement !== graphViewCanvas) graphViewCanvas.appendChild(cachedRender.wrapper);
      cachedRender.wrapper.classList.remove("hidden");
      hideInactiveGraphRenders(activeTab.id);
      removeGraphLoadingState();
      activeTab.visiblePointCount = cachedRender.visiblePointCount || 0;
      activeTab.graphEdgeCount = cachedRender.graphEdgeCount || 0;
      activeTab.graphZoomScale = cachedRender.zoomScale || getGraphZoomScaleFromLayout(activeTab.graphLayout);
      activeTab.selectedGraphNodeCount = 0;
      activeTab.graphClusterCount = cachedRender.graphClusterCount || 0;
      activeTab.graphCollapsedNodeCount = cachedRender.graphCollapsedNodeCount || 0;
      updateStatusLine({
        visiblePointCount: activeTab.visiblePointCount,
        graphEdgeCount: activeTab.graphEdgeCount,
        graphZoomScale: activeTab.graphZoomScale,
        selectedGraphNodeCount: 0,
        graphClusterCount: activeTab.graphClusterCount,
        graphCollapsedNodeCount: activeTab.graphCollapsedNodeCount
      });
      graphPerf?.end({
        reason: "render-cache-hit",
        nodes: cachedRender.visiblePointCount || 0,
        links: cachedRender.graphEdgeCount || 0,
        clusters: cachedRender.graphClusterCount || 0,
        collapsed: cachedRender.graphCollapsedNodeCount || 0
      });
      return;
    }

    if (cachedRender) {
      if (typeof cachedRender.destroy === "function") cachedRender.destroy();
      else {
        if (cachedRender.simulation) cachedRender.simulation.stop();
        if (cachedRender.wrapper) cachedRender.wrapper.remove();
      }
      graphRenderCache.delete(activeTab.id);
    }

    if (renderRequestId !== graphRenderRequestId || activeTabId !== activeTab.id) {
      graphPerf?.end({ cancelled: true, reason: "stale-before-layout" });
      return;
    }
    await showGraphLoadingState("Laying out graph...");
    if (renderRequestId !== graphRenderRequestId || activeTabId !== activeTab.id) {
      removeGraphLoadingState();
      graphPerf?.end({ cancelled: true, reason: "stale-after-layout-state" });
      return;
    }
    removeGraphRenderForTab(activeTab.id);

    const graphRenderWrapper = document.createElement("div");
    graphRenderWrapper.className = "graph-tab-render";
    graphRenderWrapper.dataset.graphTabId = activeTab.id;
    graphViewCanvas.appendChild(graphRenderWrapper);
    hideInactiveGraphRenders(activeTab.id);

    if (activeTab.graphComparisonSnapshot) {
      const compareLegend = document.createElement("div");
      compareLegend.className = "graph-compare-legend";
      compareLegend.setAttribute("aria-label", "Compare mode legend");
      compareLegend.innerHTML = `
        <div class="graph-compare-legend-title">Compare mode</div>
        <div class="graph-compare-legend-row">
          <span class="graph-compare-legend-sample graph-compare-legend-sample-normal" aria-hidden="true"></span>
          <span>Normal = current folder</span>
        </div>
        <div class="graph-compare-legend-row">
          <span class="graph-compare-legend-sample graph-compare-legend-sample-saved-only" aria-hidden="true"></span>
          <span>Faded/dashed = saved graph only</span>
        </div>
      `;
      graphRenderWrapper.appendChild(compareLegend);
    }
    const nodes = (graphSnapshot.nodes || []).map((node) => ({
      ...node,
      type: node?.type || "file",
      status: node?.status || "current"
    }));
    const links = (graphSnapshot.links || []).map((link) => ({
      ...link,
      type: link?.type || "link",
      status: link?.status || "current"
    }));
    graphPerf?.mark("clone snapshot model", { nodes: nodes.length, links: links.length });
    const getGraphNodeType = (nodeData) => nodeData?.type || "file";
    const getGraphLinkType = (linkData) => linkData?.type || "link";
    const getGraphItemStatus = (itemData) => itemData?.status || "current";
    const isTagNode = (nodeData) => getGraphNodeType(nodeData) === "tag";
    const isClusterNode = (nodeData) => getGraphNodeType(nodeData) === "cluster";
    const isTagLink = (linkData) => getGraphLinkType(linkData) === "tag";
    const isMarkdownLink = (linkData) => !isTagLink(linkData);
    const getLinkSourceId = (link) => link?.source?.id || link?.source;
    const getLinkTargetId = (link) => link?.target?.id || link?.target;
    const snapshotFilesById = new Map((graphSnapshot.files || []).map((file) => [file.id, file]));
    const graphNodesById = new Map(nodes.map((node) => [node.id, node]));
    const stripGraphNodeFileExtension = (labelText) => {
      const source = String(labelText || "");
      const withoutMarkdownExtension = source.replace(/\.(md|markdown)$/i, "");
      const stripped = withoutMarkdownExtension.replace(/\.[^/.]+$/, "");
      return stripped || source;
    };
    const getGraphNodeFileLabelSource = (nodeData) => {
      const snapshotFile = snapshotFilesById.get(nodeData?.id) || {};
      const source = snapshotFile.name || snapshotFile.path || snapshotFile.fullPath || nodeData?.name || nodeData?.path || nodeData?.fullPath || nodeData?.label || nodeData?.id || "";
      const normalized = String(source).replace(/\\/g, "/").replace(/\/+/g, "/");
      return normalized.split("/").pop() || normalized;
    };
    const getGraphNodeLabel = (nodeData) => {
      const labelText = nodeData?.label || nodeData?.id || "";
      if (isTagNode(nodeData)) {
        const tagName = nodeData?.tag || String(labelText).replace(/^#/, "");
        return `#${tagName}`;
      }
      if (!isClusterNode(nodeData)) {
        const fileLabel = getGraphNodeFileLabelSource(nodeData);
        return getGraphShowFileExtensions?.() ? fileLabel : stripGraphNodeFileExtension(fileLabel);
      }
      return getGraphShowFileExtensions?.() ? labelText : stripGraphNodeFileExtension(labelText);
    };
    const fileLinkTextById = new Map();
    const appendFileLinkText = (fileId, textParts) => {
      if (!fileId) return;
      const nextText = textParts.filter(Boolean).join(" ");
      if (!nextText) return;
      fileLinkTextById.set(fileId, [fileLinkTextById.get(fileId) || "", nextText].filter(Boolean).join(" "));
    };
    links.filter(isMarkdownLink).forEach((link) => {
      const sourceId = getLinkSourceId(link);
      const targetId = getLinkTargetId(link);
      const sourceNode = graphNodesById.get(sourceId) || {};
      const targetNode = graphNodesById.get(targetId) || {};
      const sourceFile = snapshotFilesById.get(sourceId) || {};
      const targetFile = snapshotFilesById.get(targetId) || {};
      appendFileLinkText(sourceId, [targetId, targetNode.label, targetNode.path, targetNode.fullPath, targetFile.path, targetFile.fullPath, targetFile.name]);
      appendFileLinkText(targetId, [sourceId, sourceNode.label, sourceNode.path, sourceNode.fullPath, sourceFile.path, sourceFile.fullPath, sourceFile.name]);
    });
    const isCompareGraphMode = !!activeTab.graphComparisonSnapshot;
    const useCurrentFolderData = !isKeepSavedGraphMode(activeTab) || isCompareGraphMode;
    const getGraphSearchOptions = (nodeData, snapshotFile, parsedQuery) => {
      const status = nodeData?.status || snapshotFile?.status || "current";
      return {
        useCurrentFolderData,
        allowContentSearch: status !== "saved-only" || typeof snapshotFile?.content === "string",
        linkText: fileLinkTextById.get(nodeData?.id || snapshotFile?.id) || ""
      };
    };
    const getGraphLinksGroupMetric = (parsedQuery) => {
      if (parsedQuery?.type !== "links") return "";
      const metric = String(parsedQuery.value || parsedQuery.terms?.[0] || "").trim().toLowerCase();
      if (["max-in", "min-in", "max-out", "min-out"].includes(metric)) return metric;
      return "";
    };
    const getGraphLinksGroupNodeIds = (parsedQuery, candidateNodes = nodes, candidateLinks = links) => {
      const metric = getGraphLinksGroupMetric(parsedQuery);
      if (!metric) return new Set();

      const candidateFileIds = new Set(candidateNodes.filter((node) => !isTagNode(node) && !isClusterNode(node)).map((node) => node.id));
      const countsByNodeId = new Map(Array.from(candidateFileIds).map((nodeId) => [nodeId, 0]));
      candidateLinks.filter(isMarkdownLink).forEach((link) => {
        const sourceId = getLinkSourceId(link);
        const targetId = getLinkTargetId(link);
        if (!candidateFileIds.has(sourceId) || !candidateFileIds.has(targetId)) return;
        if (metric.endsWith("-out")) countsByNodeId.set(sourceId, (countsByNodeId.get(sourceId) || 0) + 1);
        if (metric.endsWith("-in")) countsByNodeId.set(targetId, (countsByNodeId.get(targetId) || 0) + 1);
      });

      const descending = metric.startsWith("max-");
      return new Set(Array.from(countsByNodeId.entries())
        .sort((a, b) => {
          const countCompare = descending ? b[1] - a[1] : a[1] - b[1];
          return countCompare || String(a[0]).localeCompare(String(b[0]), undefined, { sensitivity: "base" });
        })
        .slice(0, 5)
        .map(([nodeId]) => nodeId));
    };
    const getGraphGroupMatchOptions = (nodeData, snapshotFile, parsedQuery, linkMetricMatchIds = null) => ({
      ...getGraphSearchOptions(nodeData, snapshotFile, parsedQuery),
      linkMetricMatchIds
    });
    const fileMatchesGraphSearchQuery = (nodeData, searchQuery) => {
      if (!searchQuery || isTagNode(nodeData)) return !searchQuery;
      const snapshotFile = snapshotFilesById.get(nodeData.id) || {};
      const parsedQuery = parseGraphGroupQuery(searchQuery);
      const linkMetricMatchIds = getGraphLinksGroupMetric(parsedQuery) ? getGraphLinksGroupNodeIds(parsedQuery) : null;
      return graphFileMatchesGroupQuery(nodeData, snapshotFile, parsedQuery, getGraphGroupMatchOptions(nodeData, snapshotFile, parsedQuery, linkMetricMatchIds));
    };
    const getMatchingGraphGroupForNode = (nodeData, candidateGroups = graphViewConfig?.groups) => {
      if (!nodeData || isTagNode(nodeData) || isClusterNode(nodeData)) return null;
      const snapshotFile = snapshotFilesById.get(nodeData.id);
      const groups = Array.isArray(candidateGroups) ? candidateGroups : [];
      for (const group of groups) {
        if (!group || group.enabled === false) continue;
        const parsedQuery = parseGraphGroupQuery(group.query);
        const linkMetricMatchIds = getGraphLinksGroupMetric(parsedQuery) ? getGraphLinksGroupNodeIds(parsedQuery) : null;
        if (graphFileMatchesGroupQuery(nodeData, snapshotFile, parsedQuery, getGraphGroupMatchOptions(nodeData, snapshotFile, parsedQuery, linkMetricMatchIds))) {
          return group;
        }
      }
      return null;
    };

    const searchResultNodeIds = new Set();
    if (graphViewConfig && graphViewConfig.searchQuery) {
      const matchingFileIds = new Set(nodes
        .filter((node) => fileMatchesGraphSearchQuery(node, graphViewConfig.searchQuery))
        .map((node) => node.id));
      const connectedTagIds = new Set();
      links.filter(isTagLink).forEach((link) => {
        const sourceId = getLinkSourceId(link);
        const targetId = getLinkTargetId(link);
        if (matchingFileIds.has(sourceId) && String(targetId || "").startsWith("tag:")) connectedTagIds.add(targetId);
        if (matchingFileIds.has(targetId) && String(sourceId || "").startsWith("tag:")) connectedTagIds.add(sourceId);
      });
      const searchableNodeIds = new Set([...matchingFileIds, ...connectedTagIds]);
      searchableNodeIds.forEach((nodeId) => searchResultNodeIds.add(nodeId));
      const searchNodes = nodes.filter((node) => searchableNodeIds.has(node.id));
      const searchLinks = links.filter((link) => searchableNodeIds.has(getLinkSourceId(link)) && searchableNodeIds.has(getLinkTargetId(link)));
      nodes.length = 0;
      nodes.push(...searchNodes);
      links.length = 0;
      links.push(...searchLinks);
    }
    graphPerf?.mark("search filter", {
      enabled: Boolean(graphViewConfig?.searchQuery),
      nodes: nodes.length,
      links: links.length
    });

    if (graphViewConfig && Array.isArray(graphViewConfig.allowedNodeIds) && graphViewConfig.allowedNodeIds.length) {
      const allowedNodeIds = new Set(graphViewConfig.allowedNodeIds);
      const allowedNodes = nodes.filter((n) => allowedNodeIds.has(n.id));
      const allowedLinks = links.filter((l) => allowedNodeIds.has(getLinkSourceId(l)) && allowedNodeIds.has(getLinkTargetId(l)));
      nodes.length = 0;
      nodes.push(...allowedNodes);
      links.length = 0;
      links.push(...allowedLinks);
    }
    graphPerf?.mark("allowed nodes filter", {
      enabled: Boolean(graphViewConfig?.allowedNodeIds?.length),
      nodes: nodes.length,
      links: links.length
    });

    if (graphViewConfig && Array.isArray(graphViewConfig.selectedTagIds) && graphViewConfig.selectedTagIds.length) {
      const selectedTagIds = new Set(normalizeGraphTagNodeIds(graphViewConfig.selectedTagIds));
      const selectedFileIds = new Set();
      const connectedTagIds = new Set();
      links.filter(isTagLink).forEach((link) => {
        const sourceId = getLinkSourceId(link);
        const targetId = getLinkTargetId(link);
        const sourceIsSelectedTag = selectedTagIds.has(sourceId);
        const targetIsSelectedTag = selectedTagIds.has(targetId);
        if (!sourceIsSelectedTag && !targetIsSelectedTag) return;
        const fileId = sourceIsSelectedTag ? targetId : sourceId;
        const tagId = sourceIsSelectedTag ? sourceId : targetId;
        if (!fileId || !tagId) return;
        selectedFileIds.add(fileId);
      });
      links.filter(isTagLink).forEach((link) => {
        const sourceId = getLinkSourceId(link);
        const targetId = getLinkTargetId(link);
        if (selectedFileIds.has(sourceId) && String(targetId || "").startsWith("tag:")) connectedTagIds.add(targetId);
        if (selectedFileIds.has(targetId) && String(sourceId || "").startsWith("tag:")) connectedTagIds.add(sourceId);
      });
      const selectedNodeIds = new Set([...selectedFileIds, ...connectedTagIds]);
      const selectedNodes = nodes.filter((n) => selectedNodeIds.has(n.id));
      const selectedLinks = links.filter((l) => selectedNodeIds.has(getLinkSourceId(l)) && selectedNodeIds.has(getLinkTargetId(l)));
      nodes.length = 0;
      nodes.push(...selectedNodes);
      links.length = 0;
      links.push(...selectedLinks);
    }
    graphPerf?.mark("selected tag filter", {
      enabled: Boolean(graphViewConfig?.selectedTagIds?.length),
      nodes: nodes.length,
      links: links.length
    });

    if (graphViewConfig && graphViewConfig.showTags === false) {
      const fileNodes = nodes.filter((n) => !isTagNode(n));
      const nonTagLinks = links.filter((l) => !isTagLink(l));
      nodes.length = 0;
      nodes.push(...fileNodes);
      links.length = 0;
      links.push(...nonTagLinks);
    }
    graphPerf?.mark("tag visibility filter", {
      showTags: graphViewConfig?.showTags !== false,
      nodes: nodes.length,
      links: links.length
    });

    if (graphViewConfig && Array.isArray(graphViewConfig.groups) && graphViewConfig.groups.some((group) => group?.hidden === true)) {
      const hiddenGroupNodeIds = new Set();
      graphViewConfig.groups
        .filter((group) => group?.hidden === true)
        .forEach((group) => {
          const parsedQuery = parseGraphGroupQuery(group.query);
          const linkMetricMatchIds = getGraphLinksGroupMetric(parsedQuery) ? getGraphLinksGroupNodeIds(parsedQuery) : null;
          nodes.forEach((nodeData) => {
            if (isTagNode(nodeData) || hiddenGroupNodeIds.has(nodeData.id)) return;
            const snapshotFile = snapshotFilesById.get(nodeData.id);
            if (graphFileMatchesGroupQuery(nodeData, snapshotFile, parsedQuery, getGraphGroupMatchOptions(nodeData, snapshotFile, parsedQuery, linkMetricMatchIds))) {
              hiddenGroupNodeIds.add(nodeData.id);
            }
          });
        });
      if (hiddenGroupNodeIds.size) {
        const visibleNodes = nodes.filter((n) => !hiddenGroupNodeIds.has(n.id));
        const visibleLinks = links.filter((l) => !hiddenGroupNodeIds.has(getLinkSourceId(l)) && !hiddenGroupNodeIds.has(getLinkTargetId(l)));
        nodes.length = 0;
        nodes.push(...visibleNodes);
        links.length = 0;
        links.push(...visibleLinks);
      }
    }
    graphPerf?.mark("hidden group filter", {
      hiddenGroups: (graphViewConfig?.groups || []).filter((group) => group?.hidden === true).length,
      nodes: nodes.length,
      links: links.length
    });

    if (graphViewConfig && Array.isArray(graphViewConfig.hiddenTagIds) && graphViewConfig.hiddenTagIds.length) {
      const hiddenTagIds = new Set(normalizeGraphTagNodeIds(graphViewConfig.hiddenTagIds));
      const visibleNodes = nodes.filter((n) => !hiddenTagIds.has(n.id));
      const visibleLinks = links.filter((l) => !hiddenTagIds.has(getLinkSourceId(l)) && !hiddenTagIds.has(getLinkTargetId(l)));
      nodes.length = 0;
      nodes.push(...visibleNodes);
      links.length = 0;
      links.push(...visibleLinks);
    }
    graphPerf?.mark("hidden tag filter", {
      hiddenTags: graphViewConfig?.hiddenTagIds?.length || 0,
      nodes: nodes.length,
      links: links.length
    });

    if (graphViewConfig && Array.isArray(graphViewConfig.hiddenNodeIds) && graphViewConfig.hiddenNodeIds.length) {
      const hiddenNodeIds = new Set(graphViewConfig.hiddenNodeIds);
      const visibleNodes = nodes.filter((n) => !hiddenNodeIds.has(n.id));
      const visibleLinks = links.filter((l) => !hiddenNodeIds.has(getLinkSourceId(l)) && !hiddenNodeIds.has(getLinkTargetId(l)));
      nodes.length = 0;
      nodes.push(...visibleNodes);
      links.length = 0;
      links.push(...visibleLinks);
    }
    graphPerf?.mark("hidden node filter", {
      hiddenNodes: graphViewConfig?.hiddenNodeIds?.length || 0,
      nodes: nodes.length,
      links: links.length
    });

    if (graphViewConfig && graphViewConfig.showOrphans === false) {
      const connectedNodeIds = new Set();
      links.forEach((link) => {
        const sourceId = getLinkSourceId(link);
        const targetId = getLinkTargetId(link);
        if (sourceId) connectedNodeIds.add(sourceId);
        if (targetId) connectedNodeIds.add(targetId);
      });
      const visibleNodes = nodes.filter((n) => connectedNodeIds.has(n.id) || searchResultNodeIds.has(n.id));
      const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
      const visibleLinks = links.filter((l) => visibleNodeIds.has(getLinkSourceId(l)) && visibleNodeIds.has(getLinkTargetId(l)));
      nodes.length = 0;
      nodes.push(...visibleNodes);
      links.length = 0;
      links.push(...visibleLinks);
    }
    graphPerf?.mark("orphan filter", {
      showOrphans: graphViewConfig?.showOrphans !== false,
      nodes: nodes.length,
      links: links.length
    });

    const filterGraphToNodeIds = (nodeIds) => {
      const filteredNodes = nodes.filter((n) => nodeIds.has(n.id));
      const filteredLinks = links.filter((l) => nodeIds.has(getLinkSourceId(l)) && nodeIds.has(getLinkTargetId(l)));
      nodes.length = 0;
      nodes.push(...filteredNodes);
      links.length = 0;
      links.push(...filteredLinks);
    };

    const getDirectOutgoingNodeIds = (nodeId) => links
      .filter((link) => isMarkdownLink(link) && getLinkSourceId(link) === nodeId)
      .map(getLinkTargetId)
      .filter(Boolean);

    const getFullOutgoingNodeIds = (nodeId) => {
      const outgoingNodeIds = new Set();
      const nodesToVisit = [...getDirectOutgoingNodeIds(nodeId)];

      while (nodesToVisit.length) {
        const currentNodeId = nodesToVisit.shift();
        if (!currentNodeId || currentNodeId === nodeId || outgoingNodeIds.has(currentNodeId)) continue;
        outgoingNodeIds.add(currentNodeId);
        nodesToVisit.push(...getDirectOutgoingNodeIds(currentNodeId));
      }

      return outgoingNodeIds;
    };

    const getDirectIncomingNodeIds = (nodeId) => links
      .filter((link) => isMarkdownLink(link) && getLinkTargetId(link) === nodeId)
      .map(getLinkSourceId)
      .filter(Boolean);

    const getFullIncomingNodeIds = (nodeId) => {
      const incomingNodeIds = new Set();
      const nodesToVisit = [...getDirectIncomingNodeIds(nodeId)];

      while (nodesToVisit.length) {
        const currentNodeId = nodesToVisit.shift();
        if (!currentNodeId || currentNodeId === nodeId || incomingNodeIds.has(currentNodeId)) continue;
        incomingNodeIds.add(currentNodeId);
        nodesToVisit.push(...getDirectIncomingNodeIds(currentNodeId));
      }

      return incomingNodeIds;
    };

    const getFullNetworkNodeIds = (nodeId) => new Set([
      nodeId,
      ...getFullIncomingNodeIds(nodeId),
      ...getFullOutgoingNodeIds(nodeId)
    ]);

    if (graphViewConfig && graphViewConfig.mode === "local" && graphViewConfig.focusNodeId) {
      const focusNodeId = graphViewConfig.focusNodeId;
      filterGraphToNodeIds(new Set([focusNodeId, ...getDirectOutgoingNodeIds(focusNodeId)]));
    }

    if (graphViewConfig && graphViewConfig.mode === "full-local" && graphViewConfig.focusNodeId) {
      const focusNodeId = graphViewConfig.focusNodeId;
      filterGraphToNodeIds(new Set([focusNodeId, ...getFullOutgoingNodeIds(focusNodeId)]));
    }

    if (graphViewConfig && graphViewConfig.mode === "full-network" && graphViewConfig.focusNodeId) {
      filterGraphToNodeIds(getFullNetworkNodeIds(graphViewConfig.focusNodeId));
    }

    if (graphViewConfig && graphViewConfig.mode === "cluster" && Array.isArray(graphViewConfig.clusterNodeIds)) {
      filterGraphToNodeIds(new Set(graphViewConfig.clusterNodeIds));
    }
    graphPerf?.mark("graph mode filter", {
      mode: graphViewConfig?.mode || "global",
      nodes: nodes.length,
      links: links.length
    });

    const getLargeGraphAutoClusterMinNodeCount = () => (
      typeof getGraphAutoClusterThreshold === "function" ? getGraphAutoClusterThreshold() : 1000
    );
    const LARGE_GRAPH_AUTO_CLUSTER_VERSION = 4;
    const LARGE_GRAPH_RENDER_NODE_BUDGET = 650;
    const getLargeGraphAutoClusterTarget = (nodeCount) => Math.min(LARGE_GRAPH_RENDER_NODE_BUDGET, Math.max(350, Math.floor(nodeCount * 0.05)));
    const getLargeGraphAutoClusterMaxSize = (nodeCount) => Math.max(220, Math.min(1200, Math.ceil(nodeCount / 14)));
    const getLargeGraphHubBudget = (nodeCount) => Math.max(45, Math.min(140, Math.floor(getLargeGraphAutoClusterTarget(nodeCount) * 0.22)));
    const getVisibleFileNodeIdsForClustering = () => new Set(nodes
      .filter((nodeData) => !isTagNode(nodeData) && !isClusterNode(nodeData))
      .map((nodeData) => nodeData.id));
    const getMarkdownFileAdjacencyForNodes = (fileNodeIds) => {
      const adjacency = new Map(Array.from(fileNodeIds).map((nodeId) => [nodeId, new Set()]));
      links.filter(isMarkdownLink).forEach((link) => {
        const sourceId = getLinkSourceId(link);
        const targetId = getLinkTargetId(link);
        if (!sourceId || !targetId || sourceId === targetId) return;
        if (!fileNodeIds.has(sourceId) || !fileNodeIds.has(targetId)) return;
        adjacency.get(sourceId).add(targetId);
        adjacency.get(targetId).add(sourceId);
      });
      return adjacency;
    };
    const getConnectedClusterSubsets = (candidateNodeIds, adjacency) => {
      const candidates = new Set(candidateNodeIds);
      const visited = new Set();
      const subsets = [];
      Array.from(candidates).sort((a, b) => a.localeCompare(b)).forEach((nodeId) => {
        if (visited.has(nodeId)) return;
        const subset = [];
        const queue = [nodeId];
        visited.add(nodeId);
        while (queue.length) {
          const currentNodeId = queue.shift();
          subset.push(currentNodeId);
          (adjacency.get(currentNodeId) || new Set()).forEach((nextNodeId) => {
            if (!candidates.has(nextNodeId) || visited.has(nextNodeId)) return;
            visited.add(nextNodeId);
            queue.push(nextNodeId);
          });
        }
        subsets.push(subset);
      });
      return subsets;
    };
    const yieldGraphRenderWork = () => new Promise((resolve) => setTimeout(resolve, 0));
    const getBudgetedClusterChunks = (candidateNodeIds, adjacency, options = {}) => {
      const maxClusterSize = Math.max(3, options.maxClusterSize || 160);
      const minClusterSize = Math.max(3, options.minClusterSize || 3);
      const degreeOf = (nodeId) => adjacency.get(nodeId)?.size || 0;
      const remaining = new Set(candidateNodeIds);
      const chunks = [];

      const takeChunkFromSeed = (seedNodeId) => {
        if (!remaining.has(seedNodeId)) return [];
        const chunk = [];
        const queued = new Set([seedNodeId]);
        const queue = [seedNodeId];
        while (queue.length && chunk.length < maxClusterSize) {
          const currentNodeId = queue.shift();
          queued.delete(currentNodeId);
          if (!remaining.has(currentNodeId)) continue;
          remaining.delete(currentNodeId);
          chunk.push(currentNodeId);
          Array.from(adjacency.get(currentNodeId) || [])
            .filter((nextNodeId) => remaining.has(nextNodeId) && !queued.has(nextNodeId))
            .sort((a, b) => degreeOf(b) - degreeOf(a) || a.localeCompare(b))
            .forEach((nextNodeId) => {
              if (chunk.length + queue.length >= maxClusterSize) return;
              queued.add(nextNodeId);
              queue.push(nextNodeId);
            });
        }
        return chunk;
      };

      while (remaining.size) {
        const seedNodeId = Array.from(remaining)
          .sort((a, b) => degreeOf(b) - degreeOf(a) || a.localeCompare(b))[0];
        const chunk = takeChunkFromSeed(seedNodeId);
        if (chunk.length >= minClusterSize) {
          chunks.push(chunk);
        }
      }

      return chunks;
    };
    const chunkNodeIdsBySize = (nodeIds, chunkSize) => {
      const chunks = [];
      for (let index = 0; index < nodeIds.length; index += chunkSize) {
        chunks.push(nodeIds.slice(index, index + chunkSize));
      }
      return chunks;
    };
    const detectGraphCommunities = async () => {
      const visibleFileNodeIds = getVisibleFileNodeIdsForClustering();
      const autoClusterMinNodeCount = getLargeGraphAutoClusterMinNodeCount();
      if (visibleFileNodeIds.size < autoClusterMinNodeCount) return { visibleFileNodeIds, adjacency: new Map(), communities: [] };
      const adjacency = getMarkdownFileAdjacencyForNodes(visibleFileNodeIds);
      await yieldGraphRenderWork();
      const nodeIds = Array.from(adjacency.keys())
        .filter((nodeId) => (adjacency.get(nodeId)?.size || 0) >= 1)
        .sort((a, b) => a.localeCompare(b));
      if (nodeIds.length < autoClusterMinNodeCount) return { visibleFileNodeIds, adjacency, communities: [] };

      const labels = new Map(nodeIds.map((id) => [id, id]));
      const maxIterations = 20;
      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        await yieldGraphRenderWork();
        let changed = false;
        nodeIds.forEach((id) => {
          const counts = new Map();
          (adjacency.get(id) || new Set()).forEach((neighborId) => {
            if (!labels.has(neighborId)) return;
            const label = labels.get(neighborId);
            counts.set(label, (counts.get(label) || 0) + 1);
          });
          if (!counts.size) return;
          const currentLabel = labels.get(id);
          let bestLabel = currentLabel;
          let bestCount = counts.get(currentLabel) || 0;
          Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
            .forEach(([label, count]) => {
              if (count > bestCount) {
                bestLabel = label;
                bestCount = count;
              }
            });
          if (bestLabel !== currentLabel) {
            labels.set(id, bestLabel);
            changed = true;
          }
        });
        if (!changed) break;
      }

      const nodeIdsByLabel = new Map();
      nodeIds.forEach((nodeId) => {
        const label = labels.get(nodeId);
        if (!nodeIdsByLabel.has(label)) nodeIdsByLabel.set(label, []);
        nodeIdsByLabel.get(label).push(nodeId);
      });

      const maxCommunitySize = getLargeGraphAutoClusterMaxSize(visibleFileNodeIds.size);
      await yieldGraphRenderWork();
      const communities = Array.from(nodeIdsByLabel.values())
        .flatMap((labelNodeIds) => getConnectedClusterSubsets(labelNodeIds, adjacency))
        .flatMap((communityNodeIds) => {
          if (communityNodeIds.length <= maxCommunitySize) return [communityNodeIds];
          return getBudgetedClusterChunks(communityNodeIds, adjacency, { maxClusterSize: maxCommunitySize, minClusterSize: 4 });
        })
        .filter((communityNodeIds) => communityNodeIds.length >= 4)
        .sort((a, b) => b.length - a.length || String(a[0] || "").localeCompare(String(b[0] || "")));
      return { visibleFileNodeIds, adjacency, communities };
    };
    const createAutoCollapsedClustersForLargeGraph = async () => {
      const currentConfig = normalizeGraphViewConfig(activeTab.graphViewConfig);
      if (currentConfig.mode === "cluster") return null;
      if (typeof isGraphAutoClusterLargeMapsEnabled === "function" && !isGraphAutoClusterLargeMapsEnabled()) {
        return currentConfig.autoCollapsedLargeGraph === true && (currentConfig.collapsedClusters || []).length ? [] : null;
      }
      const { visibleFileNodeIds, adjacency, communities } = await detectGraphCommunities();
      if (visibleFileNodeIds.size < getLargeGraphAutoClusterMinNodeCount()) {
        return currentConfig.autoCollapsedLargeGraph === true && (currentConfig.collapsedClusters || []).length ? [] : null;
      }
      const existingAutoClusterVersion = Number(currentConfig.autoCollapsedLargeGraphVersion || 0);
      if (currentConfig.autoCollapsedLargeGraph === true && existingAutoClusterVersion >= LARGE_GRAPH_AUTO_CLUSTER_VERSION) return null;
      if ((currentConfig.collapsedClusters || []).length && currentConfig.autoCollapsedLargeGraph !== true) return null;

      const nodesById = new Map(nodes.map((nodeData) => [nodeData.id, nodeData]));
      const outgoingCountsByNodeId = new Map();
      const incomingCountsByNodeId = new Map();
      links.filter(isMarkdownLink).forEach((link) => {
        const sourceId = getLinkSourceId(link);
        const targetId = getLinkTargetId(link);
        if (!sourceId || !targetId || sourceId === targetId) return;
        outgoingCountsByNodeId.set(sourceId, (outgoingCountsByNodeId.get(sourceId) || 0) + 1);
        incomingCountsByNodeId.set(targetId, (incomingCountsByNodeId.get(targetId) || 0) + 1);
      });
      const importanceOf = (nodeId) => (adjacency.get(nodeId)?.size || 0)
        + (outgoingCountsByNodeId.get(nodeId) || 0)
        + (incomingCountsByNodeId.get(nodeId) || 0);
      const usedNodeIds = new Set();
      const clusters = [];
      const targetNodeCount = getLargeGraphAutoClusterTarget(visibleFileNodeIds.size);
      const requiredReduction = Math.max(0, visibleFileNodeIds.size - targetNodeCount);
      let currentReduction = 0;
      let preservedHubNodeIds = new Set();
      const addClusterCandidate = (communityNodeIds, index, source = "community") => {
        const memberNodeIds = communityNodeIds.filter((nodeId) => nodesById.has(nodeId) && !usedNodeIds.has(nodeId));
        if (memberNodeIds.length < 3) return;
        memberNodeIds.forEach((nodeId) => usedNodeIds.add(nodeId));
        const seedNodeId = memberNodeIds
          .slice()
          .sort((a, b) => importanceOf(b) - importanceOf(a) || a.localeCompare(b))[0];
        const seedNode = nodesById.get(seedNodeId) || {};
        clusters.push({
          id: createGraphGroupId(`auto-cluster:${activeTab.id}:${source}:${index}:${seedNodeId}:${memberNodeIds.join(",")}`),
          label: getGraphNodeLabel(seedNode),
          mode: "community",
          auto: true,
          seedNodeId,
          memberNodeIds,
          createdAt: Date.now()
        });
        currentReduction += memberNodeIds.length - 1;
      };

      communities.forEach((communityNodeIds, index) => {
        if (currentReduction >= requiredReduction) return;
        addClusterCandidate(communityNodeIds, index, "community");
      });

      if (currentReduction < requiredReduction) {
        await yieldGraphRenderWork();
        const remainingConnectedNodeIds = Array.from(visibleFileNodeIds)
          .filter((nodeId) => !usedNodeIds.has(nodeId) && (adjacency.get(nodeId)?.size || 0) > 0);
        const fallbackChunks = getConnectedClusterSubsets(remainingConnectedNodeIds, adjacency)
          .sort((a, b) => b.length - a.length || String(a[0] || "").localeCompare(String(b[0] || "")))
          .flatMap((componentNodeIds) => getBudgetedClusterChunks(componentNodeIds, adjacency, {
            maxClusterSize: getLargeGraphAutoClusterMaxSize(visibleFileNodeIds.size),
            minClusterSize: 3
          }));
        fallbackChunks.forEach((chunkNodeIds, index) => {
          if (currentReduction >= requiredReduction) return;
          addClusterCandidate(chunkNodeIds, index, "budget");
        });
      }

      if (currentReduction < requiredReduction) {
        await yieldGraphRenderWork();
        preservedHubNodeIds = new Set(Array.from(visibleFileNodeIds)
          .filter((nodeId) => !usedNodeIds.has(nodeId))
          .sort((a, b) => importanceOf(b) - importanceOf(a) || a.localeCompare(b))
          .slice(0, getLargeGraphHubBudget(visibleFileNodeIds.size)));
        const detailNodeIds = Array.from(visibleFileNodeIds)
          .filter((nodeId) => !usedNodeIds.has(nodeId) && !preservedHubNodeIds.has(nodeId));
        const detailChunks = getConnectedClusterSubsets(detailNodeIds, adjacency)
          .sort((a, b) => b.length - a.length || String(a[0] || "").localeCompare(String(b[0] || "")))
          .flatMap((componentNodeIds) => getBudgetedClusterChunks(componentNodeIds, adjacency, {
            maxClusterSize: getLargeGraphAutoClusterMaxSize(visibleFileNodeIds.size),
            minClusterSize: 3
          }));
        detailChunks.forEach((chunkNodeIds, index) => {
          if (currentReduction >= requiredReduction) return;
          addClusterCandidate(chunkNodeIds, index, "detail");
        });
      }

      if (currentReduction < requiredReduction) {
        await yieldGraphRenderWork();
        if (!preservedHubNodeIds.size) {
          preservedHubNodeIds = new Set(Array.from(visibleFileNodeIds)
            .filter((nodeId) => !usedNodeIds.has(nodeId))
            .sort((a, b) => importanceOf(b) - importanceOf(a) || a.localeCompare(b))
            .slice(0, getLargeGraphHubBudget(visibleFileNodeIds.size)));
        }
        const spokeNodeIdsByHubId = new Map();
        Array.from(visibleFileNodeIds)
          .filter((nodeId) => !usedNodeIds.has(nodeId) && !preservedHubNodeIds.has(nodeId))
          .forEach((nodeId) => {
            const hubId = Array.from(adjacency.get(nodeId) || [])
              .filter((neighborId) => preservedHubNodeIds.has(neighborId))
              .sort((a, b) => importanceOf(b) - importanceOf(a) || a.localeCompare(b))[0] || "__overview__";
            if (!spokeNodeIdsByHubId.has(hubId)) spokeNodeIdsByHubId.set(hubId, []);
            spokeNodeIdsByHubId.get(hubId).push(nodeId);
          });
        let hubGroupIndex = 0;
        Array.from(spokeNodeIdsByHubId.entries())
          .sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0])))
          .forEach(([, spokeNodeIds]) => {
            if (currentReduction >= requiredReduction) return;
            const sortedSpokeNodeIds = spokeNodeIds
              .filter((nodeId) => !usedNodeIds.has(nodeId))
              .sort((a, b) => importanceOf(b) - importanceOf(a) || a.localeCompare(b));
            chunkNodeIdsBySize(sortedSpokeNodeIds, getLargeGraphAutoClusterMaxSize(visibleFileNodeIds.size))
              .forEach((chunkNodeIds) => {
                if (currentReduction >= requiredReduction) return;
                addClusterCandidate(chunkNodeIds, hubGroupIndex, "hub-neighborhood");
                hubGroupIndex += 1;
              });
          });
      }

      if (currentReduction < requiredReduction) {
        await yieldGraphRenderWork();
        const emergencyProtectedHubIds = new Set(Array.from(visibleFileNodeIds)
          .filter((nodeId) => !usedNodeIds.has(nodeId))
          .sort((a, b) => importanceOf(b) - importanceOf(a) || a.localeCompare(b))
          .slice(0, Math.max(20, Math.floor(getLargeGraphHubBudget(visibleFileNodeIds.size) * 0.45))));
        const remainingNodeIds = Array.from(visibleFileNodeIds)
          .filter((nodeId) => !usedNodeIds.has(nodeId) && !emergencyProtectedHubIds.has(nodeId))
          .sort((a, b) => importanceOf(a) - importanceOf(b) || a.localeCompare(b));
        chunkNodeIdsBySize(remainingNodeIds, getLargeGraphAutoClusterMaxSize(visibleFileNodeIds.size))
          .forEach((chunkNodeIds, index) => {
            if (currentReduction >= requiredReduction) return;
            addClusterCandidate(chunkNodeIds, index, "overview");
          });
      }

      return clusters;
    };
    const applyAutoCollapsedClustersForLargeGraph = async () => {
      const autoCollapsedClusters = await createAutoCollapsedClustersForLargeGraph();
      if (!autoCollapsedClusters) return;
      graphViewConfig = normalizeGraphViewConfig({
        ...(activeTab.graphViewConfig || {}),
        collapsedClusters: autoCollapsedClusters,
        autoCollapsedLargeGraph: autoCollapsedClusters.length > 0,
        autoCollapsedLargeGraphVersion: LARGE_GRAPH_AUTO_CLUSTER_VERSION
      });
      activeTab.graphViewConfig = graphViewConfig;
      if (activeTab.graphDocument && typeof activeTab.graphDocument === "object") {
        activeTab.graphDocument.viewConfig = graphViewConfig;
        activeTab.graphDocument.updatedAt = Date.now();
      }
      markGraphTabAsChanged(activeTab);
      saveTabsToStorage(tabs);
    };

    await applyAutoCollapsedClustersForLargeGraph();
    graphPerf?.mark("auto cluster update", {
      mode: graphViewConfig?.mode || "global",
      collapsedClusters: graphViewConfig?.collapsedClusters?.length || 0,
      autoCollapsed: Boolean(graphViewConfig?.autoCollapsedLargeGraph)
    });
    graphSignature = getGraphRenderSignature();

    const getClusterNodeId = (cluster) => cluster?.id || `cluster:${cluster?.seedNodeId || ""}`;
    const getClusterLabel = (cluster, memberNodes) => {
      const seedNode = memberNodes.find((nodeData) => nodeData.id === cluster.seedNodeId) || memberNodes[0] || {};
      const seedLabel = String(cluster.label || getGraphNodeLabel(seedNode) || "Cluster").replace(/\s+cluster$/i, "");
      return `${seedLabel} (${memberNodes.length})`;
    };
    const getClusterGroup = (seedNode, memberNodes) => {
      const seedGroup = getMatchingGraphGroupForNode(seedNode);
      if (seedGroup) return seedGroup;

      const groupCounts = new Map();
      memberNodes.forEach((nodeData) => {
        const group = getMatchingGraphGroupForNode(nodeData);
        if (!group?.id) return;
        const current = groupCounts.get(group.id) || { group, count: 0 };
        current.count += 1;
        groupCounts.set(group.id, current);
      });
      return Array.from(groupCounts.values())
        .sort((a, b) => b.count - a.count || String(a.group.query || "").localeCompare(String(b.group.query || "")))[0]?.group || null;
    };
    const applyCollapsedClustersToGraph = () => {
      const collapsedClusters = Array.isArray(graphViewConfig?.collapsedClusters) ? graphViewConfig.collapsedClusters : [];
      if (!collapsedClusters.length) return;

      const nodesById = new Map(nodes.map((nodeData) => [nodeData.id, nodeData]));
      const memberToCluster = new Map();
      const clusterNodes = [];
      collapsedClusters.forEach((cluster) => {
        const memberNodes = (cluster.memberNodeIds || [])
          .map((nodeId) => nodesById.get(nodeId))
          .filter(Boolean);
        if (memberNodes.length < 2) return;
        const clusterId = getClusterNodeId(cluster);
        memberNodes.forEach((nodeData) => memberToCluster.set(nodeData.id, clusterId));
        const seedNode = nodesById.get(cluster.seedNodeId) || memberNodes[0] || {};
        const clusterGroup = getClusterGroup(seedNode, memberNodes);
        clusterNodes.push({
          id: clusterId,
          label: getClusterLabel(cluster, memberNodes),
          type: "cluster",
          status: "current",
          clusterId,
          seedNodeId: cluster.seedNodeId,
          memberNodeIds: memberNodes.map((nodeData) => nodeData.id),
          collapsedCount: memberNodes.length,
          groupId: clusterGroup?.id,
          groupColor: clusterGroup?.color,
          groupName: clusterGroup?.query,
          x: seedNode.x,
          y: seedNode.y,
          fx: seedNode.fx,
          fy: seedNode.fy
        });
      });
      if (!memberToCluster.size) return;

      const visibleNodes = nodes.filter((nodeData) => !memberToCluster.has(nodeData.id));
      const visibleNodeIds = new Set(visibleNodes.map((nodeData) => nodeData.id));
      const clusterNodeIds = new Set(clusterNodes.map((nodeData) => nodeData.id));
      const rewrittenLinksByKey = new Map();
      links.forEach((linkData) => {
        const sourceId = getLinkSourceId(linkData);
        const targetId = getLinkTargetId(linkData);
        const rewrittenSource = memberToCluster.get(sourceId) || sourceId;
        const rewrittenTarget = memberToCluster.get(targetId) || targetId;
        if (!rewrittenSource || !rewrittenTarget || rewrittenSource === rewrittenTarget) return;
        const sourceVisible = visibleNodeIds.has(rewrittenSource) || clusterNodeIds.has(rewrittenSource);
        const targetVisible = visibleNodeIds.has(rewrittenTarget) || clusterNodeIds.has(rewrittenTarget);
        if (!sourceVisible || !targetVisible) return;
        const involvesCluster = clusterNodeIds.has(rewrittenSource) || clusterNodeIds.has(rewrittenTarget);
        const key = involvesCluster
          ? [rewrittenSource, rewrittenTarget].sort().join("<->")
          : `${rewrittenSource}->${rewrittenTarget}:${getGraphLinkType(linkData)}:${getGraphItemStatus(linkData)}`;
        if (rewrittenLinksByKey.has(key)) return;
        rewrittenLinksByKey.set(key, {
          ...linkData,
          source: rewrittenSource,
          target: rewrittenTarget,
          collapsedSourceId: rewrittenSource !== sourceId ? sourceId : undefined,
          collapsedTargetId: rewrittenTarget !== targetId ? targetId : undefined
        });
      });

      nodes.length = 0;
      nodes.push(...visibleNodes, ...clusterNodes);
      links.length = 0;
      links.push(...rewrittenLinksByKey.values());
    };

    applyCollapsedClustersToGraph();
    graphPerf?.mark("apply collapsed clusters", {
      nodes: nodes.length,
      links: links.length,
      collapsedClusters: graphViewConfig?.collapsedClusters?.length || 0
    });

    nodes.forEach((nodeData) => {
      if (isTagNode(nodeData)) {
        delete nodeData.groupId;
        delete nodeData.groupColor;
        delete nodeData.groupName;
        return;
      }
      if (isClusterNode(nodeData)) {
        return;
      }
      const matchingGroup = getMatchingGraphGroupForNode(nodeData);
      if (matchingGroup) {
        nodeData.groupId = matchingGroup.id;
        nodeData.groupColor = matchingGroup.color;
        nodeData.groupName = matchingGroup.query;
      } else {
        delete nodeData.groupId;
        delete nodeData.groupColor;
        delete nodeData.groupName;
      }
    });
    graphPerf?.mark("group assignment", {
      groups: graphViewConfig?.groups?.length || 0,
      groupedNodes: nodes.filter((nodeData) => nodeData.groupId).length
    });

    const clusterNodes = nodes.filter(isClusterNode);
    const graphClusterCount = clusterNodes.length;
    const graphCollapsedNodeCount = clusterNodes.reduce((total, nodeData) => total + Math.max(0, Number(nodeData.collapsedCount || nodeData.memberNodeIds?.length || 0)), 0);
    const graphEdgeCount = links.length;
    const preparedGraphModel = {
      renderer: graphRendererType,
      graphSnapshot,
      graphViewConfig,
      nodes,
      links,
      snapshotFilesById,
      graphNodesById,
      graphEdgeCount,
      graphClusterCount,
      graphCollapsedNodeCount,
      isCompareGraphMode,
      useCurrentFolderData
    };
    activeTab.visiblePointCount = nodes.length;
    activeTab.graphEdgeCount = graphEdgeCount;
    activeTab.selectedGraphNodeCount = 0;
    activeTab.graphClusterCount = graphClusterCount;
    activeTab.graphCollapsedNodeCount = graphCollapsedNodeCount;
    updateStatusLine({
      visiblePointCount: nodes.length,
      graphEdgeCount,
      selectedGraphNodeCount: 0,
      graphClusterCount,
      graphCollapsedNodeCount
    });

    const activeGraphLayout = activeTab.graphComparisonSnapshot
      ? (activeTab.graphComparisonLayout || activeTab.graphLayout)
      : activeTab.graphLayout;
    applySavedGraphLayout(nodes, activeGraphLayout);
    if (typeof activeGraphLayout?.magneticEnabled === "boolean") {
      graphSettings.magneticEnabled = activeGraphLayout.magneticEnabled;
    }
    graphPerf?.mark("saved layout restore", {
      nodes: nodes.length,
      hasSavedZoom: Boolean(getSavedGraphZoomTransform(activeGraphLayout))
    });

    const outgoingAdjacency = new Map();
    const outgoingMarkdownHoverLinks = new Map();
    const relatedTagHoverLinks = new Map();
    const outgoingDegree = new Map();
    nodes.forEach((n) => {
      outgoingAdjacency.set(n.id, new Set([n.id]));
      outgoingMarkdownHoverLinks.set(n.id, []);
      relatedTagHoverLinks.set(n.id, []);
    });
    nodes.forEach((n) => outgoingDegree.set(n.id, 0));
    links.filter(isMarkdownLink).forEach((l) => {
      const sourceId = getLinkSourceId(l);
      const targetId = getLinkTargetId(l);
      outgoingAdjacency.get(sourceId)?.add(targetId);
      outgoingMarkdownHoverLinks.get(sourceId)?.push(l);
      outgoingDegree.set(sourceId, (outgoingDegree.get(sourceId) || 0) + 1);
    });
    links.filter(isTagLink).forEach((l) => {
      const sourceId = getLinkSourceId(l);
      const targetId = getLinkTargetId(l);
      if (sourceId && targetId) {
        outgoingAdjacency.get(sourceId)?.add(targetId);
        outgoingAdjacency.get(targetId)?.add(sourceId);
        relatedTagHoverLinks.get(sourceId)?.push(l);
        relatedTagHoverLinks.get(targetId)?.push(l);
      }
    });
    const maxOutgoing = Math.max(1, ...Array.from(outgoingDegree.values()));
    const GRAPH_NODE_RADIUS_SCALE = graphViewConfig.nodeSize;
    const graphBaseNodeRadius = (nodeId) => {
      const nodeData = graphNodesById.get(nodeId) || nodes.find((node) => node.id === nodeId);
      if (isClusterNode(nodeData)) return 16 + Math.min(18, Math.sqrt(Math.max(1, nodeData.collapsedCount || 1)) * 2);
      const outCount = outgoingDegree.get(nodeId) || 0;
      return 6 + (outCount / maxOutgoing) * 12;
    };
    const nodeRadius = (nodeId) => graphBaseNodeRadius(nodeId) * GRAPH_NODE_RADIUS_SCALE;
    const GRAPH_LINK_SOURCE_PADDING = 1;
    const GRAPH_LINK_TARGET_PADDING = 0;
    const getLinkEndpoint = (d) => {
      const dx = d.target.x - d.source.x;
      const dy = d.target.y - d.source.y;
      const distance = Math.hypot(dx, dy) || 1;
      const ux = dx / distance;
      const uy = dy / distance;
      const sourceOffset = nodeRadius(d.source.id) + GRAPH_LINK_SOURCE_PADDING;
      const targetOffset = nodeRadius(d.target.id) + GRAPH_LINK_TARGET_PADDING;
      return {
        x1: d.source.x + ux * sourceOffset,
        y1: d.source.y + uy * sourceOffset,
        x2: d.target.x - ux * targetOffset,
        y2: d.target.y - uy * targetOffset
      };
    };
    const width = graphRenderWrapper.clientWidth || graphViewCanvas.clientWidth || 900;
    const height = graphRenderWrapper.clientHeight || graphViewCanvas.clientHeight || 560;
    const useStaticLargeGraphLayout = nodes.length > LARGE_GRAPH_RENDER_NODE_BUDGET;
    const svg = d3.select(graphRenderWrapper).append("svg").attr("width", width).attr("height", height);
    const graphLayer = svg.append("g").attr("class", "graph-layer");
    graphPerf?.mark("d3 svg created", {
      nodes: nodes.length,
      links: links.length,
      width,
      height,
      staticLargeGraph: useStaticLargeGraphLayout
    });

    let currentZoomTransform = d3.zoomIdentity;
    activeTab.graphZoomScale = currentZoomTransform.k;
    let label = null;
    let maxNodeRadius = 1;
    const zoomBehavior = d3.zoom()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        currentZoomTransform = event.transform;
        activeTab.graphZoomScale = currentZoomTransform.k;
        const cachedGraphRender = graphRenderCache.get(activeTab.id);
        if (cachedGraphRender) cachedGraphRender.zoomScale = currentZoomTransform.k;
        graphLayer.attr("transform", currentZoomTransform);
        updateLabelVisibility();
        updateStatusLine({
          visiblePointCount: activeTab.visiblePointCount || nodes.length,
          graphEdgeCount: activeTab.graphEdgeCount || graphEdgeCount,
          graphZoomScale: currentZoomTransform.k
        });
        captureGraphLayout(activeTab, nodes, currentZoomTransform);
        scheduleGraphLayoutStorageSave();
        if (event.sourceEvent) markGraphTabAsChanged(activeTab);
      });

    svg.call(zoomBehavior).on("dblclick.zoom", null);
    const savedZoomTransform = getSavedGraphZoomTransform(activeGraphLayout);
    if (savedZoomTransform) {
      currentZoomTransform = d3.zoomIdentity
        .translate(savedZoomTransform.x, savedZoomTransform.y)
        .scale(savedZoomTransform.k);
      svg.call(zoomBehavior.transform, currentZoomTransform);
    }
    activeTab.graphZoomScale = currentZoomTransform.k;
    updateStatusLine({
      visiblePointCount: activeTab.visiblePointCount || nodes.length,
      graphEdgeCount: activeTab.graphEdgeCount || graphEdgeCount,
      graphZoomScale: currentZoomTransform.k
    });

    const simulation = d3.forceSimulation(nodes);
    const baseLinkForce = d3.forceLink(links)
      .id((d) => d.id)
      .distance(useStaticLargeGraphLayout ? Math.max(80, graphViewConfig.linkDistance * 0.75) : graphViewConfig.linkDistance)
      .strength(useStaticLargeGraphLayout ? Math.min(0.18, graphViewConfig.linkForce) : graphViewConfig.linkForce);
    const baseChargeForce = d3.forceManyBody().strength(useStaticLargeGraphLayout ? -Math.min(260, graphViewConfig.repelForce) : -graphViewConfig.repelForce);
    const centerForceStrength = Math.max(0, graphViewConfig.centerForce);
    const baseCenterForce = d3.forceCenter(width / 2, height / 2);
    if (typeof baseCenterForce.strength === "function") baseCenterForce.strength(Math.min(1, centerForceStrength));
    const baseCenterPullX = d3.forceX(width / 2).strength(centerForceStrength * 0.08);
    const baseCenterPullY = d3.forceY(height / 2).strength(centerForceStrength * 0.08);
    const baseCollisionForce = useStaticLargeGraphLayout ? null : d3.forceCollide().radius((d) => nodeRadius(d.id) + 30).strength(0.9);
    const createGroupClusterForce = () => {
      const strength = Math.max(0, Number(graphViewConfig.groupForce) || 0);
      const groupedNodes = nodes.filter((nodeData) => nodeData.groupId);
      if (!strength || groupedNodes.length < 2) return null;

      const groupIds = Array.from(new Set(groupedNodes.map((nodeData) => nodeData.groupId))).sort((a, b) => String(a).localeCompare(String(b)));
      if (!groupIds.length) return null;
      const groupNodesById = new Map(groupIds.map((groupId) => [groupId, groupedNodes.filter((nodeData) => nodeData.groupId === groupId)]));
      const radius = Math.max(150, Math.min(width, height) * (0.26 + (strength * 0.18)));
      const targetByGroupId = new Map(groupIds.map((groupId, index) => {
        const angle = groupIds.length === 1 ? -Math.PI / 2 : ((Math.PI * 2 * index) / groupIds.length) - (Math.PI / 2);
        return [groupId, {
          x: (width / 2) + Math.cos(angle) * radius,
          y: (height / 2) + Math.sin(angle) * radius
        }];
      }));

      return (alpha) => {
        const pull = strength * alpha * 0.42;
        groupedNodes.forEach((nodeData) => {
          const target = targetByGroupId.get(nodeData.groupId);
          if (!target) return;
          nodeData.vx += (target.x - nodeData.x) * pull;
          nodeData.vy += (target.y - nodeData.y) * pull;
        });

        const groupCenters = groupIds.map((groupId) => {
          const groupNodes = groupNodesById.get(groupId) || [];
          const count = Math.max(1, groupNodes.length);
          return {
            groupId,
            nodes: groupNodes,
            x: groupNodes.reduce((sum, nodeData) => sum + (nodeData.x || width / 2), 0) / count,
            y: groupNodes.reduce((sum, nodeData) => sum + (nodeData.y || height / 2), 0) / count
          };
        });
        const minGroupDistance = Math.max(180, Math.min(width, height) * (0.22 + (strength * 0.16)));
        const separationStrength = strength * alpha * 1.4;
        for (let i = 0; i < groupCenters.length; i += 1) {
          for (let j = i + 1; j < groupCenters.length; j += 1) {
            const a = groupCenters[i];
            const b = groupCenters[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let distance = Math.hypot(dx, dy);
            if (!distance) {
              const angle = ((i + 1) / groupCenters.length) * Math.PI * 2;
              dx = Math.cos(angle);
              dy = Math.sin(angle);
              distance = 1;
            }
            if (distance >= minGroupDistance) continue;
            const push = ((minGroupDistance - distance) / minGroupDistance) * separationStrength;
            const pushX = (dx / distance) * push;
            const pushY = (dy / distance) * push;
            a.nodes.forEach((nodeData) => {
              nodeData.vx -= pushX;
              nodeData.vy -= pushY;
            });
            b.nodes.forEach((nodeData) => {
              nodeData.vx += pushX;
              nodeData.vy += pushY;
            });
          }
        }
      };
    };
    const baseGroupClusterForce = createGroupClusterForce();
    simulation
      .force("link", baseLinkForce)
      .force("charge", baseChargeForce)
      .force("center", baseCenterForce)
      .force("centerX", baseCenterPullX)
      .force("centerY", baseCenterPullY)
      .force("collision", baseCollisionForce)
      .force("groupCluster", useStaticLargeGraphLayout ? null : baseGroupClusterForce);
    if (useStaticLargeGraphLayout) simulation.stop();
    graphPerf?.mark("d3 forces configured", {
      staticLargeGraph: useStaticLargeGraphLayout,
      magneticEnabled: Boolean(graphSettings.magneticEnabled)
    });
    // Keep the former marker dimensions: 9x8 viewBox scaled into a 5x5 marker viewport.
    const arrowheadLength = 5;
    const arrowheadHalfHeight = 20 / 9;
    const lineLayer = graphLayer.append("g").attr("class", "graph-line-layer");
    const arrowheadLayer = graphLayer.append("g").attr("class", "graph-arrowhead-layer");
    const nodeLayer = graphLayer.append("g").attr("class", "graph-node-layer");
    const labelLayer = graphLayer.append("g").attr("class", "graph-label-layer");

    const link = lineLayer.selectAll("line").data(links).enter().append("line")
      .attr("class", (d) => `graph-link graph-link-${getGraphLinkType(d)} graph-link-status-${getGraphItemStatus(d)}`)
      .style("stroke-width", (d) => `${(isTagLink(d) ? 1 : graphViewConfig.linkThickness)}px`);
    const arrowhead = arrowheadLayer.selectAll("path").data(graphViewConfig.showArrows ? links.filter(isMarkdownLink) : []).enter().append("path")
      .attr("class", (d) => `graph-arrowhead graph-arrowhead-status-${getGraphItemStatus(d)}`);
    const linkElementByData = new Map();
    const arrowheadElementByData = new Map();
    link.each(function(d) { linkElementByData.set(d, this); });
    arrowhead.each(function(d) { arrowheadElementByData.set(d, this); });
    const node = nodeLayer.selectAll("circle").data(nodes).enter().append("circle")
      .attr("r", (d) => nodeRadius(d.id))
      .attr("class", (d) => `graph-node graph-node-${getGraphNodeType(d)} graph-node-status-${getGraphItemStatus(d)}`)
      .style("fill", (d) => {
        if (isTagNode(d)) return null;
        return d.groupColor || null;
      })
      .call(d3.drag()
        .on("start", (event, d) => {
          if (!useStaticLargeGraphLayout && graphSettings.magneticEnabled && !event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          logGraphInteractionPerf("drag", { nodeId: d?.id || "" });
          d.x = event.x;
          d.y = event.y;
          d.fx = event.x;
          d.fy = event.y;
          renderGraphTick();
          captureGraphLayout(activeTab, nodes, currentZoomTransform);
        })
          .on("end", (event, d) => {
            if (!useStaticLargeGraphLayout && graphSettings.magneticEnabled && !event.active) simulation.alphaTarget(0);
            d.x = event.x;
            d.y = event.y;
            d.fx = null;
            d.fy = null;
            renderGraphTick();
            captureGraphLayout(activeTab, nodes, currentZoomTransform);
            markGraphTabAsChanged(activeTab);
            saveTabsToStorage(tabs);
          }));
      const nodeElementByNodeId = new Map();
      node.each(function(d) {
        if (d?.id) nodeElementByNodeId.set(d.id, this);
      });
      graphPerf?.mark("d3 elements bound", {
        nodes: nodes.length,
        links: links.length,
      arrows: graphViewConfig.showArrows ? links.filter(isMarkdownLink).length : 0
    });
    maxNodeRadius = Math.max(1, ...nodes.map((d) => nodeRadius(d.id)));
    const graphTooltipPathsById = new Map((graphSnapshot.files || []).map((file) => [file.id, file.fullPath || file.path]));
    const getGraphNodeTooltip = (nodeData) => {
      if (isClusterNode(nodeData)) {
        const collapsedCount = nodeData.collapsedCount || nodeData.memberNodeIds?.length || 0;
        const groupName = String(nodeData.groupName || "").trim();
        const groupPrefix = groupName ? `${groupName}. ` : "";
        return `${groupPrefix}${collapsedCount} collapsed points. Right-click to expand this cluster.`;
      }
      if (getGraphItemStatus(nodeData) === "saved-only" && !isTagNode(nodeData)) {
        return "Saved-only file. This file existed in the saved graph but is not part of the current folder graph.";
      }
      return graphTooltipPathsById.get(nodeData.id) || nodeData.fullPath || getGraphNodeLabel(nodeData);
    };
    const getGraphLinkTooltip = (linkData) => {
      if (getGraphItemStatus(linkData) === "saved-only") {
        return "Saved-only connection. This connection existed in the saved graph but was not found in the current folder graph.";
      }
      return null;
    };
    node.append("title").text(getGraphNodeTooltip);
    link.append("title").text((d) => getGraphLinkTooltip(d) || "");
    arrowhead.append("title").text((d) => getGraphLinkTooltip(d) || "");
    label = labelLayer.selectAll("text").data(nodes).enter().append("text")
      .text(getGraphNodeLabel)
      .attr("class", (d) => `graph-label graph-label-${getGraphNodeType(d)} graph-label-status-${getGraphItemStatus(d)}`);
    const labelElementByNodeId = new Map();
    label.each(function(d) {
      if (d?.id) labelElementByNodeId.set(d.id, this);
    });

    const contextMenu = document.createElement("div");
    contextMenu.className = "graph-context-menu hidden";
    const contextMenuTitle = document.createElement("div");
    contextMenuTitle.className = "graph-context-menu-title hidden";

    const createContextMenuButton = (labelText, iconClass, tooltipText) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "graph-context-menu-item";
      if (tooltipText) {
        button.classList.add("graph-context-menu-tooltip");
        button.dataset.tooltip = tooltipText;
      }
      const icon = document.createElement("i");
      icon.className = iconClass;
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "graph-context-menu-item-label";
      label.textContent = labelText;
      button.appendChild(icon);
      button.appendChild(label);
      return button;
    };

    const disableContextMenuTooltip = (button) => {
      button.classList.remove("graph-context-menu-tooltip", "tooltip-visible");
      delete button.dataset.tooltip;
    };

    const setContextMenuButtonLabel = (button, labelText) => {
      const label = button.querySelector(".graph-context-menu-item-label");
      if (label) label.textContent = labelText;
    };

    const magneticToggleBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.turnMagneticForcesOff.label,
      CONTEXT_MENU_ACTIONS.turnMagneticForcesOff.icon,
      "Toggle whether graph nodes continue to pull and push each other after you move them."
    );
    const contextMenuTitleSeparator = document.createElement("div");
    contextMenuTitleSeparator.className = "graph-context-menu-separator hidden";
    const contextMenuGraphSeparator = document.createElement("div");
    contextMenuGraphSeparator.className = "graph-context-menu-separator hidden";
    const contextMenuDeleteEndSeparator = document.createElement("div");
    contextMenuDeleteEndSeparator.className = "graph-context-menu-separator hidden";
    const contextMenuActionSeparator = document.createElement("div");
    contextMenuActionSeparator.className = "graph-context-menu-separator hidden";
    const openFileBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.openInNewTab.label,
      CONTEXT_MENU_ACTIONS.openInNewTab.icon,
      "Open this Markdown file in a dedicated editor tab without changing the graph tab."
    );
    openFileBtn.classList.add("hidden");
    const openAllBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.openAll.label,
      CONTEXT_MENU_ACTIONS.openAll.icon,
      "Open every visible file point in editor tabs."
    );
    const centerGraphBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.centerGraph?.label || "Center Graph",
      CONTEXT_MENU_ACTIONS.centerGraph?.icon || "bi bi-bullseye",
      "Zoom and pan this graph so the current map's points are centered in view."
    );
    const exportOriginalNodesBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.exportOriginalNodes.label,
      CONTEXT_MENU_ACTIONS.exportOriginalNodes.icon,
      "Copy the original source files referenced by visible graph points into a selected folder."
    );
    const openDefaultAppBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.openWithDefaultApp.label,
      CONTEXT_MENU_ACTIONS.openWithDefaultApp.icon,
      "Ask the operating system to open this file with its configured default application."
    );
    openDefaultAppBtn.classList.add("hidden");
    const revealFileBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.label,
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.icon,
      "Open the file's folder in the system file explorer and select this file when supported."
    );
    revealFileBtn.classList.add("hidden");
    const revealTreeViewBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.revealInTreeView.label,
      CONTEXT_MENU_ACTIONS.revealInTreeView.icon,
      "Select, scroll to, and focus this file in the folder tree."
    );
    revealTreeViewBtn.classList.add("hidden");
    const renameFileBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.rename.label,
      CONTEXT_MENU_ACTIONS.rename.icon,
      "Rename this Markdown file on disk and update open graph views that include it."
    );
    renameFileBtn.classList.add("hidden");
    const { submenu: tagsSubmenu, submenuPanel: tagsSubmenuPanel } = createTagsContextSubmenu(
      "Add or remove YAML frontmatter tags for this Markdown file."
    );
    tagsSubmenu.classList.add("hidden");
    const hidePointBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.removePoint.label,
      CONTEXT_MENU_ACTIONS.removePoint.icon,
      "Remove this point from the current graph view while keeping the original file on disk."
    );
    hidePointBtn.classList.add("hidden");
    const removeLeafNodesBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.removeLeafNodes.label,
      CONTEXT_MENU_ACTIONS.removeLeafNodes.icon,
      "Hide all visible file points that have no direct outgoing Markdown links."
    );
    const collapseToClusterBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.collapseToCluster.label,
      CONTEXT_MENU_ACTIONS.collapseToCluster.icon,
      "Replace this point and its direct outgoing linked points with one expandable cluster point."
    );
    collapseToClusterBtn.classList.add("hidden");
    const collapseFullOutgoingToClusterBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.collapseFullOutgoingToCluster.label,
      CONTEXT_MENU_ACTIONS.collapseFullOutgoingToCluster.icon,
      "Replace this point and every reachable outgoing linked point with one expandable cluster point."
    );
    collapseFullOutgoingToClusterBtn.classList.add("hidden");
    const collapseDetectedCommunityBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.collapseDetectedCommunity.label,
      CONTEXT_MENU_ACTIONS.collapseDetectedCommunity.icon,
      "Detect a dense linked community around this point and replace it with one expandable cluster point."
    );
    collapseDetectedCommunityBtn.classList.add("hidden");
    const expandClusterBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.expandCluster.label,
      CONTEXT_MENU_ACTIONS.expandCluster.icon,
      "Restore the original points hidden inside this cluster."
    );
    expandClusterBtn.classList.add("hidden");
    const showGraphSubmenu = document.createElement("div");
    showGraphSubmenu.className = "graph-context-menu-submenu hidden";
    const showGraphSubmenuBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.showGraph.label,
      CONTEXT_MENU_ACTIONS.showGraph.icon,
      "Open graph views focused on this point."
    );
    showGraphSubmenuBtn.setAttribute("aria-haspopup", "true");
    disableContextMenuTooltip(showGraphSubmenuBtn);
    const showGraphSubmenuArrow = document.createElement("span");
    showGraphSubmenuArrow.className = "graph-context-menu-submenu-arrow";
    showGraphSubmenuArrow.textContent = "›";
    showGraphSubmenuBtn.appendChild(showGraphSubmenuArrow);
    const showGraphSubmenuPanel = document.createElement("div");
    showGraphSubmenuPanel.className = "graph-context-menu-submenu-panel";
    const localGraphBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.showLocalGraph.label,
      CONTEXT_MENU_ACTIONS.showLocalGraph.icon,
      "Open a graph focused on this point and the points it directly links to."
    );
    const fullLocalGraphBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.showFullLocalGraph.label,
      CONTEXT_MENU_ACTIONS.showFullLocalGraph.icon,
      "Open a graph that follows every outgoing dependency reachable from this point."
    );
    const fullNetworkBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.showFullNetwork.label,
      CONTEXT_MENU_ACTIONS.showFullNetwork.icon,
      "Open a graph containing every recursive backlink and outgoing dependency reachable from this point."
    );
    const expandedClusterGraphBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.showExpandedCluster.label,
      CONTEXT_MENU_ACTIONS.showExpandedCluster.icon,
      "Open a new graph tab that shows the original points hidden inside this cluster."
    );
    expandedClusterGraphBtn.classList.add("hidden");
    [localGraphBtn, fullLocalGraphBtn, fullNetworkBtn, expandedClusterGraphBtn].forEach((button) => showGraphSubmenuPanel.appendChild(button));
    showGraphSubmenu.appendChild(showGraphSubmenuBtn);
    showGraphSubmenu.appendChild(showGraphSubmenuPanel);
    const addTagBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.addTag.label,
      CONTEXT_MENU_ACTIONS.addTag.icon,
      "Add a YAML frontmatter tag to this Markdown file."
    );
    addTagBtn.classList.add("hidden");
    const removeTagBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.removeTag.label,
      CONTEXT_MENU_ACTIONS.removeTag.icon,
      "Remove a YAML frontmatter tag from this Markdown file."
    );
    removeTagBtn.classList.add("hidden");
    const deleteTagBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.deleteTag.label,
      CONTEXT_MENU_ACTIONS.deleteTag.icon,
      "Remove this tag from every file that has it and save those files."
    );
    deleteTagBtn.classList.add("hidden", "graph-context-menu-item-danger");
    const deleteFileBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.deleteFile.label,
      CONTEXT_MENU_ACTIONS.deleteFile.icon,
      "Delete this Markdown file after confirmation and remove its point from the graph."
    );
    deleteFileBtn.classList.add("hidden", "graph-context-menu-item-danger");
    const sharePointBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.share.label,
      CONTEXT_MENU_ACTIONS.share.icon,
      "Copy a shareable URL containing this point's Markdown content."
    );
    const contextMenuDeleteSeparator = document.createElement("div");
    contextMenuDeleteSeparator.className = "graph-context-menu-separator hidden";

    const copySubmenu = document.createElement("div");
    copySubmenu.className = "graph-context-menu-submenu hidden";
    const copySubmenuBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copy.label,
      CONTEXT_MENU_ACTIONS.copy.icon,
      "Open copy actions for this point, including its path, content, dependencies, and backlinks."
    );
    copySubmenuBtn.setAttribute("aria-haspopup", "true");
    disableContextMenuTooltip(copySubmenuBtn);
    const copySubmenuArrow = document.createElement("span");
    copySubmenuArrow.className = "graph-context-menu-submenu-arrow";
    copySubmenuArrow.textContent = "›";
    copySubmenuBtn.appendChild(copySubmenuArrow);
    const copySubmenuPanel = document.createElement("div");
    copySubmenuPanel.className = "graph-context-menu-submenu-panel";
    const copyPathBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyPath.label,
      CONTEXT_MENU_ACTIONS.copyPath.icon,
      "Copy this file's full path and file name to the clipboard."
    );
    const copyContentBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyContent.label,
      CONTEXT_MENU_ACTIONS.copyContent.icon,
      "Copy the entire Markdown content of this file to the clipboard."
    );
    const copyFrontmatterBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyFrontmatter.label,
      CONTEXT_MENU_ACTIONS.copyFrontmatter.icon,
      "Copy this file's YAML frontmatter block to the clipboard."
    );
    const copyTagsBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyTags.label,
      CONTEXT_MENU_ACTIONS.copyTags.icon,
      "Copy this file's frontmatter tags, one tag per line."
    );
    const copyDependenciesBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyDependencies.label,
      CONTEXT_MENU_ACTIONS.copyDependencies.icon,
      "Copy direct outgoing linked file paths, one file path per line."
    );
    const copyFullDependenciesBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyFullDependencies.label,
      CONTEXT_MENU_ACTIONS.copyFullDependencies.icon,
      "Copy this file plus all direct and indirect outgoing linked file paths, one file path per line."
    );
    const copyBacklinksBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyBacklinks.label,
      CONTEXT_MENU_ACTIONS.copyBacklinks.icon,
      "Copy file paths that directly link to this point, one file path per line."
    );
    const copyFullNetworkBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyFullNetwork.label,
      CONTEXT_MENU_ACTIONS.copyFullNetwork.icon,
      "Copy this file plus recursive backlinks and recursive dependencies, one file path per line."
    );
    const copyGraphOptionsSeparator = document.createElement("div");
    copyGraphOptionsSeparator.className = "graph-context-menu-separator";
    [copyPathBtn, copyContentBtn, copyFrontmatterBtn, copyTagsBtn].forEach((button) => copySubmenuPanel.appendChild(button));
    copySubmenuPanel.appendChild(copyGraphOptionsSeparator);
    [copyDependenciesBtn, copyFullDependenciesBtn, copyBacklinksBtn, copyFullNetworkBtn].forEach((button) => copySubmenuPanel.appendChild(button));
    copySubmenu.appendChild(copySubmenuBtn);
    copySubmenu.appendChild(copySubmenuPanel);

    const exportSubmenu = document.createElement("div");
    exportSubmenu.className = "graph-context-menu-submenu hidden";
    const exportSubmenuBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.export.label,
      CONTEXT_MENU_ACTIONS.export.icon,
      "Open export actions for this point."
    );
    exportSubmenuBtn.setAttribute("aria-haspopup", "true");
    disableContextMenuTooltip(exportSubmenuBtn);
    const exportSubmenuArrow = document.createElement("span");
    exportSubmenuArrow.className = "graph-context-menu-submenu-arrow";
    exportSubmenuArrow.textContent = "›";
    exportSubmenuBtn.appendChild(exportSubmenuArrow);
    const exportSubmenuPanel = document.createElement("div");
    exportSubmenuPanel.className = "graph-context-menu-submenu-panel";
    const exportMarkdownBtn = createContextMenuButton(CONTEXT_MENU_ACTIONS.exportMarkdown.label, CONTEXT_MENU_ACTIONS.exportMarkdown.icon, "Download this point as Markdown.");
    const exportHtmlBtn = createContextMenuButton(CONTEXT_MENU_ACTIONS.exportHtml.label, CONTEXT_MENU_ACTIONS.exportHtml.icon, "Download this point as HTML.");
    const exportPdfBtn = createContextMenuButton(CONTEXT_MENU_ACTIONS.exportPdf.label, CONTEXT_MENU_ACTIONS.exportPdf.icon, "Download this point as PDF.");
    const exportOriginalNodeBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.exportOriginalNode?.label || "Export original node",
      CONTEXT_MENU_ACTIONS.exportOriginalNode?.icon || "bi bi-file-earmark-arrow-down",
      "Copy the original source file referenced by this point into a selected folder."
    );
    [sharePointBtn, exportMarkdownBtn, exportHtmlBtn, exportPdfBtn, exportOriginalNodeBtn].forEach((button) => exportSubmenuPanel.appendChild(button));
    exportSubmenu.appendChild(exportSubmenuBtn);
    exportSubmenu.appendChild(exportSubmenuPanel);

    contextMenu.appendChild(contextMenuTitle);
    contextMenu.appendChild(contextMenuTitleSeparator);
    contextMenu.appendChild(openAllBtn);
    contextMenu.appendChild(centerGraphBtn);
    contextMenu.appendChild(exportOriginalNodesBtn);
    contextMenu.appendChild(openFileBtn);
    contextMenu.appendChild(openDefaultAppBtn);
    contextMenu.appendChild(revealFileBtn);
    contextMenu.appendChild(revealTreeViewBtn);
    contextMenu.appendChild(renameFileBtn);
    contextMenu.appendChild(tagsSubmenu);
    contextMenu.appendChild(copySubmenu);
    contextMenu.appendChild(contextMenuGraphSeparator);
    contextMenu.appendChild(hidePointBtn);
    contextMenu.appendChild(removeLeafNodesBtn);
    contextMenu.appendChild(collapseToClusterBtn);
    contextMenu.appendChild(collapseFullOutgoingToClusterBtn);
    contextMenu.appendChild(collapseDetectedCommunityBtn);
    contextMenu.appendChild(expandClusterBtn);
    contextMenu.appendChild(showGraphSubmenu);
    contextMenu.appendChild(addTagBtn);
    contextMenu.appendChild(removeTagBtn);
    contextMenu.appendChild(deleteTagBtn);
    contextMenu.appendChild(contextMenuDeleteSeparator);
    contextMenu.appendChild(deleteFileBtn);
    contextMenu.appendChild(contextMenuDeleteEndSeparator);
    contextMenu.appendChild(exportSubmenu);
    contextMenu.appendChild(contextMenuActionSeparator);
    contextMenu.appendChild(magneticToggleBtn);
    graphRenderWrapper.appendChild(contextMenu);

    let contextTargetNode = null;

    const getActiveGraphTab = () => tabs.find((tab) => tab.id === activeTabId && tab.type === "graph") || null;

    const getFolderMarkdownEntryForNode = (graphNode) => {
      if (!graphNode) return null;
      return (folderMarkdownFiles || []).find((entry) => {
        const entryPath = entry.path || entry.fullPath || entry.file?.webkitRelativePath || entry.file?.name || "";
        return normalizeGraphNodeName(entryPath) === graphNode.id;
      }) || null;
    };

    const getSnapshotFileForNode = (graphNode) => {
      if (!graphNode) return null;
      const activeGraphTab = getActiveGraphTab();
      const snapshotFile = snapshotFilesById.get(graphNode.id) || activeGraphTab?.graphSnapshot?.files?.find((file) => file.id === graphNode.id);
      return snapshotFile || (isKeepSavedGraphMode(activeGraphTab) ? null : getFolderMarkdownEntryForNode(graphNode));
    };

    const getNodeFileName = (nodeId) => {
      const graphNode = nodes.find((n) => n.id === nodeId);
      const snapshotFile = graphNode ? getSnapshotFileForNode(graphNode) : null;
      const sourcePath = snapshotFile?.path || snapshotFile?.fullPath || graphNode?.fullPath || graphNode?.label || nodeId;
      return getFileName(sourcePath || nodeId);
    };

    const getNodeClipboardPath = (graphNode) => {
      const snapshotFile = getSnapshotFileForNode(graphNode);
      const clipboardPath = snapshotFile?.fullPath || snapshotFile?.path || graphNode?.fullPath || graphNode?.label || graphNode?.id || "";
      return resolveFilesystemPath(clipboardPath) || clipboardPath;
    };

    const getNodeEditorTitle = (graphNode) => {
      const sourceName = getNodeFileName(graphNode?.id);
      return String(sourceName || graphNode?.label || graphNode?.id || "document.md").replace(/\.(md|markdown)$/i, "") || "Untitled";
    };

    const getNodeClipboardTags = (graphNode) => {
      const snapshotFile = getSnapshotFileForNode(graphNode);
      return normalizeFileTagList(graphNode?.tags?.length ? graphNode.tags : snapshotFile?.tags || []).join("\n");
    };

    const getMarkdownFrontmatterText = (markdown) => {
      const match = String(markdown || "").match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
      return match ? match[0].trimEnd() : "";
    };

    const isAbsoluteFilesystemPath = (path) => {
      if (!path) return false;
      return /^[a-zA-Z]:[\\/]/.test(path) || /^\\\\/.test(path) || path.startsWith("/");
    };

    const resolveFilesystemPath = (path) => {
      if (!path || !isNeutralinoRuntime()) return null;
      if (isAbsoluteFilesystemPath(path)) return path;
      return activeFolderPath ? joinPath(activeFolderPath, path) : null;
    };

    const getNodeFilesystemPath = (graphNode) => {
      const snapshotFile = getSnapshotFileForNode(graphNode);
      const candidatePaths = [
        snapshotFile?.fullPath,
        snapshotFile?.path,
        graphNode?.fullPath
      ];
      for (const candidatePath of candidatePaths) {
        const resolvedPath = resolveFilesystemPath(candidatePath);
        if (resolvedPath) return resolvedPath;
      }
      return null;
    };

    const getTreeRevealTabForNode = (graphNode) => {
      const snapshotFile = getSnapshotFileForNode(graphNode);
      const sourcePath = snapshotFile?.fullPath || snapshotFile?.path || graphNode?.fullPath || graphNode?.label || graphNode?.id || "";
      const sourceName = snapshotFile?.name || getFileName(sourcePath || graphNode?.id || "");
      return {
        sourceFilePath: sourcePath,
        sourceFileName: sourceName,
        title: sourceName
      };
    };

    const revealGraphNodeInTreeView = (graphNode) => {
      if (!graphNode || graphNode.type === "tag") return false;
      const treeButton = findFolderTreeFileButtonForTab?.(getTreeRevealTabForNode(graphNode));
      if (!treeButton) return false;

      if (typeof setSidebarVisible === "function") setSidebarVisible(true);
      if (folderTreeRoot) {
        folderTreeRoot.querySelectorAll(".folder-tree-file.auto-selected").forEach((button) => {
          button.classList.remove("auto-selected");
          button.removeAttribute("aria-current");
        });
      }

      treeButton.closest("details")?.querySelectorAll("details").forEach((details) => {
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
    };

    const readGraphNodeContent = async (graphNode) => {
      const snapshotFile = getSnapshotFileForNode(graphNode);
      if (!snapshotFile) throw new Error("Unable to find the selected file in this graph snapshot.");
      if (snapshotFile.content !== undefined) return snapshotFile.content || "";
      if (snapshotFile.file) return snapshotFile.file.text();
      if (snapshotFile.handle) {
        const file = await snapshotFile.handle.getFile();
        return file.text();
      }
      if (isNeutralinoRuntime() && snapshotFile.fullPath) return Neutralino.filesystem.readFile(snapshotFile.fullPath);
      const folderEntry = getFolderMarkdownEntryForNode(graphNode);
      if (folderEntry) return readFolderMarkdownFileContent(folderEntry);
      throw new Error("No readable Markdown file was provided.");
    };

    const writeGraphNodeContent = async (graphNode, content) => {
      const snapshotFile = getSnapshotFileForNode(graphNode);
      if (!snapshotFile) throw new Error("Unable to find the selected file in this graph snapshot.");
      const filePath = getNodeFilesystemPath(graphNode);
      if (isNeutralinoRuntime() && filePath && Neutralino.filesystem?.writeFile) {
        await Neutralino.filesystem.writeFile(filePath, content);
        return;
      }
      if (snapshotFile.handle?.createWritable) {
        const writable = await snapshotFile.handle.createWritable();
        await writable.write(content);
        await writable.close();
        return;
      }
      const folderEntry = getFolderMarkdownEntryForNode(graphNode);
      if (folderEntry?.handle?.createWritable) {
        const writable = await folderEntry.handle.createWritable();
        await writable.write(content);
        await writable.close();
        return;
      }
      throw new Error("No writable Markdown file was provided.");
    };

    const copyGraphText = async (text) => {
      if (isNeutralinoRuntime() && Neutralino.clipboard?.writeText) {
        await Neutralino.clipboard.writeText(text || "");
        showCopiedMessage();
        return;
      }
      await copyToClipboard(text || "");
    };

    const getDirectOutgoingDependencyIds = (nodeId) => links
      .filter((l) => isMarkdownLink(l) && (l.source?.id === nodeId || l.source === nodeId))
      .map((l) => l.target?.id || l.target)
      .filter(Boolean);

    const getFullOutgoingDependencyIds = (nodeId) => {
      const dependencyIds = new Set();
      const nodesToVisit = [...getDirectOutgoingDependencyIds(nodeId)];
      while (nodesToVisit.length) {
        const currentNodeId = nodesToVisit.shift();
        if (!currentNodeId || currentNodeId === nodeId || dependencyIds.has(currentNodeId)) continue;
        dependencyIds.add(currentNodeId);
        nodesToVisit.push(...getDirectOutgoingDependencyIds(currentNodeId));
      }
      return Array.from(dependencyIds);
    };

    const getBacklinkIds = (nodeId) => links
      .filter((l) => isMarkdownLink(l) && (l.target?.id || l.target) === nodeId)
      .map((l) => l.source?.id || l.source)
      .filter(Boolean);

    const getFullBacklinkIds = (nodeId) => {
      const backlinkIds = new Set();
      const nodesToVisit = [...getBacklinkIds(nodeId)];
      while (nodesToVisit.length) {
        const currentNodeId = nodesToVisit.shift();
        if (!currentNodeId || currentNodeId === nodeId || backlinkIds.has(currentNodeId)) continue;
        backlinkIds.add(currentNodeId);
        nodesToVisit.push(...getBacklinkIds(currentNodeId));
      }
      return Array.from(backlinkIds);
    };

    const getFullNetworkIds = (nodeId) => {
      const networkIds = new Set([nodeId]);
      getFullBacklinkIds(nodeId).forEach((id) => networkIds.add(id));
      getFullOutgoingDependencyIds(nodeId).forEach((id) => networkIds.add(id));
      return Array.from(networkIds);
    };

    const getNodeClipboardPathById = (nodeId) => {
      const graphNode = nodes.find((n) => n.id === nodeId);
      return graphNode ? getNodeClipboardPath(graphNode) : nodeId;
    };

    const getPathParts = (path) => {
      const value = String(path || "");
      const separatorIndex = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
      const directory = separatorIndex >= 0 ? value.slice(0, separatorIndex) : "";
      const separator = separatorIndex >= 0 ? value.charAt(separatorIndex) : "";
      const leaf = separatorIndex >= 0 ? value.slice(separatorIndex + 1) : value;
      const extensionIndex = leaf.lastIndexOf(".");
      const hasExtension = extensionIndex > 0;
      return {
        directory,
        separator,
        fileName: hasExtension ? leaf.slice(0, extensionIndex) : leaf,
        extension: hasExtension ? leaf.slice(extensionIndex) : "",
        leaf
      };
    };

    const formatCopyPath = (path, options) => {
      const parts = getPathParts(path);
      const leafParts = [];
      if (options.fileName) leafParts.push(parts.fileName);
      if (options.extension) leafParts.push(parts.extension);
      const leaf = leafParts.join("");
      if (!options.fullPath) return leaf || parts.leaf;
      if (!leaf) return parts.directory || path;
      return parts.directory ? `${parts.directory}${parts.separator || "/"}${leaf}` : leaf;
    };

    const getSourceFilePathFromMarkdown = (markdown) => {
      const frontmatterMatch = String(markdown || "").match(/(?:^|\r?\n)---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      if (!frontmatterMatch) return "";
      const frontmatter = frontmatterMatch[1];
      const inlineSourceFileMatch = frontmatter.match(/^[ \t]*source_file[ \t]*:[ \t]*(.+?)[ \t]*$/im);
      if (inlineSourceFileMatch && inlineSourceFileMatch[1].trim()) {
        return inlineSourceFileMatch[1].trim().replace(/^['"]|['"]$/g, "");
      }
      return "";
    };

    const getCopyPathForNode = async (nodeId, options) => {
      const graphNode = nodes.find((n) => n.id === nodeId);
      const markdownPath = graphNode ? getNodeClipboardPath(graphNode) : nodeId;
      if (!options.sourceFile || !graphNode) return markdownPath;
      try {
        return getSourceFilePathFromMarkdown(await readGraphNodeContent(graphNode)) || markdownPath;
      } catch (error) {
        console.warn("Unable to read source_file frontmatter for graph copy:", error);
        return markdownPath;
      }
    };

    const showGraphCopyOptionsDialog = () => new Promise((resolve) => {
      const modal = document.getElementById("graph-copy-options-modal");
      const fileNameInput = document.getElementById("graph-copy-option-file-name");
      const extensionInput = document.getElementById("graph-copy-option-extension");
      const fullPathInput = document.getElementById("graph-copy-option-full-path");
      const sourceFileInput = document.getElementById("graph-copy-option-source-file");
      const okBtn = document.getElementById("graph-copy-options-ok");
      const cancelBtn = document.getElementById("graph-copy-options-cancel");
      if (!modal || !fileNameInput || !extensionInput || !fullPathInput || !sourceFileInput || !okBtn || !cancelBtn) {
        resolve({ fileName: true, extension: true, fullPath: true, sourceFile: false });
        return;
      }

      fileNameInput.checked = true;
      extensionInput.checked = true;
      fullPathInput.checked = true;
      sourceFileInput.checked = false;

      const updateOkState = () => {
        okBtn.disabled = !(fileNameInput.checked || extensionInput.checked || fullPathInput.checked);
      };
      const cleanup = () => {
        modal.style.display = "none";
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        modal.removeEventListener("click", onOverlayClick);
        document.removeEventListener("keydown", onKeyDown);
        [fileNameInput, extensionInput, fullPathInput].forEach((input) => input.removeEventListener("change", updateOkState));
      };
      const onOk = () => {
        if (okBtn.disabled) return;
        const options = {
          fileName: fileNameInput.checked,
          extension: extensionInput.checked,
          fullPath: fullPathInput.checked,
          sourceFile: sourceFileInput.checked
        };
        cleanup();
        resolve(options);
      };
      const onCancel = () => {
        cleanup();
        resolve(null);
      };
      const onOverlayClick = (event) => {
        if (event.target === modal) onCancel();
      };
      const onKeyDown = (event) => {
        if (event.key === "Escape") onCancel();
      };

      [fileNameInput, extensionInput, fullPathInput].forEach((input) => input.addEventListener("change", updateOkState));
      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      modal.addEventListener("click", onOverlayClick);
      document.addEventListener("keydown", onKeyDown);
      updateOkState();
      modal.style.display = "flex";
    });

    const copyNodeFilePathList = async (nodeIds, options = { fileName: true, extension: true, fullPath: true, sourceFile: false }) => {
      const lines = [];
      for (const nodeId of Array.from(new Set(nodeIds))) {
        lines.push(formatCopyPath(await getCopyPathForNode(nodeId, options), options));
      }
      await copyGraphText(lines.join("\n"));
    };

    const openGraphNodeFileFromCurrentRender = async (graphNode) => {
      if (!graphNode || isTagNode(graphNode)) return null;
      const snapshotFile = getSnapshotFileForNode(graphNode);
      const folderEntry = getFolderMarkdownEntryForNode(graphNode);
      const fileEntry = snapshotFile || folderEntry;
      if (!fileEntry) throw new Error(`Unable to find ${graphNode.id} in this graph snapshot.`);
      const sourcePath = fileEntry.fullPath || fileEntry.path || graphNode.fullPath || graphNode.id;
      const sourceFile = {
        name: fileEntry.name || getFileName(sourcePath || graphNode.label || "document.md"),
        handle: fileEntry.handle || folderEntry?.handle || null,
        path: sourcePath || null
      };
      const existingTab = findTabForSourceFile(sourceFile);
      if (existingTab) {
        switchTab(existingTab.id);
        pinTemporaryTab(existingTab.id);
        return existingTab;
      }
      const content = await readGraphNodeContent(graphNode);
      return openSidebarFileInPermanentTab(normalizeEditorContent(content), getNodeEditorTitle(graphNode), sourceFile);
    };

    const getVisibleFileNodes = () => nodes.filter((graphNode) => !isTagNode(graphNode) && !isClusterNode(graphNode));

    const openAllVisibleGraphFiles = async () => {
      const fileNodes = getVisibleFileNodes();
      if (!fileNodes.length) {
        alert("There are no visible file points to open.");
        return;
      }
      if (fileNodes.length > 20 && (typeof shouldConfirmOpenManyGraphNodes !== "function" || shouldConfirmOpenManyGraphNodes())) {
        const shouldContinue = window.confirm(`Open ${fileNodes.length} files in editor tabs?\n\nThis might slow down your computer or crash the app.`);
        if (!shouldContinue) return;
      }
      const failedNodeLabels = [];
      for (const graphNode of fileNodes) {
        try {
          await openGraphNodeFileFromCurrentRender(graphNode);
        } catch (error) {
          console.error("Failed to open graph file:", error);
          failedNodeLabels.push(getNodeFileName(graphNode.id));
        }
      }
      if (failedNodeLabels.length) {
        alert(`Unable to open ${failedNodeLabels.length} file${failedNodeLabels.length === 1 ? "" : "s"}:\n${failedNodeLabels.join("\n")}`);
      }
    };

    const normalizeOriginalSourcePath = (path) => String(path || "").trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^['"]|['"]$/g, "");

    const stripMarkdownExportExtension = (path) => normalizeOriginalSourcePath(path)
      .replace(/^\/+/, "")
      .replace(/\.(md|markdown)$/i, "");

    const getOriginalExportNodePathCandidates = (graphNode) => {
      const snapshotFile = getSnapshotFileForNode(graphNode) || {};
      return [
        graphNode?.path,
        graphNode?.id,
        graphNode?.label,
        graphNode?.fullPath,
        snapshotFile.path,
        snapshotFile.id,
        snapshotFile.name,
        snapshotFile.fullPath
      ]
        .map(stripMarkdownExportExtension)
        .filter(Boolean);
    };

    const getOriginalExportRelativePath = (sourcePath, graphNode) => {
      const normalizedSourcePath = normalizeOriginalSourcePath(sourcePath).replace(/^\/+/, "");
      const sourceSegments = normalizedSourcePath.split("/").filter(Boolean);
      const sourcePathKey = sourceSegments.join("/").toLowerCase();
      if (!sourceSegments.length) return "";

      const candidates = getOriginalExportNodePathCandidates(graphNode)
        .map((candidate) => candidate.split("/").filter(Boolean))
        .filter((segments) => segments.length);

      for (const candidateSegments of candidates) {
        const candidateKey = candidateSegments.join("/").toLowerCase();
        if (!candidateKey || sourcePathKey !== candidateKey && !sourcePathKey.endsWith(`/${candidateKey}`)) continue;
        const suffixLength = candidateSegments.length;
        const projectName = sourceSegments[sourceSegments.length - suffixLength - 1];
        if (!projectName) continue;
        return [projectName, ...sourceSegments.slice(sourceSegments.length - suffixLength)].join("/");
      }

      const srcIndex = sourceSegments.findIndex((segment) => segment.toLowerCase() === "src");
      if (srcIndex > 0) return sourceSegments.slice(srcIndex - 1).join("/");
      return sourceSegments.slice(-2).join("/");
    };

    const getOriginalExportParentDirectories = (path) => {
      const segments = normalizeOriginalSourcePath(path).split("/").filter(Boolean);
      segments.pop();
      const directories = [];
      const startIndex = /^[a-z]:$/i.test(segments[0] || "") ? 2 : 1;
      for (let index = startIndex; index <= segments.length; index += 1) {
        directories.push(segments.slice(0, index).join("/"));
      }
      return directories;
    };

    const createOriginalExportDirectory = async (directoryPath) => {
      if (!directoryPath || !Neutralino.filesystem?.createDirectory) return;
      if (Neutralino.filesystem?.getStats) {
        try {
          await Neutralino.filesystem.getStats(directoryPath);
          return;
        } catch (_error) {
          // Missing folders are created below; existing folders should not be recreated.
        }
      }
      try {
        await Neutralino.filesystem.createDirectory(directoryPath);
      } catch (error) {
        const message = String(error?.message || error || "").toLowerCase();
        if (!message.includes("exist") && !message.includes("already")) throw error;
      }
    };

    const ensureOriginalExportDirectories = async (destinationPath, createdDirectories) => {
      const directories = getOriginalExportParentDirectories(destinationPath);
      for (const directory of directories) {
        if (createdDirectories.has(directory)) continue;
        await createOriginalExportDirectory(directory);
        createdDirectories.add(directory);
      }
    };

    const showOriginalExportCompleteDialog = (message, destinationFolder) => new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "reset-modal-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "original-export-complete-title");
      overlay.style.display = "flex";

      const box = document.createElement("div");
      box.className = "reset-modal-box original-export-complete-box";

      const title = document.createElement("p");
      title.id = "original-export-complete-title";
      title.className = "reset-modal-message";
      title.textContent = message;
      title.style.whiteSpace = "pre-line";

      const actions = document.createElement("div");
      actions.className = "reset-modal-actions original-export-complete-actions";

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "reset-modal-btn reset-modal-cancel";
      closeButton.textContent = "OK";

      const openFolderButton = document.createElement("button");
      openFolderButton.type = "button";
      openFolderButton.className = "reset-modal-btn original-export-open-folder-btn";
      openFolderButton.textContent = "Open Folder";

      const closeDialog = () => {
        document.removeEventListener("keydown", onKeyDown);
        overlay.remove();
        resolve();
      };

      const onKeyDown = (event) => {
        if (event.key === "Escape") closeDialog();
      };

      closeButton.addEventListener("click", closeDialog);
      openFolderButton.addEventListener("click", async () => {
        try {
          if (!Neutralino.os?.open) throw new Error("No supported folder opener is available.");
          await Neutralino.os.open(destinationFolder);
          closeDialog();
        } catch (error) {
          console.error("Failed to open exported original nodes folder:", error);
          alert("Unable to open the destination folder.");
        }
      });
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeDialog();
      });
      document.addEventListener("keydown", onKeyDown);

      actions.append(closeButton, openFolderButton);
      box.append(title, actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      openFolderButton.focus();
    });

    const exportOriginalGraphNodes = async () => {
      if (!isNeutralinoRuntime() || !Neutralino.os?.showFolderDialog || !Neutralino.filesystem?.readFile || !Neutralino.filesystem?.writeFile || !Neutralino.filesystem?.createDirectory || !Neutralino.filesystem?.getStats) {
        alert("Exporting original nodes is available only in the desktop app.");
        return;
      }

      const fileNodes = getVisibleFileNodes();
      if (!fileNodes.length) {
        alert("There are no visible file points to export.");
        return;
      }

      const destinationFolder = await Neutralino.os.showFolderDialog("Select destination folder");
      if (!destinationFolder) return;

      const createdDirectories = new Set();
      const exportedPaths = [];
      const failedItems = [];
      for (const graphNode of fileNodes) {
        try {
          const markdown = await readGraphNodeContent(graphNode);
          const sourcePath = getSourceFilePathFromMarkdown(markdown);
          if (!sourcePath) {
            failedItems.push(`${getNodeFileName(graphNode.id)}: missing source_file`);
            continue;
          }

          const relativeExportPath = getOriginalExportRelativePath(sourcePath, graphNode);
          if (!relativeExportPath) {
            failedItems.push(`${getNodeFileName(graphNode.id)}: unable to derive export path`);
            continue;
          }

          const sourceContent = await Neutralino.filesystem.readFile(sourcePath);
          const destinationPath = joinPath(destinationFolder, relativeExportPath);
          await ensureOriginalExportDirectories(destinationPath, createdDirectories);
          await Neutralino.filesystem.writeFile(destinationPath, sourceContent);
          exportedPaths.push(destinationPath);
        } catch (error) {
          console.error("Failed to export original graph node:", error);
          failedItems.push(`${getNodeFileName(graphNode.id)}: ${error?.message || "export failed"}`);
        }
      }

      if (!exportedPaths.length && failedItems.length) {
        alert(`Unable to export original nodes.\n${failedItems.slice(0, 10).join("\n")}`);
        return;
      }

      const message = [`Exported ${exportedPaths.length} original file${exportedPaths.length === 1 ? "" : "s"}.`];
      if (failedItems.length) message.push(`Skipped ${failedItems.length} file${failedItems.length === 1 ? "" : "s"}:\n${failedItems.slice(0, 10).join("\n")}`);
      await showOriginalExportCompleteDialog(message.join("\n\n"), destinationFolder);
    };

    const exportOriginalGraphNode = async (graphNode) => {
      if (!graphNode || isTagNode(graphNode) || isClusterNode(graphNode)) return;
      if (!isNeutralinoRuntime() || !Neutralino.os?.showFolderDialog || !Neutralino.filesystem?.readFile || !Neutralino.filesystem?.writeFile || !Neutralino.filesystem?.createDirectory || !Neutralino.filesystem?.getStats) {
        alert("Exporting an original node is available only in the desktop app.");
        return;
      }

      const destinationFolder = await Neutralino.os.showFolderDialog("Select destination folder");
      if (!destinationFolder) return;

      try {
        const markdown = await readGraphNodeContent(graphNode);
        const sourcePath = getSourceFilePathFromMarkdown(markdown);
        if (!sourcePath) {
          alert("This node does not have a source_file frontmatter value.");
          return;
        }

        const relativeExportPath = getOriginalExportRelativePath(sourcePath, graphNode);
        if (!relativeExportPath) {
          alert("Unable to derive an export path for this original node.");
          return;
        }

        const destinationPath = joinPath(destinationFolder, relativeExportPath);
        await ensureOriginalExportDirectories(destinationPath, new Set());
        await Neutralino.filesystem.writeFile(destinationPath, await Neutralino.filesystem.readFile(sourcePath));
        await showOriginalExportCompleteDialog("Exported 1 original file.", destinationFolder);
      } catch (error) {
        console.error("Failed to export original graph node:", error);
        alert("Unable to export this original node.");
      }
    };

    const getHiddenNodeIdsForGraphPoint = (graphNode) => {
      if (!graphNode) return [];
      if (isClusterNode(graphNode)) {
        return Array.from(new Set(graphNode.memberNodeIds || [])).filter(Boolean);
      }
      return graphNode.id ? [graphNode.id] : [];
    };

    const hideGraphPoint = (graphNode) => {
      const nodeIds = getHiddenNodeIdsForGraphPoint(graphNode);
      if (!nodeIds.length) return;
      simulation.stop();

      // Re-render by reusing temporary in-memory file graph and hiding this node for this tab view only.
      const activeGraphTab = getActiveGraphTab();
      if (activeGraphTab) {
        const currentConfig = normalizeGraphViewConfig(activeGraphTab.graphViewConfig);
        const hiddenNodeIds = Array.from(new Set([...(currentConfig.hiddenNodeIds || []), ...nodeIds]));
        const targetClusterId = isClusterNode(graphNode) ? (graphNode.clusterId || graphNode.id) : "";
        activeGraphTab.graphViewConfig = {
          ...currentConfig,
          hiddenNodeIds,
          collapsedClusters: targetClusterId
            ? (currentConfig.collapsedClusters || []).filter((cluster) => getClusterNodeId(cluster) !== targetClusterId)
            : currentConfig.collapsedClusters
        };
        markGraphTabAsChanged(activeGraphTab);
        saveTabsToStorage(tabs);
        graphRenderCache.delete(activeGraphTab.id);
      }
      graphRenderWrapper.remove();
      renderGraphView();
    };

    const getVisibleLeafNodeIds = () => {
      const visibleFileNodeIds = new Set(nodes.filter((n) => !isTagNode(n) && !isClusterNode(n)).map((n) => n.id));
      const nodesWithOutgoingLinks = new Set();
      links.filter(isMarkdownLink).forEach((link) => {
        const sourceId = getLinkSourceId(link);
        const targetId = getLinkTargetId(link);
        if (visibleFileNodeIds.has(sourceId) && visibleFileNodeIds.has(targetId)) {
          nodesWithOutgoingLinks.add(sourceId);
        }
      });
      return Array.from(visibleFileNodeIds).filter((nodeId) => !nodesWithOutgoingLinks.has(nodeId));
    };

    const applyGraphTransform = (nextTransform, options = {}) => {
      if (!nextTransform) return;
      if (options.animate !== false && typeof svg.transition === "function") {
        svg.transition().duration(options.duration || 420).call(zoomBehavior.transform, nextTransform);
      } else {
        currentZoomTransform = nextTransform;
        activeTab.graphZoomScale = currentZoomTransform.k;
        const cachedGraphRender = graphRenderCache.get(activeTab.id);
        if (cachedGraphRender) cachedGraphRender.zoomScale = currentZoomTransform.k;
        graphLayer.attr("transform", currentZoomTransform);
        updateLabelVisibility();
        updateStatusLine({
          visiblePointCount: activeTab.visiblePointCount || nodes.length,
          graphEdgeCount: activeTab.graphEdgeCount || graphEdgeCount,
          graphZoomScale: currentZoomTransform.k
        });
        captureGraphLayout(activeTab, nodes, currentZoomTransform);
        scheduleGraphLayoutStorageSave();
      }
    };

    const getGraphCenterTransform = (targetNodes = nodes) => {
      const centerNodes = (Array.isArray(targetNodes) ? targetNodes : [])
        .filter((graphNode) => Number.isFinite(graphNode?.x) && Number.isFinite(graphNode?.y));
      if (!centerNodes.length) return null;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      centerNodes.forEach((graphNode) => {
        minX = Math.min(minX, graphNode.x);
        minY = Math.min(minY, graphNode.y);
        maxX = Math.max(maxX, graphNode.x);
        maxY = Math.max(maxY, graphNode.y);
      });

      const padding = Math.min(160, Math.max(72, Math.min(width, height) * 0.14));
      const boxWidth = Math.max(1, maxX - minX);
      const boxHeight = Math.max(1, maxY - minY);
      const centerX = minX + boxWidth / 2;
      const centerY = minY + boxHeight / 2;
      const fitScale = Math.min((width - padding * 2) / boxWidth, (height - padding * 2) / boxHeight);
      const targetScale = centerNodes.length === 1
        ? Math.max(1, Math.min(2, currentZoomTransform?.k || 1.4))
        : Math.max(0.2, Math.min(2.2, fitScale));
      return d3.zoomIdentity
        .translate(width / 2 - centerX * targetScale, height / 2 - centerY * targetScale)
        .scale(targetScale);
    };

    const centerGraphView = (options = {}) => {
      const nextTransform = getGraphCenterTransform(nodes);
      if (!nextTransform) return false;
      applyGraphTransform(nextTransform, options);
      return true;
    };

    const hideLeafGraphPoints = () => {
      const leafNodeIds = getVisibleLeafNodeIds();
      if (!leafNodeIds.length) {
        hideContextMenu();
        return;
      }

      simulation.stop();
      const activeGraphTab = getActiveGraphTab();
      if (activeGraphTab) {
        activeGraphTab.graphViewConfig = {
          ...(activeGraphTab.graphViewConfig || {}),
          hiddenNodeIds: Array.from(new Set([...(activeGraphTab.graphViewConfig?.hiddenNodeIds || []), ...leafNodeIds]))
        };
        markGraphTabAsChanged(activeGraphTab);
        saveTabsToStorage(tabs);
        graphRenderCache.delete(activeGraphTab.id);
      }
      hideContextMenu();
      graphRenderWrapper.remove();
      renderGraphView();
    };

    const getGraphLayoutWithoutZoom = (graphLayout) => {
      if (!graphLayout || typeof graphLayout !== "object") return null;
      const { zoom, transform, ...layoutWithoutZoom } = graphLayout;
      return layoutWithoutZoom;
    };

    const updateGraphCollapsedClusters = (collapsedClusters) => {
      simulation.stop();
      const activeGraphTab = getActiveGraphTab();
      if (!activeGraphTab) return;
      activeGraphTab.graphViewConfig = normalizeGraphViewConfig({
        ...(activeGraphTab.graphViewConfig || {}),
        collapsedClusters
      });
      markGraphTabAsChanged(activeGraphTab);
      saveTabsToStorage(tabs);
      graphRenderCache.delete(activeGraphTab.id);
      hideContextMenu();
      graphRenderWrapper.remove();
      renderGraphView();
    };

    const getVisibleDirectOutgoingFileNodeIds = (nodeId) => {
      const visibleFileNodeIds = new Set(nodes.filter((n) => !isTagNode(n) && !isClusterNode(n)).map((n) => n.id));
      return Array.from(new Set(links
        .filter((link) => isMarkdownLink(link) && getLinkSourceId(link) === nodeId)
        .map(getLinkTargetId)
        .filter((targetId) => targetId && targetId !== nodeId && visibleFileNodeIds.has(targetId))));
    };

    const getVisibleFullOutgoingFileNodeIds = (nodeId) => {
      if (!nodeId) return [];
      const visibleFileNodeIds = new Set(nodes.filter((n) => !isTagNode(n) && !isClusterNode(n)).map((n) => n.id));
      if (!visibleFileNodeIds.has(nodeId)) return [];
      const outgoingByNodeId = new Map();
      links.filter(isMarkdownLink).forEach((link) => {
        const sourceId = getLinkSourceId(link);
        const targetId = getLinkTargetId(link);
        if (!visibleFileNodeIds.has(sourceId) || !visibleFileNodeIds.has(targetId) || sourceId === targetId) return;
        if (!outgoingByNodeId.has(sourceId)) outgoingByNodeId.set(sourceId, new Set());
        outgoingByNodeId.get(sourceId).add(targetId);
      });

      const visited = new Set([nodeId]);
      const queue = Array.from(outgoingByNodeId.get(nodeId) || []);
      while (queue.length) {
        const nextId = queue.shift();
        if (!nextId || visited.has(nextId) || getNodeCollapsedCluster(nextId)) continue;
        visited.add(nextId);
        (outgoingByNodeId.get(nextId) || []).forEach((targetId) => {
          if (!visited.has(targetId)) queue.push(targetId);
        });
      }
      return Array.from(visited);
    };

    const getVisibleFullNetworkFileNodeIds = (nodeId) => {
      if (!nodeId) return [];
      const adjacency = getVisibleMarkdownFileAdjacency();
      if (!adjacency.has(nodeId)) return [];
      const visited = new Set([nodeId]);
      const queue = Array.from(adjacency.get(nodeId) || []);
      while (queue.length) {
        const nextId = queue.shift();
        if (!nextId || visited.has(nextId) || getNodeCollapsedCluster(nextId)) continue;
        visited.add(nextId);
        (adjacency.get(nextId) || new Set()).forEach((neighborId) => {
          if (!visited.has(neighborId)) queue.push(neighborId);
        });
      }
      return Array.from(visited);
    };

    const getVisibleMarkdownFileAdjacency = () => {
      const visibleFileNodeIds = new Set(nodes.filter((n) => !isTagNode(n) && !isClusterNode(n)).map((n) => n.id));
      const adjacency = new Map(Array.from(visibleFileNodeIds).map((nodeId) => [nodeId, new Set()]));
      links.filter(isMarkdownLink).forEach((link) => {
        const sourceId = getLinkSourceId(link);
        const targetId = getLinkTargetId(link);
        if (!sourceId || !targetId || sourceId === targetId) return;
        if (!visibleFileNodeIds.has(sourceId) || !visibleFileNodeIds.has(targetId)) return;
        adjacency.get(sourceId).add(targetId);
        adjacency.get(targetId).add(sourceId);
      });
      return adjacency;
    };

    const getConnectedCommunitySubset = (seedNodeId, candidateNodeIds, adjacency) => {
      const candidates = new Set(candidateNodeIds);
      if (!candidates.has(seedNodeId)) return [];
      const visited = new Set([seedNodeId]);
      const queue = [seedNodeId];
      while (queue.length) {
        const currentNodeId = queue.shift();
        (adjacency.get(currentNodeId) || new Set()).forEach((nextNodeId) => {
          if (!candidates.has(nextNodeId) || visited.has(nextNodeId)) return;
          visited.add(nextNodeId);
          queue.push(nextNodeId);
        });
      }
      return Array.from(visited);
    };

    const getDetectedCommunityMemberIds = (nodeId) => {
      if (!nodeId || getNodeCollapsedCluster(nodeId)) return [];
      const adjacency = getVisibleMarkdownFileAdjacency();
      if (!adjacency.has(nodeId) || (adjacency.get(nodeId)?.size || 0) < 2) return [];

      const nodeIds = Array.from(adjacency.keys()).sort((a, b) => a.localeCompare(b));
      const labels = new Map(nodeIds.map((id) => [id, id]));
      const maxIterations = 20;
      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        let changed = false;
        nodeIds.forEach((id) => {
          const counts = new Map();
          (adjacency.get(id) || new Set()).forEach((neighborId) => {
            const label = labels.get(neighborId);
            counts.set(label, (counts.get(label) || 0) + 1);
          });
          if (!counts.size) return;
          const currentLabel = labels.get(id);
          let bestLabel = currentLabel;
          let bestCount = counts.get(currentLabel) || 0;
          Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
            .forEach(([label, count]) => {
              if (count > bestCount) {
                bestLabel = label;
                bestCount = count;
              }
            });
          if (bestLabel !== currentLabel) {
            labels.set(id, bestLabel);
            changed = true;
          }
        });
        if (!changed) break;
      }

      const seedLabel = labels.get(nodeId);
      const sameLabelNodeIds = nodeIds.filter((id) => labels.get(id) === seedLabel && !getNodeCollapsedCluster(id));
      const communityNodeIds = getConnectedCommunitySubset(nodeId, sameLabelNodeIds, adjacency);
      const maxCommunitySize = Math.max(20, Math.min(250, Math.floor(nodeIds.length * 0.35)));
      if (communityNodeIds.length < 3 || communityNodeIds.length > maxCommunitySize) return [];
      return communityNodeIds;
    };

    const getNodeCollapsedCluster = (nodeId) => {
      const collapsedClusters = normalizeGraphViewConfig(getActiveGraphTab()?.graphViewConfig).collapsedClusters;
      return collapsedClusters.find((cluster) => (cluster.memberNodeIds || []).includes(nodeId)) || null;
    };

    const getCollapsibleClusterMemberIds = (nodeId, mode = "direct-outgoing") => {
      if (!nodeId || getNodeCollapsedCluster(nodeId)) return [];
      if (mode === "community") return getDetectedCommunityMemberIds(nodeId);
      if (mode === "full-outgoing") {
        const memberNodeIds = getVisibleFullOutgoingFileNodeIds(nodeId)
          .filter((memberNodeId) => memberNodeId === nodeId || !getNodeCollapsedCluster(memberNodeId));
        return memberNodeIds.length >= 3 ? memberNodeIds : [];
      }
      const outgoingNodeIds = getVisibleDirectOutgoingFileNodeIds(nodeId)
        .filter((outgoingNodeId) => !getNodeCollapsedCluster(outgoingNodeId));
      return outgoingNodeIds.length > 1 ? [nodeId, ...outgoingNodeIds] : [];
    };

    const getLocalGraphTagNodeIds = (nodeId, mode = "local") => {
      if (!nodeId) return [];
      let linkedNodeIds = [nodeId, ...getVisibleDirectOutgoingFileNodeIds(nodeId)];
      if (mode === "full-local") linkedNodeIds = getVisibleFullOutgoingFileNodeIds(nodeId);
      if (mode === "full-network") linkedNodeIds = getVisibleFullNetworkFileNodeIds(nodeId);
      return Array.from(new Set(linkedNodeIds));
    };

    const getLocalGraphTagNodes = (graphNode, mode = "local") => {
      const tagNodeIds = new Set(getLocalGraphTagNodeIds(graphNode?.id, mode));
      return nodes.filter((node) => tagNodeIds.has(node.id) && !isTagNode(node) && !isClusterNode(node));
    };

    const getRandomGraphGroupColor = () => {
      const value = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
      return `#${value}`;
    };

    const ensureGraphTagGroup = (tag, options = {}) => {
      const activeGraphTab = getActiveGraphTab();
      if (!activeGraphTab) return false;
      const normalizedTag = normalizeTagName(tag);
      if (!normalizedTag) return false;
      const tagQuery = `tag:${normalizedTag}`;
      const currentConfig = normalizeGraphViewConfig(activeGraphTab.graphViewConfig);
      const shouldHide = options.hidden === true;
      let changed = false;
      const groups = currentConfig.groups.map((group) => {
        if (String(group.query || "").trim().toLowerCase() !== tagQuery.toLowerCase()) return group;
        const nextHidden = shouldHide;
        if (group.enabled !== false && group.hidden === nextHidden) return group;
        changed = true;
        return { ...group, enabled: true, hidden: nextHidden };
      });

      if (!groups.some((group) => String(group.query || "").trim().toLowerCase() === tagQuery.toLowerCase())) {
        groups.push({
          id: createGraphGroupId(`${tagQuery}:${Date.now()}`),
          query: tagQuery,
          color: getRandomGraphGroupColor(),
          enabled: true,
          hidden: shouldHide
        });
        changed = true;
      }

      if (!changed) return false;
      activeGraphTab.graphViewConfig = normalizeGraphViewConfig({
        ...currentConfig,
        groups
      });
      markGraphTabAsChanged(activeGraphTab);
      saveTabsToStorage(tabs);
      return true;
    };

    const getMostReferencedGraphNodes = () => {
      const percent = typeof getGraphMostReferencedPercent === "function" ? getGraphMostReferencedPercent() : 10;
      const sourceNodes = (graphSnapshot.nodes || [])
        .map((node) => ({ ...node, type: node?.type || "file" }))
        .filter((node) => !isTagNode(node) && !isClusterNode(node));
      const fileIds = new Set(sourceNodes.map((node) => node.id).filter(Boolean));
      const incomingCounts = new Map(Array.from(fileIds).map((nodeId) => [nodeId, 0]));

      (graphSnapshot.links || [])
        .map((link) => ({ ...link, type: link?.type || "link" }))
        .filter(isMarkdownLink)
        .forEach((link) => {
          const sourceId = getLinkSourceId(link);
          const targetId = getLinkTargetId(link);
          if (!fileIds.has(sourceId) || !fileIds.has(targetId)) return;
          incomingCounts.set(targetId, (incomingCounts.get(targetId) || 0) + 1);
        });

      const rankedNodes = sourceNodes
        .map((node) => ({ node, incomingCount: incomingCounts.get(node.id) || 0 }))
        .filter((entry) => entry.incomingCount > 0)
        .sort((a, b) => b.incomingCount - a.incomingCount || String(a.node.id).localeCompare(String(b.node.id), undefined, { sensitivity: "base" }));

      if (!rankedNodes.length) return [];
      const desiredCount = Math.max(1, Math.ceil(sourceNodes.length * percent / 100));
      const cutoffIndex = Math.min(desiredCount, rankedNodes.length) - 1;
      const cutoffCount = rankedNodes[cutoffIndex]?.incomingCount || 0;
      return rankedNodes.filter((entry) => entry.incomingCount >= cutoffCount).map((entry) => entry.node);
    };

    const hasSnapshotTagForNode = (graphNode, tag) => {
      const snapshotFile = getSnapshotFileForNode(graphNode);
      return normalizeFileTagList([
        ...(Array.isArray(graphNode?.tags) ? graphNode.tags : []),
        ...(Array.isArray(snapshotFile?.tags) ? snapshotFile.tags : []),
        ...(snapshotFile?.content ? getFileTagsFromContent(snapshotFile.content) : [])
      ]).includes(tag);
    };

    const groupMostReferencedGraphNodes = async () => {
      const activeGraphTab = getActiveGraphTab();
      if (!activeGraphTab || !graphSnapshot?.nodes?.length) return;
      if (isKeepSavedGraphMode(activeGraphTab)) {
        alert("Saved graph mode does not update saved tags or links.");
        return;
      }

      const tagName = window.prompt("Tag name for the most referenced files", "infrastructure");
      const normalizedTag = normalizeTagName(tagName);
      if (!normalizedTag) return;

      const tagPerf = typeof createGraphPerfSession === "function"
        ? createGraphPerfSession("group most referenced tagging", {
          tag: normalizedTag,
          tabId: activeGraphTab.id,
          title: activeGraphTab.title || ""
        })
        : null;
      setGraphQuickActionBusy(true, "Detecting most referenced...");
      await new Promise((resolve) => requestAnimationFrame(resolve));
      try {
        const selectedNodes = getMostReferencedGraphNodes();
        tagPerf?.mark("selected most referenced files", {
          selectedFiles: selectedNodes.length,
          graphNodes: nodes.length,
          graphLinks: links.length,
          percent: getGraphMostReferencedPercent()
        });
        if (!selectedNodes.length) {
          alert("No referenced files were found to tag.");
          return;
        }

        const batchTotals = {
          changed: 0,
          skippedOrAlreadyTagged: 0,
          failed: 0,
          readMs: 0,
          parseTagsMs: 0,
          updateContentMs: 0,
          writeMs: 0,
          localStateMs: 0,
          snapshotRebuildMs: 0,
          storageUiMs: 0,
          totalMs: 0
        };
        if (typeof createTag === "function") createTag(normalizedTag);
        tagPerf?.mark("tag ensured", { tag: normalizedTag });

        setGraphQuickActionBusy(true, `Tagging ${selectedNodes.length} file${selectedNodes.length === 1 ? "" : "s"}...`);
        let changedFiles = false;
        let alreadyTaggedFiles = false;
        const failedNodes = [];
        const changedSnapshotFiles = [];
        for (let index = 0; index < selectedNodes.length; index += 1) {
          const graphNode = selectedNodes[index];
          setGraphQuickActionBusy(true, `Tagging file ${index + 1} / ${selectedNodes.length}`);
          if (index === 0 || index % 10 === 0) await new Promise((resolve) => requestAnimationFrame(resolve));
          try {
            alreadyTaggedFiles = hasSnapshotTagForNode(graphNode, normalizedTag) || alreadyTaggedFiles;
            const perfFileStart = nowForGraphPerf();
            const beforeMarks = tagPerf?.marks?.length || 0;
            const changedThisFile = await updateGraphNodeTagContent(graphNode, normalizedTag, "add", {
              deferGraphRefresh: true,
              perfSession: tagPerf,
              perfDetails: {
                index: index + 1,
                total: selectedNodes.length
              }
            });
            changedFiles = changedThisFile || changedFiles;
            if (changedThisFile) {
              batchTotals.changed += 1;
              const changedSnapshotFile = getSnapshotFileForNode(graphNode);
              if (changedSnapshotFile) changedSnapshotFiles.push(changedSnapshotFile);
            }
            else batchTotals.skippedOrAlreadyTagged += 1;
            const fileTotalMs = elapsedGraphPerfMs(perfFileStart);
            batchTotals.totalMs += fileTotalMs;
            const latestMark = tagPerf?.marks?.[beforeMarks];
            if (latestMark) {
              batchTotals.readMs += Number(latestMark.readMs || 0);
              batchTotals.parseTagsMs += Number(latestMark.parseTagsMs || 0);
              batchTotals.updateContentMs += Number(latestMark.updateContentMs || 0);
              batchTotals.writeMs += Number(latestMark.writeMs || 0);
              batchTotals.localStateMs += Number(latestMark.localStateMs || 0);
              batchTotals.snapshotRebuildMs += Number(latestMark.snapshotRebuildMs || 0);
              batchTotals.storageUiMs += Number(latestMark.storageUiMs || 0);
            }
            if ((index + 1) % 50 === 0 || index + 1 === selectedNodes.length) {
              tagPerf?.mark("tagging progress summary", {
                tagged: index + 1,
                total: selectedNodes.length,
                changed: batchTotals.changed,
                skippedOrAlreadyTagged: batchTotals.skippedOrAlreadyTagged,
                failed: batchTotals.failed,
                readMs: Math.round(batchTotals.readMs * 10) / 10,
                parseTagsMs: Math.round(batchTotals.parseTagsMs * 10) / 10,
                updateContentMs: Math.round(batchTotals.updateContentMs * 10) / 10,
                writeMs: Math.round(batchTotals.writeMs * 10) / 10,
                localStateMs: Math.round(batchTotals.localStateMs * 10) / 10,
                snapshotRebuildMs: Math.round(batchTotals.snapshotRebuildMs * 10) / 10,
                storageUiMs: Math.round(batchTotals.storageUiMs * 10) / 10,
                totalFileMs: Math.round(batchTotals.totalMs * 10) / 10
              });
            }
          } catch (error) {
            failedNodes.push(graphNode);
            batchTotals.failed += 1;
            console.error("Failed to tag most referenced graph file:", graphNode?.id, error);
            tagPerf?.mark("tag file failed", {
              index: index + 1,
              total: selectedNodes.length,
              nodeId: graphNode?.id || "",
              message: error?.message || String(error)
            });
          }
        }

        setGraphQuickActionBusy(true, "Creating hidden group...");
        tagPerf?.mark("tagging loop complete", {
          selectedFiles: selectedNodes.length,
          changed: batchTotals.changed,
          skippedOrAlreadyTagged: batchTotals.skippedOrAlreadyTagged,
          failed: batchTotals.failed,
          readMs: Math.round(batchTotals.readMs * 10) / 10,
          parseTagsMs: Math.round(batchTotals.parseTagsMs * 10) / 10,
          updateContentMs: Math.round(batchTotals.updateContentMs * 10) / 10,
          writeMs: Math.round(batchTotals.writeMs * 10) / 10,
          localStateMs: Math.round(batchTotals.localStateMs * 10) / 10,
          snapshotRebuildMs: Math.round(batchTotals.snapshotRebuildMs * 10) / 10,
          storageUiMs: Math.round(batchTotals.storageUiMs * 10) / 10,
          totalFileMs: Math.round(batchTotals.totalMs * 10) / 10
        });
        if (changedSnapshotFiles.length) {
          setGraphQuickActionBusy(true, `Rebuilding graph snapshot for ${changedSnapshotFiles.length} tagged file${changedSnapshotFiles.length === 1 ? "" : "s"}...`);
          const batchSnapshotStart = nowForGraphPerf();
          await rebuildOpenGraphSnapshotsAfterBatchTagChange(changedSnapshotFiles);
          tagPerf?.mark("batch graph snapshot rebuild", {
            changedFiles: changedSnapshotFiles.length,
            snapshotRebuildMs: elapsedGraphPerfMs(batchSnapshotStart)
          });
        }
        const changedGroups = (changedFiles || alreadyTaggedFiles || failedNodes.length < selectedNodes.length)
          ? ensureGraphTagGroup(normalizedTag, { hidden: true })
          : false;
        if (!changedFiles && !changedGroups) {
          if (failedNodes.length) alert(`Unable to tag ${failedNodes.length} most referenced file${failedNodes.length === 1 ? "" : "s"}.`);
          return;
        }

        const storageStart = nowForGraphPerf();
        saveTabsToStorage(tabs);
        renderTabBar(tabs, activeTabId);
        updateSaveCurrentFileButtons();
        tagPerf?.mark("batch state saved", {
          storageUiMs: elapsedGraphPerfMs(storageStart)
        });

        setGraphQuickActionBusy(true, "Refreshing graph...");
        const refreshStart = nowForGraphPerf();
        const refreshedGraphTab = getActiveGraphTab();
        await refreshFolderTagCounts();
        renderFilteredFolderTree();
        renderTagManagementList();
        renderLinkAutocomplete();
        if (refreshedGraphTab) updateGraphTagToolbar(refreshedGraphTab, refreshedGraphTab.graphSnapshot || null);
        simulation.stop();
        graphRenderWrapper.remove();
        renderGraphView();
        tagPerf?.mark("final refresh queued", {
          refreshMs: elapsedGraphPerfMs(refreshStart),
          failed: failedNodes.length
        });

        if (failedNodes.length) {
          alert(`Tagged ${selectedNodes.length - failedNodes.length} most referenced file${selectedNodes.length - failedNodes.length === 1 ? "" : "s"}, but ${failedNodes.length} file${failedNodes.length === 1 ? "" : "s"} could not be updated.`);
        }
      } finally {
        tagPerf?.end({ completed: true });
        setGraphQuickActionBusy(false);
      }
    };

    const collapseGraphNodeToCluster = (graphNode, mode = "direct-outgoing") => {
      if (!graphNode || isTagNode(graphNode) || isClusterNode(graphNode)) return;
      const memberNodeIds = getCollapsibleClusterMemberIds(graphNode.id, mode);
      if (memberNodeIds.length < 3) return;
      const currentConfig = normalizeGraphViewConfig(getActiveGraphTab()?.graphViewConfig);
      const cluster = {
        id: createGraphGroupId(`cluster:${graphNode.id}:${Date.now()}`),
        label: getGraphNodeLabel(graphNode),
        mode,
        seedNodeId: graphNode.id,
        memberNodeIds,
        createdAt: Date.now()
      };
      updateGraphCollapsedClusters([...(currentConfig.collapsedClusters || []), cluster]);
    };

    const expandGraphCluster = (clusterNode) => {
      const clusterId = clusterNode?.clusterId || clusterNode?.id;
      if (!clusterId) return;
      const currentConfig = normalizeGraphViewConfig(getActiveGraphTab()?.graphViewConfig);
      updateGraphCollapsedClusters((currentConfig.collapsedClusters || []).filter((cluster) => getClusterNodeId(cluster) !== clusterId));
    };

    const removeGraphPointFromSnapshot = (nodeId) => {
      const activeGraphTab = getActiveGraphTab();
      if (!activeGraphTab?.graphSnapshot) return;
      activeGraphTab.graphSnapshot = {
        ...activeGraphTab.graphSnapshot,
        nodes: (activeGraphTab.graphSnapshot.nodes || []).filter((n) => n.id !== nodeId),
        links: (activeGraphTab.graphSnapshot.links || []).filter((l) => l.source !== nodeId && l.target !== nodeId),
        files: (activeGraphTab.graphSnapshot.files || []).filter((file) => file.id !== nodeId)
      };
      activeGraphTab.graphViewConfig = {
        ...(activeGraphTab.graphViewConfig || {}),
        hiddenNodeIds: (activeGraphTab.graphViewConfig?.hiddenNodeIds || []).filter((id) => id !== nodeId)
      };
      folderMarkdownFiles = (folderMarkdownFiles || []).filter((entry) => {
        const entryPath = entry.path || entry.fullPath || entry.file?.webkitRelativePath || entry.file?.name || "";
        return normalizeGraphNodeName(entryPath) !== nodeId;
      });
      markGraphTabAsChanged(activeGraphTab);
      saveTabsToStorage(tabs);
      graphRenderCache.delete(activeGraphTab.id);
    };

    const findOpenMarkdownTabForSnapshotFile = (snapshotFile, graphNode) => {
      if (!snapshotFile && !graphNode) return null;
      const candidatePaths = new Set([
        snapshotFile?.fullPath,
        snapshotFile?.path,
        graphNode?.fullPath
      ].filter(Boolean));
      const candidateNames = new Set([
        snapshotFile?.name,
        snapshotFile?.path ? getFileName(snapshotFile.path) : null,
        snapshotFile?.fullPath ? getFileName(snapshotFile.fullPath) : null,
        graphNode?.label
      ].filter(Boolean));

      return tabs.find((tab) => {
        if (!tab || tab.type === "graph") return false;
        if (snapshotFile?.handle && tab.sourceFileHandle === snapshotFile.handle) return true;
        if (tab.sourceFilePath && candidatePaths.has(tab.sourceFilePath)) return true;
        if (tab.sourceFileName && candidateNames.has(tab.sourceFileName)) return true;
        return tab.title && candidateNames.has(tab.title);
      }) || null;
    };

    const getGraphSnapshotContextKey = (tab) => [
      tab?.graphScopeKey,
      tab?.graphSnapshot?.folderName,
      tab?.folderName,
      tab?.title
    ].map((value) => String(value || "").trim().toLowerCase()).find(Boolean) || "";

    const graphSnapshotFileMatches = (candidateFile, referenceFile, candidateTab, referenceTab) => {
      if (!candidateFile || !referenceFile) return false;
      const getFullPathKey = (file) => file.fullPath ? normalizeGraphNodeName(file.fullPath) : "";
      const candidateFullPathKey = getFullPathKey(candidateFile);
      const referenceFullPathKey = getFullPathKey(referenceFile);
      if (candidateFullPathKey || referenceFullPathKey) {
        return !!candidateFullPathKey && candidateFullPathKey === referenceFullPathKey;
      }

      const candidateContextKey = getGraphSnapshotContextKey(candidateTab);
      const referenceContextKey = getGraphSnapshotContextKey(referenceTab);
      if (candidateTab !== referenceTab && (!candidateContextKey || candidateContextKey !== referenceContextKey)) return false;

      const getRelativeKeys = (file) => [
        file.id,
        file.path ? normalizeGraphNodeName(file.path) : null
      ].filter(Boolean);
      const candidateRelativeKeys = new Set(getRelativeKeys(candidateFile));
      const referenceRelativeKeys = getRelativeKeys(referenceFile);
      if (candidateRelativeKeys.size || referenceRelativeKeys.length) {
        return referenceRelativeKeys.some((key) => candidateRelativeKeys.has(key));
      }

      return !!candidateFile.name && candidateFile.name === referenceFile.name;
    };

    const nowForGraphPerf = () => (typeof performance !== "undefined" ? performance.now() : 0);
    const elapsedGraphPerfMs = (startTime) => {
      if (!startTime || typeof performance === "undefined") return 0;
      return Math.round((performance.now() - startTime) * 10) / 10;
    };

    const rebuildOpenGraphSnapshotsAfterTagChange = async (changedSnapshotFile) => {
      if (!changedSnapshotFile) return false;
      let changedActiveGraph = false;

      for (const tab of tabs) {
        if (tab?.type !== "graph" || !tab.graphSnapshot?.files || isKeepSavedGraphMode(tab)) continue;

        let graphChanged = false;
        tab.graphSnapshot.files.forEach((snapshotFile) => {
          if (!graphSnapshotFileMatches(snapshotFile, changedSnapshotFile, tab, getActiveGraphTab())) return;
          snapshotFile.content = changedSnapshotFile.content || "";
          snapshotFile.tags = normalizeFileTagList(changedSnapshotFile.tags || getFileTagsFromContent(snapshotFile.content));
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
    };

    const rebuildOpenGraphSnapshotsAfterBatchTagChange = async (changedSnapshotFiles) => {
      const changedFiles = Array.from(new Set((changedSnapshotFiles || []).filter(Boolean)));
      if (!changedFiles.length) return false;
      let changedActiveGraph = false;

      for (const tab of tabs) {
        if (tab?.type !== "graph" || !tab.graphSnapshot?.files || isKeepSavedGraphMode(tab)) continue;

        let graphChanged = false;
        tab.graphSnapshot.files.forEach((snapshotFile) => {
          const changedFile = changedFiles.find((candidateFile) => graphSnapshotFileMatches(snapshotFile, candidateFile, tab, getActiveGraphTab()));
          if (!changedFile) return;
          snapshotFile.content = changedFile.content || "";
          snapshotFile.tags = normalizeFileTagList(changedFile.tags || getFileTagsFromContent(snapshotFile.content));
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
    };

    const updateGraphNodeTagContent = async (graphNode, tag, action, options = {}) => {
      const perfSession = options.perfSession || null;
      const perfDetails = options.perfDetails || {};
      const perfTimings = perfSession ? {
        readMs: 0,
        parseTagsMs: 0,
        updateContentMs: 0,
        writeMs: 0,
        localStateMs: 0,
        snapshotRebuildMs: 0,
        storageUiMs: 0,
        refreshMs: 0
      } : null;
      const perfTotalStart = nowForGraphPerf();
      if (!graphNode || graphNode.type === "tag") return false;
      const activeGraphTab = getActiveGraphTab();
      const snapshotFile = getSnapshotFileForNode(graphNode);
      if (isKeepSavedGraphMode(activeGraphTab)) {
        alert("Saved graph mode does not update saved tags or links.");
        return false;
      }
      if (!activeGraphTab || !snapshotFile) {
        alert("Unable to find the selected file in this graph snapshot.");
        return false;
      }

      let perfStepStart = nowForGraphPerf();
      const currentContent = await readGraphNodeContent(graphNode);
      if (perfTimings) perfTimings.readMs = elapsedGraphPerfMs(perfStepStart);

      perfStepStart = nowForGraphPerf();
      const currentTags = getFileTagsFromContent(currentContent);
      const normalizedTag = normalizeTagName(tag);
      if (perfTimings) perfTimings.parseTagsMs = elapsedGraphPerfMs(perfStepStart);
      if (action === "add" && currentTags.includes(normalizedTag)) {
        perfSession?.mark("tag file skipped", {
          ...perfDetails,
          nodeId: graphNode.id,
          reason: "already-tagged",
          fileTotalMs: elapsedGraphPerfMs(perfTotalStart),
          ...perfTimings
        });
        return false;
      }
      if (action === "remove" && !currentTags.includes(normalizedTag)) {
        perfSession?.mark("tag file skipped", {
          ...perfDetails,
          nodeId: graphNode.id,
          reason: "tag-missing",
          fileTotalMs: elapsedGraphPerfMs(perfTotalStart),
          ...perfTimings
        });
        return false;
      }

      perfStepStart = nowForGraphPerf();
      const nextContent = action === "remove"
        ? removeTagFromContent(currentContent, normalizedTag)
        : addTagToContent(currentContent, normalizedTag);
      if (perfTimings) perfTimings.updateContentMs = elapsedGraphPerfMs(perfStepStart);

      if (nextContent === currentContent) {
        perfSession?.mark("tag file skipped", {
          ...perfDetails,
          nodeId: graphNode.id,
          reason: "unchanged-content",
          fileTotalMs: elapsedGraphPerfMs(perfTotalStart),
          ...perfTimings
        });
        return false;
      }

      perfStepStart = nowForGraphPerf();
      await writeGraphNodeContent(graphNode, nextContent);
      if (perfTimings) perfTimings.writeMs = elapsedGraphPerfMs(perfStepStart);

      perfStepStart = nowForGraphPerf();
      snapshotFile.content = nextContent;
      snapshotFile.tags = getFileTagsFromContent(nextContent);
      if (!snapshotFile.fullPath && graphNode.fullPath) snapshotFile.fullPath = graphNode.fullPath;
      saveKnownTags([...getKnownTags(), ...snapshotFile.tags]);

      const folderEntry = getFolderMarkdownEntryForNode(graphNode);
      if (folderEntry) {
        folderEntry.content = nextContent;
        folderEntry.tags = snapshotFile.tags;
        updateFolderTreeNodeTagsForEntry(folderEntry, snapshotFile.tags);
      }

      const openMarkdownTab = findOpenMarkdownTabForSnapshotFile(snapshotFile, graphNode);
      if (openMarkdownTab) {
        const normalizedContent = normalizeEditorContent(nextContent);
        openMarkdownTab.content = normalizedContent;
        openMarkdownTab.savedContent = normalizedContent;
        openMarkdownTab.graphSyncedTags = snapshotFile.tags;
        if (openMarkdownTab.id === activeTabId) {
          markdownEditor.value = normalizedContent;
          renderEditorSyntaxHighlights();
          updateEditorLineNumbers();
          renderMarkdown();
        }
      }
      if (perfTimings) perfTimings.localStateMs = elapsedGraphPerfMs(perfStepStart);

      if (options.deferGraphRefresh) {
        markGraphTabAsChanged(activeGraphTab);
        perfSession?.mark("tag file", {
          ...perfDetails,
          nodeId: graphNode.id,
          fileTotalMs: elapsedGraphPerfMs(perfTotalStart),
          ...perfTimings
        });
        return true;
      }

      perfStepStart = nowForGraphPerf();
      const changedActiveGraph = await rebuildOpenGraphSnapshotsAfterTagChange(snapshotFile);
      if (perfTimings) perfTimings.snapshotRebuildMs = elapsedGraphPerfMs(perfStepStart);

      perfStepStart = nowForGraphPerf();
      if (!changedActiveGraph) markGraphTabAsChanged(activeGraphTab);
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
      if (perfTimings) perfTimings.storageUiMs = elapsedGraphPerfMs(perfStepStart);
      perfStepStart = nowForGraphPerf();
      await refreshFolderTagCounts();
      renderFilteredFolderTree();
      renderTagManagementList();
      renderLinkAutocomplete();
      simulation.stop();
      graphRenderWrapper.remove();
      updateGraphTagToolbar(activeGraphTab, activeGraphTab.graphSnapshot || null);
      renderGraphView();
      if (perfTimings) perfTimings.refreshMs = elapsedGraphPerfMs(perfStepStart);
      perfSession?.mark("tag file", {
        ...perfDetails,
        nodeId: graphNode.id,
        fileTotalMs: elapsedGraphPerfMs(perfTotalStart),
        ...perfTimings
      });
      return true;
    };

    let localGraphTagPicker = null;

    const closeLocalGraphTagPicker = () => {
      if (!localGraphTagPicker) return;
      localGraphTagPicker.remove();
      localGraphTagPicker = null;
    };

    const getLocalGraphNodeTags = (graphNode, mode = "local") => {
      const tagNodes = getLocalGraphTagNodes(graphNode, mode);
      const tagsByNodeId = new Map(tagNodes.map((tagNode) => {
        const snapshotFile = getSnapshotFileForNode(tagNode);
        return [tagNode.id, normalizeFileTagList(tagNode.tags?.length ? tagNode.tags : snapshotFile?.tags || [])];
      }));
      const allTags = Array.from(new Set(Array.from(tagsByNodeId.values()).flat())).sort((a, b) => a.localeCompare(b));
      const appliedToAllTags = new Set(allTags.filter((tag) => tagNodes.every((tagNode) => (tagsByNodeId.get(tagNode.id) || []).includes(tag))));
      return { tagNodes, allTags, appliedToAllTags };
    };

    const updateLocalGraphTags = async (seedNode, tag, action, mode = "local") => {
      const normalizedTag = normalizeTagName(tag);
      if (!seedNode || !normalizedTag) return;
      const tagNodes = getLocalGraphTagNodes(seedNode, mode);
      if (!tagNodes.length) return;

      if (action === "add" && typeof createTag === "function") createTag(normalizedTag);

      let changedFiles = false;
      for (const tagNode of tagNodes) {
        changedFiles = await updateGraphNodeTagContent(tagNode, normalizedTag, action, { deferGraphRefresh: true }) || changedFiles;
      }

      const changedGroups = action === "add" ? ensureGraphTagGroup(normalizedTag) : false;
      if (!changedFiles && !changedGroups) return;

      const activeGraphTab = getActiveGraphTab();
      await refreshFolderTagCounts();
      renderFilteredFolderTree();
      renderTagManagementList();
      renderLinkAutocomplete();
      if (activeGraphTab) updateGraphTagToolbar(activeGraphTab, activeGraphTab.graphSnapshot || null);
      simulation.stop();
      graphRenderWrapper.remove();
      renderGraphView();
    };

    const tagLocalGraphNodes = (seedNode, tag) => updateLocalGraphTags(seedNode, tag, "add", "local");
    const tagFullLocalGraphNodes = (seedNode, tag) => updateLocalGraphTags(seedNode, tag, "add", "full-local");
    const tagFullNetworkNodes = (seedNode, tag) => updateLocalGraphTags(seedNode, tag, "add", "full-network");

    const showLocalGraphTagPicker = (seedNode, options = {}) => {
      const mode = options.mode || "local";
      closeLocalGraphTagPicker();
      const overlay = document.createElement("div");
      overlay.className = "graph-tag-picker-overlay";
      const panel = document.createElement("div");
      panel.className = "graph-tag-picker-panel";
      panel.addEventListener("click", (event) => event.stopPropagation());

      const title = document.createElement("div");
      title.className = "graph-tag-picker-title";
      title.textContent = options.title || "Tag Local Graph";
      panel.appendChild(title);

      const list = document.createElement("div");
      list.className = "graph-tag-picker-list";
      const localGraphTags = getLocalGraphNodeTags(seedNode, mode);
      const tags = Array.from(new Set((typeof getAllKnownAndReferencedTags === "function" ? getAllKnownAndReferencedTags() : getKnownTags())
        .concat(localGraphTags.allTags)
        .map(normalizeTagName)
        .filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));

      if (!tags.length) {
        const empty = document.createElement("div");
        empty.className = "graph-tag-picker-empty";
        empty.textContent = "No available tags";
        list.appendChild(empty);
      }

      tags.forEach((tag) => {
        const isApplied = localGraphTags.appliedToAllTags.has(tag);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "graph-tag-picker-item";
        button.setAttribute("aria-checked", isApplied ? "true" : "false");
        const icon = document.createElement("i");
        icon.className = isApplied ? "bi bi-check-lg" : "bi";
        icon.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = `#${tag}`;
        button.appendChild(icon);
        button.appendChild(label);
        button.addEventListener("click", async () => {
          closeLocalGraphTagPicker();
          try {
            await updateLocalGraphTags(seedNode, tag, isApplied ? "remove" : "add", mode);
          } catch (error) {
            console.error("Failed to tag local graph:", error);
            alert("Unable to tag the local graph.");
          }
        });
        list.appendChild(button);
      });

      const createButton = document.createElement("button");
      createButton.type = "button";
      createButton.className = "graph-tag-picker-item graph-tag-picker-create";
      createButton.textContent = "Create new tag ...";
      createButton.addEventListener("click", async () => {
        const tagName = window.prompt("New tag:");
        const normalizedTag = normalizeTagName(tagName);
        if (!normalizedTag) return;
        closeLocalGraphTagPicker();
        try {
          await updateLocalGraphTags(seedNode, normalizedTag, "add", mode);
        } catch (error) {
          console.error("Failed to tag local graph:", error);
          alert("Unable to tag the local graph.");
        }
      });
      list.appendChild(createButton);
      panel.appendChild(list);

      overlay.appendChild(panel);
      overlay.addEventListener("click", closeLocalGraphTagPicker);
      graphRenderWrapper.appendChild(overlay);
      localGraphTagPicker = overlay;
    };

    const quickActionWrapper = document.createElement("div");
    quickActionWrapper.className = "graph-quick-action";
    const quickActionButton = document.createElement("button");
    quickActionButton.type = "button";
    quickActionButton.className = "graph-quick-action-button";
    quickActionButton.title = "Graph actions";
    quickActionButton.setAttribute("aria-label", "Open graph actions");
    quickActionButton.setAttribute("aria-expanded", "false");
    quickActionButton.innerHTML = '<i class="bi bi-plus-lg" aria-hidden="true"></i>';

    const quickActionStatus = document.createElement("div");
    quickActionStatus.className = "graph-quick-action-status hidden";
    quickActionStatus.setAttribute("role", "status");
    quickActionStatus.setAttribute("aria-live", "polite");
    const quickActionStatusSpinner = document.createElement("span");
    quickActionStatusSpinner.className = "graph-quick-action-spinner";
    quickActionStatusSpinner.setAttribute("aria-hidden", "true");
    const quickActionStatusLabel = document.createElement("span");
    quickActionStatusLabel.textContent = "";
    quickActionStatus.append(quickActionStatusSpinner, quickActionStatusLabel);

    const quickActionMenu = document.createElement("div");
    quickActionMenu.className = "graph-quick-action-menu hidden";
    quickActionMenu.setAttribute("role", "menu");
    quickActionMenu.setAttribute("aria-label", "Graph actions");

    const groupMostReferencedButton = document.createElement("button");
    groupMostReferencedButton.type = "button";
    groupMostReferencedButton.className = "graph-quick-action-menu-item";
    groupMostReferencedButton.setAttribute("role", "menuitem");
    groupMostReferencedButton.innerHTML = '<i class="bi bi-tags" aria-hidden="true"></i><span>Group most referenced</span>';
    quickActionMenu.appendChild(groupMostReferencedButton);
    quickActionWrapper.append(quickActionStatus, quickActionMenu, quickActionButton);
    graphRenderWrapper.appendChild(quickActionWrapper);

    const setGraphQuickActionBusy = (busy, message = "") => {
      quickActionWrapper.classList.toggle("busy", !!busy);
      quickActionButton.disabled = !!busy;
      groupMostReferencedButton.disabled = !!busy;
      quickActionButton.setAttribute("aria-busy", busy ? "true" : "false");
      quickActionStatusLabel.textContent = busy ? message : "";
      quickActionStatus.classList.toggle("hidden", !busy);
      if (busy) closeGraphQuickActionMenu();
    };

    const closeGraphQuickActionMenu = () => {
      quickActionMenu.classList.add("hidden");
      quickActionButton.setAttribute("aria-expanded", "false");
    };

    quickActionButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isOpening = quickActionMenu.classList.contains("hidden");
      quickActionMenu.classList.toggle("hidden", !isOpening);
      quickActionButton.setAttribute("aria-expanded", isOpening ? "true" : "false");
    });
    quickActionWrapper.addEventListener("click", (event) => event.stopPropagation());
    graphRenderWrapper.addEventListener("click", closeGraphQuickActionMenu);
    groupMostReferencedButton.addEventListener("click", async () => {
      closeGraphQuickActionMenu();
      try {
        await groupMostReferencedGraphNodes();
      } catch (error) {
        console.error("Failed to group most referenced graph nodes:", error);
        alert("Unable to group the most referenced files.");
      }
    });

    const applyMagneticSetting = () => {
      if (graphSettings.magneticEnabled) {
        simulation
          .force("link", baseLinkForce)
          .force("charge", baseChargeForce)
          .force("center", baseCenterForce)
          .force("centerX", baseCenterPullX)
          .force("centerY", baseCenterPullY)
          .force("collision", baseCollisionForce)
          .force("groupCluster", useStaticLargeGraphLayout ? null : baseGroupClusterForce);
        if (useStaticLargeGraphLayout) {
          simulation.alpha(0.85).tick(70).stop();
          renderGraphTick();
          captureGraphLayout(activeTab, nodes, currentZoomTransform);
          scheduleGraphLayoutStorageSave();
        } else {
          simulation.alpha(0.7).restart();
        }
      } else {
        simulation
          .force("link", null)
          .force("charge", null)
          .force("center", null)
          .force("centerX", null)
          .force("centerY", null)
          .force("collision", null)
          .force("groupCluster", null)
          .alphaTarget(0)
          .stop();
        renderGraphTick();
        captureGraphLayout(activeTab, nodes, currentZoomTransform);
      }
      setContextMenuButtonLabel(
        magneticToggleBtn,
        graphSettings.magneticEnabled ? "Turn magnetic forces off" : "Turn magnetic forces on"
      );
    };

    const nodeContextMenuItems = [
      openFileBtn,
      openDefaultAppBtn,
      revealFileBtn,
      revealTreeViewBtn,
      renameFileBtn,
      copySubmenu,
      contextMenuGraphSeparator,
      hidePointBtn,
      collapseToClusterBtn,
      collapseFullOutgoingToClusterBtn,
      collapseDetectedCommunityBtn,
      expandClusterBtn,
      showGraphSubmenu,
      tagsSubmenu,
      deleteTagBtn,
      contextMenuDeleteSeparator,
      deleteFileBtn,
      contextMenuDeleteEndSeparator,
      exportSubmenu
    ];
    const graphContextMenuItems = [
      openAllBtn,
      centerGraphBtn,
      exportOriginalNodesBtn,
      removeLeafNodesBtn,
      magneticToggleBtn
    ];

    const setNodeContextItemsHidden = (hidden) => {
      nodeContextMenuItems.forEach((item) => item.classList.toggle("hidden", hidden));
    };

    const setGraphContextItemsHidden = (hidden) => {
      graphContextMenuItems.forEach((item) => item.classList.toggle("hidden", hidden));
    };

    const positionContextSubmenus = () => {
      contextMenu.querySelectorAll(".graph-context-menu-submenu").forEach((submenu) => {
        const panel = submenu.querySelector(".graph-context-menu-submenu-panel");
        if (!panel) return;
        submenu.classList.remove("open-left", "open-up");
        const previousDisplay = panel.style.display;
        const previousVisibility = panel.style.visibility;
        panel.style.display = "inline-flex";
        panel.style.visibility = "hidden";
        const wrapperRect = graphRenderWrapper.getBoundingClientRect();
        const submenuRect = submenu.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        if (submenuRect.right + panelRect.width + 4 > wrapperRect.right) submenu.classList.add("open-left");
        if (submenuRect.top + panelRect.height > wrapperRect.bottom - 8) submenu.classList.add("open-up");
        panel.style.display = previousDisplay;
        panel.style.visibility = previousVisibility;
      });
    };

    const positionContextMenu = (event) => {
      const bounds = graphViewCanvas.getBoundingClientRect();
      const menuWidth = contextMenu.offsetWidth || 230;
      const menuHeight = contextMenu.offsetHeight || 280;
      const left = Math.max(8, Math.min(event.clientX - bounds.left, Math.max(8, bounds.width - menuWidth - 8)));
      const top = Math.max(8, Math.min(event.clientY - bounds.top, Math.max(8, bounds.height - menuHeight - 8)));
      contextMenu.style.left = `${left}px`;
      contextMenu.style.top = `${top}px`;
      positionContextSubmenus();
    };

    const hideContextMenu = () => {
      closeLocalGraphTagPicker();
      contextMenu.classList.add("hidden");
      contextTargetNode = null;
      contextMenuTitle.classList.add("hidden");
      contextMenuTitle.textContent = "";
      contextMenuTitleSeparator.classList.add("hidden");
      contextMenuActionSeparator.classList.add("hidden");
      setNodeContextItemsHidden(true);
      setGraphContextItemsHidden(false);
    };

    graphRenderWrapper.addEventListener("contextmenu", (event) => {
      logGraphInteractionPerf("background-context-menu");
      event.preventDefault();
      contextTargetNode = null;
      contextMenuTitle.classList.add("hidden");
      contextMenuTitle.textContent = "";
      contextMenuTitleSeparator.classList.add("hidden");
      contextMenuActionSeparator.classList.add("hidden");
      setNodeContextItemsHidden(true);
      setGraphContextItemsHidden(false);
      contextMenu.classList.remove("hidden");
      positionContextMenu(event);
    });

    node.on("contextmenu", (event, d) => {
      logGraphInteractionPerf("node-context-menu", { nodeId: d?.id || "" });
      event.preventDefault();
      event.stopPropagation();
      contextTargetNode = d;
      contextMenuTitle.textContent = getGraphContextMenuTitle(d);
      contextMenuTitle.classList.remove("hidden");
      contextMenuTitleSeparator.classList.remove("hidden");
      contextMenuActionSeparator.classList.add("hidden");
      setNodeContextItemsHidden(false);
      setGraphContextItemsHidden(true);
      const isTag = isTagNode(d);
      const isCluster = isClusterNode(d);
      const isFileNode = !isTag && !isCluster;
      const keepSavedMode = isKeepSavedGraphMode(activeTab);
      [openFileBtn, openDefaultAppBtn, revealFileBtn, revealTreeViewBtn, copySubmenu, exportSubmenu].forEach((item) => item.classList.toggle("hidden", !isFileNode));
      showGraphSubmenu.classList.toggle("hidden", !(isFileNode || isCluster));
      [localGraphBtn, fullLocalGraphBtn, fullNetworkBtn].forEach((item) => item.classList.toggle("hidden", !isFileNode));
      expandedClusterGraphBtn.classList.toggle("hidden", !isCluster);
      [renameFileBtn, deleteFileBtn].forEach((item) => item.classList.toggle("hidden", !isFileNode || keepSavedMode));
      tagsSubmenu.classList.toggle("hidden", !isFileNode || keepSavedMode);
      collapseToClusterBtn.classList.toggle("hidden", !isFileNode || getCollapsibleClusterMemberIds(d.id).length < 3);
      collapseFullOutgoingToClusterBtn.classList.toggle("hidden", !isFileNode || getCollapsibleClusterMemberIds(d.id, "full-outgoing").length < 3);
      collapseDetectedCommunityBtn.classList.toggle("hidden", !isFileNode || getCollapsibleClusterMemberIds(d.id, "community").length < 3);
      expandClusterBtn.classList.toggle("hidden", !isCluster);
      if (isFileNode) {
        const snapshotFile = getSnapshotFileForNode(d);
        const currentTags = normalizeFileTagList(d.tags?.length ? d.tags : snapshotFile?.tags || []);
        renderTagsContextSubmenu(tagsSubmenuPanel, currentTags, async (tag, shouldAdd) => {
          if (!contextTargetNode || contextTargetNode.type === "tag") return;
          const targetNode = contextTargetNode;
          hideContextMenu();
          try {
            await updateGraphNodeTagContent(targetNode, tag, shouldAdd ? "add" : "remove");
          } catch (error) {
            console.error("Failed to update graph file tags:", error);
            alert("Unable to update this file's tags.");
          }
        }, {
          onTagLocalGraph: () => {
            if (!contextTargetNode || isTagNode(contextTargetNode) || isClusterNode(contextTargetNode)) return;
            const targetNode = contextTargetNode;
            hideContextMenu();
            showLocalGraphTagPicker(targetNode);
          },
          onTagFullLocalGraph: () => {
            if (!contextTargetNode || isTagNode(contextTargetNode) || isClusterNode(contextTargetNode)) return;
            const targetNode = contextTargetNode;
            hideContextMenu();
            showLocalGraphTagPicker(targetNode, {
              mode: "full-local",
              title: "Tag full Local Graph"
            });
          },
          onTagFullNetwork: () => {
            if (!contextTargetNode || isTagNode(contextTargetNode) || isClusterNode(contextTargetNode)) return;
            const targetNode = contextTargetNode;
            hideContextMenu();
            showLocalGraphTagPicker(targetNode, {
              mode: "full-network",
              title: "Tag full Network"
            });
          },
          onCreateTag: async (tag) => {
            if (!contextTargetNode || isTagNode(contextTargetNode) || isClusterNode(contextTargetNode)) return;
            const targetNode = contextTargetNode;
            hideContextMenu();
            try {
              await updateGraphNodeTagContent(targetNode, tag, "add");
            } catch (error) {
              console.error("Failed to update graph file tags:", error);
              alert("Unable to update this file's tags.");
            }
          }
        });
      }
      deleteTagBtn.classList.toggle("hidden", !isTag);
      contextMenuDeleteSeparator.classList.toggle("hidden", !isFileNode);
      contextMenuDeleteEndSeparator.classList.toggle("hidden", !isFileNode);
      contextMenu.classList.remove("hidden");
      positionContextMenu(event);
    });

    graphRenderWrapper.addEventListener("click", hideContextMenu);
    window.addEventListener("blur", hideContextMenu);

    magneticToggleBtn.addEventListener("click", () => {
      graphSettings.magneticEnabled = !graphSettings.magneticEnabled;
      saveGlobalState({ graphMagneticEnabled: graphSettings.magneticEnabled });
      applyMagneticSetting();
      captureGraphLayout(activeTab, nodes, currentZoomTransform);
      markGraphTabAsChanged(activeTab);
      hideContextMenu();
    });

    openAllBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      hideContextMenu();
      await openAllVisibleGraphFiles();
    });

    centerGraphBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      hideContextMenu();
      centerGraphView();
    });

    exportOriginalNodesBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      hideContextMenu();
      await exportOriginalGraphNodes();
    });

    removeLeafNodesBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      hideLeafGraphPoints();
    });

    collapseToClusterBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      collapseGraphNodeToCluster(contextTargetNode);
    });

    collapseFullOutgoingToClusterBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      collapseGraphNodeToCluster(contextTargetNode, "full-outgoing");
    });

    collapseDetectedCommunityBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      collapseGraphNodeToCluster(contextTargetNode, "community");
    });

    expandClusterBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      expandGraphCluster(contextTargetNode);
    });

    openFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      await openGraphNodeFileInPermanentTab(targetNode);
    });

    openDefaultAppBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const filePath = getNodeFilesystemPath(contextTargetNode);
      hideContextMenu();
      if (!filePath || !isNeutralinoRuntime() || !Neutralino.os?.open) {
        alert("Opening with the default app is available only in the desktop app for files opened from disk.");
        return;
      }
      try {
        await Neutralino.os.open(filePath);
      } catch (error) {
        console.error("Failed to open file with default app:", error);
        alert("Unable to open this file with the default app.");
      }
    });

    revealFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const filePath = getNodeFilesystemPath(contextTargetNode);
      hideContextMenu();
      if (!filePath || !isNeutralinoRuntime()) {
        alert("Revealing files is available only in the desktop app for files opened from disk.");
        return;
      }
      try {
        if (typeof NL_OS !== "undefined" && NL_OS === "Windows" && Neutralino.os?.execCommand) {
          const windowsPath = filePath.replace(/"/g, "").replace(/\//g, "\\");
          await Neutralino.os.execCommand(`explorer.exe /select,"${windowsPath}"`);
        } else if (Neutralino.os?.open) {
          const normalized = filePath.replace(/\\/g, "/");
          const folderPath = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : normalized;
          await Neutralino.os.open(folderPath);
        } else {
          throw new Error("No supported reveal command is available.");
        }
      } catch (error) {
        console.error("Failed to reveal file:", error);
        alert("Unable to reveal this file in the file explorer.");
      }
    });

    revealTreeViewBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      if (!revealGraphNodeInTreeView(targetNode)) {
        alert("Unable to find this file in the tree view.");
      }
    });

    renameFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      const snapshotFile = getSnapshotFileForNode(targetNode);
      const folderEntry = getFolderMarkdownEntryForNode(targetNode);
      const filePath = getNodeFilesystemPath(targetNode);
      hideContextMenu();
      try {
        await renameSidebarNodeOnDisk({
          kind: "file",
          name: getFileName(snapshotFile?.path || snapshotFile?.fullPath || targetNode.fullPath || targetNode.label || targetNode.id),
          file: folderEntry?.file || snapshotFile?.file || null,
          handle: folderEntry?.handle || snapshotFile?.handle || null,
          fullPath: filePath || snapshotFile?.fullPath || null,
          path: snapshotFile?.path || folderEntry?.path || targetNode.fullPath || null
        }, "file");
      } catch (error) {
        console.error("Failed to rename graph file:", error);
        alert("Unable to rename this file.");
      }
    });

    copyPathBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      try {
        await copyGraphText(getNodeClipboardPath(targetNode));
      } catch (error) {
        console.error("Failed to copy path:", error);
        alert("Unable to copy this file path.");
      }
    });

    copyContentBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      try {
        await copyGraphText(await readGraphNodeContent(targetNode));
      } catch (error) {
        console.error("Failed to copy content:", error);
        alert("Unable to copy this file content.");
      }
    });

    copyFrontmatterBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      try {
        await copyGraphText(getMarkdownFrontmatterText(await readGraphNodeContent(targetNode)));
      } catch (error) {
        console.error("Failed to copy frontmatter:", error);
        alert("Unable to copy this file's frontmatter.");
      }
    });

    copyTagsBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      try {
        await copyGraphText(getNodeClipboardTags(targetNode));
      } catch (error) {
        console.error("Failed to copy tags:", error);
        alert("Unable to copy this file's tags.");
      }
    });

    sharePointBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      try {
        copyShareUrlFromText(await readGraphNodeContent(targetNode), sharePointBtn);
      } catch (error) {
        console.error("Failed to share point:", error);
        alert("Unable to share this point.");
      }
    });

    exportMarkdownBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      try {
        exportMarkdownContent(await readGraphNodeContent(targetNode), getNodeFileName(targetNode.id));
      } catch (error) {
        console.error("Failed to export point as Markdown:", error);
        alert("Unable to export this point as Markdown.");
      }
    });

    exportHtmlBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      try {
        exportHtmlContent(await readGraphNodeContent(targetNode));
      } catch (error) {
        console.error("Failed to export point as HTML:", error);
        alert("Unable to export this point as HTML.");
      }
    });

    exportPdfBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      try {
        exportPdfContent(await readGraphNodeContent(targetNode));
      } catch (error) {
        console.error("Failed to export point as PDF:", error);
        alert("Unable to export this point as PDF.");
      }
    });

    exportOriginalNodeBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      await exportOriginalGraphNode(targetNode);
    });

    copyDependenciesBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const nodeId = contextTargetNode.id;
      hideContextMenu();
      const copyOptions = await showGraphCopyOptionsDialog();
      if (!copyOptions) return;
      await copyNodeFilePathList(getDirectOutgoingDependencyIds(nodeId), copyOptions);
    });

    copyFullDependenciesBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const nodeId = contextTargetNode.id;
      hideContextMenu();
      const copyOptions = await showGraphCopyOptionsDialog();
      if (!copyOptions) return;
      await copyNodeFilePathList([nodeId, ...getFullOutgoingDependencyIds(nodeId)], copyOptions);
    });

    copyBacklinksBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const nodeId = contextTargetNode.id;
      hideContextMenu();
      const copyOptions = await showGraphCopyOptionsDialog();
      if (!copyOptions) return;
      await copyNodeFilePathList(getBacklinkIds(nodeId), copyOptions);
    });

    copyFullNetworkBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const nodeId = contextTargetNode.id;
      hideContextMenu();
      const copyOptions = await showGraphCopyOptionsDialog();
      if (!copyOptions) return;
      await copyNodeFilePathList(getFullNetworkIds(nodeId), copyOptions);
    });

    hidePointBtn.addEventListener("click", () => {
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      hideGraphPoint(targetNode);
    });

    addTagBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode || contextTargetNode.type === "tag") return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      const tag = window.prompt("Tag to add:");
      const normalizedTag = normalizeTagName(tag);
      if (!normalizedTag) return;
      try {
        if (getFileTagsFromContent(await readGraphNodeContent(targetNode)).includes(normalizedTag)) return;
        await updateGraphNodeTagContent(targetNode, normalizedTag, "add");
      } catch (error) {
        console.error("Failed to add tag:", error);
        alert("Unable to add this tag.");
      }
    });

    removeTagBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode || contextTargetNode.type === "tag") return;
      const targetNode = contextTargetNode;
      hideContextMenu();
      try {
        const currentTags = getFileTagsFromContent(await readGraphNodeContent(targetNode));
        if (!currentTags.length) {
          alert("This file does not have any YAML frontmatter tags to remove.");
          return;
        }
        const tag = window.prompt(`Tag to remove:\n${currentTags.join(", ")}`);
        const normalizedTag = normalizeTagName(tag);
        if (!normalizedTag) return;
        if (!currentTags.includes(normalizedTag)) {
          alert("This file does not have that YAML frontmatter tag.");
          return;
        }
        await updateGraphNodeTagContent(targetNode, normalizedTag, "remove");
      } catch (error) {
        console.error("Failed to remove tag:", error);
        alert("Unable to remove this tag.");
      }
    });

    deleteTagBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode || contextTargetNode.type !== "tag") return;
      const tag = contextTargetNode.tag || String(contextTargetNode.id || "").replace(/^tag:/, "");
      hideContextMenu();
      try {
        await deleteTag(tag);
      } catch (error) {
        console.error("Failed to delete tag:", error);
        alert("Unable to delete this tag.");
      }
    });

    deleteFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const targetNode = contextTargetNode;
      const nodeId = targetNode.id;
      const filePath = getNodeFilesystemPath(targetNode);
      hideContextMenu();
      if (!filePath || !isNeutralinoRuntime() || !Neutralino.filesystem?.remove) {
        alert("Deleting files is available only in the desktop app for files opened from disk.");
        return;
      }
      const confirmed = typeof shouldConfirmDeleteFiles === "function" && !shouldConfirmDeleteFiles()
        ? true
        : window.confirm(`Delete "${getNodeFileName(nodeId)}" from disk? This action cannot be undone.`);
      if (!confirmed) return;
      try {
        const snapshotFile = getSnapshotFileForNode(targetNode);
        await Neutralino.filesystem.remove(filePath);
        closeTabsForDeletedPath(filePath, { kind: "file", targetHandle: snapshotFile?.handle || null });
        simulation.stop();
        removeGraphPointFromSnapshot(nodeId);
        await refreshOpenFolderTreeAfterFileDelete(filePath);
        graphRenderWrapper.remove();
        renderGraphView();
      } catch (error) {
        console.error("Failed to delete file:", error);
        alert("Unable to delete this file.");
      }
    });

    const openLocalGraphTab = (mode, titlePrefix) => {
      if (!contextTargetNode) return;
      const focusNodeId = contextTargetNode.id;
      if (tabs.length >= 20) {
        alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
        return;
      }
      const activeGraphTab = tabs.find((tab) => tab.id === activeTabId);
      const parentConfig = activeGraphTab?.graphViewConfig || {};
      const localTabTitle = `${titlePrefix}: ${contextTargetNode.label}`;
      const localGraphTab = createGraphTab(localTabTitle, {
        graphSnapshot: activeGraphTab?.graphSnapshot || null,
        graphViewConfig: {
          mode,
          focusNodeId,
          hiddenNodeIds: [...(parentConfig.hiddenNodeIds || [])]
        },
        graphLayout: getGraphLayoutWithoutZoom(activeGraphTab?.graphLayout)
      });
      if (!localGraphTab) return;
      tabs.push(localGraphTab);
      saveTabsToStorage(tabs);
      hideContextMenu();
      switchTab(localGraphTab.id);
    };

    const openExpandedClusterGraphTab = () => {
      if (!contextTargetNode || !isClusterNode(contextTargetNode)) return;
      const memberNodeIds = Array.from(new Set(contextTargetNode.memberNodeIds || [])).filter(Boolean);
      if (!memberNodeIds.length) {
        alert("This cluster does not have any points to show.");
        return;
      }
      if (tabs.length >= 20) {
        alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
        return;
      }
      const activeGraphTab = tabs.find((tab) => tab.id === activeTabId);
      const parentConfig = normalizeGraphViewConfig(activeGraphTab?.graphViewConfig);
      const clusterId = contextTargetNode.clusterId || contextTargetNode.id;
      const hiddenNodeIds = (parentConfig.hiddenNodeIds || []).filter((nodeId) => !memberNodeIds.includes(nodeId));
      const collapsedClusters = (parentConfig.collapsedClusters || []).filter((cluster) => getClusterNodeId(cluster) !== clusterId);
      const clusterGraphTab = createGraphTab(`Expanded Cluster: ${contextTargetNode.label}`, {
        graphSnapshot: activeGraphTab?.graphSnapshot || null,
        graphViewConfig: {
          ...parentConfig,
          mode: "cluster",
          clusterNodeIds: memberNodeIds,
          hiddenNodeIds,
          collapsedClusters
        },
        graphLayout: getGraphLayoutWithoutZoom(activeGraphTab?.graphLayout)
      });
      if (!clusterGraphTab) return;
      tabs.push(clusterGraphTab);
      saveTabsToStorage(tabs);
      hideContextMenu();
      switchTab(clusterGraphTab.id);
    };

    localGraphBtn.addEventListener("click", () => {
      openLocalGraphTab("local", "Local Graph");
    });

    fullLocalGraphBtn.addEventListener("click", () => {
      openLocalGraphTab("full-local", "Full Local Graph");
    });

    fullNetworkBtn.addEventListener("click", () => {
      openLocalGraphTab("full-network", "Full Network");
    });

    expandedClusterGraphBtn.addEventListener("click", () => {
      openExpandedClusterGraphTab();
    });

    let hoveredGraphNode = null;
    let hoveredGraphModifiers = { shiftKey: false, ctrlKey: false, altKey: false };
    let hoverLabelNodeIds = new Set();
    let highlightedLineLinkData = new Set();
    let pendingHoverHighlightTimer = null;
    const largeGraphHoverDelayMs = 1000;
    const shouldDelayHoverHighlight = nodes.length >= getLargeGraphAutoClusterMinNodeCount();
    const largeMapHoverPreferences = shouldDelayHoverHighlight && typeof getLargeMapHoverPreferences === "function"
      ? getLargeMapHoverPreferences()
      : {
        dimOtherNodes: true,
        showConnectedLabels: true,
        highlightConnectedLines: true
      };
    const shouldDimOtherNodesOnHover = !shouldDelayHoverHighlight || largeMapHoverPreferences.dimOtherNodes === true;
    const shouldShowConnectedLabelsOnHover = !shouldDelayHoverHighlight || largeMapHoverPreferences.showConnectedLabels !== false;
    const shouldHighlightConnectedLinesOnHover = !shouldDelayHoverHighlight || largeMapHoverPreferences.highlightConnectedLines !== false;
    const shouldDimOtherLinesOnHover = !shouldDelayHoverHighlight;

    const getGraphLinkSourceId = (linkData) => linkData?.source?.id || linkData?.source;
    const getGraphLinkTargetId = (linkData) => linkData?.target?.id || linkData?.target;

    const shouldIncludeLinkInHoverHighlight = (linkData, includeTagRelationships = false) => (
      includeTagRelationships || isMarkdownLink(linkData)
    );

    const isDirectHoverLink = (linkData, focusNodeId, includeTagRelationships = false) => {
      if (!shouldIncludeLinkInHoverHighlight(linkData, includeTagRelationships)) return false;
      if (getGraphLinkSourceId(linkData) === focusNodeId) return true;
      return includeTagRelationships && isTagLink(linkData) && getGraphLinkTargetId(linkData) === focusNodeId;
    };

    const getDirectHoverLinks = (focusNodeId, includeTagRelationships = false) => {
      const directLinks = outgoingMarkdownHoverLinks.get(focusNodeId) || [];
      if (!includeTagRelationships) return directLinks;
      return directLinks.concat(relatedTagHoverLinks.get(focusNodeId) || []);
    };

    const clearLargeMapHighlightedLineClasses = () => {
      highlightedLineLinkData.forEach((linkData) => {
        const linkElement = linkElementByData.get(linkData);
        if (linkElement) {
          linkElement.classList.remove("highlighted-direct", "highlighted-backlink");
        }
        const arrowheadElement = arrowheadElementByData.get(linkData);
        if (arrowheadElement) {
          arrowheadElement.classList.remove("highlighted-direct", "highlighted-backlink");
        }
      });
      highlightedLineLinkData = new Set();
    };

    const applyLargeMapHighlightedLineClasses = (highlightedLinks, isBacklinkHighlight) => {
      clearLargeMapHighlightedLineClasses();
      highlightedLineLinkData = new Set(highlightedLinks);
      const addClass = isBacklinkHighlight ? "highlighted-backlink" : "highlighted-direct";
      highlightedLineLinkData.forEach((linkData) => {
        const linkElement = linkElementByData.get(linkData);
        if (linkElement) {
          linkElement.classList.add(addClass);
          linkElement.parentNode?.appendChild(linkElement);
        }
        const arrowheadElement = arrowheadElementByData.get(linkData);
        if (arrowheadElement) {
          arrowheadElement.classList.add(addClass);
          arrowheadElement.parentNode?.appendChild(arrowheadElement);
        }
      });
    };

    const raiseHoverLabels = (highlightedNodeIds) => {
      highlightedNodeIds.forEach((nodeId) => {
        const labelElement = labelElementByNodeId.get(nodeId);
        if (labelElement) labelElement.parentNode?.appendChild(labelElement);
      });
    };

    const getRecursiveOutgoingHighlight = (focusNodeId, includeTagRelationships = false) => {
      const highlightedNodes = new Set([focusNodeId]);
      const highlightedLinks = new Set();
      const visitedNodeIds = new Set([focusNodeId]);
      const nodesToVisit = [focusNodeId];

      while (nodesToVisit.length) {
        const currentNodeId = nodesToVisit.shift();
        links.forEach((linkData) => {
          if (!shouldIncludeLinkInHoverHighlight(linkData, includeTagRelationships)) return;
          if (getGraphLinkSourceId(linkData) !== currentNodeId) return;
          highlightedLinks.add(linkData);
          const targetNodeId = getGraphLinkTargetId(linkData);
          if (!targetNodeId) return;
          highlightedNodes.add(targetNodeId);
          if (!visitedNodeIds.has(targetNodeId)) {
            visitedNodeIds.add(targetNodeId);
            nodesToVisit.push(targetNodeId);
          }
        });
      }

      return { highlightedNodes, highlightedLinks };
    };

    const getBacklinkHighlight = (focusNodeId, includeTagRelationships = false) => {
      const highlightedNodes = new Set([focusNodeId]);
      const highlightedLinks = new Set();

      links.forEach((linkData) => {
        if (!shouldIncludeLinkInHoverHighlight(linkData, includeTagRelationships)) return;
        if (getGraphLinkTargetId(linkData) !== focusNodeId) return;
        highlightedLinks.add(linkData);
        const sourceNodeId = getGraphLinkSourceId(linkData);
        if (sourceNodeId) highlightedNodes.add(sourceNodeId);
      });

      return { highlightedNodes, highlightedLinks };
    };

    const getRecursiveBacklinkHighlight = (focusNodeId, includeTagRelationships = false) => {
      const highlightedNodes = new Set([focusNodeId]);
      const highlightedLinks = new Set();
      const visitedNodeIds = new Set([focusNodeId]);
      const nodesToVisit = [focusNodeId];

      while (nodesToVisit.length) {
        const currentNodeId = nodesToVisit.shift();
        links.forEach((linkData) => {
          if (!shouldIncludeLinkInHoverHighlight(linkData, includeTagRelationships)) return;
          if (getGraphLinkTargetId(linkData) !== currentNodeId) return;
          highlightedLinks.add(linkData);
          const sourceNodeId = getGraphLinkSourceId(linkData);
          if (!sourceNodeId) return;
          highlightedNodes.add(sourceNodeId);
          if (!visitedNodeIds.has(sourceNodeId)) {
            visitedNodeIds.add(sourceNodeId);
            nodesToVisit.push(sourceNodeId);
          }
        });
      }

      return { highlightedNodes, highlightedLinks };
    };

    const setSelectedGraphNodeCount = (selectedNodeCount) => {
      const safeSelectedNodeCount = Math.max(0, Number(selectedNodeCount) || 0);
      activeTab.selectedGraphNodeCount = safeSelectedNodeCount;
      updateStatusLine({
        visiblePointCount: activeTab.visiblePointCount || nodes.length,
        graphEdgeCount: activeTab.graphEdgeCount || graphEdgeCount,
        graphZoomScale: activeTab.graphZoomScale,
        selectedGraphNodeCount: safeSelectedNodeCount
      });
      const selectedCountElement = document.getElementById("graph-selected-nodes-count");
      const selectedStatusElement = document.getElementById("graph-selected-nodes-status");
      if (selectedCountElement) selectedCountElement.textContent = safeSelectedNodeCount.toLocaleString();
      if (selectedStatusElement) selectedStatusElement.classList.remove("hidden");
    };

    function highlightNeighborhood(focusNode, modifiers = hoveredGraphModifiers) {
      if (!focusNode) return;
      const focusNodeId = focusNode.id;
      const isBacklinkHighlight = Boolean(modifiers.ctrlKey);
      // Alt includes tag relationships for file nodes; tag nodes always show their direct file connections.
      const includeTagRelationships = Boolean(modifiers.altKey || isTagNode(focusNode));
      const needsHighlightedLinks = shouldHighlightConnectedLinesOnHover || includeTagRelationships;
      const highlight = isBacklinkHighlight
        ? (modifiers.shiftKey
          ? getRecursiveBacklinkHighlight(focusNodeId, includeTagRelationships)
          : getBacklinkHighlight(focusNodeId, includeTagRelationships))
        : (modifiers.shiftKey
          ? getRecursiveOutgoingHighlight(focusNodeId, includeTagRelationships)
          : {
            highlightedNodes: outgoingAdjacency.get(focusNodeId) || new Set([focusNodeId]),
            highlightedLinks: needsHighlightedLinks
              ? new Set(getDirectHoverLinks(focusNodeId, includeTagRelationships))
              : new Set()
          });
      if (includeTagRelationships) {
        highlight.highlightedLinks.forEach((linkData) => {
          const sourceNodeId = getGraphLinkSourceId(linkData);
          const targetNodeId = getGraphLinkTargetId(linkData);
          if (sourceNodeId) highlight.highlightedNodes.add(sourceNodeId);
          if (targetNodeId) highlight.highlightedNodes.add(targetNodeId);
        });
      }
      const isHighlightedLink = (l) => highlight.highlightedLinks.has(l);
      hoverLabelNodeIds = shouldShowConnectedLabelsOnHover ? highlight.highlightedNodes : new Set();
      const selectedNodeCount = nodes.reduce((count, graphNode) => count + (highlight.highlightedNodes.has(graphNode.id) ? 1 : 0), 0);
      setSelectedGraphNodeCount(selectedNodeCount);

      if (shouldDimOtherNodesOnHover) {
        node.classed("dimmed", (n) => !highlight.highlightedNodes.has(n.id));
      }
      if (shouldShowConnectedLabelsOnHover) {
        label
          .classed("dimmed", (n) => !highlight.highlightedNodes.has(n.id))
          .classed("hover-hidden", (n) => !highlight.highlightedNodes.has(n.id));
        updateLabelVisibility();
        raiseHoverLabels(highlight.highlightedNodes);
      }
      if (shouldHighlightConnectedLinesOnHover) {
        if (shouldDimOtherLinesOnHover) {
          link
            .classed("dimmed", (l) => !isHighlightedLink(l))
            .classed("highlighted-direct", (l) => !isBacklinkHighlight && isHighlightedLink(l))
            .classed("highlighted-backlink", (l) => isBacklinkHighlight && isHighlightedLink(l));
          arrowhead
            .classed("dimmed", (l) => !isHighlightedLink(l))
            .classed("highlighted-direct", (l) => !isBacklinkHighlight && isHighlightedLink(l))
            .classed("highlighted-backlink", (l) => isBacklinkHighlight && isHighlightedLink(l));
          link.filter((l) => isHighlightedLink(l)).raise();
          arrowhead.filter((l) => isHighlightedLink(l)).raise();
        } else {
          applyLargeMapHighlightedLineClasses(highlight.highlightedLinks, isBacklinkHighlight);
        }
      }
    }

    function clearNeighborhoodHighlight() {
      if (pendingHoverHighlightTimer) {
        clearTimeout(pendingHoverHighlightTimer);
        pendingHoverHighlightTimer = null;
      }
      hoverLabelNodeIds = new Set();
      setSelectedGraphNodeCount(0);
      if (shouldDimOtherNodesOnHover) {
        node.classed("dimmed", false);
      }
      if (shouldShowConnectedLabelsOnHover) {
        label.classed("dimmed", false).classed("hover-hidden", false);
        updateLabelVisibility();
      }
      if (shouldHighlightConnectedLinesOnHover) {
        if (shouldDimOtherLinesOnHover) {
          link.classed("dimmed", false).classed("highlighted-direct", false).classed("highlighted-backlink", false);
          arrowhead.classed("dimmed", false).classed("highlighted-direct", false).classed("highlighted-backlink", false);
        } else {
          clearLargeMapHighlightedLineClasses();
        }
      }
    }

    const updateHoveredGraphHighlight = (event) => {
      hoveredGraphModifiers = {
        shiftKey: Boolean(event?.shiftKey),
        ctrlKey: Boolean(event?.ctrlKey),
        altKey: Boolean(event?.altKey)
      };
      if (pendingHoverHighlightTimer) {
        clearTimeout(pendingHoverHighlightTimer);
        pendingHoverHighlightTimer = null;
      }
      if (shouldDelayHoverHighlight && !hoverLabelNodeIds.size) {
        scheduleHoveredGraphHighlight(event);
        return;
      }
      if (hoveredGraphNode) highlightNeighborhood(hoveredGraphNode, hoveredGraphModifiers);
    };

    const scheduleHoveredGraphHighlight = (event) => {
      hoveredGraphModifiers = {
        shiftKey: Boolean(event?.shiftKey),
        ctrlKey: Boolean(event?.ctrlKey),
        altKey: Boolean(event?.altKey)
      };
      if (!hoveredGraphNode) return;
      if (pendingHoverHighlightTimer) clearTimeout(pendingHoverHighlightTimer);
      if (!shouldDelayHoverHighlight) {
        highlightNeighborhood(hoveredGraphNode, hoveredGraphModifiers);
        return;
      }
      const scheduledNode = hoveredGraphNode;
      const scheduledModifiers = { ...hoveredGraphModifiers };
      pendingHoverHighlightTimer = setTimeout(() => {
        pendingHoverHighlightTimer = null;
        if (hoveredGraphNode !== scheduledNode) return;
        highlightNeighborhood(scheduledNode, scheduledModifiers);
      }, largeGraphHoverDelayMs);
    };

    node
      .on("mouseenter", (event, d) => {
        logGraphInteractionPerf("hover", { nodeId: d?.id || "" });
        hoveredGraphNode = d;
        scheduleHoveredGraphHighlight(event);
      })
      .on("mouseleave", () => {
        hoveredGraphNode = null;
        clearNeighborhoodHighlight();
      });

    window.addEventListener("keydown", updateHoveredGraphHighlight);
    window.addEventListener("keyup", updateHoveredGraphHighlight);

    function updateLabelVisibility() {
      if (!label) return;
      if (hoverLabelNodeIds.size) {
        label.attr("opacity", (d) => hoverLabelNodeIds.has(d.id) ? 1 : 0);
        return;
      }
      if (graphViewConfig.showLabels === false) {
        label.attr("opacity", 0);
        return;
      }
      const threshold = graphViewConfig.textFadeThreshold;
      const zoomScale = currentZoomTransform?.k || 1;
      const fullyHiddenZoom = 0.25 + threshold * 0.57;
      const fadeDistance = 0.35;
      const smallNodePenalty = 0.25;
      label.attr("opacity", (d) => {
        const nodeImportance = maxNodeRadius > 0 ? Math.min(1, nodeRadius(d.id) / maxNodeRadius) : 1;
        const nodeFadeStart = fullyHiddenZoom + (1 - nodeImportance) * smallNodePenalty;
        if (zoomScale <= nodeFadeStart) return 0;
        if (zoomScale >= nodeFadeStart + fadeDistance) return 1;
        return Math.max(0, Math.min(1, (zoomScale - nodeFadeStart) / fadeDistance));
      });
    }

    updateLabelVisibility();

    function renderGraphTick() {
      link.each(function(d) {
        const endpoint = getLinkEndpoint(d);
        d.endpoint = endpoint;
        d3.select(this)
          .attr("x1", endpoint.x1)
          .attr("y1", endpoint.y1)
          .attr("x2", endpoint.x2)
          .attr("y2", endpoint.y2);
      });
      arrowhead.attr("d", (d) => {
        const endpoint = d.endpoint || getLinkEndpoint(d);
        const dx = endpoint.x2 - endpoint.x1;
        const dy = endpoint.y2 - endpoint.y1;
        const distance = Math.hypot(dx, dy) || 1;
        const ux = dx / distance;
        const uy = dy / distance;
        const baseX = endpoint.x2 - ux * arrowheadLength;
        const baseY = endpoint.y2 - uy * arrowheadLength;
        const px = -uy * arrowheadHalfHeight;
        const py = ux * arrowheadHalfHeight;
        return `M${baseX + px},${baseY + py}L${endpoint.x2},${endpoint.y2}L${baseX - px},${baseY - py}`;
      });
      node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
      label.attr("x", (d) => d.x + 10).attr("y", (d) => d.y + 4);
      captureGraphLayout(activeTab, nodes, currentZoomTransform);
      scheduleGraphLayoutStorageSave();
    }

    let graphFindNodeIds = new Set();

    function clearFind() {
      graphFindNodeIds = new Set();
      node.classed("graph-node-found", false);
      if (label) {
        label.classed("graph-label-found", false);
        updateLabelVisibility();
      }
    }

    function focusFoundNodes(matchingNodes) {
      const focusNodes = Array.isArray(matchingNodes)
        ? matchingNodes.filter((graphNode) => Number.isFinite(graphNode?.x) && Number.isFinite(graphNode?.y))
        : [];
      if (!focusNodes.length) return;

      const padding = Math.min(140, Math.max(72, Math.min(width, height) * 0.16));
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      focusNodes.forEach((graphNode) => {
        minX = Math.min(minX, graphNode.x);
        minY = Math.min(minY, graphNode.y);
        maxX = Math.max(maxX, graphNode.x);
        maxY = Math.max(maxY, graphNode.y);
      });

      let targetScale;
      let centerX;
      let centerY;
      if (focusNodes.length === 1 || Math.abs(maxX - minX) < 1 || Math.abs(maxY - minY) < 1) {
        centerX = focusNodes[0].x;
        centerY = focusNodes[0].y;
        targetScale = Math.max(1.45, Math.min(2.1, currentZoomTransform?.k || 1.6));
      } else {
        const boxWidth = Math.max(1, maxX - minX);
        const boxHeight = Math.max(1, maxY - minY);
        centerX = minX + boxWidth / 2;
        centerY = minY + boxHeight / 2;
        const fitScale = Math.min((width - padding * 2) / boxWidth, (height - padding * 2) / boxHeight);
        targetScale = Math.max(0.8, Math.min(2.2, fitScale));
      }

      const nextTransform = d3.zoomIdentity
        .translate(width / 2 - centerX * targetScale, height / 2 - centerY * targetScale)
        .scale(targetScale);
      applyGraphTransform(nextTransform);
    }

    function applyFind(searchTerm) {
      clearFind();
      const normalizedTerm = String(searchTerm || "").trim().toLowerCase();
      if (!normalizedTerm) return { count: 0, cleared: true };
      const matchingNodes = nodes.filter((graphNode) => String(getGraphNodeLabel(graphNode) || "").toLowerCase().includes(normalizedTerm));
      graphFindNodeIds = new Set(matchingNodes.map((graphNode) => graphNode.id));
      node.classed("graph-node-found", (graphNode) => graphFindNodeIds.has(graphNode.id));
      if (label) label.classed("graph-label-found", (graphNode) => graphFindNodeIds.has(graphNode.id));
      graphFindNodeIds.forEach((nodeId) => {
        const nodeElement = nodeElementByNodeId.get(nodeId);
        if (nodeElement) nodeElement.parentNode?.appendChild(nodeElement);
        const labelElement = labelElementByNodeId.get(nodeId);
        if (labelElement) labelElement.parentNode?.appendChild(labelElement);
      });
      updateLabelVisibility();
      if (matchingNodes.length) focusFoundNodes(matchingNodes);
      return { count: matchingNodes.length, cleared: false };
    }

    graphRenderWrapper.style.setProperty("--graph-node-default-color", typeof getGraphNodeDefaultColor === "function" ? getGraphNodeDefaultColor() : "var(--accent-color)");
    graphRenderWrapper.style.setProperty("--graph-find-highlight-color", typeof getGraphFindHighlightColor === "function" ? getGraphFindHighlightColor() : "#ffff00");

    simulation.on("tick", renderGraphTick);

    graphRenderCache.set(activeTab.id, {
      tabId: activeTab.id,
      renderer: graphRendererType,
      signature: graphSignature,
      wrapper: graphRenderWrapper,
      simulation,
      nodes,
      model: preparedGraphModel,
      visiblePointCount: nodes.length,
      graphEdgeCount,
      graphClusterCount,
      graphCollapsedNodeCount,
      zoomScale: currentZoomTransform.k,
      getZoomTransform: () => currentZoomTransform,
      applyFind,
      clearFind,
      focusFoundNodes,
      destroy: () => {
        clearFind();
        window.removeEventListener("keydown", updateHoveredGraphHighlight);
        window.removeEventListener("keyup", updateHoveredGraphHighlight);
        simulation.stop();
        graphRenderWrapper.remove();
      },
      suspend: () => {
        simulation.stop();
      },
      animate: () => {
        graphSettings.magneticEnabled = true;
        applyMagneticSetting();
      }
    });
    graphPerf?.mark("render cache stored", {
      nodes: nodes.length,
      links: graphEdgeCount,
      clusters: graphClusterCount,
      collapsed: graphCollapsedNodeCount
    });

    removeGraphLoadingState();
    applyMagneticSetting();
    graphInteractiveAt = typeof performance !== "undefined" ? performance.now() : 0;
    graphPerf?.end({
      reason: "render-complete",
      nodes: nodes.length,
      links: graphEdgeCount,
      clusters: graphClusterCount,
      collapsed: graphCollapsedNodeCount,
      staticLargeGraph: useStaticLargeGraphLayout
    });
  }

    }

    return { renderGraphView, openGraphFindDialog };
  };
})(window);
