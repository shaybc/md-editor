/**
 * AgentState schema and its single-writer transition reducer.
 */

"use strict";

const {
  COMPLETION_EVENT_TYPES,
  applyAgentCompletionTransition,
  createInitialCompletionState,
  createInitialVerificationState
} = require("./agent-completion-state");
const {
  acceptStrategyRevision,
  applyProgressAssessment,
  createInitialProgressState,
  exhaustProgressBudget,
  recordReplanAttempt,
  requireReplan
} = require("./agent-progress-policy");
const { evaluateActionReadiness } = require("./action-readiness");
const { projectObservation } = require("./task-observation-projection");
const { advanceWorkflowStep, derivePreferencesStepEvent } = require("./workflow-progression");

const AGENT_STATE_SCHEMA_VERSION = 6;
const AGENT_STATE_EVENT_SCHEMA_VERSION = 6;
const MAX_RECENT_ACTIONS = 50;
const MAX_RECENT_DECISIONS = 50;
const MAX_RECENT_INTERACTIONS = 25;
const MAX_RECENT_OBSERVATIONS = 50;
const MAX_OBSERVATION_IDS = 500;
const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled"]);
const TERMINAL_ACTION_STATUSES = new Set(["succeeded", "partial", "failed", "denied", "cancelled", "interrupted", "unknown"]);
const EVENT_TYPES = new Set([
  "run_started",
  "run_restored",
  "recovery_started",
  "interaction_interrupted",
  "action_dispatch_prepared",
  "action_dispatching",
  "action_reconciliation_started",
  "action_reconciled",
  "action_marked_indeterminate",
  "verification_interrupted",
  "recovery_resumed",
  "recovery_blocked",
  "intent_contract_observed",
  "decision_proposed",
  "decision_accepted",
  "decision_rejected",
  "decision_execution_authorized",
  "decision_executed",
  "decision_superseded",
  "action_started",
  "action_finished",
  "observation_recorded",
  "approval_requested",
  "approval_resolved",
  "user_input_requested",
  "user_input_resolved",
  "verification_recorded",
  "completion_attempt_started",
  "completion_attempt_superseded",
  "verification_result_recorded",
  "verification_result_rejected",
  "completion_accepted",
  "completion_rejected",
  "completion_terminated",
  "final_response_recorded",
  "progress_recorded",
  "replan_required",
  "replan_attempted",
  "strategy_revised",
  "progress_budget_exhausted",
  "steering_observed",
  "run_summary_observed",
  "task_profile_seeded",
  "task_profile_updated",
  "run_completed",
  "run_failed",
  "run_cancelled"
]);
const VERIFICATION_RELEVANT_EVENT_TYPES = new Set([
  "intent_contract_observed",
  "decision_proposed",
  "decision_accepted",
  "decision_rejected",
  "decision_execution_authorized",
  "decision_executed",
  "decision_superseded",
  "action_started",
  "action_finished",
  "observation_recorded",
  "approval_requested",
  "approval_resolved",
  "user_input_requested",
  "user_input_resolved",
  "replan_required",
  "replan_attempted",
  "strategy_revised",
  "progress_budget_exhausted",
  "steering_observed",
  "run_summary_observed",
  "run_failed",
  "run_cancelled"
]);

const RECOVERY_RELEVANT_EVENT_TYPES = new Set([
  "run_restored",
  "recovery_started",
  "interaction_interrupted",
  "action_dispatch_prepared",
  "action_dispatching",
  "action_reconciliation_started",
  "action_reconciled",
  "action_marked_indeterminate",
  "verification_interrupted",
  "recovery_resumed",
  "recovery_blocked"
]);

