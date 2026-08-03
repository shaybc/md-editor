(function(global) {
  "use strict";

  global.registerMarkdownViewerGraphCompanionControl = function registerMarkdownViewerGraphCompanionControl(app, deps) {
    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/");
    }

    function normalizeComparable(value) {
      return normalizePath(value).replace(/^\/+/, "").replace(/\.(md|markdown)$/i, "").toLowerCase();
    }

    function normalizeTagNodeId(value) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      return raw.startsWith("tag:") ? raw : `tag:${raw.replace(/^#/, "")}`;
    }

    function getTabs() {
      return Array.isArray(deps.getTabs?.()) ? deps.getTabs() : [];
    }

    function getActiveTabId() {
      return String(deps.getActiveTabId?.() || "");
    }

    function getGraphSnapshot(tab = {}) {
      return tab.graphComparisonSnapshot || tab.graphSnapshot || tab.graphDocument?.snapshot || {};
    }

    function getGraphNodes(tab = {}) {
      return Array.isArray(getGraphSnapshot(tab).nodes) ? getGraphSnapshot(tab).nodes : [];
    }

    function getGraphFiles(tab = {}) {
      return Array.isArray(getGraphSnapshot(tab).files) ? getGraphSnapshot(tab).files : [];
    }

    function findGraphTab(args = {}) {
      const tabId = String(args.tabId || "").trim();
      const tabs = getTabs();
      if (tabId) return tabs.find((tab) => String(tab?.id || "") === tabId && tab?.type === "graph") || null;
      const activeTabId = getActiveTabId();
      const activeGraphTab = tabs.find((tab) => String(tab?.id || "") === activeTabId && tab?.type === "graph");
      return activeGraphTab || tabs.find((tab) => tab?.type === "graph") || null;
    }

    function getFileForNode(tab, node = {}) {
      const target = normalizeComparable(node.path || node.fullPath || node.id || node.label || node.name);
      return getGraphFiles(tab).find((file) => {
        return [file?.id, file?.path, file?.fullPath, file?.name, file?.title].map(normalizeComparable).includes(target);
      }) || null;
    }

    function getNodeSearchText(tab, node = {}) {
      const file = getFileForNode(tab, node);
      return [
        node.id,
        node.label,
        node.name,
        node.title,
        node.type,
        node.path,
        node.fullPath,
        file?.id,
        file?.name,
        file?.path,
        ...(Array.isArray(file?.tags) ? file.tags : [])
      ].filter(Boolean).join(" ").toLowerCase();
    }

    function resolveGraphNode(tab, args = {}) {
      const nodes = getGraphNodes(tab);
      const nodeId = String(args.nodeId || args.id || "").trim();
      if (nodeId) {
        const exact = nodes.find((node) => String(node?.id || "") === nodeId);
        if (exact) return exact;
      }
      const path = normalizeComparable(args.path || "");
      if (path) {
        const pathMatch = nodes.find((node) => {
          const file = getFileForNode(tab, node);
          return [node?.id, node?.path, node?.fullPath, file?.path, file?.name].map(normalizeComparable).includes(path);
        });
        if (pathMatch) return pathMatch;
      }
      const query = String(args.query || "").trim().toLowerCase();
      if (!query) return null;
      return nodes.find((node) => getNodeSearchText(tab, node).includes(query)) || null;
    }

    function switchToGraphTab(tab) {
      if (!tab) throw new Error("Graph tab was not found.");
      if (String(tab.id || "") === getActiveTabId()) return;
      if (typeof deps.switchTab !== "function") throw new Error("Cannot activate the requested graph tab.");
      deps.switchTab(tab.id);
    }

    async function getActiveGraphRender(tab) {
      switchToGraphTab(tab);
      let render = deps.graphRenderCache?.get?.(tab.id) || null;
      if (!render && typeof deps.renderGraphView === "function") {
        await deps.renderGraphView();
        render = deps.graphRenderCache?.get?.(tab.id) || null;
      }
      if (!render) throw new Error("Graph render is unavailable.");
      return render;
    }

    async function applyFilter(args = {}) {
      const tab = findGraphTab(args);
      switchToGraphTab(tab);
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(args, "searchQuery")) patch.searchQuery = String(args.searchQuery || "");
      if (Object.prototype.hasOwnProperty.call(args, "selectedTagId")) {
        const selectedTagId = normalizeTagNodeId(args.selectedTagId);
        patch.selectedTagIds = selectedTagId ? [selectedTagId] : [];
      }
      ["showTags", "showOrphans", "showLabels", "showExternalJars", "showMissingDependencies"].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(args, key)) patch[key] = args[key] === true;
      });
      if (!Object.keys(patch).length) return { changed: false, tabId: tab.id || "" };
      deps.updateActiveGraphViewConfig?.(patch);
      return { changed: true, tabId: tab.id || "", patch };
    }

    async function focusNodes(args = {}) {
      const tab = findGraphTab(args);
      const render = await getActiveGraphRender(tab);
      const query = String(args.query || "").trim();
      const nodeIds = Array.isArray(args.nodeIds) ? args.nodeIds.map((id) => String(id || "")).filter(Boolean) : [];
      if ((args.mode || (query ? "find" : "nodes")) === "find" && query) {
        const result = render.applyFind?.(query) || { count: 0 };
        return { changed: true, tabId: tab.id || "", mode: "find", ...result };
      }
      if (!nodeIds.length) throw new Error("graph_focus_nodes requires query or nodeIds.");
      const nodes = (Array.isArray(render.nodes) ? render.nodes : []).filter((node) => nodeIds.includes(String(node?.id || "")));
      if (!nodes.length) throw new Error("No matching rendered graph nodes were found.");
      render.focusFoundNodes?.(nodes);
      return { changed: true, tabId: tab.id || "", focusedNodeIds: nodes.map((node) => String(node.id || "")) };
    }

    async function showLocal(args = {}) {
      const tab = findGraphTab(args);
      switchToGraphTab(tab);
      const node = resolveGraphNode(tab, args);
      if (!node) throw new Error("Graph node was not found.");
      const direction = String(args.direction || "outgoing");
      const depth = Number(args.depth || 1);
      const mode = direction === "network" ? "full-network" : (depth > 1 ? "full-local" : "local");
      const patch = {
        mode,
        focusNodeId: String(node.id || ""),
        allowedNodeIds: [],
        clusterNodeIds: []
      };
      deps.updateActiveGraphViewConfig?.(patch);
      return { changed: true, tabId: tab.id || "", nodeId: String(node.id || ""), mode };
    }

    async function clearFocus(args = {}) {
      const tab = findGraphTab(args);
      switchToGraphTab(tab);
      const render = deps.graphRenderCache?.get?.(tab.id) || null;
      render?.clearFind?.();
      deps.updateActiveGraphViewConfig?.({
        mode: "global",
        focusNodeId: "",
        allowedNodeIds: [],
        clusterNodeIds: []
      });
      return { changed: true, tabId: tab.id || "" };
    }

    async function execute(toolName, args = {}) {
      switch (toolName) {
        case "graph_apply_filter":
          return applyFilter(args);
        case "graph_focus_nodes":
          return focusNodes(args);
        case "graph_show_local":
          return showLocal(args);
        case "graph_clear_focus":
          return clearFocus(args);
        default:
          throw new Error(`Unsupported graph action: ${toolName}`);
      }
    }

    const api = { execute };
    app.registerModule?.("graphCompanionControl", api);
    return api;
  };
})(window);
