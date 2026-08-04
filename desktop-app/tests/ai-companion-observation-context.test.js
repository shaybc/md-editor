"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createAgentArtifactStore } = require("../resources/ai-companion/core/agent-artifact-store");
const { buildAgentContext } = require("../resources/ai-companion/core/agent-context-builder");
const { compareAgentContexts } = require("../resources/ai-companion/core/agent-context-comparison");
const { normalizeToolObservation } = require("../resources/ai-companion/core/agent-observation-normalizer");
const {
  AGENT_STATE_EVENT_SCHEMA_VERSION,
  applyAgentStateEvent,
  createInitialAgentState
} = require("../resources/ai-companion/core/agent-state");
const { createAgentStateShadow } = require("../resources/ai-companion/core/agent-state-shadow");
const { createActivityRun } = require("../resources/ai-companion/core/agent-activity");
const runtime = require("../resources/ai-companion/core/agent-runtime");
const intentContract = require("../resources/ai-companion/core/intent-contract");

function stateEvent(runId, sequence, type, payload = {}) {
  return {
    schemaVersion: AGENT_STATE_EVENT_SCHEMA_VERSION,
    runId,
    sequence,
    occurredAt: new Date(1800000000000 + sequence).toISOString(),
    type,
    payload
  };
}

function evidence(overrides = {}) {
  return {
    id: "EV1",
    toolCallId: "call-1",
    tool: "read_file",
    outcome: "succeeded",
    summary: "const oldValue = true;",
    verifiedState: true,
    truncated: false,
    successConfirmedIndependently: true,
    confirmationSource: "tool-result",
    files: ["src/a.js"],
    ...overrides
  };
}

test("artifact store is content-addressed immutable and excerpt reads do not replace content", () => {
  const store = createAgentArtifactStore();
  const first = store.put({ value: "alpha" });
  const duplicate = store.put({ value: "alpha" });
  assert.strictEqual(first, duplicate);
  assert.equal(first.id, `artifact:${first.digest}`);
  assert.equal(store.size(), 1);
  assert.deepEqual(store.readExcerpt(first, 5), { text: '{"val', truncated: true, originalSizeChars: 17 });
  assert.equal(store.get(first).serialized, '{"value":"alpha"}');

  const collisionStore = createAgentArtifactStore({ digest: () => "same" });
  collisionStore.put({ value: 1 });
  assert.throws(() => collisionStore.put({ value: 2 }), /identity collision/);
});

test("observation normalization separates execution disposition outcome and provenance", () => {
  const store = createAgentArtifactStore();
  const denied = normalizeToolObservation({
    toolCallId: "deny-1",
    tool: "write_file",
    args: { path: "src/a.js" },
    result: { executed: false },
    evidenceEntry: evidence({ id: "EV-DENY", toolCallId: "deny-1", tool: "write_file", outcome: "denied", verifiedState: false })
  }, store);
  assert.equal(denied.executionStatus, "denied");
  assert.equal(denied.outcome, "unknown");
  assert.equal(denied.summary.source, "deterministic");
  assert.equal(denied.effect, "workspace-write");
  assert.equal(denied.resource, "src/a.js");

  const partial = normalizeToolObservation({
    toolCallId: "partial-1",
    tool: "read_file",
    result: { status: "partial", content: "part" },
    summarySource: "tool",
    evidenceEntry: evidence({ id: "EV-PART", toolCallId: "partial-1", truncated: true })
  }, store);
  assert.equal(partial.executionStatus, "executed");
  assert.equal(partial.outcome, "partial");
  assert.equal(partial.summary.source, "tool");
  assert.equal(partial.artifactRef.truncated, true);

  const cancelled = normalizeToolObservation({
    toolCallId: "cancel-1",
    tool: "run_tests",
    error: Object.assign(new Error("cancelled"), { cancelled: true }),
    evidenceEntry: evidence({ id: "EV-CANCEL", toolCallId: "cancel-1", tool: "run_tests", outcome: "failed", verifiedState: false })
  }, store);
  assert.equal(cancelled.executionStatus, "cancelled");
  assert.equal(cancelled.outcome, "unknown");

  const cases = [
    {
      name: "explicit non-execution",
      details: {
        toolCallId: "skip-1",
        tool: "read_file",
        result: { executed: false },
        evidenceEntry: evidence({ id: "EV-SKIP", toolCallId: "skip-1", outcome: "not-executed" })
      },
      executionStatus: "skipped",
      outcome: "unknown"
    },
    {
      name: "established no-op",
      details: {
        toolCallId: "noop-1",
        tool: "write_file",
        result: { executed: false },
        evidenceEntry: evidence({ id: "EV-NOOP", toolCallId: "noop-1", tool: "write_file", outcome: "no-op" })
      },
      executionStatus: "skipped",
      outcome: "no-op"
    },
    {
      name: "executed failure",
      details: {
        toolCallId: "failed-1",
        tool: "unknown_tool",
        result: { executed: true },
        evidenceEntry: evidence({ id: "EV-FAILED", toolCallId: "failed-1", tool: "unknown_tool", outcome: "failed" })
      },
      executionStatus: "executed",
      outcome: "failed"
    }
  ];
  for (const current of cases) {
    const observation = normalizeToolObservation(current.details, store);
    assert.equal(observation.executionStatus, current.executionStatus, current.name);
    assert.equal(observation.outcome, current.outcome, current.name);
  }
});

