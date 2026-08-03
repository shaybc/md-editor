const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/java-provider.js");

function loadProvider(responses) {
  const context = { console, window: {} };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const calls = [];
  let openDiagnosticCalls = 0;
  const diagnostic = {
    uri: "file:///C:/Project/Demo.java",
    range: { start: { line: 1, character: 2 }, end: { line: 1, character: 8 } },
    lspDiagnostic: { message: "Widget cannot be resolved", code: 1 }
  };
  const provider = context.registerMarkdownViewerJavaQuickFixProvider({ registerModule() {} }, {
    diagnosticStore: { findMatchingDiagnostic: () => diagnostic },
    openDiagnostic: async () => { openDiagnosticCalls += 1; },
    getDocumentContext: async () => ({ fileUri: diagnostic.uri, transport: {} }),
    requestClient: {
      async request(_transport, method, params) {
        calls.push({ method, params });
        return responses[method];
      }
    }
  });
  return { calls, diagnostic, provider, getOpenDiagnosticCalls: () => openDiagnosticCalls };
}

test("Java provider sends the exact diagnostic and quickfix-only context", async () => {
  const edit = { changes: { "file:///C:/Project/Demo.java": [] } };
  const harness = loadProvider({
    "textDocument/codeAction": [
      { title: "Second", kind: "quickfix", edit },
      { title: "Preferred", kind: "quickfix", isPreferred: true, edit },
      { title: "Second", kind: "quickfix", edit }
    ]
  });

  const result = await harness.provider.getActions({ filePath: "C:/Project/Demo.java" });

  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls[0].params)), {
    textDocument: { uri: harness.diagnostic.uri },
    range: harness.diagnostic.range,
    context: {
      diagnostics: [harness.diagnostic.lspDiagnostic],
      only: ["quickfix"]
    }
  });
  assert.deepEqual(Array.from(result.actions, (action) => action.title), ["Preferred", "Second"]);
  assert.equal(result.actions[0].provenance, "JDT");
});

test("lazy actions resolve only when selected and opaque commands stay unavailable", async () => {
  const edit = { changes: { "file:///C:/Project/Demo.java": [] } };
  const harness = loadProvider({
    "textDocument/codeAction": [
      { title: "Lazy", kind: "quickfix", data: { id: 4 } },
      { title: "Opaque", command: { command: "java.unknown" } }
    ],
    "codeAction/resolve": { title: "Lazy", kind: "quickfix", edit }
  });

  const result = await harness.provider.getActions({ filePath: "C:/Project/Demo.java" });
  assert.equal(harness.calls.length, 1);
  assert.equal(result.actions[0].needsResolve, true);
  assert.equal(result.actions[1].disabledReason, "This server command cannot be previewed safely.");

  const resolved = await harness.provider.resolveAction(result.actions[0]);
  assert.equal(harness.calls[1].method, "codeAction/resolve");
  assert.deepEqual(resolved.workspaceEdit, edit);
});


test("Java provider can request hover actions without reopening the active document", async () => {
  const harness = loadProvider({ "textDocument/codeAction": [] });

  await harness.provider.getActions({ filePath: "C:/Project/Demo.java" }, { ensureDocumentOpen: false });

  assert.equal(harness.getOpenDiagnosticCalls(), 0);
  assert.equal(harness.calls[0].method, "textDocument/codeAction");
});
