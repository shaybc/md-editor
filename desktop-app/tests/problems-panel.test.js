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
    this.parentElement = null;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.type = "";
    this.title = "";
    this.value = "";
    this._textContent = "";
    this._className = "";
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

  get className() { return this._className; }
  set className(value) { this._className = String(value || ""); }

  get firstChild() { return this.children[0] || null; }
  get textContent() { return this._textContent + this.children.map((child) => child.textContent).join(""); }
  set textContent(value) {
    this._textContent = String(value || "");
    if (this._textContent === "") this.children = [];
  }

  set innerHTML(html) {
    this._innerHTML = String(html || "");
    this.children = [];
    const tagPattern = /<([a-z0-9]+)([^>]*)>/gi;
    let match;
    while ((match = tagPattern.exec(this._innerHTML))) {
      const child = new ElementStub(match[1]);
      const attrs = match[2] || "";
      const classMatch = attrs.match(/class="([^"]*)"/);
      if (classMatch) child.className = classMatch[1];
      const dataActionMatch = attrs.match(/data-action="([^"]*)"/);
      if (dataActionMatch) child.dataset.action = dataActionMatch[1];
      const dataViewMatch = attrs.match(/data-problems-view="([^"]*)"/);
      if (dataViewMatch) child.dataset.problemsView = dataViewMatch[1];
      const dataFieldMatch = attrs.match(/data-field="([^"]*)"/);
      if (dataFieldMatch) child.dataset.field = dataFieldMatch[1];
      this.appendChild(child);
    }
  }
  get innerHTML() { return this._innerHTML || ""; }

  addClass(name) {
    const classes = new Set(this.className.split(/\s+/).filter(Boolean));
    classes.add(name);
    this.className = Array.from(classes).join(" ");
  }

  removeClass(name) {
    const classes = new Set(this.className.split(/\s+/).filter(Boolean));
    classes.delete(name);
    this.className = Array.from(classes).join(" ");
  }

  hasClass(name) { return this.className.split(/\s+/).includes(name); }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...children) { children.forEach((child) => this.appendChild(child)); }

  insertBefore(child, reference) {
    child.parentElement = this;
    const index = this.children.indexOf(reference);
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
    return child;
  }

  after(node) {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    node.parentElement = this.parentElement;
    this.parentElement.children.splice(index + 1, 0, node);
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_m, char) => char.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) {
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_m, char) => char.toUpperCase());
      return this.dataset[key];
    }
    return this.attributes[name];
  }

  addEventListener(name, handler) { this.listeners[name] = handler; }
  focus() { this.focused = true; }
  contains(target) { return target === this || this.children.some((child) => child.contains(target)); }
  closest(selector) { return this.matches(selector) ? this : (this.parentElement?.closest?.(selector) || null); }
  getBoundingClientRect() { return { left: 0, right: 220, top: 0, bottom: 24, width: 220, height: 24 }; }
  matches(selector) { return selector.startsWith(".") && this.hasClass(selector.slice(1)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const results = [];
    const visit = (node) => {
      if (matchesSelector(node, selector)) results.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return results;
  }
}

function matchesSelector(node, selector) {
  if (selector === ".graph-context-menu-item:not(:disabled)") return node.hasClass("graph-context-menu-item") && !node.disabled;
  if (/^[a-z0-9]+$/i.test(selector)) return node.tagName.toLowerCase() === selector.toLowerCase();
  if (selector.startsWith(".")) return selector.slice(1).split(".").every((className) => node.hasClass(className));
  const dataAction = selector.match(/^\[data-action="([^"]+)"\]$/);
  if (dataAction) return node.dataset.action === dataAction[1];
  const dataView = selector.match(/^\[data-problems-view="([^"]+)"\]$/);
  if (dataView) return node.dataset.problemsView === dataView[1];
  const dataField = selector.match(/^\[data-field="([^"]+)"\]$/);
  if (dataField) return node.dataset.field === dataField[1];
  const dataFilter = selector.match(/^\[data-problems-filter(?:="([^"]+)")?\]$/);
  if (dataFilter) return dataFilter[1] === undefined || node.dataset.problemsFilter === dataFilter[1];
  return false;
}

function createHarness(options = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/panels/problems-panel.js"), "utf8");
  const view = new ElementStub("section", "bottom-panel-problems");
  const summaryRow = new ElementStub("div");
  const summary = new ElementStub("span", "problems-panel-summary");
  const body = new ElementStub("div", "problems-panel-body");
  const documentBody = new ElementStub("body");
  summaryRow.appendChild(summary);
  view.append(summaryRow, body);
  const elements = {
    "bottom-panel-problems": view,
    "problems-panel-summary": summary,
    "problems-panel-body": body
  };
  const bottomPanelTabs = [];
  const clipboardWrites = [];
  const alerts = [];
  const context = {
    console,
    document: {
      body: documentBody,
      documentElement: { dataset: { appZoomPercent: String(options.appZoomPercent || 100) } },
      createElement: (tag) => new ElementStub(tag),
      createTextNode: (text) => {
        const node = new ElementStub("span");
        node.textContent = text;
        return node;
      },
      createDocumentFragment: () => new ElementStub("fragment"),
      getElementById: (id) => elements[id] || null,
      querySelector: () => null,
      addEventListener: () => {}
    },
    navigator: { clipboard: { writeText: async (text) => clipboardWrites.push(text) } },
    isSecureContext: true,
    innerWidth: 1200,
    innerHeight: 800,
    setTimeout,
    clearTimeout,
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
    alert: (message) => alerts.push(message)
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "problems-panel.js" });
  const app = { registerModule() {} };
  const api = context.window.registerMarkdownViewerProblemsPanel(app, {
    bottomPanel: {
      addTab: (tab) => bottomPanelTabs.push(tab),
      activateTab: () => null,
      isPanelVisible: () => options.panelVisible !== false,
      getActiveTabId: () => options.activeTabId || "problems"
    },
    view,
    summary,
    body,
    getActiveProjectPath: () => "C:/Project",
    openDiagnostic: () => {},
    canOpenQuickFix: (diagnostic) => diagnostic.source === "jdt",
    isDesktopRuntime: () => false,
    ...options.deps
  });
  return { api, body, summary, toolbar: summary.parentElement, documentBody, bottomPanelTabs, clipboardWrites, alerts };
}

function clickInnerTab(body, viewId) {
  const tab = body.querySelector(`[data-problems-view="${viewId}"]`);
  assert.ok(tab, `missing ${viewId} tab`);
  tab.listeners.click({});
}

const sampleDiagnostics = [
  { severity: "error", message: "Cannot resolve method", filePath: "C:/Project/src/Main.java", line: 6, column: 10, source: "jdt" },
  { severity: "warning", message: "Unused value", filePath: "C:/Project/src/Main.java", line: 9, column: 5, source: "jdt" },
  { severity: "warning", message: "Other file warning", filePath: "C:/Project/src/Other.java", line: 3, column: 1, source: "jdt" },
  { severity: "error", message: "Maven rebuild failed", source: "maven" }
];

test("registers one bottom Problems tab with three internal views", () => {
  const harness = createHarness();
  harness.api.setDiagnosticCollection("test", sampleDiagnostics);

  assert.deepEqual(harness.bottomPanelTabs.map((tab) => tab.id), ["problems"]);
  assert.deepEqual(harness.toolbar.querySelectorAll(".problems-panel-inner-tab").map((tab) => tab.textContent), ["Problems 4", "Files 3", "Project 1"]);
});

test("Problems internal view keeps the original table", () => {
  const harness = createHarness();
  harness.api.setDiagnosticCollection("test", sampleDiagnostics);

  assert.ok(harness.body.querySelector(".problems-panel-header"));
  assert.equal(harness.body.querySelectorAll(".problems-panel-row").length, 4);
  assert.equal(harness.body.querySelectorAll(".problems-panel-tree-row").length, 0);
});

test("Files internal view groups all file-backed diagnostics by file", () => {
  const harness = createHarness();
  harness.api.setDiagnosticCollection("test", sampleDiagnostics);
  clickInnerTab(harness.toolbar, "files");

  assert.deepEqual(harness.body.querySelectorAll(".problems-panel-tree-group-name").map((node) => node.textContent), ["Main.java", "Other.java"]);
  assert.deepEqual(harness.body.querySelectorAll(".problems-panel-tree-group-count").map((node) => node.textContent), ["2 problems", "1 problem"]);
  assert.equal(harness.body.querySelectorAll(".problems-panel-tree-row").length, 3);
});

test("Project internal view shows only fileless diagnostics", () => {
  const harness = createHarness();
  harness.api.setDiagnosticCollection("test", sampleDiagnostics);
  clickInnerTab(harness.toolbar, "project");

  assert.deepEqual(harness.body.querySelectorAll(".problems-panel-tree-group-name").map((node) => node.textContent), ["Project"]);
  assert.deepEqual(harness.body.querySelectorAll(".problems-panel-tree-row").map((row) => row.textContent), ["Maven rebuild failedmaven"]);
});

test("group and diagnostic rows carry severity classes for colored icons", () => {
  const harness = createHarness();
  harness.api.setDiagnosticCollection("test", sampleDiagnostics);
  clickInnerTab(harness.toolbar, "files");

  const groups = harness.body.querySelectorAll(".problems-panel-tree-group");
  assert.equal(groups[0].classList.contains("problems-panel-error"), true);
  assert.equal(groups[1].classList.contains("problems-panel-warning"), true);
  const rows = harness.body.querySelectorAll(".problems-panel-tree-row");
  assert.equal(rows[0].classList.contains("problems-panel-error"), true);
  assert.equal(rows[1].classList.contains("problems-panel-warning"), true);
});

test("Files internal view file groups can collapse and expand", () => {
  const harness = createHarness();
  harness.api.setDiagnosticCollection("test", sampleDiagnostics);
  clickInnerTab(harness.toolbar, "files");

  assert.equal(harness.body.querySelectorAll(".problems-panel-tree-row").length, 3);
  harness.body.querySelector(".problems-panel-tree-group").listeners.click({ preventDefault() {} });

  assert.equal(harness.body.querySelector(".problems-panel-tree-group").getAttribute("aria-expanded"), "false");
  assert.equal(harness.body.querySelectorAll(".problems-panel-tree-row").length, 1);

  harness.body.querySelector(".problems-panel-tree-group").listeners.click({ preventDefault() {} });

  assert.equal(harness.body.querySelector(".problems-panel-tree-group").getAttribute("aria-expanded"), "true");
  assert.equal(harness.body.querySelectorAll(".problems-panel-tree-row").length, 3);
});

test("Files internal view toolbar button collapses and expands all file groups", () => {
  const harness = createHarness();
  harness.api.setDiagnosticCollection("test", sampleDiagnostics);
  clickInnerTab(harness.toolbar, "files");
  const reloadButton = harness.toolbar.querySelector(".problems-panel-reload-button");
  const toggleButton = harness.toolbar.querySelector(".problems-panel-file-groups-toggle-button");

  assert.ok(toggleButton, "missing file-group toggle button");
  assert.equal(harness.toolbar.children.indexOf(toggleButton), harness.toolbar.children.indexOf(reloadButton) + 1);
  assert.equal(toggleButton.hidden, false);
  assert.match(toggleButton.title, /Collapse all/);

  toggleButton.listeners.click({ preventDefault() {}, stopPropagation() {} });

  assert.equal(harness.body.querySelectorAll(".problems-panel-tree-row").length, 0);
  assert.deepEqual(harness.body.querySelectorAll(".problems-panel-tree-group").map((group) => group.getAttribute("aria-expanded")), ["false", "false"]);
  assert.match(harness.toolbar.querySelector(".problems-panel-file-groups-toggle-button").title, /Expand all/);

  harness.toolbar.querySelector(".problems-panel-file-groups-toggle-button").listeners.click({ preventDefault() {}, stopPropagation() {} });

  assert.equal(harness.body.querySelectorAll(".problems-panel-tree-row").length, 3);
  assert.deepEqual(harness.body.querySelectorAll(".problems-panel-tree-group").map((group) => group.getAttribute("aria-expanded")), ["true", "true"]);
});

test("Problems filter shows every category by default and can exclude informational diagnostics", () => {
  const harness = createHarness();
  harness.api.setDiagnosticCollection("test", [
    { severity: "error", message: "Broken", filePath: "C:/Project/src/Main.java", line: 1, column: 1 },
    { severity: "info", message: "For information", filePath: "C:/Project/src/Main.java", line: 2, column: 1 }
  ]);
  const filterButton = harness.toolbar.querySelector(".problems-panel-filter-button");
  filterButton.listeners.click({ preventDefault() {}, stopPropagation() {} });
  const showInfoButton = harness.documentBody.querySelector('[data-problems-filter="showInfo"]');

  assert.ok(showInfoButton, "missing Info filter");
  const filterItems = harness.documentBody.querySelectorAll(".problems-panel-filter-menu-item");
  assert.equal(filterItems.length, 5);
  assert.equal(filterItems.every((button) => button.getAttribute("aria-checked") === "true"), true);
  assert.equal(harness.body.querySelectorAll(".problems-panel-row").length, 2);
  showInfoButton.listeners.click({ preventDefault() {}, stopPropagation() {} });

  assert.equal(showInfoButton.getAttribute("aria-checked"), "false");
  assert.equal(harness.body.querySelectorAll(".problems-panel-row").length, 1);
  assert.equal(harness.body.textContent.includes("For information"), false);
  assert.equal(harness.toolbar.querySelector(".problems-panel-filter-active-label").textContent, "Clear filter");
});

test("reload reports a Java build-neutral result when no diagnostics are parsed", async () => {
  const harness = createHarness({
    deps: {
      getRebuildOutput: async () => "javac @sources.txt\n",
      parseRebuildDiagnostics: () => []
    }
  });

  harness.toolbar.querySelector(".problems-panel-reload-button").listeners.click({});
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.alerts.at(-1), "Java Rebuild output was re-parsed, but no Java build problems were found.");
  assert.equal(harness.api.getDiagnostics().length, 0);
});
test("Files internal view select all copies all file entries and clears selection", async () => {
  const harness = createHarness();
  harness.api.setDiagnosticCollection("test", sampleDiagnostics);
  clickInnerTab(harness.toolbar, "files");
  const contextMenu = harness.documentBody.querySelector(".problems-panel-context-menu");

  harness.body.querySelector(".problems-panel-tree-row").listeners.contextmenu({ preventDefault() {}, clientX: 12, clientY: 18 });
  contextMenu.querySelector('[data-action="select-all"]').listeners.click({});

  assert.equal(harness.body.querySelectorAll(".problems-panel-tree-row.selected").length, 3);

  await contextMenu.querySelector('[data-action="copy"]').listeners.click({});

  assert.equal(harness.clipboardWrites.length, 1);
  assert.match(harness.clipboardWrites[0], /Cannot resolve method/);
  assert.match(harness.clipboardWrites[0], /Unused value/);
  assert.match(harness.clipboardWrites[0], /Other file warning/);
  assert.doesNotMatch(harness.clipboardWrites[0], /Maven rebuild failed/);
  assert.equal(harness.body.querySelectorAll(".problems-panel-tree-row.selected").length, 0);
});

