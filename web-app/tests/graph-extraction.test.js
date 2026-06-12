const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadGraphExtractionApi() {
  const source = fs.readFileSync(path.resolve(__dirname, "../js/graph/extraction.js"), "utf8");
  const context = { window: {}, console, Map };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerGraphExtraction({}, {});
}

test("graph resolver follows exact markdown file links without basename fallback", () => {
  const api = loadGraphExtractionApi();
  const lookup = api.createGraphTargetLookup(new Map([
    ["src/app/main.java", "src/app/Main.java"],
    ["src/app/helper.java", "src/app/Helper.java"],
    ["src/other/helper.java", "src/other/Helper.java"],
    ["src/shared/util.java", "src/shared/Util.java"],
  ]));

  assert.equal(
    api.resolveGraphTargetId("Helper.java.md", "src/app/Main.java.md", lookup),
    "src/app/helper.java"
  );
  assert.equal(
    api.resolveGraphTargetId("../shared/Util.java.md", "src/app/Main.java.md", lookup),
    "src/shared/util.java"
  );
  assert.equal(api.resolveGraphTargetId("Helper.java", "src/root.md", lookup), null);
});
