const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadModules() {
  const context = { console, structuredClone, setTimeout, window: {} };
  context.window = context;
  for (const relativePath of [
    "../resources/js/editor/source-actions/index.js",
    "../resources/js/editor/source-actions/languages/extract-method/java-extract-method-actions.js"
  ]) vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, relativePath), "utf8"), context, { filename: relativePath });
  return context;
}

function createHarness(options = {}) {
  const loaded = loadModules();
  const modules = {};
  const app = { modules, registerModule(name, api) { modules[name] = api; } };
  const sourceActions = loaded.registerMarkdownViewerSourceActions(app);
  const source = "class Demo {\n  int run(int value) {\n    int doubled = value * 2;\n    return doubled;\n  }\n}\n";
  const selectedText = options.expression ? "value * 2" : "int doubled = value * 2;";
  const start = source.indexOf(selectedText);
  const selection = { start, end: start + selectedText.length };
  let currentSelection = { ...selection };
  let currentSource = source;
  const fileUri = "file:///C:/workspace/Demo.java";
  const transport = {};
  const requests = [];
  const preparedSettings = [];
  const alerts = [];
  let keydown = null;
  const document = { addEventListener(type, listener) { if (type === "keydown") keydown = listener; } };
  const initialPreview = {
    defaultMethodName: "extracted",
    methodName: "extracted",
    methodSignature: "private static int extracted(int value)",
    summary: [{ type: "modify", before: source, after: source.replace("value * 2", "extracted(value)") }]
  };
  const workspaceAdapter = {
    async prepare(_refactor, settings) {
      preparedSettings.push(settings);
      return settings.methodName ? { ...initialPreview, methodName: settings.methodName } : initialPreview;
    },
    customizeMethodSignature(signature) { return signature; },
    async apply(preview) { return { applied: true, preview, async undo() {} }; }
  };
  const dialog = {
    async open(workflow) {
      if (options.changeSelection) currentSelection = { start: selection.start + 1, end: selection.end };
      if (options.changeSource) currentSource += " ";
      const selectedSettings = options.safeSettings ? {
        methodName: "calculate",
        accessModifier: "protected",
        declareFinal: true,
        declareSynchronized: true,
        generateMethodComment: true
      } : "calculate";
      const preview = options.rename ? await workflow.preparePreview(selectedSettings) : workflow.initialPreview;
      return workflow.applyPreview(preview);
    }
  };
  const requestClient = {
    async request(receivedTransport, method, params) {
      requests.push({ receivedTransport, method, params });
      if (options.jdtError) throw new Error("JDT rejected extraction");
      return { edit: { changes: { [fileUri]: [{ range: params.context.range, newText: "extracted();" }] } }, command: { command: "java.action.rename", arguments: [{ uri: fileUri, offset: 0, length: 9 }] } };
    }
  };
  const editor = { getLspDocumentContext() { return { languageId: options.languageId || "java", fileUri, transport }; } };
  const javaSourceActions = {
    getActiveJavaContext() { return { path: options.path || "C:/workspace/Demo.java", content: currentSource, language: { id: "java" } }; },
    async getActiveLspDocumentContext() { return { languageId: "java", fileUri, transport, workspaceConfiguration: { java: { format: { tabSize: 2, insertSpaces: false } } } }; }
  };
  const activeEditorCommands = { getActiveEditorSelection() { return currentSelection; } };
  const api = loaded.registerMarkdownViewerJavaExtractMethodActions(app, {
    sourceActions, javaSourceActions, activeEditorCommands, requestClient, dialog, workspaceAdapter, document,
    lspServerRegistry: { toFileUri() { return fileUri; }, fromFileUri() { return "C:/workspace/Demo.java"; } },
    getActiveEditorPath: () => options.path || "C:/workspace/Demo.java",
    getActiveEditorValue: () => currentSource,
    getActiveCodeMirrorEditor: () => editor,
    getActiveFolderPath: () => "C:/workspace",
    getWorkspaceEditPreview: () => ({}),
    isDesktopRuntime: () => options.desktop !== false,
    alertUser(message) { alerts.push(message); }
  });
  return { api, alerts, document, keydown: () => keydown, preparedSettings, requests, selection, source, sourceActions, setSource(value) { currentSource = value; } };
}