test("Project internal view select all copies project entries and clears selection", async () => {
  const harness = createHarness();
  harness.api.setDiagnosticCollection("test", sampleDiagnostics);
  clickInnerTab(harness.toolbar, "project");
  const contextMenu = harness.documentBody.querySelector(".problems-panel-context-menu");

  harness.body.querySelector(".problems-panel-tree-row").listeners.contextmenu({ preventDefault() {}, clientX: 12, clientY: 18 });
  contextMenu.querySelector('[data-action="select-all"]').listeners.click({});
  await contextMenu.querySelector('[data-action="copy"]').listeners.click({});

  assert.equal(harness.clipboardWrites.length, 1);
  assert.match(harness.clipboardWrites[0], /Maven rebuild failed/);
  assert.doesNotMatch(harness.clipboardWrites[0], /Cannot resolve method/);
  assert.equal(harness.body.querySelectorAll(".problems-panel-tree-row.selected").length, 0);
});

test("Files and Project internal views select all can delete all entries in that view", async () => {
  const filesHarness = createHarness();
  filesHarness.api.setDiagnosticCollection("test", sampleDiagnostics);
  clickInnerTab(filesHarness.toolbar, "files");
  const filesMenu = filesHarness.documentBody.querySelector(".problems-panel-context-menu");
  filesHarness.body.querySelector(".problems-panel-tree-row").listeners.contextmenu({ preventDefault() {}, clientX: 12, clientY: 18 });
  filesMenu.querySelector('[data-action="select-all"]').listeners.click({});
  await filesMenu.querySelector('[data-action="delete"]').listeners.click({});

  assert.equal(filesHarness.api.getDiagnostics().map((diagnostic) => diagnostic.message).join("|"), "Maven rebuild failed");

  const projectHarness = createHarness();
  projectHarness.api.setDiagnosticCollection("test", sampleDiagnostics);
  clickInnerTab(projectHarness.toolbar, "project");
  const projectMenu = projectHarness.documentBody.querySelector(".problems-panel-context-menu");
  projectHarness.body.querySelector(".problems-panel-tree-row").listeners.contextmenu({ preventDefault() {}, clientX: 12, clientY: 18 });
  projectMenu.querySelector('[data-action="select-all"]').listeners.click({});
  await projectMenu.querySelector('[data-action="delete"]').listeners.click({});

  assert.equal(projectHarness.api.getDiagnostics().map((diagnostic) => diagnostic.message).join("|"), "Cannot resolve method|Unused value|Other file warning");
});
test("context menu is available from grouped diagnostic rows but not group headers", () => {
  const harness = createHarness();
  harness.api.setDiagnosticCollection("test", sampleDiagnostics);
  clickInnerTab(harness.toolbar, "files");
  const contextMenu = harness.documentBody.querySelector(".problems-panel-context-menu");
  const row = harness.body.querySelector(".problems-panel-tree-row");
  const group = harness.body.querySelector(".problems-panel-tree-group");

  row.listeners.contextmenu({ preventDefault() {}, clientX: 12, clientY: 18 });
  assert.equal(contextMenu.classList.contains("hidden"), false);
  assert.equal(contextMenu.querySelector('[data-action="go-to-line"]').disabled, false);
  assert.equal(contextMenu.querySelector('[data-action="quick-fix"]').disabled, false);
  assert.equal(group.listeners.contextmenu, undefined);
});

