const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadPlanner() {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat/xml-edit-planner.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerRatXmlEditPlanner({ registerModule() {} });
}

test("RAT XML planner adds a narrow inputExclude without reserializing the POM", () => {
  const before = [
    "<project>",
    "  <!-- keep this comment -->",
    "  <build>",
    "    <plugins>",
    "      <plugin>",
    "        <artifactId>apache-rat-plugin</artifactId>",
    "      </plugin>",
    "    </plugins>",
    "  </build>",
    "</project>",
    ""
  ].join("\n");
  const after = loadPlanner().addExclude(before, "src/test/resources/sample.snapshot");
  assert.match(after, /<inputExclude>src\/test\/resources\/sample\.snapshot<\/inputExclude>/);
  assert.match(after, /<!-- keep this comment -->/);
  assert.equal((after.match(/<project>/g) || []).length, 1);
});

test("RAT XML planner rejects documents without a safe project insertion point", () => {
  assert.throws(() => loadPlanner().addSkip("<not-project/>"), /safe insertion point/i);
});
