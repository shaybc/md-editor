const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function syntaxNode(name, from, to, children = []) {
  const node = { name, from, to, firstChild: children[0] || null, nextSibling: null };
  children.forEach((child, index) => { child.nextSibling = children[index + 1] || null; });
  return node;
}

function loadAdapter(fileName, registerName, tree) {
  const context = { window: {} };
  context.globalThis = context.window;
  vm.createContext(context);
  for (const relativePath of ["syntax-tree.js", `languages/${fileName}.js`]) {
    const source = fs.readFileSync(path.resolve(__dirname, `../resources/js/outline/${relativePath}`), "utf8");
    vm.runInContext(source, context, { filename: relativePath });
  }
  const syntaxTree = context.window.registerMarkdownViewerOutlineSyntaxTree({ registerModule() {} });
  return context.window[registerName]({ registerModule() {} }, {
    syntaxTree,
    getSyntaxTree() { return tree; },
    normalizeDocumentSymbols(symbols) { return symbols; }
  });
}

test("Markdown Outline builds heading hierarchy", async () => {
  const source = "# Project\n## Setup\n# Reference\n";
  const tree = { topNode: syntaxNode("Document", 0, source.length, [
    syntaxNode("ATXHeading1", 0, 9), syntaxNode("ATXHeading2", 10, 18), syntaxNode("ATXHeading1", 19, 30)
  ]) };
  const adapter = loadAdapter("markdown", "registerMarkdownViewerMarkdownOutlineLanguage", tree);
  const nodes = await adapter.parse(source);

  assert.equal(JSON.stringify(nodes.map((node) => node.name)), JSON.stringify(["Project", "Reference"]));
  assert.equal(nodes[0].children[0].name, "Setup");
});

test("JSON Outline nests object properties", async () => {
  const source = '{"scripts":{"build":"vite"},"name":"demo"}';
  const build = syntaxNode("Property", 12, 26, [syntaxNode("PropertyName", 12, 19)]);
  const scripts = syntaxNode("Property", 1, 27, [syntaxNode("PropertyName", 1, 10), syntaxNode("Object", 11, 27, [build])]);
  const name = syntaxNode("Property", 28, 41, [syntaxNode("PropertyName", 28, 34)]);
  const tree = { topNode: syntaxNode("JsonText", 0, source.length, [syntaxNode("Object", 0, source.length, [scripts, name])]) };
  const adapter = loadAdapter("json", "registerMarkdownViewerJsonOutlineLanguage", tree);
  assert.equal(adapter.supports("Untitled 1", { parseAsLanguageId: "json" }), true);
  assert.equal(adapter.supports("Untitled 1", { parseAsLanguageId: "yaml" }), false);
  const nodes = await adapter.parse(source);

  assert.equal(JSON.stringify(nodes.map((node) => node.name)), JSON.stringify(["scripts", "name"]));
  assert.equal(nodes[0].children[0].name, "build");
});

test("XML Outline follows element containment", async () => {
  const source = '<project id="demo"><group><item /></group></project>';
  const item = syntaxNode("SelfClosingTag", 26, 34);
  const group = syntaxNode("Element", 19, 42, [item]);
  const project = syntaxNode("Element", 0, source.length, [group]);
  const adapter = loadAdapter("xml", "registerMarkdownViewerXmlOutlineLanguage", { topNode: syntaxNode("Document", 0, source.length, [project]) });
  const nodes = await adapter.parse(source);

  assert.equal(nodes[0].name, "project");
  assert.equal(nodes[0].detail, "demo");
  assert.equal(nodes[0].children[0].children[0].name, "item");
});


