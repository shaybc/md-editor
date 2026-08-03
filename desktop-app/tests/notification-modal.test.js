const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "resources");

class FakeClassList {
  constructor(element) {
    this.element = element;
  }

  add(...classes) {
    const current = new Set(String(this.element.className || "").split(/\s+/).filter(Boolean));
    classes.forEach((className) => current.add(className));
    this.element.className = Array.from(current).join(" ");
  }

  contains(className) {
    return String(this.element.className || "").split(/\s+/).includes(className);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.eventListeners = {};
    this.className = "";
    this.hidden = false;
    this.textContent = "";
    this.classList = new FakeClassList(this);
  }

  set id(value) {
    this._id = value;
    if (this.ownerDocument) this.ownerDocument.elementsById.set(value, this);
  }

  get id() {
    return this._id || "";
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "id") this.id = value;
    if (name === "class") this.className = value;
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  append(...nodes) {
    nodes.forEach((node) => this.appendChild(node));
  }

  appendChild(node) {
    this.children.push(node);
    node.parentElement = this;
    return node;
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.textContent = "";
    this.append(...nodes);
  }

  addEventListener(type, listener) {
    this.eventListeners[type] = this.eventListeners[type] || [];
    this.eventListeners[type].push(listener);
  }

  dispatchEvent(event) {
    event.target = event.target || this;
    (this.eventListeners[event.type] || []).forEach((listener) => listener(event));
  }

  click() {
    this.dispatchEvent({ type: "click", target: this });
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const result = [];
    const matches = (element) => {
      if (!(element instanceof FakeElement)) return false;
      if (selector.startsWith("#")) return element.id === selector.slice(1);
      if (selector.startsWith(".")) return element.classList.contains(selector.slice(1));
      if (selector === '[role="dialog"]') return element.getAttribute("role") === "dialog";
      if (selector === "[data-notification-button-id]") return Boolean(element.dataset.notificationButtonId);
      const dataMatch = selector.match(/^\[data-notification-button-id="(.+)"\]$/);
      if (dataMatch) return element.dataset.notificationButtonId === dataMatch[1];
      if (selector === "[data-notification-button-id].settings-primary-action") {
        return Boolean(element.dataset.notificationButtonId) && element.classList.contains("settings-primary-action");
      }
      return false;
    };
    const visit = (element) => {
      if (matches(element)) result.push(element);
      element.children.forEach((child) => {
        if (child instanceof FakeElement) visit(child);
      });
    };
    visit(this);
    return result;
  }
}

class FakeTextNode {
  constructor(text) {
    this.textContent = text;
  }
}

