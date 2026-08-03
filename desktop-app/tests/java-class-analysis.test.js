const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("class analysis maps emitted classes and reverse dependencies to sources", async () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/java-class-analysis.js"), "utf8");
  const context = { window: {}, globalThis: {} };
  vm.runInNewContext(source, context);
  const api = context.window.registerMarkdownViewerJavaClassAnalysis({ registerModule() {} }, {
    Neutralino: {
      filesystem: {
        async readDirectory(folder) {
          if (folder === "C:/Project/classes") return [{ entry: "com", type: "DIRECTORY" }];
          if (folder === "C:/Project/classes/com") return [{ entry: "App.class", type: "FILE" }, { entry: "Dep.class", type: "FILE" }];
          return [];
        }
      },
      os: {
        async execCommand(command) {
          if (command.startsWith("javap") && command.includes("App.class")) return { exitCode: 0, stdOut: 'SourceFile: "App.java"' };
          if (command.startsWith("javap")) return { exitCode: 0, stdOut: 'SourceFile: "Dep.java"' };
          return { exitCode: 0, stdOut: "   com.App -> com.Dep classes" };
        }
      }
    }
  });
  const result = await api.analyze([
    "C:/Project/src/com/App.java",
    "C:/Project/src/com/Dep.java"
  ], ["C:/Project/classes"]);
  assert.equal(result.complete, true);
  assert.deepEqual(Array.from(result.ownership["C:/Project/src/com/App.java"]), ["C:/Project/classes/com/App.class"]);
  assert.deepEqual(Array.from(result.reverseDependencies["C:/Project/src/com/Dep.java"]), ["C:/Project/src/com/App.java"]);
});

