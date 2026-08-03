const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dialogSource = fs.readFileSync(path.resolve(
  __dirname,
  "../resources/js/editor/source-actions/dialogs/introduce-parameter-object-dialog.js"
), "utf8");
const dialogStyles = fs.readFileSync(path.resolve(
  __dirname,
  "../resources/css/editor/introduce-parameter-object-dialog.css"
), "utf8");

test("Introduce Parameter Object dialog exposes the Eclipse configuration controls", () => {
  assert.match(dialogSource, /introduce-parameter-object-class-name/);
  assert.match(dialogSource, /value="top-level"/);
  assert.match(dialogSource, /value="nested"/);
  assert.match(dialogSource, /introduce-parameter-object-field-selected/);
  assert.match(dialogSource, /introduce-parameter-object-field-name/);
  assert.match(dialogSource, /introduce-parameter-object-getters/);
  assert.match(dialogSource, /introduce-parameter-object-setters/);
  assert.match(dialogSource, /introduce-parameter-object-delegate/);
  assert.match(dialogSource, /introduce-parameter-object-deprecate/);
  assert.match(dialogSource, /Method signature preview/);
  assert.match(dialogSource, /replace\(\/<\/g, "&lt;"\)/);
});

test("Introduce Parameter Object dialog includes preview, apply, and undo affordances", () => {
  assert.match(dialogSource, /introduce-parameter-object-preview-button/);
  assert.match(dialogSource, /introduce-parameter-object-back/);
  assert.match(dialogSource, /introduce-parameter-object-ok/);
  assert.match(dialogSource, /Undo Introduce Parameter Object/);
  assert.match(dialogStyles, /\.introduce-parameter-object-preview-mode/);
  assert.match(dialogStyles, /\.introduce-parameter-object-ok/);
  assert.match(dialogStyles, /\.introduce-parameter-object-undo-banner/);
});
