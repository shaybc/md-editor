const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function harness() {
  const sandbox = { console, structuredClone, crypto: { randomUUID: (() => { let value = 0; return () => `id-${++value}`; })() } };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const root = path.join(__dirname, "..", "resources", "js", "image-editor", "layers");
  for (const file of ["document-model.js", "text-outline-converter.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  return sandbox.MarkdownViewerImageEditor;
}

function glyphs() {
  const contour = { closed: true, anchors: [
    { point: { x: 0, y: 0 }, inHandle: null, outHandle: null, smooth: false },
    { point: { x: 8, y: 0 }, inHandle: null, outHandle: null, smooth: false },
    { point: { x: 4, y: 10 }, inHandle: null, outHandle: null, smooth: false }
  ] };
  const style = { fill: "#123456", stroke: "#abcdef", strokeWidth: 2 };
  return [
    { name: "A", x: 2, y: 3, width: 8, height: 10, contours: [contour], style },
    { name: "B", x: 14, y: 3, width: 8, height: 10, contours: [contour], style }
  ];
}

test("selected text is replaced in place by independently editable glyph paths", () => {
  const namespace = harness();
  const document = namespace.createImageDocument(200, 100, "transparent");
  const layer = namespace.createContentLayer("Heading");
  const neighbor = namespace.createContentObject("shape", {}, { name: "Neighbor" });
  const text = namespace.createContentObject("text", { text: "AB" }, {
    name: "Heading text", bounds: { x: 10, y: 20, width: 80, height: 30 },
    transform: { x: 10, y: 20, scaleX: 1.5, scaleY: 2, rotation: Math.PI / 6 }
  });
  layer.objects.push(neighbor, text);
  document.nodes.unshift(layer);
  document.activeLayerId = layer.id;
  const changes = [];
  const store = { document, selectedIds: new Set([layer.id]), notify: (change) => changes.push(change) };

  assert.equal(namespace.ImageEditorTextOutlineConverter.convertSelected(store, { createGlyphOutlines: glyphs }), true);
  assert.equal(layer.objects[0], neighbor);
  assert.deepEqual(Array.from(layer.objects.slice(1), (object) => object.name), ["A", "B"]);
  layer.objects.slice(1).forEach((object) => {
    assert.equal(object.type, "path");
    assert.equal(object.payload.outlinedFromText, true);
    assert.equal(object.payload.text, undefined);
    assert.equal(object.payload.style.fillColor, "#123456");
    assert.equal(object.payload.style.strokeColor, "#abcdef");
    assert.equal(object.transform.rotation, Math.PI / 6);
    assert.equal(object.transform.scaleX, 1.5);
    assert.equal(object.transform.scaleY, 2);
  });
  assert.equal(store.selectedIds.size, 2);
  assert.equal(document.activeLayerId, layer.id);
  assert.equal(changes[0].type, "create-text-outlines");
});

test("conversion preserves group order and ignores locked text", () => {
  const namespace = harness();
  const document = namespace.createImageDocument(200, 100, "transparent");
  const group = namespace.createLayerGroup("Group");
  const first = namespace.createContentLayer("First");
  const second = namespace.createContentLayer("Second");
  first.objects.push(namespace.createContentObject("text", { text: "A" }, { name: "A" }));
  second.objects.push(namespace.createContentObject("text", { text: "B" }, { name: "B", locked: true }));
  group.children.push(first, second);
  document.nodes.unshift(group);
  const store = { document, selectedIds: new Set([group.id]), notify() {} };

  assert.equal(namespace.ImageEditorTextOutlineConverter.convertSelected(store, { createGlyphOutlines: glyphs }), true);
  assert.deepEqual(Array.from(group.children, (layer) => layer.name), ["First", "Second"]);
  assert.equal(first.objects.every((object) => object.type === "path"), true);
  assert.equal(second.objects[0].type, "text");
});

test("Layers command uses one document transaction for Undo and Redo", () => {
  const resources = path.join(__dirname, "..", "resources");
  const panel = fs.readFileSync(path.join(resources, "js", "image-editor", "layers", "layer-panel.js"), "utf8");
  const controller = fs.readFileSync(path.join(resources, "js", "image-editor", "index.js"), "utf8");
  assert.match(panel, /Create Outline from Text/);
  assert.match(panel, /ImageEditorTextOutlineConverter\?\.canConvert/);
  assert.match(controller, /commitDocumentMutation\(controller, "Create text outlines"/);
});
