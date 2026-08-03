const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webRoot = path.resolve(__dirname, "..", "resources");
const graphRendererSource = fs.readFileSync(path.join(webRoot, "js", "graph", "renderer.js"), "utf8");

function createGraphPersistence() {
  const source = fs.readFileSync(path.join(webRoot, "js", "graph", "persistence.js"), "utf8");
  const modules = {};
  const context = {
    window: {},
    console,
    Date,
    Math,
    performance: { now: () => 0 },
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    },
    document: {
      createElement() {
        return {
          className: "",
          classList: { add() {}, remove() {}, toggle() {} },
          append() {},
          appendChild() {},
          remove() {},
          setAttribute() {},
          querySelectorAll() { return []; },
          dataset: {},
          style: {}
        };
      },
      querySelectorAll() { return []; }
    }
  };
  context.global = context.window;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "graph/persistence.js" });
  const app = {
    services: {},
    modules,
    registerModule(name, api) {
      modules[name] = api;
    }
  };
  const deps = {
    DEFAULT_GRAPH_VIEW_CONFIG: {
      showTags: true,
      showExternalJars: false,
      showMissingDependencies: true,
      hiddenTagIds: [],
      hiddenNodeIds: [],
      selectedTagIds: [],
      groups: [],
      collapsedClusters: [],
      searchQuery: "",
      showArrows: false,
      showOrphans: true,
      showLabels: false,
      textFadeThreshold: 0.3,
      nodeSize: 1,
      linkThickness: 1,
      centerForce: 1,
      repelForce: 250,
      linkForce: 0.5,
      linkDistance: 120,
      groupForce: 0.5
    },
    GRAPH_DOCUMENT_TYPE_VIEW: "graph-view",
    GRAPH_DOCUMENT_TYPE_EXPORT: "graph-export",
    GRAPH_DOCUMENT_TYPES: new Set(["graph-view", "graph-export"]),
    GRAPH_DOCUMENT_SCHEMA_VERSION: 1,
    getGraphViewPreferenceDefaults() { return {}; },
    normalizeGraphNodeName(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\.(md|markdown)$/i, "").toLowerCase();
    },
    getGraphDisplayLabel(value) {
      return String(value || "").replace(/\\/g, "/").split("/").pop()?.replace(/\.(md|markdown)$/i, "") || "";
    },
    getFileName(value) {
      return String(value || "").replace(/\\/g, "/").split("/").pop() || "";
    },
    normalizeFileTagList(tags) {
      return Array.from(new Set((Array.isArray(tags) ? tags : [tags]).map((tag) => String(tag || "").trim()).filter(Boolean)));
    },
    isNeutralinoRuntime() { return false; },
    loadGlobalState() { return {}; },
    getFileTagsFromContent() { return []; },
    extractMarkdownLinks() { return []; },
    extractSourceFileFromFrontmatter() { return ""; },
    extractUnresolvedDependencies() { return []; },
    normalizeGraphTagNodeId(tag) { return `tag:${String(tag || "").replace(/^tag:/, "")}`; },
    normalizeGraphTagNodeIds(tags) { return Array.isArray(tags) ? tags : []; },
    createGraphPerfSession() { return null; }
  };
  return context.window.registerMarkdownViewerGraphPersistence(app, deps);
}

test("graph-view display defaults match app defaults", () => {
  const persistence = createGraphPersistence();
  const config = persistence.normalizeGraphViewConfig(null);

  assert.equal(config.showArrows, false);
  assert.equal(config.showExternalJars, false);
  assert.equal(config.showMissingDependencies, true);
  assert.equal(config.showOrphans, true);
  assert.equal(config.showLabels, false);
});

test("graph-view serialization omits files and compacts file nodes", () => {
  const persistence = createGraphPersistence();
  const graphDocument = persistence.serializeGraphViewDocument({
    type: "graph",
    title: "Project",
    folderName: "Project",
    graphSnapshot: {
      version: 1,
      folderName: "Project",
      nodes: [{
        id: "src/app",
        label: "App",
        fullPath: "src/App.md",
        type: "file",
        status: "current",
        tags: ["service"],
        x: 10,
        y: 20
      }],
      links: [{ source: { id: "src/app" }, target: "tag:service", type: "tag", status: "current", index: 1 }],
      files: [{ id: "src/app", path: "src/App.md", name: "App.md", content: "large content", tags: ["service"] }]
    },
    graphViewConfig: null,
    graphLayout: { magneticEnabled: true, nodes: { "src/app": { x: 10, y: 20 } } }
  });

  assert.equal(graphDocument.documentType, "graph-view");
  assert.equal(graphDocument.snapshot.files, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(graphDocument.snapshot.nodes)), [{
    id: "src/app",
    type: "file",
    path: "src/App.md",
    tags: ["service"]
  }]);
  assert.deepEqual(JSON.parse(JSON.stringify(graphDocument.snapshot.links)), [{ source: "src/app", target: "tag:service", type: "tag" }]);
  assert.equal(graphDocument.graphLayout, undefined);
});

test("magnetic zoom and ticks do not schedule graph draft persistence", () => {
  assert.match(graphRendererSource, /if \(event\.sourceEvent\) savePersistableGraphLayout\(\);/);
  assert.doesNotMatch(graphRendererSource, /if \(event\.sourceEvent\) markGraphTabAsChanged\(activeTab\);/);
  const renderTickMatch = graphRendererSource.match(/function renderGraphTick\(\) \{[\s\S]*?\n    \}/);
  assert.ok(renderTickMatch, "renderGraphTick should exist");
  assert.doesNotMatch(renderTickMatch[0], /scheduleGraphLayoutStorageSave\(/);
});
