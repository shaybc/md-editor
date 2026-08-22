const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadSourceActionModules() {
  const context = { window: {} };
  context.window = context;
  [
    "../resources/js/editor/source-actions/index.js",
    "../resources/js/editor/source-actions/comment-actions.js",
    "../resources/js/editor/source-actions/indentation-actions.js",
    "../resources/js/editor/source-actions/formatting-actions.js",
    "../resources/js/editor/source-actions/project-documentation-actions.js"
  ].forEach((relativePath) => {
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, relativePath), "utf8"), context, { filename: relativePath });
  });
  return context;
}

function createRegistry(capabilities) {
  const loaded = loadSourceActionModules();
  const modules = {};
  const app = {
    modules,
    registerModule(name, api) { modules[name] = api; }
  };
  const calls = [];
  const refreshes = [];
  const sourceActions = loaded.registerMarkdownViewerSourceActions(app);
  const activeEditorCommands = {
    getActiveEditor() {
      return { getActiveLanguage: () => capabilities?.activeLanguage || null };
    },
    getCommentCapabilities: () => capabilities,
    toggleComment() { calls.push("line"); return true; },
    toggleBlockComment() { calls.push("block"); return true; },
    correctIndentation() { calls.push("indentation"); return true; },
    canFormatActiveDocument() { return capabilities?.canFormatActiveDocument === true; },
    async formatActiveDocument() { calls.push("format"); return true; }
  };
  loaded.registerMarkdownViewerCommentSourceActions(app, { sourceActions, activeEditorCommands });
  loaded.registerMarkdownViewerIndentationSourceActions(app, {
    sourceActions,
    activeEditorCommands,
    updateEditorLineNumbers() { refreshes.push("lines"); },
    updateEditorSelectionHighlights() { refreshes.push("selection"); },
    updateStatusLine() { refreshes.push("status"); }
  });
  loaded.registerMarkdownViewerFormattingSourceActions(app, {
    sourceActions,
    activeEditorCommands,
    updateEditorLineNumbers() { refreshes.push("lines"); },
    updateEditorSelectionHighlights() { refreshes.push("selection"); },
    updateStatusLine() { refreshes.push("status"); }
  });
  return { sourceActions, calls, refreshes };
}

test("comment Source actions expose line and block toggles for block-capable languages", () => {
  const { sourceActions, calls } = createRegistry({ canToggleComment: true, canToggleBlockComment: true });
  const actions = sourceActions.getAvailableActions();

  assert.deepEqual(Array.from(actions, (action) => action.id), ["toggle-comment", "toggle-block-comment", "correct-indentation"]);
  assert.equal(actions[0].shortcut, "Ctrl+/");
  assert.equal(actions[1].shortcut, "Ctrl+Shift+/");
  assert.equal(sourceActions.executeAction("toggle-comment"), true);
  assert.equal(sourceActions.executeAction("toggle-block-comment"), true);
  assert.deepEqual(calls, ["line", "block"]);
});

test("comment Source actions hide block toggle for line-comment-only languages", () => {
  const { sourceActions } = createRegistry({ canToggleComment: true, canToggleBlockComment: false });

  assert.deepEqual(Array.from(sourceActions.getAvailableActions(), (action) => action.id), ["toggle-comment", "correct-indentation"]);
});

test("comment Source actions are absent when the active language has no comment tokens", () => {
  const { sourceActions } = createRegistry({ canToggleComment: false, canToggleBlockComment: false });

  assert.deepEqual(Array.from(sourceActions.getAvailableActions(), (action) => action.id), ["correct-indentation"]);
  assert.equal(sourceActions.executeAction("toggle-comment"), false);
});

test("Correct Indentation Source action executes the editor command and refreshes editor status", () => {
  const { sourceActions, calls, refreshes } = createRegistry({ canToggleComment: false, canToggleBlockComment: false });
  const action = sourceActions.getAvailableActions()[0];

  assert.equal(action.label, "Correct Indentation");
  assert.equal(action.shortcut, "Ctrl+I");
  assert.equal(action.icon, "bi-text-indent-left");
  assert.equal(sourceActions.executeAction("correct-indentation"), true);
  assert.deepEqual(calls, ["indentation"]);
  assert.deepEqual(refreshes, ["lines", "selection", "status"]);
});
test("Format File Source action executes the active document formatter", async () => {
  const { sourceActions, calls, refreshes } = createRegistry({ canToggleComment: false, canToggleBlockComment: false, canFormatActiveDocument: true });
  const action = sourceActions.findAvailableAction("format-file");

  assert.equal(action.label, "Format File");
  assert.equal(action.icon, "bi-magic");
  assert.equal(await sourceActions.executeAction("format-file"), true);
  assert.deepEqual(calls, ["format"]);
  assert.deepEqual(refreshes, ["lines", "selection", "status"]);
});

