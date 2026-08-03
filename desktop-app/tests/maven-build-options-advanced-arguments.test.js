const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadAdvancedArguments() {
  const sourcePath = path.resolve(__dirname, "../resources/js/project/maven-build-options/advanced-arguments.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerMavenBuildOptionsAdvancedArguments({ registerModule() {} });
}

test("advanced arguments accept common Maven option forms", () => {
  const validator = loadAdvancedArguments();
  const result = validator.validate('-Pdev -pl module-a -am -T 2C -U -Dname="hello world" --settings "C:/Maven/settings.xml"');

  assert.equal(result.valid, true);
  assert.deepEqual(Array.from(result.arguments), ["-Pdev", "-pl", "module-a", "-am", "-T", "2C", "-U", '-Dname="hello world"', "--settings", '"C:/Maven/settings.xml"']);
});

test("advanced arguments reject goals plugin goals and shell operators", () => {
  const validator = loadAdvancedArguments();

  assert.equal(validator.validate("verify").valid, false);
  assert.match(validator.validate("spotbugs:check").errors[0], /goal/);
  assert.match(validator.validate("-Dskip=true && deploy").errors[0], /shell operators/);
});

test("advanced arguments reject unterminated quotes unsupported options and reserved keys", () => {
  const validator = loadAdvancedArguments();

  assert.match(validator.validate('-Dname="open').errors[0], /unterminated/);
  assert.match(validator.validate("--unknown").errors[0], /Unsupported/);
  assert.match(validator.validate("-DskipTests", { reservedArguments: ["skipTests"] }).errors[0], /conflicts/);
});

