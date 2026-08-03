const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const sourcePath = path.resolve(__dirname, "../resources/js/editor/source-actions/languages/java.js");
const requestSourcePath = path.resolve(__dirname, "../resources/js/lsp/request-client.js");

function loadModule() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const context = {
    console,
    setTimeout,
    clearTimeout,
    window: {}
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(requestSourcePath, "utf8"), context, { filename: "request-client.js" });
  vm.runInNewContext(source, context, { filename: "java-source-actions.js" });
  return {
    registerActions: context.window.registerMarkdownViewerJavaSourceActions,
    registerRequestClient: context.window.registerMarkdownViewerLspRequestClient
  };
}

function createTransport(responseFactory) {
  const subscribers = new Set();
  const sent = [];
  return {
    sent,
    send(message) {
      const payload = JSON.parse(message);
      sent.push(payload);
      const response = responseFactory?.(payload);
      if (response) {
        setTimeout(() => {
          subscribers.forEach((handler) => handler(JSON.stringify(response)));
        }, 0);
      }
    },
    subscribe(handler) {
      subscribers.add(handler);
    },
    unsubscribe(handler) {
      subscribers.delete(handler);
    }
  };
}

function createRegistry() {
  return {
    normalizeLocalPath(value) {
      return String(value || "").replace(/\\/g, "/");
    },
    getServerForLanguage(languageId) {
      return languageId === "java" ? { id: "java" } : null;
    },
    toFileUri(value) {
      return `file:///${String(value || "").replace(/\\/g, "/")}`;
    }
  };
}

function createSelectionView(text, from, to) {
  const value = String(text || "");
  const lineStarts = [0];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\n") lineStarts.push(index + 1);
  }
  return {
    state: {
      selection: { main: { from, to, anchor: from, head: to, empty: from === to } },
      doc: {
        lineAt(offset) {
          const position = Math.max(0, Math.min(Number(offset) || 0, value.length));
          let lineIndex = 0;
          while (lineIndex + 1 < lineStarts.length && lineStarts[lineIndex + 1] <= position) lineIndex += 1;
          const lineStart = lineStarts[lineIndex];
          const lineEnd = lineIndex + 1 < lineStarts.length ? lineStarts[lineIndex + 1] - 1 : value.length;
          return { number: lineIndex + 1, from: lineStart, to: lineEnd, length: lineEnd - lineStart };
        }
      }
    }
  };
}

function createActions(options = {}) {
  const loaded = loadModule();
  const modules = {};
  let sourceActionProvider = null;
  modules.sourceActions = {
    registerProvider(provider) { sourceActionProvider = provider; return provider; }
  };
  const app = {
    modules,
    registerModule(name, api) {
      modules[name] = api;
    }
  };
  const requestClient = loaded.registerRequestClient(app, { requestTimeoutMs: options.requestTimeoutMs || 50 });
  const alerts = [];
  const appliedEdits = [];
  let selectedFormatCalls = 0;
  const value = options.value || [
    "package demo;",
    "",
    "import java.util.List;",
    "import java.util.Map;",
    "",
    "class Demo {}",
    ""
  ].join("\n");
  const transport = options.transport || createTransport((request) => ({
    jsonrpc: "2.0",
    id: request.id,
    result: [
      {
        title: "Organize Imports",
        kind: "source.organizeImports",
        edit: {
          changes: {
            "file:///C:/Project/src/Demo.java": [
              {
                range: {
                  start: { line: 2, character: 0 },
                  end: { line: 3, character: 0 }
                },
                newText: ""
              }
            ]
          }
        }
      }
    ]
  }));
  const editor = {
    getLspDocumentContext() {
      return options.documentContext === undefined
        ? {
          fileUri: "file:///C:/Project/src/Demo.java",
          languageId: "java",
          transport
        }
        : options.documentContext;
    },
    refreshLspSessionForActivePath() {
      return Promise.resolve(false);
    },
    getView() {
      return options.view || null;
    },
    canFormatSelectedLines() {
      const selection = options.view?.state?.selection?.main;
      return !!selection && selection.to > selection.from;
    },
    async formatSelectedLines() {
      selectedFormatCalls += 1;
      return options.formatSelectedResult !== false;
    },
    applyLspTextEdits(edits) {
      appliedEdits.push(...edits);
      return options.applyResult !== false;
    }
  };
  const api = loaded.registerActions(app, {
    languageRegistry: {
      resolveLanguageForPath(filePath) {
        return /\.java$/i.test(filePath) ? { id: "java", codeMirrorLanguage: "java" } : { id: "text", codeMirrorLanguage: "text" };
      }
    },
    lspServerRegistry: createRegistry(),
    getActiveEditorPath: () => options.path || "C:/Project/src/Demo.java",
    getActiveEditorValue: () => value,
    getActiveCodeMirrorEditor: () => editor,
    getLspSession: () => Promise.resolve(null),
    alertUser: (message) => alerts.push(String(message || "")),
    requestClient,
    requestTimeoutMs: options.requestTimeoutMs || 50
  });
  return { api, alerts, appliedEdits, getSelectedFormatCalls: () => selectedFormatCalls, sourceActionProvider, transport };
}

