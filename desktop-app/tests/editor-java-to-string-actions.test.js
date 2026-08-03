const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadRegister() {
  const context = { console, window: {} };
  context.window = context;
  const file = path.resolve(__dirname, "../resources/js/editor/source-actions/languages/java-to-string-actions.js");
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context);
  return context.window.registerMarkdownViewerJavaToStringActions;
}

function createHarness(options = {}) {
  const source = "class Person { String name; }";
  const member = { id: "field:name", name: "name", label: "name", expression: "name" };
  const analysis = { owner: { name: "Person" }, fields: [member], methods: [], hasToString: options.hasToString === true };
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
      createInsertion(receivedSource, receivedAnalysis, members, generationOptions) {
        assert.equal(receivedSource, source);
        assert.equal(receivedAnalysis, analysis);
        assert.equal(members[0], member);
        assert.equal(generationOptions.codeStyle, "format");
        return { offset: source.lastIndexOf("}"), text: " public String toString() { return \"Person\"; } " };
      }
    },
    dialog: {
      async open(receivedAnalysis) {
        assert.equal(receivedAnalysis, analysis);
        return options.cancel ? null : { members: [member], codeStyle: "format" };
      }
    },
    alertUser(message) { alerts.push(message); }
  });
  return { alerts, api, provider, replacements };
}

test("Java Source submenu exposes Generate toString only for editable Java files", () => {
  assert.deepEqual(Array.from(createHarness().provider.getAvailableActions(), (action) => action.id), ["generate-to-string"]);
  assert.deepEqual(Array.from(createHarness({ isJava: false }).provider.getAvailableActions()), []);
});

test("Generate toString applies one local undoable insertion", async () => {
  const harness = createHarness();
  const result = await harness.api.generateToString();

  assert.equal(result.applied, true);
  assert.equal(harness.replacements.length, 1);
  assert.equal(harness.replacements[0].from, harness.replacements[0].to);
  assert.deepEqual(harness.alerts, []);
});

test("Generate toString reports an existing override without opening generation", async () => {
  const harness = createHarness({ hasToString: true });
  const result = await harness.api.generateToString();

  assert.equal(result.reason, "already-exists");
  assert.match(harness.alerts[0], /already defines toString/);
  assert.equal(harness.replacements.length, 0);
});
