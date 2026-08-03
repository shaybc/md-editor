const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadModules() {
  const context = { globalThis: null, structuredClone };
  context.globalThis = context;
  [
    "../resources/js/editor/source-actions/languages/introduce-parameter-object/java-parameter-object-model.js",
    "../resources/js/editor/source-actions/languages/introduce-parameter-object/java-parameter-object-analysis.js",
    "../resources/js/editor/source-actions/languages/introduce-parameter-object/java-introduce-parameter-object-workspace-edit.js"
  ].forEach((relative) => vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, relative), "utf8"), context));
  return context;
}

function rangeAt(tools, source, offset, length) {
  return {
    start: tools.offsetToPosition(source, offset),
    end: tools.offsetToPosition(source, offset + length)
  };
}

function applyEdits(tools, source, edits) {
  const replacements = edits.map((edit) => ({
    start: tools.positionToOffset(source, edit.range.start),
    end: tools.positionToOffset(source, edit.range.end),
    text: edit.newText
  })).sort((left, right) => right.start - left.start);
  return replacements.reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
}

function createAnalysis(context) {
  const tools = context.createMarkdownViewerJavaParameterObjectAnalysis._test;
  const source = [
    "package demo;",
    "public class Service {",
    "  public int save(String label, int id) {",
    "    return label.length() + id;",
    "  }",
    "  int use() { return save(\"a\", 3); }",
    "}"
  ].join("\n");
  const changeInfo = {
    methodName: "save",
    returnType: "int",
    modifier: "public",
    parameters: [
      { type: "String", name: "label", originalIndex: 0 },
      { type: "int", name: "id", originalIndex: 1 }
    ]
  };
  const declaration = tools.findMethodDeclaration(source, changeInfo, source.indexOf("return label"));
  const invocationName = source.lastIndexOf("save(");
  const invocationClose = source.indexOf(")", invocationName);
  const labelUse = source.indexOf("label.length");
  const idUse = source.indexOf("id;", labelUse);
  const fileUri = "file:///workspace/Service.java";
  return {
    changeInfo,
    declaration,
    fileUri,
    imports: "",
    isConstructor: false,
    isStatic: false,
    methodName: "save",
    methodReferences: [
      { uri: fileUri, range: rangeAt(tools, source, declaration.start, 6) },
      { uri: fileUri, range: rangeAt(tools, source, invocationName, invocationClose - invocationName + 1) }
    ],
    owner: declaration.owner,
    packageName: "demo",
    parameterReferences: {
      0: [{ uri: fileUri, range: rangeAt(tools, source, labelUse, 5) }],
      1: [{ uri: fileUri, range: rangeAt(tools, source, idUse, 2) }]
    },
    parameters: changeInfo.parameters.map((parameter, index) => ({
      ...parameter,
      declarationRange: declaration.parameterRanges[index],
      nameRange: declaration.parameterNameRanges[index]
    })),
    returnType: "int",
    source,
    sources: { [fileUri]: source },
    visibility: "public"
  };
}

test("workspace edit creates a top-level parameter class and updates method plus caller", () => {
  const context = loadModules();
  const analysis = createAnalysis(context);
  const model = context.markdownViewerJavaParameterObjectModel.createModel(analysis);
  const adapter = context.createMarkdownViewerJavaIntroduceParameterObjectWorkspaceEdit({
    getActiveEditorPath: () => "C:/workspace/Service.java",
    toFileUri: (filePath) => `file:///${filePath.replace(/^C:\//, "")}`
  });
  const edit = adapter.buildWorkspaceEdit(analysis, model);
  assert.equal(edit.documentChanges[0].kind, "create");
  assert.match(edit.documentChanges[1].edits[0].newText, /public class ServiceParameter/);
  assert.match(edit.documentChanges[1].edits[0].newText, /public String getLabel\(\)/);
  const sourceChange = edit.documentChanges.find((change) => change.textDocument?.uri === analysis.fileUri);
  const transformed = applyEdits(context.createMarkdownViewerJavaParameterObjectAnalysis._test, analysis.source, sourceChange.edits);
  assert.match(transformed, /save\(ServiceParameter parameterObject\)/);
  assert.match(transformed, /parameterObject\.getLabel\(\)\.length\(\) \+ parameterObject\.getId\(\)/);
  assert.match(transformed, /save\(new ServiceParameter\("a", 3\)\)/);
});

test("workspace edit can retain a deprecated delegate and generate a nested class", () => {
  const context = loadModules();
  const analysis = createAnalysis(context);
  const model = context.markdownViewerJavaParameterObjectModel.createModel(analysis);
  model.destination = "nested";
  model.keepDelegate = true;
  model.deprecateDelegate = true;
  const adapter = context.createMarkdownViewerJavaIntroduceParameterObjectWorkspaceEdit({
    getActiveEditorPath: () => "C:/workspace/Service.java",
    toFileUri: () => ""
  });
  const edit = adapter.buildWorkspaceEdit(analysis, model);
  assert.equal(edit.documentChanges.some((change) => change.kind === "create"), false);
  const sourceChange = edit.documentChanges.find((change) => change.textDocument?.uri === analysis.fileUri);
  const transformed = applyEdits(context.createMarkdownViewerJavaParameterObjectAnalysis._test, analysis.source, sourceChange.edits);
  assert.match(transformed, /@Deprecated\s+public int save\(String label, int id\)/);
  assert.match(transformed, /return save\(new ServiceParameter\(label, id\)\);/);
  assert.match(transformed, /\n  public static class ServiceParameter/);
});