function cloneSerializable(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function stringValue(value, maxLength = 2000) {
  const text = String(value || "");
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
}

function normalizeCriterion(criterion = {}, prior = null) {
  return {
    id: stringValue(criterion.id, 80),
    statement: stringValue(criterion.statement || criterion.description),
    status: prior?.status || "pending",
    evidenceRefs: Array.isArray(prior?.evidenceRefs) ? [...prior.evidenceRefs] : []
  };
}

function normalizeAssessment(assessment = {}) {
  return {
    overallStatus: stringValue(assessment.overallStatus || "not_assessed", 40),
    criteria: (Array.isArray(assessment.criteria) ? assessment.criteria : []).map((criterion) => ({
      id: stringValue(criterion?.id, 80),
      status: stringValue(criterion?.status || "unknown", 40),
      evidenceIds: uniqueStrings(criterion?.evidenceIds),
      evidenceQuote: stringValue(criterion?.evidenceQuote),
      explanation: stringValue(criterion?.explanation),
      claimType: stringValue(criterion?.claimType || criterion?.harnessClaimType, 80)
    })),
    unmetSummary: stringValue(assessment.unmetSummary)
  };
}

function normalizeFileReferences(files) {
  return (Array.isArray(files) ? files : []).map((file) => ({
    path: stringValue(file?.path || file, 1000),
    name: stringValue(file?.name, 300),
    description: stringValue(file?.description)
  })).filter((file) => file.path);
}

function normalizeBlockedChanges(changes) {
  return (Array.isArray(changes) ? changes : []).map((change) => ({
    code: stringValue(change?.code, 160),
    decisionId: stringValue(change?.decisionId, 160),
    capability: stringValue(change?.capability, 160),
    count: Math.max(0, Number(change?.count) || 0)
  }));
}

function normalizeArtifactReference(reference) {
  if (!reference || typeof reference !== "object") return null;
  return {
    id: stringValue(reference.id, 160),
    digest: stringValue(reference.digest, 128),
    kind: stringValue(reference.kind || "tool-result", 80),
    contentType: stringValue(reference.contentType || "application/json", 120),
    retention: "run",
    sizeChars: Math.max(0, Number(reference.sizeChars) || 0),
    truncated: reference.truncated === true
  };
}

function normalizeObservation(observation, occurredAt) {
  const executionStatuses = new Set(["executed", "denied", "skipped", "cancelled"]);
  const outcomes = new Set(["succeeded", "partial", "failed", "no-op", "unknown"]);
  const summarySources = new Set(["deterministic", "tool", "model", "legacy-event"]);
  return {
    schemaVersion: 1,
    observationId: stringValue(observation?.observationId, 200),
    source: "tool",
    toolCallId: stringValue(observation?.toolCallId, 200),
    tool: stringValue(observation?.tool, 200),
    executionStatus: executionStatuses.has(observation?.executionStatus) ? observation.executionStatus : "executed",
    outcome: outcomes.has(observation?.outcome) ? observation.outcome : "unknown",
    summary: {
      text: stringValue(observation?.summary?.text),
      source: summarySources.has(observation?.summary?.source) ? observation.summary.source : "legacy-event"
    },
    effect: stringValue(observation?.effect || "unknown", 80),
    capability: stringValue(observation?.capability || "unknown", 160),
    resource: stringValue(observation?.resource, 1000),
    files: uniqueStrings(observation?.files).slice(0, 20),
    evidenceRef: stringValue(observation?.evidenceRef, 160),
    artifactRef: normalizeArtifactReference(observation?.artifactRef),
    truncated: observation?.truncated === true,
    verification: {
      verifiedState: observation?.verification?.verifiedState === true,
      independentlyConfirmed: observation?.verification?.independentlyConfirmed === true,
      confirmationSource: stringValue(observation?.verification?.confirmationSource, 160)
    },
    observedAt: occurredAt
  };
}

function normalizeDecision(decision = {}) {
  const payload = decision.payload && typeof decision.payload === "object" && !Array.isArray(decision.payload)
    ? decision.payload
    : {};
  const normalizedPayload = decision.type === "request_user_input"
    ? {
        question: stringValue(payload.question),
        reason: stringValue(payload.reason),
        answerType: stringValue(payload.answerType, 40),
        choices: uniqueStrings(payload.choices).slice(0, 10)
      }
    : (decision.type === "propose_completion"
      ? { evidenceIds: uniqueStrings(payload.evidenceIds).slice(0, 50) }
      : (decision.type === "report_blocked"
        ? {
            blockerType: stringValue(payload.blockerType, 80),
            description: stringValue(payload.description),
            attemptedDecisionIds: uniqueStrings(payload.attemptedDecisionIds).slice(0, 50),
            recoverableByUser: payload.recoverableByUser === true,
            requiredUserAction: stringValue(payload.requiredUserAction),
            requiredCapability: stringValue(payload.requiredCapability, 200)
          }
        : null));
  return {
    schemaVersion: 1,
    decisionId: stringValue(decision.decisionId, 200),
    basedOnStateVersion: Math.max(0, Number(decision.basedOnStateVersion) || 0),
    type: stringValue(decision.type || "invalid", 80),
    intentId: stringValue(decision.intentId, 160),
    rationale: stringValue(decision.rationale, 1000),
    expectedObservation: stringValue(decision.expectedObservation, 1000),
    status: "proposed",
    proposedAtStateVersion: null,
    acceptedAtStateVersion: null,
    authorizedAtStateVersion: null,
    executedAtStateVersion: null,
    runtimeReasonCodes: uniqueStrings(decision.runtimeReasonCodes).slice(0, 20),
    replacesDecisionId: stringValue(decision.replacesDecisionId, 200),
    strategyRevision: Math.max(0, Number(decision.strategyRevision) || 0),
    replan: decision.replan && typeof decision.replan === "object" ? {
      triggerAssessmentIds: uniqueStrings(decision.replan.triggerAssessmentIds).slice(0, 20),
      abandonedApproach: stringValue(decision.replan.abandonedApproach, 1000),
      revisedApproach: stringValue(decision.replan.revisedApproach, 1000)
    } : null,
    actionSignature: stringValue(decision.actionSignature, 128),
    strategySignature: stringValue(decision.strategySignature, 128),
    strategyClass: stringValue(decision.strategyClass || "other", 80),
    targetScope: stringValue(decision.targetScope, 1000),
    conceptTokens: uniqueStrings(decision.conceptTokens).slice(0, 20),
    tool: decision.tool ? {
      name: stringValue(decision.tool.name, 200),
      providerCallId: stringValue(decision.tool.providerCallId, 200)
    } : null,
    payload: normalizedPayload,
    observationIds: uniqueStrings(decision.observationIds).slice(0, 20)
  };
}

/**
 * Create an initialized state that cannot become active until `run_started` is accepted.
 * @param {object} options Run identity and original user request.
 * @returns {object} A JSON-serializable AgentState at version zero.
 */
function createInitialAgentState(options = {}) {
  return {
    schemaVersion: AGENT_STATE_SCHEMA_VERSION,
    controlMode: options.controlMode === "controller" ? "controller" : "shadow",
    run: {
      runId: String(options.runId || ""),
      requestId: String(options.requestId || ""),
      chatId: String(options.chatId || ""),
      turnIndex: Number.isInteger(options.turnIndex) ? options.turnIndex : null,
      executionKind: String(options.executionKind || "new"),
      executionGeneration: Math.max(1, Number(options.executionGeneration) || 1),
      mode: "agent"
    },
    lifecycle: { status: "initialized", startedAt: null, endedAt: null },
    originalPrompt: String(options.prompt || ""),
    intentContract: null,
    intentContractMeta: null,
    criteria: [],
    recentDecisions: [],
    decisionCounts: { proposed: 0, accepted: 0, rejected: 0, executed: 0, superseded: 0 },
    activeActions: [],
    recentActions: [],
    actionCounts: {
      succeeded: 0,
      partial: 0,
      failed: 0,
      denied: 0,
      cancelled: 0,
      interrupted: 0,
      unknown: 0
    },
    recentObservations: [],
    observationIds: [],
    observationCounts: {
      execution: { executed: 0, denied: 0, skipped: 0, cancelled: 0 },
      outcome: { succeeded: 0, partial: 0, failed: 0, "no-op": 0, unknown: 0 }
    },
    pendingInteractions: [],
    interactions: [],
    verification: createInitialVerificationState(),
    completion: createInitialCompletionState(),
    progress: createInitialProgressState({
      evaluationEnabled: options.progressEvaluationEnabled === true,
      controlEnabled: options.progressControlEnabled === true,
      noProgressThreshold: options.noProgressThreshold,
      maxStrategyReplans: options.maxStrategyReplans
    }),
    artifacts: { evidenceRefs: [], changedFiles: [], attemptedFiles: [], blockedChanges: [] },
    steering: { revisionCount: 0, lastReason: "" },
    // M11 task-profile slice. Null unless a certain task profile is engaged for the run.
    // Populated deterministically by the reducer from task_profile_* events; the model
    // never advances workflow steps or declares readiness.
    taskProfile: null,
    actionReadiness: null,
    recovery: {
      status: "fresh",
      resumeAttempt: 0,
      restoredCheckpointId: "",
      restoredStateVersion: 0,
      restoredAt: null,
      interruptedDecisionId: "",
      interruptedActionId: "",
      interruptedInteractionId: "",
      lastCheckpointId: "",
      lastCheckpointPhase: "",
      lastCheckpointStateVersion: 0,
      recoveryDecision: "",
      reconciliationOutcome: "",
      lastReasonCode: ""
    },
    terminalReason: null,
    lastAcceptedSequence: 0,
    verificationContextVersion: 0,
    stateVersion: 0
  };
}

function rejectTransition(state, reason) {
  return { accepted: false, reason, state };
}

function validateEnvelope(state, event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return "invalid-event";
  if (event.schemaVersion !== AGENT_STATE_EVENT_SCHEMA_VERSION) return "unsupported-event-schema";
  if (!EVENT_TYPES.has(event.type)) return "unsupported-event-type";
  if (String(event.runId || "") !== state.run.runId) return "wrong-run";
  if (!Number.isInteger(event.sequence) || event.sequence <= 0) return "invalid-sequence";
  if (event.sequence === state.lastAcceptedSequence) return "duplicate-sequence";
  if (event.sequence < state.lastAcceptedSequence) return "out-of-order-sequence";
  if (!event.occurredAt || Number.isNaN(Date.parse(event.occurredAt))) return "invalid-occurred-at";
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) return "invalid-payload";
  if (TERMINAL_RUN_STATUSES.has(state.lifecycle.status)) return "post-terminal-event";
  if (state.lifecycle.status === "initialized" && event.type !== "run_started") return "run-not-started";
  return "";
}

