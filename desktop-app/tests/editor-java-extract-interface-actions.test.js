const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadModules() {
  const context = { console, structuredClone, window: {} };
  context.window = context;
  for (const relativePath of [
    "../resources/js/editor/source-actions/index.js",
    "../resources/js/editor/source-actions/languages/extract-interface/java-extract-interface-actions.js"
  ]) {
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, relativePath), "utf8"), context, { filename: relativePath });
  }
  return context;
}

function createHarness(options = {}) {
  const loaded = loadModules();
  const modules = {};
  const app = { modules, registerModule(name, api) { modules[name] = api; } };
  const sourceActions = loaded.registerMarkdownViewerSourceActions(app);
  const source = "package demo;\r\npublic class Greeting {\r\n public int id() { return 1; }\r\n}\r\n";
  const fileUri = "file:///C:/workspace/src/demo/Greeting.java";
  const transport = { messages: [], send(message) { this.messages.push(JSON.parse(message)); } };
  const requests = [];
  const settings = {
    interfaceName: "Greeter",
    selectedHandleIdentifiers: ["=Greeting~id"],
    replaceWherePossible: true,
    replaceInstanceof: false,
    generateOverrideAnnotations: true,
    generateMethodComments: true
  };
  let dialogWorkflow = null;
  const dialog = {
    async open(workflow) {
      dialogWorkflow = workflow;
      if (options.cancel) return null;
      const preview = await workflow.preparePreview(settings);
      const applied = await workflow.applyPreview(preview);
      return { applied: applied.applied };
    }
  };
  const workspaceAdapter = {
    async collectInstanceofEdits() { return {}; },
    async prepare(edit, receivedSettings) { return { edit, receivedSettings, operations: [], summary: [] }; },
    async apply(preview) { return { applied: true, preview, async undo() {} }; }
  };
  const requestClient = {
    async request(receivedTransport, method, params) {
      requests.push({ receivedTransport, method, params });
      if (method === "java/checkExtractInterfaceStatus") {
        return {
          subTypeName: "Greeting",
          members: [{ name: "id", typeName: "int", parameters: [], handleIdentifier: "=Greeting~id" }],
          destinationResponse: { destinations: [{ name: "demo", isParentOfSelectedFile: true }] }
        };
      }
      if (method === "java/getRefactorEdit") {
        if (options.refactorError) throw new Error("JDT failed");
        return { edit: { changes: { [fileUri]: [] } } };
      }
      return [];
    }
  };
  const editor = {
    getLspDocumentContext() { return { languageId: "java", fileUri, transport }; }
  };
  const javaSourceActions = {
    getActiveJavaContext() { return { path: "C:/workspace/src/demo/Greeting.java", content: source, language: { id: "java" } }; },
    async getActiveLspDocumentContext() {
      return { languageId: "java", fileUri, transport, workspaceConfiguration: { java: { format: { enabled: true } } } };
    }
  };
  const alerts = [];
  const api = loaded.registerMarkdownViewerJavaExtractInterfaceActions(app, {
    sourceActions,
    javaSourceActions,
    requestClient,
    lspServerRegistry: { toFileUri() { return fileUri; } },
    dialog,
    workspaceAdapter,
    getActiveEditorPath: () => options.path || "C:/workspace/src/demo/Greeting.java",
    getActiveEditorValue: () => source,
    getActiveCodeMirrorEditor: () => editor,
    getActiveFolderPath: () => "C:/workspace",
    getWorkspaceEditPreview: () => ({}),
    isDesktopRuntime: () => options.desktop !== false,
    reloadFolderTree() {},
    alertUser(message) { alerts.push(message); }
  });
  return { api, alerts, dialogWorkflow: () => dialogWorkflow, requests, sourceActions, transport };
}

test("Extract Interface is a Refactor action only for an in-workspace Java JDT document", () => {
  const harness = createHarness();
  const action = harness.sourceActions.getAvailableActions({})[0];
  assert.equal(action.id, "extract-interface");
  assert.equal(action.menu, "refactor");
  assert.equal(createHarness({ path: "C:/other/Greeting.java" }).api.canExtractInterface(), false);
  assert.equal(createHarness({ path: "C:/workspace/readme.md" }).api.canExtractInterface(), false);
  assert.equal(createHarness({ desktop: false }).api.canExtractInterface(), false);
});

test("Extract Interface sends exact JDT requests and restores configuration", async () => {
  const harness = createHarness();
  const result = await harness.api.extractInterface();

  assert.equal(result.applied, true);
  assert.deepEqual(harness.requests.map((entry) => entry.method), [
    "java/checkExtractInterfaceStatus",
    "java/getRefactorEdit"
  ]);
  const status = harness.requests[0].params;
  assert.equal(status.textDocument.uri, "file:///C:/workspace/src/demo/Greeting.java");
  assert.equal(status.range.start.line, 1);
  assert.equal(status.range.start.character, 13);
  const refactor = harness.requests[1].params;
  assert.equal(refactor.command, "extractInterface");
  assert.deepEqual(Array.from(refactor.commandArguments[0]), ["=Greeting~id"]);
  assert.equal(refactor.commandArguments[1], "Greeter");
  assert.equal(refactor.commandArguments[2].name, "demo");
  assert.equal(harness.transport.messages.length, 2);
  assert.equal(harness.transport.messages[0].params.settings.java.refactoring.extract.interface.replace, true);
  assert.equal(harness.transport.messages[1].params.settings.java.format.enabled, true);
});

test("Cancel is side-effect free and JDT failures still restore configuration", async () => {
  const cancelled = createHarness({ cancel: true });
  assert.equal((await cancelled.api.extractInterface()).reason, "cancelled");
  assert.deepEqual(cancelled.requests.map((entry) => entry.method), ["java/checkExtractInterfaceStatus"]);
  assert.equal(cancelled.transport.messages.length, 0);

  const failed = createHarness({ refactorError: true });
  const result = await failed.api.extractInterface();
  assert.equal(result.applied, false);
  assert.equal(failed.transport.messages.length, 2);
  assert.match(failed.alerts[0], /JDT failed/);
});
