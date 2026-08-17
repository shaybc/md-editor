const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadBrushPresets() {
  const context = { window: {} };
  context.window.window = context.window;
  vm.createContext(context);
  ["color-opacity.js", "drawing-tools.js", "brush-presets.js", "brush-stroke-effects.js", "bubble-brush.js"].forEach((file) => vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, `../resources/js/image-editor/${file}`), "utf8"), context
  ));
  return context.window.MarkdownViewerImageEditor;
}

function fakeContext() {
  const calls = [];
  return {
    calls,
    save() {}, restore() {}, setLineDash() {}, beginPath() { calls.push("begin"); },
    moveTo() {}, lineTo() {}, stroke() { calls.push("stroke"); }, arc() { calls.push("arc"); }, fill() { calls.push("fill"); },
    getImageData() { calls.push("sample"); return { data: new Uint8ClampedArray([200, 40, 20, 255]) }; }
  };
}

test("brush library exposes named visual presets and normalizes unknown selections", () => {
  const brush = loadBrushPresets();
  assert.deepEqual(Array.from(brush.ImageEditorBrushPresets, (preset) => preset.id), [
    "round", "flat", "marker", "ink", "calligraphy", "airbrush", "bubble", "charcoal", "watercolor", "spray",
    "wet-paint", "oil-paint", "paint-splatter", "graphite-pencil", "wax-crayon", "chalk", "pastel", "pattern"
  ]);
  assert.equal(brush.normalizeBrushPreset("watercolor"), "watercolor");
  assert.equal(brush.normalizeBrushPreset("unknown"), "round");
});

test("textured presets use their dedicated raster rendering", () => {
  const brush = loadBrushPresets();
  const context = fakeContext();
  const distance = brush.drawBrushPresetSegment(context, { x: 0, y: 0 }, { x: 12, y: 0 }, {
    brushSize: 8, brushType: "spray", foregroundColor: "#000000", backgroundColor: "#ffffff", strokeType: "solid"
  });
  assert.equal(distance, 12);
  assert.ok(context.calls.includes("arc"));
  assert.ok(context.calls.includes("fill"));
});

test("bubble brush scatters transparent outlined bubbles without filling their centers", () => {
  const brush = loadBrushPresets();
  const context = fakeContext();
  brush.drawBrushPresetSegment(context, { x: 0, y: 0 }, { x: 24, y: 0 }, {
    brushSize: 12, brushType: "bubble", foregroundColor: "#ffffff", backgroundColor: "#000000", strokeType: "solid"
  });
  assert.ok(context.calls.includes("arc"));
  assert.ok(context.calls.filter((call) => call === "stroke").length >= 3);
  assert.equal(context.calls.includes("fill"), false);
});

test("wet paint samples existing pixels and pattern brush stamps a repeated motif", () => {
  const brush = loadBrushPresets();
  const wetContext = fakeContext();
  brush.drawBrushPresetSegment(wetContext, { x: 0, y: 0 }, { x: 20, y: 0 }, {
    brushSize: 12, brushType: "wet-paint", foregroundColor: "#0044ff", backgroundColor: "#ffffff", strokeType: "solid"
  });
  assert.ok(wetContext.calls.includes("sample"));
  assert.ok(wetContext.calls.includes("stroke"));

  const patternContext = fakeContext();
  brush.drawBrushPresetSegment(patternContext, { x: 0, y: 0 }, { x: 30, y: 0 }, {
    brushSize: 10, brushType: "pattern", foregroundColor: "#000000", backgroundColor: "#ffffff", strokeType: "solid"
  });
  assert.ok(patternContext.calls.filter((call) => call === "arc").length >= 4);
});

test("every brush preset renders a segment and preserves path distance", () => {
  const brush = loadBrushPresets();
  brush.ImageEditorBrushPresets.forEach((preset) => {
    const context = fakeContext();
    const distance = brush.drawBrushPresetSegment(context, { x: 2, y: 3 }, { x: 12, y: 3 }, {
      brushSize: 8, brushType: preset.id, foregroundColor: "#000000", backgroundColor: "#ffffff", strokeType: "solid"
    });
    assert.equal(distance, 10, preset.id);
    assert.ok(context.calls.includes("stroke") || context.calls.includes("fill"), preset.id);
  });
});
