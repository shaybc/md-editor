const test = require("node:test");
const assert = require("node:assert/strict");

const {
  registerMarkdownViewerLineDelimiterConversion,
  parseExtensionPatterns,
  convertLineDelimiters,
  isPathInsideFolder,
  collectChildFolderPaths
} = require("../resources/js/editor/line-delimiter-conversion.js");

test("line delimiter conversion normalizes mixed endings and preserves final newline presence", () => {
  assert.equal(convertLineDelimiters("one\r\ntwo\rthree\n", "\n"), "one\ntwo\nthree\n");
  assert.equal(convertLineDelimiters("one\ntwo", "\r\n"), "one\r\ntwo");
});

test("extension patterns accept editor-style values case-insensitively", () => {
  assert.deepEqual(parseExtensionPatterns(".MD, *.js txt;MD"), ["md", "js", "txt"]);
});

test("workspace containment rejects sibling path prefixes", () => {
  assert.equal(isPathInsideFolder("C:/work/app/file.md", "C:/work/app"), true);
  assert.equal(isPathInsideFolder("C:/work/application/file.md", "C:/work/app"), false);
});

test("folder planning honors recursion, extensions, no-op files, and deterministic sorting", async () => {
  const directories = new Map([
    ["C:/work", [
      { entry: "nested", type: "DIRECTORY" },
      { entry: "z.md", type: "FILE" },
      { entry: "ignore.bin", type: "FILE" }
    ]],
    ["C:/work/nested", [
      { entry: "a.js", type: "FILE" },
      { entry: "same.md", type: "FILE" }
    ]]
  ]);
  const contents = new Map([
    ["C:/work/z.md", "z\r\n"],
    ["C:/work/ignore.bin", "ignored\r\n"],
    ["C:/work/nested/a.js", "a\r"],
    ["C:/work/nested/same.md", "same\n"]
  ]);
  const filesystem = {
    async readDirectory(path) { return directories.get(path) || []; },
    async readFile(path) { return contents.get(path); },
    async writeFile(path, content) { contents.set(path, content); }
  };
  const app = { services: {}, registerModule() {} };
  const service = registerMarkdownViewerLineDelimiterConversion(app, { filesystem });

  const recursive = await service.collectPlan({
    workspacePath: "C:/work",
    folderPath: "C:/work",
    includeSubfolders: true,
    extensions: ".md, *.js",
    delimiter: "\n"
  });
  assert.deepEqual(recursive.entries.map((entry) => entry.relativePath), ["nested/a.js", "z.md"]);

  const direct = await service.collectPlan({
    workspacePath: "C:/work",
    folderPath: "C:/work",
    includeSubfolders: false,
    extensions: "md",
    delimiter: "\n"
  });
  assert.deepEqual(direct.entries.map((entry) => entry.relativePath), ["z.md"]);

  const result = await service.applyPlan(recursive, ["C:/work/nested/a.js"]);
  assert.equal(result.converted.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(contents.get("C:/work/nested/a.js"), "a\n");
  assert.equal(contents.get("C:/work/z.md"), "z\r\n");
});


test("child folder collection only reads one folder level", async () => {
  const visited = [];
  const filesystem = {
    async readDirectory(path) {
      visited.push(path);
      return [
        { entry: "z", type: "DIRECTORY" },
        { entry: "a", type: "DIRECTORY" },
        { entry: "file.md", type: "FILE" }
      ];
    }
  };

  const folders = await collectChildFolderPaths(filesystem, "C:/work");

  assert.deepEqual(visited, ["C:/work"]);
  assert.deepEqual(folders, ["C:/work/a", "C:/work/z"]);
});
test("planning skips binary and unreadable files", async () => {
  const filesystem = {
    async readDirectory() {
      return [{ entry: "binary.txt", type: "FILE" }, { entry: "missing.txt", type: "FILE" }];
    },
    async readFile(path) {
      if (path.endsWith("binary.txt")) return "a\0b\r\n";
      throw new Error("denied");
    },
    async writeFile() {}
  };
  const service = registerMarkdownViewerLineDelimiterConversion({ services: {}, registerModule() {} }, { filesystem });
  const plan = await service.collectPlan({ workspacePath: "C:/work", folderPath: "C:/work", extensions: "txt", delimiter: "\n" });
  assert.equal(plan.entries.length, 0);
  assert.deepEqual(plan.skipped.map((entry) => entry.reason), ["binary", "unreadable"]);
});
