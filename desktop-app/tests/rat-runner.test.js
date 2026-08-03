const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("RAT verification distinguishes resolved, persistent, and different findings", () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat/runner.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const fingerprint = (finding) => finding.filePath;
  const api = context.window.registerMarkdownViewerRatRunner({ registerModule() {} }, {
    findingParser: {
      extractReportPath(message) {
        const match = message.match(/report in:\s*(.+?)\s*->/i);
        return match ? match[1] : "";
      },
      fingerprint,
      parseDiagnostic() { return null; },
      parseUnapprovedCount(message) {
        const match = message.match(/unapproved:\s*(\d+)/i);
        return match ? Number(match[1]) : null;
      }
    }
  });
  const original = { filePath: "a" };
  assert.equal(api.verify(original, { succeeded: true, findings: [] }).status, "Resolved");
  assert.equal(api.verify(original, { succeeded: false, findings: [{ filePath: "a" }] }).status, "Still unapproved");
  assert.equal(api.verify(original, { succeeded: false, findings: [{ filePath: "b" }] }).status, "Different RAT findings introduced");
  assert.equal(api.verify(original, { succeeded: false, findings: [], unapprovedCount: 30 }).status, "Still unapproved");
  const parsed = api.parseOutput(
    "[INFO] Rat check: Summary over all files. Unapproved: 30, unknown: 30\n[ERROR] See RAT report in: C:\\Project\\target\\rat.txt -> [Help 1]",
    "C:/Project"
  );
  assert.equal(parsed.unapprovedCount, 30);
  assert.equal(parsed.reportPath, "C:\\Project\\target\\rat.txt");
  assert.equal(parsed.findings.length, 0);
});
