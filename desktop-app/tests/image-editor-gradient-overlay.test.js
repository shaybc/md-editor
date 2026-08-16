const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadGradientOverlayModel() {
  let nextId = 0;
  const context = { window: {}, structuredClone, crypto: { randomUUID: () => "id-" + (++nextId) } };
  context.window.window = context.window;
  context.window.structuredClone = structuredClone;
  context.window.crypto = context.crypto;
  vm.createContext(context);
  ["document-model.js", "gradient-overlay-effect.js", "gradient-overlay-renderer.js"].forEach((name) => {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../resources/js/image-editor/layers/" + name), "utf8"), context);
  });
  return context.window.MarkdownViewerImageEditor;
}

test("gradient overlay descriptors normalize persisted values", () => {
  const editor = loadGradientOverlayModel();
  const effect = editor.ImageEditorGradientOverlayEffect.normalize({
    startColor: "#aabbcc",
    endColor: "invalid",
    opacity: 2,
    style: "diamond",
    angle: 400,
    scale: 2,
    offsetX: 9000,
    offsetY: -9000,
    reverse: true,
    alignWithLayer: false,
    blendMode: "screen"
  });

  assert.equal(effect.type, "gradient-overlay");
  assert.equal(effect.startColor, "#AABBCC");
  assert.equal(effect.endColor, "#FFFFFF");
  assert.equal(effect.opacity, 1);
  assert.equal(effect.style, "diamond");
  assert.equal(effect.angle, 359);
  assert.equal(effect.scale, 10);
  assert.equal(effect.offsetX, 4096);
  assert.equal(effect.offsetY, -4096);
  assert.equal(effect.reverse, true);
  assert.equal(effect.alignWithLayer, false);
  assert.equal(effect.blendMode, "screen");
});

test("adding and removing gradient overlay preserves unrelated layer effects", () => {
  const editor = loadGradientOverlayModel();
  const layer = editor.createContentLayer("Rectangle");
  layer.effects.push({ id: "shadow", type: "drop-shadow", enabled: true });

  assert.equal(editor.ImageEditorGradientOverlayEffect.upsert(layer, { style: "radial", scale: 140 }), true);
  assert.equal(layer.effects.length, 2);
  assert.equal(editor.ImageEditorGradientOverlayEffect.get(layer).style, "radial");
  assert.equal(editor.ImageEditorGradientOverlayEffect.remove(layer), true);
  assert.deepEqual(JSON.parse(JSON.stringify(layer.effects)), [{ id: "shadow", type: "drop-shadow", enabled: true }]);
  assert.equal(editor.ImageEditorGradientOverlayEffect.remove(layer), false);
});

test("persisted documents normalize one gradient overlay per layer", () => {
  const editor = loadGradientOverlayModel();
  const document = editor.createImageDocument(100, 80, "transparent");
  const layer = editor.createContentLayer("Text");
  layer.effects = [
    { id: "first", type: "gradient-overlay", style: "invalid", opacity: -1 },
    { id: "second", type: "gradient-overlay", style: "radial", opacity: 0.8 }
  ];
  document.nodes.unshift(layer);

  editor.ImageEditorGradientOverlayEffect.normalizeDocument(document);

  assert.equal(layer.effects.length, 1);
  assert.equal(layer.effects[0].id, "first");
  assert.equal(layer.effects[0].style, "linear");
  assert.equal(layer.effects[0].opacity, 0);
});

test("gradient geometry supports linear, radial, and reverse positioning", () => {
  const editor = loadGradientOverlayModel();
  const renderer = editor.ImageEditorGradientOverlayRenderer;
  const bounds = { x: 0, y: 0, width: 100, height: 100 };
  const linear = { style: "linear", angle: 0, scale: 100, offsetX: 0, offsetY: 0, alignWithLayer: true };
  const radial = { ...linear, style: "radial" };

  assert.ok(renderer.gradientPosition(10, 50, bounds, linear) < renderer.gradientPosition(90, 50, bounds, linear));
  assert.equal(renderer.gradientPosition(50, 50, bounds, radial), 0);
  assert.equal(renderer.gradientPosition(100, 50, bounds, radial), 1);
  assert.equal(renderer.gradientPosition(10, 50, bounds, { ...linear, reverse: true }), 1 - renderer.gradientPosition(10, 50, bounds, linear));
});
