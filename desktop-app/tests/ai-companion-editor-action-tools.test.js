const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadRegisterFunction() {
  const code = fs.readFileSync(path.join(__dirname, "../resources/js/ai-companion/editor-action-tools.js"), "utf8");
  const sandbox = { console, window: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "editor-action-tools.js" });
  return sandbox.registerMarkdownViewerAiCompanionEditorActionTools;
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function createHarness() {
  const files = new Map();
  const tabs = [];
  const focusedLines = [];
  let nextTabId = 1;
  let activeTabId = "";
  let selection = { start: 0, end: 0 };
  const app = {
    modules: {},
    registerModule(name, api) {
      this.modules[name] = api;
    }
  };

  function getActiveTab() {
    return tabs.find((tab) => tab.id === activeTabId) || null;
  }

  function getFileName(filePath) {
    return normalizePath(filePath).split("/").filter(Boolean).pop() || "Untitled.md";
  }

  function joinPath(...parts) {
    const joined = parts.map((part) => normalizePath(part).replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
    return joined.match(/^[A-Za-z]:\//) ? joined : `C:/${joined.replace(/^C:\//, "")}`;
  }

  function createTab(content, title) {
    const tab = {
      id: `tab-${nextTabId++}`,
      title,
      type: "markdown",
      content: String(content || ""),
      sourceFilePath: "",
      sourceFileName: "",
      openedSource: null
    };
    tabs.push(tab);
    activeTabId = tab.id;
    selection = { start: 0, end: 0 };
    return tab;
  }

  const deps = {
    activeEditorCommands: {
      getActiveEditorSelection: () => ({ ...selection }),
      getActiveEditorValue: () => getActiveTab()?.content || "",
      replaceActiveEditorRange: (start, end, replacement) => {
        const tab = getActiveTab();
        if (!tab) return false;
        tab.content = `${tab.content.slice(0, start)}${replacement}${tab.content.slice(end)}`;
        const cursor = start + String(replacement || "").length;
        selection = { start: cursor, end: cursor };
        return true;
      }
    },
    fileSave: {
      saveMarkdownTabToSource: async (tab) => {
        if (!tab?.sourceFilePath) return false;
        files.set(normalizePath(tab.sourceFilePath), tab.content);
        return true;
      }
    },
    tabsModule: {
      newTab: createTab,
      switchTab: (tabId) => {
        if (!tabs.some((tab) => tab.id === tabId)) return false;
        activeTabId = tabId;
        return true;
      }
    },
    getTabs: () => tabs,
    getActiveTabId: () => activeTabId,
    getWorkspaceRoot: () => "C:/workspace",
    getFileName,
    joinPath,
    openDocumentSourceFile: async (file) => {
      const filePath = normalizePath(file.path || file.fullPath || "");
      const tab = createTab(files.get(filePath) || "", file.name || getFileName(filePath));
      tab.sourceFilePath = filePath;
      tab.sourceFileName = getFileName(filePath);
      tab.openedSource = { path: filePath };
      return tab;
    },
    focusEditorLine: (line) => focusedLines.push(line),
    fileExists: async (filePath) => files.has(normalizePath(filePath))
  };
  const api = loadRegisterFunction()(app, deps);

  return {
    api,
    app,
    deps,
    files,
    tabs,
    focusedLines,
    get activeTabId() { return activeTabId; },
    setSelection: (start, end) => {
      selection = { start, end };
    },
    createSourceTab: (filePath, content) => {
      const normalized = normalizePath(filePath);
      files.set(normalized, content);
      const tab = createTab(content, getFileName(normalized));
      tab.sourceFilePath = normalized;
      tab.sourceFileName = getFileName(normalized);
      tab.openedSource = { path: normalized };
      return tab;
    }
  };
}

test("registers editor action tools and opens an existing file in a tab", async () => {
  const harness = createHarness();
  harness.files.set("C:/workspace/docs/a.md", "# A");

  const result = await harness.api.execute("open_file_in_tab", { path: "docs/a.md", line: 4 });

  assert.equal(harness.app.modules.aiCompanionEditorActionTools, harness.api);
  assert.equal(result.opened, true);
  assert.equal(result.path, "C:/workspace/docs/a.md");
  assert.equal(harness.tabs.length, 1);
  assert.equal(harness.tabs[0].content, "# A");
  assert.deepEqual(harness.focusedLines, [4]);
});

test("creates a saved document tab and protects existing files without overwrite", async () => {
  const harness = createHarness();

  const result = await harness.api.execute("create_document_tab", {
    path: "notes/new.md",
    title: "New Note",
    content: "# New"
  });

  assert.equal(result.created, true);
  assert.equal(result.path, "C:/workspace/notes/new.md");
  assert.equal(harness.files.get("C:/workspace/notes/new.md"), "# New");
  assert.equal(harness.tabs[0].title, "New Note");
  await assert.rejects(
    () => harness.api.execute("create_document_tab", { path: "notes/new.md", content: "replace" }),
    /already exists/
  );
});

test("inserts at cursor and saves the active source tab", async () => {
  const harness = createHarness();
  harness.createSourceTab("C:/workspace/docs/a.md", "Hello world");
  harness.setSelection(5, 5);

  const result = await harness.api.execute("insert_at_cursor", { text: ", live", expectedPath: "docs/a.md" });

  assert.equal(result.changed, true);
  assert.equal(harness.files.get("C:/workspace/docs/a.md"), "Hello, live world");
});

test("replaces selection and saves the active source tab", async () => {
  const harness = createHarness();
  harness.createSourceTab("C:/workspace/docs/a.md", "Hello old text");
  harness.setSelection(6, 9);

  const result = await harness.api.execute("replace_selection", { replacement: "new", expectedPath: "docs/a.md" });

  assert.equal(result.changed, true);
  assert.equal(harness.files.get("C:/workspace/docs/a.md"), "Hello new text");
});

test("rejects stale range edits when expectedText does not match", async () => {
  const harness = createHarness();
  harness.createSourceTab("C:/workspace/docs/a.md", "abcdef");

  await assert.rejects(
    () => harness.api.execute("replace_document_range", { path: "docs/a.md", start: 1, end: 4, replacement: "X", expectedText: "zzz" }),
    /does not match expectedText/
  );
  assert.equal(harness.files.get("C:/workspace/docs/a.md"), "abcdef");
});

test("extracts selected text to a new note and replaces the selection with a link", async () => {
  const harness = createHarness();
  harness.createSourceTab("C:/workspace/docs/source.md", "Read selected text today");
  harness.setSelection(5, 18);

  const result = await harness.api.execute("extract_selection_to_note", {
    path: "notes/extracted.md",
    title: "Extracted",
    replaceWithLink: true
  });

  assert.equal(result.created, true);
  assert.equal(result.replacedSelection, true);
  assert.equal(harness.files.get("C:/workspace/notes/extracted.md"), "selected text");
  assert.equal(harness.files.get("C:/workspace/docs/source.md"), "Read [[Extracted]] today");
});
