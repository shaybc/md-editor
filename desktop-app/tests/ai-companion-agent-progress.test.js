"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  AGENT_STATE_EVENT_SCHEMA_VERSION,
  applyAgentStateEvent,
  createInitialAgentState
} = require("../resources/ai-companion/core/agent-state");
const {
  acceptStrategyRevision,
  applyProgressAssessment,
  classifyDeterministicProgress,
  createInitialProgressState,
  recordReplanAttempt
} = require("../resources/ai-companion/core/agent-progress-policy");
const { createAgentProgressEvaluator } = require("../resources/ai-companion/core/agent-progress-evaluator");
const runtime = require("../resources/ai-companion/core/agent-runtime");
const { createAgentStateShadow } = require("../resources/ai-companion/core/agent-state-shadow");
const {
  compareApproachText,
  createActionSignature,
  createStrategyDescriptor
} = require("../resources/ai-companion/core/agent-strategy-signature");

function apply(state, type, payload = {}) {
  const result = applyAgentStateEvent(state, {
    schemaVersion: AGENT_STATE_EVENT_SCHEMA_VERSION,
    runId: state.run.runId,
    sequence: state.lastAcceptedSequence + 1,
    occurredAt: new Date(1700000000000 + state.lastAcceptedSequence * 1000).toISOString(),
    type,
    payload
  });
  assert.equal(result.accepted, true, result.reason);
  return result.state;
}

function assessment(index, status, extra = {}) {
  return {
    assessmentId: `P${index}`,
    status,
    source: "deterministic",
    decisionId: `D${index}`,
    observationId: `O${index}`,
    intentId: "C1",
    reasonCode: status,
    evidenceIds: [],
    actionSignature: extra.actionSignature || `A${index}`,
    strategySignature: extra.strategySignature || `S${index}`,
    strategyId: `S-ID-${index}`,
    strategyClass: extra.strategyClass || "search_concept",
    targetScope: extra.targetScope || "src",
    basedOnStateVersion: 0,
    progressEpoch: extra.progressEpoch || 0,
    strategyRevision: extra.strategyRevision || 0
  };
}

function addCompletedDecision(state, index, signatures = {}) {
  const decisionId = `D${index}`;
  const callId = `call-${index}`;
  state = apply(state, "decision_proposed", {
    decision: {
      decisionId,
      basedOnStateVersion: state.stateVersion,
      type: "tool_call",
      intentId: "C1",
      rationale: "Inspect relevant state",
      expectedObservation: "Relevant evidence",
      tool: { name: "read_file", providerCallId: callId },
      actionSignature: signatures.actionSignature || `A${index}`,
      strategySignature: signatures.strategySignature || `S${index}`,
      strategyClass: "read_neighboring_files",
      targetScope: "src"
    }
  });
  state = apply(state, "decision_accepted", { decisionId });
  state = apply(state, "decision_executed", { decisionId });
  state = apply(state, "observation_recorded", {
    observation: {
      observationId: `O${index}`,
      toolCallId: callId,
      tool: "read_file",
      executionStatus: "executed",
      outcome: "succeeded",
      summary: { text: "Read completed", source: "deterministic" },
      effect: "read",
      capability: "read.workspace",
      resource: `src/${index}.js`,
      files: [`src/${index}.js`],
      evidenceRef: `E${index}`
    }
  });
  return state;
}

test("weighted progress requires three no-progress results but five inconclusive results", () => {
  let noProgress = createInitialProgressState({ evaluationEnabled: true, controlEnabled: true });
  noProgress = applyProgressAssessment(noProgress, assessment(1, "no_progress"));
  noProgress = applyProgressAssessment(noProgress, assessment(2, "no_progress"));
  assert.equal(noProgress.lastControlAction, "continue");
  noProgress = applyProgressAssessment(noProgress, assessment(3, "no_progress"));
  assert.equal(noProgress.lastControlAction, "require_replan");

  let inconclusive = createInitialProgressState({ evaluationEnabled: true, controlEnabled: true });
  for (let index = 1; index <= 4; index += 1) inconclusive = applyProgressAssessment(inconclusive, assessment(index, "inconclusive"));
  assert.equal(inconclusive.lastControlAction, "continue");
  inconclusive = applyProgressAssessment(inconclusive, assessment(5, "inconclusive"));
  assert.equal(inconclusive.lastControlAction, "require_replan");

  let mixed = createInitialProgressState({ evaluationEnabled: true, controlEnabled: true });
  for (const [index, status] of ["no_progress", "inconclusive", "no_progress", "inconclusive"].entries()) {
    mixed = applyProgressAssessment(mixed, assessment(index + 1, status));
  }
  assert.equal(mixed.stallScore, 3);
  assert.equal(mixed.lastControlAction, "require_replan");
});

