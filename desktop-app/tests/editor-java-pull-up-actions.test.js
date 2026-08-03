const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const actionSource = fs.readFileSync(path.resolve(__dirname, "..", "resources", "js", "editor", "source-actions", "languages", "pull-up", "java-pull-up-actions.js"), "utf8");

function createHarness(analysisAvailable = true) {
  const providers = [];
  const commands = [];
  const alerts = [];
  const documentContext = { fileUri: "file:///C:/Project/src/Child.java", transport: { send() {} } };
  const analysis = {
    available: analysisAvailable,
    destinations: [{ handle: "destination", label: "Base" }],
    members: [{ handle: "member", label: "value", selected: true, canDeclareAbstract: false }],
    problems: analysisAvailable ? [] : [{ severity: "fatal", message: "The selected type has no editable destination." }]
  };
  const preview = { summary: [{ type: "modify", path: "C:/Project/src/Child.java" }] };
  const sandbox = {
    console,
    globalThis: null,
    window: {
      createMarkdownViewerPullUpDialog() {
        return {
          async open(options) {
            const settings = {
              ...options.request,
              destinationHandle: "destination",
              actions: { member: "pullUp" },
              deletedMethodHandles: [],
              replaceWherePossible: true,
              replaceInstanceof: false,
              createMethodStubs: true
            };
            await options.resolveConfiguration(settings);
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
      if (params.command.endsWith(".resolve")) return { matchingMethods: [], requiredMembers: [] };
      return { edit: { changes: {} }, problems: [] };
    }
  };
  const module = sandbox.window.registerMarkdownViewerJavaPullUpActions(app, {
    sourceActions: { registerProvider(provider) { providers.push(provider); return provider; } },
    javaSourceActions: {
      getActiveJavaContext() { return { path: "C:/Project/src/Child.java" }; },
      async getActiveLspDocumentContext() { return documentContext; }
    },
    requestClient,
    lspServerRegistry: { toFileUri() { return documentContext.fileUri; } },
    getActiveEditorPath() { return "C:/Project/src/Child.java"; },
    getActiveEditorValue() { return "class Child extends Base { int value; }"; },
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

test("Pull Up is discovered for an eligible selected Java member", async () => {
  const harness = createHarness();
  const context = { source: "class Child extends Base { int value; }", selection: { start: 31, end: 36 } };

  const initialActions = harness.provider.getAvailableActions(context);
  assert.equal(initialActions.length, 1);
  assert.equal(initialActions[0].disabled, false);
  assert.equal(await harness.provider.prepareAvailableActions(context), true);
  const actions = harness.provider.getAvailableActions(context);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].id, "pull-up");
  assert.equal(actions[0].menu, "refactor");
  assert.equal(harness.commands[0].command, "mdeditor.java.pullUp.check");
  assert.equal(harness.commands[0].arguments[0].selectionStart, 31);
});

test("Pull Up remains clickable and explains when JDT reports no valid destination", async () => {
  const harness = createHarness(false);
  const context = { source: "final class Utility { static void work() {} }", selection: { start: 34, end: 38 } };

  assert.equal(harness.provider.getAvailableActions(context).length, 1);
  await harness.provider.prepareAvailableActions(context);
  const actions = harness.provider.getAvailableActions(context);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].id, "pull-up");
  assert.equal(actions[0].disabled, false);
  assert.equal(actions[0].title, "The selected type has no editable destination.");

  const result = await actions[0].run(context);
  assert.equal(result.applied, false);
  assert.deepEqual(harness.alerts, ["The selected type has no editable destination."]);
});
test("Pull Up sends resolve and preview settings and applies the workspace edit", async () => {
  const harness = createHarness();
  const context = { source: "class Child extends Base { int value; }", selection: { start: 31, end: 36 } };
  await harness.provider.prepareAvailableActions(context);

  const result = await harness.module.pullUp(context);

  assert.equal(result.applied, true);
  assert.deepEqual(harness.commands.map((entry) => entry.command), [
    "mdeditor.java.pullUp.check",
    "mdeditor.java.pullUp.resolve",
    "mdeditor.java.pullUp.preview"
  ]);
  assert.equal(harness.commands[2].arguments[0].actions.member, "pullUp");
  assert.equal(harness.commands[2].arguments[0].destinationHandle, "destination");
});

test("Pull Up dialog script exposes the wizard factory without touching the DOM at load time", () => {
  const dialogSource = fs.readFileSync(path.resolve(__dirname, "..", "resources", "js", "editor", "source-actions", "dialogs", "pull-up-dialog.js"), "utf8");
  const sandbox = { window: {}, globalThis: null };
  sandbox.globalThis = sandbox.window;
  vm.createContext(sandbox);

  vm.runInContext(dialogSource, sandbox);

  assert.equal(typeof sandbox.window.createMarkdownViewerPullUpDialog, "function");
  assert.equal(typeof sandbox.window.createMarkdownViewerPullUpDialog().open, "function");
  assert.match(dialogSource, /function showWizardError\(error\)/);
  assert.doesNotMatch(dialogSource, /global\.alert/);
});

test("editor context menu renders optional action tooltips", () => {
  const contextMenuSource = fs.readFileSync(path.resolve(__dirname, "..", "resources", "js", "editor", "context-menu.js"), "utf8");
  assert.match(contextMenuSource, /action\.title \? ` title=/);
  assert.match(contextMenuSource, /escapeHtml\(action\.title\)/);
});