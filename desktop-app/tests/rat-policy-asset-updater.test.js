"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

test("RAT policy asset updater requires an explicit HTTPS source and checksum", () => {
  const scriptPath = path.resolve(__dirname, "../update-rat-policy-assets.js");
  const result = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--schema-url/);
  assert.match(result.stderr, /--sha256/);
});
