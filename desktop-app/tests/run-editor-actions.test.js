const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("Java editor exposes Run main only when the active source declares main", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/run/run-editor-actions.js"), "utf8");
  const context = { window: {}, globalThis: {} };
  vm.runInNewContext(source, context);
  let provider;
  const calls = [];
  context.window.registerMarkdownViewerRunEditorActions({ registerModule() {} }, {
    sourceActions: { registerProvider(value) { provider = value; } },
    mainClassFinder: {
      inspectSource(value, filePath) {
        return value.includes("static void main") ? { simpleName: path.basename(filePath, ".java") } : null;
      }
    },
    launcher: { runJavaFile(filePath) { calls.push(filePath); return Promise.resolve(true); } },
    getProjectPath: () => "C:/Project"
  });

  const activeTab = { sourceFilePath: "C:/Project/Main.java" };
  assert.deepEqual(Array.from(provider.getAvailableActions({ activeTab, source: "class Main {}" })), []);
  const actions = provider.getAvailableActions({ activeTab, source: "class Main { public static void main(String[] args) {} }" });
  assert.equal(actions[0].label, "Run Main.main()");
  assert.equal(actions[0].menu, "root");
  assert.equal(actions[0].run(), true);
  assert.deepEqual(calls, ["C:/Project/Main.java"]);
});
