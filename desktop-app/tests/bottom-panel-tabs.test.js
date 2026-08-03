const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class ElementStub {
  constructor(id = "") {
    this.id = id;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.parentElement = null;
    this.textContent = "";
    this.className = "";
    this.attributes = {};
    this.listeners = {};
    this.classList = {
      add: (...names) => names.forEach((name) => this.addClass(name)),
      remove: (...names) => names.forEach((name) => this.removeClass(name)),
      toggle: (name, force) => {
        const shouldAdd = force === undefined ? !this.hasClass(name) : !!force;
        if (shouldAdd) this.addClass(name);
        else this.removeClass(name);
        return shouldAdd;
      },
      contains: (name) => this.hasClass(name)
    };
  }

  addClass(name) {
    const classes = new Set(String(this.className || "").split(/\s+/).filter(Boolean));
    classes.add(name);
    this.className = Array.from(classes).join(" ");
  }

  removeClass(name) {
    const classes = new Set(String(this.className || "").split(/\s+/).filter(Boolean));
    classes.delete(name);
    this.className = Array.from(classes).join(" ");
  }

  hasClass(name) {
    return String(this.className || "").split(/\s+/).includes(name);
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  addEventListener(name, handler) {
    this.listeners[name] = handler;
  }
}

function createBottomPanel(initialState = {}, options = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/panels/bottom-panel-tabs.js"), "utf8");
  const elements = {
    "find-in-files-results-panel": new ElementStub("find-in-files-results-panel"),
    "bottom-panel-tab-list": new ElementStub("bottom-panel-tab-list"),
    "bottom-panel-content-host": new ElementStub("bottom-panel-content-host"),
    "bottom-panel-search-results": new ElementStub("bottom-panel-search-results"),
    "find-in-files-results-close": new ElementStub("find-in-files-results-close")
  };
  const savedState = { ...initialState };
  const body = new ElementStub("body");
  const sidebarCalls = [];
  const aiCompanionCalls = [];
  if (options.aiCompanionVisible) body.classList.add("ai-companion-open");
  const context = {
    console,
    window: { setTimeout: (fn) => fn() },
    document: {
      body,
      createElement: () => new ElementStub(),
      getElementById: (id) => elements[id] || null
    }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "bottom-panel-tabs.js" });
  const app = { registerModule: () => {} };
  const api = context.window.registerMarkdownViewerBottomPanelTabs(app, {
    loadGlobalState: () => savedState,
    saveGlobalState: (patch) => Object.assign(savedState, patch),
    setSidebarVisible: (...args) => sidebarCalls.push(args),
    getAiCompanionPanel: () => ({
      setOpen(value, settings) {
        aiCompanionCalls.push([value, settings]);
        body.classList.toggle("ai-companion-open", value);
      }
    })
  });
  return { api, elements, savedState, body, sidebarCalls, aiCompanionCalls };
}

test("bottom panel starts with Search Results and reorders terminal tabs", () => {
  const { api } = createBottomPanel();
  const terminalView = new ElementStub("terminal-view");

  api.addTab({ id: "terminal-1", title: "Git CMD", icon: "bi-terminal", view: terminalView });

  assert.equal(JSON.stringify(api.getTabOrder()), JSON.stringify(["search-results", "terminal-1"]));
  assert.equal(api.getActiveTabId(), "terminal-1");

  assert.equal(api.reorderTab("terminal-1", "search-results"), true);
  assert.equal(JSON.stringify(api.getTabOrder()), JSON.stringify(["terminal-1", "search-results"]));
});

test("bottom panel closing a terminal returns focus to Search Results", () => {
  const { api } = createBottomPanel();
  const terminalView = new ElementStub("terminal-view");
  let closed = false;

  api.addTab({ id: "terminal-1", title: "Git CMD", view: terminalView, onClose: () => { closed = true; } });

  assert.equal(api.closeTab("terminal-1"), true);
  assert.equal(closed, true);
  assert.equal(api.getActiveTabId(), "search-results");
  assert.equal(JSON.stringify(api.getTabOrder()), JSON.stringify(["search-results"]));
});

test("bottom panel close others preserves the target and permanent tabs", () => {
  const { api } = createBottomPanel();
  const closedTabs = [];
  api.addTab({ id: "problems", title: "Problems", view: new ElementStub("problems-view"), permanent: true });
  api.addTab({ id: "terminal-1", title: "Terminal 1", view: new ElementStub("terminal-1-view"), onClose: () => closedTabs.push("terminal-1") });
  api.addTab({ id: "terminal-2", title: "Terminal 2", view: new ElementStub("terminal-2-view"), onClose: () => closedTabs.push("terminal-2") });

  assert.equal(api._test.closeOtherTabs("terminal-1"), true);
  assert.equal(JSON.stringify(api.getTabOrder()), JSON.stringify(["search-results", "problems", "terminal-1"]));
  assert.equal(JSON.stringify(closedTabs), JSON.stringify(["terminal-2"]));
});

