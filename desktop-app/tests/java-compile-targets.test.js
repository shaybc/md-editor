const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadTargets(entries) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/java-compile-targets.js"), "utf8");
  const context = { window: {}, globalThis: {} };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerJavaCompileTargets({ registerModule() {} }, {
    Neutralino: { filesystem: { async readDirectory(folder) { return entries[folder] || []; } } }
  });
}

test("folder targets recursively include only Java files inside configured roots", async () => {
  const targets = loadTargets({
    "C:/Project/src": [{ entry: "main", type: "DIRECTORY" }, { entry: "README.md", type: "FILE" }],
    "C:/Project/src/main": [{ entry: "App.java", type: "FILE" }, { entry: "App.class", type: "FILE" }]
  });
  const files = await targets.resolve({ targetPath: "C:/Project/src", targetKind: "directory" }, ["C:/Project/src"]);
  assert.deepEqual(Array.from(files), ["C:/Project/src/main/App.java"]);
});

test("file targets reject non-Java and out-of-root paths", async () => {
  const targets = loadTargets({});
  assert.deepEqual(Array.from(await targets.resolve({ filePath: "C:/Project/src/App.java", targetKind: "file" }, ["C:/Project/src"])), ["C:/Project/src/App.java"]);
  assert.deepEqual(Array.from(await targets.resolve({ filePath: "C:/Other/App.java", targetKind: "file" }, ["C:/Project/src"])), []);
  assert.deepEqual(Array.from(await targets.resolve({ filePath: "C:/Project/src/readme.md", targetKind: "file" }, ["C:/Project/src"])), []);
});

