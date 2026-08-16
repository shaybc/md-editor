const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadPatternOverlayModel() {
  let nextId = 0;
  const context = { window: {}, structuredClone, crypto: { randomUUID: () => "id-" + (++nextId) } };
  context.window.window = context.window;
  context.window.structuredClone = structuredClone;
  context.window.crypto = context.crypto;
  vm.createContext(context);
  ["document-model.js", "pattern-overlay-effect.js"].forEach((name) => {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../resources/js/image-editor/layers/" + name), "utf8"), context);
  });
  return context.window.MarkdownViewerImageEditor;
}

test("pattern overlay descriptors normalize persisted values", () => {
  const editor = loadPatternOverlayModel();
  const effect = editor.ImageEditorPatternOverlayEffect.normalize({
    foregroundColor: "#aabbcc",
    backgroundColor: "invalid",
    opacity: 2,
    scale: 2,
    angle: 400,
    density: -1,
    offsetX: 9000,
    blendMode: "multiply",
    patternType: "mosaic"
  });

  assert.equal(effect.type, "pattern-overlay");
  assert.equal(effect.foregroundColor, "#AABBCC");
  assert.equal(effect.backgroundColor, "#FFFFFF");
  assert.equal(effect.opacity, 1);
  assert.equal(effect.scale, 10);
  assert.equal(effect.angle, 359);
  assert.equal(effect.density, 10);
  assert.equal(effect.offsetX, 4096);
  assert.equal(effect.blendMode, "multiply");
  assert.equal(effect.patternType, "mosaic");
});

test("adding and removing pattern overlay preserves unrelated layer effects", () => {
  const editor = loadPatternOverlayModel();
  const layer = editor.createContentLayer("Rectangle");
  layer.effects.push({ id: "shadow", type: "drop-shadow", enabled: true });

  assert.equal(editor.ImageEditorPatternOverlayEffect.upsert(layer, { patternType: "grain", scale: 140 }), true);
  assert.equal(layer.effects.length, 2);
  assert.equal(editor.ImageEditorPatternOverlayEffect.get(layer).patternType, "grain");
  assert.equal(editor.ImageEditorPatternOverlayEffect.remove(layer), true);
  assert.deepEqual(JSON.parse(JSON.stringify(layer.effects)), [{ id: "shadow", type: "drop-shadow", enabled: true }]);
  assert.equal(editor.ImageEditorPatternOverlayEffect.remove(layer), false);
});

test("persisted documents normalize one pattern overlay per layer", () => {
  const editor = loadPatternOverlayModel();
  const document = editor.createImageDocument(100, 80, "transparent");
  const layer = editor.createContentLayer("Text");
  layer.effects = [
    { id: "first", type: "pattern-overlay", patternType: "invalid", opacity: -1 },
    { id: "second", type: "pattern-overlay", patternType: "halftone", opacity: 0.8 }
  ];
  document.nodes.unshift(layer);

  editor.ImageEditorPatternOverlayEffect.normalizeDocument(document);

  assert.equal(layer.effects.length, 1);
  assert.equal(layer.effects[0].id, "first");
  assert.equal(layer.effects[0].patternType, "crosshatch");
  assert.equal(layer.effects[0].opacity, 0);
});
