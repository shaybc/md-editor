const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("image preview zoom clamps to the local 25% through 800% range", () => {
  const context = { window: {}, document: {} };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, "../resources/js/files/image-preview-controls.js"), "utf8"),
    context
  );
  const app = { services: {}, registerModule() {} };
  const controls = context.window.registerMarkdownViewerImagePreviewControls(app);

  assert.equal(controls.clampZoom(0.01), 0.25);
  assert.equal(controls.clampZoom(2), 2);
  assert.equal(controls.clampZoom(20), 8);
});
