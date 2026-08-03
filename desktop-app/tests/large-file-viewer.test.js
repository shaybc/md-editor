const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webRoot = path.resolve(__dirname, "..", "resources");

function loadLargeFileViewer() {
  const context = {
    window: {},
    console,
    setTimeout,
    clearTimeout
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(webRoot, "js", "files", "large-file-viewer.js"), "utf8"),
    context
  );
  const app = {
    services: {},
    registerModule(name, api) {
      this.services[name] = api;
    }
  };
  return context.window.registerMarkdownViewerLargeFileViewer(app, {
    getFileName(filePath) {
      return String(filePath || "").split(/[\\/]/).pop() || "document.txt";
    },
    isTextDocumentPath(filePath) {
      return /\.(txt|log|json|md)$/i.test(filePath || "");
    }
  });
}

test("large file viewer routes large or long-line text away from the editor", () => {
  const viewer = loadLargeFileViewer();

  assert.equal(viewer.shouldUseLargeFileViewer({ name: "small.txt", size: 120 }, "small.txt"), false);
  assert.equal(viewer.shouldUseLargeFileViewer({ name: "large.log", size: viewer.LARGE_FILE_VIEWER_BYTES + 1 }, "large.log"), true);
  assert.equal(
    viewer.shouldUseLargeFileViewer({ fullPath: "C:/tmp/report.json", size: viewer.LARGE_FILE_VIEWER_BYTES + 1 }),
    true
  );
  assert.equal(
    viewer.shouldUseLargeFileViewer(
      { name: "one-line.json" },
      "one-line.json",
      "x".repeat(viewer.LARGE_FILE_VIEWER_LINE_CHARS + 1)
    ),
    true
  );
});

test("large document classifier routes converter reports to the read-only viewer", () => {
  const viewer = loadLargeFileViewer();
  const result = viewer.classifyLargeDocumentOpen({ name: "missing_dependencies_report.json", size: 120 }, "missing_dependencies_report.json");
  const legacy = viewer.classifyLargeDocumentOpen({ name: "_java_converter_report.json", size: 120 }, "_java_converter_report.json");

  assert.equal(result.useViewer, true);
  assert.equal(result.reason, "converter-report-json");
  assert.equal(result.readOnly, true);
  assert.equal(legacy.useViewer, true);
});

test("large document classifier keeps ordinary small JSON editable", () => {
  const viewer = loadLargeFileViewer();
  const result = viewer.classifyLargeDocumentOpen({ name: "settings.json", size: 120 }, "settings.json", "{\"ok\":true}");

  assert.equal(result.useViewer, false);
});

test("large document classifier routes heavy JSON and text to the viewer", () => {
  const viewer = loadLargeFileViewer();
  const bigJson = viewer.classifyLargeDocumentOpen(
    { name: "report.json", size: viewer.HEAVY_JSON_VIEWER_BYTES + 1 },
    "report.json"
  );
  const manyLineJson = viewer.classifyLargeDocumentOpen(
    { name: "report.json" },
    "report.json",
    Array.from({ length: viewer.HEAVY_JSON_VIEWER_LINES + 2 }, () => "{}").join("\n")
  );
  const bigText = viewer.classifyLargeDocumentOpen(
    { name: "trace.log", size: viewer.HEAVY_TEXT_VIEWER_BYTES + 1 },
    "trace.log"
  );

  assert.equal(bigJson.useViewer, true);
  assert.equal(bigJson.reason, "large-json");
  assert.equal(manyLineJson.useViewer, true);
  assert.equal(manyLineJson.reason, "large-json-lines");
  assert.equal(bigText.useViewer, true);
  assert.equal(bigText.reason, "large-text");
});

test("large file viewer chunks one huge line into visual rows", () => {
  const viewer = loadLargeFileViewer();
  const rows = viewer._test.buildRows("a".repeat(viewer.VISUAL_CHUNK_CHARS + 25));

  assert.equal(rows.length, 2);
  assert.equal(rows[0].lineNumber, 1);
  assert.equal(rows[0].chunkIndex, 0);
  assert.equal(rows[1].lineNumber, 1);
  assert.equal(rows[1].chunkIndex, 1);
  assert.equal(rows[1].text.length, 25);
});

test("large file viewer wraps long lines into viewport-sized visual rows", () => {
  const viewer = loadLargeFileViewer();
  const rows = viewer._test.buildRows("a".repeat(45), { wordWrap: true, wrapColumn: 20 });

  assert.equal(rows.length, 3);
  assert.equal(rows.map((row) => row.text.length).join(","), "20,20,5");
  assert.equal(rows[0].lineNumber, 1);
  assert.equal(rows[1].chunkIndex, 1);
  assert.equal(rows[2].chunkIndex, 2);
});

test("large file viewer clamps invalid wrap columns to a stable fallback", () => {
  const viewer = loadLargeFileViewer();

  assert.equal(viewer._test.normalizeWrapColumn(0), viewer.WRAPPED_ROW_FALLBACK_CHARS);
  assert.equal(viewer._test.normalizeWrapColumn(4), 20);
  assert.equal(viewer._test.normalizeWrapColumn(5000), 1000);
});

test("large file viewer calculates document stats for read-only tabs", () => {
  const viewer = loadLargeFileViewer();
  const stats = viewer._test.calculateDocumentStats("one two\nthree");

  assert.equal(stats.charCount, 13);
  assert.equal(stats.wordCount, 3);
  assert.equal(stats.readingTimeMinutes, 1);
});
