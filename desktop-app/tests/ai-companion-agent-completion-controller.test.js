"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const runtime = require("../resources/ai-companion/core/agent-runtime");
const { createAgentCompletionOrchestrator } = require("../resources/ai-companion/core/agent-completion-orchestrator");
const { evaluateCompletionPolicy } = require("../resources/ai-companion/core/agent-completion-policy");
const { composeFinalResponse } = require("../resources/ai-companion/core/agent-final-response-composer");
const {
  AGENT_STATE_EVENT_SCHEMA_VERSION,
  VERIFICATION_RELEVANT_EVENT_TYPES,
  applyAgentStateEvent,
  createInitialAgentState
} = require("../resources/ai-companion/core/agent-state");
const { createAgentStateShadow } = require("../resources/ai-companion/core/agent-state-shadow");
const {
  buildBoundedEvidenceSnapshot,
  createVerificationEvidenceTracker,
  fingerprint
} = require("../resources/ai-companion/core/agent-verification-evidence");
const {
  CANDIDATE_EVIDENCE_ID,
  createCompletionEvidenceLedger
} = require("../resources/ai-companion/core/completion-evidence-ledger");

const CONTRACT = {
  taskType: "answer",
  goal: { value: "Explain the observed result" },
  expectedOutcome: { value: "A grounded explanation" },
  acceptanceCriteria: [{ id: "AC1", description: "Explain the observed result" }],
  ambiguities: [],
  verifiability: "verified"
};

function event(runId, sequence, type, payload = {}) {
  return {
    schemaVersion: AGENT_STATE_EVENT_SCHEMA_VERSION,
    runId,
    sequence,
    occurredAt: new Date(1700000000000 + sequence).toISOString(),
    type,
    payload
  };
}

function apply(state, sequence, type, payload = {}) {
  const result = applyAgentStateEvent(state, event(state.run.runId, sequence, type, payload));
  assert.equal(result.accepted, true, `${type} should be accepted: ${result.reason || ""}`);
  return result.state;
}

function proposal(decisionId = "D-complete") {
  return {
    decisionId,
    basedOnStateVersion: 0,
    type: "propose_completion",
    intentId: "task",
    rationale: "The answer is ready for verification.",
    payload: { evidenceIds: [CANDIDATE_EVIDENCE_ID] }
  };
}

function createReducerAttempt(runId = "run-state") {
  let state = createInitialAgentState({ runId, controlMode: "controller" });
  state = apply(state, 1, "run_started");
  state = apply(state, 2, "intent_contract_observed", { contract: CONTRACT });
  state = apply(state, 3, "decision_proposed", { decision: proposal() });
  state = apply(state, 4, "decision_accepted", { decisionId: "D-complete" });
  state = apply(state, 5, "decision_executed", { decisionId: "D-complete" });
  const verificationContextVersion = state.verificationContextVersion;
  state = apply(state, 6, "completion_attempt_started", {
    completionAttemptId: "attempt-1",
    verificationId: "verify-1",
    proposalDecisionId: "D-complete",
    basedOnVerificationContextVersion: verificationContextVersion,
    contractFingerprint: "contract-fingerprint",
    evidenceVersion: 1,
    evidenceFingerprint: "evidence-fingerprint",
    evidenceIndex: [{ id: CANDIDATE_EVIDENCE_ID, admissible: true }]
  });
  return state;
}

function verificationResult(state, overrides = {}) {
  const attempt = state.verification.activeAttempt;
  return {
    schemaVersion: 1,
    runId: state.run.runId,
    completionAttemptId: attempt.completionAttemptId,
    verificationId: attempt.verificationId,
    proposalDecisionId: attempt.proposalDecisionId,
    basedOnStateVersion: attempt.basedOnStateVersion,
    basedOnVerificationContextVersion: attempt.basedOnVerificationContextVersion,
    contractFingerprint: attempt.contractFingerprint,
    evidenceVersion: attempt.evidenceVersion,
    evidenceFingerprint: attempt.evidenceFingerprint,
    verificationStatus: "satisfied",
    criteria: [{
      id: "AC1",
      status: "satisfied",
      evidenceRefs: [CANDIDATE_EVIDENCE_ID],
      reasonCodes: [],
      explanation: "The response explains the result."
    }],
    blockers: [],
    unresolvedIssues: [],
    reasonCodes: [],
    diagnostics: {},
    ...overrides
  };
}

