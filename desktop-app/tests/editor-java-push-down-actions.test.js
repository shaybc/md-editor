const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const actionSource = fs.readFileSync(path.resolve(__dirname, "..", "resources", "js", "editor", "source-actions", "languages", "push-down", "java-push-down-actions.js"), "utf8");

function createHarness(analysisAvailable = true) {
  const providers = [];
  const commands = [];
  const alerts = [];
  const documentContext = { fileUri: "file:///C:/Project/src/Base.java", transport: { send() {} } };
  const analysis = {
    available: analysisAvailable,
    members: [
      { handle: "field", label: "value", action: "pushDown", availableActions: ["none", "pushDown"] },
      { handle: "method", label: "getValue()", action: "pushDown", availableActions: ["none", "pushDown", "leaveAbstract"] }
    ],
    problems: analysisAvailable ? [] : [{ severity: "fatal", message: "The selected type has no subclasses." }]
  };
  const preview = { summary: [{ type: "modify", path: "C:/Project/src/Base.java" }] };
  const sandbox = {
    console,
    globalThis: null,
    window: {
      createMarkdownViewerPushDownDialog() {
        return {
          async open(options) {
            const settings = { ...options.request, actions: { field: "pushDown", method: "leaveAbstract" } };
            await options.resolveRequiredMembers(settings);
            const resolvedPreview = await options.preparePreview(settings);
            await options.applyPreview(resolvedPreview);
            await options.onAfterApply();
            return { applied: true };
          }
        };
      }
    }
  };
  sandbox.globalThis = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(actionSource, sandbox);
  const app = {
    modules: {},
    registerModule(name, value) { this.modules[name] = value; }
  };
  const requestClient = {
    async request(_transport, method, params) {
      assert.equal(method, "workspace/executeCommand");
      commands.push(params);
      if (params.command.endsWith(".check")) return analysis;
      if (params.command.endsWith(".resolve")) return { members: analysis.members, problems: [] };
      return { edit: { changes: {} }, problems: [] };
    }
  };
  const module = sandbox.window.registerMarkdownViewerJavaPushDownActions(app, {
    sourceActions: { registerProvider(provider) { providers.push(provider); return provider; } },
    javaSourceActions: {
      getActiveJavaContext() { return { path: "C:/Project/src/Base.java" }; },
      async getActiveLspDocumentContext() { return documentContext; }
    },
    requestClient,
    lspServerRegistry: { toFileUri() { return documentContext.fileUri; } },
    getActiveEditorPath() { return "C:/Project/src/Base.java"; },
    getActiveEditorValue() { return "class Base { int value; int getValue() { return value; } }"; },
    getActiveCodeMirrorEditor() { return { getLspDocumentContext() { return { languageId: "java", transport: documentContext.transport }; } }; },
    getActiveFolderPath() { return "C:/Project"; },
    getWorkspaceEditPreview() {
      return {
        async resolve() { return preview; },
        async apply(value) { assert.equal(value, preview); return { applied: true, undo() {} }; }
      };
    },
    isDesktopRuntime() { return true; },
    alertUser(message) { alerts.push(message); },
    async reloadFolderTree() {}
  });
  return { module, provider: providers[0], commands, alerts };
}

test("Push Down is discovered for an eligible Java member", async () => {
  const harness = createHarness();
  const context = { source: "class Base { int value; }", selection: { start: 17, end: 22 } };

  assert.equal(harness.provider.getAvailableActions(context).length, 1);
  assert.equal(await harness.provider.prepareAvailableActions(context), true);
  const action = harness.provider.getAvailableActions(context)[0];

  assert.equal(action.id, "push-down");
  assert.equal(action.menu, "refactor");
  assert.equal(harness.commands[0].command, "mdeditor.java.pushDown.check");
  assert.equal(harness.commands[0].arguments[0].selectionStart, 17);
});

test("Push Down explains a JDT eligibility failure while remaining clickable", async () => {
  const harness = createHarness(false);
  const context = { source: "final class Base {}", selection: { start: 12, end: 16 } };

  await harness.provider.prepareAvailableActions(context);
  const action = harness.provider.getAvailableActions(context)[0];
  assert.equal(action.disabled, false);
  assert.equal(action.title, "The selected type has no subclasses.");

  const result = await action.run(context);
  assert.equal(result.applied, false);
  assert.deepEqual(harness.alerts, ["The selected type has no subclasses."]);
});

test("Push Down resolves dependencies, previews, and applies selected member actions", async () => {
  const harness = createHarness();
  const context = { source: "class Base { int value; }", selection: { start: 17, end: 22 } };
  await harness.provider.prepareAvailableActions(context);

  const result = await harness.module.pushDown(context);

  assert.equal(result.applied, true);
  assert.deepEqual(harness.commands.map((entry) => entry.command), [
    "mdeditor.java.pushDown.check",
    "mdeditor.java.pushDown.resolve",
    "mdeditor.java.pushDown.preview"
  ]);
  assert.equal(harness.commands[2].arguments[0].actions.field, "pushDown");
  assert.equal(harness.commands[2].arguments[0].actions.method, "leaveAbstract");
});

test("Push Down dialog exposes its wizard factory without touching the DOM at load time", () => {
  const dialogSource = fs.readFileSync(path.resolve(__dirname, "..", "resources", "js", "editor", "source-actions", "dialogs", "push-down-dialog.js"), "utf8");
  const sandbox = { window: {}, globalThis: null };
  sandbox.globalThis = sandbox.window;
  vm.createContext(sandbox);

  vm.runInContext(dialogSource, sandbox);

  assert.equal(typeof sandbox.window.createMarkdownViewerPushDownDialog, "function");
  assert.equal(typeof sandbox.window.createMarkdownViewerPushDownDialog().open, "function");
  assert.doesNotMatch(dialogSource, /global\.alert/);
});
