const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webRoot = path.resolve(__dirname, "..", "resources");

function createElement(rect = {}) {
  const listeners = new Map();
  const attributes = new Map();
  const style = {
    setProperty(name, value) { this[name] = value; },
    getPropertyValue(name) { return this[name] || ""; }
  };
  return {
    listeners,
    attributes,
    rect,
    style,
    classList: {
      added: new Set(),
      add(name) { this.added.add(name); },
      remove(name) { this.added.delete(name); },
      toggle(name, force) {
        const shouldAdd = force === undefined ? !this.added.has(name) : !!force;
        if (shouldAdd) this.added.add(name);
        else this.added.delete(name);
        return shouldAdd;
      },
      contains(name) {
        return this.added.has(name);
      }
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) || null;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    getBoundingClientRect() {
      return Object.assign({ left: 0, right: 0, width: 0, height: 0, bottom: 0 }, rect);
    }
  };
}

function createViewLayoutHarness() {
  const context = {
    window: null,
    document: {
      body: { classList: { added: new Set(), add(name) { this.added.add(name); }, remove(name) { this.added.delete(name); }, contains(name) { return this.added.has(name); } } },
      addEventListener() {}
    },
    console,
  };
  context.window = Object.assign(context, { addEventListener() {} });
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(webRoot, "js", "ui", "view-layout.js"), "utf8"),
    context
  );

  let currentViewMode = "split";
  let editorWidthPercent = 50;
  let isResizing = false;
  let isAiCompanionWidthResizing = false;
  let resizePointerOffset = 0;
  let aiCompanionPanelWidth = 380;
  const legacyEditorPane = createElement({ left: 0 });
  const legacyPreviewPane = createElement();
  const legacyDivider = createElement({ left: 400, width: 10 });
  const activeEditorPane = createElement({ left: 100 });
  const activePreviewPane = createElement();
  const activeDivider = createElement({ left: 500, width: 10 });
  const contentContainer = createElement({ left: 0, right: 900, width: 900 });
  const aiCompanionPanelElement = createElement({ width: 380 });
  const aiCompanionWidthResizer = createElement({ left: 520, width: 10 });
  let activeTargets = null;
  const viewModeChanges = [];
  const savedStatePatches = [];
  const renderRequests = [];

  const api = context.window.registerMarkdownViewerViewLayout({ services: {} }, {
    get currentViewMode() { return currentViewMode; },
    set currentViewMode(value) { currentViewMode = value; },
    get isResizing() { return isResizing; },
    set isResizing(value) { isResizing = value; },
    get resizePointerOffset() { return resizePointerOffset; },
    set resizePointerOffset(value) { resizePointerOffset = value; },
    get editorWidthPercent() { return editorWidthPercent; },
    set editorWidthPercent(value) { editorWidthPercent = value; },
    get aiCompanionPanelWidth() { return aiCompanionPanelWidth; },
    set aiCompanionPanelWidth(value) { aiCompanionPanelWidth = value; },
    get isSidebarWidthResizing() { return false; },
    set isSidebarWidthResizing(_value) {},
    get isAiCompanionWidthResizing() { return isAiCompanionWidthResizing; },
    set isAiCompanionWidthResizing(value) { isAiCompanionWidthResizing = value; },
    get isSidebarDropzoneResizing() { return false; },
    set isSidebarDropzoneResizing(_value) {},
    contentContainer,
    viewModeButtons: [],
    mobileViewModeButtons: [],
    syncToggleButtons: [],
    resizeDivider: legacyDivider,
    sidebarDropzoneResizer: null,
    sidebarWidthResizer: null,
    aiCompanionWidthResizer,
    appStatusLineElement: null,
    folderTreePane: null,
    sidebarDropzonePanel: null,
    aiCompanionPanelElement,
    editorPaneElement: legacyEditorPane,
    previewPaneElement: legacyPreviewPane,
    MIN_SIDEBAR_WIDTH: 160,
    MIN_EDITOR_WORKSPACE_WIDTH: 320,
    DEFAULT_SIDEBAR_WIDTH: 280,
    MIN_SIDEBAR_PANEL_HEIGHT: 120,
    MIN_PANE_PERCENT: 20,
    DEFAULT_AI_COMPANION_PANEL_WIDTH: 380,
    MIN_AI_COMPANION_PANEL_WIDTH: 320,
    AI_COMPANION_PANEL_MAX_WIDTH_PERCENT: 40,
    getActiveTab() { return null; },
    isPreviewableDocumentTab() { return true; },
    getAllowedViewModeForActiveTab(mode) { return mode; },
    getActiveMarkdownEditor() { return activeTargets?.markdownEditor || null; },
    getActiveEditorPane() { return activeTargets?.editorPane || null; },
    getActivePreviewPane() { return activeTargets?.previewPane || null; },
    getActiveResizeDivider() { return activeTargets?.resizeDivider || null; },
    saveGlobalState(patch) { savedStatePatches.push(patch); },
    onViewModeChanged(mode, details) { viewModeChanges.push({ mode, details }); },
    renderMarkdown(options) { renderRequests.push(options); },
    scheduleEditorLineNumbersUpdate() {},
    isSidebarVisible() { return false; }
  });

  return {
    api,
    legacyEditorPane,
    legacyPreviewPane,
    legacyDivider,
    activeEditorPane,
    activePreviewPane,
    activeDivider,
    contentContainer,
    aiCompanionPanelElement,
    aiCompanionWidthResizer,
    body: context.document.body,
    viewModeChanges,
    savedStatePatches,
    renderRequests,
    setActiveTargets(value) { activeTargets = value; }
  };
}