test("bottom panel restores visibility, height, and a deferred active tab", () => {
  const { api, elements, savedState } = createBottomPanel({
    bottomPanel: {
      visible: true,
      activeTabId: "problems"
    },
    findInFiles: { panelHeight: 344 }
  });

  assert.equal(api.isPanelVisible(), true);
  assert.equal(elements["find-in-files-results-panel"].style.height, "344px");
  assert.equal(api.getActiveTabId(), "search-results");

  const problemsView = new ElementStub("problems-view");
  api.addTab({ id: "problems", title: "Problems", view: problemsView, activate: false });

  assert.equal(api.getActiveTabId(), "problems");
  assert.equal(problemsView.hidden, false);

  api.hidePanel();
  assert.equal(savedState.bottomPanel.visible, false);

  elements["find-in-files-results-panel"].style.height = "";
  api.activateTab("problems");
  assert.equal(savedState.bottomPanel.visible, true);
  assert.equal(savedState.bottomPanel.activeTabId, "problems");
  assert.equal(elements["find-in-files-results-panel"].style.height, "344px");

  assert.equal(api.setPanelHeight(412), true);
  assert.equal(savedState.bottomPanel.panelHeight, 412);
  assert.equal(elements["find-in-files-results-panel"].style.height, "412px");
});

test("bottom panel reapplies state hydrated after initialization", () => {
  const { api, elements, savedState } = createBottomPanel();
  const problemsView = new ElementStub("problems-view");
  api.addTab({ id: "problems", title: "Problems", view: problemsView, activate: false });

  savedState.bottomPanel = {
    ...savedState.bottomPanel,
    visible: true,
    activeTabId: "problems",
    panelHeight: 386
  };
  api.restoreSavedPanelState();

  assert.equal(api.isPanelVisible(), true);
  assert.equal(api.getActiveTabId(), "problems");
  assert.equal(problemsView.hidden, false);
  assert.equal(elements["find-in-files-results-panel"].style.height, "386px");
});

test("double-clicking a lower tab maximizes and restores the workspace panels", () => {
  const harness = createBottomPanel({}, { aiCompanionVisible: true });
  const problemsView = new ElementStub("problems-view");
  harness.api.addTab({ id: "problems", title: "Problems", view: problemsView });
  const problemsButton = harness.elements["bottom-panel-tab-list"].children.find((button) => button.dataset.bottomPanelTabId === "problems");
  const tabTarget = { closest: () => null };

  problemsButton.listeners.dblclick({ target: tabTarget });

  assert.equal(harness.body.classList.contains("bottom-panel-maximized"), true);
  assert.deepEqual(harness.sidebarCalls[0], [false, false, false]);
  assert.equal(harness.aiCompanionCalls[0][0], false);
  assert.equal(harness.aiCompanionCalls[0][1].persist, false);

  problemsButton.listeners.dblclick({ target: tabTarget });

  assert.equal(harness.body.classList.contains("bottom-panel-maximized"), false);
  assert.deepEqual(harness.sidebarCalls[1], [true, false, false]);
  assert.equal(harness.aiCompanionCalls[1][0], true);
  assert.equal(harness.aiCompanionCalls[1][1].persist, false);
});

test("double-clicking a lower tab close button does not maximize", () => {
  const harness = createBottomPanel();
  const terminalView = new ElementStub("terminal-view");
  harness.api.addTab({ id: "terminal-1", title: "Terminal", view: terminalView });
  const terminalButton = harness.elements["bottom-panel-tab-list"].children.find((button) => button.dataset.bottomPanelTabId === "terminal-1");

  terminalButton.listeners.dblclick({ target: { closest: () => ({}) } });

  assert.equal(harness.body.classList.contains("bottom-panel-maximized"), false);
  assert.deepEqual(harness.sidebarCalls, []);
  assert.deepEqual(harness.aiCompanionCalls, []);
});

test("bottom panel reports visibility state", () => {
  const { api } = createBottomPanel();

  assert.equal(api.isPanelVisible(), false);

  api.showPanel();
  assert.equal(api.isPanelVisible(), true);

  api.hidePanel();
  assert.equal(api.isPanelVisible(), false);
});