test("protected JDT analysis collection survives deletion and build collection replacement", async () => {
  const harness = createHarness({ deps: { canOpenQuickFix: (diagnostic) => diagnostic.diagnosticKind === "jdt-project-analysis" } });
  harness.api.setDiagnosticCollection("jdt-project-analysis", [{
    severity: "error",
    message: "Java project analysis failed",
    source: "JDT Project Analysis",
    diagnosticKind: "jdt-project-analysis"
  }], { userDeletable: false });
  harness.api.setDiagnosticCollection("lsp:java:file:///C:/Project/src/Main.java", [{
    severity: "warning",
    message: "Unused value",
    filePath: "C:/Project/src/Main.java",
    source: "jdt"
  }]);
  harness.api.setDiagnostics([{ severity: "error", message: "Maven rebuild failed", source: "maven" }]);
  clickInnerTab(harness.toolbar, "project");
  const contextMenu = harness.documentBody.querySelector(".problems-panel-context-menu");
  const rows = harness.body.querySelectorAll(".problems-panel-tree-row");
  const jdtRow = rows.find((row) => row.textContent.includes("Java project analysis failed"));

  jdtRow.listeners.contextmenu({ preventDefault() {}, clientX: 12, clientY: 18 });
  assert.equal(contextMenu.querySelector('[data-action="delete"]').disabled, true);
  harness.api.setDiagnostics([], { revealErrors: false });

  assert.deepEqual(JSON.parse(JSON.stringify(harness.api.getDiagnostics().map((diagnostic) => diagnostic.message))), ["Java project analysis failed", "Unused value"]);
});

