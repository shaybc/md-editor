const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadInnerGlowModel() {
  let nextId = 0;
  const context = { window: {}, structuredClone, crypto: { randomUUID: () => "id-" + (++nextId) } };
  context.window.window = context.window;
  context.window.structuredClone = structuredClone;
  context.window.crypto = context.crypto;
  vm.createContext(context);
  ["document-model.js", "inner-glow-effect.js"].forEach((name) => {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../resources/js/image-editor/layers/" + name), "utf8"), context);
  });
  return context.window.MarkdownViewerImageEditor;
}

test("inner glow descriptors normalize persisted values", () => {
  const editor = loadInnerGlowModel();
  const effect = editor.ImageEditorInnerGlowEffect.normalize({
    color: "#aabbcc", opacity: 2, choke: 4, blur: -2, blendMode: "multiply"
  });

  assert.equal(effect.type, "inner-glow");
  assert.equal(effect.color, "#AABBCC");
  assert.equal(effect.opacity, 1);
  assert.equal(effect.choke, 1);
  assert.equal(effect.blur, 0);
  assert.equal(effect.blendMode, "multiply");
});

test("adding and removing inner glow preserves unrelated layer effects", () => {
  const editor = loadInnerGlowModel();
  const layer = editor.createContentLayer("Rectangle");
  layer.effects.push({ id: "shadow", type: "inner-shadow", enabled: true });

  assert.equal(editor.ImageEditorInnerGlowEffect.upsert(layer, { color: "#123456", blur: 20 }), true);
  assert.equal(layer.effects.length, 2);
  assert.equal(editor.ImageEditorInnerGlowEffect.get(layer).color, "#123456");
  assert.equal(editor.ImageEditorInnerGlowEffect.remove(layer), true);
  assert.deepEqual(JSON.parse(JSON.stringify(layer.effects)), [{ id: "shadow", type: "inner-shadow", enabled: true }]);
  assert.equal(editor.ImageEditorInnerGlowEffect.remove(layer), false);
});

test("persisted documents normalize one inner glow per layer", () => {
  const editor = loadInnerGlowModel();
  const document = editor.createImageDocument(100, 80, "transparent");
  const layer = editor.createContentLayer("Text");
  layer.effects = [
    { id: "first", type: "inner-glow", color: "invalid", opacity: -1 },
    { id: "second", type: "inner-glow", color: "#ABCDEF", opacity: 0.8 }
  ];
  document.nodes.unshift(layer);

  editor.ImageEditorInnerGlowEffect.normalizeDocument(document);

  assert.equal(layer.effects.length, 1);
  assert.equal(layer.effects[0].id, "first");
  assert.equal(layer.effects[0].color, "#FFF5B1");
  assert.equal(layer.effects[0].opacity, 0);
});
