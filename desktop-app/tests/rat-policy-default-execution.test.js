"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("RAT policy defaults to verify when a plugin exists without a check execution", () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat-policy/policy-model.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const model = context.window.registerMarkdownViewerRatPolicyModel({ registerModule() {} });
  const draft = model.createDraft({
    projectPath: "C:/Project",
    governing: { pomPath: "C:/Project/pom.xml" },
    module: { pomPath: "C:/Project/pom.xml" },
    projectLicense: {},
    documents: [],
    pluginVersion: "0.18",
    hasActivePlugin: true,
    hasBoundExecution: false
  });
  assert.equal(draft.bindToVerify, true);
});