test("action and strategy oscillation plus a third stalled strategy require replanning", () => {
  let actions = createInitialProgressState({ evaluationEnabled: true, controlEnabled: true });
  for (const [index, signature] of ["A", "B", "A", "B"].entries()) {
    actions = applyProgressAssessment(actions, assessment(index + 1, "inconclusive", {
      actionSignature: signature,
      strategySignature: `S${index + 1}`
    }));
  }
  assert.equal(actions.lastControlAction, "require_replan");

  let strategies = createInitialProgressState({ evaluationEnabled: true, controlEnabled: true, noProgressThreshold: 10 });
  for (let index = 1; index <= 3; index += 1) {
    strategies = applyProgressAssessment(strategies, assessment(index, "inconclusive", {
      actionSignature: `A${index}`,
      strategySignature: "SAME"
    }));
  }
  assert.equal(strategies.lastControlAction, "require_replan");
  assert.ok(strategies.blockedStrategySignatures.includes("SAME"));
});

test("accepted strategy revisions reset only the stall window and retain the request budget", () => {
  let progress = createInitialProgressState({ evaluationEnabled: true, controlEnabled: true, maxStrategyReplans: 2 });
  progress = recordReplanAttempt(progress);
  progress = recordReplanAttempt(progress);
  progress = applyProgressAssessment(progress, assessment(1, "no_progress"));
  progress = applyProgressAssessment(progress, assessment(2, "no_progress"));
  progress = applyProgressAssessment(progress, assessment(3, "no_progress"));
  assert.equal(progress.lastControlAction, "terminate");

  const revised = acceptStrategyRevision({ ...progress, replanRequired: true });
  assert.equal(revised.stallScore, 0);
  assert.equal(revised.strategyRevision, 1);
  assert.equal(revised.replanAttemptCount, 2);
});

test("the frozen M6 evaluation ruler includes progress, repetition, and exhaustion cases", () => {
  const ruler = require("./eval/progress-scenarios.json");
  assert.equal(ruler.schemaVersion, 1);
  assert.ok(ruler.scenarios.some((scenario) => scenario.id === "semantic-search-repetition"));
  assert.ok(ruler.scenarios.some((scenario) => scenario.id === "replan-budget-exhausted"));
});

test("meaningful progress advances the epoch and permits a repeated read after an edit", () => {
  const readSignature = createActionSignature("read_file", { path: "config.json" });
  let progress = createInitialProgressState({ evaluationEnabled: true, controlEnabled: true });
  progress = applyProgressAssessment(progress, assessment(1, "no_progress", { actionSignature: readSignature }));
  assert.ok(progress.blockedActionSignatures.includes(readSignature));
  progress = applyProgressAssessment(progress, assessment(2, "meaningful", {
    actionSignature: createActionSignature("write_file", { path: "config.json", content: "{}" })
  }));
  assert.equal(progress.progressEpoch, 1);
  assert.equal(progress.blockedActionSignatures.includes(readSignature), false);
});

test("a repeated successful action in the same epoch is deterministically no-progress", () => {
  const actionSignature = createActionSignature("read_file", { path: "config.json" });
  const progress = applyProgressAssessment(
    createInitialProgressState({ evaluationEnabled: true, controlEnabled: false }),
    assessment(1, "inconclusive", { actionSignature })
  );
  const result = classifyDeterministicProgress({
    state: { progress },
    observation: { executionStatus: "executed", outcome: "succeeded", effect: "read" },
    actionSignature,
    strategySignature: "S2"
  });
  assert.deepEqual(result, { status: "no_progress", reasonCode: "exact_action_repeated" });
});