function assessmentMessage() {
  return {
    content: "",
    toolCalls: [{
      id: "assess-1",
      function: {
        name: "assess_acceptance_criteria",
        arguments: JSON.stringify({
          overallStatus: "complete",
          criteria: [{
            id: "AC1",
            status: "met",
            evidenceQuote: "observed result",
            evidenceIds: [CANDIDATE_EVIDENCE_ID],
            explanation: "The response explains the result.",
            claimType: "response-content"
          }],
          unmetSummary: ""
        })
      }
    }]
  };
}

function createActivityHarness() {
  const ledger = createCompletionEvidenceLedger();
  let assessment = null;
  return {
    ledger,
    activityRun: {
      recordCandidateEvidence: (candidate) => ledger.recordCandidateEvidence(candidate),
      listEvidence: () => ledger.listEvidence(),
      setCompletionAssessment: (value) => { assessment = value; }
    },
    getAssessment: () => assessment
  };
}

function createControllerHarness(runId, provider, contract = CONTRACT) {
  const stateSession = createAgentStateShadow({ runId, requestId: runId, controlMode: "controller" });
  stateSession.applyControllerEvent("intent_contract_observed", { contract });
  stateSession.applyControllerEvent("decision_proposed", { decision: proposal() });
  stateSession.applyControllerEvent("decision_accepted", { decisionId: "D-complete" });
  const activity = createActivityHarness();
  const emitted = [];
  const orchestrator = createAgentCompletionOrchestrator({
    stateSession,
    activityRun: activity.activityRun,
    provider,
    settings: {},
    prompts: {},
    emit: (value) => emitted.push(value)
  });
  return { stateSession, activity, emitted, orchestrator };
}

test("AgentState v5 changes global stateVersion without staling completion bookkeeping", () => {
  const beforeAttempt = createReducerAttempt();
  assert.equal(beforeAttempt.verificationContextVersion, 4);
  assert.equal(beforeAttempt.stateVersion, 6);
  assert.equal(beforeAttempt.verification.activeAttempt.basedOnVerificationContextVersion, 4);

  const recorded = apply(beforeAttempt, 7, "verification_result_recorded", {
    result: verificationResult(beforeAttempt)
  });
  assert.equal(recorded.stateVersion, 7);
  assert.equal(recorded.verificationContextVersion, 4);
});

test("verification-context versioning covers only truth-changing event classes", () => {
  for (const type of [
    "intent_contract_observed", "decision_proposed", "decision_accepted", "decision_rejected",
    "decision_execution_authorized", "decision_executed", "decision_superseded",
    "action_started", "action_finished", "observation_recorded",
    "approval_requested", "approval_resolved", "user_input_requested", "user_input_resolved",
    "steering_observed", "run_summary_observed", "run_failed", "run_cancelled"
  ]) assert.equal(VERIFICATION_RELEVANT_EVENT_TYPES.has(type), true, type);
  for (const type of [
    "run_started", "completion_attempt_started", "verification_result_recorded",
    "verification_result_rejected", "completion_accepted", "completion_rejected",
    "completion_terminated", "final_response_recorded", "run_completed"
  ]) assert.equal(VERIFICATION_RELEVANT_EVENT_TYPES.has(type), false, type);
});

test("material observations stale an in-flight result and forged completion acceptance is rejected", () => {
  let state = createReducerAttempt("run-stale");
  const staleResult = verificationResult(state);
  state = apply(state, 7, "observation_recorded", {
    observation: {
      observationId: "OBS-1",
      toolCallId: "tool-1",
      tool: "read_file",
      executionStatus: "executed",
      outcome: "succeeded",
      summary: { text: "Read the file.", source: "tool" },
      effect: "read",
      capability: "workspace.read",
      resource: "target.md",
      files: ["target.md"],
      evidenceRef: "EV1",
      verification: { verifiedState: true, independentlyConfirmed: true }
    }
  });
  assert.equal(state.verificationContextVersion, staleResult.basedOnVerificationContextVersion + 1);
  const stale = applyAgentStateEvent(state, event("run-stale", 8, "verification_result_recorded", { result: staleResult }));
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, "stale-verification-context");

  let forged = createReducerAttempt("run-forged");
  forged = apply(forged, 7, "verification_result_recorded", {
    result: verificationResult(forged, {
      verificationStatus: "unsatisfied",
      criteria: [{ id: "AC1", status: "unsatisfied", evidenceRefs: [], reasonCodes: ["missing_evidence"], explanation: "Missing evidence." }]
    })
  });
  const accepted = applyAgentStateEvent(forged, event("run-forged", 8, "completion_accepted", {
    completionAttemptId: "attempt-1",
    verificationId: "verify-1"
  }));
  assert.equal(accepted.accepted, false);
  assert.equal(accepted.reason, "criterion_unsatisfied");
});