test("XML Outline nests flat document symbols by range", () => {
  const source = '<books><book><title>Book name</title></book></books>';
  const adapter = loadAdapter("xml", "registerMarkdownViewerXmlOutlineLanguage", { topNode: syntaxNode("Document", 0, source.length) });
  const range = (startLine, startCharacter, endLine, endCharacter) => ({
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter }
  });
  const nodes = adapter.normalizeDocumentSymbols([
    { id: "books", name: "books", kind: "field", detail: "xml", range: range(0, 0, 0, 50), selectionRange: range(0, 1, 0, 6), children: [] },
    { id: "book", name: "book", kind: "field", detail: "books", range: range(0, 7, 0, 43), selectionRange: range(0, 8, 0, 12), children: [] },
    { id: "title", name: "title", kind: "field", detail: "book", range: range(0, 13, 0, 36), selectionRange: range(0, 14, 0, 19), children: [] }
  ], source);

  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].name, "books");
  assert.equal(nodes[0].children[0].name, "book");
  assert.equal(nodes[0].children[0].children[0].name, "title");
});

test("XML Outline uses source tree over flat XML document symbols", () => {
  const source = [
    '<?xml version="1.0"?>',
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">',
    '  <xs:element name="books">',
    '    <xs:complexType>',
    '      <xs:sequence>',
    '        <xs:element name="title" type="xs:string" />',
    '      </xs:sequence>',
    '    </xs:complexType>',
    '  </xs:element>',
    '</xs:schema>'
  ].join('\n');
  const adapter = loadAdapter("xml", "registerMarkdownViewerXmlOutlineLanguage", null);
  const range = (startLine, startCharacter, endLine, endCharacter) => ({
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter }
  });
  const nodes = adapter.normalizeDocumentSymbols([
    { name: "xs:schema", kind: 8, detail: "xml", range: range(1, 0, 9, 12), selectionRange: range(1, 1, 1, 10), children: [] },
    { name: "xs:element", kind: 8, detail: "xs:schema", range: range(2, 2, 8, 15), selectionRange: range(2, 3, 2, 13), children: [] }
  ], source);

  assert.equal(nodes[0].kind, "element");
  assert.equal(nodes[0].name, "xs:schema");
  assert.equal(nodes[0].children[0].name, "xs:element");
  assert.equal(nodes[0].children[0].detail, "books");
  assert.equal(nodes[0].children[0].children[0].children[0].children[0].detail, "title");
});
test("CSS Outline captures selectors and nested at-rules", async () => {
  const source = "@media screen {.card { color: red; }}";
  const rule = syntaxNode("RuleSet", 15, 36);
  const media = syntaxNode("MediaStatement", 0, source.length, [rule]);
  const adapter = loadAdapter("css", "registerMarkdownViewerCssOutlineLanguage", { topNode: syntaxNode("StyleSheet", 0, source.length, [media]) });
  const nodes = await adapter.parse(source);

  assert.equal(nodes[0].name, "@media screen");
  assert.equal(nodes[0].children[0].name, ".card");
});

test("JavaScript Outline captures classes, methods, and callable variables", async () => {
  const source = "class App { render() {} }\nconst start = () => {};";
  const method = syntaxNode("MethodDeclaration", 12, 23);
  const classNode = syntaxNode("ClassDeclaration", 0, 25, [method]);
  const variable = syntaxNode("VariableDeclaration", 26, source.length);
  const adapter = loadAdapter("javascript", "registerMarkdownViewerJavaScriptOutlineLanguage", {
    topNode: syntaxNode("Script", 0, source.length, [classNode, variable])
  });
  const nodes = await adapter.parse(source);

  assert.equal(JSON.stringify(nodes.map((node) => `${node.kind}:${node.name}`)), JSON.stringify(["class:App", "function:start"]));
  assert.equal(nodes[0].children[0].name, "render");
});

test("Python Outline captures nested classes and functions", async () => {
  const source = "class App:\n    async def run(self):\n        pass\n";
  const method = syntaxNode("FunctionDefinition", 15, source.length);
  const classNode = syntaxNode("ClassDefinition", 0, source.length, [method]);
  const adapter = loadAdapter("python", "registerMarkdownViewerPythonOutlineLanguage", {
    topNode: syntaxNode("Script", 0, source.length, [classNode])
  });
  const nodes = await adapter.parse(source);

  assert.equal(nodes[0].name, "App");
  assert.equal(nodes[0].children[0].name, "run");
  assert.equal(nodes[0].children[0].detail, "async function");
});

