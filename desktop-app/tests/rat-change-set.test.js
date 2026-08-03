const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadChangeSet(failPath = "") {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat/change-set.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const contents = new Map();
  const api = context.window.registerMarkdownViewerRatChangeSet({ registerModule() {} }, {
    tabs: { async applyExternalDocumentContent(filePath, content) {
      if (filePath === failPath && content === "after-b") throw new Error("forced failure");
      contents.set(filePath, content);
    } }
  });
  return { api, contents };
}

test("RAT change set applies and undoes all buffers together", async () => {
  const harness = loadChangeSet();
  const result = await harness.api.apply({ changes: [
    { path: "a", beforeContent: "before-a", afterContent: "after-a" },
    { path: "b", beforeContent: "before-b", afterContent: "after-b" }
  ] });
  assert.equal(harness.contents.get("a"), "after-a");
  await result.undo();
  assert.equal(harness.contents.get("a"), "before-a");
  assert.equal(harness.contents.get("b"), "before-b");
});

test("RAT change set rolls back earlier buffers after a later failure", async () => {
  const harness = loadChangeSet("b");
  await assert.rejects(() => harness.api.apply({ changes: [
    { path: "a", beforeContent: "before-a", afterContent: "after-a" },
    { path: "b", beforeContent: "before-b", afterContent: "after-b" }
  ] }), /forced failure/);
  assert.equal(harness.contents.get("a"), "before-a");
});
