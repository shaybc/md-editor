const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("RAT context selects the nearest active declaration and wrapper", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat/project-context.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const existing = new Set(["C:/Project/module/mvnw.cmd", "C:/Project/module/target/rat.txt"]);
  const api = context.window.registerMarkdownViewerRatProjectContext({ registerModule() {} }, {
    osName: "Windows",
    Neutralino: { filesystem: { async getStats(filePath) {
      if (!existing.has(filePath)) throw new Error("missing");
      return { isFile: true };
    } } },
    findingParser: { parseDiagnostic() { return null; } },
    mavenDetection: { async detectProjectForTarget() {
      return { hasPom: true, projectRoot: "C:/Project/module", pomPath: "C:/Project/module/pom.xml" };
    } },
    configurationReader: { async readPom(filePath) {
      return {
        path: filePath,
        parentRelativePath: "",
        ratPlugins: [{ version: "0.17.2", inPluginManagement: false, inProfile: false }]
      };
    } }
  });
  const result = await api.analyze({
    projectPath: "C:/Project",
    targetPath: "C:/Project/module/a.bin",
    finding: { filePath: "C:/Project/module/a.bin" }
  });
  assert.equal(result.governing.version, "0.17.2");
  assert.equal(result.wrapper.runner, ".\\mvnw.cmd");
  assert.equal(result.reportPath, "C:/Project/module/target/rat.txt");
});
