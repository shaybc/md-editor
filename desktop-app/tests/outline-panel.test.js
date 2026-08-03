const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function loadPanel(overrides = {}) {
  const context = { window: { setTimeout, clearTimeout }, console, setTimeout, clearTimeout };
  context.globalThis = context.window;
  vm.createContext(context);
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/outline/panel.js"), "utf8");
  vm.runInContext(source, context, { filename: "panel.js" });
  const lowerPanel = {
    registerView() {},
    isEnabled() { return true; },
    setEnabled(_id, visible) { return visible; }
  };
  const language = {
    supports(filePath) { return filePath.endsWith(".java"); },
    parse() { return [{ id: "local", name: "Local", kind: "class", children: [] }]; },
    normalizeDocumentSymbols(symbols) { return symbols.map((symbol) => ({ ...symbol, id: `lsp:${symbol.name}`, kind: "class", children: [] })); }
  };
  const api = context.window.registerMarkdownViewerOutlinePanel({ registerModule() {} }, {
    lowerPanel,
    panel: null,
    body: null,
    toggleButtons: [],
    languages: [language],
    getActiveEditorValue() { return "class Example {}"; },
    ...overrides
  });
  return { api, language };
}

test("Outline panel prefers available LSP document symbols", async () => {
  const { api } = loadPanel({
    async getDocumentSymbols() { return [{ name: "FromLsp" }]; }
  });
  const nodes = await api.refresh({ sourceFilePath: "C:/Project/Example.java" });

  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].id, "lsp:FromLsp");
});

test("Outline panel falls back to the language parser when LSP is unavailable", async () => {
  const { api } = loadPanel({
    async getDocumentSymbols() { throw new Error("starting"); }
  });
  const nodes = await api.refresh({ sourceFilePath: "C:/Project/Example.java" });

  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].id, "local");
});

test("Outline panel does not request document symbols while hidden", async () => {
  let documentSymbolRequests = 0;
  const { api } = loadPanel({
    lowerPanel: {
      registerView() {},
      isEnabled() { return false; },
      setEnabled(_id, visible) { return visible; }
    },
    async getDocumentSymbols() {
      documentSymbolRequests += 1;
      return [{ name: "Hidden" }];
    }
  });

  const nodes = await api.refresh({ sourceFilePath: "C:/Project/Example.java" });

  assert.equal(nodes.length, 0);
  assert.equal(documentSymbolRequests, 0);
});

test("Outline panel supports registered non-Java language adapters", async () => {
  const markdown = {
    supports(filePath) { return filePath.endsWith(".md"); },
    parse() { return [{ id: "heading", name: "Overview", kind: "heading", children: [] }]; },
    normalizeDocumentSymbols(symbols) { return symbols; }
  };
  const { api } = loadPanel({ languages: [markdown] });

  assert.equal(api.supports({ sourceFilePath: "C:/Project/README.md" }), true);
  assert.equal(api.supports({ sourceFilePath: "C:/Project/image.png" }), false);
  const nodes = await api.refresh({ sourceFilePath: "C:/Project/README.md" }, { localOnly: true });
  assert.equal(nodes[0].name, "Overview");
});

test("Outline panel discards a stale asynchronous symbol response", async () => {
  const first = deferred();
  const second = deferred();
  let request = 0;
  const { api } = loadPanel({
    getDocumentSymbols() { return (++request === 1 ? first : second).promise; }
  });
  const staleRefresh = api.refresh({ sourceFilePath: "C:/Project/First.java" });
  const currentRefresh = api.refresh({ sourceFilePath: "C:/Project/Second.java" });
  second.resolve([{ name: "Second" }]);
  const currentNodes = await currentRefresh;
  first.resolve([{ name: "First" }]);
  const staleNodes = await staleRefresh;

  assert.equal(currentNodes[0].name, "Second");
  assert.equal(staleNodes.length, 0);
});
