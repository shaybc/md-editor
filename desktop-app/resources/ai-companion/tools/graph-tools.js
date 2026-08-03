/**
 * Agent-facing graph tools backed by the live editor graph snapshot.
 */

"use strict";

const GRAPH_READ_TOOL_NAMES = Object.freeze([
  "graph_get_state",
  "graph_search_nodes",
  "graph_get_node_context",
  "graph_find_paths"
]);

const GRAPH_ACTION_TOOL_NAMES = Object.freeze([
  "graph_apply_filter",
  "graph_focus_nodes",
  "graph_show_local",
  "graph_clear_focus"
]);

const GRAPH_TOOL_NAMES = Object.freeze([...GRAPH_READ_TOOL_NAMES, ...GRAPH_ACTION_TOOL_NAMES]);
const DEFAULT_MAX_RESULTS = 20;

function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("AI Companion request cancelled.");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function normalizeComparable(value) {
  return normalizePath(value).replace(/^\/+/, "").replace(/\.(md|markdown)$/i, "").toLowerCase();
}

function normalizeNodeId(value) {
  return String(value || "").trim();
}

function getReadContext(options = {}) {
  return asObject(options.editorReadContext);
}

function getGraphTabs(context) {
  return asArray(context.graphTabs);
}

function getLinkEndpointId(value) {
  return normalizeNodeId(value?.id || value);
}

function createGraphTabSummary(tab = {}) {
  const config = asObject(tab.graphViewConfig);
  const groups = asArray(config.groups);
  return {
    id: String(tab.id || ""),
    title: String(tab.title || "Graph View"),
    path: normalizePath(tab.path || ""),
    active: tab.active === true,
    nodeCount: Number(tab.nodeCount || asArray(tab.nodes).length || 0),
    linkCount: Number(tab.linkCount || asArray(tab.links).length || 0),
    fileCount: Number(tab.fileCount || asArray(tab.files).length || 0),
    zoomScale: Number.isFinite(Number(tab.zoomScale)) ? Number(tab.zoomScale) : undefined,
    viewConfig: {
      mode: String(config.mode || "global"),
      focusNodeId: String(config.focusNodeId || ""),
      searchQuery: String(config.searchQuery || ""),
      selectedTagIds: asArray(config.selectedTagIds).map(String),
      showTags: config.showTags === true,
      showOrphans: config.showOrphans !== false,
      showLabels: config.showLabels !== false,
      showExternalJars: config.showExternalJars !== false,
      showMissingDependencies: config.showMissingDependencies !== false,
      groups: groups.map((group) => ({
        id: String(group?.id || ""),
        query: String(group?.query || ""),
        enabled: group?.enabled !== false,
        hidden: group?.hidden === true,
        color: String(group?.color || "")
      }))
    }
  };
}

function findGraphTab(context, args = {}) {
  const tabs = getGraphTabs(context);
  const tabId = String(args.tabId || "").trim();
  if (tabId) return tabs.find((tab) => String(tab?.id || "") === tabId) || null;
  const activeGraphTabId = String(context.activeGraphTabId || context.workspace?.activeGraphTabId || "").trim();
  if (activeGraphTabId) return tabs.find((tab) => String(tab?.id || "") === activeGraphTabId) || null;
  const activeTabId = String(context.workspace?.activeTab?.id || "").trim();
  if (activeTabId) return tabs.find((tab) => String(tab?.id || "") === activeTabId) || null;
  return tabs[0] || null;
}