test("Format File Source action defers Java formatting to the Java provider", () => {
  const { sourceActions } = createRegistry({
    canToggleComment: false,
    canToggleBlockComment: false,
    canFormatActiveDocument: true,
    activeLanguage: { id: "java", codeMirrorLanguage: "java" }
  });

  assert.equal(sourceActions.findAvailableAction("format-file"), null);
});

test("Source action registry prepares providers and executes nested leaf actions", async () => {
  const loaded = loadSourceActionModules();
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const sourceActions = loaded.registerMarkdownViewerSourceActions(app);
  let prepared = false;
  const calls = [];
  sourceActions.registerProvider({
    id: "nested-actions",
    async prepareAvailableActions() { prepared = true; return true; },
    getAvailableActions() {
      return [{ id: "group", label: "Group", children: [{ id: "nested-leaf", run() { calls.push("leaf"); return true; } }] }];
    }
  });

  assert.equal(await sourceActions.prepareAvailableActions(), true);
  assert.equal(prepared, true);
  assert.equal(sourceActions.findAvailableAction("nested-leaf").id, "nested-leaf");
  assert.equal(sourceActions.executeAction("nested-leaf"), true);
  assert.deepEqual(calls, ["leaf"]);
});

test("method documentation Source action inserts locally without invoking project Javadoc", () => {
  const loaded = loadSourceActionModules();
  const modules = {};
  const app = { modules, registerModule(name, api) { modules[name] = api; } };
  const sourceActions = loaded.registerMarkdownViewerSourceActions(app);
  const replacements = [];
  const alerts = [];
  loaded.registerMarkdownViewerProjectDocumentationSourceActions(app, {
    sourceActions,
    activeEditorCommands: {
      replaceActiveEditorRange(start, end, text) {
        replacements.push({ start, end, text });
        return true;
      }
    },
    generator: {
      createInsertion() {
        return { status: "ready", offset: 12, text: "/** docs */\n", methodName: "run" };
      }
    },
    getActiveEditorPath: () => "C:/Project/Sample.java",
    getActiveEditorValue: () => "class Sample { void run() {} }",
    alertUser: (message) => alerts.push(message)
  });

  const actions = sourceActions.getAvailableActions({ selection: { start: 22, end: 22 } });
  assert.deepEqual(Array.from(actions, (action) => action.id), ["generate-method-documentation"]);
  const result = sourceActions.executeAction("generate-method-documentation", { selection: { start: 22, end: 22 } });
  assert.equal(result.applied, true);
  assert.equal(result.methodName, "run");
  assert.deepEqual(replacements, [{ start: 12, end: 12, text: "/** docs */\n" }]);
  assert.deepEqual(alerts, []);
});

test("method documentation Source action keeps existing Javadoc", () => {
  const loaded = loadSourceActionModules();
  const modules = {};
  const app = { modules, registerModule(name, api) { modules[name] = api; } };
  const sourceActions = loaded.registerMarkdownViewerSourceActions(app);
  const alerts = [];
  loaded.registerMarkdownViewerProjectDocumentationSourceActions(app, {
    sourceActions,
    activeEditorCommands: { replaceActiveEditorRange() { throw new Error("must not edit"); } },
    generator: { createInsertion() { return { status: "existing", methodName: "run" }; } },
    getActiveEditorPath: () => "C:/Project/Sample.java",
    getActiveEditorValue: () => "class Sample {}",
    alertUser: (message) => alerts.push(message)
  });

  const result = sourceActions.executeAction("generate-method-documentation", { selection: { start: 1, end: 1 } });
  assert.equal(result.applied, false);
  assert.equal(result.reason, "existing");
  assert.match(alerts[0], /already has Javadoc/);
});