function appendTerminalAction(state, action) {
  const status = TERMINAL_ACTION_STATUSES.has(action.status) ? action.status : "unknown";
  const terminalAction = { ...action, status };
  state.recentActions = [...state.recentActions, terminalAction].slice(-MAX_RECENT_ACTIONS);
  state.actionCounts[status] = (Number(state.actionCounts[status]) || 0) + 1;
}

function finishAction(state, payload, occurredAt) {
  const actionId = String(payload.actionId || "");
  if (!actionId) return "missing-action-id";
  const activeIndex = state.activeActions.findIndex((action) => action.actionId === actionId);
  const active = activeIndex >= 0 ? state.activeActions[activeIndex] : null;
  if (activeIndex >= 0) state.activeActions.splice(activeIndex, 1);
  appendTerminalAction(state, {
    ...(active || {
      actionId,
      tool: stringValue(payload.tool, 200),
      input: stringValue(payload.input),
      startedAt: null,
      matchStatus: "unmatched"
    }),
    status: TERMINAL_ACTION_STATUSES.has(payload.status) ? payload.status : "unknown",
    summary: stringValue(payload.summary),
    error: stringValue(payload.error),
    observationId: stringValue(payload.observationId, 200),
    endedAt: occurredAt,
    terminalReason: payload.terminalReason ? stringValue(payload.terminalReason) : null
  });
  return "";
}

function recordObservation(state, payload, occurredAt) {
  const observation = normalizeObservation(payload.observation, occurredAt);
  if (!observation.observationId || !observation.tool) return "invalid-observation";
  if (state.observationIds.includes(observation.observationId)) return "duplicate-observation";
  state.observationIds = [...state.observationIds, observation.observationId].slice(-MAX_OBSERVATION_IDS);
  state.recentObservations = [...state.recentObservations, observation].slice(-MAX_RECENT_OBSERVATIONS);
  state.observationCounts.execution[observation.executionStatus] += 1;
  state.observationCounts.outcome[observation.outcome] += 1;
  const decisionIndex = state.recentDecisions.findIndex((decision) => decision.tool?.providerCallId && decision.tool.providerCallId === observation.toolCallId);
  if (decisionIndex >= 0) {
    const decision = state.recentDecisions[decisionIndex];
    state.recentDecisions[decisionIndex] = {
      ...decision,
      observationIds: uniqueStrings([...(decision.observationIds || []), observation.observationId]).slice(-20)
    };
  }
  return "";
}