function createGraphModel(tab = {}) {
  const nodes = asArray(tab.nodes).map((node) => ({
    ...asObject(node),
    id: normalizeNodeId(node?.id),
    label: String(node?.label || node?.name || node?.title || node?.id || ""),
    type: String(node?.type || node?.kind || "file"),
    path: normalizePath(node?.path || node?.fullPath || "")
  })).filter((node) => node.id);
  const files = asArray(tab.files).map((file) => ({
    ...asObject(file),
    id: normalizeNodeId(file?.id),
    name: String(file?.name || file?.title || ""),
    path: normalizePath(file?.path || file?.fullPath || ""),
    tags: asArray(file?.tags).map(String)
  })).filter((file) => file.id || file.path || file.name);
  const links = asArray(tab.links).map((link) => ({
    ...asObject(link),
    source: getLinkEndpointId(link?.source),
    target: getLinkEndpointId(link?.target),
    type: String(link?.type || "link")
  })).filter((link) => link.source && link.target);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const fileById = new Map(files.map((file) => [file.id, file]).filter(([id]) => id));
  const outgoing = new Map();
  const incoming = new Map();
  for (const link of links) {
    if (!outgoing.has(link.source)) outgoing.set(link.source, []);
    if (!incoming.has(link.target)) incoming.set(link.target, []);
    outgoing.get(link.source).push(link);
    incoming.get(link.target).push(link);
  }
  return { files, fileById, incoming, links, nodeById, nodes, outgoing, tab };
}

function getNodeFile(model, node = {}) {
  const byId = model.fileById.get(node.id);
  if (byId) return byId;
  const target = normalizeComparable(node.path || node.id || node.label);
  return model.files.find((file) => {
    const candidates = [file.id, file.path, file.name].map(normalizeComparable);
    return candidates.includes(target);
  }) || null;
}

function getNodeSearchText(model, node = {}) {
  const file = getNodeFile(model, node);
  return [
    node.id,
    node.label,
    node.type,
    node.path,
    file?.id,
    file?.name,
    file?.path,
    ...asArray(file?.tags)
  ].filter(Boolean).join(" ").toLowerCase();
}

function getNodeDegree(model, nodeId) {
  const outgoingLinks = model.outgoing.get(nodeId) || [];
  const incomingLinks = model.incoming.get(nodeId) || [];
  const neighborIds = new Set();
  outgoingLinks.forEach((link) => neighborIds.add(link.target));
  incomingLinks.forEach((link) => neighborIds.add(link.source));
  return {
    incoming: incomingLinks.length,
    outgoing: outgoingLinks.length,
    total: incomingLinks.length + outgoingLinks.length,
    neighbors: neighborIds.size
  };
}

function createNodeResult(model, node = {}) {
  const file = getNodeFile(model, node);
  return {
    nodeId: node.id,
    label: node.label,
    path: normalizePath(node.path || file?.path || ""),
    type: node.type || "file",
    file: file ? {
      id: file.id,
      name: file.name,
      path: file.path,
      tags: file.tags
    } : null,
    degree: getNodeDegree(model, node.id)
  };
}

function searchNodesInModel(model, args = {}) {
  const query = String(args.query || "").trim().toLowerCase();
  const type = String(args.type || "").trim().toLowerCase();
  const maxResults = clampInteger(args.maxResults, DEFAULT_MAX_RESULTS, 1, 200);
  return model.nodes
    .filter((node) => !type || String(node.type || "file").toLowerCase() === type)
    .filter((node) => !query || getNodeSearchText(model, node).includes(query))
    .map((node) => createNodeResult(model, node))
    .slice(0, maxResults);
}

function resolveNode(model, args = {}) {
  const nodeId = normalizeNodeId(args.nodeId || args.id || args.from || args.to);
  if (nodeId && model.nodeById.has(nodeId)) return model.nodeById.get(nodeId);
  const targetPath = normalizeComparable(args.path || "");
  if (targetPath) {
    const pathMatch = model.nodes.find((node) => {
      const file = getNodeFile(model, node);
      return [node.id, node.path, file?.path, file?.name].map(normalizeComparable).includes(targetPath);
    });
    if (pathMatch) return pathMatch;
  }
  const query = String(args.query || "").trim();
  if (query) return searchNodesInModel(model, { query, maxResults: 1 })[0] ? model.nodeById.get(searchNodesInModel(model, { query, maxResults: 1 })[0].nodeId) : null;
  return null;
}

