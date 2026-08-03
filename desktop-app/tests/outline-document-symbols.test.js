const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadNormalizer() {
  const context = { window: {} };
  context.globalThis = context.window;
  vm.createContext(context);
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/outline/document-symbols.js"), "utf8");
  vm.runInContext(source, context, { filename: "document-symbols.js" });
  return context.window.registerMarkdownViewerOutlineDocumentSymbols({ registerModule() {} });
}

test("Outline document symbols preserve hierarchy, details, and LSP kinds", () => {
  const normalizer = loadNormalizer();
  const range = { start: { line: 2, character: 1 }, end: { line: 5, character: 1 } };
  const nodes = normalizer.normalize([{
    name: "Widget", detail: "exported", kind: 5, range,
    children: [{ name: "render", kind: 6, range }]
  }]);

  assert.equal(nodes[0].kind, "class");
  assert.equal(nodes[0].detail, "exported");
  assert.equal(nodes[0].children[0].kind, "method");
  assert.match(nodes[0].id, /^lsp:0:class:2:1:Widget$/);
});

test("Outline document symbols accept flat SymbolInformation locations", () => {
  const normalizer = loadNormalizer();
  const range = { start: { line: 4, character: 3 }, end: { line: 4, character: 8 } };
  const nodes = normalizer.normalize([{ name: "value", containerName: "Config", kind: 7, location: { range } }]);

  assert.equal(nodes[0].kind, "property");
  assert.equal(nodes[0].detail, "Config");
  assert.equal(JSON.stringify(nodes[0].selectionRange), JSON.stringify(range));
});
