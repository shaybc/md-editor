const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadRegister() {
  const context = { console, window: {} };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,
    "../resources/js/editor/source-actions/languages/java-equals-hashcode-actions.js"), "utf8"), context);
  return context.window.registerMarkdownViewerJavaEqualsHashCodeActions;
}

function createHarness(options = {}) {
  const source = "class Employee { int id; }";
  const field = { id: "field:id", name: "id", typeName: "int" };
  const analysis = {
    owner: { name: "Employee" },
    fields: [field],
    hasHashCode: options.existing === true,
    hasEquals: false
  };
  const replacements = [];
  const alerts = [];
  let provider = null;
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const api = loadRegister()(app, {
    sourceActions: { registerProvider(value) { provider = value; } },
    isActiveJavaFile: () => options.isJava !== false,
    getActiveEditorValue: () => source,
    getActiveCodeMirrorEditor: () => ({
      getView() { return { state: { selection: { main: { head: source.indexOf("id") } } } }; },
      replaceRange(from, to, text) { replacements.push({ from, to, text }); return true; }
    }),
    generator: {
      analyze() { return analysis; },
      createInsertion(receivedSource, receivedAnalysis, fields, generationOptions) {
        assert.equal(receivedSource, source);
        assert.equal(receivedAnalysis, analysis);
        assert.equal(fields[0], field);
        assert.equal(generationOptions.useObjects, true);
        return { offset: source.lastIndexOf("}"), text: " equality methods " };
      }
    },
    dialog: {
      async open(receivedAnalysis) {
        assert.equal(receivedAnalysis, analysis);
        return { fields: [field], useObjects: true, insertionPoint: "end" };
      }
    },
    alertUser(message) { alerts.push(message); }
  });
  return { alerts, api, provider, replacements };
}

test("Java Source submenu exposes Generate hashCode and equals for Java files", () => {
  assert.deepEqual(Array.from(createHarness().provider.getAvailableActions(), (action) => action.id),
    ["generate-equals-hashcode"]);
  assert.deepEqual(Array.from(createHarness({ isJava: false }).provider.getAvailableActions()), []);
});

test("Generate hashCode and equals applies one local undoable insertion", async () => {
  const harness = createHarness();
  const result = await harness.api.generateEqualsHashCode();
  assert.equal(result.applied, true);
  assert.equal(harness.replacements.length, 1);
  assert.equal(harness.replacements[0].from, harness.replacements[0].to);
  assert.deepEqual(harness.alerts, []);
});

test("Generate hashCode and equals reports an existing method", async () => {
  const harness = createHarness({ existing: true });
  const result = await harness.api.generateEqualsHashCode();
  assert.equal(result.reason, "already-exists");
  assert.match(harness.alerts[0], /already defines/);
  assert.equal(harness.replacements.length, 0);
});
