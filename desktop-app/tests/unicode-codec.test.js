const assert = require("node:assert/strict");
const test = require("node:test");

const codec = require("../resources/js/tools/unicode/unicode-codec.js");

const sample = "this is and example text " + String.fromCodePoint(
  0x05e9,
  0x05dc,
  0x05d5,
  0x05dd,
  0x20,
  0x05d0,
  0x05e0,
  0x05d9,
  0x20,
  0x05d8,
  0x05e7,
  0x05e1,
  0x05d8,
  0x20,
  0x05d3,
  0x05d5,
  0x05d2,
  0x05de,
  0x05d4
);

test("encodes and decodes decimal HTML entities", () => {
  const encoded = codec.encodeUnicode(sample, { format: codec.FORMAT_HTML_DECIMAL });
  assert.equal(encoded, "&#116;&#104;&#105;&#115;&#32;&#105;&#115;&#32;&#97;&#110;&#100;&#32;&#101;&#120;&#97;&#109;&#112;&#108;&#101;&#32;&#116;&#101;&#120;&#116;&#32;&#1513;&#1500;&#1493;&#1501;&#32;&#1488;&#1504;&#1497;&#32;&#1496;&#1511;&#1505;&#1496;&#32;&#1491;&#1493;&#1490;&#1502;&#1492;");
  assert.equal(codec.decodeUnicode(encoded, { format: codec.FORMAT_HTML_DECIMAL }), sample);
});

test("encodes and decodes JavaScript Unicode escapes", () => {
  const encoded = codec.encodeUnicode(sample, { format: codec.FORMAT_JAVASCRIPT_UNICODE });
  assert.equal(encoded, "\\u0074\\u0068\\u0069\\u0073\\u0020\\u0069\\u0073\\u0020\\u0061\\u006e\\u0064\\u0020\\u0065\\u0078\\u0061\\u006d\\u0070\\u006c\\u0065\\u0020\\u0074\\u0065\\u0078\\u0074\\u0020\\u05e9\\u05dc\\u05d5\\u05dd\\u0020\\u05d0\\u05e0\\u05d9\\u0020\\u05d8\\u05e7\\u05e1\\u05d8\\u0020\\u05d3\\u05d5\\u05d2\\u05de\\u05d4");
  assert.equal(codec.decodeUnicode(encoded, { format: codec.FORMAT_JAVASCRIPT_UNICODE }), sample);
});

test("encodes and decodes URL percent encoding", () => {
  const encoded = codec.encodeUnicode(sample, { format: codec.FORMAT_URL_PERCENT });
  assert.equal(encoded, "this%20is%20and%20example%20text%20%d7%a9%d7%9c%d7%95%d7%9d%20%d7%90%d7%a0%d7%99%20%d7%98%d7%a7%d7%a1%d7%98%20%d7%93%d7%95%d7%92%d7%9e%d7%94");
  assert.equal(codec.decodeUnicode(encoded, { format: codec.FORMAT_URL_PERCENT }), sample);
});

test("throws for malformed encoded values", () => {
  assert.throws(() => codec.decodeUnicode("\\u12", { format: codec.FORMAT_JAVASCRIPT_UNICODE }), /Invalid JavaScript Unicode/);
  assert.throws(() => codec.decodeUnicode("%d7%zz", { format: codec.FORMAT_URL_PERCENT }), /Invalid URL percent/);
});
