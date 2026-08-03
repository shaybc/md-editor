const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadPlanner(files, inspection = { classification: "binary", extension: "snapshot" }) {
  const xmlPath = path.resolve(__dirname, "../resources/js/rat/xml-edit-planner.js");
  const plannerPath = path.resolve(__dirname, "../resources/js/rat/change-planner.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(xmlPath, "utf8"), context, { filename: xmlPath });
  vm.runInNewContext(fs.readFileSync(plannerPath, "utf8"), context, { filename: plannerPath });
  const xmlEditPlanner = context.window.registerMarkdownViewerRatXmlEditPlanner({ registerModule() {} });
  const api = context.window.registerMarkdownViewerRatChangePlanner({ registerModule() {} }, {
    xmlEditPlanner,
    tabs: { getExternalDocumentSnapshot() { return null; } },
    Neutralino: { filesystem: { async readFile(filePath) { return files.get(filePath); } } }
  });
  return {
    api,
    context: {
      projectPath: "C:/Project",
      finding: { filePath: "C:/Project/module/src/test/resources/sample.snapshot" },
      inspection,
      module: { projectRoot: "C:/Project/module", pomPath: "C:/Project/module/pom.xml" },
      governing: { pomPath: "C:/Project/module/pom.xml", version: "0.18" }
    }
  };
}

test("RAT exact-file exclusion requires rationale and previews a scoped inputExclude", async () => {
  const files = new Map([["C:/Project/module/pom.xml", "<project>\n</project>\n"]]);
  const harness = loadPlanner(files);
  await assert.rejects(() => harness.api.plan("resolution.exclude-file", harness.context, {}), /rationale/i);
  const plan = await harness.api.plan("resolution.exclude-file", harness.context, { rationale: "Generated binary fixture" });
  assert.match(plan.changes[0].afterContent, /<inputExclude>src\/test\/resources\/sample\.snapshot<\/inputExclude>/);
  assert.match(plan.warnings[0], /does not approve/i);
});

test("RAT header planning refuses binary files and requires authorization", async () => {
  const files = new Map([["C:/Project/Demo.java", "class Demo {}\n"]]);
  const binary = loadPlanner(files);
  await assert.rejects(() => binary.api.plan("resolution.add-header", binary.context, {
    authorized: true,
    headerText: "Licensed"
  }), /binary/i);

  const text = loadPlanner(files, { classification: "text", extension: "java" });
  text.context.finding.filePath = "C:/Project/Demo.java";
  await assert.rejects(() => text.api.plan("resolution.add-header", text.context, {
    headerText: "Licensed"
  }), /authorized/i);
});
