const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadFolderToolbar(deps, services = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/sidebar/folder-toolbar.js"), "utf8");
  const sandbox = {
    window: {
      prompt() {
        throw new Error("window.prompt should not be used");
      }
    },
    document: createTestDocument(),
    console,
    setTimeout
  };
  vm.runInNewContext(source, sandbox);
  const app = {
    services: Object.assign({}, services),
    registerModule(name, api) {
      this.services[name] = api;
    }
  };
  return sandbox.window.registerMarkdownViewerFolderToolbar(app, deps);
}
function createDeps(overrides = {}) {
  const deps = {
    createTagButton: null,
    deleteTagButton: null,
    clearTagFilterButton: null,
    tagManagementSearch: null,
    autoSelectFileEnabled: false,
    toggleAutoSelectFileButtons: [],
    folderTreeRoot: null,
    getFolderTreeChildrenContainer: () => null,
    resetFolderTreeAnimation: () => {},
    renderFolderTreeLazyChildren: async () => {},
    readFolderTreeRecursiveEntriesFromDisk: async () => null,
    sortFolderTreeNodes: () => {},
    folderTreeExpandToggleButtons: [],
    showUnsupportedFolderFiles: false,
    isSupportedFolderTreeDocumentNode: (node) => /\.md$/i.test(node?.name || ""),
    normalizeFileTagList: (tags) => Array.from(new Set((tags || []).map((tag) => String(tag).toLowerCase()).filter(Boolean))),
    folderMarkdownFiles: [],
    selectedFolderTreeTags: new Set(),
    normalizeTagName: (tag) => String(tag || "").replace(/^#/, "").toLowerCase(),
    renderTagManagementList: () => {},
    updateTagManagementMenuButtons: () => {},
    isFolderOpen: true,
    currentFolderTreeNodes: [],
    folderTreeFilterText: "",
    activeFolderPath: "C:/project",
    renderFolderTree: () => {},
    updateFolderTreeToolbarState: () => {},
    folderTreeFilterInput: null,
    folderTreeFilterToggleButtons: [],
    saveGlobalState: () => {},
    syncFolderTreeSelectionToActiveTab: () => {},
    getActiveTab: () => null,
    getFileName: (filePath) => String(filePath || "").split(/[\\/]/).pop() || "",
    escapeHtml: (value) => String(value || ""),
    tabs: [],
    activeTabId: null
  };
  return Object.assign(deps, overrides);
}

function createClassList(initialClasses = []) {
  const classes = new Set(initialClasses);
  return {
    add(...names) {
      names.forEach((name) => classes.add(name));
    },
    remove(...names) {
      names.forEach((name) => classes.delete(name));
    },
    contains(name) {
      return classes.has(name);
    }
  };
}

function createTestElement(tagName = "div") {
  const attributes = new Map();
  return {
    tagName: String(tagName || "div").toUpperCase(),
    children: [],
    className: "",
    textContent: "",
    value: "",
    append(...nodes) {
      nodes.forEach((node) => this.appendChild(node));
    },
    appendChild(node) {
      this.children.push(node);
      node.parentElement = this;
      return node;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name);
    }
  };
}

function createTestDocument() {
  return {
    createElement: createTestElement,
    querySelectorAll: () => []
  };
}

