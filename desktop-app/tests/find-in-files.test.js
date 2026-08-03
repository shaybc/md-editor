const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createElementStub() {
  return {
    addEventListener: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => true },
    setAttribute: () => {},
    querySelectorAll: () => [],
    appendChild: () => {},
    innerHTML: "",
    style: {},
    hidden: false
  };
}

function loadFindInFilesApi(options = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/search/find-in-files.js"), "utf8");
  const elements = options.elements || {};
  const context = {
    console,
    navigator: {},
    document: {
      body: { classList: { add: () => {}, remove: () => {} }, appendChild: () => {} },
      createElement: () => createElementStub(),
      getElementById: (id) => elements[id] || null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "find-in-files.js" });
  const app = { registerModule: () => {} };
  return context.registerMarkdownViewerFindInFiles(app, {
    loadGlobalState: () => ({}),
    saveGlobalState: () => {},
    isNeutralinoRuntime: () => false,
    isTextDocumentPath: () => true,
    ...options.deps
  });
}

function loadFindInFilesTestApi() {
  return loadFindInFilesApi()._test;
}

test("find in files parses file type patterns from editor-style input", () => {
  const api = loadFindInFilesTestApi();

  assert.equal(JSON.stringify(api.parseFileTypePatterns("*.md; .java, js ts")), JSON.stringify(["*.md", "*.java", "*.js", "*.ts"]));
  assert.equal(api.matchesFileType("docs/readme.md", api.parseFileTypePatterns("*.md")), true);
  assert.equal(api.matchesFileType("src/App.jsx", api.parseFileTypePatterns("js;ts")), false);
  assert.equal(api.matchesFileType("src/App.jsx", api.parseFileTypePatterns("*.*")), true);
});

test("find in files supports literal case whole-word and regex matches", () => {
  const api = loadFindInFilesTestApi();
  const content = "spring springs\nSpring bean\nthing";

  const wholeWord = api.findContentMatches(content, "spring", { wholeWord: true });
  assert.equal(wholeWord.length, 2);
  assert.equal(JSON.stringify(wholeWord.map((match) => match.lineNumber)), JSON.stringify([1, 2]));

  const caseSensitive = api.findContentMatches(content, "spring", { matchCase: true });
  assert.equal(caseSensitive.length, 2);

  const regex = api.findContentMatches(content, "spr\\w+", { useRegex: true });
  assert.equal(regex.length, 3);
});

test("find in files history keeps newest unique values first", () => {
  const api = loadFindInFilesTestApi();
  const history = api.addHistoryValue(["alpha", "beta", "Alpha"], "gamma");

  assert.equal(JSON.stringify(history), JSON.stringify(["gamma", "alpha", "beta"]));
  assert.equal(api.addHistoryValue(history, "beta")[0], "beta");
  assert.equal(api.normalizeHistoryList(Array.from({ length: 25 }, (_, index) => `v${index}`)).length, 20);
});

test("find in files toggles the shared bottom panel Search Results tab", () => {
  const panel = createElementStub();
  panel.hidden = true;
  let activatedTabId = "";
  let activeTabId = "problems";
  let hidden = false;
  const api = loadFindInFilesApi({
    elements: {
      "find-in-files-results-panel": panel,
      "find-in-files-results-body": createElementStub(),
      "find-in-files-results-status": createElementStub()
    },
    deps: {
      bottomPanel: {
        SEARCH_RESULTS_TAB_ID: "search-results",
        activateTab(tabId) {
          activatedTabId = tabId;
          activeTabId = tabId;
          panel.hidden = false;
        },
        hidePanel() {
          hidden = true;
          panel.hidden = true;
        },
        getActiveTabId() {
          return activeTabId;
        },
        isPanelVisible() {
          return !panel.hidden;
        }
      }
    }
  });

  api.toggleResultsPanel();
  assert.equal(activatedTabId, "search-results");

  activeTabId = "problems";
  api.toggleResultsPanel();
  assert.equal(activatedTabId, "search-results");
  assert.equal(hidden, false);
  api.toggleResultsPanel();
  assert.equal(hidden, true);
});