test("AgentState v6 records bounded normalized observations without raw payloads", () => {
  const runId = "observation-state";
  let state = createInitialAgentState({ runId, prompt: "inspect" });
  state = applyAgentStateEvent(state, stateEvent(runId, 1, "run_started")).state;
  const observation = normalizeToolObservation({
    toolCallId: "call-1",
    tool: "read_file",
    result: { content: "secret raw body" },
    evidenceEntry: evidence()
  }, createAgentArtifactStore());
  const recorded = applyAgentStateEvent(state, stateEvent(runId, 2, "observation_recorded", { observation }));
  assert.equal(recorded.accepted, true);
  assert.equal(recorded.state.schemaVersion, 6);
  assert.equal(recorded.state.recentObservations[0].outcome, "succeeded");
  assert.equal(recorded.state.observationCounts.execution.executed, 1);
  assert.equal(recorded.state.observationCounts.outcome.succeeded, 1);
  assert.equal(JSON.stringify(recorded.state).includes("secret raw body"), false);
  assert.equal(applyAgentStateEvent(recorded.state, stateEvent(runId, 3, "observation_recorded", { observation })).reason, "duplicate-observation");
});

test("AgentState v6 keeps only the latest 50 observations while retaining aggregate counts", () => {
  const runId = "bounded-observation-state";
  let state = createInitialAgentState({ runId, prompt: "inspect" });
  state = applyAgentStateEvent(state, stateEvent(runId, 1, "run_started")).state;
  const store = createAgentArtifactStore();
  for (let index = 0; index < 55; index += 1) {
    const observation = normalizeToolObservation({
      toolCallId: `bounded-${index}`,
      tool: "read_file",
      result: { index },
      evidenceEntry: evidence({ id: `EV-BOUNDED-${index}`, toolCallId: `bounded-${index}` })
    }, store);
    state = applyAgentStateEvent(state, stateEvent(runId, index + 2, "observation_recorded", { observation })).state;
  }
  assert.equal(state.recentObservations.length, 50);
  assert.equal(state.recentObservations[0].toolCallId, "bounded-5");
  assert.equal(state.observationCounts.execution.executed, 55);
  assert.equal(state.observationCounts.outcome.succeeded, 55);
});