test("action signatures ignore key order and strategy normalization recognizes superficial replans", () => {
  assert.equal(
    createActionSignature("search_text", { query: "token", path: "src" }),
    createActionSignature("search_text", { path: "src", query: "token" })
  );
  const first = createStrategyDescriptor({ toolName: "search_text", args: { query: "token validation", path: "src" }, intentId: "C1" });
  const second = createStrategyDescriptor({ toolName: "search_text", args: { query: "validate token", path: "src" }, intentId: "C1" });
  assert.equal(first.strategySignature, second.strategySignature);
  assert.equal(compareApproachText("Search for the parser", "Search more carefully for the parser").different, false);
});

test("AgentState rejects stale progress bindings and accepts a fresh assessment", () => {
  let state = createInitialAgentState({
    runId: "progress-state",
    controlMode: "controller",
    progressEvaluationEnabled: true,
    progressControlEnabled: true
  });
  state = apply(state, "run_started");
  state = apply(state, "intent_contract_observed", {
    contract: { acceptanceCriteria: [{ id: "C1", description: "Inspect the file" }] }
  });
  state = addCompletedDecision(state, 1);
  const stale = applyAgentStateEvent(state, {
    schemaVersion: AGENT_STATE_EVENT_SCHEMA_VERSION,
    runId: state.run.runId,
    sequence: state.lastAcceptedSequence + 1,
    occurredAt: new Date().toISOString(),
    type: "progress_recorded",
    payload: { assessment: { ...assessment(1, "no_progress"), basedOnStateVersion: state.stateVersion - 1, evidenceIds: ["E1"] } }
  });
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, "stale-progress-state-version");

  state = apply(state, "progress_recorded", {
    assessment: { ...assessment(1, "no_progress"), basedOnStateVersion: state.stateVersion, evidenceIds: ["E1"] }
  });
  assert.equal(state.progress.stallScore, 1);
});

test("semantic evaluator repairs invalid output and binds evidence to the supplied observation", async () => {
  let callCount = 0;
  const provider = {
    completeMessage: async (_messages, options) => {
      callCount += 1;
      if (callCount === 1) return { toolCalls: [] };
      return {
        toolCalls: [{
          id: "progress",
          type: "function",
          function: {
            name: options.tools[0].function.name,
            arguments: JSON.stringify({ status: "meaningful", reasonCode: "new_fact", evidenceIds: ["E1"] })
          }
        }]
      };
    }
  };
  const evaluator = createAgentProgressEvaluator({ provider });
  const result = await evaluator.evaluateProgress({
    intent: { id: "C1", statement: "Find the cause" },
    decision: { expectedObservation: "The failing branch" },
    observation: { observationId: "O1", tool: "read_file", outcome: "succeeded", summary: { text: "Found branch" }, evidenceRef: "E1" }
  });
  assert.equal(result.status, "meaningful");
  assert.equal(result.repaired, true);
  assert.equal(callCount, 2);
});

test("semantic strategy comparison can group differently worded searches", async () => {
  const provider = {
    completeMessage: async (_messages, options) => ({
      toolCalls: [{
        id: "strategy",
        type: "function",
        function: {
          name: options.tools[0].function.name,
          arguments: JSON.stringify({ equivalentToStrategyId: "strategy-1", reasonCode: "same_token_validation_strategy" })
        }
      }]
    })
  };
  const evaluator = createAgentProgressEvaluator({ provider });
  const result = await evaluator.compareStrategies({
    candidate: { strategyClass: "search_concept", conceptTokens: ["auth", "token", "validate"] },
    recentStrategies: [{ strategyId: "strategy-1", strategyClass: "search_concept", conceptTokens: ["token", "validate"] }]
  });
  assert.equal(result.equivalentToStrategyId, "strategy-1");
});

