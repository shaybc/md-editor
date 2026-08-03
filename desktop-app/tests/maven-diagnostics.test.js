const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadDiagnostics() {
  const sourcePaths = [
    "../resources/js/project/maven-diagnostics/parsers/spotless-parser.js",
    "../resources/js/project/maven-diagnostics/parsers/compiler-parser.js",
    "../resources/js/project/maven-diagnostics/parsers/dependency-resolution-parser.js",
    "../resources/js/project/maven-diagnostics/parsers/multiline-parser.js",
    "../resources/js/project/maven-diagnostics/parsers/project-failure-parser.js",
    "../resources/js/project/maven-diagnostics.js"
  ];
  const context = { window: {}, globalThis: {} };
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  for (const sourcePath of sourcePaths) {
    const resolvedPath = path.resolve(__dirname, sourcePath);
    vm.runInNewContext(fs.readFileSync(resolvedPath, "utf8"), context, { filename: resolvedPath });
  }
  const parsers = [
    context.window.registerMarkdownViewerSpotlessMavenDiagnosticsParser(app),
    context.window.registerMarkdownViewerMavenCompilerDiagnosticsParser(app),
    context.window.registerMarkdownViewerMavenDependencyResolutionParser(app),
    context.window.registerMarkdownViewerMavenMultilineDiagnosticsParser(app),
    context.window.registerMarkdownViewerMavenProjectFailureParser(app)
  ];
  return context.window.registerMarkdownViewerMavenDiagnostics(app, { parsers });
}

test("Maven compiler diagnostics include navigable Windows locations and remove duplicates", () => {
  const diagnostics = loadDiagnostics();
  const output = [
    "[ERROR] /C:/Project/src/main/java/example/App.java:[5,23] illegal start of type",
    "[WARNING] /C:/Project/src/main/java/example/App.java:[8,9] unchecked conversion",
    "[ERROR] /C:/Project/src/main/java/example/App.java:[5,23] illegal start of type"
  ].join("\r\n");
  assert.deepEqual(JSON.parse(JSON.stringify(diagnostics.parseDiagnostics(output))), [
    {
      severity: "error",
      message: "illegal start of type",
      filePath: "C:/Project/src/main/java/example/App.java",
      line: 5,
      column: 23,
      source: "maven"
    },
    {
      severity: "warning",
      message: "unchecked conversion",
      filePath: "C:/Project/src/main/java/example/App.java",
      line: 8,
      column: 9,
      source: "maven"
    }
  ]);
});

test("Maven diagnostics retain actionable project failures without locations", () => {
  const diagnostics = loadDiagnostics();
  const parsed = diagnostics.parseDiagnostics([
    "[ERROR] Failed to execute goal example:plugin:run: Build configuration is invalid",
    "[ERROR] -> [Help 1]",
    "[ERROR] Re-run Maven using the -X switch to enable full debug logging."
  ].join("\n"));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].message, "Failed to execute goal example:plugin:run: Build configuration is invalid");
  assert.equal(parsed[0].filePath, "");
});

test("Maven diagnostics strip terminal color sequences", () => {
  const diagnostics = loadDiagnostics();
  const parsed = diagnostics.parseDiagnostics("\u001b[31m[ERROR] /tmp/App.java:[2,4] cannot find symbol\u001b[0m");
  assert.equal(parsed[0].filePath, "/tmp/App.java");
  assert.equal(parsed[0].message, "cannot find symbol");
});
test("Maven diagnostics expand generic multiline path warnings relative to the module root", () => {
  const diagnostics = loadDiagnostics();
  const parsed = diagnostics.parseDiagnostics([
    "[WARNING] Files requiring review:",
    "  module-a/src/test/resources/sample.snapshot",
    "[WARNING]   module-b/config/settings.xml",
    "[INFO] Validation finished"
  ].join("\n"), { projectPath: "C:/Project" });

  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), [
    {
      severity: "warning",
      message: "Files requiring review: module-a/src/test/resources/sample.snapshot",
      filePath: "C:/Project/module-a/src/test/resources/sample.snapshot",
      line: 1,
      column: 1,
      source: "maven"
    },
    {
      severity: "warning",
      message: "Files requiring review: module-b/config/settings.xml",
      filePath: "C:/Project/module-b/config/settings.xml",
      line: 1,
      column: 1,
      source: "maven"
    }
  ]);
});


