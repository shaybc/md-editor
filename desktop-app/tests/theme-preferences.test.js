const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webRoot = path.resolve(__dirname, "..", "resources");

function createThemePreferencesHarness(savedState = {}, options = {}) {
  const attributes = new Map();
  const properties = new Map();
  const settingsThemeToggle = options.settingsThemeToggle || {};
  let cookie = options.cookie || "";
  const app = {
    services: {},
    actions: {},
    modules: {},
    registerModule(name, moduleApi) {
      this.modules[name] = moduleApi || {};
    }
  };
  const context = {
    window: null,
    document: {
      documentElement: {
        style: {
          setProperty(name, value) {
            properties.set(name, String(value));
          }
        },
        setAttribute(name, value) {
          attributes.set(name, String(value));
        },
        getAttribute(name) {
          return attributes.get(name) || null;
        }
      },
      get cookie() {
        return cookie;
      },
      set cookie(value) {
        cookie = String(value || "");
      }
    },
    localStorage: {
      getItem(key) {
        return key === "markdownViewerGlobalState" ? JSON.stringify(savedState) : null;
      },
      setItem() {}
    },
    matchMedia() {
      return { matches: options.prefersDark === true };
    },
    console,
    app,
    renderCount: 0,
    profileWriteCount: 0
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "ui", "theme-registry.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "ui", "theme-preferences.js"), "utf8"), context);

  const preferences = context.registerMarkdownViewerThemePreferences(app, {
    defaultState: {},
    mobileThemeToggle: null,
    renderMarkdown() {
      context.renderCount += 1;
    },
    scheduleGlobalProfileWrite() {
      context.profileWriteCount += 1;
    },
    settingsThemeToggle,
    storageKey: "markdownViewerGlobalState",
    themeToggle: null
  });

  return {
    context,
    preferences,
    properties,
    get dataTheme() {
      return attributes.get("data-theme");
    },
    get cookie() {
      return cookie;
    },
    settingsThemeToggle
  };
}

test("theme preferences keeps settings theme toggle label synchronized", () => {
  const harness = createThemePreferencesHarness({}, { prefersDark: false });

  harness.preferences.updateThemeButtonLabels("light");

  assert.match(harness.settingsThemeToggle.innerHTML, /Dark Mode/);
  assert.match(harness.settingsThemeToggle.innerHTML, /bi-moon/);

  harness.preferences.updateThemeButtonLabels("dark");

  assert.match(harness.settingsThemeToggle.innerHTML, /Light Mode/);
  assert.match(harness.settingsThemeToggle.innerHTML, /bi-sun/);
});

test("theme preferences binds settings theme toggle to the shared toggle action", () => {
  let clickHandler = null;
  const settingsThemeToggle = {
    addEventListener(name, handler) {
      if (name === "click") clickHandler = handler;
    }
  };
  const harness = createThemePreferencesHarness({}, { settingsThemeToggle });

  harness.preferences.bindThemeToggle();
  clickHandler();

  assert.equal(harness.dataTheme, "dark");
  assert.equal(harness.context.renderCount, 1);
});

test("theme preferences default to dark when no saved theme exists", () => {
  const harness = createThemePreferencesHarness({}, { prefersDark: true });

  assert.equal(harness.preferences.getDefaultThemePreference(), "dark");
  assert.equal(harness.preferences.initializeTheme(), "dark");
  assert.equal(harness.dataTheme, "dark");
  assert.equal(harness.properties.get("--bg-color"), "#0d1117");
  assert.match(harness.cookie, /markdownViewerStartupTheme=dark/);
});

test("theme preferences still honor a saved dark theme", () => {
  const harness = createThemePreferencesHarness({ theme: "dark" }, { prefersDark: false });

  assert.equal(harness.preferences.initializeTheme(), "dark");
  assert.equal(harness.dataTheme, "dark");
  assert.equal(harness.properties.get("--bg-color"), "#0d1117");
  assert.match(harness.cookie, /markdownViewerStartupTheme=dark/);
});

test("theme preferences save startup theme cache when theme changes", () => {
  const harness = createThemePreferencesHarness({}, { prefersDark: false });

  harness.preferences.saveGlobalState({ theme: "dark" });

  assert.match(harness.cookie, /markdownViewerStartupTheme=dark/);
});
