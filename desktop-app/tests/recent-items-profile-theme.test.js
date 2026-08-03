const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webRoot = path.resolve(__dirname, "..", "resources");

test("desktop preference hydration migrates autocomplete and caches the startup theme", async () => {
  const storedItems = new Map();
  storedItems.set("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "last-tabs" }));
  const writtenProfilePayloads = [];
  let profilePayload = {
    version: 1,
    state: {
      languageServerAutocompleteEnabled: false,
      menuLayout: "full",
      startupBehavior: "last-tabs",
      theme: "dark"
    }
  };
  let cookie = "";
  const app = {
    modules: {},
    registerModule(name, api) {
      this.modules[name] = api;
    }
  };
  const context = {
    console,
    document: {
      querySelectorAll: () => [],
      get cookie() {
        return cookie;
      },
      set cookie(value) {
        cookie = String(value || "");
      }
    },
    localStorage: {
      getItem: (key) => storedItems.get(key) || null,
      setItem: (key, value) => storedItems.set(key, String(value))
    },
    NL_OS: "Windows",
    NL_VERSION: "test",
    Neutralino: {
      os: {
        getEnv: async (name) => name === "USERPROFILE" ? "C:\\Users\\Tester" : ""
      },
      filesystem: {
        createDirectory: async () => {},
        readFile: async () => JSON.stringify(profilePayload),
        writeFile: async (_filePath, contents) => {
          writtenProfilePayloads.push(JSON.parse(contents));
        }
      }
    },
    setTimeout(callback) {
      callback();
      return 1;
    },
    clearTimeout() {},
    window: {}
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "recent", "index.js"), "utf8"), context);

  const recentItems = context.window.registerMarkdownViewerRecentItems(app, {
    applyGlobalPreferences: () => {},
    appDebugLog: () => {},
    escapeHtml: (value) => String(value || ""),
    getFileName: (filePath) => String(filePath || "").split(/[\\/]/).pop(),
    getMaxRecentFiles: () => 10,
    getMaxRecentFolders: () => 10,
    globalStateKey: "markdownViewerGlobalState",
    loadGlobalState: () => JSON.parse(storedItems.get("markdownViewerGlobalState") || "{}")
  });

  await recentItems.hydrateGlobalStateFromProfile();
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(cookie, /markdownViewerStartupTheme=dark/);
  assert.equal(JSON.parse(storedItems.get("markdownViewerGlobalState")).menuLayout, "full");
  assert.equal(JSON.parse(storedItems.get("markdownViewerGlobalState")).theme, "dark");
  assert.equal(JSON.parse(storedItems.get("markdownViewerGlobalState")).languageServerAutocompleteEnabled, true);
  assert.equal(writtenProfilePayloads.at(-1).version, 2);

  profilePayload = {
    version: 2,
    state: {
      languageServerAutocompleteEnabled: false,
      menuLayout: "full",
      startupBehavior: "last-tabs",
      theme: "dark"
    }
  };

  await recentItems.hydrateGlobalStateFromProfile();

  assert.equal(JSON.parse(storedItems.get("markdownViewerGlobalState")).languageServerAutocompleteEnabled, false);
});