test("Maven diagnostics expand module-local multiline paths from Maven plugin context", () => {
  const diagnostics = loadDiagnostics();
  const parsed = diagnostics.parseDiagnostics([
    "[INFO] --- maven-checkstyle-plugin:3.6.0:check @ flink-annotations ---",
    "[ERROR] Violations also present in:",
    "  src\\main\\java\\org\\apache\\flink\\annotation\\Public.java",
    "[INFO] Validation finished"
  ].join("\n"), { projectPath: "C:/Project/flink" });

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].filePath, "C:/Project/flink/flink-annotations/src/main/java/org/apache/flink/annotation/Public.java");
  assert.equal(parsed[0].message, "Violations also present in: src\\main\\java\\org\\apache\\flink\\annotation\\Public.java");
});

test("Maven diagnostics prefer Maven from-pom module directories for multiline paths", () => {
  const diagnostics = loadDiagnostics();
  const parsed = diagnostics.parseDiagnostics([
    "[INFO] Building Flink : Connectors : File Sink",
    "[INFO]   from flink-connectors/flink-connector-files/pom.xml",
    "[ERROR] Violations also present in:",
    "  src\\main\\java\\org\\apache\\flink\\connector\\file\\sink\\FileCommitter.java",
    "[INFO] Validation finished"
  ].join("\n"), { projectPath: "C:/Project/flink" });

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].filePath, "C:/Project/flink/flink-connectors/flink-connector-files/src/main/java/org/apache/flink/connector/file/sink/FileCommitter.java");
});

test("Maven diagnostics parse Spotless format violations with full context", () => {
  const diagnostics = loadDiagnostics();
  const parsed = diagnostics.parseDiagnostics([
    "[INFO] --- spotless-maven-plugin:2.43.0:check (spotless-check) @ flink-annotations ---",
    "[ERROR] Failed to execute goal com.diffplug.spotless:spotless-maven-plugin:2.43.0:check (spotless-check) on project flink-annotations: The following files had format violations:",
    "[ERROR]     src\\main\\java\\org\\apache\\flink\\annotation\\docs\\ConfigGroup.java",
    "[ERROR]         @@ -1,37 +1,37 @@",
    "[ERROR]         -/*\\n",
    "[ERROR]         +/*\\r\\n",
    "[ERROR]     ... (26 more lines that didn't fit)",
    "[ERROR] Violations also present in:",
    "[ERROR]     src\\main\\java\\org\\apache\\flink\\annotation\\Public.java",
    "[ERROR] Run 'mvn spotless:apply' to fix these violations.",
    "[ERROR] After correcting the problems, you can resume the build with the command",
    "[ERROR]   mvn <args> -rf :flink-annotations"
  ].join("\n"), { projectPath: "C:/Project/flink" });

  assert.deepEqual(JSON.parse(JSON.stringify(parsed.map((item) => item.filePath))), [
    "C:/Project/flink/flink-annotations/src/main/java/org/apache/flink/annotation/docs/ConfigGroup.java",
    "C:/Project/flink/flink-annotations/src/main/java/org/apache/flink/annotation/Public.java"
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.map((item) => item.message))), [
    "Spotless format violation: src\\main\\java\\org\\apache\\flink\\annotation\\docs\\ConfigGroup.java",
    "Spotless format violation: src\\main\\java\\org\\apache\\flink\\annotation\\Public.java"
  ]);
  assert.equal(parsed.every((item) => item.problemType === "spotless-format"), true);
  assert.match(parsed[0].originalMessage, /spotless-maven-plugin/);
  assert.match(parsed[0].originalMessage, /mvn spotless:apply/);
  assert.equal(parsed.some((item) => /Violations also present in/.test(item.message)), false);
});

