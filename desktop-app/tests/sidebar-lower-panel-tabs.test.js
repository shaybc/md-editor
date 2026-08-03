const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function element() {
  const listeners = {};
  const classes = new Set();
  return {
    hidden: false,
    style: {},
    tabIndex: 0,
    attributes: {},
    classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }, contains(name) { return classes.has(name); } },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(name, listener) { listeners[name] = listener; },
    click() { listeners.click?.(); }
  };
}

function loadController(savedState = {}) {
  const context = { window: {} };
  context.globalThis = context.window;
  vm.createContext(context);
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/sidebar/lower-panel-tabs.js"), "utf8");
  vm.runInContext(source, context, { filename: "lower-panel-tabs.js" });
  const host = element();
  const resizer = element();
  const tabList = element();
  const writes = [];
  const api = context.window.registerMarkdownViewerSidebarLowerPanelTabs({ registerModule() {} }, {
    host, resizer, tabList,
    initialActiveViewId: savedState.sidebarLowerPanelActiveTab || "outline",
    saveGlobalState(update) { writes.push(update); }
  });
  return { api, host, resizer, tabList, writes };
}

test("lower sidebar keeps its tab title visible when one or more views are enabled", () => {
  const harness = loadController();
  const dropzone = { panel: element(), tab: element() };
  const outline = { panel: element(), tab: element() };
  harness.api.registerView({ id: "dropzone", ...dropzone, enabled: true });
  harness.api.registerView({ id: "outline", ...outline, enabled: true });
  harness.api.activate("outline", { persist: false });

  assert.equal(harness.tabList.hidden, false);
  assert.equal(outline.panel.hidden, false);
  assert.equal(dropzone.panel.hidden, true);
  assert.equal(outline.tab.attributes["aria-selected"], "true");

  harness.api.setEnabled("outline", false, { stateKey: "outlinePanelVisible" });
  assert.equal(harness.tabList.hidden, false);
  assert.equal(dropzone.panel.hidden, false);
  assert.equal(JSON.stringify(harness.writes[0]), JSON.stringify({ outlinePanelVisible: false }));
});

test("lower sidebar hides its host and resizer only when every view is disabled", () => {
  const harness = loadController();
  harness.api.registerView({ id: "dropzone", panel: element(), tab: element(), enabled: true });
  harness.api.registerView({ id: "outline", panel: element(), tab: element(), enabled: true });

  harness.api.setEnabled("dropzone", false, { persist: false, persistActive: false });
  assert.equal(harness.host.style.display, "");
  harness.api.setEnabled("outline", false, { persist: false, persistActive: false });
  assert.equal(harness.host.style.display, "none");
  assert.equal(harness.resizer.style.display, "none");
  harness.api.setEnabled("outline", true, { persist: false, persistActive: false });
  assert.equal(harness.host.style.display, "");
  assert.equal(harness.resizer.style.display, "");
});
