const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadBevelEmbossModel() {
  let nextId = 0;
  const context = { window: {}, structuredClone, crypto: { randomUUID: () => "id-" + (++nextId) } };
  context.window.window = context.window;
  context.window.structuredClone = structuredClone;
  context.window.crypto = context.crypto;
  vm.createContext(context);
  ["document-model.js", "bevel-emboss-effect.js"].forEach((name) => {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../resources/js/image-editor/layers/" + name), "utf8"), context);
  });
  return context.window.MarkdownViewerImageEditor;
}

test("Bevel & Emboss descriptors normalize Photoshop-like controls", () => {
  const editor = loadBevelEmbossModel();
  const effect = editor.ImageEditorBevelEmbossEffect.normalize({
    style: "pillow-emboss", technique: "chisel-hard", depth: 2000, direction: "down",
    size: -1, soften: 90, angle: -30, altitude: 120, highlightColor: "#aabbcc",
    highlightOpacity: 2, shadowColor: "invalid", shadowOpacity: -1, glossContour: "ring"
  });

  assert.equal(effect.type, "bevel-emboss");
  assert.equal(effect.style, "pillow-emboss");
  assert.equal(effect.technique, "chisel-hard");
  assert.equal(effect.depth, 1000);
  assert.equal(effect.direction, "down");
  assert.equal(effect.size, 0);
  assert.equal(effect.soften, 50);
  assert.equal(effect.angle, 330);
  assert.equal(effect.altitude, 90);
  assert.equal(effect.highlightColor, "#AABBCC");
  assert.equal(effect.highlightOpacity, 1);
  assert.equal(effect.shadowColor, "#000000");
  assert.equal(effect.shadowOpacity, 0);
  assert.equal(effect.glossContour, "ring");
});

test("adding and removing Bevel & Emboss preserves unrelated effects", () => {
  const editor = loadBevelEmbossModel();
  const layer = editor.createContentLayer("Rectangle");
  layer.effects.push({ id: "shadow", type: "drop-shadow", enabled: true });

  assert.equal(editor.ImageEditorBevelEmbossEffect.upsert(layer, { depth: 180 }), true);
  assert.equal(layer.effects.length, 2);
  assert.equal(editor.ImageEditorBevelEmbossEffect.get(layer).depth, 180);
  assert.equal(editor.ImageEditorBevelEmbossEffect.remove(layer), true);
  assert.deepEqual(JSON.parse(JSON.stringify(layer.effects)), [{ id: "shadow", type: "drop-shadow", enabled: true }]);
  assert.equal(editor.ImageEditorBevelEmbossEffect.remove(layer), false);
});

test("persisted documents normalize one Bevel & Emboss effect per layer", () => {
  const editor = loadBevelEmbossModel();
  const document = editor.createImageDocument(100, 80, "transparent");
  const layer = editor.createContentLayer("Text");
  layer.effects = [
    { id: "first", type: "bevel-emboss", style: "invalid", depth: 0 },
    { id: "second", type: "bevel-emboss", style: "outer-bevel", depth: 500 }
  ];
  document.nodes.unshift(layer);

  editor.ImageEditorBevelEmbossEffect.normalizeDocument(document);

  assert.equal(layer.effects.length, 1);
  assert.equal(layer.effects[0].id, "first");
  assert.equal(layer.effects[0].style, "inner-bevel");
  assert.equal(layer.effects[0].depth, 1);
});
