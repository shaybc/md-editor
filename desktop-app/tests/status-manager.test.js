const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createStatusElement() {
  const classes = new Set();
  const listeners = new Map();
  const attributes = new Map();
  return {
    textContent: "",
    dataset: {},
    tabIndex: -1,
    title: "",
    classList: {
      contains(name) {
        return classes.has(name);
      },
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }
    },
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    dispatch(name, event = {}) {
      listeners.get(name)?.(event);
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    getAttribute(name) {
      return attributes.get(name);
    }
  };
}

function loadStatusManager(getDefaultLabel) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/editor/status-manager.js"), "utf8");
  const context = { window: {}, globalThis: {} };
  vm.runInNewContext(source, context);
  const app = {
    modules: {},
    registerModule(name, api) {
      this.modules[name] = api;
    }
  };
  const statusElement = createStatusElement();
  const manager = context.window.registerMarkdownViewerStatusManager(app, { statusElement, getDefaultLabel });
  return { manager, statusElement };
}

test("status manager displays a status and restores the current default", () => {
  let defaultLabel = "Default tip";
  const { manager, statusElement } = loadStatusManager(() => defaultLabel);

  assert.equal(statusElement.textContent, "Default tip");
  assert.equal(manager.setStatus({ id: "scan", label: "Scanning...", showProgress: true }), true);
  assert.equal(statusElement.textContent, "Scanning...");
  assert.equal(statusElement.dataset.statusId, "scan");
  assert.equal(statusElement.classList.contains("status-progress-loop"), true);

  defaultLabel = "Updated tip";
  manager.refresh();
  assert.equal(statusElement.textContent, "Scanning...");

  assert.equal(manager.unsetStatus("scan"), true);
  assert.equal(statusElement.textContent, "Updated tip");
  assert.equal("statusId" in statusElement.dataset, false);
  assert.equal(statusElement.classList.contains("status-progress-loop"), false);
});

test("status manager ignores stale unset requests after replacement", () => {
  const { manager, statusElement } = loadStatusManager(() => "Default tip");

  manager.setStatus({ id: "first", label: "First", showProgress: true });
  manager.setStatus({ id: "second", label: "Second", showProgress: true });

  assert.equal(manager.unsetStatus("first"), false);
  assert.equal(statusElement.textContent, "Second");
  assert.equal(statusElement.dataset.statusId, "second");
  assert.equal(statusElement.classList.contains("status-progress-loop"), true);
});

test("status manager renders one highest-priority status and restores the remaining owner", () => {
  const { manager, statusElement } = loadStatusManager(() => "Default tip");

  manager.setStatus({ id: "highest-idle", label: "Java/Kotlin: Ready", priority: 100 });
  manager.setStatus({ id: "java-workspace", label: "Java: Initializing...", showProgress: true, priority: 10 });
  manager.setStatus({ id: "foreground-file-open", label: "Opening file...", showProgress: true, priority: -10 });
  assert.equal(statusElement.textContent, "Java: Initializing...");
  assert.equal(statusElement.dataset.statusId, "java-workspace");

  assert.equal(manager.unsetStatus("java-workspace"), true);
  assert.equal(statusElement.textContent, "Opening file...");
  assert.equal(statusElement.dataset.statusId, "foreground-file-open");

  assert.equal(manager.unsetStatus("foreground-file-open"), true);
  assert.equal(statusElement.textContent, "Java/Kotlin: Ready");
  assert.equal(manager.unsetStatus("highest-idle"), true);
  assert.equal(statusElement.textContent, "Default tip");
});

test("status manager leaves status-bar activation to the Background Processes panel", () => {
  const { manager, statusElement } = loadStatusManager(() => "Default tip");
  let cancellationCount = 0;

  manager.setStatus({
    id: "java-workspace",
    label: "Java: Importing project...",
    showProgress: true,
    cancelLabel: "Cancel Java background action",
    onCancel() { cancellationCount += 1; }
  });

  assert.equal(statusElement.textContent, "Java: Importing project...");
  assert.equal(statusElement.classList.contains("status-cancellable"), false);
  statusElement.dispatch("click");
  assert.equal(cancellationCount, 0);
  assert.equal(manager.cancelActiveStatus(), true);
  assert.equal(cancellationCount, 1);
  assert.equal(statusElement.textContent, "Java: Importing project... · Cancelling...");
  assert.equal(statusElement.classList.contains("status-cancellable"), false);
});
