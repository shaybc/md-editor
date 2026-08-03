const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadEditorCommandsTestApi() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/editor/commands.js"), "utf8");
  const context = { window: {}, globalThis: {} };
  context.window.window = context.window;
  vm.runInNewContext(source, context, { filename: "commands.js" });
  return context.window.registerMarkdownViewerActiveEditorCommands._test;
}

test("editor command helpers normalize indent settings", () => {
  const api = loadEditorCommandsTestApi();

  assert.equal(api.normalizeSpacesPerIndentLevel(undefined), 4);
  assert.equal(api.normalizeSpacesPerIndentLevel("8"), 8);
  assert.equal(api.normalizeSpacesPerIndentLevel(0), 1);
  assert.equal(api.normalizeSpacesPerIndentLevel(99), 16);
  assert.equal(api.normalizeTabsPerIndentLevel(undefined), 1);
  assert.equal(api.normalizeTabsPerIndentLevel("3"), 3);
});

test("editor command helpers transform case", () => {
  const api = loadEditorCommandsTestApi();

  assert.equal(api.toTitleCase("hello WORLD from md-editor"), "Hello World From Md-Editor");
  assert.equal(api.invertCase("Hello WORLD 123"), "hELLO world 123");
});

test("editor command helper expands diagnostic offsets to the nearest whole word", () => {
  const api = loadEditorCommandsTestApi();
  const source = "Builder value = context.getName();";

  assert.deepEqual({ ...api.getWordRangeNearOffset(source, source.indexOf("Builder") + 2) }, { start: 0, end: 7 });
  assert.deepEqual({ ...api.getWordRangeNearOffset(source, source.indexOf(".")) }, { start: 24, end: 31 });
  assert.deepEqual({ ...api.getWordRangeNearOffset(source, source.indexOf(";")) }, { start: 24, end: 31 });
});

test("editor command helpers trim whitespace per line", () => {
  const api = loadEditorCommandsTestApi();
  const source = "  alpha  \n\tbeta\t\r\n gamma ";

  assert.equal(api.trimLeadingSpace(source), "alpha  \nbeta\t\r\ngamma ");
  assert.equal(api.trimTrailingSpace(source), "  alpha\n\tbeta\r\n gamma");
  assert.equal(api.trimLeadingAndTrailingSpace(source), "alpha\nbeta\r\ngamma");
});

test("editor command helper sorts whole documents", () => {
  const api = loadEditorCommandsTestApi();

  assert.equal(api.sortDocumentLines("charlie\nalpha\nbravo", {
    groups: [{ enabled: true, from: 1, length: 500, comparison: "case-insensitive" }]
  }), "alpha\nbravo\ncharlie");

  assert.equal(api.sortDocumentLines("charlie\nalpha\nbravo", {
    groups: [{ enabled: true, from: 1, length: 500, descending: true, comparison: "case-insensitive" }]
  }), "charlie\nbravo\nalpha");
});

test("editor command helper applies sort comparison modes", () => {
  const api = loadEditorCommandsTestApi();

  assert.equal(api.sortDocumentLines("alpha\nBeta", {
    groups: [{ enabled: true, from: 1, length: 500, comparison: "case-sensitive" }]
  }), "alpha\nBeta");

  assert.equal(api.sortDocumentLines("10\n2\ninvalid", {
    groups: [{ enabled: true, from: 1, length: 500, comparison: "numeric" }]
  }), "2\n10\ninvalid");

  assert.equal(api.sortDocumentLines("a\nB", {
    inCharacterCodeOrder: true,
    groups: [{ enabled: true, from: 1, length: 500, comparison: "case-insensitive" }]
  }), "B\na");
});

test("editor command helper uses fallback sort groups", () => {
  const api = loadEditorCommandsTestApi();

  assert.equal(api.sortDocumentLines("a2\na1\nb1", {
    groups: [
      { enabled: true, from: 1, length: 1, comparison: "case-insensitive" },
      { enabled: true, from: 2, length: 1, comparison: "numeric" }
    ]
  }), "a1\na2\nb1");
});

test("editor command helper deletes duplicate sorted lines", () => {
  const api = loadEditorCommandsTestApi();

  assert.equal(api.sortDocumentLines("Beta\nalpha\nAlpha", {
    deleteDuplicateLines: true,
    groups: [{ enabled: true, from: 1, length: 500, comparison: "case-insensitive" }]
  }), "alpha\nBeta");

  assert.equal(api.sortDocumentLines("apple\napricot\nbanana", {
    deleteDuplicateLines: true,
    groups: [{ enabled: true, from: 1, length: 1, comparison: "case-insensitive" }]
  }), "apple\napricot\nbanana");
});

test("editor command helper leaves empty and one-line documents unchanged", () => {
  const api = loadEditorCommandsTestApi();

  assert.equal(api.sortDocumentLines("", {
    groups: [{ enabled: true, from: 1, length: 500, comparison: "case-insensitive" }]
  }), "");
  assert.equal(api.sortDocumentLines("single line", {
    groups: [{ enabled: true, from: 1, length: 500, comparison: "case-insensitive" }]
  }), "single line");
});

test("editor command helpers convert configured leading indentation", () => {
  const api = loadEditorCommandsTestApi();

  assert.equal(api.tabToSpace("\t\talpha\n\tbeta", { spacesPerIndentLevel: 2, tabsPerIndentLevel: 2 }), "  alpha\n\tbeta");
  assert.equal(api.spaceToTab("    alpha\n  beta", { spacesPerIndentLevel: 4, tabsPerIndentLevel: 1 }), "\talpha\n  beta");
  assert.equal(api.spaceToTab("        alpha", { spacesPerIndentLevel: 4, tabsPerIndentLevel: 2 }), "\t\t\t\talpha");
});

test("editor command helper duplicates the current line", () => {
  const api = loadEditorCommandsTestApi();

  const middleLine = api.getDuplicateCurrentLineEdit("alpha\nbeta\ngamma", 8);
  assert.deepEqual({ ...middleLine }, {
    insertPosition: 11,
    insertion: "beta\n",
    nextCursor: 11
  });

  const finalLine = api.getDuplicateCurrentLineEdit("alpha\nbeta", 8);
  assert.deepEqual({ ...finalLine }, {
    insertPosition: 10,
    insertion: "\nbeta",
    nextCursor: 11
  });
});

test("editor commands expose CodeMirror autocomplete preference forwarding", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/editor/commands.js"), "utf8");

  assert.match(source, /setAutocompletePreferences: function\(preferences\)/);
  assert.match(source, /codeMirrorEditor\.setAutocompletePreferences\(preferences \|\| \{\}\)/);
  assert.match(source, /getCommentCapabilities/);
  assert.match(source, /toggleBlockComment/);
  assert.match(source, /correctIndentation/);
});
