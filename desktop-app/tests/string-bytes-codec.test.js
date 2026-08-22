const assert = require("node:assert/strict");
const test = require("node:test");

const codec = require("../resources/js/tools/string-bytes/string-bytes-codec.js");

test("converts string to decimal byte array and back", () => {
  const text = "Hello " + String.fromCodePoint(0x05e9, 0x05dc, 0x05d5, 0x05dd);
  const encoded = codec.convertStringBytes(text, { format: codec.FORMAT_DECIMAL_ARRAY });
  assert.equal(encoded, "[72, 101, 108, 108, 111, 32, 215, 169, 215, 156, 215, 149, 215, 157]");
  assert.equal(codec.convertStringBytes(encoded, { mode: "bytes-to-string", format: codec.FORMAT_DECIMAL_ARRAY }), text);
});

test("converts string to hexadecimal byte array and back", () => {
  const encoded = codec.convertStringBytes("Hi", { format: codec.FORMAT_HEX_ARRAY });
  assert.equal(encoded, "[0x48, 0x69]");
  assert.equal(codec.convertStringBytes(encoded, { mode: "bytes-to-string", format: codec.FORMAT_HEX_ARRAY }), "Hi");
});

test("converts string to raw hexadecimal and back", () => {
  const encoded = codec.convertStringBytes("Hi", { format: codec.FORMAT_RAW_HEX });
  assert.equal(encoded, "4869");
  assert.equal(codec.convertStringBytes(encoded, { mode: "bytes-to-string", format: codec.FORMAT_RAW_HEX }), "Hi");
});

test("rejects invalid byte input", () => {
  assert.throws(() => codec.parseBytes("[256]", { format: codec.FORMAT_DECIMAL_ARRAY }), /between 0 and 255/);
  assert.throws(() => codec.parseBytes("486", { format: codec.FORMAT_RAW_HEX }), /complete byte pairs/);
});
