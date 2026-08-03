const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.hidden = false;
    this.className = "";
    this.classList = new FakeClassList();
    this.attributes = {};
    this.isConnected = false;
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
    }
    child.parentElement = this;
    child.setConnected(this.isConnected);
    this.children.push(child);
    return child;
  }

  setConnected(isConnected) {
    this.isConnected = isConnected;
    this.children.forEach((child) => child.setConnected(isConnected));
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    }
    this.parentElement = null;
    this.setConnected(false);
  }

  contains(target) {
    return this === target || this.children.some((child) => child.contains(target));
  }
}

function loadTabViewManager() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/tabs/view-manager.js"), "utf8");
  const document = {
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };
  const context = {
    window: {},
    document,
    Map,
    Array
  };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerTabViewManager;
}

function createManager() {
  const register = loadTabViewManager();
  const host = new FakeElement("div");
  host.setConnected(true);
  const legacySurface = new FakeElement("section");
  host.appendChild(legacySurface);
  const editorViewManager = {
    activated: [],
    destroyed: [],
    activateEditorTab(tab, root) {
      this.activated.push({ tab, root });
    },
    deactivateEditorView() {},
    destroyEditorTab(tabId) {
      this.destroyed.push(tabId);
    }
  };
  const fileCompare = {
    mounted: [],
    destroyed: [],
    mountFileCompareTab(tab, root) {
      this.mounted.push({ tab, root });
    },
    destroyFileCompareTab(tabId) {
      this.destroyed.push(tabId);
    }
  };
  const apiClient = {
    mounted: [],
    activated: [],
    deactivated: 0,
    destroyed: [],
    mountApiClientTab(tab, root) {
      this.mounted.push({ tab, root });
    },
    activateApiClientSidebar(tab) {
      this.activated.push(tab);
    },
    deactivateApiClientSidebar() {
      this.deactivated += 1;
    },
    destroyApiClientTab(tabId) {
      this.destroyed.push(tabId);
    }
  };
  const app = { services: {} };
  const api = register(app, {
    tabViewHost: host,
    legacyEditorSurface: legacySurface,
    editorViewManager,
    fileCompare,
    apiClient
  });
  return { api, app, host, legacySurface, editorViewManager, fileCompare, apiClient };
}

test("tab view manager creates and reuses one root per tab id", () => {
  const { api, host } = createManager();
  const tab = { id: "tab-a", type: "markdown" };

  const firstRoot = api.ensureTabView(tab);
  const secondRoot = api.ensureTabView(tab);

  assert.equal(firstRoot, secondRoot);
  assert.equal(api.getViewRootCount(), 1);
  assert.equal(host.children.includes(firstRoot), true);
  assert.equal(firstRoot.dataset.tabId, "tab-a");
});

test("tab view manager hides inactive roots and shows active root", () => {
  const { api } = createManager();
  const firstRoot = api.activateTabView({ id: "tab-a", type: "markdown" });
  const secondRoot = api.activateTabView({ id: "tab-b", type: "graph" });

  assert.equal(firstRoot.hidden, true);
  assert.equal(firstRoot.attributes["aria-hidden"], "true");
  assert.equal(secondRoot.hidden, false);
  assert.equal(secondRoot.attributes["aria-hidden"], "false");
  assert.equal(api.getActiveTabView(), secondRoot);
});

test("tab view manager delegates editable tabs to the editor view manager", () => {
  const { api, editorViewManager, legacySurface, host } = createManager();
  const root = api.activateTabView({ id: "tab-a", type: "markdown" });

  assert.equal(editorViewManager.activated.length, 1);
  assert.equal(editorViewManager.activated[0].root, root);
  assert.equal(legacySurface.parentElement, host);
  assert.equal(legacySurface.hidden, true);
  assert.equal(root.contains(legacySurface), false);
});

test("tab view manager keeps the legacy editor out of graph tab roots", () => {
  const { api, legacySurface, host } = createManager();
  const root = api.activateTabView({ id: "graph-a", type: "graph" });

  assert.equal(root.dataset.tabViewKind, "graph");
  assert.equal(root.contains(legacySurface), false);
  assert.equal(legacySurface.parentElement, host);
  assert.equal(legacySurface.hidden, true);
  assert.equal(legacySurface.attributes["aria-hidden"], "true");
});

test("tab view manager delegates compare tabs to the file compare view", () => {
  const { api, editorViewManager, fileCompare } = createManager();
  const root = api.activateTabView({ id: "compare-a", type: "file-compare" });

  assert.equal(root.dataset.tabViewKind, "file-compare");
  assert.equal(fileCompare.mounted.length, 1);
  assert.equal(fileCompare.mounted[0].root, root);
  assert.equal(editorViewManager.activated.length, 0);
});


test("tab view manager delegates API Client tabs to the API client view", () => {
  const { api, editorViewManager, apiClient } = createManager();
  const root = api.activateTabView({ id: "api-client-a", type: "api-client" });

  assert.equal(root.dataset.tabViewKind, "api-client");
  assert.equal(apiClient.mounted.length, 1);
  assert.equal(apiClient.mounted[0].root, root);
  assert.equal(apiClient.activated.length, 1);
  assert.equal(apiClient.activated[0].id, "api-client-a");
  assert.equal(editorViewManager.activated.length, 0);
});
test("tab view manager restores API Client sidebar when leaving API tabs", () => {
  const { api, apiClient } = createManager();
  api.activateTabView({ id: "api-client-a", type: "api-client" });
  api.activateTabView({ id: "tab-a", type: "markdown" });

  assert.equal(apiClient.deactivated, 1);
});

test("tab view manager destroys a tab root", () => {
  const { api, host } = createManager();
  const root = api.activateTabView({ id: "tab-a", type: "markdown" });

  api.destroyTabView("tab-a");

  assert.equal(root.isConnected, false);
  assert.equal(host.children.includes(root), false);
  assert.equal(api.getViewRootCount(), 0);
  assert.equal(api.getActiveTabView(), null);
});
