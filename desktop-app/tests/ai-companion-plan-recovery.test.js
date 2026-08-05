"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PLAN_PHASES,
  planPhaseToCheckpointPhase,
  isPlanCheckpointResumable,
  resolvePlanRecovery
} = require("../resources/ai-companion/core/plan-recovery-policy");
const { CHECKPOINT_PHASES } = require("../resources/ai-companion/core/companion-checkpoint-schema");

test("every Plan phase maps to a real shared checkpoint phase (schema unchanged)", () => {
  for (const planPhase of PLAN_PHASES) {
    const mapped = planPhaseToCheckpointPhase(planPhase);
    assert.ok(CHECKPOINT_PHASES.has(mapped), `${planPhase} -> ${mapped} must be a valid checkpoint phase`);
  }
});

test("terminal checkpoints never offer resume", () => {
  assert.equal(isPlanCheckpointResumable({ checkpointKind: "terminal", phase: "terminal" }), false);
  assert.equal(isPlanCheckpointResumable({ checkpointKind: "recoverable", phase: "decision_ready" }), true);
  const decision = resolvePlanRecovery({ checkpointKind: "terminal", phase: "terminal" });
  assert.equal(decision.resumable, false);
  assert.equal(decision.continuation, "repair_terminal_projection");
});

test("a lost model call repeats from durable state", () => {
  const decision = resolvePlanRecovery({ checkpointKind: "recoverable", phase: "model_pending" });
  assert.equal(decision.continuation, "restart_decision");
  assert.equal(decision.resumable, true);
});

test("pending clarification returns as a new live interaction", () => {
  const decision = resolvePlanRecovery({ checkpointKind: "recoverable", phase: "interaction_pending" });
  assert.equal(decision.continuation, "reissue_clarification");
});

test("read-only inspections are safe to retry", () => {
  for (const phase of ["action_prepared", "action_observed"]) {
    const decision = resolvePlanRecovery({ checkpointKind: "recoverable", phase });
    assert.equal(decision.continuation, "retry_read");
    assert.ok(decision.reasonCodes.includes("read_only_retry_safe"));
  }
});

test("an interrupted verification is discarded as stale", () => {
  const decision = resolvePlanRecovery({ checkpointKind: "recoverable", phase: "verification_pending" });
  assert.equal(decision.continuation, "restart_decision");
  assert.ok(decision.invalidates.includes("verification_result"));
});

test("stale in-flight decisions are invalidated on restart", () => {
  const decision = resolvePlanRecovery({ checkpointKind: "recoverable", phase: "decision_ready" });
  assert.ok(decision.invalidates.includes("in_flight_decision"));
});

test("saved-plan finalization is idempotent on recovery", () => {
  const decision = resolvePlanRecovery({ checkpointKind: "recoverable", phase: "finalizing" });
  assert.equal(decision.continuation, "idempotent_finalize");
  assert.ok(decision.reasonCodes.includes("idempotent_save"));
});