test("context menu stays under the pointer and inside the viewport at app zoom", () => {
  const harness = createHarness({ appZoomPercent: 125 });
  harness.api.setDiagnosticCollection("test", sampleDiagnostics);
  const contextMenu = harness.documentBody.querySelector(".problems-panel-context-menu");
  const row = harness.body.querySelector(".problems-panel-row");

  row.listeners.contextmenu({ preventDefault() {}, clientX: 100, clientY: 200 });
  assert.equal(contextMenu.style.left, "80px");
  assert.equal(contextMenu.style.top, "160px");

  harness.body.querySelector(".problems-panel-row").listeners.contextmenu({ preventDefault() {}, clientX: 1190, clientY: 790 });
  assert.equal(contextMenu.style.left, "780.8px");
  assert.equal(contextMenu.style.top, "617.6px");
});

test("hidden Problems panel accepts JDT counts without querying or rendering rows", () => {
  let summaryListener = null;
  let queryCount = 0;
  const harness = createHarness({
    panelVisible: false,
    deps: {
      subscribeJdtDiagnosticSummary(listener) {
        summaryListener = listener;
        return () => {};
      },
      async getJdtProblems() {
        queryCount += 1;
        return { revision: 1, problems: [], totalCount: 10, availableCount: 10, maximumProblems: 1000 };
      }
    }
  });
  summaryListener({ workspaceRoot: "C:/Project", revision: 1, totalCount: 10, availableCount: 10, maximumProblems: 1000 });
  assert.equal(queryCount, 0);
  assert.equal(harness.body.querySelectorAll(".problems-panel-row").length, 0);
  assert.equal(harness.summary.textContent.includes("10 problems reported"), true);
});

