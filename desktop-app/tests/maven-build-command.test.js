const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadCommandBuilder(deps = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/maven-build-command.js"), "utf8");
  const context = { window: {}, globalThis: {} };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerMavenBuildCommand({ registerModule() {} }, deps);
}

test("Maven command runs tests when both test choices are enabled", () => {
  const builder = loadCommandBuilder();
  assert.equal(builder.buildCommand({ runner: "mvn", compileTests: true, runTests: true }), "mvn clean package");
});

test("Maven command compiles tests without running them by default", () => {
  const builder = loadCommandBuilder();
  assert.equal(builder.buildCommand({ runner: ".\\mvnw.cmd", compileTests: true, runTests: false }), ".\\mvnw.cmd clean package -DskipTests");
});

test("Maven command can skip test compilation and execution", () => {
  const builder = loadCommandBuilder();
  assert.equal(builder.buildCommand({ runner: "./mvnw", compileTests: false, runTests: false }), "./mvnw clean package -Dmaven.test.skip=true");
});

test("Maven command can skip Apache RAT for one rebuild", () => {
  const builder = loadCommandBuilder();
  assert.equal(
    builder.buildCommand({ runner: "mvn", compileTests: true, runTests: false, skipRat: true }),
    "mvn clean package -DskipTests -Drat.skip=true"
  );
});

test("Maven command accepts resolved generic Build Option arguments", () => {
  const builder = loadCommandBuilder();
  assert.equal(
    builder.buildCommand({ runner: "mvn", optionArguments: ["-Dmaven.test.skip=true", "-Drat.skip=true"] }),
    "mvn clean package -Dmaven.test.skip=true -Drat.skip=true"
  );
});

test("running tests normalizes test compilation to enabled", () => {
  const builder = loadCommandBuilder();
  assert.deepEqual(
    JSON.parse(JSON.stringify(builder.normalizeTestOptions({ compileTests: false, runTests: true }))),
    { compileTests: true, runTests: true }
  );
});


test("Maven clean command does not package or append test flags", () => {
  const builder = loadCommandBuilder();
  assert.equal(builder.buildCleanCommand({ runner: ".\\mvnw.cmd" }), ".\\mvnw.cmd clean");
});

test("Maven target compile selects main or test lifecycle without packaging", () => {
  const builder = loadCommandBuilder();
  assert.equal(
    builder.buildCompileCommand({ runner: "mvn", includeTests: false }),
    "mvn compile -Dmaven.compiler.useIncrementalCompilation=false"
  );
  assert.equal(
    builder.buildCompileCommand({ runner: ".\\mvnw.cmd", includeTests: true }),
    ".\\mvnw.cmd test-compile -Dmaven.compiler.useIncrementalCompilation=false"
  );
});

test("Maven command preserves quoted advanced Build Option arguments", () => {
  const builder = loadCommandBuilder();
  assert.equal(
    builder.buildCommand({ runner: "mvn", optionArguments: ["-Pdev", "-Dname=\"hello world\""] }),
    "mvn clean package -Pdev -Dname=\"hello world\""
  );
});
test("Maven Spotless apply command uses the detected runner and module POM", () => {
  const builder = loadCommandBuilder();
  assert.equal(
    builder.buildSpotlessApplyCommand({ runner: ".\\mvnw.cmd", cwd: "C:/Project", pomPath: "C:/Project/module/pom.xml" }),
    ".\\mvnw.cmd -f module/pom.xml spotless:apply"
  );
  assert.equal(
    builder.buildSpotlessApplyCommand({ runner: "mvn", cwd: "C:/Project/module", pomPath: "C:/Project/module/pom.xml" }),
    "mvn spotless:apply"
  );
});

test("Maven effective POM command uses the detected runner and POM", () => {
  const builder = loadCommandBuilder();
  assert.equal(
    builder.buildEffectivePomCommand({ runner: ".\\mvnw.cmd", cwd: "C:/Project", pomPath: "C:/Project/pom.xml" }),
    ".\\mvnw.cmd help:effective-pom"
  );
  assert.equal(
    builder.buildEffectivePomCommand({ runner: "mvn", cwd: "C:/Project", pomPath: "C:/Project/module/pom.xml" }),
    "mvn -f module/pom.xml help:effective-pom"
  );
});

test("Maven commands include global settings repository and overridable offline mode", () => {
  const runtimeModule = require("../resources/js/project/maven-runtime-settings.js");
  const runtime = runtimeModule.registerMarkdownViewerMavenRuntimeSettings({ registerModule() {} }, {
    getSettings() {
      return {
        mavenSettingsFilePath: "C:/Maven Config/settings.xml",
        mavenOffline: true,
        mavenLocalRepositoryPath: "D:/Maven Cache"
      };
    }
  });
  const builder = loadCommandBuilder({ mavenRuntimeSettings: runtime });
  assert.equal(
    builder.buildCleanCommand({ runner: "mvn.cmd" }),
    'mvn.cmd --settings "C:/Maven Config/settings.xml" --offline "-Dmaven.repo.local=D:/Maven Cache" clean'
  );
  assert.equal(
    builder.buildCleanCommand({ runner: "mvn.cmd", offlineOverride: false }),
    'mvn.cmd --settings "C:/Maven Config/settings.xml" "-Dmaven.repo.local=D:/Maven Cache" clean'
  );
});
