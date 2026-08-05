"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PLAN_DECISION_TYPES,
  derivePlanAllowedToolNames,
  createPlanControlToolDefinitions,
  classifyPlanDecisionType,
  validatePlanDecision,
  validateSinglePlanDecision
} = require("../resources/ai-companion/core/plan-decision-contract");
const {
  classifyRequestShape,
  derivePlanRequirements
} = require("../resources/ai-companion/core/plan-requirements-source");
const {
  createInitialPlanProjection,
  applyPlanEvent,
  PLAN_EVENT_TYPES
} = require("../resources/ai-companion/core/plan-state-projection");

/* ---------------------------------------------------------------- decisions */

test("plan allowlist is derived read-only and excludes every mutation tool", () => {
  const allowed = derivePlanAllowedToolNames();
  assert.ok(allowed.has("read_file"));
  assert.ok(allowed.has("search_grep"));
  for (const forbidden of ["write_file", "apply_edit", "run_command", "git_panel_commit", "plan_create"]) {
    assert.equal(allowed.has(forbidden), false, `${forbidden} must not be allowlisted`);
  }
});

test("control tools map to the five allowed plan decision types", () => {
  const names = createPlanControlToolDefinitions().map((d) => d.function.name);
  assert.deepEqual(names.sort(), ["plan_propose_completion", "plan_report_blocked", "plan_request_user_input", "plan_revise_strategy"]);
  assert.equal(classifyPlanDecisionType("plan_revise_strategy"), PLAN_DECISION_TYPES.REVISE_PLAN_STRATEGY);
  assert.equal(classifyPlanDecisionType("read_file"), PLAN_DECISION_TYPES.TOOL_CALL);
  assert.equal(classifyPlanDecisionType(""), PLAN_DECISION_TYPES.INVALID);
});

test("a valid read-only tool_call passes validation and is state-version bound", () => {
  const result = validatePlanDecision(
    { toolName: "read_file", basedOnStateVersion: 3, rationale: "inspect", expectedObservation: "file body" },
    { currentStateVersion: 3, allowedToolNames: new Set(["read_file"]) }
  );
  assert.equal(result.valid, true);
  assert.equal(result.type, PLAN_DECISION_TYPES.TOOL_CALL);
  assert.equal(result.normalized.mode, "plan");
  assert.equal(result.normalized.toolName, "read_file");
});

test("mutation decisions and mutation tools are rejected", () => {
  for (const decision of [
    { type: "write_file", basedOnStateVersion: 1 },
    { type: "commit", basedOnStateVersion: 1 },
    { toolName: "write_file", basedOnStateVersion: 1 },
    { toolName: "git_panel_commit", basedOnStateVersion: 1 }
  ]) {
    const result = validatePlanDecision(decision, { currentStateVersion: 1, allowedToolNames: new Set(["read_file"]) });
    assert.equal(result.valid, false);
    assert.ok(
      result.reasonCodes.includes("forbidden_mutation_decision") || result.reasonCodes.includes("forbidden_tool"),
      `expected forbidden reason, got ${result.reasonCodes.join(",")}`
    );
  }
});

test("stale, unknown, and non-allowlisted decisions are rejected", () => {
  const stale = validatePlanDecision(
    { toolName: "read_file", basedOnStateVersion: 2 },
    { currentStateVersion: 5, allowedToolNames: new Set(["read_file"]) }
  );
  assert.equal(stale.valid, false);
  assert.ok(stale.reasonCodes.includes("stale_decision"));

  const unknown = validatePlanDecision({ type: "teleport", basedOnStateVersion: 5 }, { currentStateVersion: 5 });
  assert.equal(unknown.valid, false);
  assert.ok(unknown.reasonCodes.includes("unsupported_decision_type"));

  const notAllowed = validatePlanDecision(
    { toolName: "search_vault_secret", basedOnStateVersion: 5 },
    { currentStateVersion: 5, allowedToolNames: new Set(["read_file"]) }
  );
  assert.equal(notAllowed.valid, false);
  assert.ok(notAllowed.reasonCodes.includes("tool_not_allowlisted"));
});

test("exactly one decision per round is enforced", () => {
  assert.equal(validateSinglePlanDecision(1).valid, true);
  assert.equal(validateSinglePlanDecision(0).valid, false);
  assert.equal(validateSinglePlanDecision(2).valid, false);
});

/* ------------------------------------------------------------- requirements */

test("simple explicit request classifies as simple", () => {
  const { shape, signals } = classifyRequestShape("Add a dark mode toggle to the settings page.");
  assert.equal(shape, "simple");
  assert.deepEqual(signals, []);
});

test("multi-part or ambiguous requests classify as complex", () => {
  assert.equal(classifyRequestShape("Add auth and refactor the router and also write tests").shape, "complex");
  assert.equal(classifyRequestShape("Maybe fix the thing, not sure where it is").shape, "complex");
  assert.equal(classifyRequestShape("").shape, "complex");
});

test("intent-contract requirements are authoritative and non-provisional", () => {
  const out = derivePlanRequirements({
    intentContract: { acceptanceCriteria: [{ id: "AC1", description: "Login works" }, { id: "AC2", description: "Errors are shown" }] },
    prompt: "whatever"
  });
  assert.equal(out.provenance, "intent-contract");
  assert.equal(out.provisional, false);
  assert.equal(out.requirements.length, 2);
  assert.equal(out.requirements[0].source, "intent-contract");
});

