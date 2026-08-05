"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { evaluatePlanCompletion } = require("../resources/ai-companion/core/plan-completion-gate");
const { composePlanFinalResponse, shouldSavePlan } = require("../resources/ai-companion/core/plan-final-composer");
const { PLAN_ARTIFACT_SCHEMA_VERSION } = require("../resources/ai-companion/core/plan-artifact-schema");

function satisfiedProjection(overrides = {}) {
  return {
    plan: {
      status: "verifying",
      artifact: {
        schemaVersion: PLAN_ARTIFACT_SCHEMA_VERSION,
        title: "Add logout",
        goal: "Sign out from navbar",
        requirements: [{ id: "R1", statement: "logout button", required: true }],
        steps: [{ id: "S1", objective: "add button", requirementsCovered: ["R1"] }],
        sequencing: { orderedStepIds: ["S1"], parallelGroups: [] },
        unresolvedQuestions: []
      },
      latestProposalDecisionId: "d1",
      latestVerificationId: "v1",
      requirementsProvisional: false,
      requirements: [{ id: "R1", statement: "logout button", required: true }],
      terminalReasonCodes: [],
      unresolvedQuestions: [],
      ...overrides
    }
  };
}

const satisfiedVerification = { status: "satisfied", fresh: true, requirementCoverage: [{ id: "R1", required: true, covered: true }], reasonCodes: [] };

/* -------------------------------------------------------------- gate */

test("a satisfied, fully covered plan with no pending work completes", () => {
  const result = evaluatePlanCompletion({ projection: satisfiedProjection(), verification: satisfiedVerification, pending: {} });
  assert.equal(result.decision, "complete");
  assert.equal(result.status, "succeeded");
});

test("pending work blocks completion", () => {
  const result = evaluatePlanCompletion({ projection: satisfiedProjection(), verification: satisfiedVerification, pending: { clarification: true } });
  assert.equal(result.decision, "continue");
  assert.ok(result.reasonCodes.includes("pending_work"));
});

test("the model cannot complete without a fresh satisfied verifier result", () => {
  assert.equal(evaluatePlanCompletion({ projection: satisfiedProjection(), verification: null, pending: {} }).decision, "continue");
  assert.equal(evaluatePlanCompletion({ projection: satisfiedProjection(), verification: { status: "satisfied", fresh: false }, pending: {} }).decision, "continue");
  assert.equal(evaluatePlanCompletion({ projection: satisfiedProjection(), verification: { status: "unsatisfied", reasonCodes: ["x"] }, pending: {} }).decision, "continue");
});

test("blocked verification terminates as blocked", () => {
  const result = evaluatePlanCompletion({ projection: satisfiedProjection(), verification: { status: "blocked", reasonCodes: ["blocking_unresolved_question"] }, pending: {} });
  assert.equal(result.decision, "terminate");
  assert.equal(result.status, "blocked");
});

test("incomplete coverage prevents success even when the verifier says satisfied", () => {
  const verification = { status: "satisfied", fresh: true, requirementCoverage: [{ id: "R1", required: true, covered: false }] };
  const result = evaluatePlanCompletion({ projection: satisfiedProjection(), verification, pending: {} });
  assert.equal(result.decision, "continue");
  assert.ok(result.reasonCodes.includes("incomplete_coverage"));
});

test("provisional requirements block success unless confirmed", () => {
  const projection = satisfiedProjection({ requirementsProvisional: true });
  assert.equal(evaluatePlanCompletion({ projection, verification: satisfiedVerification, pending: {} }).decision, "continue");
  assert.equal(evaluatePlanCompletion({ projection, verification: satisfiedVerification, pending: {}, userConfirmed: true }).decision, "complete");
});

test("forced termination ends honestly without success", () => {
  const result = evaluatePlanCompletion({ projection: satisfiedProjection(), verification: { status: "unsatisfied" }, pending: {}, terminationRequested: true, terminationStatus: "budget_exhausted" });
  assert.equal(result.decision, "terminate");
  assert.equal(result.status, "budget_exhausted");
});

/* --------------------------------------------------------- composer */

test("success composes the plan markdown from the artifact and marks it saveable once", () => {
  const projection = satisfiedProjection({ status: "succeeded" });
  const out = composePlanFinalResponse({ projection, outcome: "succeeded" });
  assert.equal(out.success, true);
  assert.match(out.content, /^# Add logout/);
  assert.equal(out.savedPlanBody, out.content);
  assert.equal(shouldSavePlan(projection), true);
  const saved = satisfiedProjection({ status: "succeeded", savedPlanRef: "plan-123" });
  assert.equal(shouldSavePlan(saved), false, "already-saved plans are not saved again");
});

test("non-success responses are honest and never claim success", () => {
  const projection = satisfiedProjection({ status: "blocked", requirementsProvisional: true, terminalReasonCodes: ["blocking_unresolved_question"] });
  const out = composePlanFinalResponse({ projection, outcome: "blocked", verification: { reasonCodes: ["blocking_unresolved_question"] } });
  assert.equal(out.success, false);
  assert.equal(out.savedPlanBody, null);
  assert.match(out.content, /blocked/i);
  assert.doesNotMatch(out.content, /\bsucceeded\b|\bcompleted successfully\b/i);
  assert.match(out.content, /need your confirmation/i);
});

test("composition is deterministic", () => {
  const projection = satisfiedProjection({ status: "succeeded" });
  assert.equal(
    composePlanFinalResponse({ projection, outcome: "succeeded" }).content,
    composePlanFinalResponse({ projection, outcome: "succeeded" }).content
  );
});
