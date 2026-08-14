"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class TestImageData {
  constructor(dataOrWidth, widthOrHeight, height) {
    if (dataOrWidth instanceof Uint8ClampedArray) {
      this.data = dataOrWidth;
      this.width = widthOrHeight;
      this.height = height;
    } else {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    }
  }
}

function loadBlurStroke() {
  const context = { globalThis: {}, Uint8ClampedArray, ImageData: TestImageData, Math };
  context.globalThis = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../resources/js/image-editor/blur-tool.js"), "utf8"),
    context
  );
  return context.MarkdownViewerImageEditor.ImageEditorBlurStroke;
}

function pixels(width, height, pixelAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    data.set(pixelAt(x, y), (y * width + x) * 4);
  }
  return new TestImageData(data, width, height);
}

function pixel(image, x, y) {
  return [...image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];
}

test("blur softens a sharp boundary without changing distant pixels", () => {
  const BlurStroke = loadBlurStroke();
  const target = pixels(25, 15, (x) => x < 12 ? [0, 0, 0, 255] : [255, 255, 255, 255]);

  new BlurStroke(target, { x: 12, y: 7 }, { size: 12, hardness: 1, strength: 1 });

  assert.ok(pixel(target, 11, 7)[0] > 0);
  assert.ok(pixel(target, 12, 7)[0] < 255);
  assert.deepEqual(pixel(target, 0, 0), [0, 0, 0, 255]);
});

test("blur strength controls how much the sampled colors are mixed", () => {
  const BlurStroke = loadBlurStroke();
  const weak = pixels(25, 15, (x) => x < 12 ? [0, 0, 0, 255] : [255, 255, 255, 255]);
  const strong = pixels(25, 15, (x) => x < 12 ? [0, 0, 0, 255] : [255, 255, 255, 255]);

  new BlurStroke(weak, { x: 12, y: 7 }, { size: 12, hardness: 1, strength: 0.25 });
  new BlurStroke(strong, { x: 12, y: 7 }, { size: 12, hardness: 1, strength: 1 });

  assert.ok(pixel(strong, 11, 7)[0] > pixel(weak, 11, 7)[0]);
});

test("blur uses premultiplied color so transparent pixels do not create dark fringes", () => {
  const BlurStroke = loadBlurStroke();
  const target = pixels(25, 15, (x) => x < 12 ? [255, 0, 0, 255] : [0, 0, 0, 0]);

  new BlurStroke(target, { x: 12, y: 7 }, { size: 12, hardness: 1, strength: 1 });

  const edge = pixel(target, 12, 7);
  assert.equal(edge[0], 255);
  assert.equal(edge[1], 0);
  assert.equal(edge[2], 0);
  assert.ok(edge[3] > 0 && edge[3] < 255);
});