test("attempt and verification identities reject duplicate results and terminal-attempt resurrection", () => {
  let state = createReducerAttempt("run-identity");
  state = apply(state, 7, "verification_result_rejected", {
    completionAttemptId: "attempt-1",
    verificationId: "verify-1",
    reasonCodes: ["stale_evidence_snapshot"]
  });
  const duplicate = applyAgentStateEvent(state, event("run-identity", 8, "verification_result_rejected", {
    completionAttemptId: "attempt-1",
    verificationId: "verify-1",
    reasonCodes: ["stale_evidence_snapshot"]
  }));
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, "duplicate-verification-result");
  state = apply(state, 9, "completion_attempt_superseded", {
    completionAttemptId: "attempt-1",
    reasonCodes: ["stale_evidence_snapshot"]
  });
  const resurrected = applyAgentStateEvent(state, event("run-identity", 10, "completion_attempt_started", {
    completionAttemptId: "attempt-1",
    verificationId: "verify-2",
    proposalDecisionId: "D-complete",
    basedOnVerificationContextVersion: state.verificationContextVersion,
    contractFingerprint: "contract-fingerprint",
    evidenceVersion: 2,
    evidenceFingerprint: "new-evidence"
  }));
  assert.equal(resurrected.accepted, false);
  assert.equal(resurrected.reason, "completion-attempt-not-verifying");
});

test("inadmissible evidence and non-satisfied verifier statuses cannot produce success", () => {
  let state = createReducerAttempt("run-inadmissible");
  state.verification.activeAttempt.evidenceIndex[0].admissible = false;
  state = apply(state, 7, "verification_result_recorded", { result: verificationResult(state) });
  const inadmissible = applyAgentStateEvent(state, event("run-inadmissible", 8, "completion_accepted", {
    completionAttemptId: "attempt-1",
    verificationId: "verify-1"
  }));
  assert.equal(inadmissible.accepted, false);
  assert.equal(inadmissible.reason, "inadmissible_evidence");

  const provisionalState = createReducerAttempt("run-provisional");
  provisionalState.intentContract.verifiability = "provisional";
  assert.equal(evaluateCompletionPolicy({ state: provisionalState, result: verificationResult(provisionalState, { verificationStatus: "provisional" }) }).outcome, "provisional");
  const unverifiedState = createReducerAttempt("run-unverified");
  unverifiedState.intentContract.verifiability = "unverified";
  assert.equal(evaluateCompletionPolicy({ state: unverifiedState, result: verificationResult(unverifiedState, { verificationStatus: "unverified" }) }).outcome, "unverified");
  const unsatisfiedState = createReducerAttempt("run-unsatisfied");
  const unsatisfied = verificationResult(unsatisfiedState, { verificationStatus: "unsatisfied" });
  assert.equal(evaluateCompletionPolicy({ state: unsatisfiedState, result: unsatisfied }).outcome, "rejected");
  assert.equal(evaluateCompletionPolicy({
    state: unsatisfiedState,
    result: { ...unsatisfied, blockers: [{ type: "blocked", recoverable: false }] }
  }).outcome, "blocked");
});

test("evidence versions change only when normalized ledger content changes", () => {
  const ledger = createCompletionEvidenceLedger();
  const tracker = createVerificationEvidenceTracker(() => ledger.listEvidence());
  const empty = tracker.snapshot();
  assert.equal(tracker.snapshot().evidenceVersion, empty.evidenceVersion);
  ledger.recordToolEvidence({ toolCallId: "tool-1", tool: "read_file", args: { path: "target.md" }, result: { content: "ok" } });
  const inserted = tracker.snapshot();
  assert.equal(inserted.evidenceVersion, empty.evidenceVersion + 1);
  assert.equal(ledger.getEvidenceSnapshot().evidenceVersion, 1);
  assert.equal(ledger.getEvidenceById("EV1").toolCallId, "tool-1");
  assert.equal(ledger.getEvidenceById("missing"), null);
  ledger.recordToolEvidence({ toolCallId: "tool-1", tool: "read_file", args: { path: "target.md" }, result: { content: "duplicate" } });
  assert.equal(tracker.snapshot().evidenceVersion, inserted.evidenceVersion);
  assert.equal(ledger.getEvidenceSnapshot().evidenceVersion, 1);
});

