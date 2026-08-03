const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("CodeMirror exposes a bounded full-document syntax tree for Outline", () => {
  const bundleSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/editor/codemirror-bundle-source.js"), "utf8");
  const generatedBundle = fs.readFileSync(path.resolve(__dirname, "../resources/js/vendor/codemirror.bundle.js"), "utf8");
  const wrapperSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/editor/codemirror-editor.js"), "utf8");
  const appSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/script.js"), "utf8");

  assert.match(bundleSource, /ensureSyntaxTree\(view\.state, view\.state\.doc\.length, 100\) \|\| syntaxTree\(view\.state\)/);
  assert.match(bundleSource, /getSyntaxTree\(\)/);
  assert.match(generatedBundle, /ensureSyntaxTree\(view\.state, view\.state\.doc\.length, 100\) \|\| syntaxTree\(view\.state\)/);
  assert.match(wrapperSource, /function getSyntaxTree\(\)/);
  assert.match(wrapperSource, /getSyntaxTree,/);
  assert.match(appSource, /getSyntaxTree: callActive\("getSyntaxTree", null\)/);
});
