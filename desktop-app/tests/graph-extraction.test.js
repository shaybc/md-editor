const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadGraphExtractionApi() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/graph/extraction.js"), "utf8");
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

test("extracts unresolved dependency section entries", () => {
  const api = loadGraphExtractionApi();
  const entries = JSON.parse(JSON.stringify(api.extractUnresolvedDependencies(`# Main

## Dependencies

No local code dependencies found.

## Unresolved Dependencies

- \`com.foo.MissingClient\` (missing class, line 4)
- \`com.foo.tools.*\` (missing package, wildcard, line 5)
- \`com.foo.StaticUtil\` (missing static owner, static, line 6)

## Code Members
`)));

  assert.deepEqual(entries, [
    {
      symbol: "com.foo.MissingClient",
        kind: "class",
        wildcard: false,
        staticImport: false,
        language: "java",
        line: 4
      },
      {
        symbol: "com.foo.tools.*",
        kind: "package",
        wildcard: true,
        staticImport: false,
        language: "java",
        line: 5
      },
      {
        symbol: "com.foo.StaticUtil",
        kind: "static-owner",
        wildcard: false,
        staticImport: true,
        language: "java",
        line: 6
      }
  ]);
});

test("extracts source file from generated markdown frontmatter", () => {
  const api = loadGraphExtractionApi();

  assert.equal(api.extractSourceFileFromFrontmatter(`---
entity_type: class
source_file: C:\\workspace\\src\\main\\java\\app\\Main.java
source_hash: abc123
---

# Main.java
`), "C:\\workspace\\src\\main\\java\\app\\Main.java");

  assert.equal(api.extractSourceFileFromFrontmatter(`# Main
`), "");
});
