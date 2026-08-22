const test = require("node:test");
const assert = require("node:assert/strict");
const {
  Base64ConversionError,
  registerMarkdownViewerBase64Converter,
  encodeBase64Text,
  decodeBase64Text,
  encodeBase64Bytes,
  decodeBase64ToBytes,
  createBase64DataUrl,
  decodeBase64Image,
} = require("../resources/js/editor/base64-converter.js");

test("encodes and decodes ASCII text as standard Base64", () => {
  assert.equal(encodeBase64Text("Hello"), "SGVsbG8=");
  assert.equal(decodeBase64Text("SGVsbG8="), "Hello");
});

test("round-trips Hebrew, emoji, and multiline UTF-8 text", () => {
  const source = "שלום 😀\nSecond line";
  const encoded = encodeBase64Text(source);

  assert.equal(encodeBase64Text("שלום 😀"), "16nXnNeV150g8J+YgA==");
  assert.equal(decodeBase64Text(encoded), source);
});

test("decodes standard Base64 wrapped with ASCII whitespace", () => {
  assert.equal(decodeBase64Text("SGVs\n bG8=\r\n"), "Hello");
});

test("rejects malformed, noncanonical, unpadded, and URL-safe Base64", () => {
  [
    "",
    "   ",
    "abc",
    "!!!!",
    "A===",
    "TQ=A",
    "TR==",
    "SGVsbG8_",
  ].forEach((value) => {
    assert.throws(() => decodeBase64Text(value), Base64ConversionError);
  });
});

test("rejects Base64 bytes that are not valid UTF-8 text", () => {
  assert.throws(() => decodeBase64Text("/w=="), Base64ConversionError);
});


test("encodes and decodes arbitrary bytes for image data", () => {
  const bytes = new Uint8Array([0, 255, 16, 32, 64]);
  const encoded = encodeBase64Bytes(bytes);
  const decoded = decodeBase64ToBytes(encoded);

  assert.equal(encoded, "AP8QIEA=");
  assert.deepEqual(Array.from(decoded), Array.from(bytes));
});

test("builds and decodes Base64 image data URLs", () => {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const dataUrl = createBase64DataUrl(bytes, "image/png");
  const decoded = decodeBase64Image(dataUrl);

  assert.equal(dataUrl, "data:image/png;base64,iVBORw==");
  assert.equal(decoded.mimeType, "image/png");
  assert.equal(decoded.dataUrl, dataUrl);
  assert.deepEqual(Array.from(decoded.bytes), Array.from(bytes));
});

test("registers the Base64 converter with application services and modules", () => {
  const registered = [];
  const app = {
    services: {},
    registerModule(name, module) {
      registered.push({ name, module });
    },
  };

  const converter = registerMarkdownViewerBase64Converter(app);

  assert.equal(app.services.base64Converter, converter);
  assert.deepEqual(registered, [{ name: "base64Converter", module: converter }]);
  assert.equal(converter.decode(converter.encode("שלום 😀")), "שלום 😀");
  assert.equal(converter.createDataUrl(new Uint8Array([72]), "text/plain"), "data:text/plain;base64,SA==");
});
