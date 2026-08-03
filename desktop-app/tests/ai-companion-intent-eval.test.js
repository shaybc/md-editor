"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createIntentEvaluationTracker } = require("../resources/ai-companion/core/intent-evaluation");
const { createBlindScoringPacket, evaluateRollout, mergeBlindScores, summarizeByTaskType } = require("./eval/intent-contracts-eval");

test("intent evaluation tracker records bounded calls, usage, events, and evidence", async () => {
  const tracker = createIntentEvaluationTracker({ requestId: "r1", chatId: "c1", mode: "agent", experiment: { intentExtraction: true } });
  const provider = tracker.wrapProvider({
    async complete(_messages, options) { options.onUsage({ promptTokens: 10, completionTokens: 3 }); return "done"; },
    async completeMessage(_messages, options) { options.onUsage({ promptTokens: 7, completionTokens: 2 }); return { content: "done", toolCalls: [] }; }
  });
  await provider.complete([], {});
  await provider.completeMessage([], {});
  tracker.recordEvent({
    type: "intent-contract",
    source: "extracted",
    variant: "initial",
    contract: {
      taskType: "implementation",
      verifiability: "verified",
      goal: { value: "Inspect the Git diff and update README.md" },
      acceptanceCriteria: [
        { id: "AC1", description: "The actual Git diff identifies the relevant behavior changes" },
        { id: "AC2", description: "README.md contains the documented behavior" }
      ],
      namedTargets: { files: [{ value: "README.md" }], symbols: [], errors: [], uiAreas: [] }
    }
  });
  tracker.recordEvent({ type: "intent-uninterpreted", reason: "provider-failure" });
  tracker.recordEvent({ type: "clarification", clarificationId: "Q1" });
  tracker.recordEvent({ type: "completion-assessment", assessment: { overallStatus: "complete", criteria: [{ id: "AC1", status: "met" }] } });
  const record = tracker.createRecord({ taskType: "implementation", evidenceLedger: [{ id: "EV1", source: "tool", tool: "read_file", outcome: "succeeded", files: ["src/app.js"], result: "excluded" }] });
  assert.equal(record.providerCalls, 2);
  assert.equal(record.promptTokens, 17);
  assert.equal(record.clarificationCount, 1);
  assert.equal(record.verifiability, "verified");
  assert.equal(record.uninterpretedReason, "provider-failure");
  assert.deepEqual(record.actualFiles, ["src/app.js"]);
  assert.deepEqual(record.evidence, [{ id: "EV1", source: "tool", tool: "read_file", outcome: "succeeded" }]);
  assert.ok(record.criterionGoalOverlap > 0 && record.criterionGoalOverlap < 1);
  assert.equal(record.responseContentShare, 0);
  assert.equal(record.assessment.criteria[0].harnessClaimType, "");
  assert.equal(JSON.stringify(record).includes("excluded"), false);
});

test("response-content share is reported with the contract task type", () => {
  const tracker = createIntentEvaluationTracker({ requestId: "r2", chatId: "c2", mode: "chat" });
  tracker.recordEvent({
    type: "intent-contract",
    source: "extracted",
    contract: {
      taskType: "answer",
      verifiability: "verified",
      goal: { value: "Explain exponential backoff" },
      acceptanceCriteria: [{ id: "AC1", description: "The response must explain exponential backoff clearly" }],
      namedTargets: { files: [], symbols: [], errors: [], uiAreas: [] }
    }
  });

  const record = tracker.createRecord({ taskType: "answer", evidenceLedger: [] });
  assert.equal(record.taskType, "answer");
  assert.equal(record.responseContentShare, 1);
  assert.equal(record.criterionGoalOverlap, 1);
});

test("eval summaries and rollout gates remain separate by task type", () => {
  const records = [
    { configurationId: "off", taskType: "answer", durationMs: 100, providerCalls: 1, promptTokens: 100, human: { taskSuccess: true }, assessment: { criteria: [] } },
    { configurationId: "all-on", taskType: "answer", durationMs: 150, providerCalls: 2, promptTokens: 120, human: { taskSuccess: true }, assessment: { criteria: [] } },
    { configurationId: "off", taskType: "implementation", durationMs: 1000, providerCalls: 2, promptTokens: 200, human: { taskSuccess: false, criterionJudgments: { AC1: "unmet" } }, assessment: { criteria: [{ id: "AC1", status: "met" }] } },
    { configurationId: "all-on", taskType: "implementation", durationMs: 1100, providerCalls: 3, promptTokens: 220, human: { taskSuccess: true, criterionJudgments: { AC1: "unmet", AC2: "met" } }, assessment: { criteria: [{ id: "AC1", status: "unmet" }, { id: "AC2", status: "met" }] } }
  ];
  const summary = summarizeByTaskType(records);
  assert.deepEqual(Object.keys(summary).sort(), ["answer", "implementation"]);
  assert.equal(summary.implementation.falseMetRate, 0.5);
  const report = evaluateRollout(records);
  assert.ok(report.answer);
  assert.ok(report.implementation);
  assert.equal(report.implementation.deltas.falseMetReduction, 1);
});

test("blind scoring packet does not reveal experiment assignments", () => {
  const packet = createBlindScoringPacket([{ caseId: "C1", taskType: "answer", prompt: "p", response: "r", rubric: {}, configurationId: "all-on", repetition: 1 }]);
  assert.equal(Object.hasOwn(packet.scoring[0], "configurationId"), false);
  assert.equal(packet.key[0].configurationId, "all-on");
});

test("completed blind scores merge back through the private key for rollout reporting", () => {
  const records = [{ caseId: "C1", configurationId: "all-on", repetition: 1, taskType: "answer" }];
  const packet = createBlindScoringPacket(records);
  packet.scoring[0].human = { taskSuccess: true };
  const scored = mergeBlindScores(records, packet.scoring, packet.key);
  assert.deepEqual(scored[0].human, { taskSuccess: true });
});

test("rollout cost gates reject a single over-budget paired task even when the mean is acceptable", () => {
  const records = [
    { caseId: "C1", repetition: 1, configurationId: "off", taskType: "answer", providerCalls: 1, promptTokens: 100 },
    { caseId: "C1", repetition: 1, configurationId: "all-on", taskType: "answer", providerCalls: 4, promptTokens: 130 },
    { caseId: "C2", repetition: 1, configurationId: "off", taskType: "answer", providerCalls: 10, promptTokens: 1000 },
    { caseId: "C2", repetition: 1, configurationId: "all-on", taskType: "answer", providerCalls: 9, promptTokens: 900 }
  ];
  const answer = evaluateRollout(records).answer;
  assert.equal(answer.deltas.addedCalls <= 2, true, "the aggregate mean alone would pass");
  assert.equal(answer.gates.providerCalls, false);
  assert.equal(answer.gates.promptTokens, false);
});
