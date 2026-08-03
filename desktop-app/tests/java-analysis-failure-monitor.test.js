const assert = require("node:assert/strict");
const test = require("node:test");
const { registerMarkdownViewerJavaAnalysisFailureMonitor } = require("../resources/js/lsp/java-analysis-failure-monitor.js");

test("retry reset clears occurrences while preserving modal notification history", () => {
  const monitor = registerMarkdownViewerJavaAnalysisFailureMonitor({ registerModule() {} });
  const event = { workspaceId: "java:C:/Project", code: "maven-import-failed", fingerprint: "maven:1", fatal: false, summary: "Maven import failed." };
  const first = monitor.record(event);
  monitor.markNotified(first.workspaceId, first.fingerprint);
  monitor.record(event);
  monitor.reset(event.workspaceId, { preserveNotifications: true });
  const retried = monitor.record(event);

  assert.equal(retried.count, 1);
  assert.equal(retried.shouldNotify, false);
  monitor.reset(event.workspaceId);
  assert.equal(monitor.record(event).shouldNotify, true);
});
