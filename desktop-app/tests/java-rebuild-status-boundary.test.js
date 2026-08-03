const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("Maven build status ends when the process returns, before post-build indexing", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../resources/js/project/java-project-provider.js"),
    "utf8"
  );
  const commandFinished = source.indexOf("const result = await deps.terminal.runCommand", source.indexOf("async function rebuildMavenProject"));
  const statusFinished = source.indexOf("endProjectBuildStatus(buildStatusId);", commandFinished);
  const buildStateRecorded = source.indexOf("await recordBuildState(", commandFinished);

  assert.ok(commandFinished >= 0);
  assert.ok(statusFinished > commandFinished);
  assert.ok(buildStateRecorded > statusFinished);
});