test("Problems retries a transient first-page failure without displaying zero reported problems", async () => {
  let summaryListener = null;
  let requestCount = 0;
  const harness = createHarness({
    deps: {
      getJdtProblemRetryDelays: () => [0, 0, 0],
      subscribeJdtDiagnosticSummary(listener) {
        summaryListener = listener;
        return () => {};
      },
      async getJdtProblems() {
        requestCount += 1;
        if (requestCount < 3) throw new Error("temporary query timeout");
        return {
          revision: 3,
          snapshotId: "retried-snapshot",
          snapshotRevision: 3,
          problems: [{ severity: "warning", message: "Recovered problem", filePath: "C:/Project/src/Main.java", source: "jdt" }],
          totalCount: 3209,
          availableCount: 1000,
          maximumProblems: 1000
        };
      }
    }
  });

  summaryListener({ workspaceRoot: "C:/Project", revision: 1, totalCount: 3209, availableCount: 1000, maximumProblems: 1000 });
  harness.bottomPanelTabs[0].onActivate();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(requestCount, 3);
  assert.equal(harness.body.querySelectorAll(".problems-panel-row").length, 1);
  assert.equal(harness.summary.textContent.includes("Displaying 1 problems out of 3209"), true);
  assert.equal(harness.summary.textContent.includes("Displaying 0"), false);
});