test("Java source action requests JDT organize imports and applies current-file import edits", async () => {
  const { api, alerts, appliedEdits, transport } = createActions();

  const result = await api.organizeImportsForActiveEditor();

  assert.equal(result.applied, true);
  assert.equal(alerts.length, 0);
  assert.equal(appliedEdits.length, 1);
  assert.equal(transport.sent.length, 1);
  assert.equal(transport.sent[0].method, "textDocument/codeAction");
  assert.deepEqual(transport.sent[0].params.context.only, ["source.organizeImports"]);
  assert.equal(transport.sent[0].params.textDocument.uri, "file:///C:/Project/src/Demo.java");
});

test("Java source action is only offered for local Java files", () => {
  const { api } = createActions({ path: "C:/Project/src/Demo.java" });
  const nonJava = createActions({ path: "C:/Project/src/readme.md" });

  assert.equal(api.canOrganizeImportsForActiveEditor(), true);
  assert.equal(nonJava.api.canOrganizeImportsForActiveEditor(), false);
});

test("Java Source submenu offers Format Selected only for a non-empty selection", () => {
  const value = "class Demo {\n  void run() {}\n}\n";
  const from = value.indexOf("void");
  const selected = createActions({ value, view: createSelectionView(value, from, from + 4) });
  const collapsed = createActions({ value, view: createSelectionView(value, from, from) });

  assert.deepEqual(Array.from(selected.sourceActionProvider.getAvailableActions(), (action) => action.id), [
    "format-file",
    "format-selected",
    "organize-imports"
  ]);
  assert.deepEqual(Array.from(collapsed.sourceActionProvider.getAvailableActions(), (action) => action.id), [
    "format-file",
    "organize-imports"
  ]);
});

test("Format Selected delegates to the active CodeMirror selected-line formatter", async () => {
  const value = "class Demo {\n  void first(){System.out.println(1);}\n}";
  const from = value.indexOf("void first");
  const to = value.indexOf("\n", from) + 1;
  const { api, alerts, getSelectedFormatCalls, transport } = createActions({
    value,
    view: createSelectionView(value, from, to)
  });

  assert.equal(await api.formatSelectedEditor(), true);
  assert.equal(alerts.length, 0);
  assert.equal(getSelectedFormatCalls(), 1);
  assert.equal(transport.sent.length, 0);
});

test("Java source action rejects workspace edits for other files", async () => {
  const transport = createTransport((request) => ({
    jsonrpc: "2.0",
    id: request.id,
    result: [
      {
        title: "Organize Imports",
        kind: "source.organizeImports",
        edit: {
          changes: {
            "file:///C:/Project/src/Other.java": [
              {
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 0 }
                },
                newText: ""
              }
            ]
          }
        }
      }
    ]
  }));
  const { api, alerts, appliedEdits } = createActions({ transport });

  const result = await api.organizeImportsForActiveEditor();

  assert.equal(result.applied, false);
  assert.equal(result.reason, "error");
  assert.equal(appliedEdits.length, 0);
  assert.match(alerts[0], /another file/);
});

test("Java source action rejects edits outside the import block", async () => {
  const transport = createTransport((request) => ({
    jsonrpc: "2.0",
    id: request.id,
    result: [
      {
        title: "Organize Imports",
        kind: "source.organizeImports",
        edit: {
          changes: {
            "file:///C:/Project/src/Demo.java": [
              {
                range: {
                  start: { line: 5, character: 0 },
                  end: { line: 5, character: 5 }
                },
                newText: "final class"
              }
            ]
          }
        }
      }
    ]
  }));
  const { api, alerts, appliedEdits } = createActions({ transport });

  const result = await api.organizeImportsForActiveEditor();

  assert.equal(result.applied, false);
  assert.equal(result.reason, "error");
  assert.equal(appliedEdits.length, 0);
  assert.match(alerts[0], /outside the import block/);
});

test("Java source action reports command-only organize imports responses", async () => {
  const transport = createTransport((request) => ({
    jsonrpc: "2.0",
    id: request.id,
    result: [
      {
        title: "Organize Imports",
        kind: "source.organizeImports",
        command: { command: "java.edit.organizeImports" }
      }
    ]
  }));
  const { api, alerts, appliedEdits } = createActions({ transport });

  const result = await api.organizeImportsForActiveEditor();

  assert.equal(result.applied, false);
  assert.equal(result.reason, "no-edit");
  assert.equal(appliedEdits.length, 0);
  assert.match(alerts[0], /did not return an editable/);
});

test("Java source action reports LSP timeout without applying edits", async () => {
  const transport = createTransport(() => null);
  const { api, alerts, appliedEdits } = createActions({ transport, requestTimeoutMs: 5 });

  const result = await api.organizeImportsForActiveEditor();

  assert.equal(result.applied, false);
  assert.equal(result.reason, "error");
  assert.equal(appliedEdits.length, 0);
  assert.match(alerts[0], /did not respond/);
});
