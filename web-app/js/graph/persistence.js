(function(global) {
  global.registerMarkdownViewerGraphPersistence = function registerMarkdownViewerGraphPersistence(app, deps) {
    let graphLayoutSaveTimeout = null;
    const api = {};
    const GRAPH_SNAPSHOT_READ_CONCURRENCY = 12;
    const GRAPH_SNAPSHOT_CACHE_LIMIT = 12;
    const graphParsedFileCache = new Map();
    const graphSnapshotCache = new Map();
    let graphTabStorageCompactMode = false;

    with (deps) {
  function normalizeGraphTagNodeId(value) {
    const rawValue = String(value || "").trim();
    if (!rawValue) return "";
    if (rawValue.startsWith("tag:")) return `tag:${normalizeTagName(rawValue.slice(4))}`;
    return `tag:${normalizeTagName(rawValue)}`;
  }

  function getGraphTagLabelFromId(tagNodeId) {
    return `#${String(tagNodeId || "").replace(/^tag:/, "")}`;
  }

  function normalizeGraphTagNodeIds(values) {
    return Array.from(new Set((Array.isArray(values) ? values : [])
      .map(normalizeGraphTagNodeId)
      .filter((tagId) => tagId && tagId !== "tag:")));
  }

  function clampGraphNumber(value, fallback, min, max) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.min(max, Math.max(min, numericValue));
  }

  function createGraphGroupId(seed) {
    const rawSeed = String(seed || "graph-group");
    let hash = 2166136261;
    for (let i = 0; i < rawSeed.length; i += 1) {
      hash ^= rawSeed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `graph-group-${(hash >>> 0).toString(36)}`;
  }

  function normalizeGraphGroupColor(value, fallback) {
    const fallbackColor = String(fallback || "#7c3aed").trim() || "#7c3aed";
    const rawValue = String(value || "").trim();
    if (!rawValue) return fallbackColor;
    if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(rawValue)) return rawValue;
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("color", rawValue)) return rawValue;
    return fallbackColor;
  }

  function getGraphColorInputValue(value) {
    const color = normalizeGraphGroupColor(value, GRAPH_GROUP_DEFAULT_COLORS[0]);
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    if (/^#[0-9a-f]{3}$/i.test(color)) {
      return `#${color.slice(1).split("").map((digit) => digit + digit).join("")}`;
    }
    return GRAPH_GROUP_DEFAULT_COLORS[0];
  }

  function getNextDefaultGraphGroupColor(groups) {
    const groupCount = Array.isArray(groups) ? groups.length : 0;
    return GRAPH_GROUP_DEFAULT_COLORS[groupCount % GRAPH_GROUP_DEFAULT_COLORS.length];
  }

  function normalizeGraphGroups(groups) {
    const seenIds = new Set();
    return (Array.isArray(groups) ? groups : [])
      .map((group) => {
        const source = group && typeof group === "object" ? group : {};
        const query = String(source.query || "").trim();
        const color = normalizeGraphGroupColor(source.color, GRAPH_GROUP_DEFAULT_COLORS[0]);
        const baseId = String(source.id || "").trim() || createGraphGroupId(`${query}:${color}`);
        let id = baseId;
        let suffix = 2;
        while (seenIds.has(id)) {
          id = `${baseId}-${suffix}`;
          suffix += 1;
        }
        seenIds.add(id);
        return {
          id,
          query,
          color,
          enabled: source.enabled !== false,
          hidden: source.hidden === true
        };
      });
  }

  function normalizeCollapsedGraphClusters(clusters) {
    const seenIds = new Set();
    const usedMemberIds = new Set();
    return (Array.isArray(clusters) ? clusters : [])
      .map((cluster) => {
        const source = cluster && typeof cluster === "object" ? cluster : {};
        const seedNodeId = String(source.seedNodeId || "").trim();
        const memberNodeIds = Array.from(new Set((Array.isArray(source.memberNodeIds) ? source.memberNodeIds : [])
          .map((nodeId) => String(nodeId || "").trim())
          .filter(Boolean)));
        if (!seedNodeId || memberNodeIds.length < 3 || !memberNodeIds.includes(seedNodeId)) return null;
        if (memberNodeIds.some((nodeId) => usedMemberIds.has(nodeId))) return null;
        const baseId = String(source.id || "").trim() || createGraphGroupId(`cluster:${seedNodeId}:${memberNodeIds.join(",")}`);
        let id = baseId;
        let suffix = 2;
        while (seenIds.has(id)) {
          id = `${baseId}-${suffix}`;
          suffix += 1;
        }
        seenIds.add(id);
        memberNodeIds.forEach((nodeId) => usedMemberIds.add(nodeId));
        return {
          id,
          label: String(source.label || "").trim(),
          mode: String(source.mode || "direct-outgoing").trim() || "direct-outgoing",
          seedNodeId,
          memberNodeIds,
          createdAt: normalizeGraphTimestamp(source.createdAt) || Date.now()
        };
      })
      .filter(Boolean);
  }

  function normalizeGraphViewConfig(config) {
    const source = config && typeof config === "object" ? config : {};
    const preferenceDefaults = typeof getGraphViewPreferenceDefaults === "function" ? getGraphViewPreferenceDefaults() : {};
    const baseConfig = {
      ...DEFAULT_GRAPH_VIEW_CONFIG,
      ...preferenceDefaults
    };
    const mergedSource = {
      ...baseConfig,
      ...source
    };
    return {
      ...mergedSource,
      showTags: mergedSource.showTags === true,
      hiddenTagIds: normalizeGraphTagNodeIds(mergedSource.hiddenTagIds),
      hiddenNodeIds: Array.from(new Set((Array.isArray(mergedSource.hiddenNodeIds) ? mergedSource.hiddenNodeIds : [])
        .map((nodeId) => String(nodeId || "").trim())
        .filter(Boolean))),
      selectedTagIds: normalizeGraphTagNodeIds(mergedSource.selectedTagIds),
      groups: normalizeGraphGroups(mergedSource.groups),
      collapsedClusters: normalizeCollapsedGraphClusters(mergedSource.collapsedClusters),
      searchQuery: String(mergedSource.searchQuery || "").trim().toLowerCase(),
      showArrows: mergedSource.showArrows !== false,
      showOrphans: mergedSource.showOrphans !== false,
      showLabels: mergedSource.showLabels !== false,
      textFadeThreshold: clampGraphNumber(mergedSource.textFadeThreshold, baseConfig.textFadeThreshold, 0, 1),
      nodeSize: clampGraphNumber(mergedSource.nodeSize, baseConfig.nodeSize, 0.4, 1.8),
      linkThickness: clampGraphNumber(mergedSource.linkThickness, baseConfig.linkThickness, 0.5, 4),
      centerForce: clampGraphNumber(mergedSource.centerForce, baseConfig.centerForce, 0, 2),
      repelForce: clampGraphNumber(mergedSource.repelForce, baseConfig.repelForce, 0, 1200),
      linkForce: clampGraphNumber(mergedSource.linkForce, baseConfig.linkForce, 0, 1),
      linkDistance: clampGraphNumber(mergedSource.linkDistance, baseConfig.linkDistance, 40, 320),
      groupForce: clampGraphNumber(mergedSource.groupForce, baseConfig.groupForce, 0, 1)
    };
  }

  function cloneGraphPersistenceValue(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      console.warn("Failed to clone graph persistence value:", e);
      return null;
    }
  }

  function normalizeGraphTimestamp(value, fallback) {
    const timestamp = typeof value === "string" ? Date.parse(value) : Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback;
  }

  function normalizeGraphSnapshot(snapshot) {
    const normalizedSnapshot = cloneGraphPersistenceValue(snapshot || null);
    if (!normalizedSnapshot || typeof normalizedSnapshot !== "object") return normalizedSnapshot;

    if (Array.isArray(normalizedSnapshot.nodes)) {
      normalizedSnapshot.nodes = normalizedSnapshot.nodes.map((node) => ({
        ...node,
        type: node?.type || "file",
        status: node?.status || "current"
      }));
    }

    if (Array.isArray(normalizedSnapshot.links)) {
      normalizedSnapshot.links = normalizedSnapshot.links.map((link) => ({
        ...link,
        type: link?.type || "link",
        status: link?.status || "current"
      }));
    }

    return normalizedSnapshot;
  }

  function graphSnapshotHasEmbeddedFileContent(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.files)) return false;
    return snapshot.files.some((file) => file && typeof file === "object" && Object.prototype.hasOwnProperty.call(file, "content"));
  }

  function getGraphFileKey(file) {
    if (!file) return "";
    const source = file && typeof file === "object" ? file : { path: file };
    const path = source.path || source.fullPath || source.file?.webkitRelativePath || source.file?.name || source.name || "";
    if (path) return normalizeGraphNodeName(path);
    return String(source.id || "").trim().toLowerCase();
  }

  function getGraphLinkEndpointKey(endpoint) {
    if (!endpoint) return "";
    if (typeof endpoint === "object") {
      return String(endpoint.id || getGraphFileKey(endpoint) || "").trim().toLowerCase();
    }
    return String(endpoint || "").trim().toLowerCase();
  }

  function getGraphLinkKey(link) {
    if (!link) return "";
    const source = getGraphLinkEndpointKey(link.source);
    const target = getGraphLinkEndpointKey(link.target);
    if (!source || !target) return "";
    return `${source}->${target}:${link.type || "link"}`;
  }

  function getGraphSnapshotFilesForComparison(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return [];
    const files = Array.isArray(snapshot.files) ? snapshot.files : [];
    if (files.length) return files;
    return (Array.isArray(snapshot.nodes) ? snapshot.nodes : []).filter((node) => (node?.type || "file") === "file");
  }

  function getGraphSnapshotLinksForComparison(snapshot) {
    return (Array.isArray(snapshot?.links) ? snapshot.links : [])
      .filter((link) => (link?.type || "link") !== "tag");
  }

  function getGraphTagRelationKeys(snapshot) {
    const relationKeys = new Set();

    (Array.isArray(snapshot?.links) ? snapshot.links : [])
      .filter((link) => (link?.type || "link") === "tag")
      .forEach((link) => {
        const key = getGraphLinkKey({ ...link, type: "tag" });
        if (key) relationKeys.add(key);
      });

    getGraphSnapshotFilesForComparison(snapshot).forEach((file) => {
      const fileKey = getGraphFileKey(file);
      if (!fileKey) return;
      normalizeFileTagList(file.tags || getFileTagsFromContent(file.content || "")).forEach((tag) => {
        const tagId = normalizeGraphTagNodeId(tag);
        if (tagId && tagId !== "tag:") relationKeys.add(`${fileKey}->${tagId}:tag`);
      });
    });

    return Array.from(relationKeys).sort();
  }

  function compareGraphCollections(savedItems, currentItems, keyGetter) {
    const savedByKey = new Map();
    const currentByKey = new Map();

    (savedItems || []).forEach((item) => {
      const key = keyGetter(item);
      if (key && !savedByKey.has(key)) savedByKey.set(key, item);
    });

    (currentItems || []).forEach((item) => {
      const key = keyGetter(item);
      if (key && !currentByKey.has(key)) currentByKey.set(key, item);
    });

    return {
      currentOnly: Array.from(currentByKey.entries())
        .filter(([key]) => !savedByKey.has(key))
        .map(([, item]) => item),
      savedOnly: Array.from(savedByKey.entries())
        .filter(([key]) => !currentByKey.has(key))
        .map(([, item]) => item)
    };
  }

  function compareGraphViewToCurrentFolder(savedSnapshot, currentSnapshot) {
    const fileComparison = compareGraphCollections(
      getGraphSnapshotFilesForComparison(savedSnapshot),
      getGraphSnapshotFilesForComparison(currentSnapshot),
      getGraphFileKey
    );
    const linkComparison = compareGraphCollections(
      getGraphSnapshotLinksForComparison(savedSnapshot),
      getGraphSnapshotLinksForComparison(currentSnapshot),
      getGraphLinkKey
    );
    const tagRelationComparison = compareGraphCollections(
      getGraphTagRelationKeys(savedSnapshot),
      getGraphTagRelationKeys(currentSnapshot),
      (key) => key
    );

    const result = {
      newFiles: fileComparison.currentOnly,
      savedOnlyFiles: fileComparison.savedOnly,
      newLinks: linkComparison.currentOnly,
      savedOnlyLinks: linkComparison.savedOnly,
      newTagRelations: tagRelationComparison.currentOnly,
      savedOnlyTagRelations: tagRelationComparison.savedOnly
    };

    result.counts = {
      newFiles: result.newFiles.length,
      savedOnlyFiles: result.savedOnlyFiles.length,
      newLinks: result.newLinks.length,
      savedOnlyLinks: result.savedOnlyLinks.length,
      newTagRelations: result.newTagRelations.length,
      savedOnlyTagRelations: result.savedOnlyTagRelations.length
    };

    return result;
  }

  function hasGraphComparisonChanges(comparison) {
    const counts = comparison?.counts || {};
    return [
      counts.newFiles,
      counts.savedOnlyFiles,
      counts.newLinks,
      counts.savedOnlyLinks,
      counts.newTagRelations,
      counts.savedOnlyTagRelations
    ].some((count) => Number(count) > 0);
  }

  function buildCompareGraphSnapshot(savedSnapshot, currentSnapshot, comparison) {
    const sourceCurrentSnapshot = currentSnapshot && typeof currentSnapshot === "object" ? currentSnapshot : {};
    const sourceSavedSnapshot = savedSnapshot && typeof savedSnapshot === "object" ? savedSnapshot : {};
    const nodes = [];
    const links = [];
    const files = [];
    const nodesById = new Map();
    const linksByKey = new Map();
    const savedNodesById = new Map((Array.isArray(sourceSavedSnapshot.nodes) ? sourceSavedSnapshot.nodes : [])
      .map((node) => [String(node?.id || "").trim(), node])
      .filter(([id]) => id));
    const savedFilesById = new Map(getGraphSnapshotFilesForComparison(sourceSavedSnapshot)
      .map((file) => [String(file?.id || getGraphFileKey(file) || "").trim(), file])
      .filter(([id]) => id));

    const addNode = (node, status = "current") => {
      const nodeId = String(node?.id || getGraphFileKey(node) || "").trim();
      if (!nodeId || nodesById.has(nodeId)) return nodesById.get(nodeId) || null;
      const type = node?.type || (String(nodeId).startsWith("tag:") ? "tag" : "file");
      const nextNode = {
        ...node,
        id: nodeId,
        type,
        status
      };
      if (!nextNode.label) nextNode.label = type === "tag" ? getGraphTagLabelFromId(nodeId) : getGraphDisplayLabel(node?.path || node?.fullPath || nodeId);
      nodesById.set(nodeId, nextNode);
      nodes.push(nextNode);
      return nextNode;
    };

    const addFile = (file, status = "current") => {
      const fileId = String(file?.id || getGraphFileKey(file) || "").trim();
      if (!fileId) return;
      const node = savedNodesById.get(fileId) || file;
      addNode({
        ...node,
        id: fileId,
        type: "file",
        label: node?.label || getGraphDisplayLabel(file?.path || file?.fullPath || fileId),
        fullPath: node?.fullPath || file?.fullPath || file?.path || null,
        tags: node?.tags || file?.tags || []
      }, status);
      files.push({
        ...file,
        id: fileId,
        status
      });
    };

    const ensureNodeForEndpoint = (endpointId, status = "saved-only") => {
      const nodeId = String(endpointId || "").trim();
      if (!nodeId || nodesById.has(nodeId)) return;
      if (nodeId.startsWith("tag:")) {
        addNode({ id: nodeId, label: getGraphTagLabelFromId(nodeId), type: "tag", tag: nodeId.replace(/^tag:/, "") }, status);
        return;
      }
      const savedFile = savedFilesById.get(nodeId);
      const savedNode = savedNodesById.get(nodeId);
      addNode({
        ...(savedNode || savedFile || {}),
        id: nodeId,
        type: "file",
        label: savedNode?.label || getGraphDisplayLabel(savedFile?.path || savedFile?.fullPath || nodeId),
        fullPath: savedNode?.fullPath || savedFile?.fullPath || savedFile?.path || null,
        tags: savedNode?.tags || savedFile?.tags || []
      }, status);
      if (savedFile && !files.some((file) => file.id === nodeId)) files.push({ ...savedFile, id: nodeId, status });
    };

    const addLink = (link, status = "current") => {
      const source = getGraphLinkEndpointKey(link?.source);
      const target = getGraphLinkEndpointKey(link?.target);
      if (!source || !target) return;
      ensureNodeForEndpoint(source, status);
      ensureNodeForEndpoint(target, status);
      const type = link?.type || "link";
      const key = `${source}->${target}:${type}`;
      if (linksByKey.has(key)) return;
      linksByKey.set(key, true);
      links.push({
        ...link,
        source,
        target,
        type,
        status
      });
    };

    (Array.isArray(sourceCurrentSnapshot.nodes) ? sourceCurrentSnapshot.nodes : []).forEach((node) => addNode(node, "current"));
    getGraphSnapshotFilesForComparison(sourceCurrentSnapshot).forEach((file) => addFile(file, "current"));
    (Array.isArray(sourceCurrentSnapshot.links) ? sourceCurrentSnapshot.links : []).forEach((link) => addLink(link, "current"));

    (comparison?.savedOnlyFiles || []).forEach((file) => addFile(file, "saved-only"));
    (comparison?.savedOnlyLinks || []).forEach((link) => addLink(link, "saved-only"));
    (comparison?.savedOnlyTagRelations || []).forEach((relationKey) => {
      const relationMatch = String(relationKey || "").match(/^(.*)->(tag:[^:]+):tag$/);
      if (!relationMatch) return;
      addLink({ source: relationMatch[1], target: relationMatch[2], type: "tag" }, "saved-only");
    });

    return {
      version: sourceCurrentSnapshot.version || 1,
      folderName: sourceCurrentSnapshot.folderName || sourceSavedSnapshot.folderName || "Graph Comparison",
      createdAt: Date.now(),
      nodes,
      links,
      files
    };
  }

  function isKeepSavedGraphMode(tab) {
    return !!(tab && tab.type === "graph" && tab.keepSavedGraphMode);
  }


  function getGraphNodeNormalizedPath(node) {
    if (!node) return "";
    if ((node.type || "file") === "tag" || String(node.id || "").startsWith("tag:")) return "";
    return normalizeGraphNodeName(node.path || node.fullPath || node.id || node.name || "");
  }

  function getGraphSnapshotNodeIds(snapshot) {
    return new Set((Array.isArray(snapshot?.nodes) ? snapshot.nodes : [])
      .map((node) => String(node?.id || "").trim())
      .filter(Boolean));
  }

  function getGraphLayoutEntryByNormalizedPath(graphLayout, savedSnapshot, normalizedPath) {
    if (!graphLayout || !normalizedPath) return null;
    const directEntry = getSavedGraphNodeLayout(graphLayout, normalizedPath);
    if (directEntry) return directEntry;

    const savedNodes = Array.isArray(savedSnapshot?.nodes) ? savedSnapshot.nodes : [];
    const savedFiles = Array.isArray(savedSnapshot?.files) ? savedSnapshot.files : [];
    const savedCandidates = [...savedNodes, ...savedFiles];
    const matchingSavedNode = savedCandidates.find((candidate) => getGraphNodeNormalizedPath(candidate) === normalizedPath);
    return matchingSavedNode?.id ? getSavedGraphNodeLayout(graphLayout, matchingSavedNode.id) : null;
  }

  function getGraphLayoutEntryForSnapshotNode(graphLayout, savedSnapshot, node) {
    if (!graphLayout || !node?.id) return null;
    const directEntry = getSavedGraphNodeLayout(graphLayout, node.id);
    if (directEntry) return directEntry;
    if ((node.type || "file") === "tag") return null;
    return getGraphLayoutEntryByNormalizedPath(graphLayout, savedSnapshot, getGraphNodeNormalizedPath(node));
  }

  function shouldPreserveGraphZoomTransform(savedZoomTransform, preservedNodeCount) {
    return !!savedZoomTransform && preservedNodeCount > 0;
  }

  function preserveGraphLayoutForCurrentSnapshot(savedLayout, savedSnapshot, currentSnapshot) {
    const sourceLayout = savedLayout && typeof savedLayout === "object" ? savedLayout : {};
    const currentNodes = Array.isArray(currentSnapshot?.nodes) ? currentSnapshot.nodes : [];
    const nextNodes = {};

    currentNodes.forEach((node) => {
      if (!node?.id || (node.type || "file") === "tag") return;
      const savedEntry = getGraphLayoutEntryForSnapshotNode(sourceLayout, savedSnapshot, node);
      if (savedEntry) nextNodes[node.id] = cloneGraphPersistenceValue(savedEntry);
    });

    const nextLayout = {
      ...sourceLayout,
      nodes: nextNodes,
      updatedAt: Date.now()
    };
    const savedZoomTransform = getSavedGraphZoomTransform(sourceLayout);
    if (shouldPreserveGraphZoomTransform(savedZoomTransform, Object.keys(nextNodes).length)) nextLayout.zoom = savedZoomTransform;
    else {
      delete nextLayout.zoom;
      delete nextLayout.transform;
    }
    return nextLayout;
  }

  function preserveGraphLayoutForCompareSnapshot(savedLayout, savedSnapshot, compareSnapshot) {
    const sourceLayout = savedLayout && typeof savedLayout === "object" ? savedLayout : {};
    const compareNodes = Array.isArray(compareSnapshot?.nodes) ? compareSnapshot.nodes : [];
    const nextNodes = {};

    compareNodes.forEach((node) => {
      if (!node?.id) return;
      const savedEntry = getGraphLayoutEntryForSnapshotNode(sourceLayout, savedSnapshot, node);
      if (savedEntry) nextNodes[node.id] = cloneGraphPersistenceValue(savedEntry);
    });

    const nextLayout = {
      ...sourceLayout,
      nodes: nextNodes,
      updatedAt: Date.now()
    };
    const savedZoomTransform = getSavedGraphZoomTransform(sourceLayout);
    if (shouldPreserveGraphZoomTransform(savedZoomTransform, Object.keys(nextNodes).length)) nextLayout.zoom = savedZoomTransform;
    else {
      delete nextLayout.zoom;
      delete nextLayout.transform;
    }
    return nextLayout;
  }

  function preserveGraphConfigForCurrentSnapshot(savedConfig, currentSnapshot) {
    const normalizedConfig = normalizeGraphViewConfig(savedConfig);
    const currentNodeIds = getGraphSnapshotNodeIds(currentSnapshot);
    const currentTagIds = new Set(Array.from(currentNodeIds).filter((nodeId) => nodeId.startsWith("tag:")));

    normalizedConfig.hiddenNodeIds = normalizedConfig.hiddenNodeIds.filter((nodeId) => currentNodeIds.has(nodeId));
    normalizedConfig.hiddenTagIds = normalizedConfig.hiddenTagIds.filter((tagId) => currentTagIds.has(tagId));
    normalizedConfig.selectedTagIds = normalizedConfig.selectedTagIds.filter((tagId) => currentTagIds.has(tagId));

    if (Array.isArray(normalizedConfig.allowedNodeIds)) {
      normalizedConfig.allowedNodeIds = normalizedConfig.allowedNodeIds.filter((nodeId) => currentNodeIds.has(nodeId));
    }
    if (normalizedConfig.focusNodeId && !currentNodeIds.has(normalizedConfig.focusNodeId)) {
      delete normalizedConfig.focusNodeId;
      delete normalizedConfig.mode;
    }

    return normalizedConfig;
  }

  function applyCurrentFolderSnapshotToSavedGraphTab(tab, currentSnapshot, options = {}) {
    if (!tab || tab.type !== "graph" || !currentSnapshot) return false;
    const savedSnapshot = options.savedSnapshot || tab.graphSnapshot || tab.graphDocument?.snapshot || null;
    const savedLayout = options.savedLayout !== undefined
      ? options.savedLayout
      : (tab.graphLayout !== undefined ? tab.graphLayout : (tab.graphDocument?.graphLayout ?? tab.graphDocument?.layout));
    const savedConfig = options.savedConfig !== undefined
      ? options.savedConfig
      : (tab.graphViewConfig || tab.graphDocument?.viewConfig || null);

    tab.graphSnapshot = currentSnapshot;
    tab.graphViewConfig = preserveGraphConfigForCurrentSnapshot(savedConfig, currentSnapshot);
    tab.graphLayout = preserveGraphLayoutForCurrentSnapshot(savedLayout, savedSnapshot, currentSnapshot);
    tab.folderName = tab.folderName || currentSnapshot.folderName || "Graph View";
    tab.graphDocument = serializeGraphTab(tab, { documentType: GRAPH_DOCUMENT_TYPE_VIEW });
    return true;
  }

  let graphUpdateBannerTimeout = null;
  let activeGraphComparisonDetailsModel = null;

  function showGraphUpdatedBanner() {
    showGraphBanner("Graph updated from current folder. Saved layout was preserved where possible.");
  }

  function showSavedGraphModeBanner(tab) {
    const detailsModel = tab?.savedGraphComparisonDetails || null;
    if (detailsModel) activeGraphComparisonDetailsModel = detailsModel;
    showGraphBanner("Saved graph mode — current folder changes are ignored.", detailsModel);
  }

  function showGraphBanner(message, detailsModel = null) {
    let banner = document.getElementById("graph-update-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "graph-update-banner";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      banner.style.position = "fixed";
      banner.style.left = "50%";
      banner.style.bottom = "24px";
      banner.style.transform = "translateX(-50%)";
      banner.style.zIndex = "2147483647";
      banner.style.maxWidth = "min(92vw, 640px)";
      banner.style.padding = "10px 14px";
      banner.style.borderRadius = "999px";
      banner.style.background = "#111827";
      banner.style.color = "#ffffff";
      banner.style.boxShadow = "0 10px 30px rgba(15, 23, 42, 0.25)";
      banner.style.fontSize = "0.92rem";
      banner.style.fontWeight = "600";
      banner.style.textAlign = "center";
      document.body.appendChild(banner);
    }

    banner.innerHTML = "";
    const messageSpan = document.createElement("span");
    messageSpan.textContent = message;
    banner.appendChild(messageSpan);
    if (detailsModel) {
      banner.appendChild(document.createTextNode(" "));
      const detailsButton = document.createElement("button");
      detailsButton.type = "button";
      detailsButton.className = "graph-update-banner-details-button";
      detailsButton.textContent = "View details";
      detailsButton.style.color = "#93c5fd";
      detailsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openGraphComparisonDetailsModal(detailsModel);
      });
      banner.appendChild(detailsButton);
    }
    banner.classList.remove("hidden");
    window.clearTimeout(graphUpdateBannerTimeout);
    graphUpdateBannerTimeout = window.setTimeout(() => {
      banner.classList.add("hidden");
    }, detailsModel ? 8000 : 4500);
  }

  function ensureSavedGraphModePill() {
    if (!graphViewToolbar) return null;
    let pill = graphViewToolbar.querySelector(".saved-graph-mode-pill");
    if (!pill) {
      pill = document.createElement("div");
      pill.className = "saved-graph-mode-pill hidden";
      pill.setAttribute("role", "status");
      pill.setAttribute("aria-live", "polite");
      const panelHeading = graphViewToolbar.querySelector(".graph-filter-panel-heading");
      if (panelHeading?.nextSibling) {
        graphViewToolbar.insertBefore(pill, panelHeading.nextSibling);
      } else {
        graphViewToolbar.prepend(pill);
      }
    }
    return pill;
  }

  function updateSavedGraphModePill(tab) {
    const pill = ensureSavedGraphModePill();
    if (!pill) return;
    const isGraphTab = !!(tab && tab.type === "graph");
    const isCompareMode = !!tab?.graphComparisonSnapshot;
    const isSavedMode = isKeepSavedGraphMode(tab);
    pill.classList.toggle("hidden", !isGraphTab);
    pill.innerHTML = "";
    if (!isGraphTab) return;

    pill.classList.toggle("compare-mode", isCompareMode);
    pill.classList.toggle("saved-mode", isSavedMode && !isCompareMode);
    pill.classList.toggle("current-folder-mode", !isSavedMode && !isCompareMode);

    const label = document.createElement("span");
    label.textContent = isCompareMode ? "Compare" : (isSavedMode ? "Saved graph" : "Current folder");
    pill.appendChild(label);
    if (isSavedMode && !isCompareMode && tab?.savedGraphComparisonDetails) {
      activeGraphComparisonDetailsModel = tab.savedGraphComparisonDetails;
      const detailsButton = document.createElement("button");
      detailsButton.type = "button";
      detailsButton.className = "saved-graph-mode-details-button";
      detailsButton.textContent = "View details";
      detailsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openGraphComparisonDetailsModal(tab.savedGraphComparisonDetails);
      });
      pill.appendChild(detailsButton);
    }
  }

  function getGraphComparisonSummaryCounts(comparison) {
    const counts = comparison?.counts || {};
    return {
      newFiles: counts.newFiles || 0,
      savedOnlyFiles: counts.savedOnlyFiles || 0,
      changedConnections: (counts.newLinks || 0) + (counts.savedOnlyLinks || 0),
      changedTags: (counts.newTagRelations || 0) + (counts.savedOnlyTagRelations || 0)
    };
  }

  function getGraphFileDifferenceLabel(file) {
    if (!file) return "Unknown file";
    return file.path || file.fullPath || file.name || file.id || "Unknown file";
  }

  function createGraphComparisonLabelLookup(savedSnapshot, currentSnapshot) {
    const labels = new Map();
    const addLabel = (id, label) => {
      const key = String(id || "").trim();
      const value = String(label || "").trim();
      if (key && value && !labels.has(key)) labels.set(key, value);
    };
    [currentSnapshot, savedSnapshot].forEach((snapshot) => {
      getGraphSnapshotFilesForComparison(snapshot).forEach((file) => {
        const label = getGraphFileDifferenceLabel(file);
        addLabel(file?.id, label);
        addLabel(getGraphFileKey(file), label);
        addLabel(file?.path, label);
        addLabel(file?.fullPath, label);
      });
      (Array.isArray(snapshot?.nodes) ? snapshot.nodes : []).forEach((node) => {
        const nodeId = String(node?.id || "").trim();
        if (!nodeId) return;
        if (nodeId.startsWith("tag:")) {
          addLabel(nodeId, `#${getGraphTagLabelFromId(nodeId)}`);
          return;
        }
        addLabel(nodeId, node?.path || node?.fullPath || node?.label || nodeId);
      });
    });
    return labels;
  }

  function getGraphComparisonEndpointLabel(endpoint, labels) {
    const endpointKey = getGraphLinkEndpointKey(endpoint) || String(endpoint || "").trim();
    if (!endpointKey) return "unknown";
    if (endpointKey.startsWith("tag:")) return `#${getGraphTagLabelFromId(endpointKey)}`;
    return labels.get(endpointKey) || endpointKey;
  }

  function getGraphLinkDifferenceLabel(link, labels = new Map()) {
    if (!link) return "Unknown connection";
    const source = getGraphComparisonEndpointLabel(link.source, labels);
    const target = getGraphComparisonEndpointLabel(link.target, labels);
    return `${source} ? ${target}`;
  }

  function getGraphTagRelationDifferenceLabel(relationKey, labels = new Map()) {
    const rawKey = String(relationKey || "");
    const relationMatch = rawKey.match(/^(.*)->(tag:[^:]+):tag$/);
    if (!relationMatch) return rawKey || "Unknown tag";
    const fileLabel = labels.get(relationMatch[1]) || relationMatch[1];
    return `${fileLabel} ? #${relationMatch[2].replace(/^tag:/, "")}`;
  }

  function createGraphComparisonSection(title, items, formatter) {
    return {
      title,
      items: (items || []).map((item) => String(formatter(item) || "").trim()).filter(Boolean)
    };
  }

  function buildGraphComparisonDetailsModel(comparison, savedSnapshot, currentSnapshot) {
    const labels = createGraphComparisonLabelLookup(savedSnapshot, currentSnapshot);
    return {
      sections: [
        createGraphComparisonSection("New in current folder", comparison?.newFiles || [], getGraphFileDifferenceLabel),
        createGraphComparisonSection("Only in saved graph", comparison?.savedOnlyFiles || [], getGraphFileDifferenceLabel),
        createGraphComparisonSection("New connections", comparison?.newLinks || [], (link) => getGraphLinkDifferenceLabel(link, labels)),
        createGraphComparisonSection("Saved-only connections", comparison?.savedOnlyLinks || [], (link) => getGraphLinkDifferenceLabel(link, labels)),
        createGraphComparisonSection("New tags", comparison?.newTagRelations || [], (relationKey) => getGraphTagRelationDifferenceLabel(relationKey, labels)),
        createGraphComparisonSection("Saved-only tags", comparison?.savedOnlyTagRelations || [], (relationKey) => getGraphTagRelationDifferenceLabel(relationKey, labels))
      ]
    };
  }

  function renderGraphComparisonDetailsModel(model) {
    const sections = Array.isArray(model?.sections) ? model.sections : [];
    if (!sections.length) {
      return '<p class="graph-comparison-details-empty">No graph comparison details are available.</p>';
    }
    return sections.map((section) => {
      const items = Array.isArray(section.items) ? section.items : [];
      const body = items.length
        ? `<ul class="graph-comparison-details-list">${items.map((item) => `<li class="graph-comparison-details-item">${escapeHtml(String(item))}</li>`).join("")}</ul>`
        : '<p class="graph-comparison-details-empty">None</p>';
      return `<section class="graph-comparison-details-section"><h6>${escapeHtml(String(section.title || "Details"))}</h6>${body}</section>`;
    }).join("");
  }

  function openGraphComparisonDetailsModal(model) {
    if (!graphComparisonDetailsModal || !graphComparisonDetailsContent) return;
    const activeSavedGraphDetails = getActiveGraphTab()?.savedGraphComparisonDetails || null;
    activeGraphComparisonDetailsModel = model || activeSavedGraphDetails || activeGraphStaleComparison?.detailsModel || activeGraphComparisonDetailsModel;
    graphComparisonDetailsContent.innerHTML = renderGraphComparisonDetailsModel(activeGraphComparisonDetailsModel);
    graphComparisonDetailsModal.classList.remove("hidden");
    graphComparisonDetailsModal.setAttribute("aria-hidden", "false");
    graphComparisonDetailsContent.focus({ preventScroll: true });
  }

  function closeGraphComparisonDetailsModal() {
    if (!graphComparisonDetailsModal) return;
    graphComparisonDetailsModal.classList.add("hidden");
    graphComparisonDetailsModal.setAttribute("aria-hidden", "true");
  }

  function openGraphStaleComparisonDetailsModal() {
    openGraphComparisonDetailsModal(activeGraphStaleComparison?.detailsModel || activeGraphComparisonDetailsModel);
  }

  function hideGraphStaleModal() {
    activeGraphStaleComparison = null;
    if (!graphStaleModal) return;
    graphStaleModal.classList.add("hidden");
    graphStaleModal.setAttribute("aria-hidden", "true");
  }

  function showGraphStaleModal(tab, savedSnapshot, currentSnapshot, comparison) {
    if (!graphStaleModal) return;
    const detailsModel = buildGraphComparisonDetailsModel(comparison, savedSnapshot, currentSnapshot);
    activeGraphStaleComparison = { tabId: tab?.id || null, savedSnapshot, currentSnapshot, comparison, detailsModel };
    activeGraphComparisonDetailsModel = detailsModel;
    const summary = getGraphComparisonSummaryCounts(comparison);
    if (graphStaleNewFilesCount) graphStaleNewFilesCount.textContent = String(summary.newFiles);
    if (graphStaleSavedOnlyFilesCount) graphStaleSavedOnlyFilesCount.textContent = String(summary.savedOnlyFiles);
    if (graphStaleChangedConnectionsCount) graphStaleChangedConnectionsCount.textContent = String(summary.changedConnections);
    if (graphStaleChangedTagsCount) graphStaleChangedTagsCount.textContent = String(summary.changedTags);
    graphStaleModal.classList.remove("hidden");
    graphStaleModal.setAttribute("aria-hidden", "false");
    graphStaleUpdateButton?.focus({ preventScroll: true });
  }

  async function promptForStaleSavedGraphIfNeeded(tab, options = {}) {
    const shouldPromptWhileKeepingSavedGraph = options.force === true;
    const shouldPromptForLegacyExport = options.legacyExport === true;
    const shouldPromptForExports = options.includeExports === true;
    if (!tab?.graphSnapshot || !folderMarkdownFiles.length || (!shouldPromptWhileKeepingSavedGraph && isKeepSavedGraphMode(tab))) return;
    const graphDocumentType = tab.graphDocument?.documentType || inferLegacyGraphDocumentType(tab.graphSnapshot);
    if (
      graphDocumentType !== GRAPH_DOCUMENT_TYPE_VIEW
      && !((shouldPromptForLegacyExport || shouldPromptForExports) && graphDocumentType === GRAPH_DOCUMENT_TYPE_EXPORT)
    ) return;

    try {
      const currentSnapshot = await createGraphSnapshot(folderMarkdownFiles.slice(), activeFolderName || tab.folderName || tab.title);
      const comparison = compareGraphViewToCurrentFolder(tab.graphSnapshot, currentSnapshot);
      if (hasGraphComparisonChanges(comparison)) {
        showGraphStaleModal(tab, tab.graphSnapshot, currentSnapshot, comparison);
        return true;
      }
    } catch (error) {
      console.warn("Failed to compare saved graph with the current folder:", error);
    }
    return false;
  }

  async function promptSavedGraphTabForCurrentFolder(tab) {
    if (!tab || tab.type !== "graph" || !isFileBackedGraphTab(tab)) return false;
    const graphDocumentType = tab.graphDocument?.documentType || inferLegacyGraphDocumentType(tab.graphSnapshot);
    return promptForStaleSavedGraphIfNeeded(tab, {
      force: true,
      legacyExport: !tab.graphDocument?.documentType && graphDocumentType === GRAPH_DOCUMENT_TYPE_EXPORT,
      includeExports: graphDocumentType === GRAPH_DOCUMENT_TYPE_EXPORT
    });
  }

  async function promptActiveSavedGraphForCurrentFolder() {
    const activeGraphTab = getActiveGraphTab();
    const graphTabs = [
      activeGraphTab,
      ...tabs.filter((tab) => tab && tab.type === "graph" && tab.id !== activeGraphTab?.id)
    ].filter(Boolean);

    for (const tab of graphTabs) {
      if (await promptSavedGraphTabForCurrentFolder(tab)) return true;
    }
    return false;
  }

  function keepSavedGraphFromStaleModal() {
    const staleComparison = activeGraphStaleComparison;
    const tab = tabs.find((candidate) => candidate.id === staleComparison?.tabId) || getActiveGraphTab();
    if (tab?.type === "graph") {
      tab.keepSavedGraphMode = true;
      tab.savedGraphComparisonDetails = staleComparison?.detailsModel || null;
      delete tab.graphComparisonSnapshot;
      delete tab.graphComparisonLayout;
      saveTabsToStorage(tabs);
      if (activeTabId === tab.id) {
        updateSavedGraphModePill(tab);
        showSavedGraphModeBanner(tab);
      }
    }
    hideGraphStaleModal();
  }

  async function updateGraphFromStaleModal() {
    const staleComparison = activeGraphStaleComparison;
    if (!staleComparison?.currentSnapshot) return;
    const tab = tabs.find((candidate) => candidate.id === staleComparison.tabId) || getActiveGraphTab();
    if (!tab || tab.type !== "graph") return;

    applyCurrentFolderSnapshotToSavedGraphTab(tab, staleComparison.currentSnapshot, {
      savedSnapshot: staleComparison.savedSnapshot,
      savedLayout: tab.graphLayout,
      savedConfig: tab.graphViewConfig
    });
    delete tab.graphComparisonSnapshot;
    delete tab.graphComparisonLayout;
    delete tab.savedGraphComparisonDetails;
    tab.keepSavedGraphMode = false;
    markGraphTabAsChanged(tab);
    saveTabsToStorage(tabs);
    hideGraphStaleModal();
    if (activeTabId === tab.id) {
      graphRenderCache.delete(tab.id);
      renderGraphView();
      showGraphUpdatedBanner();
    }
  }

  function loadGraphComparisonFromStaleModal() {
    const staleComparison = activeGraphStaleComparison;
    if (!staleComparison?.currentSnapshot || !staleComparison?.savedSnapshot) return;
    const tab = tabs.find((candidate) => candidate.id === staleComparison.tabId) || getActiveGraphTab();
    if (!tab || tab.type !== "graph") return;

    tab.graphComparisonSnapshot = buildCompareGraphSnapshot(
      staleComparison.savedSnapshot,
      staleComparison.currentSnapshot,
      staleComparison.comparison
    );
    tab.graphComparisonLayout = preserveGraphLayoutForCompareSnapshot(
      tab.graphLayout,
      staleComparison.savedSnapshot,
      tab.graphComparisonSnapshot
    );
    tab.savedGraphComparisonDetails = staleComparison.detailsModel || buildGraphComparisonDetailsModel(
      staleComparison.comparison,
      staleComparison.savedSnapshot,
      staleComparison.currentSnapshot
    );
    hideGraphStaleModal();
    if (activeTabId === tab.id) {
      graphRenderCache.delete(tab.id);
      renderGraphView();
    }
  }

  function shouldPreserveGraphSnapshotFullPath(snapshotFile) {
    return !!(snapshotFile?.fullPath && isNeutralinoRuntime());
  }

  function stripGraphSnapshotContent(snapshot, options = {}) {
    const strippedSnapshot = cloneGraphPersistenceValue(snapshot || null);
    if (!strippedSnapshot || typeof strippedSnapshot !== "object") return strippedSnapshot;
    const preserveFullPath = options.preserveFullPath !== false;

    strippedSnapshot.nodes = Array.isArray(strippedSnapshot.nodes) ? cloneGraphPersistenceValue(strippedSnapshot.nodes) : [];
    strippedSnapshot.links = Array.isArray(strippedSnapshot.links) ? cloneGraphPersistenceValue(strippedSnapshot.links) : [];
    strippedSnapshot.files = (Array.isArray(strippedSnapshot.files) ? strippedSnapshot.files : [])
      .map((snapshotFile) => {
        const source = snapshotFile && typeof snapshotFile === "object" ? snapshotFile : {};
        const strippedFile = {
          id: source.id || normalizeGraphNodeName(source.path || source.fullPath || source.name || ""),
          path: source.path || "",
          name: source.name || getFileName(source.path || source.fullPath || "document.md"),
          tags: normalizeFileTagList(source.tags || [])
        };
        if (preserveFullPath && shouldPreserveGraphSnapshotFullPath(source)) strippedFile.fullPath = source.fullPath;
        return strippedFile;
      });

    return strippedSnapshot;
  }

  function serializeGraphViewDocument(tab) {
    const graphDocument = serializeGraphTab(tab, { documentType: GRAPH_DOCUMENT_TYPE_VIEW });
    return normalizeGraphDocument({
      ...graphDocument,
      documentType: GRAPH_DOCUMENT_TYPE_VIEW,
      snapshot: stripGraphSnapshotContent(graphDocument.snapshot)
    });
  }

  function serializeGraphExportDocument(tab) {
    return serializeGraphTab(tab, { documentType: GRAPH_DOCUMENT_TYPE_EXPORT });
  }

  function getExplicitGraphDocumentType(source) {
    if (!source || typeof source !== "object") return "";
    if (Object.prototype.hasOwnProperty.call(source, "documentType")) {
      return typeof source.documentType === "string" ? source.documentType.trim() : "";
    }

    // Accept a document-level `type` alias for imported graph documents, but avoid
    // treating persisted application tab types such as `graph` as graph document types.
    const explicitTypeAlias = typeof source.type === "string" ? source.type.trim() : "";
    return GRAPH_DOCUMENT_TYPES.has(explicitTypeAlias) ? explicitTypeAlias : "";
  }

  function inferLegacyGraphDocumentType(snapshot) {
    // Legacy graph documents did not include a document type. Files with embedded
    // snapshot file content are full exports; files without embedded content are
    // view-only graph documents.
    return graphSnapshotHasEmbeddedFileContent(snapshot) ? GRAPH_DOCUMENT_TYPE_EXPORT : GRAPH_DOCUMENT_TYPE_VIEW;
  }

  function normalizeGraphDocumentType(source, snapshot) {
    const explicitDocumentType = getExplicitGraphDocumentType(source);
    if (GRAPH_DOCUMENT_TYPES.has(explicitDocumentType)) return explicitDocumentType;

    if (Object.prototype.hasOwnProperty.call(source, "documentType")) {
      throw new Error(`Unsupported graph document type: ${String(source.documentType || "(empty)")}.`);
    }

    const typeAlias = typeof source.type === "string" ? source.type.trim() : "";
    if (typeAlias && typeAlias !== "graph" && typeAlias !== "markdown" && looksLikeGraphDocument(source)) {
      throw new Error(`Unsupported graph document type: ${typeAlias}.`);
    }

    return inferLegacyGraphDocumentType(snapshot);
  }

  function getGraphDocumentKind(source, snapshot) {
    const explicitDocumentType = getExplicitGraphDocumentType(source);
    if (GRAPH_DOCUMENT_TYPES.has(explicitDocumentType)) {
      return { documentType: explicitDocumentType, isLegacy: false };
    }

    return { documentType: inferLegacyGraphDocumentType(snapshot), isLegacy: true };
  }

  function validateParsedGraphDocument(document) {
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      throw new Error("The selected JSON file is not a valid graph document.");
    }

    if (Object.prototype.hasOwnProperty.call(document, "documentType")) {
      const documentType = typeof document.documentType === "string" ? document.documentType.trim() : "";
      if (!GRAPH_DOCUMENT_TYPES.has(documentType)) {
        throw new Error(`Unsupported graph document type: ${String(document.documentType || "(empty)")}. Supported types are ${GRAPH_DOCUMENT_TYPE_EXPORT} and ${GRAPH_DOCUMENT_TYPE_VIEW}.`);
      }
    }

    const typeAlias = typeof document.type === "string" ? document.type.trim() : "";
    if (typeAlias && typeAlias !== "graph" && typeAlias !== "markdown" && !GRAPH_DOCUMENT_TYPES.has(typeAlias) && looksLikeGraphDocument(document)) {
      throw new Error(`Unsupported graph document type: ${typeAlias}. Supported types are ${GRAPH_DOCUMENT_TYPE_EXPORT} and ${GRAPH_DOCUMENT_TYPE_VIEW}.`);
    }

    if (!looksLikeGraphDocument(document)) {
      throw new Error("The selected JSON file is not an MD-Editor graph file.");
    }
  }

  function normalizeGraphDocument(document) {
    const source = document && typeof document === "object" ? document : {};
    const snapshot = normalizeGraphSnapshot(source.snapshot || source.graphSnapshot || null);
    const documentType = normalizeGraphDocumentType(source, snapshot);
    const hasViewConfig = Object.prototype.hasOwnProperty.call(source, "viewConfig");
    const viewConfig = normalizeGraphViewConfig(cloneGraphPersistenceValue(hasViewConfig ? source.viewConfig : (source.graphViewConfig || null)));
    const layoutSource = source.graphLayout !== undefined ? source.graphLayout : (
      source.graphLayoutData !== undefined ? source.graphLayoutData : (
        source.layout !== undefined ? source.layout : source.layoutData
      )
    );
    const createdAt = normalizeGraphTimestamp(source.createdAt || snapshot?.createdAt, Date.now());
    const normalized = {
      schemaVersion: source.schemaVersion || GRAPH_DOCUMENT_SCHEMA_VERSION,
      documentType,
      folderName: source.folderName || snapshot?.folderName || source.title || "Graph View",
      createdAt,
      updatedAt: normalizeGraphTimestamp(source.updatedAt, createdAt),
      snapshot,
      viewConfig
    };

    if (layoutSource !== undefined && layoutSource !== null) {
      normalized.graphLayout = cloneGraphPersistenceValue(layoutSource);
    }

    return normalized;
  }

  function serializeGraphTab(tab, options) {
    const existingDocument = tab?.graphDocument && typeof tab.graphDocument === "object" ? tab.graphDocument : {};
    return normalizeGraphDocument({
      ...existingDocument,
      documentType: options?.documentType || existingDocument.documentType,
      folderName: tab?.folderName || tab?.title || existingDocument.folderName || "Graph View",
      createdAt: existingDocument.createdAt || tab?.createdAt,
      updatedAt: Date.now(),
      snapshot: tab?.graphSnapshot !== undefined ? tab.graphSnapshot : existingDocument.snapshot,
      viewConfig: tab?.graphViewConfig !== undefined ? tab.graphViewConfig : existingDocument.viewConfig,
      graphLayout: tab?.graphLayout !== undefined ? tab.graphLayout : (existingDocument.graphLayout !== undefined ? existingDocument.graphLayout : existingDocument.layout)
    });
  }

  function deserializeGraphDocument(document) {
    const normalizedDocument = normalizeGraphDocument(document);
    const graphData = {
      folderName: normalizedDocument.folderName,
      graphSnapshot: normalizedDocument.snapshot,
      graphViewConfig: normalizedDocument.viewConfig,
      graphDocument: normalizedDocument
    };

    if (Object.prototype.hasOwnProperty.call(normalizedDocument, "graphLayout")) {
      graphData.graphLayout = normalizedDocument.graphLayout;
    }

    return graphData;
  }

  function syncGraphTabDocument(tab) {
    if (!tab || tab.type !== "graph") return tab;
    const graphDocument = serializeGraphTab(tab);
    tab.folderName = graphDocument.folderName;
    tab.graphSnapshot = graphDocument.snapshot;
    tab.graphViewConfig = graphDocument.viewConfig;
    tab.graphDocument = graphDocument;
    if (Object.prototype.hasOwnProperty.call(graphDocument, "graphLayout")) tab.graphLayout = graphDocument.graphLayout;
    return tab;
  }

  function getActiveGraphTab() {
    return tabs.find((tab) => tab.id === activeTabId && tab.type === "graph") || null;
  }

  function getSuggestedGraphFileName(tab) {
    const rawName = (tab?.folderName || tab?.title || "graph-view").trim() || "graph-view";
    const safeName = rawName.replace(/[\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "graph-view";
    return /\.mdviewer-graph\.json$/i.test(safeName) ? safeName : `${safeName}.mdviewer-graph.json`;
  }

  function isFileBackedGraphTab(tab) {
    return !!(tab && tab.type === "graph" && (tab.sourceFileHandle || tab.sourceFilePath || tab.sourceFileName));
  }

  function markGraphTabAsChanged(tab) {
    if (!isFileBackedGraphTab(tab)) return;
    tab.graphHasUnsavedChanges = true;
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();
  }

  function clearGraphTabUnsavedChanges(tab) {
    if (!tab || tab.type !== "graph") return;
    tab.graphHasUnsavedChanges = false;
  }

  function getGraphContentHash(content) {
    const source = String(content || "");
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function getGraphFileSignature(files) {
    return (files || []).map((fileEntry) => {
      const file = fileEntry.file || fileEntry;
      const content = typeof fileEntry.content === "string" ? fileEntry.content : "";
      return {
        path: fileEntry.path || fileEntry.fullPath || file?.webkitRelativePath || file?.name || "",
        name: file?.name || "",
        size: fileEntry.size || file?.size || 0,
        lastModified: fileEntry.modifiedAt || file?.lastModified || 0,
        contentLength: content.length,
        contentHash: content ? getGraphContentHash(content) : ""
      };
    });
  }

  function getGraphViewSignature(files, graphViewConfig) {
    return JSON.stringify({
      files: getGraphFileSignature(files),
      config: graphViewConfig || null
    });
  }

  function isGraphPerfLoggingEnabled() {
    return global.MD_VIEWER_PERF === true || global.localStorage?.getItem("MD_VIEWER_PERF") === "1";
  }

  function logGraphPerf(label, startTime, details = {}) {
    if (!isGraphPerfLoggingEnabled() || typeof performance === "undefined") return;
    const duration = Math.round((performance.now() - startTime) * 10) / 10;
    console.info(`[Perf] ${label}: ${duration}ms`, details);
  }

  function createGraphPerfSession(label, details = {}) {
    if (!isGraphPerfLoggingEnabled() || typeof performance === "undefined") {
      return null;
    }
    const startTime = performance.now();
    let lastMarkTime = startTime;
    let ended = false;
    const marks = [];
    const roundMs = (value) => Math.round(value * 10) / 10;
    return {
      get marks() {
        return marks;
      },
      mark(name, markDetails = {}) {
        if (ended) return;
        const now = performance.now();
        marks.push({
          step: name,
          totalMs: roundMs(now - startTime),
          deltaMs: roundMs(now - lastMarkTime),
          ...markDetails
        });
        lastMarkTime = now;
      },
      end(endDetails = {}) {
        if (ended) return;
        ended = true;
        const durationMs = roundMs(performance.now() - startTime);
        const summary = { ...details, ...endDetails, durationMs };
        if (typeof console.groupCollapsed === "function") {
          console.groupCollapsed(`[Perf] ${label}: ${durationMs}ms`, summary);
          if (marks.length && typeof console.table === "function") console.table(marks);
          else marks.forEach((mark) => console.info("[Perf]", mark.step, mark));
          console.info("[Perf] summary", summary);
          console.groupEnd();
        } else {
          console.info(`[Perf] ${label}: ${durationMs}ms`, summary, marks);
        }
      }
    };
  }

  function getGraphFileCacheKey(fileEntry, path) {
    const stablePath = fileEntry.fullPath || path || fileEntry.path || fileEntry.file?.webkitRelativePath || fileEntry.file?.name || "";
    if (!stablePath) return "";
    const size = Number(fileEntry.size ?? fileEntry.file?.size ?? 0) || 0;
    const modifiedAt = Number(fileEntry.modifiedAt ?? fileEntry.file?.lastModified ?? 0) || 0;
    const content = typeof fileEntry.content === "string" ? fileEntry.content : "";
    const contentHash = content ? `${content.length}:${getGraphContentHash(content)}` : "";
    return `${stablePath}|${size}|${modifiedAt}|${contentHash}`;
  }

  function getGraphSnapshotCacheKey(files, folderName) {
    return JSON.stringify({
      folderName: folderName || "Graph View",
      files: getGraphFileSignature(files)
    });
  }

  function rememberGraphSnapshot(cacheKey, snapshot) {
    if (!cacheKey || !snapshot) return;
    graphSnapshotCache.delete(cacheKey);
    graphSnapshotCache.set(cacheKey, cloneGraphPersistenceValue(snapshot));
    while (graphSnapshotCache.size > GRAPH_SNAPSHOT_CACHE_LIMIT) {
      const oldestKey = graphSnapshotCache.keys().next().value;
      graphSnapshotCache.delete(oldestKey);
    }
  }

  async function mapGraphFilesWithConcurrency(files, worker, options = {}) {
    const sourceFiles = files || [];
    const results = new Array(sourceFiles.length);
    let nextIndex = 0;
    let completed = 0;
    const defaultConcurrency = isNeutralinoRuntime && sourceFiles.some((fileEntry) => fileEntry?.fullPath)
      ? Math.max(GRAPH_SNAPSHOT_READ_CONCURRENCY, 128)
      : GRAPH_SNAPSHOT_READ_CONCURRENCY;
    const concurrency = Math.max(1, Math.min(Number(options.concurrency) || defaultConcurrency, sourceFiles.length || 1));

    async function runWorker() {
      while (nextIndex < sourceFiles.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(sourceFiles[index], index);
        completed += 1;
        if (typeof options.onProgress === "function") {
          options.onProgress({ phase: "reading", completed, total: sourceFiles.length });
        }
        if (completed % 100 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    await Promise.all(Array.from({ length: concurrency }, runWorker));
    return results;
  }

  async function createGraphSnapshot(files, folderName, options = {}) {
    const snapshotStart = typeof performance !== "undefined" ? performance.now() : 0;
    const snapshotCacheKey = options.skipSnapshotCache ? "" : getGraphSnapshotCacheKey(files, folderName);
    const cachedSnapshot = snapshotCacheKey ? graphSnapshotCache.get(snapshotCacheKey) : null;
    if (cachedSnapshot) {
      logGraphPerf("graph snapshot cache hit", snapshotStart, { files: (files || []).length });
      return cloneGraphPersistenceValue(cachedSnapshot);
    }
    const nodes = [];
    const links = [];
    const seenEdges = new Set();
    const nodeIndex = new Map();
    let snapshotFiles = [];
    let graphFileReadDuration = 0;
    let graphFileParseDuration = 0;
    let graphFileCacheHits = 0;

    const sourceFiles = files || [];
    const readStart = typeof performance !== "undefined" ? performance.now() : 0;
    snapshotFiles = await mapGraphFilesWithConcurrency(sourceFiles, async (fileEntry) => {
      const path = fileEntry.path || fileEntry.file?.webkitRelativePath || fileEntry.file?.name || "";
      const name = getFileName(path || fileEntry.file?.name || "document.md");
      const cacheKey = getGraphFileCacheKey(fileEntry, path);
      let parsedFile = cacheKey ? graphParsedFileCache.get(cacheKey) : null;
      if (!parsedFile) {
        let content = "";
        try {
          const fileReadStart = typeof performance !== "undefined" ? performance.now() : 0;
          content = await readFolderMarkdownFileContent(fileEntry);
          if (typeof performance !== "undefined") graphFileReadDuration += performance.now() - fileReadStart;
        } catch (error) {
          console.warn("Failed to read graph file:", path, error);
        }
        const fileContent = content || "";
        const fileParseStart = typeof performance !== "undefined" ? performance.now() : 0;
        parsedFile = {
          content: fileContent,
          tags: getFileTagsFromContent(fileContent),
          markdownLinks: extractMarkdownLinks(fileContent)
        };
        if (typeof performance !== "undefined") graphFileParseDuration += performance.now() - fileParseStart;
        if (cacheKey) graphParsedFileCache.set(cacheKey, parsedFile);
      } else {
        graphFileCacheHits += 1;
      }
      const id = normalizeGraphNodeName(path);
      return {
        id,
        path,
        name,
        content: parsedFile.content,
        fullPath: fileEntry.fullPath || null,
        status: "current",
        tags: (parsedFile.tags || []).slice(),
        markdownLinks: (parsedFile.markdownLinks || []).slice()
      };
    }, options);
    logGraphPerf("graph snapshot file reads", readStart, {
      files: sourceFiles.length,
      cacheHits: graphFileCacheHits,
      diskReadMs: Math.round(graphFileReadDuration * 10) / 10,
      parseMs: Math.round(graphFileParseDuration * 10) / 10
    });

    const fileNodeStart = typeof performance !== "undefined" ? performance.now() : 0;
    snapshotFiles.forEach((snapshotFile) => {
      nodeIndex.set(snapshotFile.id, snapshotFile.path);
      nodes.push({
        id: snapshotFile.id,
        label: getGraphDisplayLabel(snapshotFile.path),
        fullPath: snapshotFile.path,
        type: "file",
        status: "current",
        tags: snapshotFile.tags
      });
    });
    logGraphPerf("graph snapshot file node build", fileNodeStart, { files: snapshotFiles.length, nodes: nodes.length });
    const graphTargetLookup = typeof createGraphTargetLookup === "function" ? createGraphTargetLookup(nodeIndex) : nodeIndex;

    const tagIndex = new Map();

    const tagRelationStart = typeof performance !== "undefined" ? performance.now() : 0;
    for (let index = 0; index < snapshotFiles.length; index += 1) {
      if (index > 0 && index % 1000 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      const snapshotFile = snapshotFiles[index];
      const source = snapshotFile.id;
      (snapshotFile.tags || []).forEach((tag) => {
        const normalizedTag = normalizeTagName(tag);
        if (!normalizedTag) return;
        const tagNodeId = `tag:${normalizedTag}`;
        if (!tagIndex.has(tagNodeId)) {
          tagIndex.set(tagNodeId, normalizedTag);
          nodes.push({
            id: tagNodeId,
            label: `#${normalizedTag}`,
            type: "tag",
            status: "current",
            tag: normalizedTag
          });
        }
        const edgeKey = `${source}->${tagNodeId}:tag`;
        if (seenEdges.has(edgeKey)) return;
        seenEdges.add(edgeKey);
        links.push({ source, target: tagNodeId, type: "tag", status: "current" });
      });
    }
    logGraphPerf("graph snapshot tag relation build", tagRelationStart, { tags: tagIndex.size, links: links.length });

    const linkRelationStart = typeof performance !== "undefined" ? performance.now() : 0;
    for (let index = 0; index < snapshotFiles.length; index += 1) {
      if (index > 0 && index % 1000 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      const snapshotFile = snapshotFiles[index];
      const source = snapshotFile.id;
      (snapshotFile.markdownLinks || extractMarkdownLinks(snapshotFile.content)).forEach((ref) => {
        const target = resolveGraphTargetId(ref, snapshotFile.path, graphTargetLookup);
        if (!target || target === source) return;
        const edgeKey = `${source}->${target}:link`;
        if (seenEdges.has(edgeKey)) return;
        seenEdges.add(edgeKey);
        links.push({ source, target, type: "link", status: "current" });
      });
    }
    logGraphPerf("graph snapshot markdown link resolution", linkRelationStart, { files: snapshotFiles.length, links: links.length });

    const snapshot = {
      version: 1,
      folderName: folderName || "Graph View",
      createdAt: Date.now(),
      nodes,
      links,
      files: snapshotFiles.map(({ markdownLinks, ...snapshotFile }) => snapshotFile)
    };
    rememberGraphSnapshot(snapshotCacheKey, snapshot);
    logGraphPerf("graph snapshot total", snapshotStart, { files: sourceFiles.length, nodes: nodes.length, links: links.length });
    return snapshot;
  }

  function getGraphSnapshotSignature(snapshot, graphViewConfig) {
    return JSON.stringify({
      renderer: "d3",
      snapshot: {
        version: snapshot?.version || 0,
        folderName: snapshot?.folderName || "",
        createdAt: snapshot?.createdAt || 0,
        nodes: (snapshot?.nodes || []).map((node) => `${node.id}:${node.status || "current"}`),
        links: (snapshot?.links || []).map((link) => `${link.source}->${link.target}:${link.type || "link"}:${link.status || "current"}`)
      },
      config: graphViewConfig || null
    });
  }

  function toFiniteNumber(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function formatGraphZoomPercent(zoomScale) {
    const scale = Number.isFinite(Number(zoomScale)) && Number(zoomScale) > 0 ? Number(zoomScale) : 1;
    return `${Math.round(scale * 100)}%`;
  }

  function getGraphZoomScaleFromLayout(graphLayout) {
    return getSavedGraphZoomTransform(graphLayout)?.k || 1;
  }

  function getSavedGraphNodeLayout(graphLayout, nodeId) {
    if (!graphLayout || !nodeId) return null;
    if (graphLayout.nodes && typeof graphLayout.nodes === "object") return graphLayout.nodes[nodeId] || null;
    if (Array.isArray(graphLayout.nodePositions)) {
      return graphLayout.nodePositions.find((entry) => entry && entry.id === nodeId) || null;
    }
    return null;
  }

  function applySavedGraphLayout(nodes, graphLayout) {
    (nodes || []).forEach((node) => {
      const savedNode = getSavedGraphNodeLayout(graphLayout, node.id);
      if (!savedNode) return;
      const x = toFiniteNumber(savedNode.x);
      const y = toFiniteNumber(savedNode.y);
      const fx = toFiniteNumber(savedNode.fx);
      const fy = toFiniteNumber(savedNode.fy);
      if (x !== null) node.x = x;
      if (y !== null) node.y = y;
      if (fx !== null) node.fx = fx;
      if (fy !== null) node.fy = fy;
    });
  }

  function getSavedGraphZoomTransform(graphLayout) {
    const zoom = graphLayout?.zoom || graphLayout?.transform || null;
    if (!zoom) return null;
    const x = toFiniteNumber(zoom.x);
    const y = toFiniteNumber(zoom.y);
    const k = toFiniteNumber(zoom.k ?? zoom.scale);
    if (x === null || y === null || k === null || k <= 0) return null;
    return { x, y, k };
  }

  function captureGraphLayout(tab, nodes, zoomTransform, options) {
    if (!tab || tab.type !== "graph") return null;
    const storePinnedPositions = !!options?.storePinnedPositions;
    const isCompareMode = !!tab.graphComparisonSnapshot;
    const layoutSource = isCompareMode ? (tab.graphComparisonLayout || tab.graphLayout) : tab.graphLayout;
    const existingLayout = layoutSource && typeof layoutSource === "object" ? layoutSource : {};
    const existingNodes = existingLayout.nodes && typeof existingLayout.nodes === "object" ? existingLayout.nodes : {};
    const nextNodes = { ...existingNodes };

    (nodes || []).forEach((node) => {
      if (!node?.id) return;
      const x = toFiniteNumber(node.x);
      const y = toFiniteNumber(node.y);
      const fx = toFiniteNumber(node.fx);
      const fy = toFiniteNumber(node.fy);
      const entry = {};
      if (x !== null) entry.x = x;
      if (y !== null) entry.y = y;
      if (storePinnedPositions && fx !== null) entry.fx = fx;
      if (storePinnedPositions && fy !== null) entry.fy = fy;
      if (Object.keys(entry).length) nextNodes[node.id] = entry;
    });

    const zoom = zoomTransform ? { x: zoomTransform.x, y: zoomTransform.y, k: zoomTransform.k } : getSavedGraphZoomTransform(existingLayout);
    const nextLayout = {
      ...existingLayout,
      magneticEnabled: graphSettings.magneticEnabled,
      nodes: nextNodes,
      updatedAt: Date.now()
    };
    if (zoom) nextLayout.zoom = zoom;

    if (isCompareMode) {
      tab.graphComparisonLayout = nextLayout;
      return nextLayout;
    }

    tab.graphLayout = nextLayout;
    if (tab.graphDocument && typeof tab.graphDocument === "object") {
      tab.graphDocument.graphLayout = nextLayout;
      tab.graphDocument.updatedAt = Date.now();
    }
    return nextLayout;
  }

  function getGraphRenderWrappersForTab(tabId) {
    if (!graphViewCanvas || !tabId) return [];
    return Array.from(graphViewCanvas.querySelectorAll(".graph-tab-render"))
      .filter((wrapper) => wrapper.dataset.graphTabId === String(tabId));
  }

  function removeGraphRenderForTab(tabId) {
    if (!tabId) return;
    const entry = graphRenderCache.get(tabId);
    if (typeof entry?.destroy === "function") entry.destroy();
    else {
      if (entry?.simulation) entry.simulation.stop();
      if (entry?.wrapper) entry.wrapper.remove();
    }
    graphRenderCache.delete(tabId);
    getGraphRenderWrappersForTab(tabId).forEach((wrapper) => wrapper.remove());
    document.querySelectorAll(`.graph-quick-action[data-graph-tab-id="${CSS.escape(String(tabId))}"]`).forEach((node) => node.remove());
  }

  function hideInactiveGraphRenders(activeGraphTabId) {
    graphRenderCache.forEach((entry, tabId) => {
      if (!entry || !entry.wrapper) return;
      entry.wrapper.classList.toggle("hidden", tabId !== activeGraphTabId);
    });
  }

  function suspendGraphRender(tabId) {
    const entry = graphRenderCache.get(tabId);
    if (typeof entry?.suspend === "function") entry.suspend();
    else if (entry && entry.simulation) entry.simulation.stop();
  }

  function suspendActiveGraphRender() {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (activeTab && activeTab.type === "graph") suspendGraphRender(activeTab.id);
  }

  function loadTabsFromStorage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function getPersistableTab(tab) {
    if (!tab || tab.type !== "graph") return tab;
    const persistedTab = { ...tab };
    if (persistedTab.graphSnapshot) persistedTab.graphSnapshot = stripGraphSnapshotContent(persistedTab.graphSnapshot, { preserveFullPath: false });
    if (persistedTab.graphComparisonSnapshot) persistedTab.graphComparisonSnapshot = stripGraphSnapshotContent(persistedTab.graphComparisonSnapshot, { preserveFullPath: false });
    if (persistedTab.graphDocument && typeof persistedTab.graphDocument === "object") {
      persistedTab.graphDocument = {
        ...persistedTab.graphDocument,
        snapshot: stripGraphSnapshotContent(persistedTab.graphDocument.snapshot || persistedTab.graphSnapshot, { preserveFullPath: false })
      };
    }
    return persistedTab;
  }

  function getCompactPersistableTab(tab) {
    if (!tab || tab.type !== "graph") return tab;
    const persistedTab = getPersistableTab(tab);
    delete persistedTab.graphSnapshot;
    delete persistedTab.graphComparisonSnapshot;
    if (persistedTab.graphDocument && typeof persistedTab.graphDocument === "object") {
      persistedTab.graphDocument = {
        ...persistedTab.graphDocument,
        snapshot: null
      };
    }
    delete persistedTab.graphLayout;
    delete persistedTab.graphComparisonLayout;
    return persistedTab;
  }

  function saveTabsToStorage(tabsArr) {
    try {
      (tabsArr || []).forEach((tab) => syncGraphTabDocument(tab));
      const persistableTabs = (tabsArr || []).map(graphTabStorageCompactMode ? getCompactPersistableTab : getPersistableTab);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableTabs));
    } catch (e) {
      if (e?.name === "QuotaExceededError") {
        try {
          graphTabStorageCompactMode = true;
          localStorage.setItem(STORAGE_KEY, JSON.stringify((tabsArr || []).map(getCompactPersistableTab)));
          return;
        } catch (compactError) {
          console.warn('Failed to save compact tabs to localStorage:', compactError);
        }
      } else {
        console.warn('Failed to save tabs to localStorage:', e);
      }
    }
  }

  function scheduleGraphLayoutStorageSave() {
    clearTimeout(graphLayoutSaveTimeout);
    graphLayoutSaveTimeout = setTimeout(() => {
      graphLayoutSaveTimeout = null;
      saveTabsToStorage(tabs);
    }, 750);
  }

  function loadActiveTabId() {
    return localStorage.getItem(ACTIVE_TAB_KEY);
  }

  function saveActiveTabId(id) {
    if (id) localStorage.setItem(ACTIVE_TAB_KEY, id);
    else localStorage.removeItem(ACTIVE_TAB_KEY);
  }

    Object.assign(api, {
      normalizeGraphTagNodeId,
      normalizeGraphTagNodeIds,
      clampGraphNumber,
      createGraphGroupId,
      normalizeGraphGroupColor,
      getGraphColorInputValue,
      getNextDefaultGraphGroupColor,
      normalizeGraphGroups,
      normalizeGraphViewConfig,
      cloneGraphPersistenceValue,
      normalizeGraphTimestamp,
      normalizeGraphSnapshot,
      graphSnapshotHasEmbeddedFileContent,
      getGraphFileKey,
      getGraphLinkEndpointKey,
      getGraphLinkKey,
      getGraphSnapshotFilesForComparison,
      getGraphSnapshotLinksForComparison,
      getGraphTagRelationKeys,
      compareGraphCollections,
      compareGraphViewToCurrentFolder,
      hasGraphComparisonChanges,
      buildCompareGraphSnapshot,
      isKeepSavedGraphMode,
      getGraphNodeNormalizedPath,
      getGraphSnapshotNodeIds,
      getGraphLayoutEntryByNormalizedPath,
      getGraphLayoutEntryForSnapshotNode,
      shouldPreserveGraphZoomTransform,
      preserveGraphLayoutForCurrentSnapshot,
      preserveGraphLayoutForCompareSnapshot,
      preserveGraphConfigForCurrentSnapshot,
      applyCurrentFolderSnapshotToSavedGraphTab,
      showGraphUpdatedBanner,
      showSavedGraphModeBanner,
      showGraphBanner,
      ensureSavedGraphModePill,
      updateSavedGraphModePill,
      getGraphComparisonSummaryCounts,
      getGraphFileDifferenceLabel,
      createGraphComparisonLabelLookup,
      getGraphComparisonEndpointLabel,
      getGraphLinkDifferenceLabel,
      getGraphTagRelationDifferenceLabel,
      createGraphComparisonSection,
      buildGraphComparisonDetailsModel,
      renderGraphComparisonDetailsModel,
      openGraphComparisonDetailsModal,
      closeGraphComparisonDetailsModal,
      openGraphStaleComparisonDetailsModal,
      hideGraphStaleModal,
      showGraphStaleModal,
      promptForStaleSavedGraphIfNeeded,
      promptActiveSavedGraphForCurrentFolder,
      keepSavedGraphFromStaleModal,
      updateGraphFromStaleModal,
      loadGraphComparisonFromStaleModal,
      shouldPreserveGraphSnapshotFullPath,
      stripGraphSnapshotContent,
      serializeGraphViewDocument,
      serializeGraphExportDocument,
      getExplicitGraphDocumentType,
      inferLegacyGraphDocumentType,
      normalizeGraphDocumentType,
      getGraphDocumentKind,
      validateParsedGraphDocument,
      normalizeGraphDocument,
      serializeGraphTab,
      deserializeGraphDocument,
      syncGraphTabDocument,
      getActiveGraphTab,
      getSuggestedGraphFileName,
      isFileBackedGraphTab,
      markGraphTabAsChanged,
      clearGraphTabUnsavedChanges,
      getGraphFileSignature,
      getGraphViewSignature,
      isGraphPerfLoggingEnabled,
      logGraphPerf,
      createGraphPerfSession,
      createGraphSnapshot,
      getGraphSnapshotSignature,
      toFiniteNumber,
      formatGraphZoomPercent,
      getGraphZoomScaleFromLayout,
      getSavedGraphNodeLayout,
      applySavedGraphLayout,
      getSavedGraphZoomTransform,
      captureGraphLayout,
      getGraphRenderWrappersForTab,
      removeGraphRenderForTab,
      hideInactiveGraphRenders,
      suspendGraphRender,
      suspendActiveGraphRender,
      loadTabsFromStorage,
      saveTabsToStorage,
      scheduleGraphLayoutStorageSave,
      loadActiveTabId,
      saveActiveTabId,
    });
    }

    app.services.graphPersistence = api;
    app.registerModule("graphPersistence", api);
    return api;
  };
})(window);
