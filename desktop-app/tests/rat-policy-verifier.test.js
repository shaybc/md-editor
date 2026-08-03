"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("RAT policy verifier distinguishes a passing audit from remaining findings", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat-policy/policy-verifier.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const results = [
    { succeeded: true, findings: [], unapprovedCount: 0, exitCode: 0 },
    { succeeded: false, findings: [{ filePath: "file.bin" }], unapprovedCount: 1, exitCode: 1 }
  ];
  const api = context.window.registerMarkdownViewerRatPolicyVerifier({ registerModule() {} }, { runner: { async runCheck() { return results.shift(); } } });
  assert.equal((await api.run({}, "module")).status, "Policy check passed");
  assert.equal((await api.run({}, "module")).status, "Policy active; findings require review");
});
