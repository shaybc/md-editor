const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("an excluded parent is not emitted when it contains a selected child", () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/lsp/java-workspace-model.js");
  const context = { window: {}, setTimeout };
  context.globalThis = context.window;
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const model = context.window.registerMarkdownViewerJavaWorkspaceModel({ registerModule() {} }, {});
  const inventory = {
    buildSystem: "maven",
    kind: "maven-modules",
    entries: [
      { id: "maven:parent", relativePath: "modules", absolutePath: "C:/Project/modules", dependencies: [] },
      { id: "maven:selected", relativePath: "modules/selected", absolutePath: "C:/Project/modules/selected", dependencies: [] }
    ]
  };

  const scope = model.resolveAnalysisScope("C:/Project", inventory, {
    analysisScope: { mode: "selected", deselectedEntryIds: ["maven:parent"] }
  });

  assert.deepEqual(Array.from(scope.importExclusions), []);
});