test("fallback for a simple request is final; for a complex request is provisional and needs clarification", () => {
  const simple = derivePlanRequirements({ prompt: "Add a logout button to the navbar." });
  assert.equal(simple.provenance, "fallback");
  assert.equal(simple.provisional, false);
  assert.equal(simple.needsClarification, false);
  assert.ok(simple.requirements.length >= 1);

  const complex = derivePlanRequirements({ prompt: "Add auth, then migrate the DB, and also maybe refactor the UI" });
  assert.equal(complex.provenance, "fallback");
  assert.equal(complex.provisional, true);
  assert.equal(complex.needsClarification, true);
  assert.ok(complex.reasonCodes.includes("fallback_requires_confirmation"));
  assert.ok(complex.requirements.every((r) => r.provisional === true));
});

test("requirements are never empty", () => {
  const out = derivePlanRequirements({ prompt: "   " });
  assert.ok(out.requirements.length >= 1);
});

/* -------------------------------------------------------------- projection */

test("initial projection is drafting at version 0 with verbatim prompt", () => {
  const p = createInitialPlanProjection({ prompt: "Plan the feature" });
  assert.equal(p.stateVersion, 0);
  assert.equal(p.plan.status, "drafting");
  assert.equal(p.prompt, "Plan the feature");
});

test("reducer is immutable and bumps stateVersion on each accepted event", () => {
  const p0 = createInitialPlanProjection({ prompt: "x" });
  const res = applyPlanEvent(p0, {
    type: PLAN_EVENT_TYPES.REQUIREMENTS_DERIVED,
    requirements: [{ id: "R1", statement: "do x", required: true }],
    provenance: "fallback",
    provisional: false
  });
  assert.equal(res.accepted, true);
  assert.equal(res.projection.stateVersion, 1);
  assert.equal(p0.stateVersion, 0, "input projection must not be mutated");
  assert.equal(res.projection.plan.status, "inspecting");
});

test("empty requirements are rejected so verification always has a target", () => {
  const p0 = createInitialPlanProjection({ prompt: "x" });
  const res = applyPlanEvent(p0, { type: PLAN_EVENT_TYPES.REQUIREMENTS_DERIVED, requirements: [] });
  assert.equal(res.accepted, false);
  assert.ok(res.reasonCodes.includes("empty_requirements"));
});

test("user clarifications are stored verbatim with source user", () => {
  const p0 = createInitialPlanProjection({ prompt: "x" });
  const res = applyPlanEvent(p0, { type: PLAN_EVENT_TYPES.CLARIFICATION_RECORDED, text: "Use Postgres, not MySQL." });
  assert.equal(res.accepted, true);
  assert.deepEqual(res.projection.plan.clarifications[0], { text: "Use Postgres, not MySQL.", source: "user", questionId: null });
});

test("stale verification against an old proposal is rejected", () => {
  let p = createInitialPlanProjection({ prompt: "x" });
  p = applyPlanEvent(p, { type: PLAN_EVENT_TYPES.PLAN_PROPOSED, artifact: { steps: [] }, decisionId: "d1" }).projection;
  const res = applyPlanEvent(p, { type: PLAN_EVENT_TYPES.VERIFICATION_APPLIED, verificationId: "v1", proposalDecisionId: "d0", status: "satisfied" });
  assert.equal(res.accepted, false);
  assert.ok(res.reasonCodes.includes("stale_verification"));
});

test("success is refused without verification and on unconfirmed provisional requirements", () => {
  let p = createInitialPlanProjection({ prompt: "x" });
  p = applyPlanEvent(p, {
    type: PLAN_EVENT_TYPES.REQUIREMENTS_DERIVED,
    requirements: [{ id: "R1", statement: "do x", required: true, provisional: true }],
    provenance: "fallback",
    provisional: true
  }).projection;

  const noVerification = applyPlanEvent(p, { type: PLAN_EVENT_TYPES.COMPLETION_TERMINATED, status: "succeeded" });
  assert.equal(noVerification.accepted, false);
  assert.ok(noVerification.reasonCodes.includes("success_without_verification"));

  // Even with a verification, provisional requirements block success unless confirmed.
  p = applyPlanEvent(p, { type: PLAN_EVENT_TYPES.PLAN_PROPOSED, artifact: { steps: [] }, decisionId: "d1" }).projection;
  p = applyPlanEvent(p, { type: PLAN_EVENT_TYPES.VERIFICATION_APPLIED, verificationId: "v1", proposalDecisionId: "d1", status: "satisfied" }).projection;
  const provisionalBlock = applyPlanEvent(p, { type: PLAN_EVENT_TYPES.COMPLETION_TERMINATED, status: "succeeded" });
  assert.equal(provisionalBlock.accepted, false);
  assert.ok(provisionalBlock.reasonCodes.includes("success_on_provisional_requirements"));

  const confirmed = applyPlanEvent(p, { type: PLAN_EVENT_TYPES.COMPLETION_TERMINATED, status: "succeeded", userConfirmed: true });
  assert.equal(confirmed.accepted, true);
});

test("no events are accepted after a terminal status", () => {
  let p = createInitialPlanProjection({ prompt: "x" });
  p = applyPlanEvent(p, { type: PLAN_EVENT_TYPES.COMPLETION_TERMINATED, status: "cancelled" }).projection;
  const res = applyPlanEvent(p, { type: PLAN_EVENT_TYPES.OBSERVATION_RECORDED, observation: { kind: "read" } });
  assert.equal(res.accepted, false);
  assert.ok(res.reasonCodes.includes("terminal_state"));
});
