const test = require("node:test");
const assert = require("node:assert/strict");
const {
  Base64ConversionError,
  registerMarkdownViewerBase64Converter,
  encodeBase64Text,
  decodeBase64Text,
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
});
