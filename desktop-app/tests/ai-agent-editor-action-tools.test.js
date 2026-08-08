const assert = require("node:assert/strict");
const test = require("node:test");

const editorActionTools = require("../resources/ai-companion/tools/editor-action-tools");

test("editor action proxy forwards app-action details and returns browser result", async () => {
  const result = await editorActionTools.requestEditorAction("", "replace_selection", { replacement: "updated" }, {
    requestAppAction: async (details) => {
      assert.equal(details.tool, "replace_selection");
      assert.deepEqual(details.args, { replacement: "updated" });
      assert.equal(details.preview.target, "replace_selection");
      return { changed: true, path: "docs/a.md" };
    }
  });

  assert.deepEqual(result, { changed: true, path: "docs/a.md" });
});