test("YAML Outline nests mapping keys", async () => {
  const source = "github:\n  homepage: https://example.com\n  labels:\n    - one\n";
  const homepage = syntaxNode("Pair", 10, 39, [syntaxNode("Key", 10, 18)]);
  const labels = syntaxNode("Pair", 42, source.length, [syntaxNode("Key", 42, 48)]);
  const github = syntaxNode("Pair", 0, source.length, [syntaxNode("Key", 0, 6), syntaxNode("BlockMapping", 10, source.length, [homepage, labels])]);
  const adapter = loadAdapter("yaml", "registerMarkdownViewerYamlOutlineLanguage", {
    topNode: syntaxNode("Stream", 0, source.length, [syntaxNode("Document", 0, source.length, [github])])
  });
  const nodes = await adapter.parse(source);

  assert.equal(nodes[0].name, "github");
  assert.equal(JSON.stringify(nodes[0].children.map((node) => node.name)), JSON.stringify(["homepage", "labels"]));
});

test("YAML Outline highlights Kubernetes manifest fields", async () => {
  const source = "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: app\nspec:\n  replicas: 2\n";
  const apiVersion = syntaxNode("Pair", 0, 19, [syntaxNode("Key", 0, 10)]);
  const kind = syntaxNode("Pair", 20, 36, [syntaxNode("Key", 20, 24)]);
  const metadataName = syntaxNode("Pair", 49, 58, [syntaxNode("Key", 49, 53)]);
  const metadata = syntaxNode("Pair", 37, 58, [syntaxNode("Key", 37, 45), syntaxNode("BlockMapping", 49, 58, [metadataName])]);
  const replicas = syntaxNode("Pair", 66, source.length, [syntaxNode("Key", 66, 74)]);
  const spec = syntaxNode("Pair", 59, source.length, [syntaxNode("Key", 59, 63), syntaxNode("BlockMapping", 66, source.length, [replicas])]);
  const adapter = loadAdapter("yaml", "registerMarkdownViewerYamlOutlineLanguage", {
    topNode: syntaxNode("Stream", 0, source.length, [syntaxNode("Document", 0, source.length, [apiVersion, kind, metadata, spec])])
  });
  const nodes = await adapter.parse(source);

  assert.equal(JSON.stringify(nodes.map((node) => node.name)), JSON.stringify(["apiVersion", "kind", "metadata", "spec"]));
  assert.equal(nodes.find((node) => node.name === "kind")?.detail, "Deployment");
  assert.equal(nodes.find((node) => node.name === "metadata")?.children[0]?.name, "metadata.name");
  assert.equal(nodes.find((node) => node.name === "metadata")?.children[0]?.detail, "resource name");
  assert.equal(nodes.find((node) => node.name === "spec")?.detail, "resource spec");
});
test("HTML Outline follows element containment", async () => {
  const source = '<html><body><main id="app"><section></section></main></body></html>';
  const section = syntaxNode("Element", 27, 46);
  const main = syntaxNode("Element", 12, 53, [section]);
  const body = syntaxNode("Element", 6, 60, [main]);
  const html = syntaxNode("Element", 0, source.length, [body]);
  const adapter = loadAdapter("html", "registerMarkdownViewerHtmlOutlineLanguage", {
    topNode: syntaxNode("Document", 0, source.length, [html])
  });
  const nodes = await adapter.parse(source);

  assert.equal(nodes[0].name, "html");
  assert.equal(nodes[0].children[0].children[0].name, "main");
  assert.equal(nodes[0].children[0].children[0].detail, "app");
});

test("Batch Outline extracts labels and ignores double-colon comments", async () => {
  const source = "@echo off\n:: setup comment\n:init\necho ready\ngoto error\n:error\nexit /b 1\n";
  const adapter = loadAdapter("batch", "registerMarkdownViewerBatchOutlineLanguage", {
    topNode: syntaxNode("Document", 0, source.length)
  });
  const nodes = await adapter.parse(source);

  assert.equal(JSON.stringify(nodes.map((node) => node.name)), JSON.stringify(["init", "error"]));
  assert.equal(nodes[0].kind, "label");
});
