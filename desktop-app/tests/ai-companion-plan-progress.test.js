"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { classifyPlanProgress, createPlanProgressTracker } = require("../resources/ai-companion/core/plan-progress-policy");

test("classifyPlanProgress: new evidence is progress, repeats and empty reads are not", () => {
  const seen = new Set(["read:a"]);
  assert.equal(classifyPlanProgress({ actionSignature: "read:b", seenSignatures: seen, producedNewEvidence: true }).progress, true);
  assert.equal(classifyPlanProgress({ actionSignature: "read:a", seenSignatures: seen, producedNewEvidence: true }).progress, false);
  assert.equal(classifyPlanProgress({ actionSignature: "read:c", seenSignatures: seen, producedNewEvidence: false, coverageDelta: 0 }).progress, false);
  assert.equal(classifyPlanProgress({ actionSignature: "read:d", seenSignatures: seen, coverageDelta: 1 }).progress, true);
});

test("repeated equivalent reads trigger a replan requirement after the threshold", () => {
  const tracker = createPlanProgressTracker({ noProgressThreshold: 3, maxDecisions: 100 });
  let r;
  for (let i = 0; i < 3; i += 1) {
    r = tracker.recordAction({ actionSignature: "search:auth", producedNewEvidence: false });
  }
  assert.equal(r.replanRequired, true);
});

test("legitimate progress resets the stall window", () => {
  const tracker = createPlanProgressTracker({ noProgressThreshold: 2 });
  tracker.recordAction({ actionSignature: "s1", producedNewEvidence: false });
  const good = tracker.recordAction({ actionSignature: "s2", producedNewEvidence: true });
  assert.equal(good.progress, true);
  assert.equal(good.replanRequired, false);
  assert.equal(tracker.assess().consecutiveNoProgress, 0);
});

test("plan rewrites without new coverage do not count as progress", () => {
  const tracker = createPlanProgressTracker({ noProgressThreshold: 2 });
  const first = tracker.recordPlanProposal({ coverageCount: 2 });
  assert.equal(first.progress, true);
  const rewrite = tracker.recordPlanProposal({ coverageCount: 2 });
  assert.equal(rewrite.progress, false);
  assert.equal(rewrite.reasonCode, "plan_rewrite_without_coverage");
});

test("a strategy revision equal to a blocked strategy is rejected as repeated", () => {
  const tracker = createPlanProgressTracker();
  const first = tracker.recordStrategyRevision({ strategySignature: "approach-A" });
  assert.equal(first.accepted, true);
  const repeat = tracker.recordStrategyRevision({ strategySignature: "approach-A" });
  assert.equal(repeat.accepted, false);
  assert.equal(repeat.reasonCode, "repeated_strategy");
});

test("exceeding the strategy-replan budget terminates honestly", () => {
  const tracker = createPlanProgressTracker({ maxStrategyReplans: 1 });
  tracker.recordStrategyRevision({ strategySignature: "A" });
  const second = tracker.recordStrategyRevision({ strategySignature: "B" });
  assert.equal(second.terminal, true);
  assert.equal(second.terminalStatus, "budget_exhausted");
  assert.ok(second.reasonCodes.includes("strategy_replan_budget_exhausted"));
});

test("exceeding the decision budget terminates honestly", () => {
  const tracker = createPlanProgressTracker({ maxDecisions: 2, noProgressThreshold: 99 });
  tracker.recordAction({ actionSignature: "a", producedNewEvidence: true });
  tracker.recordAction({ actionSignature: "b", producedNewEvidence: true });
  const third = tracker.recordAction({ actionSignature: "c", producedNewEvidence: true });
  assert.equal(third.terminal, true);
  assert.ok(third.reasonCodes.includes("decision_budget_exhausted"));
});

test("progress control never authorizes completion (no success signal is produced)", () => {
  const tracker = createPlanProgressTracker();
  const r = tracker.recordAction({ actionSignature: "x", producedNewEvidence: true });
  assert.equal(Object.prototype.hasOwnProperty.call(r, "status"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(r, "succeeded"), false);
});
