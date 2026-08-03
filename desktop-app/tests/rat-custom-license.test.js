const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("RAT custom-license planner emits family, matcher, and explicit approval", () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat/xml-edit-planner.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const api = context.window.registerMarkdownViewerRatXmlEditPlanner({ registerModule() {} });
  const after = api.addCustomLicense("<project>\n</project>\n", {
    familyId: "VENDOR1",
    familyName: "Vendor License",
    matcherType: "spdx",
    matcherEvidence: "MIT"
  });
  assert.match(after, /<family>VENDOR1<\/family>/);
  assert.match(after, /<spdx>MIT<\/spdx>/);
  assert.match(after, /<licenseFamiliesApproved>VENDOR1<\/licenseFamiliesApproved>/);
});

test("RAT custom-license planner fails closed when custom collections already exist", () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat/xml-edit-planner.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const api = context.window.registerMarkdownViewerRatXmlEditPlanner({ registerModule() {} });
  assert.throws(() => api.addCustomLicense("<project><licenses></licenses></project>", {
    familyId: "VENDOR1",
    matcherEvidence: "license text"
  }), /manual merging/i);
});