function updateDecision(state, decisionId, allowedStatuses, update) {
  const index = state.recentDecisions.findIndex((decision) => decision.decisionId === String(decisionId || ""));
  if (index < 0) return "unknown-decision";
  const current = state.recentDecisions[index];
  if (!allowedStatuses.has(current.status)) return "invalid-decision-status";
  state.recentDecisions[index] = { ...current, ...update };
  return "";
}

function recordDecisionCount(state, status) {
  state.decisionCounts[status] = (Number(state.decisionCounts[status]) || 0) + 1;
}

function appendInteraction(state, interaction) {
  state.interactions = [...state.interactions, interaction].slice(-MAX_RECENT_INTERACTIONS);
}

function requestInteraction(state, payload, kind, occurredAt) {
  const interactionId = String(payload.interactionId || "");
  if (!interactionId) return "missing-interaction-id";
  if (state.pendingInteractions.some((entry) => entry.interactionId === interactionId)) return "duplicate-interaction";
  state.pendingInteractions.push({
    interactionId,
    decisionId: stringValue(payload.decisionId, 200),
    kind,
    status: "pending",
    prompt: cloneSerializable(payload.prompt ?? payload.details ?? ""),
    source: "agent",
    requestedAt: occurredAt
  });
  return "";
}

function resolveInteraction(state, payload, kind, occurredAt) {
  const interactionId = String(payload.interactionId || "");
  if (!interactionId) return "missing-interaction-id";
  const pendingIndex = state.pendingInteractions.findIndex((entry) => entry.interactionId === interactionId && entry.kind === kind);
  const pending = pendingIndex >= 0 ? state.pendingInteractions[pendingIndex] : {
    interactionId,
    decisionId: stringValue(payload.decisionId, 200),
    kind,
    prompt: null,
    source: "agent",
    requestedAt: null,
    matchStatus: "unmatched"
  };
  if (pendingIndex >= 0) state.pendingInteractions.splice(pendingIndex, 1);
  appendInteraction(state, {
    ...pending,
    status: payload.status === "denied" ? "denied" : "resolved",
    response: cloneSerializable(payload.response),
    instructions: payload.instructions === undefined ? "" : String(payload.instructions),
    decision: stringValue(payload.decision, 80),
    responseSource: "user",
    resolvedAt: occurredAt
  });
  return "";
}

function interruptInteraction(state, payload, occurredAt) {
  const interactionId = String(payload.interactionId || "");
  if (!interactionId) return "missing-interaction-id";
  const pendingIndex = state.pendingInteractions.findIndex((entry) => entry.interactionId === interactionId);
  if (pendingIndex < 0) return "unknown-interaction";
  const pending = state.pendingInteractions[pendingIndex];
  state.pendingInteractions.splice(pendingIndex, 1);
  appendInteraction(state, {
    ...pending,
    status: "interrupted",
    resolvedAt: occurredAt,
    terminalReason: "process-restart"
  });
  state.recovery.interruptedInteractionId = interactionId;
  return "";
}

function findActiveAction(state, actionId) {
  return state.activeActions.find((action) => action.actionId === String(actionId || ""));
}

function reconcileTerminalState(state, status, reason, occurredAt) {
  const actionStatus = status === "cancelled" ? "cancelled" : "interrupted";
  for (const action of state.activeActions) {
    appendTerminalAction(state, {
      ...action,
      status: actionStatus,
      endedAt: occurredAt,
      terminalReason: reason
    });
  }
  state.activeActions = [];
  const interactionStatus = status === "cancelled" ? "cancelled" : "abandoned";
  for (const interaction of state.pendingInteractions) {
    appendInteraction(state, {
      ...interaction,
      status: interactionStatus,
      resolvedAt: occurredAt,
      terminalReason: reason
    });
  }
  state.pendingInteractions = [];
  state.lifecycle = { ...state.lifecycle, status, endedAt: occurredAt };
  state.terminalReason = reason;
}

/**
 * Recompute the action-readiness verdict from the current task-profile slice (M11.3).
 * Sets next.actionReadiness (or null when no profile is engaged). Deterministic; reads
 * only reducer-owned typed state, never model self-report.
 */
function recomputeTaskReadiness(next) {
  const tp = next.taskProfile;
  if (!tp || !tp.taskState) {
    next.actionReadiness = null;
    return;
  }
  const ts = tp.taskState;
  const verdict = evaluateActionReadiness({
    requestedTargets: ts.requestedKeys,
    resolvedTargets: ts.resolvedKeys,
    desiredValues: ts.desiredValues,
    capableToolAvailable: tp.capableToolAvailable === true,
    requiredAction: tp.requiredActionTool,
    taskAuthorized: tp.taskAuthorized !== false,
    approvalRequired: tp.approvalRequired === true,
    approvalGranted: tp.approvalGranted === true,
    stateVersion: next.stateVersion + 1
  });
  next.actionReadiness = {
    status: verdict.status,
    requiredAction: verdict.requiredAction,
    missingFacts: verdict.missingFacts,
    approvalRequired: verdict.approvalRequired,
    resolution: verdict.resolution,
    readiness: verdict.readiness
  };
}

