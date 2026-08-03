"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeIntentContract } = require("../resources/ai-companion/core/intent-contract");
const {
  UNCERTAIN_CONTRACT_MODES,
  buildUncertainContract,
  mergeIntentContracts,
  preserveUncertainRelationship
} = require("../resources/ai-companion/core/intent-relationship");

function contract(goal, relationshipToPrior = "independent") {
  return normalizeIntentContract({
    taskType: "implementation",
    relationshipToPrior,
    goal: { value: goal, provenance: "explicit" },
    expectedOutcome: { value: `${goal} outcome`, provenance: "inferred" },
    acceptanceCriteria: [{ id: "AC1", description: `${goal} criterion`, provenance: "inferred" }]
  });
}

test("the uncertain constructor requires an explicit supported mode", () => {
  const prior = contract("prior");
  const current = contract("current", "uncertain");
  assert.throws(() => buildUncertainContract({ prior, current }), /mode/i);
  assert.throws(() => buildUncertainContract({ prior, current, mode: "unknown" }), /mode/i);
});

test("ordinary uncertain merging delegates to current-authoritative behavior", () => {
  const prior = contract("prior");
  const current = contract("current", "uncertain");
  const merged = mergeIntentContracts(prior, current);

  assert.equal(merged.goal.value, "current");
  assert.equal(merged.ambiguities.at(-1).blocking, false);
  assert.equal(merged.unresolvedDecisions.some((entry) => entry.id === "D-REL"), false);
});

test("preserved uncertain relationships use the prior-gated mode", () => {
  const prior = contract("prior");
  const current = contract("current", "uncertain");
  const preserved = preserveUncertainRelationship(prior, current);
  const direct = buildUncertainContract({ prior, current, mode: UNCERTAIN_CONTRACT_MODES.PRIOR_GATED });

  assert.deepEqual(preserved, direct);
  assert.equal(preserved.goal.value, "prior");
  assert.equal(preserved.ambiguities.at(-1).blocking, true);
  assert.equal(preserved.unresolvedDecisions.some((entry) => entry.controlsMutation === true), true);
});
