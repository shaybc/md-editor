const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("RAT command builder uses the detected wrapper and never adds build lifecycle goals", () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat/command-builder.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const api = context.window.registerMarkdownViewerRatCommandBuilder({ registerModule() {} });
  const command = api.build({
    projectPath: "C:/Project",
    wrapper: { runner: ".\\mvnw.cmd", cwd: "C:/Project" },
    module: { projectRoot: "C:/Project/module", pomPath: "C:/Project/module/pom.xml" }
  }, { scope: "module-with-dependencies" });
  assert.match(command.command, /^\.\\mvnw\.cmd /);
  assert.match(command.command, /apache-rat:check$/);
  assert.doesNotMatch(command.command, /\b(?:compile|package|install)\b/);
});