function applyTransition(next, event) {
  if (COMPLETION_EVENT_TYPES.has(event.type)) {
    return applyAgentCompletionTransition(next, event);
  }
  const payload = event.payload;
  switch (event.type) {
    case "run_started":
      if (next.lifecycle.status !== "initialized") return "run-already-started";
      next.lifecycle = { status: "running", startedAt: event.occurredAt, endedAt: null };
      return "";
    case "run_restored":
      if (next.lifecycle.status !== "running") return "run-not-recoverable";
      next.recovery = {
        ...next.recovery,
        status: "restored",
        resumeAttempt: Math.max(0, Number(next.recovery?.resumeAttempt) || 0) + 1,
        restoredCheckpointId: stringValue(payload.checkpointId, 200),
        restoredStateVersion: Math.max(0, Number(payload.stateVersion) || 0),
        restoredAt: event.occurredAt,
        recoveryDecision: stringValue(payload.recoveryDecision, 80),
        lastCheckpointId: stringValue(payload.checkpointId, 200),
        lastCheckpointPhase: stringValue(payload.phase, 80),
        lastCheckpointStateVersion: Math.max(0, Number(payload.stateVersion) || 0),
        lastReasonCode: stringValue(payload.reasonCode, 160)
      };
      return "";
    case "recovery_started":
      next.recovery = {
        ...next.recovery,
        status: "reconciling",
        recoveryDecision: stringValue(payload.recoveryDecision, 80),
        lastReasonCode: stringValue(payload.reasonCode, 160)
      };
      return "";
    case "interaction_interrupted":
      return interruptInteraction(next, payload, event.occurredAt);
    case "action_dispatch_prepared": {
      const action = findActiveAction(next, payload.actionId);
      if (!action) return "unknown-action";
      Object.assign(action, {
        executionAttemptId: stringValue(payload.executionAttemptId, 200),
        dispatchNonce: stringValue(payload.dispatchNonce, 200),
        dispatchState: "prepared",
        workspacePath: stringValue(payload.workspacePath, 1000),
        preconditionFingerprint: stringValue(payload.preconditionFingerprint, 128),
        expectedPostcondition: stringValue(payload.expectedPostcondition, 128)
      });
      return "";
    }
    case "action_dispatching": {
      const action = findActiveAction(next, payload.actionId);
      if (!action) return "unknown-action";
      if (action.dispatchState !== "prepared") return "action-not-prepared";
      if (action.executionAttemptId !== String(payload.executionAttemptId || "")
        || action.dispatchNonce !== String(payload.dispatchNonce || "")) return "dispatch-identity-mismatch";
      action.dispatchState = "dispatching";
      return "";
    }
    case "action_reconciliation_started": {
      const action = findActiveAction(next, payload.actionId);
      if (!action) return "unknown-action";
      next.recovery.interruptedActionId = action.actionId;
      next.recovery.lastReasonCode = stringValue(payload.reasonCode, 160);
      return "";
    }
    case "action_reconciled": {
      const action = findActiveAction(next, payload.actionId);
      if (!action) return "unknown-action";
      action.dispatchState = "reconciled";
      next.recovery.reconciliationOutcome = "reconciled";
      next.recovery.lastReasonCode = stringValue(payload.reasonCode, 160);
      return finishAction(next, {
        ...payload,
        status: "succeeded",
        terminalReason: payload.reasonCode || "postcondition-proven"
      }, event.occurredAt);
    }
    case "action_marked_indeterminate": {
      const action = findActiveAction(next, payload.actionId);
      if (!action) return "unknown-action";
      action.dispatchState = "indeterminate";
      next.recovery.reconciliationOutcome = "indeterminate";
      next.recovery.lastReasonCode = stringValue(payload.reasonCode, 160);
      return finishAction(next, {
        ...payload,
        status: "unknown",
        terminalReason: payload.reasonCode || "action-indeterminate"
      }, event.occurredAt);
    }
    case "verification_interrupted":
      next.recovery.lastReasonCode = "verification-interrupted";
      return "";
    case "recovery_resumed":
      next.recovery = {
        ...next.recovery,
        status: "resumed",
        recoveryDecision: stringValue(payload.recoveryDecision, 80),
        reconciliationOutcome: stringValue(payload.reconciliationOutcome, 80),
        lastReasonCode: stringValue(payload.reasonCode, 160)
      };
      return "";
    case "recovery_blocked":
      next.recovery = {
        ...next.recovery,
        status: "blocked",
        recoveryDecision: "blocked",
        lastReasonCode: stringValue(payload.reasonCode, 160)
      };
      return "";
    case "intent_contract_observed": {
      if (!payload.contract || typeof payload.contract !== "object") return "missing-intent-contract";
      const priorById = new Map(next.criteria.map((criterion) => [criterion.id, criterion]));
      next.intentContract = cloneSerializable(payload.contract);
      next.intentContractMeta = cloneSerializable(payload.meta || null);
      next.criteria = (Array.isArray(payload.contract.acceptanceCriteria) ? payload.contract.acceptanceCriteria : [])
        .map((criterion) => normalizeCriterion(criterion, priorById.get(String(criterion?.id || ""))))
        .filter((criterion) => criterion.id);
      return "";
    }
    case "decision_proposed": {
      const decision = normalizeDecision(payload.decision);
      if (!decision.decisionId) return "missing-decision-id";
      if (next.recentDecisions.some((entry) => entry.decisionId === decision.decisionId)) return "duplicate-decision";
      decision.proposedAtStateVersion = next.stateVersion + 1;
      next.recentDecisions = [...next.recentDecisions, decision].slice(-MAX_RECENT_DECISIONS);
      recordDecisionCount(next, "proposed");
      return "";
    }
    case "decision_accepted": {
      const result = updateDecision(next, payload.decisionId, new Set(["proposed"]), {
        status: "accepted",
        acceptedAtStateVersion: next.stateVersion + 1,
        runtimeReasonCodes: []
      });
      if (!result) recordDecisionCount(next, "accepted");
      return result;
    }
    case "decision_rejected": {
      const result = updateDecision(next, payload.decisionId, new Set(["proposed", "accepted"]), {
        status: "rejected",
        runtimeReasonCodes: uniqueStrings(payload.runtimeReasonCodes).slice(0, 20)
      });
      if (!result) recordDecisionCount(next, "rejected");
      return result;
    }
    case "decision_execution_authorized":
      return updateDecision(next, payload.decisionId, new Set(["accepted"]), {
        authorizedAtStateVersion: next.stateVersion + 1
      });
    case "decision_executed": {
      const result = updateDecision(next, payload.decisionId, new Set(["accepted"]), {
        status: "executed",
        executedAtStateVersion: next.stateVersion + 1
      });
      if (!result) recordDecisionCount(next, "executed");
      return result;
    }
    case "decision_superseded": {
      const result = updateDecision(next, payload.decisionId, new Set(["accepted"]), {
        status: "superseded",
        runtimeReasonCodes: uniqueStrings(payload.runtimeReasonCodes).slice(0, 20)
      });
      if (!result) recordDecisionCount(next, "superseded");
      return result;
    }
    case "action_started": {
      const actionId = String(payload.actionId || "");
      if (!actionId || !payload.tool) return "invalid-action-start";
      if (next.activeActions.some((action) => action.actionId === actionId)) return "duplicate-active-action";
      next.activeActions.push({
        actionId,
        decisionId: stringValue(payload.decisionId, 200),
        tool: stringValue(payload.tool, 200),
        input: stringValue(payload.input),
        status: "running",
        matchStatus: "matched",
        startedAt: event.occurredAt,
        executionAttemptId: stringValue(payload.executionAttemptId, 200),
        dispatchNonce: stringValue(payload.dispatchNonce, 200),
        dispatchState: stringValue(payload.dispatchState, 40),
        workspacePath: stringValue(payload.workspacePath, 1000),
        preconditionFingerprint: stringValue(payload.preconditionFingerprint, 128),
        expectedPostcondition: stringValue(payload.expectedPostcondition, 128)
      });
      return "";
    }
    case "action_finished":
      return finishAction(next, payload, event.occurredAt);
    case "observation_recorded":
      return recordObservation(next, payload, event.occurredAt);
    case "approval_requested":
      return requestInteraction(next, payload, "approval", event.occurredAt);
    case "approval_resolved":
      return resolveInteraction(next, payload, "approval", event.occurredAt);
    case "user_input_requested":
      return requestInteraction(next, payload, "clarification", event.occurredAt);
    case "user_input_resolved":
      return resolveInteraction(next, payload, "clarification", event.occurredAt);
    case "verification_recorded": {
      const assessment = normalizeAssessment(payload.assessment);
      const verdictById = new Map(assessment.criteria.map((criterion) => [criterion.id, criterion]));
      next.verification = { ...next.verification, ...assessment, assessedAt: event.occurredAt };
      next.criteria = next.criteria.map((criterion) => {
        const verdict = verdictById.get(criterion.id);
        return verdict ? { ...criterion, status: verdict.status, evidenceRefs: [...verdict.evidenceIds] } : criterion;
      });
      next.artifacts.evidenceRefs = uniqueStrings([
        ...next.artifacts.evidenceRefs,
        ...assessment.criteria.flatMap((criterion) => criterion.evidenceIds),
        ...(Array.isArray(payload.evidenceRefs) ? payload.evidenceRefs : [])
      ]);
      return "";
    }
    case "progress_recorded": {
      const assessment = payload.assessment;
      if (!assessment || typeof assessment !== "object" || Array.isArray(assessment)) return "missing-progress-assessment";
      if (next.progress?.mode === "off") return "progress-disabled";
      if (!assessment.assessmentId || next.progress.recentAssessments.some((entry) => entry.assessmentId === assessment.assessmentId)) return "duplicate-progress-assessment";
      if (Number(assessment.basedOnStateVersion) !== Number(next.stateVersion)) return "stale-progress-state-version";
      if (Number(assessment.progressEpoch) !== Number(next.progress.progressEpoch)) return "stale-progress-epoch";
      if (Number(assessment.strategyRevision) !== Number(next.progress.strategyRevision)) return "stale-strategy-revision";
      if (!["meaningful", "no_progress", "inconclusive"].includes(assessment.status)) return "invalid-progress-status";
      if (!["deterministic", "semantic-evaluator"].includes(assessment.source)) return "invalid-progress-source";
      const decision = next.recentDecisions.find((entry) => entry.decisionId === String(assessment.decisionId || ""));
      const observation = next.recentObservations.find((entry) => entry.observationId === String(assessment.observationId || ""));
      if (!decision || !observation) return "invalid-progress-reference";
      if (decision.intentId !== String(assessment.intentId || "")) return "stale-progress-intent";
      if (!(decision.observationIds || []).includes(observation.observationId)) return "unlinked-progress-observation";
      const allowedEvidenceIds = new Set([observation.evidenceRef].filter(Boolean));
      if ((assessment.evidenceIds || []).some((id) => !allowedEvidenceIds.has(String(id)))) return "invalid-progress-evidence";
      next.progress = applyProgressAssessment(next.progress, assessment);
      return "";
    }
    case "replan_required":
      if (next.progress?.mode !== "enforce") return "progress-control-disabled";
      if (next.progress.replanRequired) return "replan-already-required";
      if (next.progress.lastControlAction !== "require_replan") {
        const actionSignature = String(payload.actionSignature || "");
        const strategySignature = String(payload.strategySignature || "");
        const unproductive = next.progress.recentAssessments.filter((assessment) => assessment.status !== "meaningful");
        const last = unproductive.slice(-3);
        const repeatedBlockedProposal = payload.reasonCode === "blocked_proposal_repeated"
          && (next.progress.blockedActionSignatures.includes(actionSignature)
            || next.progress.blockedStrategySignatures.includes(strategySignature));
        const repeatedStalledStrategy = payload.reasonCode === "proposal_loop_detected"
          && unproductive.filter((assessment) => assessment.strategySignature === strategySignature).length >= 2;
        const actionOscillation = payload.reasonCode === "proposal_loop_detected"
          && last.length === 3
          && last[0].actionSignature === last[2].actionSignature
          && last[1].actionSignature === actionSignature
          && last[0].actionSignature !== last[1].actionSignature;
        const strategyOscillation = payload.reasonCode === "proposal_loop_detected"
          && last.length === 3
          && last[0].strategySignature === last[2].strategySignature
          && last[1].strategySignature === strategySignature
          && last[0].strategySignature !== last[1].strategySignature;
        if (!repeatedBlockedProposal && !repeatedStalledStrategy && !actionOscillation && !strategyOscillation) {
          return "replan-threshold-not-reached";
        }
      }
      next.progress = requireReplan(next.progress);
      return "";
    case "replan_attempted":
      if (next.progress?.mode !== "enforce" || !next.progress.replanRequired) return "replan-not-required";
      if (next.progress.replanAttemptCount >= next.progress.budgets.maxStrategyReplans) return "replan-budget-exhausted";
      next.progress = recordReplanAttempt(next.progress);
      return "";
    case "strategy_revised": {
      if (next.progress?.mode !== "enforce" || !next.progress.replanRequired) return "replan-not-required";
      const decision = next.recentDecisions.find((entry) => entry.decisionId === String(payload.decisionId || ""));
      if (!decision?.replan) return "missing-replan-decision";
      if (decision.strategyRevision !== next.progress.strategyRevision + 1) return "invalid-strategy-revision";
      if (!decision.replan.revisedApproach || !decision.replan.abandonedApproach) return "invalid-replan-approach";
      next.progress = acceptStrategyRevision(next.progress);
      return "";
    }
    case "progress_budget_exhausted":
      if (next.progress?.mode !== "enforce") return "progress-control-disabled";
      next.progress = exhaustProgressBudget(next.progress);
      return "";
    case "steering_observed":
      next.steering = {
        revisionCount: Math.max(next.steering.revisionCount, Number(payload.revision) || next.steering.revisionCount + 1),
        lastReason: stringValue(payload.reason)
      };
      return "";
    case "run_summary_observed":
      next.artifacts = {
        ...next.artifacts,
        changedFiles: normalizeFileReferences(payload.changedFiles),
        attemptedFiles: normalizeFileReferences(payload.attemptedChanges),
        blockedChanges: normalizeBlockedChanges(payload.blockedChanges)
      };
      return "";
    case "task_profile_seeded": {
      if (next.taskProfile) return "task-profile-already-seeded";
      if (!payload.workflowState || !payload.taskState) return "invalid-task-profile-seed";
      next.taskProfile = {
        profileId: stringValue(payload.profileId, 80),
        profileVersion: Number(payload.profileVersion) || 1,
        workflowVersion: Number(payload.workflowVersion) || 1,
        requiredActionTool: stringValue(payload.requiredActionTool, 80),
        capableToolAvailable: payload.capableToolAvailable === true,
        taskAuthorized: payload.taskAuthorized !== false,
        approvalRequired: payload.approvalRequired === true,
        approvalGranted: payload.approvalGranted === true,
        taskState: cloneSerializable(payload.taskState),
        workflowState: cloneSerializable(payload.workflowState)
      };
      recomputeTaskReadiness(next);
      return "";
    }
    case "task_profile_updated": {
      if (!next.taskProfile) return "task-profile-not-seeded";
      const tp = next.taskProfile;
      if (payload.observation) {
        tp.taskState = projectObservation(tp.taskState, payload.observation);
        // Reducer-owned advancement: derive the step event from the accepted
        // observation; a model claim can never advance a step.
        const stepEvent = derivePreferencesStepEvent(tp.workflowState, payload.observation);
        if (stepEvent) {
          const advanced = advanceWorkflowStep(tp.workflowState, stepEvent);
          if (advanced.changed) tp.workflowState = advanced.workflowState;
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, "approvalGranted")) tp.approvalGranted = payload.approvalGranted === true;
      if (Object.prototype.hasOwnProperty.call(payload, "approvalRequired")) tp.approvalRequired = payload.approvalRequired === true;
      recomputeTaskReadiness(next);
      return "";
    }
    case "run_completed":
    case "run_failed":
    case "run_cancelled": {
      const status = event.type.slice(4);
      const reason = stringValue(payload.reason || status);
      reconcileTerminalState(next, status, reason, event.occurredAt);
      return "";
    }
    default:
      return "unsupported-event-type";
  }
}

