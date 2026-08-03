const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createElementStub(initial = {}) {
  return {
    attrs: {},
    listeners: {},
    style: {},
    hidden: false,
    innerHTML: "",
    textContent: "",
    value: initial.value || "",
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    focus() {
      this.focused = true;
    }
  };
}

function loadOpenFileByName(overrides = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/search/open-file-by-name.js"), "utf8");
  const menuButtons = overrides.menuButtons || [];
  const elements = {
    "open-file-by-name-modal": createElementStub(),
    "open-file-by-name-input": createElementStub(),
    "open-file-by-name-status": createElementStub(),
    "open-file-by-name-results": createElementStub(),
    "open-file-by-name-close": createElementStub()
  };
  const context = {
    console,
    document: {
      getElementById: (id) => elements[id] || null,
      querySelectorAll: (selector) => selector === ".open-file-by-name-dialog" ? menuButtons : []
    },
    setTimeout: (callback) => {
      callback();
      return 0;
    },
    clearTimeout: () => {}
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "open-file-by-name.js" });
  const app = { registerModule: () => {} };
  const deps = {
    isFolderOpen: () => true,
    getCurrentFolderTreeNodes: () => [],
    getActiveFolderPath: () => "C:/vault",
    getFileIconClass: () => "bi-file-text",
    getFileName: (value) => String(value || "").split(/[\\/]/).pop() || "document",
    openDocumentSourceFile: async () => null,
    ...overrides
  };
  delete deps.menuButtons;
  return {
    api: context.registerMarkdownViewerOpenFileByName(app, deps),
    elements,
    deps
  };
}

test("open file by name matches only filenames and sorts exact prefix then partial matches", () => {
  const { api } = loadOpenFileByName();
  const files = [
    { name: "ClientApi.java", path: "src/ClientApi.java" },
    { name: "Api.java", path: "src/Api.java" },
    { name: "ApiClient.java", path: "src/ApiClient.java" },
    { name: "Notes.md", path: "docs/Api.md" }
  ];

  const results = api._test.findMatchingFiles(files, "api");

  assert.deepEqual(results.map((result) => result.name), ["Api.java", "ApiClient.java", "ClientApi.java"]);
});

test("open file by name menu item opens dialog and closes mobile menu", () => {
  let menuClick = null;
  let closeCount = 0;
  const menuButton = {
    addEventListener(type, listener) {
      if (type === "click") menuClick = listener;
    }
  };
  const { elements } = loadOpenFileByName({
    menuButtons: [menuButton],
    closeMobileMenu: () => {
      closeCount += 1;
    }
  });
  let prevented = false;

  menuClick({
    preventDefault: () => {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(elements["open-file-by-name-modal"].style.display, "flex");
  assert.equal(closeCount, 1);
});

test("open file by name collects all tree files and resolves lazy desktop folders", async () => {
  const { api } = loadOpenFileByName({
    readNeutralinoDirectoryChildren: async () => [
      { kind: "file", name: "Hidden.txt", path: "lazy/Hidden.txt", fullPath: "C:/vault/lazy/Hidden.txt" }
    ]
  });
  const nodes = [
    {
      kind: "directory",
      name: "src",
      path: "src",
      children: [
        { kind: "file", name: "Api.java", path: "src/Api.java", fullPath: "C:/vault/src/Api.java" }
      ]
    },
    {
      kind: "directory",
      name: "lazy",
      path: "lazy",
      fullPath: "C:/vault/lazy",
      childrenLazy: true,
      children: []
    }
  ];

  const files = await api._test.collectFileResults(nodes, "C:/vault");

  assert.equal(JSON.stringify(files.map((file) => file.path)), JSON.stringify(["src/Api.java", "lazy/Hidden.txt"]));
});

test("open file by name dedupes files by comparable path", () => {
  const { api } = loadOpenFileByName();

  const files = api._test.dedupeFiles([
    { name: "Api.java", path: "src/Api.java" },
    { name: "Api.java", path: "src\\Api.java" },
    { name: "Other.java", path: "src/Other.java" }
  ]);

  assert.deepEqual(files.map((file) => file.path), ["src/Api.java", "src/Other.java"]);
});

test("open file by name preserves query and rendered results when reopened", async () => {
  const { api, elements } = loadOpenFileByName({
    getCurrentFolderTreeNodes: () => [
      { kind: "file", name: "Api.java", path: "src/Api.java", fullPath: "C:/vault/src/Api.java" }
    ]
  });

  await api.rebuildIndexIfNeeded();
  api.openFileByNameModal();
  elements["open-file-by-name-input"].value = "api";
  elements["open-file-by-name-input"].listeners.input();

  assert.match(elements["open-file-by-name-results"].innerHTML, /Api\.java/);

  api.closeFileByNameModal();
  api.openFileByNameModal();

  assert.equal(elements["open-file-by-name-input"].value, "api");
  assert.match(elements["open-file-by-name-results"].innerHTML, /Api\.java/);
});
