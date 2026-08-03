const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/workspace-edit.js");

function createPreview(options = {}) {
  const context = { console, setTimeout, clearTimeout, window: {} };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const files = new Map(Object.entries(options.files || {
    "C:/Project/Demo.java": "class Demo {}\n"
  }));
  const tabContents = new Map();
  const Neutralino = {
    filesystem: {
      async getStats(filePath) {
        if (!files.has(filePath)) throw new Error("missing");
        return {};
      },
      async readFile(filePath) {
        if (!files.has(filePath)) throw new Error("missing");
        return files.get(filePath);
      },
      async writeFile(filePath, content) {
        files.set(filePath, content);
      },
      async remove(filePath) {
        files.delete(filePath);
      },
      async move(oldPath, newPath) {
        files.set(newPath, files.get(oldPath));
        files.delete(oldPath);
      }
    }
  };
  const api = context.registerMarkdownViewerWorkspaceEditPreview({ registerModule() {} }, {
    registry: {
      fromFileUri(uri) {
        if (!uri.startsWith("file:///")) return "";
        return decodeURIComponent(uri.slice("file:///".length));
      }
    },
    getWorkspaceRoot: () => "C:/Project",
    osName: "Windows",
    Neutralino,
    tabs: {
      getExternalDocumentSnapshot(filePath) {
        if (!options.openSnapshot || options.openSnapshot.path !== filePath) return null;
        return { ...options.openSnapshot };
      },
      async applyExternalDocumentContent(filePath, content) {
        if (options.failApply && filePath.endsWith(options.failApply)) throw new Error("forced failure");
        tabContents.set(filePath, content);
      },
      applyExternalResourceRename() {}
    }
  });
  return { api, files, tabContents };
}

test("workspace edit previews and applies current dirty-buffer content without saving it", async () => {
  const harness = createPreview({
    openSnapshot: {
      path: "C:/Project/Demo.java",
      content: "class Demo { Widget value; }\n",
      isOpen: true,
      isDirty: true,
      version: 4
    }
  });
  const preview = await harness.api.resolve({
    workspaceEdit: {
      documentChanges: [{
        textDocument: { uri: "file:///C:/Project/Demo.java", version: 4 },
        edits: [{
          range: { start: { line: 0, character: 13 }, end: { line: 0, character: 19 } },
          newText: "String"
        }]
      }]
    }
  });

  const result = await harness.api.apply(preview);
  assert.equal(harness.tabContents.get("C:/Project/Demo.java"), "class Demo { String value; }\n");
  assert.equal(harness.files.get("C:/Project/Demo.java"), "class Demo {}\n");

  await result.undo();
  assert.equal(harness.tabContents.get("C:/Project/Demo.java"), "class Demo { Widget value; }\n");
});

test("workspace edit supports create followed by edit and rejects unsafe edits", async () => {
  const harness = createPreview();
  const preview = await harness.api.resolve({
    workspaceEdit: {
      documentChanges: [
        { kind: "create", uri: "file:///C:/Project/Widget.java" },
        {
          textDocument: { uri: "file:///C:/Project/Widget.java", version: null },
          edits: [{
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            newText: "class Widget {}\n"
          }]
        }
      ]
    }
  });
  assert.equal(preview.summary[1].after, "class Widget {}\n");

  await assert.rejects(
    harness.api.resolve({
      workspaceEdit: {
        changes: {
          "file:///C:/Outside.java": [{
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            newText: "x"
          }]
        }
      }
    }),
    /outside the active workspace/
  );
  assert.throws(() => harness.api.applyTextEdits("abc", [
    { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 2 } }, newText: "" },
    { range: { start: { line: 0, character: 1 }, end: { line: 0, character: 3 } }, newText: "" }
  ]), /overlapping/);
});

test("workspace edit rolls back earlier operations when a later operation fails", async () => {
  const harness = createPreview({
    files: {
      "C:/Project/One.java": "one",
      "C:/Project/Two.java": "two"
    },
    failApply: "Two.java"
  });
  const preview = await harness.api.resolve({
    workspaceEdit: {
      changes: {
        "file:///C:/Project/One.java": [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: "ONE" }],
        "file:///C:/Project/Two.java": [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: "TWO" }]
      }
    }
  });

  await assert.rejects(harness.api.apply(preview), /forced failure/);
  assert.equal(harness.tabContents.get("C:/Project/One.java"), "one");
});

test("workspace edit applies and undoes rename overwrite and delete resource operations", async () => {
  const renameHarness = createPreview({
    files: {
      "C:/Project/Old.java": "old",
      "C:/Project/New.java": "destination"
    }
  });
  const renamePreview = await renameHarness.api.resolve({
    workspaceEdit: {
      documentChanges: [{
        kind: "rename",
        oldUri: "file:///C:/Project/Old.java",
        newUri: "file:///C:/Project/New.java",
        options: { overwrite: true }
      }]
    }
  });
  const renameResult = await renameHarness.api.apply(renamePreview);
  assert.equal(renameHarness.files.has("C:/Project/Old.java"), false);
  assert.equal(renameHarness.files.get("C:/Project/New.java"), "old");
  await renameResult.undo();
  assert.equal(renameHarness.files.get("C:/Project/Old.java"), "old");
  assert.equal(renameHarness.files.get("C:/Project/New.java"), "destination");

  const deleteHarness = createPreview({ files: { "C:/Project/Delete.java": "delete me" } });
  const deletePreview = await deleteHarness.api.resolve({
    workspaceEdit: {
      documentChanges: [{ kind: "delete", uri: "file:///C:/Project/Delete.java" }]
    }
  });
  const deleteResult = await deleteHarness.api.apply(deletePreview);
  assert.equal(deleteHarness.files.has("C:/Project/Delete.java"), false);
  await deleteResult.undo();
  assert.equal(deleteHarness.files.get("C:/Project/Delete.java"), "delete me");
});