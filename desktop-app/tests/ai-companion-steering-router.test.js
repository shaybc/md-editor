"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { decideSteering, buildSteeringFeedback, unmetCriterionIds } = require("../resources/ai-companion/core/completion-steering");

const contract = {
  taskType: "conformance",
  acceptanceCriteria: [
    { id: "AC1", shape: "conformance-inspection", statement: "the code was inspected" },
    { id: "AC2", shape: "conditional-action", statement: "the doc was updated if warranted" }
  ]
};

function assessment(overall, criteria) {
  return { overallStatus: overall, criteria };
}

test("complete assessment stops as converged", () => {
  const d = decideSteering({ assessment: assessment("complete", [{ id: "AC1", status: "met" }]), contract, iteration: 0, maxRevisions: 3 });
  assert.deepEqual({ action: d.action, reason: d.reason }, { action: "stop", reason: "converged" });
});

test("unsatisfied criterion with budget left steers the agent (continue)", () => {
  const d = decideSteering({
    assessment: assessment("incomplete", [
      { id: "AC1", status: "met" },
      { id: "AC2", status: "unmet", arbitration: { class: "unsatisfied", guidance: "perform the update" } }
    ]),
    contract, iteration: 0, maxRevisions: 3
  });
  assert.equal(d.action, "continue");
  assert.equal(d.reason, "unsatisfied");
  assert.match(d.feedback, /AC2/);
  assert.match(d.feedback, /perform the update/);
});

test("blocked failure stops and never retries (scenario: blocked-stops)", () => {
  const d = decideSteering({
    assessment: assessment("incomplete", [{ id: "AC1", status: "unmet", arbitration: { class: "blocked" } }]),
    contract, iteration: 0, maxRevisions: 3
  });
  assert.deepEqual({ action: d.action, reason: d.reason }, { action: "stop", reason: "blocked" });
});

test("ambiguity/spec-gap route to contract revision", () => {
  const amb = decideSteering({ assessment: assessment("incomplete", [{ id: "AC1", status: "unmet", arbitration: { class: "ambiguity" } }]), contract, iteration: 0, maxRevisions: 3 });
  assert.equal(amb.action, "revise-contract");
  assert.equal(amb.reason, "ambiguity");
  const gap = decideSteering({ assessment: assessment("incomplete", [{ id: "AC1", status: "unmet", arbitration: { class: "spec-gap" } }]), contract, iteration: 0, maxRevisions: 3 });
  assert.equal(gap.action, "revise-contract");
  assert.equal(gap.reason, "spec-gap");
});

test("blocked takes priority over unsatisfied when both are present", () => {
  const d = decideSteering({
    assessment: assessment("incomplete", [
      { id: "AC1", status: "unmet", arbitration: { class: "unsatisfied" } },
      { id: "AC2", status: "unmet", arbitration: { class: "blocked" } }
    ]),
    contract, iteration: 0, maxRevisions: 3
  });
  assert.equal(d.reason, "blocked");
});

test("out of budget stops honestly (scenario: budget-exhausted-honest-stop)", () => {
  const d = decideSteering({
    assessment: assessment("incomplete", [{ id: "AC1", status: "unmet", arbitration: { class: "unsatisfied" } }]),
    contract, iteration: 2, maxRevisions: 2
  });
  assert.deepEqual({ action: d.action, reason: d.reason }, { action: "stop", reason: "budget-exhausted" });
});

test("feedback adds a reflexion note for criteria unmet on a prior pass", () => {
  const a = assessment("incomplete", [{ id: "AC2", status: "unmet", arbitration: { class: "unsatisfied", guidance: "do it" } }]);
  const fresh = buildSteeringFeedback(a, contract, new Set());
  const repeat = buildSteeringFeedback(a, contract, new Set(["AC2"]));
  assert.doesNotMatch(fresh, /previous attempt/i);
  assert.match(repeat, /previous attempt/i);
});

test("unmetCriterionIds carries the unmet set forward", () => {
  const ids = unmetCriterionIds(assessment("incomplete", [{ id: "AC1", status: "met" }, { id: "AC2", status: "unmet" }]));
  assert.deepEqual([...ids], ["AC2"]);
});
