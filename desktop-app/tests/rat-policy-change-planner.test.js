"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadPlanner(files) {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat-policy/change-planner.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerRatPolicyChangePlanner({ registerModule() {} }, {
    tabs: { getExternalDocumentSnapshot(filePath) { return files.has(filePath) ? { path: filePath, content: files.get(filePath), isDirty: true } : null; } },
    validator: { validate() { return { valid: true, errors: [], warnings: [] }; } },
    pomEditPlanner: { plan(text) { return text.replace("</project>", "<build-policy/></project>"); } },
    ratConfigPlanner: { create() { return "<rat-config/>\n"; } },
    exclusionPlanner: { create(patterns) { return `${patterns.join("\n")}\n`; } },
    headerPlanner: { add(text) { return text; } },
    referenceCatalog: { async getTemplate() { return null; } },
    xmlEditPlanner: {
      addExcludeFile(text, value) { return text.replace("</project>", `<inputExcludeFile>${value}</inputExcludeFile></project>`); },
      addExclude(text, value) { return text.replace("</project>", `<inputExclude>${value}</inputExclude></project>`); },
      addSkip(text) { return text; },
      appendConfigurationElement(text) { return text; }
    },
    Neutralino: { filesystem: { async readFile(filePath) { if (!files.has(filePath)) throw new Error("missing"); return files.get(filePath); } } }
  });
}

test("RAT policy planner uses dirty editor content and creates an unsaved exclusion file", async () => {
  const files = new Map([["C:/Project/pom.xml", "<project><!--dirty--></project>"]]);
  const planner = loadPlanner(files);
  const plan = await planner.plan({
    projectPath: "C:/Project",
    module: { projectRoot: "C:/Project", pomPath: "C:/Project/pom.xml" },
    documents: [],
    capabilities: { supportsConfigFiles: true },
    pomChain: []
  }, {
    targetPomPath: "C:/Project/pom.xml",
    projectLicense: "Apache-2.0",
    pluginVersion: "0.18",
    bindToVerify: true,
    includeSubprojects: false,
    useExternalConfiguration: false,
    customLicenses: [],
    useExclusionFile: true,
    exclusionFilePath: ".rat-excludes",
    exclusions: ["generated/**"],
    approvedFamilies: [],
    documentation: {},
    headerTargets: [],
    skip: false
  });
  assert.equal(plan.changes.length, 2);
  assert.equal(plan.changes.find((change) => change.path === "C:/Project/pom.xml").beforeContent.includes("dirty"), true);
  assert.equal(plan.changes.find((change) => change.path.endsWith(".rat-excludes")).type, "create");
});

test("RAT policy planner rejects policy paths outside the opened workspace", () => {
  const planner = loadPlanner(new Map());
  assert.throws(() => planner.requireWorkspacePath("C:/Project", "C:/Other/rat-config.xml"), /inside the opened workspace/i);
});