test("Problems replaces an empty stale snapshot with a fresh first page", async () => {
  let summaryListener = null;
  const requests = [];
  const harness = createHarness({
    deps: {
      subscribeJdtDiagnosticSummary(listener) {
        summaryListener = listener;
        return () => {};
      },
      async getJdtProblems(options) {
        requests.push(options.snapshotId);
        if (requests.length === 1) {
          return {
            revision: 1,
            snapshotId: "old-snapshot",
            snapshotRevision: 1,
            problems: [{ problemId: "old", severity: "warning", message: "Old problem", filePath: "C:/Project/src/Old.java", source: "jdt" }],
            totalCount: 1,
            availableCount: 1,
            maximumProblems: 1000
          };
        }
        if (options.snapshotId) {
          return {
            revision: 2,
            snapshotId: "old-snapshot",
            snapshotRevision: 2,
            problems: [],
            totalCount: 3209,
            availableCount: 3209,
            maximumProblems: 1000
          };
        }
        return {
          revision: 2,
          snapshotId: "fresh-snapshot",
          snapshotRevision: 2,
          problems: [{ problemId: "fresh", severity: "warning", message: "Fresh problem", filePath: "C:/Project/src/Fresh.java", source: "jdt" }],
          totalCount: 3209,
          availableCount: 3209,
          maximumProblems: 1000
        };
      }
    }
  });

  summaryListener({ workspaceRoot: "C:/Project", revision: 1, totalCount: 1, availableCount: 1, maximumProblems: 1000 });
  harness.bottomPanelTabs[0].onActivate();
  await new Promise((resolve) => setTimeout(resolve, 10));
  summaryListener({ workspaceRoot: "C:/Project", revision: 2, totalCount: 3209, availableCount: 3209, maximumProblems: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(requests, ["", "old-snapshot", ""]);
  assert.equal(harness.body.querySelectorAll(".problems-panel-row").length, 1);
  assert.equal(harness.body.textContent.includes("Fresh problem"), true);
  assert.equal(harness.summary.textContent.includes("Displaying 1 problems out of 3209"), true);
});

test("failed project analysis removes loaded JDT rows and keeps the single protected failure", () => {
  let summaryListener = null;
  const harness = createHarness({
    deps: {
      subscribeJdtDiagnosticSummary(listener) {
        summaryListener = listener;
        return () => {};
      }
    }
  });
  harness.api.setDiagnosticCollection("lsp:java:proxy", [{
    severity: "error",
    message: "Cascading missing type",
    filePath: "C:/Project/src/Main.java",
    source: "jdt"
  }]);
  harness.api.setDiagnosticCollection("jdt-project-analysis", [{
    severity: "error",
    message: "Java diagnostics unavailable because Gradle import failed.",
    source: "JDT Project Analysis",
    diagnosticKind: "jdt-project-analysis"
  }], { userDeletable: false });

  summaryListener({ workspaceRoot: "C:/Project", revision: 2, totalCount: 0, availableCount: 0, maximumProblems: 1000, analysisAvailable: false });

  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.api.getDiagnostics().map((diagnostic) => diagnostic.message))),
    ["Java diagnostics unavailable because Gradle import failed."]
  );
  assert.equal(harness.summary.textContent.includes("1 error"), true);
});

test("project-wide JDT diagnostics wait for readiness and retain the committed snapshot during an overlapping build", async () => {
  let summaryListener = null;
  let requestCount = 0;
  const harness = createHarness({
    deps: {
      isJdtAnalysisReady() { return false; },
      subscribeJdtDiagnosticSummary(listener) {
        summaryListener = listener;
        return () => {};
      },
      async getJdtProblems() {
        requestCount += 1;
        return {
          revision: requestCount,
          snapshotId: `snapshot-${requestCount}`,
          snapshotRevision: requestCount,
          problems: [{ severity: "warning", message: "Provisional warning", filePath: "C:/Project/src/Main.java", source: "jdt" }],
          totalCount: 4936,
          availableCount: 1000,
          maximumProblems: 1000
        };
      }
    }
  });

  summaryListener({ workspaceRoot: "C:/Project", generationId: 1, revision: 1, totalCount: 4936, availableCount: 1000, maximumProblems: 1000 });
  harness.bottomPanelTabs[0].onActivate();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requestCount, 0);
  assert.equal(harness.summary.textContent.includes("4936"), false);

  harness.api.setJdtAnalysisReady(true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requestCount, 1);
  assert.equal(harness.summary.textContent.includes("Displaying 1 problems out of 4936"), true);
  harness.api.setAnalysisGenerationState({ status: "running", generationId: 2, workspaceRoot: "C:/Project" });
  assert.equal(harness.summary.textContent, "");

  harness.api.setJdtDiagnosticsSuspended(true, { discardPending: true });
  summaryListener({ workspaceRoot: "C:/Project", revision: 2, totalCount: 5000, availableCount: 1000, maximumProblems: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requestCount, 1);
  assert.equal(harness.api.getDiagnostics().length, 1);

  harness.api.setJdtDiagnosticsSuspended(false);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requestCount, 2);
});

