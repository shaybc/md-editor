const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("RAT pattern impact enumerates current matches with Ant-style double stars", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat/pattern-impact.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const directories = new Map([
    ["C:/Project", [{ entry: "src", type: "DIRECTORY" }, { entry: "README.md", type: "FILE" }]],
    ["C:/Project/src", [{ entry: "a.snapshot", type: "FILE" }, { entry: "Demo.java", type: "FILE" }]]
  ]);
  const api = context.window.registerMarkdownViewerRatPatternImpact({ registerModule() {} }, {
    Neutralino: { filesystem: { async readDirectory(directory) { return directories.get(directory) || []; } } }
  });
  const impact = await api.findMatches("C:/Project", "**/*.snapshot");
  assert.deepEqual(Array.from(impact.matches), ["src/a.snapshot"]);
  assert.equal(impact.truncated, false);
});
