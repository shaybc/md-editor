const test = require("node:test");
const assert = require("node:assert/strict");
const { registerMarkdownViewerAnalysisGenerationCoordinator } = require("../resources/js/lsp/analysis-generation-coordinator.js");

function createHarness(options = {}) {
  const builds = [];
  const finalizations = [];
  const commits = [];
  const states = [];
  const inactivityEvents = [];
  const app = { modules: {}, registerModule(id, value) { this.modules[id] = value; } };
  const coordinator = registerMarkdownViewerAnalysisGenerationCoordinator(app, {
    stallTimeoutMs: options.stallTimeoutMs || 60000,
    maximumTimeoutMs: options.maximumTimeoutMs || 60000,
    onInactivity(value) { inactivityEvents.push(value); },
    async requestJdtProjectInventory(value) {
      return { generationId: value.generationId, projects: [{ name: "project", locationUri: "file:///C:/Project", accessible: true, javaProject: true }] };
    },
    validateJdtProjectScope(value) {
      return {
        valid: true,
        projects: value.projects,
        validatedProjectRoots: ["C:/Project"],
        missingProjectRoots: [],
        unexpectedProjects: []
      };
    },
    async requestFinalJdtBuild(value) {
      builds.push(value);
      await options.onBuild?.(value);
    },
    async finalizeJdtGeneration(value) {
      finalizations.push(value);
      return true;
    },
    async commitProblemsGeneration(value) {
      commits.push(value);
      await options.onCommit?.(value);
      return { snapshotId: `committed-${value.generationId}` };
    }
  });
  coordinator.subscribe((state) => states.push(state));
  return { coordinator, builds, finalizations, commits, states, inactivityEvents };
}

function beginJavaGeneration(coordinator, requirements = {}) {
  return coordinator.beginGeneration({
    workspaceRoot: "C:/Project",
    reason: "test",
    requirements: {
      jdt: true,
      jdtImportRequired: true,
      ...requirements
    }
  });
}

