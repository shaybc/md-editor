"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("RAT policy offline manifest distinguishes curated subsets from official artifacts", () => {
  const manifestPath = path.resolve(__dirname, "../resources/assets/rat-policy/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.deepEqual(manifest.schemas.map((entry) => entry.ratVersion), ["0.17", "0.18"]);
  assert.equal(manifest.schemas.every((entry) => entry.kind === "md-editor-validation-subset"), true);
  assert.equal(manifest.excludedArtifacts.includes("Apache RAT binaries"), true);
  for (const entry of [...manifest.schemas, ...manifest.templates]) {
    assert.equal(fs.existsSync(path.resolve(__dirname, `../resources${entry.path}`)), true, entry.path);
  }
});
