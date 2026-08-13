const assert = require("node:assert/strict");
const test = require("node:test");

const {
  IMAGE_PRESETS,
  parseCanvasDimension,
  readClipboardImageDimensions,
  resolveNewImageBackground
} = require("../resources/js/image-editor/new-image-dialog.js");

test("new image presets contain both requested sets without duplicate dimensions", () => {
  assert.equal(IMAGE_PRESETS.length, 9);
  const dimensions = IMAGE_PRESETS.map((preset) => `${preset.width}x${preset.height}`);
  assert.equal(new Set(dimensions).size, dimensions.length);
  assert.deepEqual(dimensions, [
    "640x480", "800x600", "1024x768", "1280x720", "1920x1080",
    "1080x1080", "1080x1920", "1200x630", "512x512"
  ]);
});

test("new image dimensions accept only whole pixels at or above the editor minimum", () => {
  assert.equal(parseCanvasDimension("16"), 16);
  assert.equal(parseCanvasDimension(1920), 1920);
  assert.equal(parseCanvasDimension("15"), null);
  assert.equal(parseCanvasDimension("10.5"), null);
  assert.equal(parseCanvasDimension("not-a-number"), null);
});

test("new image background choices resolve to persisted document descriptors", () => {
  assert.deepEqual(resolveNewImageBackground("transparent"), { mode: "transparent" });
  assert.deepEqual(resolveNewImageBackground("white"), { mode: "solid", color: "#ffffff" });
  assert.deepEqual(resolveNewImageBackground("black"), { mode: "solid", color: "#000000" });
  assert.deepEqual(resolveNewImageBackground("current", "#ffffff", "#123456"), { mode: "solid", color: "#123456" });
  assert.deepEqual(resolveNewImageBackground("custom", "#abcdef", "#ffffff"), { mode: "solid", color: "#abcdef" });
});

test("clipboard inspection returns image dimensions without decoding pixels into the document", async () => {
  let closed = false;
  const navigatorRef = {
    clipboard: {
      async read() {
        return [{ types: ["text/plain", "image/png"], async getType() { return { type: "image/png" }; } }];
      }
    }
  };
  const dimensions = await readClipboardImageDimensions(navigatorRef, async () => ({
    width: 321,
    height: 123,
    close() { closed = true; }
  }));
  assert.deepEqual(dimensions, { width: 321, height: 123 });
  assert.equal(closed, true);
});

test("clipboard inspection remains optional when permission is denied or no image exists", async () => {
  assert.equal(await readClipboardImageDimensions({ clipboard: { async read() { throw new Error("denied"); } } }, async () => ({})), null);
  assert.equal(await readClipboardImageDimensions({ clipboard: { async read() { return [{ types: ["text/plain"] }]; } } }, async () => ({})), null);
  assert.equal(await readClipboardImageDimensions({}, async () => ({})), null);
});