function getDirectNeighborResults(model, nodeId, direction) {
  const sourceLinks = direction === "incoming" ? (model.incoming.get(nodeId) || []) : (model.outgoing.get(nodeId) || []);
  return sourceLinks.map((link) => {
    const targetNodeId = direction === "incoming" ? link.source : link.target;
    const node = model.nodeById.get(targetNodeId);
    return node ? { link, node: createNodeResult(model, node) } : null;
  }).filter(Boolean);
}

function collectLocalGraph(model, seedNodeId, depth) {
  const maxDepth = clampInteger(depth, 1, 1, 4);
  const visited = new Set([seedNodeId]);
  const queue = [{ nodeId: seedNodeId, depth: 0 }];
  const localLinks = [];
  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= maxDepth) continue;
    const connected = [...(model.outgoing.get(current.nodeId) || []), ...(model.incoming.get(current.nodeId) || [])];
    for (const link of connected) {
      localLinks.push(link);
      const nextNodeId = link.source === current.nodeId ? link.target : link.source;
      if (!nextNodeId || visited.has(nextNodeId)) continue;
      visited.add(nextNodeId);
      queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
    }
  }
  return {
    nodes: Array.from(visited).map((id) => model.nodeById.get(id)).filter(Boolean).map((node) => createNodeResult(model, node)),
    links: localLinks.filter((link, index) => localLinks.findIndex((candidate) => candidate.source === link.source && candidate.target === link.target && candidate.type === link.type) === index)
  };
}

/**
 * Read the active or requested graph tab state.
 * @param {string} _root - Workspace root passed by the tool loop.
 * @param {object} args - Tool arguments selecting a graph tab.
 * @param {object} options - Tool options carrying editorReadContext.
 * @returns {object} Graph state summary.
 */
async function graphGetState(_root, args = {}, options = {}) {
  throwIfAborted(options.signal);
  const context = getReadContext(options);
  const tab = findGraphTab(context, args);
  return {
    activeGraphTabId: String(context.activeGraphTabId || context.workspace?.activeGraphTabId || ""),
    graphTabs: getGraphTabs(context).map(createGraphTabSummary),
    graph: tab ? createGraphTabSummary(tab) : null
  };
}

/**
 * Search graph nodes by label, id, path, type, file name, or tag.
 * @param {string} _root - Workspace root passed by the tool loop.
 * @param {object} args - Tool arguments with query and optional type filter.
 * @param {object} options - Tool options carrying editorReadContext.
 * @returns {object} Matching graph nodes.
 */
async function graphSearchNodes(_root, args = {}, options = {}) {
  throwIfAborted(options.signal);
  const tab = findGraphTab(getReadContext(options), args);
  if (!tab) return { graph: null, results: [], totalResults: 0 };
  const model = createGraphModel(tab);
  const results = searchNodesInModel(model, args);
  return { graph: createGraphTabSummary(tab), results, totalResults: results.length };
}

/**
 * Return incoming, outgoing, and local graph context for one node.
 * @param {string} _root - Workspace root passed by the tool loop.
 * @param {object} args - Tool arguments identifying a node.
 * @param {object} options - Tool options carrying editorReadContext.
 * @returns {object} Node neighborhood context.
 */
async function graphGetNodeContext(_root, args = {}, options = {}) {
  throwIfAborted(options.signal);
  const tab = findGraphTab(getReadContext(options), args);
  if (!tab) return { graph: null, node: null, error: "Graph tab was not found." };
  const model = createGraphModel(tab);
  const node = resolveNode(model, args);
  if (!node) return { graph: createGraphTabSummary(tab), node: null, error: "Graph node was not found." };
  const file = getNodeFile(model, node);
  return {
    graph: createGraphTabSummary(tab),
    node: createNodeResult(model, node),
    incoming: getDirectNeighborResults(model, node.id, "incoming"),
    outgoing: getDirectNeighborResults(model, node.id, "outgoing"),
    connectedTags: asArray(file?.tags).map(String),
    localGraph: collectLocalGraph(model, node.id, args.depth)
  };
}

