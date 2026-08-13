const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class TestImageData {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

function loadLayers() {
  let nextId = 0;
  const context = { window: {}, ImageData: TestImageData, Uint8ClampedArray, Map, Set, structuredClone, crypto: { randomUUID: () => `id-${++nextId}` } };
  context.window.window = context.window;
  context.window.ImageData = TestImageData;
  context.window.structuredClone = structuredClone;
  context.window.crypto = context.crypto;
  vm.createContext(context);
  ["document-model.js", "document-store.js", "document-history.js", "object-selection.js"].forEach((name) => {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, `../resources/js/image-editor/layers/${name}`), "utf8"), context);
  });
  return context.window.MarkdownViewerImageEditor;
}

function pixels(width = 2, height = 2, value = 255) {
  return new TestImageData(new Uint8ClampedArray(width * height * 4).fill(value), width, height);
}

test("layer store keeps valid hierarchy and shares content-addressed raster assets", () => {
  const layers = loadLayers();
  const store = new layers.ImageEditorDocumentStore(layers.createImageDocument(100, 80));
  const first = store.addRasterObject(pixels(), { x: 4, y: 5, width: 2, height: 2 }, { name: "Image" });
  const second = store.addRasterObject(pixels(), { x: 9, y: 5, width: 2, height: 2 }, { name: "Image" });

  assert.equal(store.assets.size, 1);
  assert.equal(first.payload.assetId, second.payload.assetId);
  assert.equal(layers.validateImageDocument(store.document), true);
});

test("groups preserve sibling order through group and ungroup transactions", () => {
  const layers = loadLayers();
  const store = new layers.ImageEditorDocumentStore(layers.createImageDocument(100, 80));
  const first = store.document.nodes[0];
  const second = store.addLayer("Second");
  store.select([second.id, first.id]);
  assert.equal(store.groupSelected(), true);
  const group = store.document.nodes[0];
  assert.equal(group.kind, "group");
  assert.deepEqual(JSON.parse(JSON.stringify(group.children.map((node) => node.name))), ["Second"]);
  assert.deepEqual(JSON.parse(JSON.stringify(store.document.nodes.map((node) => node.name))), ["Group", "Background"]);
  assert.equal(store.ungroupSelected(), true);
  assert.deepEqual(JSON.parse(JSON.stringify(store.document.nodes.map((node) => node.name))), ["Second", "Background"]);
});

test("canvas background remains the permanent bottom layer", () => {
  const layers = loadLayers();
  const store = new layers.ImageEditorDocumentStore(layers.createImageDocument(100, 80));
  const background = store.activeLayer();
  const foreground = store.addLayer("Foreground");

  store.select(background.id);
  assert.equal(store.deleteSelected(), false);
  assert.equal(store.duplicateSelected(), false);
  assert.equal(store.updateItem(background.id, { visible: false }), false);
  assert.equal(store.updateItem(background.id, { opacity: 0.5 }), false);
  assert.equal(background.visible, true);
  assert.equal(background.opacity, 1);
  assert.equal(store.moveItems([background.id], foreground.id, "before"), false);
  assert.equal(store.moveItems([foreground.id], background.id, "after"), false);
  assert.deepEqual(JSON.parse(JSON.stringify(store.document.nodes.map((node) => node.name))), ["Foreground", "Background"]);
});

test("legacy background nodes migrate to the root bottom position", () => {
  const layers = loadLayers();
  const document = layers.createImageDocument(100, 80, "transparent");
  const background = document.nodes.pop();
  delete background.extensions.canvasBackground;
  const group = layers.createLayerGroup("Group");
  group.children.push(background);
  document.nodes.push(group);

  const store = new layers.ImageEditorDocumentStore(document);
  assert.equal(store.document.nodes.at(-1).name, "Background");
  assert.equal(store.document.nodes.at(-1).extensions.canvasBackground, true);
  assert.equal(store.document.nodes.at(-1).kind, "layer");
});

