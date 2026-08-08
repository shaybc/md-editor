const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const tools = require("../resources/ai-companion/tools/workspace-tools");
const { getAgentToolDefinitions } = require("./helpers/autonomous-tool-harness");

function createEditorReadContext() {
  return {
    workspace: {
      activeGraphTabId: "graph-1",
      activeTab: { id: "graph-1", title: "Workspace Graph", type: "graph" }
    },
    activeGraphTabId: "graph-1",
    graphTabs: [
      {
        id: "graph-1",
        title: "Workspace Graph",
        active: true,
        nodeCount: 4,
        linkCount: 3,
        fileCount: 3,
        zoomScale: 1.6,
        graphViewConfig: {
          mode: "global",
          searchQuery: "service",
          selectedTagIds: ["tag:core"],
          showTags: true,
          groups: [{ id: "group-1", query: "tag:core", enabled: true, hidden: false, color: "#2563eb" }]
        },
        nodes: [
          { id: "docs/alpha.md", label: "Alpha Service", type: "file", path: "docs/alpha.md" },
          { id: "docs/beta.md", label: "Beta API", type: "file", path: "docs/beta.md" },
          { id: "docs/gamma.md", label: "Gamma Store", type: "file", path: "docs/gamma.md" },
          { id: "tag:core", label: "#core", type: "tag" }
        ],
        files: [
          { id: "docs/alpha.md", name: "alpha.md", path: "docs/alpha.md", tags: ["core"] },
          { id: "docs/beta.md", name: "beta.md", path: "docs/beta.md", tags: ["api"] },
          { id: "docs/gamma.md", name: "gamma.md", path: "docs/gamma.md", tags: ["store"] }
        ],
        links: [
          { source: "docs/alpha.md", target: "docs/beta.md", type: "link" },
          { source: "docs/beta.md", target: "docs/gamma.md", type: "link" },
          { source: "tag:core", target: "docs/alpha.md", type: "tag" }
        ]
      }
    ]
  };
}

function loadGraphControlRegisterFunction() {
  const code = fs.readFileSync(path.join(__dirname, "../resources/js/graph/companion-control.js"), "utf8");
  const sandbox = { console, window: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "companion-control.js" });
  return sandbox.registerMarkdownViewerGraphCompanionControl;
}

function createGraphControlHarness(options = {}) {
  const updates = [];
  const switchedTabs = [];
  let rendered = false;
  let activeTabId = "graph-1";
  const graphTab = {
    id: "graph-1",
    type: "graph",
    graphSnapshot: {
      nodes: [
        { id: "docs/alpha.md", label: "Alpha Service", type: "file", path: "docs/alpha.md" },
        { id: "docs/beta.md", label: "Beta API", type: "file", path: "docs/beta.md" }
      ],
      files: [
        { id: "docs/alpha.md", name: "alpha.md", path: "docs/alpha.md", tags: ["core"] },
        { id: "docs/beta.md", name: "beta.md", path: "docs/beta.md", tags: ["api"] }
      ],
      links: [{ source: "docs/alpha.md", target: "docs/beta.md", type: "link" }]
    }
  };
  const graphRenderCache = new Map();
  if (options.withRender !== false) {
    graphRenderCache.set("graph-1", {
      nodes: graphTab.graphSnapshot.nodes.map((node) => ({ ...node, x: 1, y: 1 })),
      applyFind: (query) => ({ count: query === "Alpha" ? 1 : 0, cleared: false }),
      clearFind: () => {
        updates.push({ clearFind: true });
      },
      focusFoundNodes: (nodes) => {
        updates.push({ focused: nodes.map((node) => node.id) });
      }
    });
  }
  const app = {
    modules: {},
    registerModule(name, api) {
      this.modules[name] = api;
    }
  };
  const api = loadGraphControlRegisterFunction()(app, {
    getTabs: () => [graphTab],
    getActiveTabId: () => activeTabId,
    graphRenderCache,
    switchTab: (tabId) => {
      activeTabId = tabId;
      switchedTabs.push(tabId);
    },
    updateActiveGraphViewConfig: (patch) => updates.push(patch),
    renderGraphView: async () => {
      rendered = true;
    }
  });
  return { api, app, graphRenderCache, graphTab, switchedTabs, updates, get rendered() { return rendered; } };
}