/**
 * Apply one validated event without mutating the supplied AgentState.
 * @param {object} state Current AgentState.
 * @param {object} event Typed event envelope.
 * @returns {{accepted: boolean, reason?: string, state: object}} Transition result.
 */
function applyAgentStateEvent(state, event) {
  if (!state || state.schemaVersion !== AGENT_STATE_SCHEMA_VERSION) return rejectTransition(state, "unsupported-state-schema");
  const envelopeError = validateEnvelope(state, event);
  if (envelopeError) return rejectTransition(state, envelopeError);
  const next = cloneSerializable(state);
  const transitionError = applyTransition(next, event);
  if (transitionError) return rejectTransition(state, transitionError);
  next.lastAcceptedSequence = event.sequence;
  next.stateVersion = state.stateVersion + 1;
  if (VERIFICATION_RELEVANT_EVENT_TYPES.has(event.type)) {
    next.verificationContextVersion = (Number(state.verificationContextVersion) || 0) + 1;
  }
  if (RECOVERY_RELEVANT_EVENT_TYPES.has(event.type) && next.recovery?.interruptedDecisionId === "") {
    next.recovery.interruptedDecisionId = String(next.recentDecisions.findLast?.((decision) => decision.status === "accepted")?.decisionId || "");
  }
  return { accepted: true, state: next };
}

