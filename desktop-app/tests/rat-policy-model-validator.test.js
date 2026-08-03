"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function load(file, registrar, deps) {
  const sourcePath = path.resolve(__dirname, `../resources/js/rat-policy/${file}`);
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window[registrar]({ registerModule() {} }, deps);
}

test("RAT policy draft uses the smallest active configuration scope", () => {
  const model = load("policy-model.js", "registerMarkdownViewerRatPolicyModel");
  const draft = model.createDraft({
    projectPath: "C:/Project",
    governing: { pomPath: "C:/Project/module/pom.xml" },
    module: { pomPath: "C:/Project/module/pom.xml" },
    projectLicense: { identifier: "Apache-2.0", name: "Apache License 2.0" },
    documents: [],
    pluginVersion: "0.18",
    hasActivePlugin: true,
    hasBoundExecution: true
  });
  assert.equal(draft.targetPomPath, "C:/Project/module/pom.xml");
  assert.equal(draft.bindToVerify, false);
  assert.equal(draft.skip, false);
});

test("RAT policy validation rejects broad exclusions and unacknowledged bypasses", () => {
  const validator = load("policy-validator.js", "registerMarkdownViewerRatPolicyValidator");
  const result = validator.validate({
    targetPomPath: "C:/Project/pom.xml",
    projectLicense: "Apache-2.0",
    exclusions: ["**/*"],
    approvedFamilies: [],
    documentation: {},
    skip: true,
    disableExecution: false,
    acknowledgedBypass: false,
    acknowledgePolicyOwnership: true
  }, { capabilities: { hasBundledSchema: true } });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /workspace-wide exclusion/i);
  assert.match(result.errors.join(" "), /bypasses license auditing/i);
});