function controllerToolCall(name, args, id) {
  return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

test("enforced loop records progress, forces a bounded strategy revision, and resumes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m6-progress-"));
  await Promise.all([1, 2, 3].map(async (index) => {
    const directory = path.join(root, `candidate-${index}`);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, `${index}.txt`), `file ${index}`, "utf8");
  }));
  await fs.mkdir(path.join(root, "known-entry"), { recursive: true });
  await fs.writeFile(path.join(root, "known-entry", "4.txt"), "file 4", "utf8");
  const requestId = "m6-enforce";
  const session = createAgentStateShadow({
    requestId,
    prompt: "Find the relevant file",
    controlMode: "controller",
    progressEvaluationEnabled: true,
    progressControlEnabled: true,
    noProgressThreshold: 3,
    maxStrategyReplans: 2
  });
  session.configureContextSources({ requestId, prompt: "Find the relevant file", systemPrompt: "You are the Agent." });
  let decisionRound = 0;
  const provider = {
    completeMessage: async (_messages, options) => {
      const evaluatorTool = options.tools?.[0]?.function?.name;
      if (evaluatorTool === "assess_agent_progress") {
        const meaningful = decisionRound >= 4;
        return { toolCalls: [controllerToolCall("assess_agent_progress", {
          status: meaningful ? "meaningful" : "no_progress",
          reasonCode: meaningful ? "revised_strategy_found_evidence" : "unrelated_file",
          evidenceIds: []
        }, `progress-${decisionRound}`)] };
      }
      if (evaluatorTool === "compare_agent_strategies") {
        return { toolCalls: [controllerToolCall("compare_agent_strategies", { equivalentToStrategyId: null, reasonCode: "different_target" }, `strategy-${decisionRound}`)] };
      }
      if (evaluatorTool === "validate_agent_replan") {
        return { toolCalls: [controllerToolCall("validate_agent_replan", { materiallyDifferent: true, reasonCode: "changed_to_known_entry_point" }, "replan-check")] };
      }
      decisionRound += 1;
      if (decisionRound <= 3) {
        return { toolCalls: [controllerToolCall("read_file", {
          path: `candidate-${decisionRound}/${decisionRound}.txt`,
          _decision: { intentId: "task", rationale: "Inspect another candidate", expectedObservation: "Relevant content" }
        }, `read-${decisionRound}`)] };
      }
      if (decisionRound === 4) {
        return { toolCalls: [controllerToolCall("read_file", {
          path: "known-entry/4.txt",
          _decision: {
            intentId: "task",
            rationale: "Use the revised strategy",
            expectedObservation: "Relevant content from the known entry point",
            strategyRevision: 1,
            replan: {
              triggerAssessmentIds: ["m6-enforce:progress:1", "m6-enforce:progress:2", "m6-enforce:progress:3"],
              abandonedApproach: "Read unrelated candidate files",
              revisedApproach: "Inspect the known entry point directly"
            }
          }
        }, "read-4")] };
      }
      return { toolCalls: [controllerToolCall("agent_propose_completion", {
        content: "The revised strategy found the relevant entry point.",
        evidenceIds: [],
        _decision: { intentId: "task", rationale: "Report the observed result", expectedObservation: "" }
      }, "complete")] };
    }
  };
  const settings = runtime.normalizeAiCompanionSettings({
    enabled: true,
    agentEnabled: true,
    agentDecisionControllerEnabled: true,
    agentProgressEvaluationEnabled: true,
    agentProgressControlEnabled: true,
    maxTasksPerChat: 8
  });
  const events = [];
  try {
    const content = await runtime.runAgentToolLoop(provider, settings, root, "Find the relevant file", "agent", session.wrapEmit((event) => events.push(event)), runtime, {
      requestId,
      systemPrompt: "You are the Agent.",
      skipIntentPhase: true,
      observeToolEvidence: session.observeToolEvidence,
      observeDecisionContext: session.observeDecisionContext,
      agentStateSession: session
    });
    assert.match(content, /revised strategy/i);
    assert.equal(session.getState().progress.strategyRevision, 1, JSON.stringify({ progress: session.getState().progress, events: events.filter((event) => /agent-(?:progress|replan)/.test(event.type)) }));
    assert.equal(session.getState().progress.acceptedReplanCount, 1);
    assert.equal(session.getState().progress.progressEpoch, 1);
    assert.ok(events.some((event) => event.type === "agent-replan" && event.status === "accepted"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("two rejected blocked proposals force a normal strategy replan instead of generic failure", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m6-blocked-proposal-"));
  await fs.writeFile(path.join(root, "same.txt"), "same", "utf8");
  await fs.mkdir(path.join(root, "revised"), { recursive: true });
  await fs.writeFile(path.join(root, "revised", "target.txt"), "target", "utf8");
  const requestId = "m6-blocked-proposal";
  const session = createAgentStateShadow({
    requestId,
    prompt: "Find the target",
    controlMode: "controller",
    progressEvaluationEnabled: true,
    progressControlEnabled: true,
    noProgressThreshold: 10,
    maxStrategyReplans: 2
  });
  session.configureContextSources({ requestId, prompt: "Find the target", systemPrompt: "You are the Agent." });
  let decisionRound = 0;
  const provider = {
    completeMessage: async (_messages, options) => {
      const evaluatorTool = options.tools?.[0]?.function?.name;
      if (evaluatorTool === "assess_agent_progress") {
        return { toolCalls: [controllerToolCall("assess_agent_progress", {
          status: decisionRound >= 4 ? "meaningful" : "no_progress",
          reasonCode: decisionRound >= 4 ? "revised_target_found" : "unchanged_read",
          evidenceIds: []
        }, `progress-${decisionRound}`)] };
      }
      if (evaluatorTool === "validate_agent_replan") {
        return { toolCalls: [controllerToolCall("validate_agent_replan", { materiallyDifferent: true, reasonCode: "changed_target" }, "replan-check")] };
      }
      decisionRound += 1;
      if (decisionRound <= 3) {
        return { toolCalls: [controllerToolCall("read_file", {
          path: "same.txt",
          _decision: { intentId: "task", rationale: "Read the same candidate", expectedObservation: "Target content" }
        }, `same-${decisionRound}`)] };
      }
      if (decisionRound === 4) {
        return { toolCalls: [controllerToolCall("read_file", {
          path: "revised/target.txt",
          _decision: {
            intentId: "task",
            rationale: "Use a new target neighborhood",
            expectedObservation: "Target content",
            strategyRevision: 1,
            replan: {
              triggerAssessmentIds: ["m6-blocked-proposal:progress:1"],
              abandonedApproach: "Read the same candidate file",
              revisedApproach: "Inspect the revised target directory"
            }
          }
        }, "revised")] };
      }
      return { toolCalls: [controllerToolCall("agent_propose_completion", {
        content: "The revised target was found.",
        evidenceIds: [],
        _decision: { intentId: "task", rationale: "Report the result", expectedObservation: "" }
      }, "complete")] };
    }
  };
  const settings = runtime.normalizeAiCompanionSettings({
    enabled: true,
    agentEnabled: true,
    agentDecisionControllerEnabled: true,
    agentProgressEvaluationEnabled: true,
    agentProgressControlEnabled: true,
    agentNoProgressActionLimit: 10,
    maxTasksPerChat: 8
  });
  const events = [];
  try {
    const content = await runtime.runAgentToolLoop(provider, settings, root, "Find the target", "agent", session.wrapEmit((event) => events.push(event)), runtime, {
      requestId,
      systemPrompt: "You are the Agent.",
      skipIntentPhase: true,
      observeToolEvidence: session.observeToolEvidence,
      observeDecisionContext: session.observeDecisionContext,
      agentStateSession: session
    });
    assert.match(content, /revised target/i);
    assert.equal(events.filter((event) => event.type === "agent-decision" && event.decisionStatus === "rejected").length, 2);
    assert.equal(events.filter((event) => event.type === "agent-replan" && event.status === "required").length, 1);
    assert.equal(events.filter((event) => event.type === "agent-replan" && event.status === "accepted").length, 1);
    assert.equal(session.getState().progress.strategyRevision, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