function acceptImported(coordinator, generationId) {
  coordinator.acceptJdtLifecycle({ generationId, workspaceRoot: "C:/Project", phase: "service-ready" });
  coordinator.acceptJdtLifecycle({ generationId, workspaceRoot: "C:/Project", phase: "import-complete" });
  coordinator.acceptJdtLifecycle({ generationId, workspaceRoot: "C:/Project", phase: "build-complete" });
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("initial JDT build completion validates inventory without a second managed import", async () => {
  const harness = createHarness();
  const generationId = beginJavaGeneration(harness.coordinator);
  harness.coordinator.acceptJdtLifecycle({ generationId, workspaceRoot: "C:/Project", phase: "service-ready" });
  harness.coordinator.acceptJdtLifecycle({ generationId, workspaceRoot: "C:/Project", phase: "build-complete" });
  await nextTurn();

  const state = harness.coordinator.getState();
  assert.equal(state.providers.jdt.importReady, true);
  assert.equal(state.providers.jdt.initialBuildComplete, true);
  assert.equal(state.providers.jdt.inventoryStatus, "validated");
});

test("provider requirements can be resolved only once per generation", () => {
  const harness = createHarness();
  const generationId = harness.coordinator.beginGeneration({ workspaceRoot: "C:/Project", reason: "detect" });
  assert.equal(harness.coordinator.setRequirements({
    generationId,
    workspaceRoot: "C:/Project",
    requirements: { jdt: true, kotlin: true, kotlinAbiRequired: true }
  }), true);
  assert.equal(harness.coordinator.setRequirements({
    generationId,
    workspaceRoot: "C:/Project",
    requirements: { jdt: false, kotlin: false }
  }), false);
  assert.equal(harness.coordinator.getState().requirements.kotlin, true);
});

test("analysis generation accepts final-build response and lifecycle completion in either order", async () => {
  for (const lifecycleFirst of [true, false]) {
    let releaseBuild;
    const buildPending = new Promise((resolve) => { releaseBuild = resolve; });
    const harness = createHarness({ onBuild: () => buildPending });
    const generationId = beginJavaGeneration(harness.coordinator);
    acceptImported(harness.coordinator, generationId);
    await nextTurn();
    assert.equal(harness.builds.length, 1);

    if (lifecycleFirst) {
      harness.coordinator.acceptJdtLifecycle({ generationId, workspaceRoot: "C:/Project", phase: "build-complete" });
      releaseBuild();
    } else {
      releaseBuild();
      await nextTurn();
      assert.equal(harness.finalizations.length, 0);
      harness.coordinator.acceptJdtLifecycle({ generationId, workspaceRoot: "C:/Project", phase: "build-complete" });
    }
    await nextTurn();
    assert.equal(harness.finalizations.length, 1);
    harness.coordinator.markJdtDiagnosticsSettled({
      generationId,
      workspaceRoot: "C:/Project",
      snapshotId: `jdt-${generationId}`
    });
    await nextTurn();
    assert.equal(harness.commits.length, 1);
    assert.equal(harness.coordinator.getState().status, "committed");
  }
});

test("duplicate lifecycle events request exactly one final build and one commit", async () => {
  const harness = createHarness();
  const generationId = beginJavaGeneration(harness.coordinator);
  acceptImported(harness.coordinator, generationId);
  acceptImported(harness.coordinator, generationId);
  await nextTurn();
  harness.coordinator.acceptJdtLifecycle({ generationId, workspaceRoot: "C:/Project", phase: "build-complete" });
  harness.coordinator.acceptJdtLifecycle({ generationId, workspaceRoot: "C:/Project", phase: "build-complete" });
  await nextTurn();
  harness.coordinator.markJdtDiagnosticsSettled({ generationId, workspaceRoot: "C:/Project", snapshotId: "jdt" });
  harness.coordinator.markJdtDiagnosticsSettled({ generationId, workspaceRoot: "C:/Project", snapshotId: "jdt" });
  await nextTurn();
  assert.equal(harness.builds.length, 1);
  assert.equal(harness.finalizations.length, 1);
  assert.equal(harness.commits.length, 1);
});

test("mixed generation waits for Kotlin ABI, Kotlin diagnostics, and AJDT", async () => {
  const harness = createHarness();
  const generationId = beginJavaGeneration(harness.coordinator, {
    kotlin: true,
    kotlinAbiRequired: true,
    ajdt: true
  });
  acceptImported(harness.coordinator, generationId);
  await nextTurn();
  assert.equal(harness.builds.length, 0);

  harness.coordinator.markKotlinAbiReady({ generationId, workspaceRoot: "C:/Project", workspaceRevision: "1" });
  harness.coordinator.markKotlinReady({ generationId, workspaceRoot: "C:/Project", snapshotId: "kotlin-1" });
  await nextTurn();
  assert.equal(harness.builds.length, 1);
  harness.coordinator.acceptJdtLifecycle({ generationId, workspaceRoot: "C:/Project", phase: "build-complete" });
  await nextTurn();
  harness.coordinator.markJdtDiagnosticsSettled({ generationId, workspaceRoot: "C:/Project", snapshotId: "jdt-1" });
  await nextTurn();
  assert.equal(harness.commits.length, 0);
  harness.coordinator.markAjdtTerminal({ generationId, workspaceRoot: "C:/Project", outcome: "ready" });
  await nextTurn();
  assert.equal(harness.commits.length, 1);
});

test("stale events and provider failures cannot release a partial snapshot", async () => {
  const harness = createHarness();
  const firstGeneration = beginJavaGeneration(harness.coordinator);
  const secondGeneration = beginJavaGeneration(harness.coordinator);
  acceptImported(harness.coordinator, firstGeneration);
  assert.equal(harness.builds.length, 0);

  harness.coordinator.markIncomplete({
    generationId: secondGeneration,
    workspaceRoot: "C:/Project",
    code: "kotlin-analysis-failed",
    summary: "Kotlin failed.",
    notificationHandled: true
  });
  await nextTurn();
  assert.equal(harness.coordinator.getState().status, "incomplete");
  assert.equal(harness.coordinator.getState().failure.notificationHandled, true);
  assert.equal(harness.commits.length, 0);
  assert.equal(harness.coordinator.invalidateProvider("kotlin"), secondGeneration);
  assert.equal(harness.coordinator.getState().status, "incomplete");
});

test("autobuild carries imported JDT and confirmed Kotlin readiness into the next generation", async () => {
  const harness = createHarness();
  const generationId = beginJavaGeneration(harness.coordinator, { kotlin: true, kotlinAbiRequired: true });
  acceptImported(harness.coordinator, generationId);
  harness.coordinator.markKotlinReady({ generationId, workspaceRoot: "C:/Project", snapshotId: "kotlin-1" });
  harness.coordinator.markKotlinAbiReady({ generationId, workspaceRoot: "C:/Project", workspaceRevision: "abi-1" });
  await nextTurn();
  harness.coordinator.acceptJdtLifecycle({ generationId, workspaceRoot: "C:/Project", phase: "build-complete" });
  await nextTurn();
  harness.coordinator.markJdtDiagnosticsSettled({ generationId, workspaceRoot: "C:/Project", snapshotId: "jdt-1" });
  await nextTurn();
  assert.equal(harness.coordinator.getState().status, "committed");

  harness.coordinator.acceptJdtLifecycle({ generationId, workspaceRoot: "C:/Project", phase: "build-started" });
  await nextTurn();
  assert.equal(harness.coordinator.getState().reason, "jdt-autobuild");
  assert.equal(harness.coordinator.getState().providers.kotlin.ready, true);
  assert.equal(harness.coordinator.getState().providers.kotlin.abiReady, true);
  assert.equal(harness.builds.length, 2);
});

test("failure during an in-flight commit cannot publish that candidate", async () => {
  let releaseCommit;
  const commitPending = new Promise((resolve) => { releaseCommit = resolve; });
  const harness = createHarness({ onCommit: () => commitPending });
  const generationId = harness.coordinator.beginGeneration({
    workspaceRoot: "C:/Project",
    reason: "pure-kotlin",
    requirements: { kotlin: true }
  });
  harness.coordinator.markKotlinReady({ generationId, workspaceRoot: "C:/Project", snapshotId: "kotlin" });
  await nextTurn();
  assert.equal(harness.coordinator.getState().status, "committing");
  harness.coordinator.markIncomplete({ generationId, workspaceRoot: "C:/Project", code: "failed", summary: "Failed." });
  releaseCommit();
  await nextTurn();
  assert.equal(harness.coordinator.getState().status, "incomplete");
});

test("a publication after provisional settle invalidates an in-flight commit", async () => {
  let releaseFirstCommit;
  const firstCommitPending = new Promise((resolve) => { releaseFirstCommit = resolve; });
  let commitNumber = 0;
  const harness = createHarness({
    onCommit() {
      commitNumber += 1;
      return commitNumber === 1 ? firstCommitPending : undefined;
    }
  });
  const generationId = beginJavaGeneration(harness.coordinator);
  acceptImported(harness.coordinator, generationId);
  await nextTurn();
  harness.coordinator.acceptJdtLifecycle({ generationId, workspaceRoot: "C:/Project", phase: "build-complete" });
  await nextTurn();
  harness.coordinator.markJdtDiagnosticsSettled({ generationId, workspaceRoot: "C:/Project", snapshotId: "jdt-1" });
  await nextTurn();
  assert.equal(harness.coordinator.getState().status, "committing");

  harness.coordinator.markJdtDiagnosticsUnsettled({ generationId, workspaceRoot: "C:/Project" });
  releaseFirstCommit();
  await nextTurn();
  assert.equal(harness.coordinator.getState().status, "running");
  harness.coordinator.markJdtDiagnosticsSettled({ generationId, workspaceRoot: "C:/Project", snapshotId: "jdt-2" });
  await nextTurn();
  assert.equal(harness.commits.length, 2);
  assert.equal(harness.coordinator.getState().status, "committed");
});

test("inactivity and maximum-duration timers warn without failing active analysis", async () => {
  for (const timeout of [
    { stallTimeoutMs: 10, maximumTimeoutMs: 1000, expectedCode: "analysis-generation-stalled" },
    { stallTimeoutMs: 1000, maximumTimeoutMs: 10, expectedCode: "analysis-generation-timeout" }
  ]) {
    const harness = createHarness(timeout);
    const generationId = beginJavaGeneration(harness.coordinator);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const state = harness.coordinator.getState();
    assert.equal(state.status, "running");
    assert.equal(state.failure, null);
    assert.equal(state.inactivity.code, timeout.expectedCode);
    assert.ok(harness.inactivityEvents.length >= 1);
    assert.equal(harness.commits.length, 0);

    harness.coordinator.markProgress({ generationId, workspaceRoot: "C:/Project", providerId: "jdt" });
    assert.equal(harness.coordinator.getState().inactivity, null);
  }
});
