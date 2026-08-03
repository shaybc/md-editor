const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadRegister() {
  const context = { console, window: {} };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,
    "../resources/js/editor/source-actions/languages/java-constructor-actions.js"), "utf8"), context);
  return context.window.registerMarkdownViewerJavaConstructorActions;
}

function createHarness(options = {}) {
  const source = "class Person { String name; }";
  const field = { id: "field:name", name: "name", typeName: "String" };
  const analysis = { owner: { name: "Person" }, fields: [field], constructors: [] };
  const replacements = [];
  const alerts = [];
  let provider = null;
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const api = loadRegister()(app, {
    sourceActions: { registerProvider(value) { provider = value; } },
    isActiveJavaFile: () => options.isJava !== false,
    getActiveEditorValue: () => source,
    getActiveCodeMirrorEditor: () => ({
      getView() { return { state: { selection: { main: { head: source.indexOf("name") } } } }; },
      replaceRange(from, to, text) { replacements.push({ from, to, text }); return true; }
    }),
    generator: {
      analyze() { return analysis; },
      hasMatchingConstructor() { return options.duplicate === true; },
      createInsertion(receivedSource, receivedAnalysis, fields, generationOptions) {
        assert.equal(receivedSource, source);
        assert.equal(receivedAnalysis, analysis);
        assert.equal(fields[0], field);
        assert.equal(generationOptions.accessModifier, "protected");
        return { offset: source.lastIndexOf("}"), text: " protected Person(String name) {} " };
      }
    },
    dialog: {
      async open(receivedAnalysis) {
        assert.equal(receivedAnalysis, analysis);
        return { fields: [field], accessModifier: "protected", insertionPoint: "end" };
      }
    },
    alertUser(message) { alerts.push(message); }
  });
  return { alerts, api, provider, replacements };
}

test("Java Source submenu exposes Generate Constructor using Fields for Java files", () => {
  assert.deepEqual(Array.from(createHarness().provider.getAvailableActions(), (action) => action.id),
    ["generate-constructor-using-fields"]);
  assert.deepEqual(Array.from(createHarness({ isJava: false }).provider.getAvailableActions()), []);
});

test("Generate Constructor using Fields applies one local undoable insertion", async () => {
  const harness = createHarness();
  const result = await harness.api.generateConstructor();

  assert.equal(result.applied, true);
  assert.equal(harness.replacements.length, 1);
  assert.equal(harness.replacements[0].from, harness.replacements[0].to);
  assert.deepEqual(harness.alerts, []);
});

test("Generate Constructor using Fields reports a duplicate signature", async () => {
  const harness = createHarness({ duplicate: true });
  const result = await harness.api.generateConstructor();

  assert.equal(result.reason, "already-exists");
  assert.match(harness.alerts[0], /already exists/);
  assert.equal(harness.replacements.length, 0);
});
