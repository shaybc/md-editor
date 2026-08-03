"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function load(file, registrar, deps = {}) {
  const sourcePath = path.resolve(__dirname, `../resources/js/rat-policy/${file}`);
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window[registrar]({ registerModule() {} }, deps);
}

test("RAT external configuration separates matcher definitions from approved families", () => {
  const planner = load("rat-config-planner.js", "registerMarkdownViewerRatPolicyRatConfigPlanner");
  const xml = planner.create({
    customLicenses: [{ familyId: "VENDOR", familyName: "Vendor License", matcherType: "text", matcherEvidence: "Vendor terms" }],
    approvedFamilies: ["VENDOR"]
  });
  assert.match(xml, /<license family="VENDOR"/);
  assert.match(xml, /<text>Vendor terms<\/text>/);
  assert.match(xml, /<family license_ref="VENDOR"/);
});

test("RAT header planner preserves shebangs and XML declarations", () => {
  const planner = load("header-planner.js", "registerMarkdownViewerRatPolicyHeaderPlanner");
  assert.match(planner.add("#!/bin/sh\necho ok\n", "License", "sh"), /^#!\/bin\/sh\n# License/);
  assert.match(planner.add("<?xml version=\"1.0\"?>\n<root/>", "License", "xml"), /^<\?xml[^>]*>\s*<!--\nLicense/);
});

test("RAT exclusion generator rejects an all-workspace wildcard", () => {
  const planner = load("exclusion-planner.js", "registerMarkdownViewerRatPolicyExclusionPlanner", { validator: { isUnsafePattern(value) { return value === "**/*"; } } });
  assert.throws(() => planner.create(["**/*"]), /too broad/i);
  assert.match(planner.create(["generated/**"]), /generated\/\*\*/);
});
