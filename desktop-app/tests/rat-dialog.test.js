const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("RAT dialog exposes the workflow rendering contract without creating UI at registration", () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat/dialog.js");
  const context = { window: {}, document: { createElement() { throw new Error("must be lazy"); } } };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const api = context.window.registerMarkdownViewerRatDialog({ registerModule() {} });
  assert.equal(typeof api.open, "function");
  assert.equal(typeof api.renderActionForm, "function");
  assert.equal(typeof api.renderPreview, "function");
  assert.equal(typeof api.renderApplied, "function");
});

test("RAT dialog provides contextual finding and per-action help with clickable links", () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat/dialog.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.match(source, /data-rat-help-general/);
  assert.match(source, /getGeneralHelp/);
  assert.match(source, /getActionHelp/);
  assert.match(source, /How it affects the build/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.match(source, /bi-box-arrow-up-right/);
  assert.doesNotMatch(source, /<span aria-hidden="true">/);
});