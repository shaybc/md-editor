const assert = require("node:assert/strict");
const test = require("node:test");

const codec = require("../resources/js/tools/text-escape/text-escape-codec.js");

test("escapes control characters, quotes, and backslashes", () => {
  assert.equal(codec.escapeText('hello\n"world"\t\\'), 'hello\\n\\"world\\"\\t\\\\');
});

test("unescapes escaped text", () => {
  assert.equal(codec.unescapeText('hello\\n\\"world\\"\\t\\\\'), 'hello\n"world"\t\\');
});

test("converts text according to the selected mode", () => {
  assert.equal(codec.convertText("a\nb", { mode: "escape" }), "a\\nb");
  assert.equal(codec.convertText("a\\nb", { mode: "unescape" }), "a\nb");
});

test("throws for invalid escaped text", () => {
  assert.throws(() => codec.unescapeText("\\x"), /Invalid escaped text/);
});
