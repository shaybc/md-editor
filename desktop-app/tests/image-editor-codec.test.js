const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadCodec() {
  const context = { window: {}, Blob, URL };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, "../resources/js/image-editor/codec.js"), "utf8"),
    context
  );
  return context.window.MarkdownViewerImageEditor;
}

test("codec recognizes only PNG, JPEG, and WebP editor sources", () => {
  const codec = loadCodec();

  assert.equal(codec.canEditSource({ name: "photo.png" }), true);
  assert.equal(codec.canEditSource({ type: "image/jpeg" }), true);
  assert.equal(codec.canEditSource({ mimeType: "image/webp" }), true);
  assert.equal(codec.canEditSource({ name: "animation.gif", type: "image/gif" }), false);
  assert.equal(codec.canEditSource({ name: "vector.svg" }), false);
});

test("codec maps supported save extensions to canonical MIME types", () => {
  const codec = loadCodec();

  assert.equal(codec.mimeTypeForName("image.PNG"), "image/png");
  assert.equal(codec.mimeTypeForName("image.jpg"), "image/jpeg");
  assert.equal(codec.mimeTypeForName("image.jpeg"), "image/jpeg");
  assert.equal(codec.mimeTypeForName("image.webp"), "image/webp");
  assert.equal(codec.mimeTypeForName("image.bmp"), "");
});
