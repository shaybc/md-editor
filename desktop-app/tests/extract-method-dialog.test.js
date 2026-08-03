const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const dialogPath = path.resolve(__dirname, "../resources/js/editor/source-actions/dialogs/extract-method-dialog.js");
const dialogSource = fs.readFileSync(dialogPath, "utf8");
const dialogStylesPath = path.resolve(__dirname, "../resources/css/editor/extract-method-dialog.css");
const dialogStyles = fs.readFileSync(dialogStylesPath, "utf8");

function loadDialogFactory() {
  const context = { console, window: {} };
  context.window = context;
  vm.runInNewContext(dialogSource, context, { filename: dialogPath });
  return context.createMarkdownViewerExtractMethodDialog;
}

test("method-name validation accepts Java identifiers and rejects keywords", () => {
  const validate = loadDialogFactory()._test.isValidJavaIdentifier;
  assert.equal(validate("extractGreeting"), true);
  assert.equal(validate("_extract2"), true);
  assert.equal(validate("9extract"), false);
  assert.equal(validate("extract-method"), false);
  assert.equal(validate("return"), false);
  assert.equal(validate("record"), false);
});

test("dialog provides Eclipse-style naming, signature, preview, and navigation controls", () => {
  assert.match(dialogSource, /extract-method-name[^>]*required/);
  assert.match(dialogSource, /Method signature preview:/);
  assert.match(dialogSource, /Original Source/);
  assert.match(dialogSource, /Refactored Source/);
  assert.match(dialogSource, /Access modifier/);
  assert.match(dialogSource, /Declare thrown runtime exceptions/);
  assert.match(dialogSource, /controlled by JDT LS/);
  assert.match(dialogSource, /Changes to be performed/);
  assert.match(dialogSource, /2 Differences/);
  assert.match(dialogSource, /extract-method-preview-button/);
  assert.match(dialogSource, /extract-method-back/);
  assert.match(dialogSource, /extract-method-ok/);
  assert.match(dialogSource, /extract-method-cancel/);
});

test("dialog preserves the prepared proposal across direct OK and Preview/Back and exposes undo", () => {
  assert.match(dialogSource, /preparedPreview = nextWorkflow\.initialPreview \|\| null/);
  assert.match(dialogSource, /preparedPreview = await workflow\.preparePreview\(settings\)/);
  assert.match(dialogSource, /showConfiguration/);
  assert.match(dialogSource, /applyResult = await workflow\.applyPreview\(preview\)/);
  assert.match(dialogSource, /await applyResult\.undo\(\)/);
  assert.match(dialogSource, /close\(\{ applied: true \}\)/);
  assert.match(dialogSource, /extract-method-undo-banner/);
  assert.match(dialogSource, /Undo Extract Method/);
  assert.match(dialogSource, /event\.key === "Escape"/);
});

test("dialog styling reuses the shared wizard color scheme", () => {
  assert.match(dialogStyles, /background: var\(--panel-bg/);
  assert.match(dialogStyles, /background: var\(--input-bg/);
  assert.match(dialogStyles, /background: var\(--button-bg/);
  assert.match(dialogStyles, /\.extract-method-ok \{[\s\S]*background: var\(--accent-color/);
  assert.match(dialogStyles, /border: 1px solid var\(--border-color/);
  assert.doesNotMatch(dialogStyles, /#454547|#242426|#545456|#f0f0f0/);
});