/** Validate a non-terminal AgentState before sequence-continuing restoration. */
function validateRestorableAgentState(state, options = {}) {
  const errors = [];
  if (!state || state.schemaVersion !== AGENT_STATE_SCHEMA_VERSION) return { valid: false, errors: ["unsupported-state-schema"] };
  if (state.run?.mode !== "agent") errors.push("invalid-mode");
  if (state.lifecycle?.status !== "running") errors.push("run-not-recoverable");
  if (!Number.isInteger(state.lastAcceptedSequence) || state.lastAcceptedSequence < 1) errors.push("invalid-sequence");
  if (!Number.isInteger(state.stateVersion) || state.stateVersion < 1) errors.push("invalid-state-version");
  if (Number(state.lastAcceptedSequence) < Number(state.stateVersion)) errors.push("invalid-state-cursor");
  if (!state.recovery || typeof state.recovery !== "object") errors.push("missing-recovery-state");
  if (options.runId !== undefined && String(state.run?.runId || "") !== String(options.runId || "")) errors.push("run-id-mismatch");
  if (options.chatId !== undefined && String(state.run?.chatId || "") !== String(options.chatId || "")) errors.push("chat-id-mismatch");
  if (options.executionGeneration !== undefined
    && Number(state.run?.executionGeneration) !== Number(options.executionGeneration)) {
    errors.push("execution-generation-mismatch");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate that a snapshot is terminal, coherent, and belongs to its declared run.
 * @param {object} snapshot Candidate terminal snapshot.
 * @param {{executionGeneration?: number}} options Expected task identity values.
 * @returns {{valid: boolean, errors: string[]}} Snapshot validation result.
 */
function validateTerminalAgentStateSnapshot(snapshot, options = {}) {
  const errors = [];
  const state = snapshot?.state;
  if (!snapshot || ![1, 2, 3, 4, 5, AGENT_STATE_SCHEMA_VERSION].includes(snapshot.schemaVersion)) errors.push("unsupported-snapshot-schema");
  if (snapshot?.snapshotKind !== "terminal") errors.push("snapshot-not-terminal");
  if (!state || state.schemaVersion !== snapshot?.schemaVersion) errors.push("invalid-state");
  if (!state) return { valid: false, errors };
  if (!TERMINAL_RUN_STATUSES.has(state.lifecycle?.status)) errors.push("run-not-terminal");
  if ((state.activeActions || []).length) errors.push("active-actions-remain");
  if ((state.pendingInteractions || []).length) errors.push("pending-interactions-remain");
  if (state.terminalReason == null) errors.push("missing-terminal-reason");
  if (!(Number(state.stateVersion) > 0)) errors.push("invalid-state-version");
  if (snapshot.runId !== state.run?.runId) errors.push("run-id-mismatch");
  if (snapshot.stateVersion !== state.stateVersion) errors.push("state-version-mismatch");
  if (!Number.isInteger(snapshot.lastSequence) || snapshot.lastSequence !== state.lastAcceptedSequence) errors.push("sequence-mismatch");
  if (!snapshot.capturedAt || Number.isNaN(Date.parse(snapshot.capturedAt))) errors.push("invalid-captured-at");
  if (snapshot.terminalEventType !== `run_${state.lifecycle?.status}`) errors.push("terminal-event-mismatch");
  if (Number(snapshot.executionGeneration) !== Number(state.run?.executionGeneration)) errors.push("execution-generation-mismatch");
  if (options.executionGeneration !== undefined && Number(snapshot.executionGeneration) !== Number(options.executionGeneration)) errors.push("stale-execution-generation");
  return { valid: errors.length === 0, errors };
}

module.exports = {
  AGENT_STATE_EVENT_SCHEMA_VERSION,
  AGENT_STATE_SCHEMA_VERSION,
  EVENT_TYPES,
  RECOVERY_RELEVANT_EVENT_TYPES,
  VERIFICATION_RELEVANT_EVENT_TYPES,
  applyAgentStateEvent,
  createInitialAgentState,
  validateRestorableAgentState,
  validateTerminalAgentStateSnapshot
};
