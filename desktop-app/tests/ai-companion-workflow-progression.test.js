"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createWorkflowState, getProfile } = require("../resources/ai-companion/core/task-profiles");
const {
  advanceWorkflowStep,
  derivePreferencesStepEvent,
  verifyPersistedValues,
  EVENT_SOURCE
} = require("../resources/ai-companion/core/workflow-progression");

const profile = getProfile("preferences-update");

test("a model-sourced event cannot advance a step", () => {
  const state = createWorkflowState(profile);
  const r = advanceWorkflowStep(state, { stepId: "resolve", source: EVENT_SOURCE.MODEL, evidenceAccepted: true });
  assert.equal(r.changed, false);
  assert.equal(r.rejectedReason, "model_cannot_advance_steps");
  assert.equal(r.workflowState.steps[0].status, "active");
});

test("unverified evidence cannot advance a step", () => {
  const state = createWorkflowState(profile);
  const r = advanceWorkflowStep(state, { stepId: "resolve", source: EVENT_SOURCE.REDUCER, evidenceAccepted: false });
  assert.equal(r.changed, false);
  assert.equal(r.rejectedReason, "unverified_evidence");
});

test("a reducer-sourced accepted event advances and activates the next step", () => {
  const state = createWorkflowState(profile);
  const r = advanceWorkflowStep(state, { stepId: "resolve", source: EVENT_SOURCE.REDUCER, evidenceAccepted: true });
  assert.equal(r.changed, true);
  assert.equal(r.workflowState.steps[0].status, "completed");
  assert.equal(r.workflowState.steps[1].status, "active");
  assert.equal(r.workflowState.activeStepId, "update");
});

test("completing the last step marks the profile completed", () => {
  let state = createWorkflowState(profile);
  for (const stepId of ["resolve", "update", "verify"]) {
    state = advanceWorkflowStep(state, { stepId, source: EVENT_SOURCE.REDUCER, evidenceAccepted: true }).workflowState;
  }
  assert.equal(state.activeStepId, null);
  assert.equal(state.profileStatus, "completed");
});

test("derive step events only from matching accepted observations", () => {
  const state = createWorkflowState(profile);
  // Wrong tool for the active step -> no event.
  assert.equal(derivePreferencesStepEvent(state, { tool: "preferences_update", accepted: true }), null);
  // resolve advances only when all keys resolved.
  assert.equal(derivePreferencesStepEvent(state, { tool: "preferences_search", accepted: true, resolvedAllKeys: false }), null);
  const ev = derivePreferencesStepEvent(state, { tool: "preferences_search", accepted: true, resolvedAllKeys: true });
  assert.deepEqual(ev, { stepId: "resolve", source: "reducer", evidenceAccepted: true });
});

// --- read-back verification -------------------------------------------------

test("read-back verifies persisted values, not tool success", () => {
  const requested = { "aiCompanionSettings.a": true, "aiCompanionSettings.b": true };
  const observed = { "aiCompanionSettings.a": true, "aiCompanionSettings.b": true };
  const r = verifyPersistedValues(requested, observed);
  assert.equal(r.verified, true);
  assert.equal(r.mismatches.length, 0);
});

test("read-back mismatch fails verification even if update reported success", () => {
  const requested = { x: true, y: true };
  const observed = { x: true, y: false }; // persistence changed / failed for y
  const r = verifyPersistedValues(requested, observed);
  assert.equal(r.verified, false);
  assert.equal(r.mismatches.length, 1);
  assert.equal(r.mismatches[0].key, "y");
  assert.equal(r.mismatches[0].observedValue, false);
});

test("a missing read-back key fails verification", () => {
  const r = verifyPersistedValues({ x: true, y: true }, { x: true });
  assert.equal(r.verified, false);
  assert.deepEqual(r.missing, ["y"]);
});
