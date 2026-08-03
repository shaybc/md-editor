const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const sourcePath = path.resolve(__dirname, "../resources/js/java/import-cleanup.js");

function loadModule() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const context = { window: {} };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "import-cleanup.js" });
  return context.window.registerMarkdownViewerJavaImportCleanup;
}

function cleanup(source) {
  return loadModule()._test.cleanupJavaUnusedImports(source);
}

test("Java import cleanup removes unused explicit class imports", () => {
  const result = cleanup([
    "package demo;",
    "",
    "import java.util.List;",
    "import java.util.Map;",
    "",
    "class Demo {",
    "  private List<String> names;",
    "}",
    ""
  ].join("\n"));

  assert.equal(result.removedImportCount, 1);
  assert.match(result.content, /import java\.util\.List;/);
  assert.doesNotMatch(result.content, /import java\.util\.Map;/);
});

test("Java import cleanup keeps imports used in declarations", () => {
  const result = cleanup([
    "import java.io.IOException;",
    "import java.lang.Override;",
    "import java.util.ArrayList;",
    "import java.util.List;",
    "",
    "class Demo extends ArrayList<String> {",
    "  @Override",
    "  List<String> run() throws IOException {",
    "    return this;",
    "  }",
    "}",
    ""
  ].join("\n"));

  assert.equal(result.removedImportCount, 0);
  assert.match(result.content, /import java\.io\.IOException;/);
  assert.match(result.content, /import java\.lang\.Override;/);
  assert.match(result.content, /import java\.util\.ArrayList;/);
  assert.match(result.content, /import java\.util\.List;/);
});

test("Java import cleanup ignores comments and string literals when detecting usage", () => {
  const result = cleanup([
    "import demo.CommentOnly;",
    "import demo.StringOnly;",
    "import demo.TextBlockOnly;",
    "",
    "class Demo {",
    "  // CommentOnly appears in a comment.",
    "  String value = \"StringOnly\";",
    "  String text = \"\"\"",
    "    TextBlockOnly",
    "  \"\"\";",
    "}",
    ""
  ].join("\n"));

  assert.equal(result.removedImportCount, 3);
  assert.doesNotMatch(result.content, /import demo\\.CommentOnly;/);
  assert.doesNotMatch(result.content, /import demo\\.StringOnly;/);
  assert.doesNotMatch(result.content, /import demo\\.TextBlockOnly;/);
});

test("Java import cleanup handles static imports", () => {
  const result = cleanup([
    "import static java.util.Collections.emptyList;",
    "import static java.util.Collections.singletonList;",
    "",
    "class Demo {",
    "  Object value = emptyList();",
    "}",
    ""
  ].join("\n"));

  assert.equal(result.removedImportCount, 1);
  assert.match(result.content, /import static java\.util\.Collections\.emptyList;/);
  assert.doesNotMatch(result.content, /singletonList/);
});

test("Java import cleanup preserves wildcard imports", () => {
  const result = cleanup([
    "import java.util.*;",
    "import java.io.File;",
    "",
    "class Demo {}",
    ""
  ].join("\n"));

  assert.equal(result.removedImportCount, 1);
  assert.match(result.content, /import java\.util\.\*;/);
  assert.doesNotMatch(result.content, /import java\.io\.File;/);
});

test("Java import cleanup preserves CRLF line endings", () => {
  const result = cleanup("import java.util.List;\r\nimport java.util.Map;\r\n\r\nclass Demo {\r\n  List<String> names;\r\n}\r\n");

  assert.equal(result.removedImportCount, 1);
  assert.match(result.content, /import java\.util\.List;\r\n\r\nclass Demo/);
  assert.doesNotMatch(result.content, /java\.util\.Map/);
});
