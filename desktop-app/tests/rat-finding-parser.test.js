const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadParser() {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat/finding-parser.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerRatFindingParser({ registerModule() {} });
}

test("RAT parser normalizes a Maven unapproved-license diagnostic", () => {
  const parser = loadParser();
  const finding = parser.parseDiagnostic({
    message: "Files with unapproved licenses: module/src/test/resources/sample.snapshot",
    source: "maven"
  }, { projectPath: "C:/Project" });
  assert.equal(finding.kind, "unapproved-license");
  assert.equal(finding.filePath, "C:/Project/module/src/test/resources/sample.snapshot");
  assert.equal(finding.source, "maven-rat");
});

test("RAT parser rejects unrelated Maven diagnostics", () => {
  assert.equal(loadParser().parseDiagnostic({ message: "Compilation failed", source: "maven" }), null);
});

test("RAT parser distinguishes summary counts and report paths from file findings", () => {
  const parser = loadParser();
  assert.equal(parser.parseUnapprovedCount("[INFO] Rat check: Summary over all files. Unapproved: 30, unknown: 30"), 30);
  assert.equal(parser.parseUnapprovedCount("[ERROR] Too many files with unapproved license: 30 See RAT report in: C:\\Project\\target\\rat.txt -> [Help 1]"), 30);
  assert.equal(parser.extractReportPath("[ERROR] Too many files with unapproved license: 30 See RAT report in: C:\\Project\\target\\rat.txt -> [Help 1]"), "C:/Project/target/rat.txt");
  assert.equal(parser.extractReportedPath("Files with unapproved licenses: 30 See RAT report in: C:\\Project\\target\\rat.txt"), "");
});