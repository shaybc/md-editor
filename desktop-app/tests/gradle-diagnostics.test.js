const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadDiagnostics() {
  const sourcePaths = [
    "../resources/js/project/gradle-diagnostics/parsers/compiler-parser.js",
    "../resources/js/project/gradle-diagnostics/parsers/build-script-parser.js",
    "../resources/js/project/gradle-diagnostics/parsers/project-failure-parser.js",
    "../resources/js/project/gradle-diagnostics.js"
  ];
  const context = { window: {}, globalThis: {} };
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  for (const sourcePath of sourcePaths) vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, sourcePath), "utf8"), context);
  const parsers = [
    context.window.registerMarkdownViewerGradleCompilerDiagnosticsParser(app),
    context.window.registerMarkdownViewerGradleBuildScriptDiagnosticsParser(app),
    context.window.registerMarkdownViewerGradleProjectFailureParser(app)
  ];
  return context.window.registerMarkdownViewerGradleDiagnostics(app, { parsers });
}

test("Gradle compiler diagnostics parse Java and Kotlin locations and remove duplicates", () => {
  const diagnostics = loadDiagnostics().parseDiagnostics([
    "C:\\Project\\src\\App.java:5:12: error: cannot find symbol",
    "w: file:///C:/Project/src/App.kt:8:4 Unused value",
    "e: file:///C:/Project/src/Other.kt: (9, 6): Unresolved reference",
    "C:\\Project\\src\\App.java:5:12: error: cannot find symbol"
  ].join("\n"));
  assert.equal(diagnostics.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(diagnostics[0])), {
    severity: "error", message: "cannot find symbol", filePath: "C:/Project/src/App.java", line: 5, column: 12, source: "gradle"
  });
  assert.equal(diagnostics[1].severity, "warning");
  assert.equal(diagnostics[1].filePath, "C:/Project/src/App.kt");
  assert.equal(diagnostics[2].line, 9);
  assert.equal(diagnostics[2].column, 6);
});

test("Gradle diagnostics parse build-script and project failures", () => {
  const diagnostics = loadDiagnostics().parseDiagnostics([
    "Build file 'C:\\Project\\build.gradle' line: 14",
    "",
    "* What went wrong:",
    "Could not compile build file 'C:\\Project\\build.gradle'.",
    "> Could not resolve all files for configuration ':classpath'."
  ].join("\n"));
  assert.equal(diagnostics[0].filePath, "C:/Project/build.gradle");
  assert.equal(diagnostics[0].line, 14);
  assert.equal(diagnostics.some((item) => /Could not resolve/.test(item.message)), true);
});