test("Extract Method is a Refactor action only for a selected in-workspace Java JDT document", () => {
  const harness = createHarness();
  const action = harness.sourceActions.getAvailableActions({ source: harness.source, selection: harness.selection })[0];
  assert.equal(action.id, "extract-method");
  assert.equal(action.menu, "refactor");
  assert.equal(action.shortcut, "Alt+Shift+M");
  assert.equal(createHarness().api.canExtractMethod({ source: harness.source, selection: { start: 0, end: 0 } }), false);
  assert.equal(createHarness({ path: "C:/other/Demo.java" }).api.canExtractMethod({ source: harness.source, selection: harness.selection }), false);
  assert.equal(createHarness({ languageId: "markdown" }).api.canExtractMethod({ source: harness.source, selection: harness.selection }), false);
  assert.equal(createHarness({ desktop: false }).api.canExtractMethod({ source: harness.source, selection: harness.selection }), false);
});

test("context action sends the exact selected LSP range and editor formatting options", async () => {
  const harness = createHarness({ rename: true });
  const result = await harness.api.extractMethod({ source: harness.source, selection: harness.selection });
  assert.equal(result.applied, true);
  assert.equal(harness.requests.length, 1);
  const request = harness.requests[0];
  assert.equal(request.method, "java/getRefactorEdit");
  assert.equal(request.params.command, "extractMethod");
  assert.equal(request.params.context.range.start.line, 2);
  assert.equal(request.params.context.range.start.character, 4);
  assert.equal(request.params.context.range.end.line, 2);
  assert.equal(request.params.context.range.end.character, 28);
  assert.equal(request.params.options.tabSize, 2);
  assert.equal(request.params.options.insertSpaces, false);
});

test("supported wizard settings are passed only to workspace-edit preparation", async () => {
  const harness = createHarness({ rename: true, safeSettings: true });
  await harness.api.extractMethod({ source: harness.source, selection: harness.selection });
  assert.equal(harness.requests.length, 1);
  const settings = harness.preparedSettings.at(-1);
  assert.equal(settings.methodName, "calculate");
  assert.equal(settings.accessModifier, "protected");
  assert.equal(settings.declareFinal, true);
  assert.equal(settings.declareSynchronized, true);
  assert.equal(settings.generateMethodComment, true);
});

test("expression extraction uses the exact expression range", async () => {
  const harness = createHarness({ expression: true });
  await harness.api.extractMethod({ source: harness.source, selection: harness.selection });
  const range = harness.requests[0].params.context.range;
  assert.equal(range.start.line, 2);
  assert.equal(range.start.character, 18);
  assert.equal(range.end.character, 27);
});

test("Alt+Shift+M invokes the same selected-source workflow", async () => {
  const harness = createHarness();
  let prevented = false;
  harness.keydown()({ key: "m", altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, target: {}, preventDefault() { prevented = true; }, stopPropagation() {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(prevented, true);
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].params.context.range.start.line, 2);
  assert.equal(harness.requests[0].params.context.range.start.character, 4);
});

test("changed selections, stale sources, and JDT errors are rejected without applying", async () => {
  const changed = createHarness({ changeSelection: true });
  assert.equal((await changed.api.extractMethod({ source: changed.source, selection: changed.selection })).applied, false);
  assert.match(changed.alerts[0], /selection changed/);

  const stale = createHarness({ changeSource: true });
  assert.equal((await stale.api.extractMethod({ source: stale.source, selection: stale.selection })).applied, false);
  assert.match(stale.alerts[0], /source changed/);

  const failed = createHarness({ jdtError: true });
  assert.equal((await failed.api.extractMethod({ source: failed.source, selection: failed.selection })).applied, false);
  assert.match(failed.alerts[0], /JDT rejected extraction/);
});
