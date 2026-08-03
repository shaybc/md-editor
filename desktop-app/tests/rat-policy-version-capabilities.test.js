"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadCapabilities() {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat-policy/version-capabilities.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerRatPolicyVersionCapabilities({ registerModule() {} });
}

test("RAT policy capabilities select only version-matched offline schemas", () => {
  const capabilities = loadCapabilities();
  assert.equal(capabilities.resolve("0.18").schemaVersion, "0.18");
  assert.equal(capabilities.resolve("0.17.0").hasBundledSchema, true);
  assert.equal(capabilities.resolve("${rat.version}").validationLevel, "structural-only");
  assert.equal(capabilities.resolve("0.15").supportsModernLicenseDefinitions, false);
});
