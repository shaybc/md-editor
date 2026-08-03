const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadCompiler(overrides = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/java-compiler.js"), "utf8");
  const context = { window: {}, globalThis: {}, console };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerJavaCompiler({ registerModule() {} }, {
    osName: "Windows",
    Neutralino: {
      filesystem: {
        async getStats() { return { isFile: true, isDirectory: true }; },
        async readDirectory() { return []; },
        async createDirectory() {},
        async writeFile() {},
        async readFile() { return ""; },
        async remove() {}
      },
      os: { async getPath() { return "C:/Temp"; } }
    },
    ...overrides
  });
}

test("javac command includes selected source lists, classpath, and classes output", () => {
  const compiler = loadCompiler();
  const command = compiler.buildJavacCommand({
    osName: "Windows",
    sourceRoots: [
      { argumentFile: "C:/Temp/main sources.txt" },
      { argumentFile: "C:/Temp/test.sources" }
    ],
    classpathEntries: ["C:/Project/lib/a.jar", "C:/Shared/classes"],
    outputMode: "classes",
    outputPath: "C:/Project/classes"
  });

  assert.equal(command, 'javac -classpath "C:/Project/lib/a.jar;C:/Shared/classes" -d "C:/Project/classes" @"C:/Temp/main sources.txt" @"C:/Temp/test.sources"');
});

test("next-to-source command omits output and an empty classpath", () => {
  const compiler = loadCompiler();
  const command = compiler.buildJavacCommand({
    osName: "Linux",
    sourceRoots: [{ argumentFile: "/tmp/main.sources" }],
    classpathEntries: [],
    outputMode: "sources"
  });

  assert.equal(command, "javac @'/tmp/main.sources'");
});

test("javac command uses the selected Project JDK executable", () => {
  const compiler = loadCompiler();
  const command = compiler.buildJavacCommand({
    javacExecutable: "C:/Program Files/Java/jdk-25/bin/javac.exe",
    sourceRoots: [{ argumentFile: "C:/Temp/main.sources" }]
  });
  assert.match(command, /^"C:\/Program Files\/Java\/jdk-25\/bin\/javac\.exe"/);
});

test("javac diagnostics retain Windows paths and caret columns", () => {
  const compiler = loadCompiler();
  const diagnostics = compiler.parseJavacDiagnostics([
    "C:/Project/src/App.java:12: error: cannot find symbol",
    "    Missing value;",
    "    ^",
    "C:/Project/src/Other.java:4: warning: unchecked conversion",
    "warning: [options] system modules path not set"
  ].join("\n"));

  assert.equal(diagnostics.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(diagnostics[0])), {
    severity: "error",
    message: "cannot find symbol",
    filePath: "C:/Project/src/App.java",
    line: 12,
    column: 5,
    source: "javac"
  });
  assert.equal(diagnostics[1].severity, "warning");
  assert.equal(diagnostics[2].filePath, "");
});

test("source export collision detection compares source-root-relative paths", () => {
  const compiler = loadCompiler();
  const collisions = compiler.findSourceExportCollisions([
    { path: "C:/Project/src/main/java", files: ["C:/Project/src/main/java/com/acme/App.java"] },
    { path: "C:/Project/src/test/java", files: ["C:/Project/src/test/java/com/acme/App.java"] }
  ]);

  assert.deepEqual(Array.from(collisions), ["com/acme/app.java"]);
});
