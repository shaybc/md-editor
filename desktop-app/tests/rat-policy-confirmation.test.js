"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("RAT policy dialog does not call a native confirmation API", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/rat-policy/dialog.js"), "utf8");
  assert.doesNotMatch(source, /(?:window|global)\.confirm\s*\(/);
  assert.match(source, /deps\.confirm/);
});

test("RAT grouped undo awaits the policy confirmation callback before deleting a saved draft", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat/change-set.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });

  const deleted = [];
  const removed = [];
  const api = context.window.registerMarkdownViewerRatChangeSet({ registerModule() {} }, {
    tabs: {
      async applyExternalDocumentContent() {},
      async applyExternalResourceDelete(filePath) { deleted.push(filePath); }
    },
    Neutralino: {
      filesystem: {
        async getStats() { return { isFile: true }; },
        async remove(filePath) { removed.push(filePath); }
      }
    }
  });

  const result = await api.apply({ changes: [
    { type: "create", path: "RAT-EXCLUDES", beforeContent: "", afterContent: "generated/**" }
  ] }, { confirmDelete: async () => false });

  assert.equal(await result.undo(), false);
  assert.deepEqual(deleted, []);
  assert.deepEqual(removed, []);
});
