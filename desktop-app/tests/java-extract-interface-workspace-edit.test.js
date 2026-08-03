const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadFactory() {
  const context = { console, structuredClone, window: {} };
  context.window = context;
  vm.runInNewContext(
    fs.readFileSync(path.resolve(__dirname, "../resources/js/editor/source-actions/languages/extract-interface/java-extract-interface-workspace-edit.js"), "utf8"),
    context
  );
  return context.createMarkdownViewerJavaExtractInterfaceWorkspaceEdit;
}

function createPreviewService(operations) {
  return {
    async resolve(action) {
      return {
        action,
        operations,
        affectedPaths: operations.map((operation) => operation.path),
        summary: operations.map((operation) => ({
          type: operation.type,
          path: operation.path,
          before: operation.beforeContent,
          after: operation.afterContent
        }))
      };
    },
    async apply(preview) { return { applied: true, preview, async undo() { return true; } }; }
  };
}

test("preview removes only generated annotations and interface member comments when disabled", async () => {
  const classBefore = "class Greeting {\r\n @Override\r\n public String toString() { return \"x\"; }\r\n public int id() { return 1; }\r\n}\r\n";
  const classAfter = "class Greeting implements Greeter {\r\n @Override\r\n public String toString() { return \"x\"; }\r\n @Override\r\n public int id() { return 1; }\r\n}\r\n";
  const interfaceAfter = "package demo;\r\n\r\npublic interface Greeter {\r\n /**\r\n  * Returns the id.\r\n  */\r\n int id();\r\n}\r\n";
  const operations = [
    { type: "modify", path: "C:/workspace/Greeting.java", beforeContent: classBefore, afterContent: classAfter, snapshot: { isDirty: true } },
    { type: "modify", path: "C:/workspace/Greeter.java", beforeContent: "", afterContent: interfaceAfter, snapshot: { isDirty: false } }
  ];
  const adapter = loadFactory()({
    getActiveEditorPath: () => "C:/workspace/Greeting.java",
    getWorkspaceEditPreview: () => createPreviewService(operations)
  });
  const preview = await adapter.prepare({ changes: {} }, {
    interfaceName: "Greeter",
    generateOverrideAnnotations: false,
    generateMethodComments: false
  });

  assert.equal((preview.operations[0].afterContent.match(/@Override/g) || []).length, 1);
  assert.match(preview.operations[0].afterContent, /toString/);
  assert.doesNotMatch(preview.operations[1].afterContent, /Returns the id/);
  assert.match(preview.operations[1].afterContent, /int id\(\);/);
  assert.equal(preview.summary[0].after, preview.operations[0].afterContent);
  assert.equal(preview.summary[1].after, preview.operations[1].afterContent);
});

test("preview preserves generated content when options are checked and rejects dirty secondary tabs", async () => {
  const operations = [{
    type: "modify",
    path: "C:/workspace/Other.java",
    beforeContent: "class Other {}",
    afterContent: "class Other { Greeter value; }",
    snapshot: { isDirty: true }
  }];
  const adapter = loadFactory()({
    getActiveEditorPath: () => "C:/workspace/Greeting.java",
    getWorkspaceEditPreview: () => createPreviewService(operations)
  });
  await assert.rejects(
    adapter.prepare({ changes: {} }, { interfaceName: "Greeter", generateOverrideAnnotations: true, generateMethodComments: true }),
    /Save or discard unsaved changes/
  );
});

test("semantic references add only instanceof operands with qualified names where needed", async () => {
  const adapter = loadFactory()({});
  const sources = {
    "file:///C:/workspace/demo/Greeting.java": "package demo;\nclass Greeting { boolean test(Object o) { return o instanceof Greeting; } }\n",
    "file:///C:/workspace/client/Use.java": "package client;\nclass Use { boolean test(Object o) { return o instanceof Greeting; } }\n"
  };
  const references = Object.entries(sources).map(([uri, source]) => {
    const line = source.split("\n")[1];
    const character = line.lastIndexOf("Greeting");
    return { uri, range: { start: { line: 1, character }, end: { line: 1, character: character + 8 } } };
  });
  references.push({
    uri: "file:///C:/workspace/client/Use.java",
    range: { start: { line: 1, character: 6 }, end: { line: 1, character: 14 } }
  });

  const edits = await adapter.collectInstanceofEdits(references, {
    readUri: async (uri) => sources[uri],
    interfaceName: "Greeter",
    packageName: "demo",
    qualifiedName: "demo.Greeter"
  });
  assert.equal(edits["file:///C:/workspace/demo/Greeting.java"][0].newText, "Greeter");
  assert.equal(edits["file:///C:/workspace/client/Use.java"][0].newText, "demo.Greeter");
  assert.equal(edits["file:///C:/workspace/client/Use.java"].length, 1);
});

test("instanceof edits merge across files and overlapping edits fail safely", () => {
  const adapter = loadFactory()({});
  const uri = "file:///C:/workspace/Greeting.java";
  const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } };
  const workspaceEdit = { changes: { [uri]: [{ range, newText: "Greeter" }] } };
  assert.throws(() => adapter.mergeTextEdits(workspaceEdit, { [uri]: [{ range, newText: "Other" }] }), /overlapping/);

  const secondUri = "file:///C:/workspace/Use.java";
  adapter.mergeTextEdits(workspaceEdit, { [secondUri]: [{ range, newText: "Greeter" }] });
  assert.equal(workspaceEdit.changes[secondUri].length, 1);
});
