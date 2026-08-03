const test = require("node:test");
const assert = require("node:assert/strict");
const {
  UnicodeConversionError,
  registerMarkdownViewerUnicodeConverter,
  encode,
  encodeHexNcr,
  encodeJavaScriptUnicode,
  encodeJavaUnicode,
  encodeCssUnicode,
  encodeUri,
  decodeUri,
  decodeUnicodeRepresentation,
} = require("../resources/js/editor/unicode-converter.js");

const SHALOM = "שלום";

test("encodes Hebrew text in every supported representation", () => {
  assert.equal(encodeHexNcr(SHALOM), "&#x05E9;&#x05DC;&#x05D5;&#x05DD;");
  assert.equal(encodeJavaScriptUnicode(SHALOM), "\\u{5E9}\\u{5DC}\\u{5D5}\\u{5DD}");
  assert.equal(encodeJavaUnicode(SHALOM), "\\u05E9\\u05DC\\u05D5\\u05DD");
  assert.equal(encodeCssUnicode(SHALOM), "\\05E9 \\05DC \\05D5 \\05DD ");
  assert.equal(encodeUri(SHALOM), "%D7%A9%D7%9C%D7%95%D7%9D");
});

test("encodes ASCII and supplementary Unicode code points without data loss", () => {
  assert.equal(encode("A😀", "hex-ncr"), "&#x0041;&#x1F600;");
  assert.equal(encode("A😀", "javascript-es6"), "\\u{41}\\u{1F600}");
  assert.equal(encode("A😀", "java-c"), "\\u0041\\uD83D\\uDE00");
  assert.equal(encode("A😀", "css"), "\\0041 \\1F600 ");
  assert.equal(encode("A😀", "encoded-uri"), "A%F0%9F%98%80");
});

test("decodes every generated representation back to the original text", () => {
  [
    encodeHexNcr(SHALOM),
    encodeJavaScriptUnicode(SHALOM),
    encodeJavaUnicode(SHALOM),
    encodeCssUnicode(SHALOM),
    encodeUri(SHALOM),
  ].forEach((encoded) => {
    assert.equal(decodeUnicodeRepresentation(encoded), SHALOM);
  });
});

test("decodes decimal NCRs, mixed plain text, and supplementary code points", () => {
  assert.equal(decodeUnicodeRepresentation("value: &#60;"), "value: <");
  assert.equal(decodeUnicodeRepresentation("Hello \\u{1F600}"), "Hello 😀");
  assert.equal(decodeUnicodeRepresentation("Hello \\uD83D\\uDE00"), "Hello 😀");
  assert.equal(decodeUnicodeRepresentation("Hello \\1F600 "), "Hello 😀");
  assert.equal(decodeUnicodeRepresentation("Hello%20%F0%9F%98%80"), "Hello 😀");
});

test("decodes percent-encoded UTF-8 directly for the Encoded URI editor action", () => {
  assert.equal(decodeUri("Hello%20%D7%A9%D7%9C%D7%95%D7%9D"), "Hello שלום");
  assert.throws(() => decodeUri("%D7%"), UnicodeConversionError);
  assert.throws(() => decodeUri("%FF"), UnicodeConversionError);
});

test("rejects malformed, incomplete, and unsupported representations", () => {
  [
    "plain text",
    "&#x110000;",
    "&#xD800;",
    "&#x05E9",
    "\\u{110000}",
    "\\u{D800}",
    "\\uD83D",
    "\\uDE00",
    "\\uD83D\\u0041",
    "\\110000 ",
    "%D7%A9%",
    "%FF",
  ].forEach((value) => {
    assert.throws(
      () => decodeUnicodeRepresentation(value),
      UnicodeConversionError,
      `Expected ${JSON.stringify(value)} to be rejected`
    );
  });
});

test("rejects unpaired surrogates and unknown output formats", () => {
  assert.throws(() => encodeHexNcr("\uD800"), UnicodeConversionError);
  assert.throws(() => encode("\uDC00", "encoded-uri"), UnicodeConversionError);
  assert.throws(() => encode("text", "unknown"), UnicodeConversionError);
});

test("registers the converter with application services and modules", () => {
  const registered = [];
  const app = {
    services: {},
    registerModule(name, module) {
      registered.push({ name, module });
    },
  };

  const converter = registerMarkdownViewerUnicodeConverter(app);

  assert.equal(app.services.unicodeConverter, converter);
  assert.deepEqual(registered, [{ name: "unicodeConverter", module: converter }]);
  assert.equal(converter.decode(converter.encode(SHALOM, "hex-ncr")), SHALOM);
  assert.equal(converter.decodeUri(converter.encode(SHALOM, "encoded-uri")), SHALOM);
});
