const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("RAT actions distinguish remediation, documentation, and audit bypass", () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat/action-catalog.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const api = context.window.registerMarkdownViewerRatActionCatalog({ registerModule() {} });
  const actions = api.getActions({
    finding: { filePath: "C:/Project/file.bin" },
    inspection: { classification: "binary" },
    module: { hasPom: true },
    configurationConfidence: "static"
  });
  assert.equal(actions.find((action) => action.id === "resolution.add-header").enabled, false);
  assert.equal(actions.find((action) => action.id === "documentation.third-party").clearsFinding, false);
  assert.equal(actions.find((action) => action.id === "advanced.skip").badge, "Audit bypass");
});