test("Maven diagnostics report project-level Spotless failures when no file path is parseable", () => {
  const diagnostics = loadDiagnostics();
  const parsed = diagnostics.parseDiagnostics([
    "[ERROR] Failed to execute goal com.diffplug.spotless:spotless-maven-plugin:2.43.0:check (spotless-check) on project sample: The following files had format violations:",
    "[ERROR]         @@ -1,37 +1,37 @@",
    "[ERROR] Run 'mvn spotless:apply' to fix these violations."
  ].join("\n"), { projectPath: "C:/Project" });

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].filePath, "");
  assert.equal(parsed[0].problemType, "spotless-format");
  assert.equal(parsed[0].message, "Spotless format violations were reported, but no affected file path could be parsed.");
  assert.match(parsed[0].originalMessage, /mvn spotless:apply/);
});

test("Maven diagnostics summarize dependency resolution artifact lists", () => {
  const diagnostics = loadDiagnostics();
  const parsed = diagnostics.parseDiagnostics([
    "[ERROR] Failed to execute goal on project flink-python: Could not resolve dependencies for project org.apache.flink:flink-python:jar:2.4-SNAPSHOT: The following artifacts could not be resolved: org.apache.flink:flink-core:jar:2.4-SNAPSHOT, org.apache.flink:flink-core-api:jar:2.4-SNAPSHOT, org.apache.flink:flink-metrics-core:jar:2.4-SNAPSHOT: org.apache.flink:flink-core:jar:2.4-SNAPSHOT was not found in https://maven.repository.redhat.com/ga/ during a previous attempt. This failure was cached in the local repository and resolution is not reattempted until the update interval of redhat has elapsed or updates are forced -> [Help 1]"
  ].join("\n"));

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].filePath, "");
  assert.match(parsed[0].message, /^Maven dependency resolution failed for flink-python: could not resolve \d+ artifacts\. First missing: org\.apache\.flink:flink-core:jar:2\.4-SNAPSHOT\./);
  assert.match(parsed[0].message, /Repository: https:\/\/maven\.repository\.redhat\.com\/ga\//);
  assert.match(parsed[0].message, /Maven cached the failed lookup; use -U to force updates\./);
});
test("Maven diagnostics expand generic multiline non-path errors as project problems", () => {
  const diagnostics = loadDiagnostics();
  const parsed = diagnostics.parseDiagnostics([
    "[ERROR] Validation failures:",
    "  Missing required declaration",
    "  Unsupported target level",
    "[INFO] Validation finished"
  ].join("\n"), { projectPath: "C:/Project" });

  assert.deepEqual(JSON.parse(JSON.stringify(parsed.map((item) => ({
    severity: item.severity,
    message: item.message,
    filePath: item.filePath
  })))), [
    { severity: "error", message: "Validation failures: Missing required declaration", filePath: "" },
    { severity: "error", message: "Validation failures: Unsupported target level", filePath: "" }
  ]);
});

test("Maven diagnostics preserve original project failure text when summarizing", () => {
  const diagnostics = loadDiagnostics();
  const original = "Failed to execute goal on project flink-python: Could not resolve dependencies for project org.apache.flink:flink-python:jar:2.4-SNAPSHOT: The following artifacts could not be resolved: org.apache.flink:flink-core:jar:2.4-SNAPSHOT, org.apache.flink:flink-core-api:jar:2.4-SNAPSHOT: org.apache.flink:flink-core:jar:2.4-SNAPSHOT was not found in https://maven.repository.redhat.com/ga/ during a previous attempt. This failure was cached in the local repository and resolution is not reattempted until the update interval of redhat has elapsed or updates are forced -> [Help 1]";
  const parsed = diagnostics.parseDiagnostics(`[ERROR] ${original}`);

  assert.equal(parsed.length, 1);
  assert.match(parsed[0].message, /^Maven dependency resolution failed for flink-python:/);
  assert.equal(parsed[0].originalMessage, original);
});
