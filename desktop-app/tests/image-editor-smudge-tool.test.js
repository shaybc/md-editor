"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadSmudgeStroke() {
  const context = { globalThis: {}, Uint8ClampedArray, Math };
  context.globalThis = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../resources/js/image-editor/smudge-tool.js"), "utf8"),
    context
  );
  return context.MarkdownViewerImageEditor.ImageEditorSmudgeStroke;
}

function pixels(width, height, pixelAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    data.set(pixelAt(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

function pixel(image, x, y) {
  return [...image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];
}

test("smudge transports sampled pixels along a stroke without changing distant pixels", () => {
  const SmudgeStroke = loadSmudgeStroke();
  const target = pixels(24, 9, (x) => x < 9 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
  const stroke = new SmudgeStroke(target, target, { x: 7, y: 4 }, {
    size: 7, hardness: 1, strength: 1
  });

  stroke.update({ x: 16, y: 4 });

  assert.ok(pixel(target, 14, 4)[0] > 0, "red pixels should be carried into the blue side");
  assert.deepEqual(pixel(target, 23, 4), [0, 0, 255, 255]);
});

test("smudge hardness feathers the brush edge", () => {
  const SmudgeStroke = loadSmudgeStroke();
  const target = pixels(25, 13, (x) => x < 8 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
  const stroke = new SmudgeStroke(target, target, { x: 7, y: 6 }, {
    size: 9, hardness: 0, strength: 1
  });

  stroke.update({ x: 16, y: 6 });

  assert.ok(pixel(target, 14, 6)[0] > pixel(target, 14, 2)[0]);
});

test("finger painting starts a stroke with the foreground color", () => {
  const SmudgeStroke = loadSmudgeStroke();
  const target = pixels(17, 9, () => [0, 0, 255, 255]);
  const stroke = new SmudgeStroke(target, target, { x: 4, y: 4 }, {
    size: 7, hardness: 1, strength: 1, fingerColor: [0, 255, 0, 255]
  });

  stroke.update({ x: 11, y: 4 });

  assert.ok(pixel(target, 8, 4)[1] > 0);
});