function createEventButton() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    click() {
      return listeners.get("click")?.({ type: "click" });
    }
  };
}
function createFolderTreeButton(options = {}) {
  const attributes = new Map();
  return {
    dataset: {
      fullPath: options.fullPath || "",
      path: options.path || "",
      name: options.name || ""
    },
    textContent: options.textContent || options.name || "",
    classList: createClassList(["folder-tree-file", ...(options.autoSelected ? ["auto-selected"] : [])]),
    parentElement: null,
    scrollIntoView() {
      this.scrolled = true;
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

function createFolderTreeRoot(buttons) {
  return {
    querySelectorAll(selector) {
      if (selector === ".folder-tree-file") return buttons;
      if (selector === ".folder-tree-file.auto-selected") {
        return buttons.filter((button) => button.classList.contains("auto-selected"));
      }
      return [];
    }
  };
}

function createFolderTreeDetails(options = {}) {
  const pathName = String(options.path || "").split(/[\\/]/).filter(Boolean).pop() || "";
  const details = {
    open: options.open === true,
    dataset: {
      path: options.path || "",
      fullPath: options.fullPath || ""
    },
    children: options.children || [],
    _folderTreeNode: options.node || {
      kind: "directory",
      name: options.name || pathName,
      path: options.path || "",
      fullPath: options.fullPath || ""
    },
    querySelectorAll(selector) {
      if (selector === ":scope > .folder-tree-children > .folder-tree-list > .folder-tree-item > details") {
        return this.children;
      }
      return [];
    }
  };
  return details;
}

function collectFolderTreeDetails(details) {
  return [details, ...details.children.flatMap(collectFolderTreeDetails)];
}

function createFolderTreeExpansionRoot(rootDetails) {
  return {
    querySelectorAll(selector) {
      if (selector === ":scope > .folder-tree-list > .folder-tree-item > details") return rootDetails;
      if (selector === "details") return rootDetails.flatMap(collectFolderTreeDetails);
      return [];
    }
  };
}

test("create tag button opens notification dialog and creates returned tag", async () => {
  const createTagButton = createEventButton();
  const promptRequests = [];
  const createCalls = [];

  loadFolderToolbar(createDeps({
    createTagButton,
    tagManagementSearch: { value: "Draft Tag", addEventListener() {} },
    promptForNewTag: async (options) => {
      promptRequests.push(options);
      return "draft-tag";
    },
    createTag: (tag) => {
      createCalls.push(tag);
      return true;
    }
  }));

  await createTagButton.click();

  assert.equal(promptRequests.length, 1);
  assert.equal(promptRequests[0].title, "Create tag");
  assert.equal(promptRequests[0].defaultValue, "Draft Tag");
  assert.equal(promptRequests[0].confirmLabel, "Create");
  assert.deepEqual(createCalls, ["draft-tag"]);
});
test("delete tag button opens notification dropdown and deletes selected tag", async () => {
  const deleteTagButton = createEventButton();
  const deleteCalls = [];
  const modalRequests = [];
  const services = {
    notify: {
      show: async (request) => {
        modalRequests.push(request);
        const body = createTestElement();
        request.renderBody(body);
        const select = body.children[0];
        assert.equal(select.tagName, "SELECT");
        assert.deepEqual(select.children.map((option) => ({ value: option.value, text: option.textContent })), [
          { value: "archive", text: "#archive" },
          { value: "project", text: "#project" }
        ]);
        assert.equal(select.value, "project");
        select.value = "archive";
        return request.buttons.find((button) => button.id === "delete").action();
      }
    }
  };

  loadFolderToolbar(createDeps({
    deleteTagButton,
    tagManagementSearch: { value: "Project", addEventListener() {} },
    getAvailableTags: () => ["project", "archive"],
    deleteTag: async (...args) => {
      deleteCalls.push(args);
    }
  }), services);

  await deleteTagButton.click();

  assert.equal(modalRequests.length, 1);
  assert.equal(modalRequests[0].title, "Delete tag");
  assert.equal(modalRequests[0].buttons.find((button) => button.id === "delete").variant, "danger");
  assert.equal(deleteCalls.length, 1);
  assert.equal(deleteCalls[0][0], "archive");
  assert.equal(deleteCalls[0][1].skipConfirmation, true);
});

test("delete tag button shows notification when no tags are available", async () => {
  const deleteTagButton = createEventButton();
  const deleteCalls = [];
  const modalRequests = [];
  const services = {
    notify: {
      show: async (request) => {
        modalRequests.push(request);
        return null;
      }
    }
  };

  loadFolderToolbar(createDeps({
    deleteTagButton,
    getAvailableTags: () => [],
    deleteTag: async (...args) => {
      deleteCalls.push(args);
    }
  }), services);

  await deleteTagButton.click();

  assert.equal(modalRequests.length, 1);
  assert.equal(modalRequests[0].title, "Delete tag");
  assert.equal(modalRequests[0].message, "No tags are available to delete.");
  assert.equal(typeof modalRequests[0].renderBody, "undefined");
  assert.deepEqual(deleteCalls, []);
});
test("tag filtering uses markdown tag index for file matches", () => {
  const api = loadFolderToolbar(createDeps({
    folderMarkdownFiles: [
      { path: "src/External.md", tags: ["external-dependency"] },
      { path: "src/Internal.md", tags: ["infrastructure"] }
    ],
    selectedFolderTreeTags: new Set(["external-dependency"])
  }));

  const nodes = [
    {
      kind: "directory",
      name: "src",
      path: "src",
      children: [
        { kind: "file", name: "External.md", path: "src/External.md" },
        { kind: "file", name: "Internal.md", path: "src/Internal.md" }
      ]
    }
  ];

  assert.deepEqual(JSON.parse(JSON.stringify(api.getTagFilteredFolderTreeNodes(nodes))), [
    {
      kind: "directory",
      name: "src",
      path: "src",
      children: [
        { kind: "file", name: "External.md", path: "src/External.md" }
      ]
    }
  ]);
});

test("rendering a tag filter opens rendered details without lazy-expanding the whole tree", () => {
  let lazyRenderCount = 0;
  const renderedDetails = [{ open: false }, { open: false }];
  const folderTreeRoot = {
    querySelectorAll(selector) {
      return selector === "details" || selector.startsWith(":scope >") ? renderedDetails : [];
    }
  };

  const api = loadFolderToolbar(createDeps({
    folderTreeRoot,
    renderFolderTree(nodes) {
      assert.equal(nodes.length, 1);
    },
    renderFolderTreeLazyChildren: async () => {
      lazyRenderCount += 1;
    },
    currentFolderTreeNodes: [
      {
        kind: "directory",
        name: "src",
        path: "src",
        children: [{ kind: "file", name: "External.md", path: "src/External.md", tags: ["external-dependency"] }]
      }
    ],
    selectedFolderTreeTags: new Set(["external-dependency"])
  }));

  api.renderFilteredFolderTree();

  assert.deepEqual(renderedDetails.map((details) => details.open), [true, true]);
  assert.equal(lazyRenderCount, 0);
});

test("wildcard filtering resolves lazy folders before matching nested files", async () => {
  let renderedNodes = null;
  const nestedDetails = createFolderTreeDetails({ path: "src/nested" });
  const rootDetails = createFolderTreeDetails({ path: "src", children: [nestedDetails] });
  const materializedPaths = [];
  const folderTreeRoot = createFolderTreeExpansionRoot([rootDetails]);
  const api = loadFolderToolbar(createDeps({
    folderTreeRoot,
    folderTreeFilterText: "*.java",
    isSupportedFolderTreeDocumentNode: () => true,
    currentFolderTreeNodes: [
      {
        kind: "directory",
        name: "src",
        path: "src",
        fullPath: "C:/project/src",
        children: [],
        childrenLazy: true
      }
    ],
    readFolderTreeRecursiveEntriesFromDisk: async () => [
      { type: "DIRECTORY", entry: "src", path: "C:/project/src" },
      { type: "FILE", entry: "Application.java", path: "C:/project/src/Application.java" },
      { type: "FILE", entry: "README.md", path: "C:/project/src/README.md" }
    ],
    renderFolderTreeLazyChildren: async (details) => {
      materializedPaths.push(details.dataset.path);
    },
    renderFolderTree(nodes) {
      renderedNodes = nodes;
    }
  }));

  await api.renderFilteredFolderTree();

  assert.equal(renderedNodes.length, 1);
  assert.equal(renderedNodes[0].name, "src");
  assert.deepEqual(Array.from(renderedNodes[0].children, (node) => node.name), ["Application.java"]);
  assert.deepEqual(materializedPaths, ["src", "src/nested"]);
});

test("clearing tag filters renders the full tree as collapsed lazy directory clones", () => {
  let renderedNodes = null;
  let queriedDetails = false;
  const folderTreeRoot = {
    querySelectorAll(selector) {
      if (selector === "details") queriedDetails = true;
      return [];
    }
  };

  const api = loadFolderToolbar(createDeps({
    folderTreeRoot,
    renderFolderTree(nodes) {
      renderedNodes = nodes;
    },
    currentFolderTreeNodes: [
      {
        kind: "directory",
        name: "src",
        path: "src",
        children: [
          {
            kind: "directory",
            name: "main",
            path: "src/main",
            children: [{ kind: "file", name: "App.md", path: "src/main/App.md" }]
          }
        ]
      }
    ],
    selectedFolderTreeTags: new Set()
  }));

  api.renderFilteredFolderTree();

  assert.equal(queriedDetails, false);
  assert.equal(renderedNodes[0].childrenLazy, true);
  assert.equal(renderedNodes[0].children[0].childrenLazy, true);
  assert.equal(renderedNodes[0].children[0].children[0].name, "App.md");
});

test("folder tree expand all recursively opens rendered and lazy details", async () => {
  const deepDetails = createFolderTreeDetails({ path: "src/lazy/deep" });
  const lazyDetails = createFolderTreeDetails({ path: "src/lazy", children: [deepDetails] });
  const rootDetails = createFolderTreeDetails({ path: "src" });
  const lazyRenderPaths = [];

  const api = loadFolderToolbar(createDeps({
    folderTreeRoot: createFolderTreeExpansionRoot([rootDetails]),
    getFolderTreeChildrenContainer: () => null,
    renderFolderTreeLazyChildren: async (details) => {
      lazyRenderPaths.push(details.dataset.path);
      if (details === rootDetails) details.children = [lazyDetails];
    }
  }));

  await api.setAllFolderTreeDetails(true);

  assert.deepEqual([rootDetails.open, lazyDetails.open, deepDetails.open], [true, true, true]);
  assert.deepEqual(lazyRenderPaths, ["src", "src/lazy", "src/lazy/deep"]);
});

test("folder tree expand all skips git folders without lazy rendering them", async () => {
  const docsDetails = createFolderTreeDetails({ path: "docs" });
  const gitDetails = createFolderTreeDetails({ name: ".git", path: ".git" });
  const lazyRenderPaths = [];

  const api = loadFolderToolbar(createDeps({
    folderTreeRoot: createFolderTreeExpansionRoot([docsDetails, gitDetails]),
    getFolderTreeChildrenContainer: () => null,
    renderFolderTreeLazyChildren: async (details) => {
      lazyRenderPaths.push(details.dataset.path);
    }
  }));

  await api.setAllFolderTreeDetails(true);

  assert.equal(docsDetails.open, true);
  assert.equal(gitDetails.open, false);
  assert.deepEqual(lazyRenderPaths, ["docs"]);
});

test("git folders do not contribute to the expand all depth limit", async () => {
  const childDetails = createFolderTreeDetails({ path: "src/deep" });
  const srcDetails = createFolderTreeDetails({ path: "src", children: [childDetails] });
  const gitDetails = createFolderTreeDetails({ name: ".git", path: ".git" });

  const api = loadFolderToolbar(createDeps({
    folderTreeRoot: createFolderTreeExpansionRoot([srcDetails, gitDetails]),
    currentFolderTreeNodes: [
      {
        kind: "directory",
        name: "src",
        path: "src",
        children: [
          { kind: "directory", name: "deep", path: "src/deep", children: [] }
        ]
      },
      {
        kind: "directory",
        name: ".git",
        path: ".git",
        children: [
          { kind: "directory", name: "objects", path: ".git/objects", children: [] }
        ]
      }
    ],
    getFolderTreeChildrenContainer: () => null,
    getFolderTreeExpandLimitThreshold: () => 2,
    getFolderTreeExpandLimitDepth: () => 1
  }));

  await api.setAllFolderTreeDetails(true);

  assert.equal(srcDetails.open, true);
  assert.equal(childDetails.open, true);
  assert.equal(gitDetails.open, false);
});

test("folder tree collapse all still closes open git folders", async () => {
  const gitDetails = createFolderTreeDetails({ name: ".git", path: ".git", open: true });

  const api = loadFolderToolbar(createDeps({
    folderTreeRoot: createFolderTreeExpansionRoot([gitDetails]),
    getFolderTreeChildrenContainer: () => null
  }));

  await api.setAllFolderTreeDetails(false);

  assert.equal(gitDetails.open, false);
});
test("folder tree toolbar button remains collapse-only when every root folder is closed", () => {
  const rootDetails = createFolderTreeDetails({ path: "src", open: false });
  const icon = { className: "" };
  const attributes = new Map();
  const button = {
    disabled: false,
    title: "",
    querySelector: (selector) => selector === "i" ? icon : null,
    setAttribute(name, value) {
      attributes.set(name, String(value));
    }
  };

  const api = loadFolderToolbar(createDeps({
    folderTreeRoot: createFolderTreeExpansionRoot([rootDetails]),
    folderTreeExpandToggleButtons: [button]
  }));

  api.updateFolderTreeExpandToggleButtons();

  assert.equal(button.title, "Collapse all folders");
  assert.equal(attributes.get("aria-label"), "Collapse all folders");
  assert.equal(icon.className, "bi bi-arrows-collapse");
});

test("auto select ignores same-name tree files when active tab path is outside the opened folder", async () => {
  const activePath = "C:/GitHub/shaybc/dcc/package-lock.json";
  const button = createFolderTreeButton({
    fullPath: "C:/GitHub/shaybc/md-editor/package-lock.json",
    path: "package-lock.json",
    name: "package-lock.json",
    autoSelected: true
  });
  const revealCalls = [];
  const api = loadFolderToolbar(createDeps({
    folderTreeRoot: createFolderTreeRoot([button]),
    autoSelectFileEnabled: true,
    tabs: [{
      id: "tab_external",
      type: "markdown",
      sourceFilePath: activePath,
      sourceFileName: "package-lock.json",
      title: "package-lock.json"
    }],
    activeTabId: "tab_external",
    revealFolderTreeFileByPath: async (filePath) => {
      revealCalls.push(filePath);
      return null;
    }
  }));

  await api.syncFolderTreeSelectionToActiveTab();

  assert.deepEqual(revealCalls, [activePath]);
  assert.equal(button.classList.contains("auto-selected"), false);
  assert.equal(button.getAttribute("aria-current"), undefined);
});

test("auto select marks the tree file when the active tab path resolves to a tree button", async () => {
  const activePath = "C:/GitHub/shaybc/md-editor/package-lock.json";
  const button = createFolderTreeButton({
    fullPath: activePath,
    path: "package-lock.json",
    name: "package-lock.json"
  });
  const api = loadFolderToolbar(createDeps({
    folderTreeRoot: createFolderTreeRoot([button]),
    autoSelectFileEnabled: true,
    tabs: [{
      id: "tab_local",
      type: "markdown",
      sourceFilePath: activePath,
      sourceFileName: "package-lock.json",
      title: "package-lock.json"
    }],
    activeTabId: "tab_local",
    revealFolderTreeFileByPath: async (filePath) => filePath === activePath ? button : null
  }));

  await api.syncFolderTreeSelectionToActiveTab();

  assert.equal(button.classList.contains("auto-selected"), true);
  assert.equal(button.getAttribute("aria-current"), "page");
});

test("auto select keeps filename fallback for tabs without a source path", async () => {
  const button = createFolderTreeButton({
    fullPath: "C:/GitHub/shaybc/md-editor/README.md",
    path: "README.md",
    name: "README.md"
  });
  const api = loadFolderToolbar(createDeps({
    folderTreeRoot: createFolderTreeRoot([button]),
    autoSelectFileEnabled: true,
    tabs: [{
      id: "tab_pathless",
      type: "markdown",
      sourceFilePath: null,
      sourceFileName: "README.md",
      title: "README"
    }],
    activeTabId: "tab_pathless",
    revealFolderTreeFileByPath: async () => null
  }));

  await api.syncFolderTreeSelectionToActiveTab();

  assert.equal(button.classList.contains("auto-selected"), true);
  assert.equal(button.getAttribute("aria-current"), "page");
});

test("tree button lookup matches path-backed tabs by exact path only", () => {
  const externalButton = createFolderTreeButton({
    fullPath: "C:/GitHub/shaybc/md-editor/package-lock.json",
    path: "package-lock.json",
    name: "package-lock.json"
  });
  const localButton = createFolderTreeButton({
    fullPath: "C:/GitHub/shaybc/md-editor/src/package-lock.json",
    path: "src/package-lock.json",
    name: "package-lock.json"
  });
  const api = loadFolderToolbar(createDeps({
    folderTreeRoot: createFolderTreeRoot([externalButton, localButton])
  }));

  assert.equal(api.findFolderTreeFileButtonForTab({
    type: "markdown",
    sourceFilePath: "C:/GitHub/shaybc/dcc/package-lock.json",
    sourceFileName: "package-lock.json",
    title: "package-lock.json"
  }), null);
  assert.equal(api.findFolderTreeFileButtonForTab({
    type: "markdown",
    sourceFilePath: "C:/GitHub/shaybc/md-editor/src/package-lock.json",
    sourceFileName: "package-lock.json",
    title: "package-lock.json"
  }), localButton);
});

test("renderFilteredFolderTree always uses the tree renderer", () => {
  let treeNodes = null;
  const deps = createDeps({
    folderTreeRoot: createFolderTreeRoot([]),
    currentFolderTreeNodes: [{ kind: "file", name: "notes.md", path: "notes.md" }],
    renderFolderTree: (nodes) => { treeNodes = nodes; }
  });
  const toolbar = loadFolderToolbar(deps);

  toolbar.renderFilteredFolderTree();

  assert.equal(treeNodes.length, 1);
  assert.equal(treeNodes[0].name, "notes.md");
  assert.equal(toolbar.toggleFolderViewMode, undefined);
  assert.equal(toolbar.setFolderViewMode, undefined);
});