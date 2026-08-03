const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadAnalysisFactory() {
  const context = { globalThis: null };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.resolve(
    __dirname,
    "../resources/js/editor/source-actions/languages/introduce-parameter-object/java-parameter-object-analysis.js"
  ), "utf8"), context);
  return context.createMarkdownViewerJavaParameterObjectAnalysis;
}

test("analysis maps multiline generic parameters to the selected method", () => {
  const factory = loadAnalysisFactory();
  const source = [
    "package demo;",
    "class Service {",
    "  public int save(",
    "      java.util.Map<String, Integer> values,",
    "      String label) {",
    "    return values.size() + label.length();",
    "  }",
    "}"
  ].join("\n");
  const declaration = factory._test.findMethodDeclaration(source, {
    methodName: "save",
    parameters: [
      { name: "values", type: "java.util.Map<String, Integer>" },
      { name: "label", type: "String" }
    ]
  }, source.indexOf("return values"));
  assert.equal(source.slice(declaration.nameStart, declaration.nameEnd), "save");
  assert.equal(declaration.parameterNameRanges.length, 2);
  assert.equal(source.slice(declaration.parameterNameRanges[0].start, declaration.parameterNameRanges[0].end), "values");
  assert.equal(declaration.owner.name, "Service");
});

test("analysis requests change-signature metadata plus semantic method and parameter references", async () => {
  const factory = loadAnalysisFactory();
  const source = "package demo;\nclass Service {\n  int save(String label, int id) { return label.length() + id; }\n}\n";
  const methods = [];
  const requestClient = {
    async request(_transport, method) {
      methods.push(method);
      if (method === "java/getChangeSignatureInfo") {
        return {
          methodIdentifier: "=demo<Service~save~QString;~I",
          modifier: "package",
          returnType: "int",
          methodName: "save",
          parameters: [
            { type: "String", name: "label", originalIndex: 0 },
            { type: "int", name: "id", originalIndex: 1 }
          ],
          exceptions: []
        };
      }
      return [];
    }
  };
  const service = factory({ requestClient, readUri: async () => source });
  const cursor = factory._test.offsetToPosition(source, source.indexOf("save("));
  const analysis = await service.analyze({
    source,
    fileUri: "file:///workspace/Service.java",
    transport: {},
    codeActionParams: {
      textDocument: { uri: "file:///workspace/Service.java" },
      range: { start: cursor, end: cursor },
      context: { diagnostics: [] }
    }
  });
  assert.equal(analysis.methodName, "save");
  assert.equal(analysis.parameters.length, 2);
  assert.deepEqual(methods, [
    "java/getChangeSignatureInfo",
    "textDocument/references",
    "textDocument/references",
    "textDocument/references"
  ]);
});
