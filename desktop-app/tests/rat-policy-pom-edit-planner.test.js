"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadPlanner() {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat-policy/pom-edit-planner.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerRatPolicyPomEditPlanner({ registerModule() {} }, { xmlEditPlanner: { validateXml() {} } });
}

test("RAT policy POM planner adds a verify execution without rewriting unrelated XML", () => {
  const before = [
    "<project>",
    "  <!-- keep this comment exactly -->",
    "  <artifactId>demo</artifactId>",
    "</project>",
    ""
  ].join("\n");
  const after = loadPlanner().plan(before, { pluginVersion: "0.18", bindToVerify: true });
  assert.match(after, /<artifactId>apache-rat-plugin<\/artifactId>/);
  assert.match(after, /<phase>verify<\/phase>/);
  assert.match(after, /<goal>check<\/goal>/);
  assert.match(after, /keep this comment exactly/);
});

test("RAT policy POM planner does not treat pluginManagement as active execution", () => {
  const before = "<project><build><pluginManagement><plugins><plugin><artifactId>apache-rat-plugin</artifactId><version>0.17</version></plugin></plugins></pluginManagement></build></project>";
  const after = loadPlanner().plan(before, { pluginVersion: "0.18", bindToVerify: true });
  assert.equal((after.match(/<artifactId>apache-rat-plugin<\/artifactId>/g) || []).length, 2);
  assert.match(after.slice(after.indexOf("</pluginManagement>")), /<artifactId>apache-rat-plugin<\/artifactId>/);
  assert.match(after, /<phase>verify<\/phase>/);
});