test("drag placement moves layers into and out of groups while preserving multiple-row order", () => {
  const layers = loadLayers();
  const store = new layers.ImageEditorDocumentStore(layers.createImageDocument(100, 80));
  const group = store.addGroup("Group", null);
  const first = store.addLayer("First", null);
  const second = store.addLayer("Second", null);

  assert.equal(store.moveItems([second.id, first.id], group.id, "inside"), true);
  assert.deepEqual(JSON.parse(JSON.stringify(group.children.map((node) => node.name))), ["Second", "First"]);
  assert.equal(store.moveItems([second.id, first.id], group.id, "after"), true);
  assert.deepEqual(JSON.parse(JSON.stringify(store.document.nodes.map((node) => node.name))), ["Group", "Second", "First", "Background"]);
  assert.equal(layers.validateImageDocument(store.document), true);
});

test("drag placement moves multiple objects between layers in panel order", () => {
  const layers = loadLayers();
  const store = new layers.ImageEditorDocumentStore(layers.createImageDocument(100, 80));
  const source = store.activeLayer();
  const first = store.addRasterObject(pixels(), { x: 0, y: 0, width: 2, height: 2 }, { name: "First", layerId: source.id });
  const second = store.addRasterObject(pixels(), { x: 2, y: 0, width: 2, height: 2 }, { name: "Second", layerId: source.id });
  const target = store.addLayer("Target", source.id);

  assert.equal(store.moveItems([first.id, second.id], target.id, "inside"), true);
  assert.deepEqual(JSON.parse(JSON.stringify(target.objects.map((object) => object.name))), ["Second", "First"]);
  assert.equal(source.objects.length, 0);
  assert.equal(layers.validateImageDocument(store.document), true);
});

test("object selection ignores hidden and locked content and supports off-canvas objects", () => {
  const layers = loadLayers();
  const store = new layers.ImageEditorDocumentStore(layers.createImageDocument(20, 20));
  const layer = store.activeLayer();
  const visible = store.addRasterObject(pixels(8, 8), { x: -4, y: -4, width: 8, height: 8 }, { layerId: layer.id });
  const selection = new layers.ImageEditorObjectSelection(store);
  assert.equal(selection.hitTest({ x: 1, y: 1 }), visible.id);
  visible.locked = true;
  assert.equal(selection.hitTest({ x: 1, y: 1 }), null);
  visible.locked = false;
  layer.visible = false;
  assert.equal(selection.hitTest({ x: 1, y: 1 }), null);
});

test("document history restores selection and obeys its transaction limit", () => {
  const layers = loadLayers();
  const store = new layers.ImageEditorDocumentStore(layers.createImageDocument(20, 20));
  const history = new layers.ImageEditorDocumentHistory({ maxEntries: 2 });
  for (let index = 0; index < 3; index += 1) {
    const before = store.snapshot();
    store.addLayer(`Layer ${index}`);
    history.push(before, store.snapshot(), "Add layer");
  }
  assert.equal(history.undoStack.length, 2);
  const restored = history.undo();
  store.restore(restored);
  assert.deepEqual(JSON.parse(JSON.stringify([...store.selectedIds])), JSON.parse(JSON.stringify(restored.selectedIds)));
});

test("validated commands publish changes and roll back invalid hierarchy mutations", () => {
  const layers = loadLayers();
  const store = new layers.ImageEditorDocumentStore(layers.createImageDocument(20, 20));
  const command = new layers.ImageEditorDocumentCommand("Rename", (document) => {
    document.nodes[0].name = "Renamed";
  }, () => {});
  assert.equal(store.applyCommand(command), true);
  assert.equal(store.document.nodes[0].name, "Renamed");

  const invalid = new layers.ImageEditorDocumentCommand("Create cycle", (document) => {
    const group = layers.createLayerGroup("Loop");
    group.children.push(group);
    document.nodes.unshift(group);
  }, () => {});
  assert.throws(() => store.applyCommand(invalid), /cycle/);
  assert.equal(store.document.nodes[0].name, "Renamed");
});
