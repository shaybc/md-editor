"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("RAT policy dialog is lazy and exposes the wizard contract", () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat-policy/dialog.js");
  const context = { window: {}, document: { createElement() { throw new Error("registration must remain lazy"); } } };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const api = context.window.registerMarkdownViewerRatPolicyDialog({ registerModule() {} }, { helpContent: {} });
  assert.equal(typeof api.open, "function");
  assert.equal(typeof api.renderPreview, "function");
  assert.equal(typeof api.close, "function");
});
