const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const sourcePath = path.resolve(__dirname, "../resources/js/editor/source-actions/languages/java-getter-setter-actions.js");

function loadModule() {
  const context = { console, window: {} };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: "java-getter-setter-actions.js" });
  return context.window.registerMarkdownViewerJavaGetterSetterActions;
}

function createHarness(options = {}) {
  const register = loadModule();
  const alerts = [];
  const replacements = [];
  const refreshes = [];
  let provider = null;
  const source = "class Demo {\n    String name;\n}\n";
  const fields = options.fields === undefined ? [{
    fieldName: "name",
    typeName: "String",
    isStatic: false,
    generateGetter: true,
    generateSetter: true
  }] : options.fields;
  const selected = options.selected === undefined
    ? { fields, order: "pairs", generateComments: false }
    : options.selected;
  const selectedFields = Array.isArray(selected) ? selected : selected?.fields;
  const owner = { name: "Demo" };
  const accessorGenerator = {
    analyze(receivedSource, cursorOffset) {
      assert.equal(receivedSource, source);
      assert.equal(cursorOffset, source.indexOf("name"));
      return { owner, fields };
    },
    createInsertion(receivedSource, receivedOwner, receivedFields, receivedOptions) {
      assert.equal(receivedSource, source);
      assert.equal(receivedOwner, owner);
      assert.equal(receivedFields, selectedFields);
      assert.equal(receivedOptions.order, Array.isArray(selected) ? undefined : selected.order);
      assert.equal(receivedOptions.generateComments, Array.isArray(selected) ? undefined : selected.generateComments === true);
      return { offset: source.indexOf("}"), text: "    public String getName() { return name; }\n" };
    }
  };
  const editor = {
    getView() { return { state: { selection: { main: { head: source.indexOf("name") } } } }; },
    replaceRange(from, to, text) {
      replacements.push({ from, to, text });
      return true;
    }
  };
  const app = {
    modules: {},
    registerModule(name, api) { this.modules[name] = api; }
  };
  const api = register(app, {
    sourceActions: { registerProvider(value) { provider = value; } },
    isActiveJavaFile: () => options.isJava !== false,
    accessorGenerator,
    getActiveCodeMirrorEditor: () => editor,
    getActiveEditorValue: () => source,
    dialog: { async open(received) { assert.equal(received, fields); return selected; } },
    alertUser(message) { alerts.push(message); },
    updateEditorLineNumbers() { refreshes.push("lines"); },
    updateEditorSelectionHighlights() { refreshes.push("selection"); },
    updateStatusLine() { refreshes.push("status"); }
  });
  return { alerts, api, getProvider: () => provider, replacements, refreshes };
}

test("Java Source submenu exposes Generate Getters and Setters for Java files", () => {
  assert.deepEqual(
    Array.from(createHarness().getProvider().getAvailableActions(), (action) => action.id),
    ["generate-getters-setters"]
  );
  assert.deepEqual(Array.from(createHarness({ isJava: false }).getProvider().getAvailableActions()), []);
});

test("Generate Getters and Setters forwards generation options in one local undoable insertion", async () => {
  const fields = [{
    fieldName: "name",
    typeName: "String",
    isStatic: false,
    generateGetter: true,
    generateSetter: true
  }];
  const harness = createHarness({ fields, selected: { fields, order: "getters-first", generateComments: true } });
  const result = await harness.api.generateGettersAndSetters();

  assert.equal(result.applied, true);
  assert.equal(harness.replacements.length, 1);
  assert.equal(harness.replacements[0].from, harness.replacements[0].to);
  assert.deepEqual(harness.refreshes, ["lines", "selection", "status"]);
  assert.deepEqual(harness.alerts, []);
});

test("Generate Getters and Setters stops when the chooser is cancelled", async () => {
  const harness = createHarness({ selected: null });
  const result = await harness.api.generateGettersAndSetters();

  assert.equal(result.reason, "cancelled");
  assert.equal(harness.replacements.length, 0);
});

test("Generate Getters and Setters reports when every accessor already exists", async () => {
  const harness = createHarness({ fields: [] });
  const result = await harness.api.generateGettersAndSetters();

  assert.equal(result.reason, "no-candidates");
  assert.match(harness.alerts[0], /no fields that need getters or setters/i);
});
