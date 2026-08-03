const test = require("node:test");
const assert = require("node:assert/strict");

const { registerMarkdownViewerProjectProblemsBroker, reconcileStableRows } = require("../resources/js/lsp/project-problems-broker.js");

test("combined snapshots fill errors, then warnings, then information", async () => {
  const app = { registerModule() {} };
  const milestones = [];
  const broker = registerMarkdownViewerProjectProblemsBroker(app, {
    diagnosticLifecycleTrace: { mark: (milestone, details) => milestones.push({ milestone, details }) },
    getMaximumProblems: () => 5,
    getWorkspaceRoot: () => "C:/project"
  });
  broker.registerProvider("java", provider([
    row("j-info", "information"), row("j-error", "error")
  ]));
  broker.registerProvider("kotlin", provider([
    row("k-warning", "warning"), row("k-error", "error")
  ]));
  await broker.refresh();
  assert.deepEqual(broker.getProblems({ limit: 5 }).problems.map((problem) => problem.severity), ["error", "error", "warning", "information"]);
  const released = milestones.find((entry) => entry.milestone === "problems-snapshot-released");
  assert.deepEqual(released.details.providerCounts, {
    java: { totalCount: 2, availableCount: 2, retainedAfterFailure: false },
    kotlin: { totalCount: 2, availableCount: 2, retainedAfterFailure: false }
  });
  assert.deepEqual(released.details.counts, { error: 2, warning: 1, information: 1 });
});

test("reconciliation removes retracted rows and preserves surviving order", () => {
  const previous = [row("a", "error"), row("b", "error"), row("w", "warning")];
  const incoming = [row("b", "error"), row("c", "error"), row("w", "warning")];
  assert.deepEqual(reconcileStableRows(previous, incoming, 3).map((problem) => problem.id), ["b", "c", "w"]);
});

test("one failing provider does not abort the refresh or hide the other providers", async () => {
  const app = { registerModule() {} };
  const broker = registerMarkdownViewerProjectProblemsBroker(app, { getMaximumProblems: () => 10, getWorkspaceRoot: () => "C:/project" });
  broker.registerProvider("jdt", provider([row("j-error", "error")]));
  broker.registerProvider("kotlin", {
    async getSummary() { throw new Error("Kotlin adapter is restarting."); },
    async getProblems() { throw new Error("Kotlin adapter is restarting."); },
    subscribe() { return function() {}; }
  });
  const snapshot = await broker.refresh();
  assert.equal(snapshot.problems.length, 1);
  assert.equal(snapshot.problems[0].id, "jdt:j-error");
});

test("a provider that fails transiently keeps its previous rows until it recovers", async () => {
  const app = { registerModule() {} };
  const broker = registerMarkdownViewerProjectProblemsBroker(app, { getMaximumProblems: () => 10, getWorkspaceRoot: () => "C:/project" });
  let failing = false;
  broker.registerProvider("jdt", {
    async getSummary() {
      if (failing) throw new Error("query timed out");
      return { id: "1", total: 1 };
    },
    async getProblems() { return { problems: [row("j-error", "error")] }; },
    subscribe() { return function() {}; }
  });
  await broker.refresh();
  failing = true;
  const duringOutage = await broker.refresh();
  assert.equal(duringOutage.problems.length, 1, "previous rows must survive a transient provider outage");
  failing = false;
  const recovered = await broker.refresh();
  assert.equal(recovered.problems.length, 1);
});

function provider(problems) {
  return {
    async getSummary() { return { id: "1", total: problems.length }; },
    async getProblems() { return { problems }; },
    subscribe() { return function() {}; }
  };
}

function row(id, severity) {
  return { id, severity, message: id, filePath: `C:/project/${id}.kt` };
}

test("quarantined provider rows do not leave a misleading reported total", async () => {
  const broker = registerMarkdownViewerProjectProblemsBroker({ registerModule() {} }, { getMaximumProblems: () => 5000 });
  broker.registerProvider("jdt", {
    getSummary: () => ({ id: "1", total: 3209 }),
    getProblems: () => ({ problems: [{ id: "false-kotlin", severity: "error", message: "false mixed diagnostic" }] }),
    filterProblem: () => false,
    subscribe: () => () => {}
  });
  await broker.refresh("C:/Project");
  assert.equal(broker.getSummary().total, 0);
  assert.equal(broker.getProblems({ limit: 100 }).problems.length, 0);
});

test("generation commit is atomic and retains the previous snapshot when a provider changes mid-capture", async () => {
  let currentGeneration = 1;
  let kotlinSnapshotId = "kotlin-1";
  let changeDuringCapture = false;
  const broker = registerMarkdownViewerProjectProblemsBroker({ registerModule() {} }, {
    getMaximumProblems: () => 10,
    isGenerationCurrent: (generationId) => generationId === currentGeneration,
    onProviderInvalidated() {}
  });
  broker.registerProvider("jdt", {
    getSummary: () => ({ id: "jdt-live", total: 1 }),
    getProblems: (query) => ({ snapshotId: query.snapshotId, totalCount: 1, problems: [row("java", "error")] }),
    subscribe: () => () => {}
  });
  broker.registerProvider("kotlin", {
    getSummary: () => ({ id: kotlinSnapshotId, total: 1 }),
    getProblems() {
      if (changeDuringCapture) kotlinSnapshotId = "kotlin-2";
      return { snapshotId: kotlinSnapshotId, totalCount: 1, problems: [row("kotlin", "warning")] };
    },
    subscribe: () => () => {}
  });

  const first = await broker.commitGeneration({
    generationId: 1,
    workspaceRoot: "C:/project",
    requiredProviderIds: ["jdt"],
    snapshotIds: { jdt: "jdt-frozen-1" }
  });
  assert.equal(first.generationId, 1);
  const firstPage = broker.getProblems({ limit: 10 });
  assert.equal(Object.isFrozen(firstPage.problems[0]), true);
  assert.deepEqual(firstPage.problems.map((problem) => problem.id), ["jdt:java"]);

  currentGeneration = 2;
  changeDuringCapture = true;
  const stale = await broker.commitGeneration({
    generationId: 2,
    workspaceRoot: "C:/project",
    requiredProviderIds: ["kotlin"]
  });
  assert.equal(stale.stale, true);
  assert.equal(broker.getSummary().generationId, 1);
  assert.deepEqual(broker.getProblems({ limit: 10 }).problems.map((problem) => problem.id), ["jdt:java"]);
});

test("production refresh scheduling routes through generation invalidation", async () => {
  const invalidations = [];
  let refreshReads = 0;
  const broker = registerMarkdownViewerProjectProblemsBroker({ registerModule() {} }, {
    onProviderInvalidated: (providerId) => invalidations.push(providerId)
  });
  broker.registerProvider("jdt", {
    getSummary() { refreshReads += 1; return { total: 0 }; },
    getProblems: () => ({ problems: [] }),
    subscribe: () => () => {}
  });
  broker.scheduleRefresh();
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.deepEqual(invalidations, ["jdt", "project-problems"]);
  assert.equal(refreshReads, 0);
});
