const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadCommandBuilder() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/gradle-build-command.js"), "utf8");
  const context = { window: {}, globalThis: {} };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerGradleBuildCommand({ registerModule() {} });
}

test("Gradle rebuild maps all test policies to project-root tasks", () => {
  const builder = loadCommandBuilder();
  assert.equal(builder.buildCommand({ runner: ".\\gradlew.bat", compileTests: false }), ".\\gradlew.bat --console=plain --no-daemon clean assemble");
  assert.equal(builder.buildCommand({ runner: "./gradlew", compileTests: true, runTests: false }), "./gradlew --console=plain --no-daemon clean assemble testClasses");
  assert.equal(builder.buildCommand({ runner: "gradle", compileTests: false, runTests: true }), "gradle --console=plain --no-daemon clean build");
});

test("Gradle commands apply offline and quoted user-home settings", () => {
  const builder = loadCommandBuilder();
  assert.equal(
    builder.buildCleanCommand({ runner: "gradle", offline: true, userHome: "C:/Gradle Cache" }),
    'gradle --console=plain --no-daemon --offline --gradle-user-home "C:/Gradle Cache" clean'
  );
});

test("running Gradle tests normalizes test compilation to enabled", () => {
  const builder = loadCommandBuilder();
  assert.deepEqual(JSON.parse(JSON.stringify(builder.normalizeTestOptions({ compileTests: false, runTests: true }))), {
    compileTests: true,
    runTests: true
  });
});