test("context builder preserves authoritative sources deduplicates prompt and supersedes stale file artifacts", () => {
  const artifactStore = createAgentArtifactStore();
  const artifactRef = artifactStore.put({ result: { content: "const staleDiskValue = true;" }, error: null });
  const contract = intentContract.createFastPathContract("Explain the current file", { activeFilePath: "src/a.js" });
  const state = {
    stateVersion: 4,
    run: { runId: "context-1", mode: "agent" },
    lifecycle: { status: "running" },
    intentContract: contract,
    intentContractMeta: { promptFingerprint: "contract-fingerprint" },
    criteria: [],
    activeActions: [],
    recentActions: [],
    recentObservations: [{
      schemaVersion: 1,
      observationId: "observation:read-1",
      toolCallId: "read-1",
      tool: "read_file",
      executionStatus: "executed",
      outcome: "succeeded",
      summary: { text: "Read src/a.js", source: "deterministic" },
      files: ["src/a.js"],
      evidenceRef: "EV1",
      artifactRef
    }],
    observationCounts: { execution: { executed: 1 }, outcome: { succeeded: 1 } },
    interactions: [],
    verification: { overallStatus: "not_assessed", criteria: [] },
    artifacts: { evidenceRefs: [], changedFiles: [], attemptedFiles: [], blockedChanges: [] },
    steering: { revisionCount: 0, lastReason: "" }
  };
  const prompt = "Explain the current file";
  const bundle = buildAgentContext({
    requestId: "context-1",
    systemPrompt: "Agent policy",
    prompt,
    state,
    artifactStore,
    activeFile: { path: "src/a.js", content: "const liveUnsavedValue = true;" },
    editorReadContext: { activeDocument: { path: "src/a.js", dirty: true } },
    attachments: [{ kind: "text", name: "requirements.md", content: "Keep the API stable." }],
    conversationHistory: [
      { role: "user", content: prompt },
      { role: "assistant", content: "Earlier answer" },
      { role: "assistant", content: "Earlier answer" }
    ]
  });
  const rendered = JSON.stringify(bundle.messages);
  assert.match(rendered, /liveUnsavedValue/);
  assert.doesNotMatch(rendered, /staleDiskValue/);
  assert.match(rendered, /This buffer has unsaved changes/);
  assert.match(rendered, /Keep the API stable/);
  assert.equal(bundle.manifest.requiredSourcesMissing.length, 0);
  assert.equal(bundle.manifest.sourceDecisions.every((entry) => Boolean(entry.authority)), true);
  assert.ok(bundle.manifest.sourceDecisions.some((entry) => entry.sourceId === artifactRef.id && entry.omissionReason === "superseded-by-live-buffer"));
  assert.ok(bundle.manifest.sourceDecisions.some((entry) => entry.sourceType === "conversation-history" && entry.omissionReason === "duplicate-authoritative-source"));
  assert.equal((rendered.match(/Earlier answer/g) || []).length, 1);
  assert.equal((rendered.match(/Explain the current file/g) || []).length >= 1, true);
});

test("context builder reports mandatory overflow instead of discarding required sources", () => {
  const prompt = "P".repeat(9000);
  const bundle = buildAgentContext({
    requestId: "overflow-1",
    systemPrompt: "S".repeat(9000),
    prompt,
    maxChars: 16000,
    state: {
      stateVersion: 1,
      intentContract: intentContract.createFastPathContract(prompt),
      intentContractMeta: {},
      criteria: [], recentActions: [], recentObservations: [], interactions: [],
      verification: {}, artifacts: {}, steering: {}
    }
  });
  assert.equal(bundle.manifest.overBudget, true);
  assert.equal(bundle.manifest.requiredSourcesMissing.length, 0);
  assert.ok(bundle.manifest.sourceDecisions.some((entry) => entry.sourceType === "current-prompt" && entry.renderedInSection === "current-request"));
});

test("context comparison reports size and source preservation without content", () => {
  const bundle = buildAgentContext({
    requestId: "compare-1",
    systemPrompt: "System",
    prompt: "Current prompt",
    state: {
      stateVersion: 1,
      intentContract: intentContract.createFastPathContract("Current prompt"),
      intentContractMeta: {},
      criteria: [], recentActions: [], recentObservations: [],
      interactions: [{ interactionId: "resolved-1", instructions: "Current prompt" }],
      verification: {}, artifacts: {}, steering: {}
    }
  });
  const comparison = compareAgentContexts([{ role: "system", content: "x".repeat(400) }, { role: "user", content: "Current prompt" }], bundle);
  assert.equal(typeof comparison.reductionRatio, "number");
  assert.equal(comparison.currentPromptPreserved, true);
  assert.equal(comparison.intentContractPreserved, true);
  assert.equal(comparison.userInstructionsPreserved, true);
  assert.equal(JSON.stringify(comparison).includes("Current prompt"), false);
});

