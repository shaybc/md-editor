const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptPath = path.resolve(__dirname, "..", "resources", "js", "ui", "foreground-wait-indicator.js");

function createElement() {
  const classes = new Set(["hidden"]);
  return {
    attributes: {},
    classList: {
      contains(name) { return classes.has(name); },
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    textContent: ""
  };
}

function loadIndicator() {
  const timers = new Map();
  const statuses = new Map();
  let nextTimerId = 1;
  const context = { window: {}, console };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  const rootElement = createElement();
  const app = {
    modules: {
      statusManager: {
        setStatus(status) { statuses.set(status.id, status); },
        unsetStatus(id) { statuses.delete(id); }
      }
    },
    registerModule() {}
  };
  const indicator = context.window.registerMarkdownViewerForegroundWaitIndicator(app, {
    rootElement,
    delayMs: 400,
    setTimeout(callback) {
      const id = nextTimerId++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  });
  return {
    indicator,
    rootElement,
    getStatus() { return statuses.get("foreground-file-open") || null; },
    revealAll() {
      const callbacks = Array.from(timers.values());
      timers.clear();
      callbacks.forEach((callback) => callback());
    }
  };
}

test("foreground wait UI appears only after the delay and counts pending actions", () => {
  const fixture = loadIndicator();
  const releaseFirst = fixture.indicator.begin();
  const releaseSecond = fixture.indicator.begin();

  assert.equal(fixture.rootElement.classList.contains("app-foreground-waiting"), false);
  fixture.revealAll();
  assert.equal(fixture.rootElement.classList.contains("app-foreground-waiting"), true);
  assert.equal(fixture.getStatus().label, "Opening 2 files...");
  assert.equal(fixture.getStatus().showProgress, true);
  assert.equal(fixture.getStatus().priority, -10);

  releaseFirst();
  assert.equal(fixture.getStatus().label, "Opening file...");
  releaseSecond();
  assert.equal(fixture.rootElement.classList.contains("app-foreground-waiting"), false);
  assert.equal(fixture.getStatus(), null);
  assert.equal(fixture.rootElement.attributes["aria-busy"], "false");
});

test("clearing the indicator releases all delayed foreground actions", () => {
  const fixture = loadIndicator();
  fixture.indicator.begin();
  fixture.revealAll();

  fixture.indicator.clear();

  assert.equal(fixture.rootElement.classList.contains("app-foreground-waiting"), false);
  assert.equal(fixture.getStatus(), null);
});

test("status bar uses the shared center status instead of a dedicated file-open indicator", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../resources/index.html"), "utf8");
  assert.doesNotMatch(html, /foreground-wait-status|foreground-wait-label/);
  assert.match(html, /id="status-tip"/);
});
