"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeIntentContract } = require("../resources/ai-companion/core/intent-contract");
const {
  evaluateMutationControl,
  getOpenControllingDecisions,
  globMatch
} = require("../resources/ai-companion/core/intent-mutation-control");

function contractWith(decisions, namedTargets) {
  return normalizeIntentContract({
    goal: "g",
    expectedOutcome: "o",
    acceptanceCriteria: [{ description: "c" }],
    unresolvedDecisions: decisions,
    namedTargets
  });
}

test("capability-scoped decision blocks exactly its capability", () => {
  const contract = contractWith([{ description: "Which API shape?", controlsMutation: true, controlledCapabilities: ["workspace.file.write"] }]);
  const blocked = evaluateMutationControl("apply_edit", { path: "x.js" }, contract);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.via, "capability");
  // A different capability under a scoped decision is not blocked.
  assert.equal(evaluateMutationControl("git_panel_commit", {}, contract).blocked, false);
  // Reads are never blocked.
  assert.equal(evaluateMutationControl("read_file", { path: "x.js" }, contract).blocked, false);
});

test("target-scoped decision blocks its target, allows an associated other target, and blocks unknown targets", () => {
  const contract = contractWith(
    [{ description: "d", controlsMutation: true, controlledTargets: ["T1"] }],
    { files: [{ id: "T1", value: "src/a.js", status: "confirmed" }, { id: "T2", value: "src/b.js", status: "confirmed" }] }
  );
  assert.equal(evaluateMutationControl("apply_edit", { path: "src/a.js" }, contract).via, "target");
  assert.equal(evaluateMutationControl("apply_edit", { path: "src/b.js" }, contract).blocked, false);
  assert.equal(evaluateMutationControl("apply_edit", { path: "src/unknown.js" }, contract).via, "unknown-target");
});

test("a decision with no scope blocks every effectful tool but no reads", () => {
  const contract = contractWith([{ description: "unresolved", controlsMutation: true }]);
  assert.equal(evaluateMutationControl("git_panel_commit", {}, contract).via, "unknown-scope");
  assert.equal(evaluateMutationControl("apply_edit", { path: "x" }, contract).blocked, true);
  assert.equal(evaluateMutationControl("request_send", { requestId: "r" }, contract).blocked, true);
  assert.equal(evaluateMutationControl("read_file", { path: "x" }, contract).blocked, false);
  assert.equal(evaluateMutationControl("graph_apply_filter", {}, contract).blocked, false, "ui-state is not blocked");
});

test("non-controlling decisions are ignored", () => {
  const contract = contractWith([{ description: "d", controlsMutation: false, controlledCapabilities: ["workspace.file.write"] }]);
  assert.equal(getOpenControllingDecisions(contract).length, 0);
  assert.equal(evaluateMutationControl("apply_edit", { path: "x" }, contract).blocked, false);
});

test("controlledTargets accept literal paths and globs", () => {
  const contract = contractWith([{ description: "d", controlsMutation: true, controlledTargets: ["src/**"] }]);
  assert.equal(evaluateMutationControl("write_file", { path: "src/deep/x.js" }, contract).blocked, true);
  assert.equal(evaluateMutationControl("write_file", { path: "lib/x.js" }, contract).via, "unknown-target");
});

test("globMatch handles single-segment, cross-segment, and exact patterns", () => {
  assert.equal(globMatch("src/*.js", "src/a.js"), true);
  assert.equal(globMatch("src/*.js", "src/a/b.js"), false);
  assert.equal(globMatch("src/**", "src/a/b.js"), true);
  assert.equal(globMatch("exact.js", "exact.js"), true);
  assert.equal(globMatch("exact.js", "other.js"), false);
});

test("no contract or no decisions never blocks", () => {
  assert.equal(evaluateMutationControl("apply_edit", { path: "x" }, null).blocked, false);
  assert.equal(evaluateMutationControl("apply_edit", { path: "x" }, contractWith([])).blocked, false);
});
