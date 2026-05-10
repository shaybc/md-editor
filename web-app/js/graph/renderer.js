(function(global) {
  global.registerMarkdownViewerGraphRenderer = function registerMarkdownViewerGraphRenderer(app, deps) {
    let renderGraphView;

    with (deps) {
    renderGraphView = async function renderGraphView(options = {}) {
    if (!graphViewCanvas) return;
    const renderRequestId = ++graphRenderRequestId;
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    const graphViewConfig = activeTab && activeTab.type === "graph" ? normalizeGraphViewConfig(activeTab.graphViewConfig) : normalizeGraphViewConfig(null);
    if (activeTab && activeTab.type === "graph") activeTab.graphViewConfig = graphViewConfig;
    hideInactiveGraphRenders(activeTab?.id);
    graphViewCanvas.querySelectorAll(".folder-tree-placeholder").forEach((node) => node.remove());
    if (!activeTab || activeTab.type !== "graph") {
      updateStatusLine({ visiblePointCount: 0 });
      updateGraphTagToolbar(null, null);
      renderTagManagementList();
      return;
    }

    renderTagManagementList();
    let graphSnapshot = activeTab.graphComparisonSnapshot || activeTab.graphSnapshot || null;
    if (!options.skipToolbar) updateGraphTagToolbar(activeTab, graphSnapshot);
    if (!graphSnapshot && folderMarkdownFiles.length && !isKeepSavedGraphMode(activeTab)) {
      const snapshotFiles = folderMarkdownFiles.slice();
      const loadingMessage = document.createElement("p");
      loadingMessage.className = "folder-tree-placeholder";
      loadingMessage.textContent = "Building graph view…";
      graphViewCanvas.appendChild(loadingMessage);
      graphSnapshot = await createGraphSnapshot(snapshotFiles, activeTab.folderName || activeTab.title);
      if (renderRequestId !== graphRenderRequestId || activeTabId !== activeTab.id) {
        loadingMessage.remove();
        return;
      }
      activeTab.graphSnapshot = graphSnapshot;
      delete activeTab.graphComparisonSnapshot;
      if (!options.skipToolbar) updateGraphTagToolbar(activeTab, graphSnapshot);
      saveTabsToStorage(tabs);
      graphViewCanvas.querySelectorAll(".folder-tree-placeholder").forEach((node) => node.remove());
    }

    if (!graphSnapshot || !graphSnapshot.nodes?.length) {
      graphRenderCache.forEach((entry) => {
        if (entry?.simulation) entry.simulation.stop();
        if (entry?.wrapper) entry.wrapper.remove();
      });
      graphRenderCache.clear();
      activeTab.visiblePointCount = 0;
      if (!options.skipToolbar) updateGraphTagToolbar(activeTab, graphSnapshot);
      updateStatusLine({ visiblePointCount: 0 });
      graphViewCanvas.innerHTML = '<p class="folder-tree-placeholder">This graph tab does not have a saved graph snapshot.</p>';
      return;
    }

    const graphSignature = getGraphSnapshotSignature(graphSnapshot, graphViewConfig);
    const cachedRender = graphRenderCache.get(activeTab.id);
    if (cachedRender && cachedRender.signature === graphSignature && cachedRender.wrapper) {
      if (cachedRender.wrapper.parentElement !== graphViewCanvas) graphViewCanvas.appendChild(cachedRender.wrapper);
      cachedRender.wrapper.classList.remove("hidden");
      hideInactiveGraphRenders(activeTab.id);
      activeTab.visiblePointCount = cachedRender.visiblePointCount || 0;
      activeTab.graphZoomScale = cachedRender.zoomScale || getGraphZoomScaleFromLayout(activeTab.graphLayout);
      updateStatusLine({ visiblePointCount: activeTab.visiblePointCount, graphZoomScale: activeTab.graphZoomScale });
      return;
    }

    if (cachedRender) {
      if (cachedRender.simulation) cachedRender.simulation.stop();
      if (cachedRender.wrapper) cachedRender.wrapper.remove();
      graphRenderCache.delete(activeTab.id);
    }

    if (renderRequestId !== graphRenderRequestId || activeTabId !== activeTab.id) return;
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
    const isTagLink = (linkData) => getGraphLinkType(linkData) === "tag";
    const isMarkdownLink = (linkData) => !isTagLink(linkData);
    const getGraphNodeLabel = (nodeData) => {
      const labelText = nodeData?.label || nodeData?.id || "";
      if (!isTagNode(nodeData)) return labelText;
      const tagName = nodeData?.tag || String(labelText).replace(/^#/, "");
      return `#${tagName}`;
    };
    const getLinkSourceId = (link) => link?.source?.id || link?.source;
    const getLinkTargetId = (link) => link?.target?.id || link?.target;
    const snapshotFilesById = new Map((graphSnapshot.files || []).map((file) => [file.id, file]));
    const graphNodesById = new Map(nodes.map((node) => [node.id, node]));
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
    const fileMatchesGraphSearchQuery = (nodeData, searchQuery) => {
      if (!searchQuery || isTagNode(nodeData)) return !searchQuery;
      const snapshotFile = snapshotFilesById.get(nodeData.id) || {};
      const parsedQuery = parseGraphGroupQuery(searchQuery);
      return graphFileMatchesGroupQuery(nodeData, snapshotFile, parsedQuery, getGraphSearchOptions(nodeData, snapshotFile, parsedQuery));
    };

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

    if (graphViewConfig && graphViewConfig.mode === "local" && graphViewConfig.focusNodeId) {
      const focusNodeId = graphViewConfig.focusNodeId;
      filterGraphToNodeIds(new Set([focusNodeId, ...getDirectOutgoingNodeIds(focusNodeId)]));
    }

    if (graphViewConfig && graphViewConfig.mode === "full-local" && graphViewConfig.focusNodeId) {
      const focusNodeId = graphViewConfig.focusNodeId;
      filterGraphToNodeIds(new Set([focusNodeId, ...getFullOutgoingNodeIds(focusNodeId)]));
    }

    nodes.forEach((nodeData) => {
      if (isTagNode(nodeData)) {
        delete nodeData.groupId;
        delete nodeData.groupColor;
        return;
      }
      const snapshotFile = snapshotFilesById.get(nodeData.id);
      const matchingGroup = getGraphGroupMatch(nodeData, snapshotFile, graphViewConfig, getGraphSearchOptions(nodeData, snapshotFile, parseGraphGroupQuery("")));
      if (matchingGroup) {
        nodeData.groupId = matchingGroup.id;
        nodeData.groupColor = matchingGroup.color;
      } else {
        delete nodeData.groupId;
        delete nodeData.groupColor;
      }
    });

    activeTab.visiblePointCount = nodes.length;
    updateStatusLine({ visiblePointCount: nodes.length });

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
    const maxOutgoing = Math.max(1, ...Array.from(outgoingDegree.values()));
    const GRAPH_NODE_RADIUS_SCALE = graphViewConfig.nodeSize;
    const graphBaseNodeRadius = (nodeId) => {
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
    const baseLinkForce = d3.forceLink(links).id((d) => d.id).distance(graphViewConfig.linkDistance).strength(graphViewConfig.linkForce);
    const baseChargeForce = d3.forceManyBody().strength(-graphViewConfig.repelForce);
    const centerForceStrength = Math.max(0, graphViewConfig.centerForce);
    const baseCenterForce = d3.forceCenter(width / 2, height / 2);
    if (typeof baseCenterForce.strength === "function") baseCenterForce.strength(Math.min(1, centerForceStrength));
    const baseCenterPullX = d3.forceX(width / 2).strength(centerForceStrength * 0.08);
    const baseCenterPullY = d3.forceY(height / 2).strength(centerForceStrength * 0.08);
    const baseCollisionForce = d3.forceCollide().radius((d) => nodeRadius(d.id) + 30).strength(0.9);
    simulation
      .force("link", baseLinkForce)
      .force("charge", baseChargeForce)
      .force("center", baseCenterForce)
      .force("centerX", baseCenterPullX)
      .force("centerY", baseCenterPullY)
      .force("collision", baseCollisionForce);
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
          if (graphSettings.magneticEnabled && !event.active) simulation.alphaTarget(0.3).restart();
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
          if (graphSettings.magneticEnabled && !event.active) simulation.alphaTarget(0);
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
      button.className = "graph-context-menu-item graph-context-menu-tooltip";
      button.dataset.tooltip = tooltipText;
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
    const localGraphBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.showLocalGraph.label,
      CONTEXT_MENU_ACTIONS.showLocalGraph.icon,
      "Open a graph focused on this point and the points it directly links to."
    );
    localGraphBtn.classList.add("hidden");
    const fullLocalGraphBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.showFullLocalGraph.label,
      CONTEXT_MENU_ACTIONS.showFullLocalGraph.icon,
      "Open a graph that follows every outgoing dependency reachable from this point."
    );
    fullLocalGraphBtn.classList.add("hidden");
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
    sharePointBtn.classList.add("hidden");
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
    const copyDependenciesBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyDependencies.label,
      CONTEXT_MENU_ACTIONS.copyDependencies.icon,
      "Copy direct outgoing linked file names, one file name per line."
    );
    const copyFullDependenciesBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyFullDependencies.label,
      CONTEXT_MENU_ACTIONS.copyFullDependencies.icon,
      "Copy all direct and indirect outgoing linked file names, one file name per line."
    );
    const copyBacklinksBtn = createContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyBacklinks.label,
      CONTEXT_MENU_ACTIONS.copyBacklinks.icon,
      "Copy file names that directly link to this point, one file name per line."
    );
    [copyPathBtn, copyContentBtn, copyDependenciesBtn, copyFullDependenciesBtn, copyBacklinksBtn].forEach((button) => {
      copySubmenuPanel.appendChild(button);
    });
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
    const exportSubmenuArrow = document.createElement("span");
    exportSubmenuArrow.className = "graph-context-menu-submenu-arrow";
    exportSubmenuArrow.textContent = "›";
    exportSubmenuBtn.appendChild(exportSubmenuArrow);
    const exportSubmenuPanel = document.createElement("div");
    exportSubmenuPanel.className = "graph-context-menu-submenu-panel";
    const exportMarkdownBtn = createContextMenuButton(CONTEXT_MENU_ACTIONS.exportMarkdown.label, CONTEXT_MENU_ACTIONS.exportMarkdown.icon, "Download this point as Markdown.");
    const exportHtmlBtn = createContextMenuButton(CONTEXT_MENU_ACTIONS.exportHtml.label, CONTEXT_MENU_ACTIONS.exportHtml.icon, "Download this point as HTML.");
    const exportPdfBtn = createContextMenuButton(CONTEXT_MENU_ACTIONS.exportPdf.label, CONTEXT_MENU_ACTIONS.exportPdf.icon, "Download this point as PDF.");
    [exportMarkdownBtn, exportHtmlBtn, exportPdfBtn].forEach((button) => exportSubmenuPanel.appendChild(button));
    exportSubmenu.appendChild(exportSubmenuBtn);
    exportSubmenu.appendChild(exportSubmenuPanel);

    contextMenu.appendChild(contextMenuTitle);
    contextMenu.appendChild(contextMenuTitleSeparator);
    contextMenu.appendChild(openFileBtn);
    contextMenu.appendChild(openDefaultAppBtn);
    contextMenu.appendChild(revealFileBtn);
    contextMenu.appendChild(renameFileBtn);
    contextMenu.appendChild(tagsSubmenu);
    contextMenu.appendChild(copySubmenu);
    contextMenu.appendChild(sharePointBtn);
    contextMenu.appendChild(contextMenuGraphSeparator);
    contextMenu.appendChild(hidePointBtn);
    contextMenu.appendChild(localGraphBtn);
    contextMenu.appendChild(fullLocalGraphBtn);
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
      return snapshotFile?.fullPath || snapshotFile?.path || graphNode?.fullPath || graphNode?.label || graphNode?.id || "";
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

    const copyNodeFileNameList = async (nodeIds) => {
      await copyGraphText(Array.from(new Set(nodeIds)).map(getNodeFileName).join("\n"));
    };

    const hideGraphPoint = (nodeId) => {
      simulation.stop();

      // Re-render by reusing temporary in-memory file graph and hiding this node for this tab view only.
      const activeGraphTab = getActiveGraphTab();
      if (activeGraphTab) {
        activeGraphTab.graphViewConfig = {
          ...(activeGraphTab.graphViewConfig || {}),
          hiddenNodeIds: Array.from(new Set([...(activeGraphTab.graphViewConfig?.hiddenNodeIds || []), nodeId]))
        };
        markGraphTabAsChanged(activeGraphTab);
        saveTabsToStorage(tabs);
        graphRenderCache.delete(activeGraphTab.id);
      }
      graphRenderWrapper.remove();
      renderGraphView();
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

    const graphSnapshotFileMatches = (candidateFile, referenceFile) => {
      if (!candidateFile || !referenceFile) return false;
      const getStableKeys = (file) => [
        file.id,
        file.path ? normalizeGraphNodeName(file.path) : null,
        file.fullPath ? normalizeGraphNodeName(file.fullPath) : null
      ].filter(Boolean);
      const candidateStableKeys = new Set(getStableKeys(candidateFile));
      const referenceStableKeys = getStableKeys(referenceFile);
      if (candidateStableKeys.size || referenceStableKeys.length) {
        return referenceStableKeys.some((key) => candidateStableKeys.has(key));
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
          if (!graphSnapshotFileMatches(snapshotFile, changedSnapshotFile)) return;
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

    const updateGraphNodeTagContent = async (graphNode, tag, action) => {
      if (!graphNode || graphNode.type === "tag") return;
      const activeGraphTab = getActiveGraphTab();
      const snapshotFile = getSnapshotFileForNode(graphNode);
      if (isKeepSavedGraphMode(activeGraphTab)) {
        alert("Saved graph mode does not update saved tags or links.");
        return;
      }
      if (!activeGraphTab || !snapshotFile) {
        alert("Unable to find the selected file in this graph snapshot.");
        return;
      }

      const currentContent = await readGraphNodeContent(graphNode);
      const currentTags = getFileTagsFromContent(currentContent);
      const normalizedTag = normalizeTagName(tag);
      if (action === "add" && currentTags.includes(normalizedTag)) return;
      if (action === "remove" && !currentTags.includes(normalizedTag)) return;

      const nextContent = action === "remove"
        ? removeTagFromContent(currentContent, normalizedTag)
        : addTagToContent(currentContent, normalizedTag);

      if (nextContent === currentContent) return;

      await writeGraphNodeContent(graphNode, nextContent);

      snapshotFile.content = nextContent;
      snapshotFile.tags = getFileTagsFromContent(nextContent);
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
      await refreshFolderTagCounts();
      renderFilteredFolderTree();
      renderTagManagementList();
      renderLinkAutocomplete();
      simulation.stop();
      graphRenderWrapper.remove();
      updateGraphTagToolbar(activeGraphTab, activeGraphTab.graphSnapshot || null);
      renderGraphView();
    };

    const applyMagneticSetting = () => {
      if (graphSettings.magneticEnabled) {
        simulation
          .force("link", baseLinkForce)
          .force("charge", baseChargeForce)
          .force("center", baseCenterForce)
          .force("centerX", baseCenterPullX)
          .force("centerY", baseCenterPullY)
          .force("collision", baseCollisionForce)
          .alpha(0.7)
          .restart();
      } else {
        simulation
          .force("link", null)
          .force("charge", null)
          .force("center", null)
          .force("centerX", null)
          .force("centerY", null)
          .force("collision", null)
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
      renameFileBtn,
      copySubmenu,
      sharePointBtn,
      contextMenuGraphSeparator,
      hidePointBtn,
      localGraphBtn,
      fullLocalGraphBtn,
      tagsSubmenu,
      deleteTagBtn,
      contextMenuDeleteSeparator,
      deleteFileBtn,
      contextMenuDeleteEndSeparator,
      exportSubmenu
    ];

    const setNodeContextItemsHidden = (hidden) => {
      nodeContextMenuItems.forEach((item) => item.classList.toggle("hidden", hidden));
    };

    const positionContextMenu = (event) => {
      const bounds = graphViewCanvas.getBoundingClientRect();
      contextMenu.style.left = `${Math.max(0, Math.min(event.clientX - bounds.left, bounds.width - 230))}px`;
      contextMenu.style.top = `${Math.max(0, Math.min(event.clientY - bounds.top, bounds.height - 280))}px`;
    };

    const hideContextMenu = () => {
      contextMenu.classList.add("hidden");
      contextTargetNode = null;
      contextMenuTitle.classList.add("hidden");
      contextMenuTitle.textContent = "";
      contextMenuTitleSeparator.classList.add("hidden");
      contextMenuActionSeparator.classList.add("hidden");
      setNodeContextItemsHidden(true);
    };

    graphRenderWrapper.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      contextTargetNode = null;
      contextMenuTitle.classList.add("hidden");
      contextMenuTitle.textContent = "";
      contextMenuTitleSeparator.classList.add("hidden");
      contextMenuActionSeparator.classList.add("hidden");
      setNodeContextItemsHidden(true);
      positionContextMenu(event);
      contextMenu.classList.remove("hidden");
    });

    node.on("contextmenu", (event, d) => {
      event.preventDefault();
      event.stopPropagation();
      contextTargetNode = d;
      contextMenuTitle.textContent = getGraphContextMenuTitle(d);
      contextMenuTitle.classList.remove("hidden");
      contextMenuTitleSeparator.classList.remove("hidden");
      contextMenuActionSeparator.classList.remove("hidden");
      setNodeContextItemsHidden(false);
      const isFileNode = (d.type || "file") !== "tag";
      const keepSavedMode = isKeepSavedGraphMode(activeTab);
      [openFileBtn, openDefaultAppBtn, revealFileBtn, copySubmenu, sharePointBtn, localGraphBtn, fullLocalGraphBtn, exportSubmenu].forEach((item) => item.classList.toggle("hidden", !isFileNode));
      [renameFileBtn, deleteFileBtn].forEach((item) => item.classList.toggle("hidden", !isFileNode || keepSavedMode));
      tagsSubmenu.classList.toggle("hidden", !isFileNode || keepSavedMode);
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
        });
      }
      deleteTagBtn.classList.toggle("hidden", isFileNode);
      contextMenuDeleteSeparator.classList.toggle("hidden", !isFileNode);
      contextMenuDeleteEndSeparator.classList.toggle("hidden", !isFileNode);
      positionContextMenu(event);
      contextMenu.classList.remove("hidden");
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
      await copyNodeFileNameList(getDirectOutgoingDependencyIds(nodeId));
    });

    copyFullDependenciesBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const nodeId = contextTargetNode.id;
      hideContextMenu();
      await copyNodeFileNameList(getFullOutgoingDependencyIds(nodeId));
    });

    copyBacklinksBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!contextTargetNode) return;
      const nodeId = contextTargetNode.id;
      hideContextMenu();
      await copyNodeFileNameList(getBacklinkIds(nodeId));
    });

    hidePointBtn.addEventListener("click", () => {
      if (!contextTargetNode) return;
      const nodeId = contextTargetNode.id;
      hideContextMenu();
      hideGraphPoint(nodeId);
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
      const confirmed = window.confirm(`Delete "${getNodeFileName(nodeId)}" from disk? This action cannot be undone.`);
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
      tabs.push(localGraphTab);
      saveTabsToStorage(tabs);
      hideContextMenu();
      switchTab(localGraphTab.id);
    };

    localGraphBtn.addEventListener("click", () => {
      openLocalGraphTab("local", "Local Graph");
    });

    fullLocalGraphBtn.addEventListener("click", () => {
      openLocalGraphTab("full-local", "Full Local Graph");
    });

    let hoveredGraphNode = null;
    let hoveredGraphModifiers = { shiftKey: false, ctrlKey: false, altKey: false };

    const getGraphLinkSourceId = (linkData) => linkData?.source?.id || linkData?.source;
    const getGraphLinkTargetId = (linkData) => linkData?.target?.id || linkData?.target;

    const shouldIncludeLinkInHoverHighlight = (linkData, includeTagRelationships = false) => (
      includeTagRelationships || isMarkdownLink(linkData)
    );

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

    function highlightNeighborhood(focusNode, modifiers = hoveredGraphModifiers) {
      if (!focusNode) return;
      const focusNodeId = focusNode.id;
      const isBacklinkHighlight = Boolean(modifiers.ctrlKey);
      // Alt is the explicit opt-in for including tag relationships in hover highlights.
      const includeTagRelationships = Boolean(modifiers.altKey);
      const highlight = isBacklinkHighlight
        ? getBacklinkHighlight(focusNodeId, includeTagRelationships)
        : (modifiers.shiftKey
          ? getRecursiveOutgoingHighlight(focusNodeId, includeTagRelationships)
          : {
            highlightedNodes: outgoingAdjacency.get(focusNodeId) || new Set([focusNodeId]),
            highlightedLinks: new Set(links.filter((l) => shouldIncludeLinkInHoverHighlight(l, includeTagRelationships) && getGraphLinkSourceId(l) === focusNodeId))
          });
      if (includeTagRelationships) {
        highlight.highlightedLinks.forEach((linkData) => {
          const targetNodeId = getGraphLinkTargetId(linkData);
          if (targetNodeId) highlight.highlightedNodes.add(targetNodeId);
        });
      }
      const isHighlightedLink = (l) => highlight.highlightedLinks.has(l);

      node.classed("dimmed", (n) => !highlight.highlightedNodes.has(n.id));
      label.classed("dimmed", (n) => !highlight.highlightedNodes.has(n.id));
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
      node.classed("dimmed", false);
      label.classed("dimmed", false);
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
      zoomScale: currentZoomTransform.k,
      getZoomTransform: () => currentZoomTransform,
      animate: () => {
        graphSettings.magneticEnabled = true;
        applyMagneticSetting();
      }
    });

    applyMagneticSetting();
  }

    }

    return { renderGraphView };
  };
})(window);
