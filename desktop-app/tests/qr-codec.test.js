const assert = require("node:assert/strict");
const test = require("node:test");

const qrCodec = require("../resources/js/tools/qr/qr-codec.js");

test("QR codec creates a version 1 SVG for short text", () => {
  const result = qrCodec.encodeText("hello");

  assert.equal(result.text, "hello");
  assert.equal(result.version, 1);
  assert.equal(result.matrix.length, 21);
  assert.match(result.svg, /^<svg /);
  assert.match(result.svg, /<rect /);
});

test("QR codec returns an empty result for empty text", () => {
  const result = qrCodec.encodeText("");

  assert.equal(result.svg, "");
  assert.equal(result.version, null);
  assert.deepEqual(result.matrix, []);
});

test("QR codec escapes SVG labels", () => {
  const result = qrCodec.encodeText("hello", { label: 'QR "hello" <test>' });

  assert.match(result.svg, /aria-label="QR &quot;hello&quot; &lt;test&gt;"/);
});

test("QR codec rejects text beyond the bundled generator capacity", () => {
  assert.throws(
    () => qrCodec.encodeText("x".repeat(107)),
    /Text is too long/
  );
});