test("bounded evidence selection is deterministic and marks criterion overflow", () => {
  const contract = {
    taskType: "diagnostic",
    namedTargets: { files: [{ value: "target.md" }] },
    acceptanceCriteria: [{ id: "AC-file", description: "Read target.md and report what it contains" }]
  };
  const entries = Array.from({ length: 21 }, (_value, index) => ({
    id: `EV${index + 1}`,
    source: "tool",
    tool: "read_file",
    outcome: "succeeded",
    verifiedState: true,
    truncated: false,
    successConfirmedIndependently: true,
    confirmationSource: "tool",
    files: ["target.md"],
    summary: `read ${index + 1}`
  }));
  const first = buildBoundedEvidenceSnapshot({ entries, contract, citedEvidenceIds: ["EV1"] });
  const second = buildBoundedEvidenceSnapshot({ entries, contract, citedEvidenceIds: ["EV1"] });
  assert.deepEqual(first, second);
  assert.equal(first.entries.length, 20);
  assert.deepEqual(first.truncatedCriterionIds, ["AC-file"]);
  assert.equal(first.criterionEvidence[0].relevantEvidenceIds[0], "EV1");
});

test("orchestrator records one fresh accepted verification before semantic success", async () => {
  const usage = [];
  const provider = {
    completeMessage: async (_messages, options) => {
      options.onUsage?.({ promptTokens: 3, completionTokens: 1 });
      usage.push("reported");
      return assessmentMessage();
    }
  };
  const harness = createControllerHarness("run-success", provider);
  const result = await harness.orchestrator.runCompletionAttempt({
    decision: proposal(),
    candidate: "The observed result is explained.",
    contract: CONTRACT
  });
  const state = harness.stateSession.getState();
  assert.equal(result.action, "stop");
  assert.equal(result.outcome, "succeeded");
  assert.equal(state.completion.status, "succeeded");
  assert.equal(state.lifecycle.status, "running", "semantic success remains separate from technical completion");
  assert.equal(state.verification.acceptedCount, 1);
  assert.equal(state.verification.staleCount, 0);
  assert.equal(state.completion.finalResponse.outcome, "succeeded");
  assert.equal(harness.activity.getAssessment().overallStatus, "complete");
  assert.equal(harness.emitted.filter((entry) => entry.type === "agent-verification" && entry.status === "started").length, 1);
  assert.equal(harness.emitted.filter((entry) => entry.type === "completion-assessment").length, 1);
  assert.deepEqual(usage, ["reported"]);
  assert.equal(harness.stateSession.getTransitionsSince(0).filter((entry) => entry.type === "final_response_recorded").length, 1);
  assert.throws(() => harness.stateSession.applyControllerEvent("final_response_recorded", {
    response: state.completion.finalResponse
  }), /duplicate-final-response/);
});

test("blocking ambiguity is rejected into the existing clarification steering class", async () => {
  const contract = {
    ...CONTRACT,
    ambiguities: [{ id: "AMB1", blocking: true, question: "Which result?" }]
  };
  const harness = createControllerHarness("run-ambiguity", { completeMessage: async () => assessmentMessage() }, contract);
  const result = await harness.orchestrator.runCompletionAttempt({
    decision: proposal(),
    candidate: "The observed result is explained.",
    contract
  });
  assert.equal(result.action, "continue");
  assert.equal(result.outcome, "rejected");
  assert.equal(result.assessment.overallStatus, "incomplete");
  assert.equal(result.assessment.criteria[0].arbitration.class, "ambiguity");
  assert.equal(harness.stateSession.getState().completion.status, "rejected");
});

test("one evidence-only stale result retries under the same attempt with a new verification id", async () => {
  let calls = 0;
  let harness;
  const provider = {
    completeMessage: async () => {
      calls += 1;
      if (calls === 1) {
        const details = { toolCallId: "late-1", tool: "read_file", args: { path: "late.md" }, result: { content: "late evidence" }, summary: "Late evidence" };
        harness.activity.ledger.recordToolEvidence(details);
        harness.stateSession.observeToolEvidence(details);
      }
      return assessmentMessage();
    }
  };
  harness = createControllerHarness("run-retry", provider);
  const result = await harness.orchestrator.runCompletionAttempt({
    decision: proposal(),
    candidate: "The observed result is explained.",
    contract: CONTRACT
  });
  const state = harness.stateSession.getState();
  const started = harness.emitted.filter((entry) => entry.type === "agent-verification" && entry.status === "started");
  assert.equal(result.outcome, "succeeded");
  assert.equal(calls, 2);
  assert.equal(started.length, 2);
  assert.equal(started[0].completionAttemptId, started[1].completionAttemptId);
  assert.notEqual(started[0].verificationId, started[1].verificationId);
  assert.equal(state.verification.staleCount, 1);
  assert.equal(state.verification.activeAttempt.requestCount, 2);
});