test("graph read tools return state and node search results", async () => {
  const editorReadContext = createEditorReadContext();
  const state = await tools.graphGetState("", {}, { editorReadContext });
  const search = await tools.graphSearchNodes("", { query: "core" }, { editorReadContext });

  assert.equal(state.graph.id, "graph-1");
  assert.equal(state.graph.zoomScale, 1.6);
  assert.equal(state.graph.viewConfig.groups.length, 1);
  assert.equal(search.results.some((node) => node.nodeId === "docs/alpha.md"), true);
  assert.equal(search.results.some((node) => node.nodeId === "tag:core"), true);
});

test("graph node context returns incoming outgoing and local graph data", async () => {
  const context = await tools.graphGetNodeContext("", { nodeId: "docs/beta.md" }, { editorReadContext: createEditorReadContext() });

  assert.equal(context.node.nodeId, "docs/beta.md");
  assert.deepEqual(context.incoming.map((entry) => entry.node.nodeId), ["docs/alpha.md"]);
  assert.deepEqual(context.outgoing.map((entry) => entry.node.nodeId), ["docs/gamma.md"]);
  assert.equal(context.localGraph.nodes.some((node) => node.nodeId === "docs/alpha.md"), true);
});

test("graph path finding respects bounded search options", async () => {
  const result = await tools.graphFindPaths("", { from: "Alpha", to: "Gamma", maxDepth: 2, maxPaths: 1 }, { editorReadContext: createEditorReadContext() });

  assert.equal(result.paths.length, 1);
  assert.deepEqual(result.paths[0].nodeIds, ["docs/alpha.md", "docs/beta.md", "docs/gamma.md"]);
});

test("graph tools handle empty graph snapshots safely", async () => {
  const emptyState = await tools.graphGetState("", {}, { editorReadContext: {} });
  const emptySearch = await tools.graphSearchNodes("", { query: "missing" }, { editorReadContext: {} });

  assert.equal(emptyState.graph, null);
  assert.deepEqual(emptySearch.results, []);
});

test("graph tool definitions are gated by mode", () => {
  const agentNames = getAgentToolDefinitions("agent").map((definition) => definition.function.name);
  const chatNames = getAgentToolDefinitions("chat").map((definition) => definition.function.name);
  const planNames = getAgentToolDefinitions("plan").map((definition) => definition.function.name);

  for (const name of ["graph_get_state", "graph_search_nodes", "graph_get_node_context", "graph_find_paths"]) {
    assert.equal(agentNames.includes(name), true);
    assert.equal(chatNames.includes(name), true);
    assert.equal(planNames.includes(name), true);
  }
  for (const name of ["graph_apply_filter", "graph_focus_nodes", "graph_show_local", "graph_clear_focus"]) {
    assert.equal(agentNames.includes(name), true);
    assert.equal(chatNames.includes(name), false);
    assert.equal(planNames.includes(name), false);
  }
});

test("graph companion control applies only safe filter keys", async () => {
  const harness = createGraphControlHarness();
  const result = await harness.api.execute("graph_apply_filter", {
    searchQuery: "Alpha",
    selectedTagId: "core",
    showTags: true,
    hiddenNodeIds: ["docs/beta.md"]
  });

  assert.equal(result.changed, true);
  assert.equal(harness.updates[0].searchQuery, "Alpha");
  assert.deepEqual(Array.from(harness.updates[0].selectedTagIds), ["tag:core"]);
  assert.equal(harness.updates[0].showTags, true);
  assert.equal(Object.prototype.hasOwnProperty.call(harness.updates[0], "hiddenNodeIds"), false);
});

test("graph companion control reports missing render for focus actions", async () => {
  const harness = createGraphControlHarness({ withRender: false });

  await assert.rejects(
    () => harness.api.execute("graph_focus_nodes", { nodeIds: ["docs/alpha.md"] }),
    /Graph render is unavailable/
  );
  assert.equal(harness.rendered, true);
});

test("graph companion control switches to local graph mode", async () => {
  const harness = createGraphControlHarness();
  const result = await harness.api.execute("graph_show_local", { query: "Alpha", depth: 2 });

  assert.equal(result.nodeId, "docs/alpha.md");
  assert.equal(result.mode, "full-local");
  assert.equal(harness.updates[0].focusNodeId, "docs/alpha.md");
  assert.equal(harness.updates[0].mode, "full-local");
});
