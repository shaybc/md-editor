"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const dataset = require("./eval/ai-companion-baseline-cases.json");
const {
  createAggregateBaseline,
  createBlindScoringPacket,
  mergeBlindScores,
  runReport,
  selectCases,
  summarizeRecords
} = require("./eval/ai-companion-baseline-eval");
const {
  resolveProviderSettings,
  runEvaluationCase,
  scoreDeterministicOutcome,
  summarizeDecisionLifecycle,
  summarizeVerifierCompletion,
  validateEvaluationConfig,
  validateEvaluationDataset
} = require("./eval/ai-companion-mode-runner");

const providerConfiguration = {
  id: "scripted",
  role: "target",
  settings: { providerMode: "openai-compatible", model: "scripted", apiKey: "", intentContractsEnabled: false }
};

function createScriptedProvider() {
  const plan = "<proposed_plan>\n# Fixture plan\n\n- Inspect the target.\n- Make the scoped change.\n- Verify it.\n</proposed_plan>";
  return {
    async complete(_messages, options = {}) {
      options.onUsage?.({ promptTokens: 8, completionTokens: 4, totalTokens: 12 });
      return plan;
    },
    async completeMessage(_messages, options = {}) {
      options.onUsage?.({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
      return { content: plan, toolCalls: [] };
    }
  };
}

test("M0 dataset fixes the 24-case, balanced-mode, six-smoke boundary", () => {
  assert.equal(validateEvaluationDataset(dataset), dataset);
  assert.equal(dataset.cases.length, 24);
  assert.deepEqual(Object.fromEntries(["chat", "plan", "agent"].map((mode) => [mode, dataset.cases.filter((item) => item.mode === mode).length])), { chat: 8, plan: 8, agent: 8 });
  assert.equal(selectCases(dataset, "smoke").length, 6);
  assert.equal(selectCases(dataset, "full").length, 24);
});

test("evaluation configuration requires target/reference and rejects embedded secrets", () => {
  const configuration = {
    schemaVersion: 1,
    providers: [
      { id: "local", role: "target", settings: { model: "local", apiKey: "" }, credentials: { apiKeyEnv: "TARGET_KEY" } },
      { id: "strong", role: "reference", settings: { model: "strong", apiKey: "" } }
    ]
  };
  assert.equal(validateEvaluationConfig(configuration), configuration);
  assert.equal(resolveProviderSettings(configuration.providers[0], { TARGET_KEY: "resolved-secret" }).apiKey, "resolved-secret");
  configuration.providers[0].settings.apiKey = "committed-secret";
  assert.throws(() => validateEvaluationConfig(configuration), /environment variable/);
});

test("blind scoring never exposes provider identity and merges through the private key", () => {
  const records = [{ runId: "run-1", caseId: "C1", turnId: "t1", mode: "chat", category: "direct", prompt: "Hello", response: "Hi", error: "", rubric: {}, provider: { role: "target" }, deterministic: {} }];
  const packet = createBlindScoringPacket(records, () => "score-1");
  assert.equal(Object.hasOwn(packet.scoring[0], "provider"), false);
  assert.equal(Object.hasOwn(packet.scoring[0], "providerRole"), false);
  packet.scoring[0].human.taskSuccess = true;
  assert.equal(mergeBlindScores(records, packet.scoring, packet.key)[0].human.taskSuccess, true);
});

test("deterministic scoring catches mutations, unnecessary tools, missing evidence, and false completion", () => {
  const result = scoreDeterministicOutcome(
    "chat",
    { workspaceChanges: "none", forbiddenTools: ["*"], requiredTools: ["read_file"] },
    "Successfully completed.",
    [{ name: "list_files", arguments: {} }],
    [],
    { changedPaths: ["README.md"] },
    0
  );
  assert.equal(result.workspaceMutationViolation, true);
  assert.equal(result.unnecessaryToolUse, true);
  assert.equal(result.evidenceFailure, true);
  assert.equal(result.falseCompletion, true);
});

test("M4 evaluation metrics count safe decision lifecycle events", () => {
  const metrics = summarizeDecisionLifecycle([
    { type: "agent-decision", decisionId: "d1", decisionStatus: "proposed", decisionType: "tool_call" },
    { type: "agent-decision", decisionId: "d1", decisionStatus: "accepted", decisionType: "tool_call" },
    { type: "agent-decision", decisionId: "d1", decisionStatus: "executed", decisionType: "tool_call" },
    { type: "agent-decision", decisionId: "d2", decisionStatus: "proposed", decisionType: "invalid", replacesDecisionId: "d0" },
    { type: "agent-decision", decisionId: "d2", decisionStatus: "rejected", runtimeReasonCodes: ["missing_decision_metadata"] }
  ]);
  assert.deepEqual(metrics, {
    proposed: 2,
    accepted: 1,
    rejected: 1,
    executed: 1,
    superseded: 0,
    repairs: 1,
    staleDecisions: 0,
    metadataRejections: 1,
    originalToolArgumentRejections: 0,
    decoratedToolProposals: 1,
    decoratedValidToolDecisions: 1
  });
});

test("M5 evaluation metrics count attempts, stale retries, outcomes, and verification cost", () => {
  const metrics = summarizeVerifierCompletion([
    { type: "agent-decision", decisionStatus: "proposed", decisionType: "propose_completion" },
    { type: "agent-verification", status: "started", completionAttemptId: "A1", verificationId: "V1" },
    { type: "agent-verification", status: "stale", completionAttemptId: "A1", verificationId: "V1", durationMs: 10, totalTokens: 5 },
    { type: "agent-verification", status: "started", completionAttemptId: "A1", verificationId: "V2" },
    { type: "agent-verification", status: "accepted", completionAttemptId: "A1", verificationId: "V2", durationMs: 12, totalTokens: 7 },
    { type: "completion-assessment", stateOwned: true, diagnostics: [] },
    { type: "agent-completion", status: "succeeded", reasonCodes: [] },
    { type: "agent-state-snapshot", state: { completion: { status: "succeeded", finalResponse: { claimValidation: { valid: true } } } } }
  ]);
  assert.equal(metrics.completionAttempts, 1);
  assert.equal(metrics.completionProposals, 1);
  assert.equal(metrics.verificationRequests, 2);
  assert.equal(metrics.staleResults, 1);
  assert.equal(metrics.staleRetryRate, 1);
  assert.equal(metrics.acceptedResults, 1);
  assert.equal(metrics.verificationLatencyMs, 22);
  assert.equal(metrics.verificationTokens, 12);
  assert.equal(metrics.semanticOutcome, "succeeded");
});

test("report summaries stay separated by provider role, mode, and category", () => {
  const records = [
    { provider: { id: "a", role: "target", model: "m1" }, mode: "chat", category: "direct", durationMs: 10, providerCalls: 1, promptTokens: 4, totalTokens: 6, approvals: [], clarifications: [], deterministic: { passed: false, unnecessaryToolUse: true }, human: { taskSuccess: false, answerCorrectness: 2 }, repetition: 1 },
    { provider: { id: "b", role: "reference", model: "m2" }, mode: "chat", category: "direct", durationMs: 20, providerCalls: 0, promptTokens: 2, totalTokens: 3, approvals: [], clarifications: [], deterministic: { passed: true }, human: { taskSuccess: true, answerCorrectness: 5 }, repetition: 1 }
  ];
  const groups = summarizeRecords(records);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((group) => group.providerRole === "target").unnecessaryToolRate, 1);
  assert.equal(groups.find((group) => group.providerRole === "reference").p95ProviderCalls, 0);
  const aggregate = createAggregateBaseline(records, 1, "abc123");
  assert.equal(aggregate.status, "complete");
  assert.deepEqual(aggregate.providers.map((provider) => provider.role).sort(), ["reference", "target"]);
});

test("report writer emits detailed and sanitized artifacts", async () => {
  const fsPromises = require("node:fs/promises");
  const os = require("node:os");
  const outputRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "md-editor-m0-report-"));
  const runsPath = path.join(outputRoot, "runs.jsonl");
  const scoresPath = path.join(outputRoot, "scores.json");
  const keyPath = path.join(outputRoot, "key.json");
  const record = { runId: "run-1", datasetVersion: 1, caseId: "C1", turnId: "t1", repetition: 1, mode: "chat", category: "direct", provider: { id: "target", role: "target", model: "model" }, durationMs: 5, providerCalls: 1, promptTokens: 3, totalTokens: 5, approvals: [], clarifications: [], deterministic: { passed: true }, prompt: "Hello", response: "Hi", error: "", rubric: {} };
  const packet = createBlindScoringPacket([record], () => "score-1");
  packet.scoring[0].human = { taskSuccess: true, answerCorrectness: 5, planUsefulness: null, completionHonesty: null, criterionJudgments: {} };
  try {
    await fsPromises.writeFile(runsPath, `${JSON.stringify(record)}\n`, "utf8");
    await fsPromises.writeFile(scoresPath, JSON.stringify(packet.scoring), "utf8");
    await fsPromises.writeFile(keyPath, JSON.stringify(packet.key), "utf8");
    const result = await runReport({ runs: runsPath, scores: scoresPath, key: keyPath, output: outputRoot });
    assert.equal(result.status, "complete");
    for (const name of ["scored-runs.json", "baseline-report.json", "baseline-report.md"]) await fsPromises.access(path.join(outputRoot, name));
    const aggregate = JSON.parse(await fsPromises.readFile(path.join(outputRoot, "baseline-report.json"), "utf8"));
    assert.equal(Object.hasOwn(aggregate, "response"), false);
  } finally {
    await fsPromises.rm(outputRoot, { recursive: true, force: true });
  }
});
test("scripted smoke cases execute through isolated production mode entry points without network access", async () => {
  const records = [];
  for (const testCase of selectCases(dataset, "smoke")) {
    records.push(...await runEvaluationCase({ testCase, providerConfiguration, repetition: 1, providerFactory: createScriptedProvider }));
  }
  assert.equal(records.length, 6);
  assert.ok(records.every((record) => record.providerCalls >= 1));
  assert.ok(records.every((record) => path.isAbsolute(path.resolve(record.workspaceDiff.changedPaths[0] || "."))));
  const planRecords = records.filter((record) => record.mode === "plan");
  assert.ok(planRecords.every((record) => record.workspaceDiff.changedPaths.length === 0));
  assert.ok(planRecords.every((record) => record.profileDiff.changedPaths.some((file) => file.startsWith("companion/plans/"))));
});