test("Problems keeps the summary silent during analysis and notifies once when analysis is incomplete", async () => {
  const harness = createHarness();
  harness.api.setDiagnostics([
    { severity: "warning", message: "Committed warning", filePath: "C:/Project/src/Main.java", source: "jdt" }
  ]);
  harness.api.setAnalysisGenerationState({ status: "running", generationId: 2, workspaceRoot: "C:/Project" });
  assert.equal(harness.api.getDiagnostics().length, 1);
  assert.equal(harness.summary.textContent, "");

  harness.api.setAnalysisGenerationState({
    status: "incomplete",
    generationId: 2,
    workspaceRoot: "C:/Project",
    failure: { code: "timeout", summary: "Timed out.", fatal: false }
  });
  assert.equal(harness.api.getDiagnostics().length, 1);
  assert.doesNotMatch(harness.summary.textContent, /Analysis incomplete|Timed out/);
  assert.equal(harness.alerts.length, 0);

  harness.api.setAnalysisGenerationState({
    status: "incomplete",
    generationId: 3,
    workspaceRoot: "C:/Project",
    failure: { code: "java-analysis-failed", summary: "Java failed.", fatal: true }
  });
  assert.equal(harness.alerts.length, 1);
  assert.equal(harness.alerts[0].title, "Project Analysis Incomplete");
  assert.equal(harness.alerts[0].message, "Java failed.");

  harness.api.setAnalysisGenerationState({
    status: "incomplete",
    generationId: 3,
    workspaceRoot: "C:/Project",
    failure: { code: "java-analysis-failed", summary: "Java failed.", fatal: true }
  });
  assert.equal(harness.alerts.length, 1);

  harness.api.setAnalysisGenerationState({
    status: "incomplete",
    generationId: 4,
    workspaceRoot: "C:/Project",
    failure: { code: "java-analysis-failed", summary: "Java failed.", fatal: true, notificationHandled: true }
  });
  assert.equal(harness.alerts.length, 1);
});

