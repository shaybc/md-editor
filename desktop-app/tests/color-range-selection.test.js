const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadImageEditorModules(...files) {
  const context = vm.createContext({ Uint8ClampedArray });
  context.window = context;
  files.forEach((file) => {
    const source = fs.readFileSync(path.join(__dirname, "..", "resources", "js", "image-editor", file), "utf8");
    vm.runInContext(source, context, { filename: file });
  });
  return context.MarkdownViewerImageEditor;
}

function imageData(width, pixels) {
  return { width, height: pixels.length / width, data: new Uint8ClampedArray(pixels.flat()) };
}

test("Color Range creates a tightly bounded exact-color mask at zero fuzziness", () => {
  const editor = loadImageEditorModules("color-range-selection.js");
  const source = imageData(3, [
    [255, 0, 0, 255], [0, 0, 255, 255], [255, 0, 0, 255],
    [0, 0, 0, 0], [0, 255, 0, 255], [0, 0, 255, 255]
  ]);
  const mask = editor.ImageEditorColorRangeSelection.buildMask(source, [
    { color: [255, 0, 0], operation: "replace" }
  ], { fuzziness: 0 });

  assert.deepEqual({ x: mask.x, y: mask.y, width: mask.width, height: mask.height }, { x: 0, y: 0, width: 3, height: 1 });
  assert.deepEqual(Array.from(mask.data), [255, 0, 255]);
});

test("Color Range fuzziness produces soft membership and excludes distant colors", () => {
  const editor = loadImageEditorModules("color-range-selection.js");
  const source = imageData(3, [
    [100, 100, 100, 255], [140, 100, 100, 255], [255, 255, 255, 255]
  ]);
  const mask = editor.ImageEditorColorRangeSelection.buildMask(source, [
    { color: [100, 100, 100], operation: "replace" }
  ], { fuzziness: 40 });

  assert.equal(mask.data[0], 255);
  assert.ok(mask.data[1] > 0 && mask.data[1] < 255);
  assert.equal(mask.width, 2);
});

test("Color Range add and subtract samples combine into one mask", () => {
  const editor = loadImageEditorModules("color-range-selection.js");
  const source = imageData(3, [
    [255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]
  ]);
  const mask = editor.ImageEditorColorRangeSelection.buildMask(source, [
    { color: [255, 0, 0], operation: "replace" },
    { color: [0, 255, 0], operation: "add" },
    { color: [255, 0, 0], operation: "subtract" }
  ], { fuzziness: 0 });

  assert.deepEqual({ x: mask.x, width: mask.width }, { x: 1, width: 1 });
  assert.deepEqual(Array.from(mask.data), [255]);
});

test("selection shapes preserve soft Color Range strength and inversion", () => {
  const editor = loadImageEditorModules("color-range-selection.js", "selection-shapes.js");
  const region = {
    x: 10,
    y: 20,
    width: 2,
    height: 1,
    shape: "color-range",
    maskWidth: 2,
    maskHeight: 1,
    mask: new Uint8ClampedArray([64, 255]),
    rotation: 0,
    inverted: false
  };

  assert.equal(editor.ImageEditorSelectionShapes.strength(region, { x: 10.5, y: 20.5 }), 64 / 255);
  assert.equal(editor.ImageEditorSelectionShapes.strength(region, { x: 11.5, y: 20.5 }), 1);
  assert.equal(editor.ImageEditorSelectionShapes.strength({ ...region, inverted: true }, { x: 10.5, y: 20.5 }), 1 - 64 / 255);
  assert.equal(editor.ImageEditorSelectionShapes.strength({ ...region, inverted: true }, { x: 5, y: 5 }), 1);
});
