const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadSessionFactory(deps = {}) {
  const sourcePath = path.resolve(__dirname, "../resources/js/project/maven-build-options/session.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerMavenBuildOptionsSession({ registerModule() {} }, deps);
}

function advancedArguments() {
  const sourcePath = path.resolve(__dirname, "../resources/js/project/maven-build-options/advanced-arguments.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerMavenBuildOptionsAdvancedArguments({ registerModule() {} });
}

function definitions() {
  const tests = { id: "tests", label: "Tests", order: 10 };
  return [
    {
      id: "tests.compile", label: "Compile tests", group: tests, order: 10, defaultValue: true,
      persistence: "project", storagePath: "compileTests", requires: [], conflicts: [], reservedArguments: ["maven.test.skip"],
      getArguments(value) { return value ? [] : ["-Dmaven.test.skip=true"]; }
    },
    {
      id: "tests.run", label: "Run tests", group: tests, order: 20, defaultValue: false,
      persistence: "project", storagePath: "runTests", requires: ["tests.compile"], conflicts: [], reservedArguments: ["skipTests"],
      getArguments(value, values) { return !value && values["tests.compile"] ? ["-DskipTests"] : []; }
    },
    {
      id: "plugin.apache-rat.skip", label: "Skip RAT", group: { id: "audit", label: "Audit", order: 20 }, order: 10,
      defaultValue: false, persistence: "invocation", storagePath: "", requires: [], conflicts: [], reservedArguments: ["rat.skip"], warning: "Audit bypass",
      getArguments(value) { return value ? ["-Drat.skip=true"] : []; }
    },
    {
      id: "dependency.force-updates", label: "Force Maven dependency updates", group: { id: "dependency", label: "Dependency resolution", order: 30 }, order: 10,
      defaultValue: false, persistence: "invocation", storagePath: "", requires: [], conflicts: [], reservedArguments: ["U", "update-snapshots"],
      getArguments(value) { return value ? ["-U"] : []; }
    }
  ];
}

test("session loads project values while resetting invocation options", () => {
  const session = loadSessionFactory().createSession({
    definitions: definitions(),
    persistedConfiguration: { compileTests: true, runTests: true, skipRat: true }
  });
  const resolved = session.resolve();
  assert.equal(resolved.values["tests.run"], true);
  assert.equal(resolved.values["plugin.apache-rat.skip"], false);
  assert.deepEqual(JSON.parse(JSON.stringify(resolved.persistedConfiguration)), { compileTests: true, runTests: true });
});

test("session enforces test dependencies in both directions", () => {
  const session = loadSessionFactory().createSession({ definitions: definitions() });
  session.setValue("tests.run", true);
  assert.equal(session.getValue("tests.compile"), true);
  session.setValue("tests.compile", false);
  assert.equal(session.getValue("tests.run"), false);
  assert.deepEqual(Array.from(session.resolve().arguments), ["-Dmaven.test.skip=true"]);
});

test("session resolves transient plugin arguments and warning without persisting them", () => {
  const session = loadSessionFactory().createSession({ definitions: definitions() });
  session.setValue("plugin.apache-rat.skip", true);
  const resolved = session.resolve();
  assert.deepEqual(Array.from(resolved.arguments), ["-DskipTests", "-Drat.skip=true"]);
  assert.equal(resolved.warnings[0].message, "Audit bypass");
  assert.equal(Object.prototype.hasOwnProperty.call(resolved.persistedConfiguration, "plugin.apache-rat.skip"), false);
});

test("session appends validated advanced arguments after catalog arguments without persisting them", () => {
  const session = loadSessionFactory({ advancedArguments: advancedArguments() }).createSession({ definitions: definitions() });
  session.setValue("plugin.apache-rat.skip", true);
  session.setAdvancedArgumentsRaw("-Pdev -pl module-a -am");
  const resolved = session.resolve();

  assert.equal(resolved.valid, true);
  assert.deepEqual(Array.from(resolved.arguments), ["-DskipTests", "-Drat.skip=true", "-Pdev", "-pl", "module-a", "-am"]);
  assert.deepEqual(Array.from(resolved.advancedArguments), ["-Pdev", "-pl", "module-a", "-am"]);
  assert.deepEqual(JSON.parse(JSON.stringify(resolved.persistedConfiguration)), { compileTests: true, runTests: false });
});

test("session reports invalid advanced arguments through resolved errors", () => {
  const session = loadSessionFactory({ advancedArguments: advancedArguments() }).createSession({ definitions: definitions() });
  session.setAdvancedArgumentsRaw("verify");
  const resolved = session.resolve();

  assert.equal(resolved.valid, false);
  assert.match(resolved.errors[0].message, /goal or lifecycle phase/);
  assert.deepEqual(Array.from(resolved.advancedArguments), []);
});

test("session rejects advanced arguments reserved by Build Options", () => {
  const session = loadSessionFactory({ advancedArguments: advancedArguments() }).createSession({ definitions: definitions() });
  session.setAdvancedArgumentsRaw("-DskipTests");
  const resolved = session.resolve();

  assert.equal(resolved.valid, false);
  assert.match(resolved.errors[0].message, /conflicts/);
});

test("session rejects advanced forced updates because Build Options owns it", () => {
  const session = loadSessionFactory({ advancedArguments: advancedArguments() }).createSession({ definitions: definitions() });
  session.setAdvancedArgumentsRaw("-U");
  let resolved = session.resolve();

  assert.equal(resolved.valid, false);
  assert.match(resolved.errors[0].message, /conflicts/);

  session.setAdvancedArgumentsRaw("--update-snapshots");
  resolved = session.resolve();
  assert.equal(resolved.valid, false);
  assert.match(resolved.errors[0].message, /conflicts/);
});
