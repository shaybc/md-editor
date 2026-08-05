"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { validatePlanArtifact, renderPlanArtifactMarkdown, PLAN_ARTIFACT_SCHEMA_VERSION } = require("../resources/ai-companion/core/plan-artifact-schema");
const { verifyPlanArtifact } = require("../resources/ai-companion/core/plan-verification");

/** A fully valid, evidence-backed, single-implementation-step artifact. */
function validArtifact(overrides = {}) {
  return {
    schemaVersion: PLAN_ARTIFACT_SCHEMA_VERSION,
    title: "Add logout button",
    goal: "Let users sign out from the navbar.",
    requirements: [{ id: "R1", statement: "A logout button exists in the navbar", source: "user", required: true }],
    assumptions: [],
    steps: [{
      id: "S1",
      objective: "Add logout button to navbar",
      description: "Insert a button wired to the existing signOut() handler.",
      requirementsCovered: ["R1"],
      affectedAreas: ["navbar"],
      filesOrComponents: ["src/nav.js"],
      dependencies: [],
      prerequisites: [],
      actions: ["edit src/nav.js"],
      validations: ["Manual: clicking logout returns to the login screen"],
      risks: [],
      evidenceRefs: ["ev-nav"]
    }],
    sequencing: { orderedStepIds: ["S1"], parallelGroups: [] },
    risks: [],
    unresolvedQuestions: [],
    exclusions: [],
    evidenceRefs: ["ev-nav"],
    ...overrides
  };
}

const baseVerify = (artifact, extra = {}) => verifyPlanArtifact({
  artifact,
  requirements: [{ id: "R1", statement: "A logout button exists in the navbar", required: true }],
  admissibleEvidence: ["ev-nav"],
  ...extra
});

/* --------------------------------------------------------------- schema */

test("valid artifact passes schema validation and renders stable markdown", () => {
  const artifact = validArtifact();
  assert.equal(validatePlanArtifact(artifact).valid, true);
  const md = renderPlanArtifactMarkdown(artifact);
  assert.match(md, /^# Add logout button/);
  assert.match(md, /## Requirements/);
  assert.match(md, /## Steps/);
  assert.equal(md, renderPlanArtifactMarkdown(artifact), "rendering is deterministic");
});

test("schema catches missing fields, duplicate ids, and dangling references", () => {
  assert.equal(validatePlanArtifact({}).valid, false);
  const dupReq = validArtifact({ requirements: [{ id: "R1", statement: "a" }, { id: "R1", statement: "b" }] });
  assert.ok(validatePlanArtifact(dupReq).issues.some((i) => i.startsWith("duplicate_requirement")));
  const badSeq = validArtifact({ sequencing: { orderedStepIds: ["S9"], parallelGroups: [] } });
  assert.ok(validatePlanArtifact(badSeq).issues.some((i) => i.startsWith("sequencing_unknown_step")));
});

/* --------------------------------------------------------- verification */

test("a fully covered, evidence-backed plan is satisfied", () => {
  const result = baseVerify(validArtifact());
  assert.equal(result.status, "satisfied");
  assert.deepEqual(result.requirementCoverage[0], { id: "R1", required: true, covered: true, stepIds: ["S1"] });
});

test("missing requirement coverage prevents success", () => {
  const artifact = validArtifact({ steps: [{ id: "S1", objective: "unrelated work", requirementsCovered: [], actions: [], validations: [], evidenceRefs: [] }] });
  const result = baseVerify(artifact);
  assert.equal(result.status, "unsatisfied");
  assert.ok(result.reasonCodes.includes("missing_requirement_coverage"));
});

test("a silently dropped required requirement prevents success", () => {
  const result = verifyPlanArtifact({
    artifact: validArtifact(),
    requirements: [
      { id: "R1", statement: "logout button", required: true },
      { id: "R2", statement: "confirm dialog before logout", required: true }
    ],
    admissibleEvidence: ["ev-nav"]
  });
  assert.equal(result.status, "unsatisfied");
  assert.ok(result.reasonCodes.includes("requirement_dropped"));
});

test("workspace claims without admissible evidence prevent success", () => {
  const noEvidence = validArtifact({ steps: [{ ...validArtifact().steps[0], evidenceRefs: [] }] });
  assert.ok(baseVerify(noEvidence).reasonCodes.includes("unsupported_workspace_claim"));

  const wrongEvidence = validArtifact({ steps: [{ ...validArtifact().steps[0], evidenceRefs: ["ev-other"] }] });
  const result = verifyPlanArtifact({ artifact: wrongEvidence, requirements: [{ id: "R1", statement: "x", required: true }], admissibleEvidence: ["ev-nav"] });
  assert.ok(result.reasonCodes.includes("inadmissible_evidence"));
});

test("implementation steps without validation prevent success", () => {
  const noValidation = validArtifact({ steps: [{ ...validArtifact().steps[0], validations: [] }] });
  assert.ok(baseVerify(noValidation).reasonCodes.includes("missing_validation_step"));
});

test("unsequenced multi-step plans prevent success", () => {
  const artifact = validArtifact({
    steps: [validArtifact().steps[0], { id: "S2", objective: "more", requirementsCovered: ["R1"], actions: [], validations: [], evidenceRefs: [] }],
    sequencing: { orderedStepIds: ["S1"], parallelGroups: [] }
  });
  assert.ok(baseVerify(artifact).reasonCodes.includes("unsequenced_steps"));
});

test("blocking unresolved questions yield blocked", () => {
  const artifact = validArtifact({ unresolvedQuestions: [{ id: "Q1", question: "Which auth provider?", blocking: true }] });
  const result = baseVerify(artifact);
  assert.equal(result.status, "blocked");
  assert.ok(result.reasonCodes.includes("blocking_unresolved_question"));
});

test("a stale proposal is unverified, not satisfied", () => {
  const result = baseVerify(validArtifact(), { proposalDecisionId: "d1", currentProposalDecisionId: "d2" });
  assert.equal(result.status, "unverified");
  assert.equal(result.fresh, false);
});

test("detected mutation is unsatisfied", () => {
  const result = baseVerify(validArtifact(), { mutationOccurred: true });
  assert.equal(result.status, "unsatisfied");
  assert.ok(result.reasonCodes.includes("mutation_detected"));
});

test("provisional requirements cannot reach satisfied without confirmation", () => {
  const result = baseVerify(validArtifact(), { requirementsProvisional: true });
  assert.equal(result.status, "provisional");
  assert.ok(result.reasonCodes.includes("provisional_requirements_unconfirmed"));

  const confirmed = baseVerify(validArtifact(), { requirementsProvisional: true, userConfirmed: true });
  assert.equal(confirmed.status, "satisfied");
});

test("confident prose cannot bypass verification (only structured checks decide)", () => {
  // An artifact that merely asserts completeness in text but omits coverage.
  const artifact = validArtifact({
    goal: "This plan is complete and fully covers everything.",
    steps: [{ id: "S1", objective: "done", requirementsCovered: [], actions: [], validations: [], evidenceRefs: [] }]
  });
  assert.notEqual(baseVerify(artifact).status, "satisfied");
});