class FakeDocument {
  constructor() {
    this.elementsById = new Map();
    this.body = new FakeElement("body", this);
    this.activeElement = this.body;
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  createTextNode(text) {
    return new FakeTextNode(text);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

function loadNotificationModal(options = {}) {
  const source = fs.readFileSync(path.join(repoRoot, "js", "ui", "notification-modal.js"), "utf8");
  const document = new FakeDocument();
  const app = {
    services: {},
    modules: {},
    registerModule(name, api) {
      this.modules[name] = api;
    }
  };
  const context = {
    console,
    document,
    window: { document },
    globalThis: {},
    Node: FakeElement,
    module: { exports: {} }
  };
  context.window.Node = FakeElement;
  vm.runInNewContext(source, context, { filename: "notification-modal.js" });
  const api = context.window.registerMarkdownViewerNotificationModal(app, {
    document,
    getComputedStyle: options.getComputedStyle
  });
  return { api, app, document };
}

test("notification alert renders custom title and resolves OK", async () => {
  const { api, document } = loadNotificationModal();
  const promise = api.alert({ title: "Heads up", message: "Done" });

  assert.equal(document.getElementById("app-notification-title").textContent, "Heads up");
  assert.equal(document.getElementById("app-notification-message").children[0].textContent, "Done");
  document.querySelector = document.body.querySelector.bind(document.body);
  document.getElementById("app-notification-actions").querySelector("[data-notification-button-id]").click();
  assert.equal(await promise, "ok");
});

test("notification confirm resolves custom button value", async () => {
  const { api, document } = loadNotificationModal();
  const promise = api.confirm({ message: "Delete it?", confirmLabel: "Delete", confirmVariant: "danger" });
  const confirmButton = document.getElementById("app-notification-actions").querySelector('[data-notification-button-id="confirm"]');

  assert.equal(confirmButton.textContent, "Delete");
  assert.equal(confirmButton.classList.contains("reset-modal-confirm"), true);
  confirmButton.click();
  assert.equal(await promise, true);
});

test("notification prompt renders input and resolves submitted value", async () => {
  const { api, app, document } = loadNotificationModal();
  const promise = api.prompt({ title: "Go to line", message: "Go to line:", value: "12" });
  const input = document.getElementById("app-notification-input");

  assert.equal(app.services.prompt, api.prompt);
  assert.equal(document.getElementById("app-notification-title").textContent, "Go to line");
  assert.equal(input.value, "12");
  assert.equal(document.activeElement, input);
  input.value = "24";
  document.getElementById("app-notification-actions").querySelector('[data-notification-button-id="confirm"]').click();
  assert.equal(await promise, "24");
});

test("notification prompt supports Enter and cancellation", async () => {
  const { api, document } = loadNotificationModal();
  const submitted = api.prompt({ message: "Value", value: "7" });
  const input = document.getElementById("app-notification-input");
  let prevented = false;

  input.dispatchEvent({ type: "keydown", key: "Enter", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(await submitted, "7");

  const cancelled = api.prompt({ message: "Value" });
  document.getElementById("app-notification-actions").querySelector('[data-notification-button-id="cancel"]').click();
  assert.equal(await cancelled, null);

  const dismissed = api.prompt({ message: "Value" });
  const modal = document.getElementById("app-notification-modal");
  modal.dispatchEvent({ type: "keydown", key: "Escape", preventDefault() {} });
  assert.equal(await dismissed, null);
});

test("notification modal respects outside dismiss settings", async () => {
  const { api, document } = loadNotificationModal();
  const modal = document.getElementById("app-notification-modal");
  const first = api.show({ message: "Locked", dismissible: false, buttons: [{ id: "ok", label: "OK", value: "ok" }] });

  modal.dispatchEvent({ type: "click", target: modal });
  assert.equal(modal.style.display, "flex");
  document.getElementById("app-notification-actions").querySelector("[data-notification-button-id]").click();
  assert.equal(await first, "ok");

  const second = api.show({ message: "Dismiss", dismissValue: "dismissed" });
  modal.dispatchEvent({ type: "click", target: modal });
  assert.equal(await second, "dismissed");
});

test("notification modal queues requests in order", async () => {
  const { api, document } = loadNotificationModal();
  const first = api.show({ message: "First", buttons: [{ id: "one", label: "One", value: 1 }] });
  const second = api.show({ message: "Second", buttons: [{ id: "two", label: "Two", value: 2 }] });
  const actionButton = () => document.getElementById("app-notification-actions").querySelector("[data-notification-button-id]");

  assert.equal(document.getElementById("app-notification-message").children[0].textContent, "First");
  actionButton().click();
  assert.equal(await first, 1);
  assert.equal(document.getElementById("app-notification-message").children[0].textContent, "Second");
  actionButton().click();
  assert.equal(await second, 2);
});

test("notification modal ignores a duplicate active or queued message key", async () => {
  const { api, document } = loadNotificationModal();
  const first = api.alert({ message: "JDT is still initializing", dedupeKey: "jdt-initializing" });
  const duplicateActive = api.alert({ message: "JDT is still initializing", dedupeKey: "jdt-initializing" });
  const queued = api.alert({ message: "Another message", dedupeKey: "another-message" });
  const duplicateQueued = api.alert({ message: "Another message", dedupeKey: "another-message" });
  const actionButton = () => document.getElementById("app-notification-actions").querySelector("[data-notification-button-id]");

  assert.equal(await duplicateActive, null);
  assert.equal(await duplicateQueued, null);
  actionButton().click();
  assert.equal(await first, "ok");
  assert.equal(document.getElementById("app-notification-message").children[0].textContent, "Another message");
  actionButton().click();
  assert.equal(await queued, "ok");
});

test("notification modal scopes and clears a custom dialog class", async () => {
  const { api, document } = loadNotificationModal();
  const first = api.show({ message: "Failure", dialogClassName: "wide-failure", buttons: [{ id: "ok", label: "OK" }] });
  const box = document.body.querySelector(".app-notification-box");
  assert.equal(box.classList.contains("wide-failure"), true);
  document.getElementById("app-notification-actions").querySelector("[data-notification-button-id]").click();
  await first;

  const second = api.show({ message: "Normal", buttons: [{ id: "ok", label: "OK" }] });
  assert.equal(box.classList.contains("wide-failure"), false);
  document.getElementById("app-notification-actions").querySelector("[data-notification-button-id]").click();
  await second;
});

test("notification modal opens above the highest visible dialog", async () => {
  const stackLevels = new Map();
  const { api, document } = loadNotificationModal({
    getComputedStyle(element) {
      return {
        display: element.style.display || "",
        visibility: element.style.visibility || "",
        zIndex: stackLevels.get(element) || element.style.zIndex || "auto"
      };
    }
  });
  const visibleDialog = document.createElement("div");
  visibleDialog.className = "reset-modal-overlay quick-fix-modal";
  visibleDialog.style.display = "flex";
  stackLevels.set(visibleDialog, "10040");
  document.body.appendChild(visibleDialog);

  const notification = api.alert("Above the quick fix");
  const modal = document.getElementById("app-notification-modal");

  assert.equal(modal.style.zIndex, "10041");
  document.getElementById("app-notification-actions").querySelector("[data-notification-button-id]").click();
  await notification;
  assert.equal(modal.style.zIndex, "");

  stackLevels.set(visibleDialog, "12000");
  const reopenedNotification = api.alert("Recalculate above the quick fix");
  assert.equal(modal.style.zIndex, "12001");
  document.getElementById("app-notification-actions").querySelector("[data-notification-button-id]").click();
  await reopenedNotification;
});

test("notification modal ignores hidden dialogs when calculating its stack level", async () => {
  const stackLevels = new Map();
  const { api, document } = loadNotificationModal({
    getComputedStyle(element) {
      return {
        display: element.style.display || "",
        visibility: element.style.visibility || "",
        zIndex: stackLevels.get(element) || element.style.zIndex || "auto"
      };
    }
  });
  const hiddenDialog = document.createElement("div");
  hiddenDialog.setAttribute("role", "dialog");
  hiddenDialog.style.display = "none";
  stackLevels.set(hiddenDialog, "20000");
  document.body.appendChild(hiddenDialog);

  const notification = api.alert("Ignore the hidden dialog");
  const modal = document.getElementById("app-notification-modal");

  assert.equal(modal.style.zIndex, "2001");
  document.getElementById("app-notification-actions").querySelector("[data-notification-button-id]").click();
  await notification;
});
