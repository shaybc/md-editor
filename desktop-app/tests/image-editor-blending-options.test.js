const assert = require("node:assert/strict");
const test = require("node:test");

globalThis.MarkdownViewerImageEditor = {};
require("../resources/js/image-editor/layers/blending-options.js");
require("../resources/js/image-editor/layers/layer-blend-renderer.js");

const options = globalThis.MarkdownViewerImageEditor.ImageEditorBlendingOptions;
const renderer = globalThis.MarkdownViewerImageEditor.ImageEditorLayerBlendRenderer;

test("blending options expose the Photoshop layer-mode groups", () => {
  assert.deepEqual(options.MODE_GROUPS.map((group) => group.label), ["Normal", "Darken", "Lighten", "Contrast", "Comparative", "Color"]);
  assert.equal(options.SUPPORTED_MODES.has("multiply"), true);
  assert.equal(options.SUPPORTED_MODES.has("linear-light"), true);
});

test("legacy and invalid layer blending values normalize safely", () => {
  assert.deepEqual(options.normalize({}), { blendMode: "normal", opacity: 1, fillOpacity: 1 });
  assert.deepEqual(options.normalize({ blendMode: "unknown", opacity: 2, fillOpacity: -1 }), { blendMode: "normal", opacity: 1, fillOpacity: 0 });
});

test("apply updates layer blending settings and reports changes", () => {
  const layer = { kind: "layer", blendMode: "normal", opacity: 1 };
  assert.equal(options.apply(layer, { blendMode: "multiply", opacity: 0.75, fillOpacity: 0.5 }), true);
  assert.deepEqual({ blendMode: layer.blendMode, opacity: layer.opacity, fillOpacity: layer.fillOpacity }, { blendMode: "multiply", opacity: 0.75, fillOpacity: 0.5 });
  assert.equal(options.apply(layer, layer), false);
});

test("custom blend formulas cover add, burn, and whole-color comparisons", () => {
  assert.deepEqual(renderer.blendRgb("linear-dodge", [0.7, 0.1, 0.2], [0.5, 0.2, 0.9]), [1, 0.30000000000000004, 1]);
  assert.deepEqual(renderer.blendRgb("linear-burn", [0.7, 0.1, 0.2], [0.5, 0.2, 0.9]), [0.19999999999999996, 0, 0.10000000000000009]);
  assert.deepEqual(renderer.blendRgb("darker-color", [0.8, 0.8, 0.8], [0.2, 0.3, 0.4]), [0.2, 0.3, 0.4]);
});
