const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const webRoot = path.join(repoRoot, "desktop-app", "resources");

test("startup boot script loads before styles and application scripts", () => {
  const html = fs.readFileSync(path.join(webRoot, "index.html"), "utf8").replace(/^\uFEFF/, "");
  const registryScriptIndex = html.indexOf('<script src="js/ui/theme-registry.js"></script>');
  const bootScriptIndex = html.indexOf('<script src="/js/startup/boot-screen.js"></script>');
  const stylesIndex = html.indexOf('<link rel="stylesheet" href="/styles.css">');
  const appScriptIndex = html.indexOf('<script src="js/app.js"></script>');
  const legacyScriptIndex = html.indexOf('loadScript("js/script.js")');

  assert.notEqual(registryScriptIndex, -1);
  assert.notEqual(bootScriptIndex, -1);
  assert.notEqual(stylesIndex, -1);
  assert.notEqual(appScriptIndex, -1);
  assert.notEqual(legacyScriptIndex, -1);
  assert.equal(registryScriptIndex < bootScriptIndex, true);
  assert.equal(bootScriptIndex < stylesIndex, true);
  assert.equal(bootScriptIndex < appScriptIndex, true);
  assert.equal(bootScriptIndex < legacyScriptIndex, true);
});

test("startup splash is the first visible body child before the app shell", () => {
  const html = fs.readFileSync(path.join(webRoot, "index.html"), "utf8").replace(/^\uFEFF/, "");
  const bodyIndex = html.indexOf("<body>");
  const splashIndex = html.indexOf('<div id="startup-splash"');
  const appContainerIndex = html.indexOf('<div class="app-container">');

  assert.notEqual(bodyIndex, -1);
  assert.notEqual(splashIndex, -1);
  assert.notEqual(appContainerIndex, -1);
  assert.equal(bodyIndex < splashIndex, true);
  assert.equal(splashIndex < appContainerIndex, true);
});

function createBootScreenHarness(savedState = {}, options = {}) {
  const classes = new Set();
  const attributes = new Map();
  const properties = new Map();
  const events = [];
  let cookie = options.cookie || "";
  const splash = {
    parentNode: {
      removeChild(node) {
        if (node === splash) splash.removed = true;
      }
    },
    removed: false
  };
  const listeners = new Map();
  const document = {
    readyState: "complete",
    documentElement: {
      classList: {
        add(...names) { names.forEach((name) => classes.add(name)); },
        remove(...names) { names.forEach((name) => classes.delete(name)); },
        contains(name) { return classes.has(name); }
      },
      style: {
        setProperty(name, value) {
          properties.set(name, String(value));
        }
      },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) || null; }
    },
    get cookie() {
      return cookie;
    },
    set cookie(value) {
      cookie = String(value || "");
    },
    addEventListener(name, callback) {
      listeners.set(name, callback);
    },
    getElementById(id) {
      return id === "startup-splash" ? splash : null;
    }
  };
  const context = {
    window: null,
    document,
    console: options.console || console,
    CustomEvent: function CustomEvent(name, options) {
      return { type: name, detail: options?.detail || {} };
    },
    localStorage: {
      getItem(key) {
        return key === "markdownViewerGlobalState" ? JSON.stringify(savedState) : null;
      }
    },
    matchMedia() {
      return { matches: options.prefersDark === true };
    },
    requestAnimationFrame(callback) {
      callback();
    },
    setTimeout(callback, delay) {
      if (delay < 1000) callback();
      return 1;
    },
    dispatchEvent(event) {
      events.push(event);
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "ui", "theme-registry.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "startup", "boot-screen.js"), "utf8"), context);

  return {
    classes,
    context,
    events,
    splash,
    properties,
    get dataTheme() {
      return attributes.get("data-theme");
    }
  };
}

test("startup boot defaults to dark without saved theme", () => {
  const harness = createBootScreenHarness({}, { prefersDark: true });

  assert.equal(harness.dataTheme, "dark");
  assert.equal(harness.classes.has("boot-theme-dark"), true);
});

test("startup boot uses cached startup theme when localStorage has no saved theme", () => {
  const harness = createBootScreenHarness({}, {
    cookie: "markdownViewerStartupTheme=dark; Max-Age=31536000",
    prefersDark: false
  });

  assert.equal(harness.dataTheme, "dark");
  assert.equal(harness.classes.has("boot-theme-dark"), true);
});

test("startup boot prefers localStorage theme over cached startup theme", () => {
  const harness = createBootScreenHarness({ theme: "light" }, {
    cookie: "markdownViewerStartupTheme=dark; Max-Age=31536000",
    prefersDark: false
  });

  assert.equal(harness.dataTheme, "light");
  assert.equal(harness.classes.has("boot-theme-light"), true);
});

test("startup perf marks are buffered without direct console info writes", () => {
  const infoCalls = [];
  const harness = createBootScreenHarness({}, {
    console: {
      debug() {},
      error() {},
      info(...args) { infoCalls.push(args); },
      log() {},
      warn() {}
    }
  });

  harness.context.markdownViewerStartupPerf.mark("manual test mark");

  assert.equal(infoCalls.length, 0);
});

test("startup perf flushes to app debug only when the app logger writes", async () => {
  const harness = createBootScreenHarness({ theme: "light" });
  const startupPerf = harness.context.markdownViewerStartupPerf;
  const entries = startupPerf.entries.slice();
  const lines = [];

  assert.equal(entries.length > 0, true);
  assert.equal(entries.every((entry) => entry.appFlushed === false), true);

  await startupPerf.flushToAppDebug(async () => null);

  assert.equal(entries.every((entry) => entry.appFlushed === false), true);

  await startupPerf.flushToAppDebug(async (level, message) => {
    lines.push({ level, message });
    return message;
  });

  assert.equal(lines.length, entries.length);
  assert.equal(lines.every((line) => line.level === "info"), true);
  assert.equal(lines.every((line) => line.message.startsWith("[startup-perf]")), true);
  assert.equal(entries.every((entry) => entry.appFlushed === true), true);
});

test("startup boot applies saved theme and emits shell-ready", () => {
  const harness = createBootScreenHarness({
    theme: "dark",
    themeSelections: {
      dark: "solarized-dark"
    }
  });

  assert.equal(harness.dataTheme, "dark");
  assert.equal(harness.properties.get("--bg-color"), "#002b36");
  assert.equal(harness.classes.has("is-starting"), true);
  assert.equal(harness.classes.has("boot-theme-dark"), true);
  assert.equal(harness.context.markdownViewerBootScreen.shellReady, true);
  assert.equal(harness.events.some((event) => event.type === "markdownViewerStartupShellReady"), true);
});

test("startup boot readiness removes the splash state", () => {
  const harness = createBootScreenHarness({ theme: "light" });

  harness.context.markdownViewerBootScreen.markReady("test-ready");

  assert.equal(harness.context.markdownViewerBootScreen.ready, true);
  assert.equal(harness.classes.has("is-starting"), false);
  assert.equal(harness.classes.has("startup-ready"), true);
  assert.equal(harness.splash.removed, true);
  assert.equal(harness.events.some((event) => event.type === "markdownViewerStartupReady" && event.detail.reason === "test-ready"), true);
});

test("startup boot failure clears the splash state for crash UI", () => {
  const harness = createBootScreenHarness({ theme: "dark" });

  harness.context.markdownViewerBootScreen.markFailed(new Error("boom"));

  assert.equal(harness.classes.has("is-starting"), false);
  assert.equal(harness.classes.has("startup-failed"), true);
  assert.equal(harness.splash.removed, true);
});
