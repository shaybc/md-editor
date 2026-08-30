const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class ElementStub {
  constructor(tagName = "div", id = "") {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.parentElement = null;
    this.textContent = "";
    this.className = "";
    this.title = "";
    this.attributes = {};
    this.listeners = {};
    this.scrollWidth = 0;
    this.clientWidth = 0;
    this.scrollLeft = 0;
    this.disabled = false;
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

  set innerHTML(value) {
    this.textContent = String(value || "");
    this.children = [];
  }

  get innerHTML() {
    return this.textContent;
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
    if (typeof child === "string") child = new TextNodeStub(child);
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  addEventListener(name, handler) {
    if (!this.listeners[name]) this.listeners[name] = [];
    this.listeners[name].push(handler);
  }

  dispatch(name, event = {}) {
    const dispatchedEvent = {
      target: event.target || this,
      currentTarget: this,
      preventDefault() {},
      stopPropagation() {},
      ...event
    };
    (this.listeners[name] || []).forEach((handler) => handler(dispatchedEvent));
  }

  closest(selector) {
    if (!selector.startsWith(".")) return null;
    const className = selector.slice(1);
    let current = this;
    while (current) {
      if (current.hasClass?.(className)) return current;
      current = current.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    function visit(node) {
      if (node.matchesSelector?.(selector)) matches.push(node);
      (node.children || []).forEach(visit);
    }
    this.children.forEach(visit);
    return matches;
  }

  matchesSelector(selector) {
    if (selector === ".tab-item.active") return this.hasClass("tab-item") && this.hasClass("active");
    if (selector === ".tab-item[data-tab-id]") return this.hasClass("tab-item") && !!this.dataset.tabId;
    if (selector === ".mobile-tab-item[data-tab-id]") return this.hasClass("mobile-tab-item") && !!this.dataset.tabId;
    if (selector.startsWith(".")) return this.hasClass(selector.slice(1));
    return false;
  }

  scrollIntoView() {}
  scrollBy() {}
  getBoundingClientRect() { return { width: 180, height: 220, left: 0, top: 0, right: 180, bottom: 220 }; }
}

class TextNodeStub {
  constructor(text) {
    this.textContent = String(text || "");
    this.parentElement = null;
  }
}

function createTabsHarness(options = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/tabs/index.js"), "utf8");
  const tabList = new ElementStub("div", "tab-list");
  const tabs = options.tabs ? options.tabs.map((tab) => ({ ...tab })) : [{
    id: "tab-1",
    title: "Example.md",
    content: "# Example",
    savedContent: "# Example",
    sourceFileName: "Example.md",
    type: "markdown",
    isTemporary: options.temporary === true
  }];
  let activeTabId = options.activeTabId || tabs[0]?.id || null;
  const sidebarCalls = [];
  const activeTabChanges = [];
  const bottomPanelCalls = [];
  const bottomPanel = {
    SEARCH_RESULTS_TAB_ID: "search-results",
    visible: options.bottomPanelVisible === true,
    activeTabId: options.bottomPanelActiveTabId || "search-results",
    isPanelVisible() { return this.visible; },
    getActiveTabId() { return this.activeTabId; },
    hidePanel() {
      this.visible = false;
      bottomPanelCalls.push(["hidePanel"]);
    },
    activateTab(tabId = this.SEARCH_RESULTS_TAB_ID) {
      this.visible = true;
      this.activeTabId = tabId;
      bottomPanelCalls.push(["activateTab", tabId]);
    }
  };
  const aiCompanionCalls = [];
  const body = new ElementStub("body");
  if (options.aiCompanionVisible === true) body.classList.add("ai-companion-open");
  const aiCompanionPanel = {
    setOpen(open, options = {}) {
      aiCompanionCalls.push([open, { persist: options.persist }]);
      body.classList.toggle("ai-companion-open", open === true);
    }
  };
  const javaDebugPanelCalls = [];
  const javaDebugPanel = {
    perspectiveOpen: options.javaDebugPerspectiveOpen === true,
    isPerspectiveOpen() { return this.perspectiveOpen; },
    closePerspective(options = {}) {
      this.perspectiveOpen = false;
      javaDebugPanelCalls.push(["closePerspective", { persist: options.persist }]);
    },
    openPerspective(options = {}) {
      this.perspectiveOpen = true;
      javaDebugPanelCalls.push(["openPerspective", { persist: options.persist }]);
      return Promise.resolve(true);
    }
  };
  const app = {
    modules: { bottomPanelTabs: bottomPanel, aiCompanionPanel, javaDebugPanel },
    services: {},
    registerModule(name, api) { this.modules[name] = api; }
  };
  const document = {
    body,
    createElement: (tagName) => new ElementStub(tagName),
    createTextNode: (text) => new TextNodeStub(text),
    getElementById: (id) => id === "tab-list" ? tabList : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}
  };
  const context = {
    console,
    document,
    requestAnimationFrame: (callback) => callback(),
    setTimeout: (callback) => callback(),
    window: {
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener() {},
      setTimeout: (callback) => callback()
    }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "tabs/index.js" });
  const deps = {
    sampleMarkdown: "",
    unsavedChanges: { bindWindowExitGuards: () => () => {} },
    tabViewManager: null,
    editorViewManager: null,
    activeEditorCommands: null,
    markdownEditor: { value: "# Example", disabled: false, focus() {}, setAttribute() {} },
    contentContainer: new ElementStub("div"),
    currentViewMode: "split",
    graphRenderCache: new Map(),
    appDebugLog: null,
    suspendActiveGraphRender() {},
    get activeTabId() { return activeTabId; },
    set activeTabId(value) { activeTabId = value; },
    get tabs() { return tabs; },
    set tabs(value) { tabs.splice(0, tabs.length, ...value); },
    get untitledCounter() { return 0; },
    set untitledCounter(value) {},
    get tabContextMenu() { return null; },
    set tabContextMenu(value) {},
    get tabContextTargetId() { return null; },
    set tabContextTargetId(value) {},
    get tabContextCloseMobileMenuOnAction() { return false; },
    set tabContextCloseMobileMenuOnAction(value) {},
    getFileIconClass: () => "bi-file-earmark-text",
    tabHasUnsavedChanges: () => false,
    saveTabsToStorage() {},
    loadGlobalState: () => ({ viewMode: "split" }),
    saveGlobalState() { throw new Error("tab maximize must not persist layout state"); },
    saveActiveTabId() {},
    loadActiveTabId: () => "tab-1",
    loadUntitledCounter: () => 0,
    saveUntitledCounter() {},
    setViewMode() {},
    setGraphViewMode() {},
    renderMarkdown() {},
    renderEditorSyntaxHighlights() {},
    refreshActiveResizeTarget() {},
    refreshEditorLineNumberResizeObserver() {},
    updateEditorLineNumbers() {},
    syncEditorSyntaxHighlightScroll() {},
    syncFolderTreeSelectionToActiveTab() {},
    updateSaveCurrentFileButtons() {},
    getActiveGraphTab: () => null,
    activeFolderPath: null,
    isNeutralinoRuntime: () => false,
    getFileName: (value) => value,
    getMarkdownTitleFromFileName: (value) => value,
    isMarkdownPath: () => true,
    isTextDocumentPath: () => true,
    isSupportedFolderTreeDocumentPath: () => true,
    setSidebarVisible: (...args) => sidebarCalls.push(args),
    onActiveTabChanged: (tab) => activeTabChanges.push(tab?.id || null),
    hideSidebarContextMenus() {},
    closeMobileMenu() {}
  };
  Object.assign(deps, options.deps || {});
  const api = context.window.registerMarkdownViewerTabs(app, deps);
  api.renderTabBar(tabs, activeTabId);
  return { api, tabs, tabList, sidebarCalls, activeTabChanges, bottomPanelCalls, bottomPanel, aiCompanionCalls, javaDebugPanelCalls, javaDebugPanel, body, getActiveTabId: () => activeTabId };
}

test("API Client tabs render with a distinct tab icon", () => {
  const harness = createTabsHarness();
  harness.api.renderTabBar([{ id: "api-tab", title: "API Client", type: "api-client", content: "", savedContent: "" }], "api-tab");

  const title = harness.tabList.children[0].querySelector(".tab-title");
  const icon = title.children[0];

  assert.equal(icon.className, "bi bi-send me-1");
});
test("double-clicking a tab pins it, maximizes, then restores the previous bottom panel tab and AI companion", () => {
  const harness = createTabsHarness({ bottomPanelVisible: true, bottomPanelActiveTabId: "terminal-1", temporary: true, aiCompanionVisible: true });

  harness.tabList.children[0].dispatch("dblclick");

  assert.equal(harness.tabs[0].isTemporary, false);
  assert.deepEqual(harness.sidebarCalls[0], [false, false, false]);
  assert.deepEqual(harness.bottomPanelCalls[0], ["hidePanel"]);
  assert.equal(harness.bottomPanel.visible, false);
  assert.deepEqual(harness.aiCompanionCalls[0], [false, { persist: false }]);
  assert.equal(harness.body.classList.contains("ai-companion-open"), false);

  harness.tabList.children[0].dispatch("dblclick");

  assert.deepEqual(harness.sidebarCalls[1], [true, false, false]);
  assert.deepEqual(harness.bottomPanelCalls[1], ["activateTab", "terminal-1"]);
  assert.equal(harness.bottomPanel.visible, true);
  assert.equal(harness.bottomPanel.activeTabId, "terminal-1");
  assert.deepEqual(harness.aiCompanionCalls[1], [true, { persist: false }]);
  assert.equal(harness.body.classList.contains("ai-companion-open"), true);
});

test("double-click restore keeps the bottom panel and AI companion hidden when they were hidden before maximize", () => {
  const harness = createTabsHarness({ bottomPanelVisible: false });

  harness.tabList.children[0].dispatch("dblclick");
  harness.tabList.children[0].dispatch("dblclick");

  assert.deepEqual(harness.sidebarCalls, [[false, false, false], [true, false, false]]);
  assert.deepEqual(harness.bottomPanelCalls, [["hidePanel"], ["hidePanel"]]);
  assert.equal(harness.bottomPanel.visible, false);
  assert.deepEqual(harness.aiCompanionCalls, [[false, { persist: false }], [false, { persist: false }]]);
  assert.equal(harness.body.classList.contains("ai-companion-open"), false);
});

test("double-clicking a tab hides and restores the debug perspective right dock", () => {
  const harness = createTabsHarness({ javaDebugPerspectiveOpen: true });

  harness.tabList.children[0].dispatch("dblclick");

  assert.deepEqual(harness.javaDebugPanelCalls[0], ["closePerspective", { persist: false }]);
  assert.equal(harness.javaDebugPanel.perspectiveOpen, false);
  assert.deepEqual(harness.sidebarCalls[0], [false, false, false]);

  harness.tabList.children[0].dispatch("dblclick");

  assert.deepEqual(harness.javaDebugPanelCalls[1], ["openPerspective", { persist: false }]);
  assert.equal(harness.javaDebugPanel.perspectiveOpen, true);
  assert.deepEqual(harness.sidebarCalls, [[false, false, false]]);
});
test("double-clicks from a tab close button do not toggle tab maximize", () => {
  const harness = createTabsHarness({ bottomPanelVisible: true, temporary: true });
  const tabItem = harness.tabList.children[0];
  const closeButton = tabItem.children[1];

  tabItem.dispatch("dblclick", { target: closeButton });

  assert.equal(harness.tabs[0].isTemporary, true);
  assert.deepEqual(harness.sidebarCalls, []);
  assert.deepEqual(harness.bottomPanelCalls, []);
  assert.deepEqual(harness.aiCompanionCalls, []);
});
function visibleTabItems(harness) {
  return harness.tabList.children.filter((child) => child.hasClass?.("tab-item"));
}

function multiTabHarness() {
  return createTabsHarness({
    tabs: [
      { id: "tab-1", title: "One", content: "# One", savedContent: "# One", type: "markdown" },
      { id: "tab-2", title: "Two", content: "# Two", savedContent: "# Two", type: "markdown" },
      { id: "tab-3", title: "Three", content: "# Three", savedContent: "# Three", type: "markdown" }
    ],
    activeTabId: "tab-1"
  });
}

test("Ctrl-click toggles tab selection without activating the clicked tab", () => {
  const harness = multiTabHarness();
  const tabs = visibleTabItems(harness);

  tabs[1].dispatch("click", { ctrlKey: true });

  assert.equal(harness.getActiveTabId(), "tab-1");
  assert.equal(tabs[0].hasClass("selected"), true);
  assert.equal(tabs[1].hasClass("selected"), true);
  assert.equal(tabs[1].hasClass("active"), false);
});

test("Shift-click selects a tab range without activating the clicked tab", () => {
  const harness = multiTabHarness();
  const tabs = visibleTabItems(harness);

  tabs[2].dispatch("click", { shiftKey: true });

  assert.equal(harness.getActiveTabId(), "tab-1");
  assert.deepEqual(visibleTabItems(harness).map((tab) => tab.hasClass("selected")), [true, true, true]);
});

test("plain tab click clears multi-selection and activates the clicked tab", () => {
  const harness = multiTabHarness();
  let tabs = visibleTabItems(harness);
  tabs[1].dispatch("click", { ctrlKey: true });
  tabs[2].dispatch("click", { ctrlKey: true });

  tabs = visibleTabItems(harness);
  tabs[1].dispatch("click");

  assert.equal(harness.getActiveTabId(), "tab-2");
  assert.deepEqual(visibleTabItems(harness).map((tab) => tab.hasClass("selected")), [false, false, false]);
});

test("closing the active tab reports the replacement tab", async () => {
  const harness = multiTabHarness();

  await harness.api.closeTab("tab-1");

  assert.deepEqual(harness.activeTabChanges, ["tab-2"]);
});

test("closing the final tab reports that no active tab remains", async () => {
  const harness = createTabsHarness();

  await harness.api.closeTab("tab-1");

  assert.deepEqual(harness.activeTabChanges, [null]);
});

test("right-clicking an unselected tab clears the previous multi-selection", () => {
  const harness = multiTabHarness();
  let tabs = visibleTabItems(harness);
  tabs[0].dispatch("click", { ctrlKey: true });
  tabs[1].dispatch("click", { ctrlKey: true });

  tabs = visibleTabItems(harness);
  tabs[2].dispatch("contextmenu", { clientX: 20, clientY: 20 });

  assert.deepEqual(visibleTabItems(harness).map((tab) => tab.hasClass("selected")), [false, false, false]);
});
test("unsaved Kubernetes topology tabs enable direct save and Ctrl+S save dialog", async () => {
  const saveDialogCalls = [];
  const harness = createTabsHarness({
    tabs: [{
      id: "topology-tab",
      title: "Helm Topology",
      type: "kubernetes-topology",
      content: "",
      savedContent: "",
      kubernetesTopologyDirty: false
    }],
    activeTabId: "topology-tab",
    deps: {
      kubernetesTopologyDocument: {
        saveKubernetesTopologyTabToSource: async () => false,
        saveKubernetesTopologyTabWithSaveDialog: async (tab) => {
          saveDialogCalls.push(tab.id);
          tab.sourceFilePath = "C:/Vault/helm.mdviewer-k8s-topology.json";
          return true;
        }
      }
    }
  });

  assert.equal(harness.api.activeTabHasUnsavedChanges(), true);
  assert.deepEqual(harness.api.getUnsavedTabs().map((tab) => tab.id), ["topology-tab"]);

  await harness.api.saveCurrentFileIfChanged();

  assert.deepEqual(saveDialogCalls, ["topology-tab"]);
});

test("saved clean Kubernetes topology tabs do not enable direct save", () => {
  const harness = createTabsHarness({
    tabs: [{
      id: "topology-tab",
      title: "Helm Topology",
      type: "kubernetes-topology",
      content: "",
      savedContent: "",
      kubernetesTopologyDirty: false,
      sourceFileHandle: { name: "helm.mdviewer-k8s-topology.json" }
    }],
    activeTabId: "topology-tab"
  });

  assert.equal(harness.api.activeTabHasUnsavedChanges(), false);
  assert.deepEqual(harness.api.getUnsavedTabs(), []);
});