test("view layout resolves active editor panes and falls back to legacy panes", () => {
  const harness = createViewLayoutHarness();

  assert.equal(harness.api.getActiveLayoutTargets().editorPaneElement, harness.legacyEditorPane);
  assert.equal(harness.api.getActiveLayoutTargets().previewPaneElement, harness.legacyPreviewPane);
  assert.equal(harness.api.getActiveLayoutTargets().resizeDivider, harness.legacyDivider);

  harness.setActiveTargets({
    editorPane: harness.activeEditorPane,
    previewPane: harness.activePreviewPane,
    resizeDivider: harness.activeDivider
  });

  assert.equal(harness.api.getActiveLayoutTargets().editorPaneElement, harness.activeEditorPane);
  assert.equal(harness.api.getActiveLayoutTargets().previewPaneElement, harness.activePreviewPane);
  assert.equal(harness.api.getActiveLayoutTargets().resizeDivider, harness.activeDivider);
});

test("view layout rebinds resize listeners to the active divider", () => {
  const harness = createViewLayoutHarness();

  harness.api.refreshActiveResizeTarget();
  assert.equal(harness.legacyDivider.listeners.has("mousedown"), true);
  assert.equal(harness.legacyDivider.listeners.has("touchstart"), true);

  harness.setActiveTargets({
    editorPane: harness.activeEditorPane,
    previewPane: harness.activePreviewPane,
    resizeDivider: harness.activeDivider
  });
  harness.api.refreshActiveResizeTarget();

  assert.equal(harness.legacyDivider.listeners.has("mousedown"), false);
  assert.equal(harness.legacyDivider.listeners.has("touchstart"), false);
  assert.equal(harness.activeDivider.listeners.has("mousedown"), true);
  assert.equal(harness.activeDivider.listeners.has("touchstart"), true);
});

test("view layout applies split widths to the active panes", () => {
  const harness = createViewLayoutHarness();
  harness.setActiveTargets({
    editorPane: harness.activeEditorPane,
    previewPane: harness.activePreviewPane,
    resizeDivider: harness.activeDivider
  });

  harness.api.applyPaneWidths();

  assert.match(harness.activeEditorPane.style.flex, /^0 0 \d+px$/);
  assert.match(harness.activePreviewPane.style.flex, /^0 0 \d+px$/);
  assert.equal(harness.legacyEditorPane.style.flex, undefined);
  assert.equal(harness.legacyPreviewPane.style.flex, undefined);
});

test("view layout reports user-triggered view mode changes for tab persistence", () => {
  const harness = createViewLayoutHarness();

  harness.api.setViewMode("editor");

  assert.equal(harness.viewModeChanges.length, 1);
  assert.equal(harness.viewModeChanges[0].mode, "editor");
  assert.equal(harness.viewModeChanges[0].details.previousMode, "split");
  assert.equal(harness.savedStatePatches[0].viewMode, "editor");
});

test("view layout refreshes preview content when leaving editor-only mode", () => {
  const harness = createViewLayoutHarness();

  harness.api.setViewMode("editor");
  harness.api.setViewMode("split");

  assert.equal(harness.renderRequests.length, 1);
  assert.equal(harness.renderRequests[0].reason, "view-mode-change");
  assert.equal(harness.renderRequests[0].reuseCache, false);
});

test("view layout reports unchanged user mode clicks and repairs mode classes", () => {
  const harness = createViewLayoutHarness();

  harness.contentContainer.classList.add("view-split");
  harness.api.setViewMode("split");

  assert.equal(harness.viewModeChanges.length, 1);
  assert.equal(harness.viewModeChanges[0].mode, "split");
  assert.equal(harness.viewModeChanges[0].details.unchanged, true);
  assert.equal(harness.contentContainer.classList.contains("view-split"), true);
  assert.equal(harness.contentContainer.classList.contains("view-editor-only"), false);
});

test("view layout clamps AI companion width to forty percent of the app width", () => {
  const harness = createViewLayoutHarness();

  assert.equal(harness.api.getClampedAiCompanionPanelWidth(500), 360);
  assert.equal(harness.api.getClampedAiCompanionPanelWidth(300), 320);
});

test("view layout resizes the AI companion panel from its left border", () => {
  const harness = createViewLayoutHarness();

  harness.api.updateAiCompanionPanelWidthFromClientX(520);

  assert.equal(harness.aiCompanionPanelElement.style.getPropertyValue("--ai-companion-panel-width"), "360px");
  assert.equal(harness.aiCompanionWidthResizer.getAttribute("aria-valuenow"), "360");
});

test("view layout persists AI companion width when resizing stops", () => {
  const harness = createViewLayoutHarness();
  harness.aiCompanionPanelElement.rect.width = 340;
  harness.api.applyAiCompanionPanelWidth(340, false);
  harness.body.classList.add("ai-companion-open");
  harness.api.startAiCompanionWidthResize({ preventDefault() {} });

  harness.api.stopAiCompanionWidthResize();

  assert.equal(harness.savedStatePatches.at(-1).aiCompanionPanelWidth, 340);
});

test("view layout supports keyboard resizing for the AI companion panel", () => {
  const harness = createViewLayoutHarness();
  harness.aiCompanionPanelElement.rect.width = 340;

  harness.api.handleAiCompanionWidthResizeKeydown({ key: "ArrowLeft", shiftKey: false, preventDefault() {} });

  assert.equal(harness.aiCompanionPanelElement.style.getPropertyValue("--ai-companion-panel-width"), "350px");
});
