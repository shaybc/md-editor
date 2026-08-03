const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("RAT exclusion planning can create a reviewed external exclusion file", async () => {
  const xmlPath = path.resolve(__dirname, "../resources/js/rat/xml-edit-planner.js");
  const plannerPath = path.resolve(__dirname, "../resources/js/rat/change-planner.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(xmlPath, "utf8"), context, { filename: xmlPath });
  vm.runInNewContext(fs.readFileSync(plannerPath, "utf8"), context, { filename: plannerPath });
  const xmlEditPlanner = context.window.registerMarkdownViewerRatXmlEditPlanner({ registerModule() {} });
  const api = context.window.registerMarkdownViewerRatChangePlanner({ registerModule() {} }, {
    xmlEditPlanner,
    patternImpact: { async findMatches() { return { matches: [], scanned: 0, truncated: false }; } },
    tabs: { getExternalDocumentSnapshot() { return null; } },
    Neutralino: { filesystem: { async readFile(filePath) {
      if (filePath === "C:/Project/module/pom.xml") return "<project>\n</project>\n";
      throw new Error("missing");
    } } }
  });
  const plan = await api.plan("resolution.exclude-file", {
    projectPath: "C:/Project",
    finding: { filePath: "C:/Project/module/src/test/resources/sample.snapshot" },
    module: { projectRoot: "C:/Project/module", pomPath: "C:/Project/module/pom.xml" },
    governing: { pomPath: "C:/Project/module/pom.xml", version: "0.18" }
  }, {
    rationale: "Generated binary fixture",
    exclusionFilePath: "C:/Project/module/rat-excludes.txt"
  });
  assert.equal(plan.changes[0].type, "create");
  assert.equal(plan.changes[0].afterContent, "src/test/resources/sample.snapshot\n");
  assert.match(plan.changes[1].afterContent, /<inputExcludeFile>rat-excludes\.txt<\/inputExcludeFile>/);
});

test("RAT external exclusion files cannot escape the opened workspace", async () => {
  const plannerPath = path.resolve(__dirname, "../resources/js/rat/change-planner.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(plannerPath, "utf8"), context, { filename: plannerPath });
  const api = context.window.registerMarkdownViewerRatChangePlanner({ registerModule() {} }, {
    xmlEditPlanner: {},
    tabs: { getExternalDocumentSnapshot() { return null; } },
    Neutralino: { filesystem: { async readFile() { return "<project/>"; } } }
  });
  await assert.rejects(() => api.plan("resolution.exclude-file", {
    projectPath: "C:/Project",
    finding: { filePath: "C:/Project/module/file.bin" },
    module: { projectRoot: "C:/Project/module", pomPath: "C:/Project/module/pom.xml" },
    governing: { pomPath: "C:/Project/module/pom.xml", version: "0.18" }
  }, {
    rationale: "Third-party binary",
    exclusionFilePath: "C:/Outside/rat-excludes.txt"
  }), /inside the opened workspace/i);
});
