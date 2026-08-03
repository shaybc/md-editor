const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createLspFrameParser, encodeLspFrame } = require("../resources/bridges/lsp-proxy-common/lsp-frame-codec.cjs");
const { createDiagnosticSnapshotCore } = require("../resources/bridges/lsp-proxy-common/diagnostic-snapshot-core.cjs");
const { parseCompilerDiagnostics, commonSourceRoots, orderSourceSets, resolveCompilerPluginPaths } = require("../resources/bridges/kotlin-adapter-bridge/kotlin-abi-controller.cjs");
const { sanitizeAbiSnapshot } = require("../resources/bridges/kotlin-adapter-bridge/kotlin-adapter-bridge.cjs");
const { mergeKotlinAbiClasspaths } = require("../resources/bridges/ajdt-diagnostics-worker/kotlin-abi-classpath.cjs");

test("Gradle-only model exporters never run project tests", () => {
  const kotlinExporter = fs.readFileSync(path.join(__dirname, "../resources/bridges/kotlin-adapter-bridge/kotlin-model-resolver.cjs"), "utf8");
  const ajdtExporter = fs.readFileSync(path.join(__dirname, "../resources/bridges/ajdt-diagnostics-worker/gradle-model-exporter.cjs"), "utf8");
  assert.match(kotlinExporter, /"mdEditorExportKotlinJvmModels",\s*"\-x", "test"/);
  assert.match(ajdtExporter, /"--no-daemon",\s*"\-x", "test"/);
});

test("Kotlin model refresh joins active startup analysis before reading the ABI cache", () => {
  const bridge = fs.readFileSync(path.join(__dirname, "../resources/bridges/kotlin-adapter-bridge/kotlin-adapter-bridge.cjs"), "utf8");
  const refreshHandler = bridge.slice(
    bridge.indexOf('if (request.method === "mdEditor/kotlin/refreshModel")'),
    bridge.indexOf('if (request.method === "mdEditor/kotlin/confirmAbiApplied")')
  );
  assert.ok(refreshHandler.indexOf("if (analysisPromise)") < refreshHandler.indexOf("abi.getLastValidSnapshot()"));
});

test("LSP framing uses UTF-8 byte lengths and accepts split frames", () => {
  const received = [];
  const parser = createLspFrameParser((message) => received.push(message));
  const frame = encodeLspFrame({ jsonrpc: "2.0", method: "test", params: { value: "שלום" } });
  parser.push(frame.subarray(0, 9));
  parser.push(frame.subarray(9));
  assert.equal(received[0].params.value, "שלום");
});

test("diagnostic snapshots are severity-first and capped without corrupting totals", () => {
  const store = createDiagnosticSnapshotCore({ maximumProblems: 2 });
  const summary = store.publish([
    { severity: "information", message: "info" },
    { severity: "warning", message: "warning" },
    { severity: "error", message: "error" }
  ]);
  assert.equal(summary.total, 3);
  assert.deepEqual(store.getProblems({ limit: 2 }).problems.map((problem) => problem.severity), ["error", "warning"]);
});

test("parses Kotlin compiler diagnostics and derives Java source roots", () => {
  const diagnostics = parseCompilerDiagnostics("e: C:/workspace/src/main/kotlin/App.kt:4:7 [UNRESOLVED_REFERENCE] Missing");
  assert.equal(diagnostics[0].severity, "error");
  assert.equal(diagnostics[0].line, 4);
  assert.equal(diagnostics[0].code, "UNRESOLVED_REFERENCE");
  assert.deepEqual(commonSourceRoots(["C:/workspace/src/main/java/sample/Api.java"], "java"), ["C:\\workspace\\src\\main\\java"]);
});

test("compiler diagnostics resolve relative workspace paths and textual severities", () => {
  const root = path.join("C:", "workspace");
  const [diagnostic] = parseCompilerDiagnostics("src/main/kotlin/Sample.kt:3:5: warning: [TEST] Message", root);
  assert.equal(diagnostic.severity, "warning");
  assert.equal(diagnostic.filePath, path.resolve(root, "src/main/kotlin/Sample.kt"));
  assert.equal(diagnostic.message, "[TEST] Message");
});
test("ABI notifications expose durable reconciliation metadata but not JAR bytes", () => {
  const snapshot = sanitizeAbiSnapshot({
    workspaceRevision: "2",
    snapshotUri: "file:///cache/abi/current.json",
    changedProjectUris: ["file:///p"],
    removedProjectUris: ["file:///removed"],
    entries: [{ moduleId: "m", sourceSetId: "main", projectUri: "file:///p", jarUri: "file:///abi.jar", contentHash: "abc" }]
  });
  assert.equal(snapshot.snapshotUri, "file:///cache/abi/current.json");
  assert.deepEqual(snapshot.changedProjectUris, ["file:///p"]);
  assert.deepEqual(snapshot.removedProjectUris, ["file:///removed"]);
  assert.equal(snapshot.entries[0].jarUri, "file:///abi.jar");
  assert.equal(Object.hasOwn(snapshot.entries[0], "jarBytes"), false);
});

test("AJDT receives Kotlin ABI JARs only for the owning private module model", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mdeditor-ajdt-abi-"));
  const moduleA = path.join(root, "a");
  const moduleB = path.join(root, "b");
  const jar = path.join(root, "a-abi.jar");
  fs.mkdirSync(moduleA);
  fs.mkdirSync(moduleB);
  fs.writeFileSync(jar, "PK");
  const toUri = (value) => `file:///${path.resolve(value).replace(/\\/g, "/")}`;
  const models = mergeKotlinAbiClasspaths([
    { projectRoot: moduleA, classpath: ["existing-a.jar"] },
    { projectRoot: moduleB, classpath: ["existing-b.jar"] }
  ], { entries: [{ projectUri: toUri(moduleA), jarUri: toUri(jar) }] });
  assert.deepEqual(models[0].classpath, ["existing-a.jar", jar]);
  assert.deepEqual(models[1].classpath, ["existing-b.jar"]);
});

test("orders Kotlin ABI generation before dependent modules", () => {
  const moduleA = { projectPath: ":a", sourceSets: [{ name: "main", kotlin: ["A.kt"], projectDependencies: [] }] };
  const moduleB = { projectPath: ":b", sourceSets: [{ name: "main", kotlin: ["B.kt"], projectDependencies: [":a"] }] };
  assert.deepEqual(orderSourceSets({ modules: [moduleB, moduleA] }).map((item) => item.module.projectPath), [":a", ":b"]);
});
test("uses the bundled compatible Kotlin compiler plugin and ignores scripting support", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mdeditor-kotlin-plugin-"));
  const compiler = path.join(root, "kotlinc", "bin", "kotlinc.bat");
  const bundled = path.join(root, "kotlinc", "lib", "kotlin-serialization-compiler-plugin.jar");
  fs.mkdirSync(path.dirname(compiler), { recursive: true });
  fs.mkdirSync(path.dirname(bundled), { recursive: true });
  fs.writeFileSync(compiler, "");
  fs.writeFileSync(bundled, "");
  const resolved = resolveCompilerPluginPaths([
    path.join(root, "kotlin-scripting-compiler-embeddable-2.3.20.jar"),
    path.join(root, "kotlin-serialization-compiler-plugin-embeddable-2.3.20.jar")
  ], compiler);
  assert.deepEqual(resolved, [bundled]);
});
