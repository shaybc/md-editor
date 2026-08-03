"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeIntentContract } = require("../resources/ai-companion/core/intent-contract");
const {
  selectAmbiguities,
  runClarificationBatch
} = require("../resources/ai-companion/core/intent-clarification");

function contractWithAmbiguities(ambiguities) {
  return normalizeIntentContract({
    goal: "g",
    expectedOutcome: "o",
    acceptanceCriteria: [{ description: "c" }],
    ambiguities
  });
}

test("ask mode selects the top three blocking ambiguities by impact", () => {
  const contract = contractWithAmbiguities([
    { question: "q1", blocking: true, impact: "low" },
    { question: "q2", blocking: true, impact: "high" },
    { question: "q3", blocking: true, impact: "medium" },
    { question: "q4", blocking: true, impact: "high" },
    { question: "q5", blocking: false, impact: "high" }
  ]);
  const { toAsk } = selectAmbiguities(contract, { intentClarificationMode: "ask" });
  assert.equal(toAsk.length, 3);
  assert.deepEqual(toAsk.map((ambiguity) => ambiguity.impact), ["high", "high", "medium"]);
});

test("assume mode asks only safety/scope-critical ambiguities and assumes the rest", () => {
  const contract = contractWithAmbiguities([
    { question: "safety", blocking: true, impact: "high", safetyOrScopeCritical: true },
    { question: "minor", blocking: true, impact: "medium" }
  ]);
  const { toAsk, toAssume } = selectAmbiguities(contract, { intentClarificationMode: "assume" });
  assert.equal(toAsk.length, 1);
  assert.equal(toAsk[0].question, "safety");
  assert.equal(toAssume.length, 1);
  assert.equal(toAssume[0].question, "minor");
});

test("off mode asks and assumes nothing", () => {
  const { toAsk, toAssume } = selectAmbiguities(contractWithAmbiguities([{ question: "q", blocking: true }]), { intentClarificationMode: "off" });
  assert.equal(toAsk.length, 0);
  assert.equal(toAssume.length, 0);
});

test("runClarificationBatch records answers and resolves ambiguities", async () => {
  const contract = contractWithAmbiguities([{ id: "AMB1", question: "Which database?", blocking: true, impact: "high" }]);
  const asked = [];
  const requestClarification = async (details) => { asked.push(details); return "Postgres"; };
  const result = await runClarificationBatch({ contract, requestClarification, mode: "agent", settings: { intentClarificationMode: "ask" } });

  assert.equal(asked.length, 1);
  assert.equal(asked[0].ambiguityId, "AMB1");
  assert.equal(result.clarifications[0].answer, "Postgres");
  const resolved = result.contract.ambiguities.find((ambiguity) => ambiguity.id === "AMB1");
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolution.answer, "Postgres");
  assert.equal(result.contract.clarifications.length, 1);
});

test("assume mode adds a visible assumption without asking non-critical ambiguities", async () => {
  const contract = contractWithAmbiguities([{ question: "a minor detail", blocking: true, impact: "low" }]);
  const result = await runClarificationBatch({ contract, requestClarification: async () => "x", mode: "agent", settings: { intentClarificationMode: "assume" } });
  assert.equal(result.clarifications.length, 0);
  assert.ok(result.contract.assumptions.some((assumption) => /conservative assumption/.test(assumption.statement)));
});

test("a missing clarification channel and plan mode are both no-ops", async () => {
  const contract = contractWithAmbiguities([{ question: "q", blocking: true }]);
  const noChannel = await runClarificationBatch({ contract, requestClarification: null, mode: "agent", settings: { intentClarificationMode: "ask" } });
  assert.equal(noChannel.clarifications.length, 0);
  const planMode = await runClarificationBatch({ contract, requestClarification: async () => "x", mode: "plan", settings: { intentClarificationMode: "ask" } });
  assert.equal(planMode.clarifications.length, 0);
});
