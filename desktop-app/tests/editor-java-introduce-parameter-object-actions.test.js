const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadAction() {
  const context = { globalThis: null, structuredClone };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.resolve(
    __dirname,
    "../resources/js/editor/source-actions/languages/introduce-parameter-object/java-parameter-object-model.js"
  ), "utf8"), context);
  context.createMarkdownViewerJavaParameterObjectAnalysis = { _test: {
    offsetToPosition(source, offset) {
      const before = source.slice(0, offset).split("\n");
      return { line: before.length - 1, character: before.at(-1).length };
    }
  } };
  vm.runInNewContext(fs.readFileSync(path.resolve(
    __dirname,
    "../resources/js/editor/source-actions/languages/introduce-parameter-object/java-introduce-parameter-object-actions.js"
  ), "utf8"), context);
  return context;
}

function createHarness(options = {}) {
  const loaded = loadAction();
  const source = "class Service { void save(String name, int id) {} }";
  const providers = [];
  let dialogWorkflow = null;
  const app = {
    modules: {},
    registerModule(name, value) { this.modules[name] = value; }
  };
  const analysis = {
    methodName: "save",
    owner: { name: "Service" },
    parameters: [
      { originalIndex: 0, type: "String", name: "name" },
      { originalIndex: 1, type: "int", name: "id" }
    ],
    returnType: "void",
    visibility: "",
    isConstructor: false
  };
  const api = loaded.registerMarkdownViewerJavaIntroduceParameterObjectActions(app, {
    sourceActions: { registerProvider(provider) { providers.push(provider); return provider; } },
    javaSourceActions: {
      getActiveJavaContext() { return {}; },
      async getActiveLspDocumentContext() {
        return { fileUri: "file:///workspace/Service.java", transport: {} };
      }
    },
    activeEditorCommands: { getActiveEditorSelection() { return { start: source.indexOf("save"), end: source.indexOf("save") }; } },
    requestClient: {},
    lspServerRegistry: { toFileUri() { return "file:///workspace/Service.java"; } },
    getActiveEditorPath: () => options.path || "C:/workspace/Service.java",
    getActiveEditorValue: () => source,
    getActiveCodeMirrorEditor: () => ({
      getLspDocumentContext() { return { languageId: "java", transport: {} }; }
    }),
    getActiveFolderPath: () => "C:/workspace",
    getWorkspaceEditPreview: () => ({}),
    isDesktopRuntime: () => options.desktop !== false,
    analysisService: { async analyze() { return analysis; } },
    workspaceAdapter: {
      async prepare() { return { summary: [] }; },
      async apply() { return { applied: true, undo: async () => true }; }
    },
    dialog: {
      async open(workflow) {
        dialogWorkflow = workflow;
        return { applied: false };
      }
    }
  });
  return { api, providers, getWorkflow: () => dialogWorkflow };
}

test("Introduce Parameter Object is a Java Refactor action for in-workspace JDT documents", () => {
  const harness = createHarness();
  const action = harness.providers[0].getAvailableActions()[0];
  assert.equal(action.id, "introduce-parameter-object");
  assert.equal(action.menu, "refactor");
  assert.equal(action.label, "Introduce Parameter Object...");
  assert.equal(createHarness({ path: "C:/other/Service.java" }).api.canIntroduceParameterObject(), false);
  assert.equal(createHarness({ desktop: false }).api.canIntroduceParameterObject(), false);
});

test("Introduce Parameter Object resolves analysis and opens the configured workflow", async () => {
  const harness = createHarness();
  const result = await harness.api.introduceParameterObject();
  assert.equal(result.applied, false);
  const workflow = harness.getWorkflow();
  assert.equal(workflow.initialModel.className, "ServiceParameter");
  assert.equal(workflow.getSignature(workflow.initialModel), "void save(ServiceParameter parameterObject)");
  assert.equal(workflow.validate(workflow.initialModel), "");
});
