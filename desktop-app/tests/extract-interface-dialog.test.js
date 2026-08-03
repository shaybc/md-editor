const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const dialogPath = path.resolve(__dirname, "../resources/js/editor/source-actions/dialogs/extract-interface-dialog.js");
const dialogSource = fs.readFileSync(dialogPath, "utf8");

function loadDialogFactory() {
  const context = { console, window: {} };
  context.window = context;
  vm.runInNewContext(dialogSource, context, { filename: dialogPath });
  return context.createMarkdownViewerExtractInterfaceDialog;
}

test("interface-name validation accepts Java identifiers and rejects keywords", () => {
  const validate = loadDialogFactory()._test.isValidJavaIdentifier;
  assert.equal(validate("Greeter"), true);
  assert.equal(validate("_Greeter2"), true);
  assert.equal(validate("9Greeter"), false);
  assert.equal(validate("hello-world"), false);
  assert.equal(validate("interface"), false);
  assert.equal(validate("record"), false);
});

test("dialog defaults and member selection match the Eclipse workflow", () => {
  assert.match(dialogSource, /extract-interface-name[^>]*required/);
  assert.match(dialogSource, /extract-interface-replace" checked/);
  assert.match(dialogSource, /extract-interface-instanceof">/);
  assert.match(dialogSource, /extract-interface-overrides" checked/);
  assert.match(dialogSource, /extract-interface-comments" checked/);
  assert.match(dialogSource, /selectedHandles = new Set\(\)/);
  assert.match(dialogSource, /data-selection="all"/);
  assert.match(dialogSource, /data-selection="none"/);
  assert.match(dialogSource, /Select at least one member/);
});

test("dialog preserves settings across Preview and Back and exposes grouped undo", () => {
  assert.match(dialogSource, /preparedPreview = await workflow\.preparePreview\(getSettings\(\)\)/);
  assert.match(dialogSource, /showConfiguration/);
  assert.doesNotMatch(
    dialogSource.slice(dialogSource.indexOf("function showConfiguration"), dialogSource.indexOf("async function preparePreview")),
    /selectedHandles\s*=|extract-interface-name"\)\.value\s*=/
  );
  assert.match(dialogSource, /applyResult = await workflow\.applyPreview\(preparedPreview\)/);
  assert.match(dialogSource, /await applyResult\.undo\(\)/);
  assert.match(dialogSource, /Undo Extract Interface/);
  assert.match(dialogSource, /event\.key === "Escape"/);
});
