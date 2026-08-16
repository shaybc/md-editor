const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadInnerShadowModel() {
  let nextId = 0;
  const context = { window: {}, structuredClone, crypto: { randomUUID: () => "id-" + (++nextId) } };
  context.window.window = context.window;
  context.window.structuredClone = structuredClone;
  context.window.crypto = context.crypto;
  vm.createContext(context);
  ["document-model.js", "inner-shadow-effect.js"].forEach((name) => {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../resources/js/image-editor/layers/" + name), "utf8"), context);
  });
  return context.window.MarkdownViewerImageEditor;
}

test("inner shadow descriptors normalize persisted values", () => {
  const editor = loadInnerShadowModel();
  const effect = editor.ImageEditorInnerShadowEffect.normalize({
    color: "#aabbcc", opacity: 2, angle: -45, distance: -2, choke: 4, blur: 12, blendMode: "normal"
  });

  assert.equal(effect.type, "inner-shadow");
  assert.equal(effect.color, "#AABBCC");
  assert.equal(effect.opacity, 1);
  assert.equal(effect.angle, 315);
  assert.equal(effect.distance, 0);
  assert.equal(effect.choke, 1);
  assert.equal(effect.blur, 12);
  assert.equal(effect.blendMode, "normal");
});

test("adding and removing inner shadow preserves unrelated layer effects", () => {
  const editor = loadInnerShadowModel();
  const layer = editor.createContentLayer("Rectangle");
  layer.effects.push({ id: "drop", type: "drop-shadow", enabled: true });

  assert.equal(editor.ImageEditorInnerShadowEffect.upsert(layer, { color: "#123456", distance: 20 }), true);
  assert.equal(layer.effects.length, 2);
  assert.equal(editor.ImageEditorInnerShadowEffect.get(layer).color, "#123456");
  assert.equal(editor.ImageEditorInnerShadowEffect.remove(layer), true);
  assert.deepEqual(JSON.parse(JSON.stringify(layer.effects)), [{ id: "drop", type: "drop-shadow", enabled: true }]);
  assert.equal(editor.ImageEditorInnerShadowEffect.remove(layer), false);
});

test("persisted documents normalize one inner shadow per layer", () => {
  const editor = loadInnerShadowModel();
  const document = editor.createImageDocument(100, 80, "transparent");
  const layer = editor.createContentLayer("Text");
  layer.effects = [
    { id: "first", type: "inner-shadow", color: "invalid", opacity: -1 },
    { id: "second", type: "inner-shadow", color: "#ABCDEF", opacity: 0.8 }
  ];
  document.nodes.unshift(layer);

  editor.ImageEditorInnerShadowEffect.normalizeDocument(document);

  assert.equal(layer.effects.length, 1);
  assert.equal(layer.effects[0].id, "first");
  assert.equal(layer.effects[0].color, "#000000");
  assert.equal(layer.effects[0].opacity, 0);
});
