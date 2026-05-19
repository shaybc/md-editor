(function(global) {
  global.registerMarkdownViewerGraphRenderer = function registerMarkdownViewerGraphRenderer(app, deps) {
    let renderGraphView;

    with (deps) {
    renderGraphView = async function renderGraphView(options = {}) {
    if (!graphViewCanvas) return;
    const renderRequestId = ++graphRenderRequestId;
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
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
      updateStatusLine({ visiblePointCount: 0, graphClusterCount: 0, graphCollapsedNodeCount: 0 });
      updateGraphTagToolbar(null, null);
      renderTagManagementList();
      return;
    }

    renderTagManagementList();
    let graphSnapshot = activeTab.graphComparisonSnapshot || activeTab.graphSnapshot || null;
    if (!options.skipToolbar) updateGraphTagToolbar(activeTab, graphSnapshot);
    if (!graphSnapshot && folderMarkdownFiles.length && !isKeepSavedGraphMode(activeTab)) {
      const snapshotFiles = folderMarkdownFiles.slice();
      await showGraphLoadingState("Building graph view...");
      if (renderRequestId !== graphRenderRequestId || activeTabId !== activeTab.id) {
        removeGraphLoadingState();
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
      if (renderRequestId !== graphRenderRequestId || activeTabId !== activeTab.id) {
        removeGraphLoadingState();
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
        if (entry?.simulation) entry.simulation.stop();
        if (entry?.wrapper) entry.wrapper.remove();
      });
      graphRenderCache.clear();
      activeTab.visiblePointCount = 0;
      activeTab.graphClusterCount = 0;
      activeTab.graphCollapsedNodeCount = 0;
      if (!options.skipToolbar) updateGraphTagToolbar(activeTab, graphSnapshot);
      updateStatusLine({ visiblePointCount: 0, graphClusterCount: 0, graphCollapsedNodeCount: 0 });
      graphViewCanvas.innerHTML = '<p class="folder-tree-placeholder">This graph tab does not have a saved graph snapshot.</p>';
      return;
    }

    let graphSignature = getGraphSnapshotSignature(graphSnapshot, graphViewConfig);
    const cachedRender = graphRenderCache.get(activeTab.id);
    if (cachedRender && cachedRender.signature === graphSignature && cachedRender.wrapper) {
      if (cachedRender.wrapper.parentElement !== graphViewCanvas) graphViewCanvas.appendChild(cachedRender.wrapper);
      cachedRender.wrapper.classList.remove("hidden");
      hideInactiveGraphRenders(activeTab.id);
      removeGraphLoadingState();
      activeTab.visiblePointCount = cachedRender.visiblePointCount || 0;
      activeTab.graphZoomScale = cachedRender.zoomScale || getGraphZoomScaleFromLayout(activeTab.graphLayout);
      activeTab.selectedGraphNodeCount = 0;
      activeTab.graphClusterCount = cachedRender.graphClusterCount || 0;
      activeTab.graphCollapsedNodeCount = cachedRender.graphCollapsedNodeCount || 0;
      updateStatusLine({
        visiblePointCount: activeTab.visiblePointCount,
        graphZoomScale: activeTab.graphZoomScale,
        selectedGraphNodeCount: 0,
        graphClusterCount: activeTab.graphClusterCount,
        graphCollapsedNodeCount: activeTab.graphCollapsedNodeCount
      });
      return;
    }

    if (cachedRender) {
      if (cachedRender.simulation) cachedRender.simulation.stop();
      if (cachedRender.wrapper) cachedRender.wrapper.remove();
      graphRenderCache.delete(activeTab.id);
    }

    if (renderRequestId !== graphRenderRequestId || activeTabId !== activeTab.id) return;
    await showGraphLoadingState("Laying out graph...");
    if (renderRequestId !== graphRenderRequestId || activeTabId !== activeTab.id) {
      removeGraphLoadingState();
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
      const stripped = source.replace(/\.[^/.]+$/, "");
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

    if (graphViewConfig && Array.isArray(graphViewConfig.allowedNodeIds) && graphViewConfig.allowedNodeIds.length) {
      const allowedNodeIds = new Set(graphViewConfig.allowedNodeIds);
      const allowedNodes = nodes.filter((n) => allowedNodeIds.has(n.id));
      const allowedLinks = links.filter((l) => allowedNodeIds.has(getLinkSourceId(l)) && allowedNodeIds.has(getLinkTargetId(l)));
      nodes.length = 0;
      nodes.push(...allowedNodes);
      links.length = 0;
      links.push(...allowedLinks);
    }

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

    if (graphViewConfig && graphViewConfig.showTags === false) {
      const fileNodes = nodes.filter((n) => !isTagNode(n));
      const nonTagLinks = links.filter((l) => !isTagLink(l));
      nodes.length = 0;
      nodes.push(...fileNodes);
      links.length = 0;
      links.push(...nonTagLinks);
    }

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

    if (graphViewConfig && Array.isArray(graphViewConfig.hiddenTagIds) && graphViewConfig.hiddenTagIds.length) {
      const hiddenTagIds = new Set(normalizeGraphTagNodeIds(graphViewConfig.hiddenTagIds));
      const visibleNodes = nodes.filter((n) => !hiddenTagIds.has(n.id));
      const visibleLinks = links.filter((l) => !hiddenTagIds.has(getLinkSourceId(l)) && !hiddenTagIds.has(getLinkTargetId(l)));
      nodes.length = 0;
      nodes.push(...visibleNodes);
      links.length = 0;
      links.push(...visibleLinks);
    }

    if (graphViewConfig && Array.isArray(graphViewConfig.hiddenNodeIds) && graphViewConfig.hiddenNodeIds.length) {
      const hiddenNodeIds = new Set(graphViewConfig.hiddenNodeIds);
      const visibleNodes = nodes.filter((n) => !hiddenNodeIds.has(n.id));
      const visibleLinks = links.filter((l) => !hiddenNodeIds.has(getLinkSourceId(l)) && !hiddenNodeIds.has(getLinkTargetId(l)));
      nodes.length = 0;
      nodes.push(...visibleNodes);
      links.length = 0;
      links.push(...visibleLinks);
    }

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
    graphSignature = getGraphSnapshotSignature(graphSnapshot, graphViewConfig);

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
      const rewrittenLinksByKey = new Map();
      links.forEach((linkData) => {
        const sourceId = getLinkSourceId(linkData);
        const targetId = getLinkTargetId(linkData);
        const rewrittenSource = memberToCluster.get(sourceId) || sourceId;
        const rewrittenTarget = memberToCluster.get(targetId) || targetId;
        if (!rewrittenSource || !rewrittenTarget || rewrittenSource === rewrittenTarget) return;
        const sourceVisible = visibleNodeIds.has(rewrittenSource) || clusterNodes.some((nodeData) => nodeData.id === rewrittenSource);
        const targetVisible = visibleNodeIds.has(rewrittenTarget) || clusterNodes.some((nodeData) => nodeData.id === rewrittenTarget);
        if (!sourceVisible || !targetVisible) return;
        const key = `${rewrittenSource}->${rewrittenTarget}:${getGraphLinkType(linkData)}:${getGraphItemStatus(linkData)}`;
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

    const clusterNodes = nodes.filter(isClusterNode);
    const graphClusterCount = clusterNodes.length;
    const graphCollapsedNodeCount = clusterNodes.reduce((total, nodeData) => total + Math.max(0, Number(nodeData.collapsedCount || nodeData.memberNodeIds?.length || 0)), 0);
    activeTab.visiblePointCount = nodes.length;
    activeTab.selectedGraphNodeCount = 0;
    activeTab.graphClusterCount = graphClusterCount;
    activeTab.graphCollapsedNodeCount = graphCollapsedNodeCount;
    updateStatusLine({
      visiblePointCount: nodes.length,
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

    const outgoingAdjacency = new Map();
    const outgoingDegree = new Map();
    nodes.forEach((n) => outgoingAdjacency.set(n.id, new Set([n.id])));
    nodes.forEach((n) => outgoingDegree.set(n.id, 0));
    links.filter(isMarkdownLink).forEach((l) => {
      outgoingAdjacency.get(l.source)?.add(l.target);
      outgoingDegree.set(l.source, (outgoingDegree.get(l.source) || 0) + 1);
    });
    links.filter(isTagLink).forEach((l) => {
      const sourceId = getLinkSourceId(l);
      const targetId = getLinkTargetId(l);
      if (sourceId && targetId) {
        outgoingAdjacency.get(sourceId)?.add(targetId);
        outgoingAdjacency.get(targetId)?.add(sourceId);
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
        updateStatusLine({ visiblePointCount: activeTab.visiblePointCount || nodes.length, graphZoomScale: currentZoomTransform.k });
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
    updateStatusLine({ visiblePointCount: activeTab.visiblePointCount || nodes.length, graphZoomScale: currentZoomTransform.k });

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
    [sharePointBtn, exportMarkdownBtn, exportHtmlBtn, exportPdfBtn].forEach((button) => exportSubmenuPanel.appendChild(button));
    exportSubmenu.appendChild(exportSubmenuBtn);
    exportSubmenu.appendChild(exportSubmenuPanel);

    contextMenu.appendChild(contextMenuTitle);
    contextMenu.appendChild(contextMenuTitleSeparator);
    contextMenu.appendChild(openAllBtn);
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
      const frontmatterMatch = String(markdown || "").match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      if (!frontmatterMatch) return "";
      const sourceFileMatch = frontmatterMatch[1].match(/^\s*source_file\s*:\s*(.+?)\s*$/im);
      if (!sourceFileMatch) return "";
      return sourceFileMatch[1].trim().replace(/^['"]|['"]$/g, "");
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

    const getLocalGraphTagNodeIds = (nodeId) => {
      if (!nodeId) return [];
      return Array.from(new Set([nodeId, ...getVisibleDirectOutgoingFileNodeIds(nodeId)]));
    };

    const getLocalGraphTagNodes = (graphNode) => {
      const tagNodeIds = new Set(getLocalGraphTagNodeIds(graphNode?.id));
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
        const nextHidden = shouldHide ? true : group.hidden === true;
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

      setGraphQuickActionBusy(true, "Detecting most referenced...");
      await new Promise((resolve) => requestAnimationFrame(resolve));
      try {
        const selectedNodes = getMostReferencedGraphNodes();
        if (!selectedNodes.length) {
          alert("No referenced files were found to tag.");
          return;
        }

        if (typeof createTag === "function") createTag(normalizedTag);

        setGraphQuickActionBusy(true, `Tagging ${selectedNodes.length} file${selectedNodes.length === 1 ? "" : "s"}...`);
        let changedFiles = false;
        let alreadyTaggedFiles = false;
        const failedNodes = [];
        for (const graphNode of selectedNodes) {
          try {
            alreadyTaggedFiles = hasSnapshotTagForNode(graphNode, normalizedTag) || alreadyTaggedFiles;
            changedFiles = await updateGraphNodeTagContent(graphNode, normalizedTag, "add", { deferGraphRefresh: true }) || changedFiles;
          } catch (error) {
            failedNodes.push(graphNode);
            console.error("Failed to tag most referenced graph file:", graphNode?.id, error);
          }
        }

        setGraphQuickActionBusy(true, "Creating hidden group...");
        const changedGroups = (changedFiles || alreadyTaggedFiles || failedNodes.length < selectedNodes.length)
          ? ensureGraphTagGroup(normalizedTag, { hidden: true })
          : false;
        if (!changedFiles && !changedGroups) {
          if (failedNodes.length) alert(`Unable to tag ${failedNodes.length} most referenced file${failedNodes.length === 1 ? "" : "s"}.`);
          return;
        }

        setGraphQuickActionBusy(true, "Refreshing graph...");
        const refreshedGraphTab = getActiveGraphTab();
        await refreshFolderTagCounts();
        renderFilteredFolderTree();
        renderTagManagementList();
        renderLinkAutocomplete();
        if (refreshedGraphTab) updateGraphTagToolbar(refreshedGraphTab, refreshedGraphTab.graphSnapshot || null);
        simulation.stop();
        graphRenderWrapper.remove();
        renderGraphView();

        if (failedNodes.length) {
          alert(`Tagged ${selectedNodes.length - failedNodes.length} most referenced file${selectedNodes.length - failedNodes.length === 1 ? "" : "s"}, but ${failedNodes.length} file${failedNodes.length === 1 ? "" : "s"} could not be updated.`);
        }
      } finally {
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

    const updateGraphNodeTagContent = async (graphNode, tag, action, options = {}) => {
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

      const currentContent = await readGraphNodeContent(graphNode);
      const currentTags = getFileTagsFromContent(currentContent);
      const normalizedTag = normalizeTagName(tag);
      if (action === "add" && currentTags.includes(normalizedTag)) return false;
      if (action === "remove" && !currentTags.includes(normalizedTag)) return false;

      const nextContent = action === "remove"
        ? removeTagFromContent(currentContent, normalizedTag)
        : addTagToContent(currentContent, normalizedTag);

      if (nextContent === currentContent) return false;

      await writeGraphNodeContent(graphNode, nextContent);

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

      const changedActiveGraph = await rebuildOpenGraphSnapshotsAfterTagChange(snapshotFile);
      if (!changedActiveGraph) markGraphTabAsChanged(activeGraphTab);
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
      if (options.deferGraphRefresh) return true;
      await refreshFolderTagCounts();
      renderFilteredFolderTree();
      renderTagManagementList();
      renderLinkAutocomplete();
      simulation.stop();
      graphRenderWrapper.remove();
      updateGraphTagToolbar(activeGraphTab, activeGraphTab.graphSnapshot || null);
      renderGraphView();
      return true;
    };

    let localGraphTagPicker = null;

    const closeLocalGraphTagPicker = () => {
      if (!localGraphTagPicker) return;
      localGraphTagPicker.remove();
      localGraphTagPicker = null;
    };

    const getLocalGraphNodeTags = (graphNode) => {
      const tagNodes = getLocalGraphTagNodes(graphNode);
      const tagsByNodeId = new Map(tagNodes.map((tagNode) => {
        const snapshotFile = getSnapshotFileForNode(tagNode);
        return [tagNode.id, normalizeFileTagList(tagNode.tags?.length ? tagNode.tags : snapshotFile?.tags || [])];
      }));
      const allTags = Array.from(new Set(Array.from(tagsByNodeId.values()).flat())).sort((a, b) => a.localeCompare(b));
      const appliedToAllTags = new Set(allTags.filter((tag) => tagNodes.every((tagNode) => (tagsByNodeId.get(tagNode.id) || []).includes(tag))));
      return { tagNodes, allTags, appliedToAllTags };
    };

    const updateLocalGraphTags = async (seedNode, tag, action) => {
      const normalizedTag = normalizeTagName(tag);
      if (!seedNode || !normalizedTag) return;
      const tagNodes = getLocalGraphTagNodes(seedNode);
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

    const tagLocalGraphNodes = (seedNode, tag) => updateLocalGraphTags(seedNode, tag, "add");

    const showLocalGraphTagPicker = (seedNode) => {
      closeLocalGraphTagPicker();
      const overlay = document.createElement("div");
      overlay.className = "graph-tag-picker-overlay";
      const panel = document.createElement("div");
      panel.className = "graph-tag-picker-panel";
      panel.addEventListener("click", (event) => event.stopPropagation());

      const title = document.createElement("div");
      title.className = "graph-tag-picker-title";
      title.textContent = "Tag Local Graph";
      panel.appendChild(title);

      const list = document.createElement("div");
      list.className = "graph-tag-picker-list";
      const localGraphTags = getLocalGraphNodeTags(seedNode);
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
            await updateLocalGraphTags(seedNode, tag, isApplied ? "remove" : "add");
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
          await tagLocalGraphNodes(seedNode, normalizedTag);
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
        graphLayout: activeGraphTab?.graphLayout || null
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
        graphLayout: activeGraphTab?.graphLayout || null
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
      const highlight = isBacklinkHighlight
        ? (modifiers.shiftKey
          ? getRecursiveBacklinkHighlight(focusNodeId, includeTagRelationships)
          : getBacklinkHighlight(focusNodeId, includeTagRelationships))
        : (modifiers.shiftKey
          ? getRecursiveOutgoingHighlight(focusNodeId, includeTagRelationships)
          : {
            highlightedNodes: outgoingAdjacency.get(focusNodeId) || new Set([focusNodeId]),
            highlightedLinks: new Set(links.filter((l) => isDirectHoverLink(l, focusNodeId, includeTagRelationships)))
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
      hoverLabelNodeIds = graphViewConfig.showLabels === false ? highlight.highlightedNodes : new Set();
      const selectedNodeCount = nodes.reduce((count, graphNode) => count + (highlight.highlightedNodes.has(graphNode.id) ? 1 : 0), 0);
      setSelectedGraphNodeCount(selectedNodeCount);

      node.classed("dimmed", (n) => !highlight.highlightedNodes.has(n.id));
      label.classed("dimmed", (n) => !highlight.highlightedNodes.has(n.id));
      updateLabelVisibility();
      link
        .classed("dimmed", (l) => !isHighlightedLink(l))
        .classed("highlighted-direct", (l) => !isBacklinkHighlight && isHighlightedLink(l))
        .classed("highlighted-backlink", (l) => isBacklinkHighlight && isHighlightedLink(l));
      arrowhead
        .classed("dimmed", (l) => !isHighlightedLink(l))
        .classed("highlighted-direct", (l) => !isBacklinkHighlight && isHighlightedLink(l))
        .classed("highlighted-backlink", (l) => isBacklinkHighlight && isHighlightedLink(l));
    }

    function clearNeighborhoodHighlight() {
      hoverLabelNodeIds = new Set();
      setSelectedGraphNodeCount(0);
      node.classed("dimmed", false);
      label.classed("dimmed", false);
      updateLabelVisibility();
      link.classed("dimmed", false).classed("highlighted-direct", false).classed("highlighted-backlink", false);
      arrowhead.classed("dimmed", false).classed("highlighted-direct", false).classed("highlighted-backlink", false);
    }

    const updateHoveredGraphHighlight = (event) => {
      hoveredGraphModifiers = {
        shiftKey: Boolean(event?.shiftKey),
        ctrlKey: Boolean(event?.ctrlKey),
        altKey: Boolean(event?.altKey)
      };
      if (hoveredGraphNode) highlightNeighborhood(hoveredGraphNode, hoveredGraphModifiers);
    };

    node
      .on("mouseenter", (event, d) => {
        hoveredGraphNode = d;
        updateHoveredGraphHighlight(event);
      })
      .on("mouseleave", () => {
        hoveredGraphNode = null;
        clearNeighborhoodHighlight();
      });

    window.addEventListener("keydown", updateHoveredGraphHighlight);
    window.addEventListener("keyup", updateHoveredGraphHighlight);

    function updateLabelVisibility() {
      if (!label) return;
      if (graphViewConfig.showLabels === false) {
        label.attr("opacity", (d) => hoverLabelNodeIds.has(d.id) ? 1 : 0);
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

    simulation.on("tick", renderGraphTick);

    graphRenderCache.set(activeTab.id, {
      signature: graphSignature,
      wrapper: graphRenderWrapper,
      simulation,
      nodes,
      visiblePointCount: nodes.length,
      graphClusterCount,
      graphCollapsedNodeCount,
      zoomScale: currentZoomTransform.k,
      getZoomTransform: () => currentZoomTransform,
      animate: () => {
        graphSettings.magneticEnabled = true;
        applyMagneticSetting();
      }
    });

    removeGraphLoadingState();
    applyMagneticSetting();
  }

    }

    return { renderGraphView };
  };
})(window);