test("a second stale verifier result supersedes the attempt without semantic success", async () => {
  let calls = 0;
  let harness;
  const provider = {
    completeMessage: async () => {
      calls += 1;
      const details = {
        toolCallId: `late-${calls}`,
        tool: "read_file",
        args: { path: `late-${calls}.md` },
        result: { content: "late evidence" },
        summary: "Late evidence"
      };
      harness.activity.ledger.recordToolEvidence(details);
      harness.stateSession.observeToolEvidence(details);
      return assessmentMessage();
    }
  };
  harness = createControllerHarness("run-second-stale", provider);
  const result = await harness.orchestrator.runCompletionAttempt({
    decision: proposal(),
    candidate: "The observed result is explained.",
    contract: CONTRACT
  });
  const state = harness.stateSession.getState();
  assert.equal(result.action, "continue");
  assert.equal(calls, 2);
  assert.equal(state.completion.status, "rejected");
  assert.equal(state.verification.activeAttempt.status, "superseded");
  assert.equal(state.verification.staleCount, 2);
  assert.equal(state.completion.finalResponse, null);
});

test("state-grounded response replaces unsupported confident completion prose", () => {
  const state = {
    criteria: [{ id: "AC1", status: "unsatisfied", evidenceRefs: [] }],
    artifacts: { changedFiles: [], attemptedFiles: [] },
    recentObservations: [],
    completion: { status: "blocked", unresolvedIssues: [{ description: "Approval was denied." }] }
  };
  const response = composeFinalResponse({
    state,
    outcome: "blocked",
    proposalContent: "Implemented src/secret.js and tests passed."
  });
  assert.equal(response.claimValidation.valid, false);
  assert.ok(response.claimValidation.reasonCodes.includes("success_claim_without_success"));
  assert.ok(response.claimValidation.reasonCodes.includes("validation_claim_without_evidence"));
  assert.ok(response.claimValidation.reasonCodes.includes("file_claim_without_state_reference"));
  assert.equal(response.content.includes("tests passed"), false);
  assert.equal(fingerprint(response), fingerprint(composeFinalResponse({
    state,
    outcome: "blocked",
    proposalContent: "Implemented src/secret.js and tests passed."
  })));
});

test("Agent tool loop activates M5 only for the enabled controller path", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m5-loop-"));
  const session = createAgentStateShadow({ requestId: "m5-loop", prompt: "Explain the observed result", controlMode: "controller" });
  session.configureContextSources({ requestId: "m5-loop", prompt: "Explain the observed result", systemPrompt: "You are the Agent." });
  session.applyControllerEvent("intent_contract_observed", { contract: CONTRACT });
  const events = [];
  const provider = {
    completeMessage: async (_messages, options = {}) => {
      if (options.toolChoice?.function?.name === "assess_acceptance_criteria") return assessmentMessage();
      return {
        content: "",
        toolCalls: [{
          id: "complete-1",
          type: "function",
          function: {
            name: "agent_propose_completion",
            arguments: JSON.stringify({
              _decision: {
                intentId: "task",
                rationale: "The answer is ready for verification.",
                expectedObservation: ""
              },
              content: "The observed result is explained.",
              evidenceIds: [CANDIDATE_EVIDENCE_ID]
            })
          }
        }]
      };
    }
  };
  const settings = runtime.normalizeAiCompanionSettings({
    enabled: true,
    agentEnabled: true,
    agentDecisionControllerEnabled: true,
    agentVerifierCompletionEnabled: true,
    intentContractsEnabled: true,
    maxTasksPerChat: 4
  });
  try {
    const content = await runtime.runAgentToolLoop(provider, settings, root, "Explain the observed result", "agent",
      session.wrapEmit((value) => events.push(value)), runtime, {
        requestId: "m5-loop",
        systemPrompt: "You are the Agent.",
        skipIntentPhase: true,
        intentContract: CONTRACT,
        observeToolEvidence: session.observeToolEvidence,
        observeDecisionContext: session.observeDecisionContext,
        agentStateSession: session
      });
    const state = session.getState();
    assert.equal(state.completion.status, "succeeded");
    assert.equal(state.verification.acceptedCount, 1);
    assert.equal(events.filter((event) => event.type === "agent-completion" && event.status === "succeeded").length, 1);
    assert.equal(events.filter((event) => event.type === "completion-assessment" && event.stateOwned === true).length, 1);
    assert.match(content, /observed result is explained/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
