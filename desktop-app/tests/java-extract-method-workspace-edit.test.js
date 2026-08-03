const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadFactory() {
  const context = { console, structuredClone, window: {} };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../resources/js/editor/source-actions/languages/extract-method/java-extract-method-workspace-edit.js"), "utf8"), context);
  return context.createMarkdownViewerJavaExtractMethodWorkspaceEdit;
}

const fileUri = "file:///C:/workspace/Demo.java";
const activePath = "C:/workspace/Demo.java";
const before = "class Demo {\n  void run() {\n    work();\n  }\n}\n";
const inferredAfter = "class Demo {\n  void run() {\n    extracted();\n  }\n\n  private void extracted() {\n    work();\n  }\n}\n";

function refactor(overrides = {}) {
  const edits = overrides.edits || [
    { range: { start: { line: 2, character: 4 }, end: { line: 2, character: 11 } }, newText: "extracted();" },
    { range: { start: { line: 4, character: 0 }, end: { line: 4, character: 0 } }, newText: "\n  private void extracted() {\n    work();\n  }\n" }
  ];
  return {
    edit: overrides.edit || { changes: { [overrides.uri || fileUri]: edits } },
    command: overrides.command || { command: "java.action.rename", arguments: [{ uri: fileUri, offset: inferredAfter.indexOf("extracted"), length: 9 }] },
    errorMessage: overrides.errorMessage
  };
}

function createHarness() {
  const resolved = [];
  const applied = [];
  const service = {
    async resolve(action) {
      resolved.push(action);
      const serialized = JSON.stringify(action.workspaceEdit);
      const name = serialized.includes("calculate") ? "calculate" : "extracted";
      const after = inferredAfter.replace(/\bextracted(?=\s*\()/g, name);
      return { operations: [{ type: "modify", path: activePath, beforeContent: before, afterContent: after }], summary: [{ type: "modify", path: activePath, before, after }] };
    },
    async apply(preview) { applied.push(preview); return { applied: true, async undo() { return true; } }; }
  };
  const adapter = loadFactory()({ getActiveEditorPath: () => activePath, fromFileUri: () => activePath, getWorkspaceEditPreview: () => service });
  return { adapter, applied, resolved };
}

test("JDT rename metadata supplies the initial name, generated signature, and edit-local rename", async () => {
  const harness = createHarness();
  const initial = await harness.adapter.prepare(refactor(), { fileUri });
  assert.equal(initial.defaultMethodName, "extracted");
  assert.equal(initial.methodSignature, "private void extracted()");

  const renamed = await harness.adapter.prepare(refactor(), { fileUri, methodName: "calculate" });
  assert.equal(renamed.methodName, "calculate");
  assert.equal(renamed.methodSignature, "private void calculate()");
  assert.match(renamed.operations[0].afterContent, /calculate\(\)/);
  assert.equal(renamed.operations[0].beforeContent, before);
  const texts = harness.resolved.at(-1).workspaceEdit.changes[fileUri].map((edit) => edit.newText).join("\n");
  assert.match(texts, /calculate\(\)/);
  assert.doesNotMatch(texts, /extracted\(\)/);
  assert.equal((await harness.adapter.apply(renamed)).applied, true);
  assert.equal(harness.applied.length, 1);
});

test("safe options customize only the generated method declaration edit", async () => {
  const harness = createHarness();
  const signature = harness.adapter.customizeMethodSignature("private static void extracted()", "extracted", {
    methodName: "calculate",
    accessModifier: "protected",
    declareFinal: true,
    declareSynchronized: true
  });
  assert.equal(signature, "protected static final synchronized void calculate()");

  await harness.adapter.prepare(refactor(), {
    fileUri,
    methodName: "calculate",
    accessModifier: "protected",
    declareFinal: true,
    declareSynchronized: true,
    generateMethodComment: true
  });
  const workspaceEdit = harness.resolved.at(-1).workspaceEdit;
  const generatedTexts = workspaceEdit.changes[fileUri].map((edit) => edit.newText).join("\n");
  assert.match(generatedTexts, /protected final synchronized void calculate\(\)/);
  assert.match(generatedTexts, /\/\*\*\n\s*\* Extracted method\.\n\s*\*\//);
  assert.match(generatedTexts, /calculate\(\);/);
  assert.equal(workspaceEdit.changes[fileUri][0].range.start.line, 2);
});

test("Java method names reject keywords and malformed identifiers", async () => {
  const adapter = createHarness().adapter;
  await assert.rejects(adapter.prepare(refactor(), { fileUri, methodName: "class" }), /valid Java method name/);
  await assert.rejects(adapter.prepare(refactor(), { fileUri, methodName: "9method" }), /valid Java method name/);
});

test("empty, cross-file, overlapping, and missing-rename edits fail without application", async () => {
  for (const proposal of [
    refactor({ edit: { changes: { [fileUri]: [] } } }),
    refactor({ uri: "file:///C:/workspace/Other.java" }),
    refactor({ edits: [
      { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } }, newText: "extracted();" },
      { range: { start: { line: 1, character: 3 }, end: { line: 1, character: 8 } }, newText: "extracted();" }
    ] }),
    refactor({ command: { command: "other", arguments: [] } })
  ]) {
    const harness = createHarness();
    await assert.rejects(harness.adapter.prepare(proposal, { fileUri }), /empty|another file|overlapping|naming metadata/);
    assert.equal(harness.applied.length, 0);
  }
});

test("JDT error messages and stale active files are rejected", async () => {
  await assert.rejects(createHarness().adapter.prepare(refactor({ errorMessage: "Selection cannot be extracted" }), { fileUri }), /cannot be extracted/);
  const adapter = loadFactory()({ getActiveEditorPath: () => "C:/workspace/Other.java", fromFileUri: () => activePath, getWorkspaceEditPreview: () => ({}) });
  await assert.rejects(adapter.prepare(refactor(), { fileUri }), /stale/);
});