function findBoundedPaths(model, fromNodeId, toNodeId, args = {}) {
  const maxDepth = clampInteger(args.maxDepth, 4, 1, 8);
  const maxPaths = clampInteger(args.maxPaths, 10, 1, 50);
  const paths = [];
  const queue = [{ nodeId: fromNodeId, path: [fromNodeId] }];
  while (queue.length && paths.length < maxPaths) {
    const current = queue.shift();
    if (current.path.length - 1 >= maxDepth) continue;
    for (const link of model.outgoing.get(current.nodeId) || []) {
      if (current.path.includes(link.target)) continue;
      const nextPath = [...current.path, link.target];
      if (link.target === toNodeId) {
        paths.push(nextPath);
        if (paths.length >= maxPaths) break;
      } else {
        queue.push({ nodeId: link.target, path: nextPath });
      }
    }
  }
  return paths;
}

/**
 * Find short directed paths between two graph nodes.
 * @param {string} _root - Workspace root passed by the tool loop.
 * @param {object} args - Tool arguments with from and to node locators.
 * @param {object} options - Tool options carrying editorReadContext.
 * @returns {object} Bounded path search result.
 */
async function graphFindPaths(_root, args = {}, options = {}) {
  throwIfAborted(options.signal);
  const tab = findGraphTab(getReadContext(options), args);
  if (!tab) return { graph: null, paths: [], error: "Graph tab was not found." };
  const model = createGraphModel(tab);
  const from = resolveNode(model, { nodeId: args.from, path: args.from, query: args.from });
  const to = resolveNode(model, { nodeId: args.to, path: args.to, query: args.to });
  if (!from || !to) return { graph: createGraphTabSummary(tab), paths: [], error: "Start or target node was not found." };
  const paths = findBoundedPaths(model, from.id, to.id, args).map((pathIds) => ({
    nodeIds: pathIds,
    nodes: pathIds.map((nodeId) => createNodeResult(model, model.nodeById.get(nodeId))).filter(Boolean)
  }));
  return { graph: createGraphTabSummary(tab), from: createNodeResult(model, from), to: createNodeResult(model, to), paths };
}

/**
 * Whether a tool name represents any graph tool.
 * @param {string} toolName - Agent tool name.
 * @returns {boolean} True when the tool is graph-related.
 */
function isGraphTool(toolName) {
  return GRAPH_TOOL_NAMES.includes(String(toolName || ""));
}

/**
 * Whether a tool name represents a browser-owned graph UI action.
 * @param {string} toolName - Agent tool name.
 * @returns {boolean} True when the tool must be executed by the app UI.
 */
function isGraphActionTool(toolName) {
  return GRAPH_ACTION_TOOL_NAMES.includes(String(toolName || ""));
}

/**
 * Request execution of a live graph action from the browser process.
 * @param {string} _root - Workspace root passed by the tool loop.
 * @param {string} toolName - Graph action tool name.
 * @param {object} args - Tool arguments.
 * @param {object} options - Tool options with requestAppAction and signal.
 * @returns {Promise<object>} Browser action result.
 */
async function requestGraphAction(_root, toolName, args = {}, options = {}) {
  throwIfAborted(options.signal);
  if (!isGraphActionTool(toolName)) throw new Error(`Unsupported graph action tool: ${toolName}`);
  if (typeof options.requestAppAction !== "function") {
    throw new Error("Graph actions require the md-editor app action bridge.");
  }
  const result = await options.requestAppAction({
    tool: toolName,
    args,
    targetPath: args.tabId || args.nodeId || args.path || args.query || toolName,
    preview: {
      target: args.tabId || args.nodeId || args.path || args.query || toolName
    }
  });
  throwIfAborted(options.signal);
  return result || {};
}

module.exports = {
  GRAPH_ACTION_TOOL_NAMES,
  GRAPH_READ_TOOL_NAMES,
  GRAPH_TOOL_NAMES,
  graphFindPaths,
  graphGetNodeContext,
  graphGetState,
  graphSearchNodes,
  isGraphActionTool,
  isGraphTool,
  requestGraphAction,
  _test: {
    collectLocalGraph,
    createGraphModel,
    resolveNode,
    searchNodesInModel
  }
};
