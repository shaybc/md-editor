"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("opening RAT policy inventory performs static reads without commands or writes", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat-policy/project-inventory.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  let writes = 0;
  let commands = 0;
  const pom = {
    path: "C:/Project/pom.xml",
    text: "<project><artifactId>demo</artifactId><licenses><license><name>Apache License, Version 2.0</name></license></licenses></project>",
    artifactId: "demo",
    modules: [],
    ratPlugins: []
  };
  const api = context.window.registerMarkdownViewerRatPolicyProjectInventory({ registerModule() {} }, {
    projectContext: { async analyze() {
      return {
        projectPath: "C:/Project",
        module: { projectRoot: "C:/Project", pomPath: pom.path },
        pomChain: [pom], declarations: [], governing: null, configurationConfidence: "missing"
      };
    } },
    configurationReader: { readTag(text, name) { return text.match(new RegExp(`<${name}>(.*?)</${name}>`))?.[1] || ""; } },
    versionCapabilities: { resolve() { return { known: false, hasBundledSchema: false }; } },
    getWorkspaceRoot() { return "C:/Project"; },
    Neutralino: { filesystem: {
      async getStats() { throw new Error("missing"); },
      async writeFile() { writes += 1; }
    } },
    terminal: { async runCommand() { commands += 1; } }
  });
  const inventory = await api.analyze({ projectPath: "C:/Project" });
  assert.equal(inventory.projectLicense.identifier, "Apache-2.0");
  assert.equal(writes, 0);
  assert.equal(commands, 0);
});