test("Problems activation uses the configured initial JDT limit and Load the rest reaches the available maximum", async () => {
  let summaryListener = null;
  const requestedLimits = [];
  const createProblems = (count, start = 0) => Array.from({ length: count }, (_value, index) => ({
    severity: "error",
    message: `problem ${start + index}`,
    filePath: `C:/Project/src/File${start + index}.java`,
    line: start + index + 1,
    column: 1,
    source: "jdt"
  }));
  const harness = createHarness({
    deps: {
      getInitialJdtProblemLimit() { return 75; },
      subscribeJdtDiagnosticSummary(listener) {
        summaryListener = listener;
        return () => {};
      },
      async getJdtProblems(options) {
        requestedLimits.push([options.offset, options.limit, options.snapshotId]);
        const count = Math.min(options.limit, 1000);
        return {
          revision: 4,
          snapshotId: options.snapshotId || "stable-snapshot",
          snapshotRevision: 4,
          problems: createProblems(count, options.offset),
          totalCount: 1200,
          availableCount: 1000,
          maximumProblems: 1000
        };
      }
    }
  });
  summaryListener({ workspaceRoot: "C:/Project", revision: 4, totalCount: 1200, availableCount: 1000, maximumProblems: 1000 });
  harness.bottomPanelTabs[0].onActivate();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(requestedLimits, [[0, 75, ""]]);
  assert.equal(harness.body.querySelectorAll(".problems-panel-row").length, 75);
  assert.equal(harness.summary.textContent.includes("Displaying 75 problems out of 1200"), true);
  let loadRestButton = harness.summary.querySelector(".problems-panel-load-rest");
  assert.equal(loadRestButton.title, "Load the rest of the problems (up to 1,000 max)");
  assert.equal(loadRestButton.getAttribute("aria-label"), loadRestButton.title);
  assert.ok(loadRestButton.querySelector(".bi-chevron-double-down"));

  summaryListener({ workspaceRoot: "C:/Project", revision: 5, totalCount: 1300, availableCount: 1000, maximumProblems: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(requestedLimits, [[0, 75, ""], [0, 75, "stable-snapshot"]]);
  assert.equal(harness.body.querySelectorAll(".problems-panel-row")[0].textContent.includes("problem 0"), true);
  assert.equal(harness.summary.textContent.includes("Updated problems available"), true);

  loadRestButton = harness.summary.querySelector(".problems-panel-load-rest");
  loadRestButton.listeners.click({});
  for (let attempt = 0; attempt < 50 && harness.body.querySelectorAll(".problems-panel-row").length < 1000; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.deepEqual(requestedLimits, [[0, 75, ""], [0, 75, "stable-snapshot"], [75, 925, "stable-snapshot"], [0, 1000, "stable-snapshot"]]);
  assert.equal(harness.body.querySelectorAll(".problems-panel-row").length, 1000);
  assert.equal(harness.summary.textContent.includes("Only 1000 are available"), true);
});

test("active Problems snapshot fills to 100 and removes visible diagnostics retracted by JDT", async () => {
  let summaryListener = null;
  let requestCount = 0;
  let resolveInitialProblems = null;
  const requestedLimits = [];
  const createProblems = (count, start = 0) => Array.from({ length: count }, (_value, index) => ({
    problemId: `problem-${start + index}`,
    severity: "warning",
    message: `problem ${start + index}`,
    filePath: `C:/Project/src/File${start + index}.java`,
    line: start + index + 1,
    column: 1,
    source: "jdt"
  }));
  const harness = createHarness({
    deps: {
      subscribeJdtDiagnosticSummary(listener) {
        summaryListener = listener;
        return () => {};
      },
      async getJdtProblems(options) {
        requestedLimits.push([options.offset, options.limit, options.snapshotId]);
        requestCount += 1;
        if (requestCount === 1) return new Promise((resolve) => { resolveInitialProblems = resolve; });
        const problems = requestCount === 2 ? createProblems(100) : createProblems(99, 1);
        return {
          revision: requestCount,
          snapshotId: "stable-snapshot",
          snapshotRevision: requestCount,
          problems,
          totalCount: requestCount === 2 ? 120 : 119,
          availableCount: requestCount === 2 ? 120 : 119,
          maximumProblems: 1000
        };
      }
    }
  });

  summaryListener({ workspaceRoot: "C:/Project", revision: 1, totalCount: 2, availableCount: 2, maximumProblems: 1000 });
  harness.bottomPanelTabs[0].onActivate();
  await new Promise((resolve) => setTimeout(resolve, 0));
  summaryListener({ workspaceRoot: "C:/Project", revision: 2, totalCount: 120, availableCount: 120, maximumProblems: 1000 });
  resolveInitialProblems({
    revision: 1,
    snapshotId: "stable-snapshot",
    snapshotRevision: 1,
    problems: createProblems(2),
    totalCount: 2,
    availableCount: 2,
    maximumProblems: 1000
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(harness.body.querySelectorAll(".problems-panel-row").length, 100);

  summaryListener({ workspaceRoot: "C:/Project", revision: 3, totalCount: 119, availableCount: 119, maximumProblems: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(requestedLimits, [[0, 100, ""], [0, 100, "stable-snapshot"], [0, 100, "stable-snapshot"]]);
  assert.equal(harness.body.querySelectorAll(".problems-panel-row").length, 99);
  assert.equal(harness.api.getDiagnostics().some((problem) => problem.problemId === "problem-0"), false);
});
test("folder-backed diagnostics remain project entries and never open as files", async () => {
  let openCount = 0;
  const harness = createHarness({
    deps: {
      openDiagnostic: async () => { openCount += 1; },
      isDesktopRuntime: () => true,
      Neutralino: {
        filesystem: {
          async getStats() { return { type: "DIRECTORY" }; }
        }
      }
    }
  });
  harness.api.setDiagnostics([{
    severity: "error",
    message: "The project cannot be built until build path errors are resolved",
    filePath: "C:/Project/module",
    targetKind: "project",
    line: 1,
    column: 1,
    source: "jdt"
  }]);

  clickInnerTab(harness.toolbar, "files");
  assert.match(harness.body.textContent, /No problems match/);
  clickInnerTab(harness.toolbar, "project");
  const row = harness.body.querySelector(".problems-panel-tree-row");
  assert.ok(row);
  assert.equal(row.querySelector(".problems-panel-tree-line").textContent, "");
  await row.listeners.click({});
  assert.equal(openCount, 0);
});