test("activity and shadow hooks normalize evidence and compare context without mutating legacy messages", () => {
  const shadow = createAgentStateShadow({ requestId: "shadow-m3", prompt: "Inspect" });
  shadow.configureContextSources({ requestId: "shadow-m3", systemPrompt: "System", prompt: "Inspect" });
  shadow.observeRuntimeEvent({
    type: "intent-contract",
    contract: intentContract.createFastPathContract("Inspect"),
    meta: { promptFingerprint: "fp" }
  });
  const activity = createActivityRun("C:/workspace", {}, { observeToolEvidence: shadow.observeToolEvidence });
  activity.recordToolEvidence({
    toolCallId: "read-activity",
    tool: "read_file",
    args: { path: "README.md" },
    result: { path: "README.md", content: "readme" },
    summary: "readme"
  });
  const legacyMessages = [{ role: "system", content: "System" }, { role: "user", content: "Inspect" }];
  const before = structuredClone(legacyMessages);
  const bundle = shadow.observeDecisionContext({ messages: legacyMessages, round: 1 });
  assert.deepEqual(legacyMessages, before);
  assert.ok(bundle);
  assert.equal(shadow.getState().recentObservations.length, 1);
  assert.equal(shadow.getDiagnostics().normalizedObservationCount, 1);
  assert.equal(shadow.getDiagnostics().contextBuildCount, 1);
  assert.equal(JSON.stringify(shadow.getDiagnostics()).includes("readme"), false);
});

test("shadow observation failures remain fail-open and content-free", () => {
  const shadow = createAgentStateShadow({ requestId: "shadow-failure", prompt: "Inspect" });
  const cyclicResult = {};
  cyclicResult.self = cyclicResult;
  const observation = shadow.observeToolEvidence({
    toolCallId: "cycle-1",
    tool: "read_file",
    result: cyclicResult,
    evidenceEntry: evidence({ id: "EV-CYCLE", toolCallId: "cycle-1" })
  });
  assert.equal(observation, null);
  assert.equal(shadow.getState().recentObservations.length, 0);
  assert.equal(shadow.getDiagnostics().observationNormalizationErrorCount, 1);
  assert.equal(JSON.stringify(shadow.getDiagnostics()).includes("self"), false);
});

test("Agent tool loop builds shadow context at each decision while sending legacy messages unchanged", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m3-shadow-loop-"));
  await fs.writeFile(path.join(root, "README.md"), "legacy provider payload", "utf8");
  const shadow = createAgentStateShadow({ requestId: "loop-m3", prompt: "Read README" });
  shadow.configureContextSources({ requestId: "loop-m3", systemPrompt: "System", prompt: "Read README" });
  const providerMessages = [];
  let round = 0;
  const provider = {
    complete: async () => "final",
    completeMessage: async (messages) => {
      providerMessages.push(structuredClone(messages));
      round += 1;
      if (round === 1) {
        return {
          content: "",
          toolCalls: [{ id: "read-loop", function: { name: "read_file", arguments: JSON.stringify({ path: "README.md" }) } }]
        };
      }
      return { content: "Read complete", toolCalls: [] };
    }
  };
  try {
    const content = await runtime.runAgentToolLoop(provider, { agentMaxActions: 4 }, root, "Read README", "agent", shadow.wrapEmit(() => {}), runtime, {
      systemPrompt: "System",
      skipIntentPhase: true,
      requireInitialDiscoveryOverride: false,
      observeToolEvidence: shadow.observeToolEvidence,
      observeDecisionContext: shadow.observeDecisionContext
    });
    assert.equal(content, "final");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
  assert.equal(providerMessages.length, 2);
  assert.equal(providerMessages.some((messages) => messages.some((message) => String(message.content || "").includes("Authoritative AgentState projection"))), false);
  assert.equal(providerMessages[1].some((message) => message.role === "tool" && String(message.content).includes("legacy provider payload")), true);
  assert.equal(shadow.getState().recentObservations.length, 1);
  assert.equal(shadow.getDiagnostics().contextBuildCount, 2);
  assert.equal(shadow.getDiagnostics().normalizedObservationCount, 1);
});
