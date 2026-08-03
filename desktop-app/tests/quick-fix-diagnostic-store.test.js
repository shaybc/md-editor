const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/diagnostic-store.js");

function createStore() {
  const context = { console, setTimeout, clearTimeout, window: {} };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  let serverListener = null;
  const collections = [];
  const app = { registerModule() {} };
  const store = context.registerMarkdownViewerQuickFixDiagnosticStore(app, {
    bridge: {
      subscribeServerMessages(listener) {
        serverListener = listener;
        return () => { serverListener = null; };
      }
    },
    registry: {
      fromFileUri(uri) {
        return uri === "file:///C:/Project/Demo.java" ? "C:/Project/Demo.java" : "";
      }
    },
    problemsPanel: {
      setDiagnosticCollection(owner, diagnostics, options) {
        collections.push({ owner, diagnostics, options });
      }
    }
  });
  return { collections, store, publish(event) { serverListener(event); } };
}

test("JDT publishDiagnostics retains the raw diagnostic and updates a transient collection", () => {
  const harness = createStore();
  const raw = {
    range: { start: { line: 2, character: 4 }, end: { line: 2, character: 13 } },
    severity: 1,
    code: { value: "123", target: "https://example.test/123" },
    message: "Widget cannot be resolved to a type",
    data: { problemId: 123 },
    tags: [1],
    relatedInformation: [{ message: "Related" }]
  };

  harness.publish({
    serverId: "java",
    message: JSON.stringify({
      method: "textDocument/publishDiagnostics",
      params: { uri: "file:///C:/Project/Demo.java", version: 7, diagnostics: [raw] }
    })
  });

  const diagnostic = harness.store.getAllDiagnostics()[0];
  assert.equal(diagnostic.filePath, "C:/Project/Demo.java");
  assert.equal(diagnostic.line, 3);
  assert.equal(diagnostic.column, 5);
  assert.equal(diagnostic.version, 7);
  assert.deepEqual(JSON.parse(JSON.stringify(diagnostic.lspDiagnostic)), raw);
  assert.equal(harness.collections[0].owner, "lsp:java:file:///C:/Project/Demo.java");
  assert.equal(harness.collections[0].options.persistent, false);
});

test("an empty JDT publication clears the URI collection", () => {
  const harness = createStore();

  harness.publish({
    serverId: "java",
    message: JSON.stringify({
      method: "textDocument/publishDiagnostics",
      params: { uri: "file:///C:/Project/Demo.java", diagnostics: [] }
    })
  });

  assert.equal(harness.store.getAllDiagnostics().length, 0);
  assert.equal(harness.collections[0].diagnostics.length, 0);
});


test("editor diagnostic lookup requires the exact URI, range, and message", () => {
  const harness = createStore();
  const range = { start: { line: 2, character: 4 }, end: { line: 2, character: 13 } };
  harness.publish({
    serverId: "java",
    message: JSON.stringify({
      method: "textDocument/publishDiagnostics",
      params: {
        uri: "file:///C:/Project/Demo.java",
        diagnostics: [{ range, severity: 1, message: "Widget cannot be resolved" }]
      }
    })
  });

  assert.equal(harness.store.findEditorDiagnostic({
    uri: "file:///C:/Project/Demo.java",
    range,
    message: "Widget cannot be resolved"
  })?.isLiveDiagnostic, true);
  assert.equal(harness.store.findEditorDiagnostic({
    uri: "file:///C:/Project/Demo.java",
    range,
    message: "A stale diagnostic"
  }), null);
});
