const assert = require("node:assert/strict");
const test = require("node:test");

const {
  JdtDiagnosticStore,
  JDT_TASK_PROBLEM_ID
} = require("../resources/bridges/jdt-proxy-bridge/jdt-diagnostic-store.cjs");

function diagnostic(message, severity, code, line = 0) {
  return {
    message,
    severity,
    code,
    source: "Java",
    range: { start: { line, character: 2 }, end: { line, character: 6 } }
  };
}

test("Java task markers are excluded from Problems and exposed through Tasks", () => {
  const store = new JdtDiagnosticStore();
  store.updatePublication({
    uri: "file:///C:/project/src/App.java",
    version: 1,
    diagnostics: [
      diagnostic("TODO finish parser", 2, JDT_TASK_PROBLEM_ID, 4),
      diagnostic("Type mismatch", 1, 16777235, 8)
    ]
  });
  const summary = store.getSummary();
  assert.equal(summary.totalCount, 1);
  assert.equal(summary.counts.error, 1);
  assert.equal(summary.taskCount, 1);
  assert.deepEqual(store.getProblems(0, 100).problems.map((problem) => problem.message), ["Type mismatch"]);
  const tasks = store.getTasks(0, 100);
  assert.equal(tasks.totalCount, 1);
  assert.equal(tasks.tasks[0].title, "TODO finish parser");
  assert.equal(tasks.tasks[0].line, 5);
  assert.equal(tasks.tasks[0].readOnly, true);
});

test("frozen Java task pages remain immutable after later publications", () => {
  const store = new JdtDiagnosticStore();
  store.updatePublication({
    uri: "file:///C:/project/src/App.java",
    version: 1,
    diagnostics: [diagnostic("TODO first", 2, JDT_TASK_PROBLEM_ID)]
  });
  const frozen = store.freezeGenerationSnapshot(11);
  store.updatePublication({
    uri: "file:///C:/project/src/App.java",
    version: 2,
    diagnostics: [diagnostic("TODO second", 2, JDT_TASK_PROBLEM_ID)]
  });
  const pinned = store.getTasks(0, 100, frozen.snapshotId);
  assert.equal(pinned.generationId, 11);
  assert.deepEqual(pinned.tasks.map((task) => task.title), ["TODO first"]);
  assert.deepEqual(store.getTasks(0, 100).tasks.map((task) => task.title), ["TODO second"]);
});
