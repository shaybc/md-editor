/**
 * AgentState v4 completion and verification transition reducer.
 *
 * This module mutates only the reducer-owned draft passed by agent-state.js.
 */

"use strict";

const { evaluateCompletionPolicy, isTerminalCompletionStatus } = require("./agent-completion-policy");

const MAX_RECENT_VERIFICATIONS = 10;
const COMPLETION_EVENT_TYPES = new Set([
  "completion_attempt_started",
  "completion_attempt_superseded",
  "verification_result_recorded",
  "verification_result_rejected",
  "completion_accepted",
  "completion_rejected",
  "completion_terminated",
  "final_response_recorded"
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

/**
 * Create the verifier-owned portion of AgentState v4.
 * @returns {object} Initial verification state.
 */
function createInitialVerificationState() {
  return {
    overallStatus: "not_assessed",
    criteria: [],
    assessedAt: null,
    activeAttempt: null,
    latestResult: null,
    history: [],
    acceptedCount: 0,
    rejectedCount: 0,
    staleCount: 0
  };
}

/**
 * Create the runtime-owned semantic completion portion of AgentState v4.
 * @returns {object} Initial completion state.
 */
function createInitialCompletionState() {
  return {
    status: "running",
    completionAttemptId: null,
    proposalDecisionId: null,
    verificationId: null,
    reasonCodes: [],
    unresolvedIssues: [],
    finalResponse: null
  };
}

/**
 * Normalize untrusted assessor output before it enters authoritative state.
 * @param {object} result Typed verifier result candidate.
 * @returns {object} Bounded verification result.
 */
function normalizeVerificationResult(result = {}) {
  const allowedStatuses = new Set(["satisfied", "unsatisfied", "provisional", "unverified"]);
  const verificationStatus = allowedStatuses.has(result.verificationStatus) ? result.verificationStatus : "unsatisfied";
  return {
    schemaVersion: 1,
    runId: stringValue(result.runId, 200),
    completionAttemptId: stringValue(result.completionAttemptId, 200),
    verificationId: stringValue(result.verificationId, 200),
    proposalDecisionId: stringValue(result.proposalDecisionId, 200),
    basedOnStateVersion: Math.max(0, Number(result.basedOnStateVersion) || 0),
    basedOnVerificationContextVersion: Math.max(0, Number(result.basedOnVerificationContextVersion) || 0),
    contractFingerprint: stringValue(result.contractFingerprint, 128),
    evidenceVersion: Math.max(0, Number(result.evidenceVersion) || 0),
    evidenceFingerprint: stringValue(result.evidenceFingerprint, 128),
    verificationStatus,
    criteria: (Array.isArray(result.criteria) ? result.criteria : []).slice(0, 100).map((criterion) => ({
      id: stringValue(criterion?.id, 80),
      status: allowedStatuses.has(criterion?.status) ? criterion.status : "unsatisfied",
      evidenceRefs: uniqueStrings(criterion?.evidenceRefs).slice(0, 50),
      reasonCodes: uniqueStrings(criterion?.reasonCodes).slice(0, 20),
      explanation: stringValue(criterion?.explanation)
    })).filter((criterion) => criterion.id),
    blockers: (Array.isArray(result.blockers) ? result.blockers : []).slice(0, 50).map((blocker) => ({
      type: stringValue(blocker?.type, 80),
      criterionId: stringValue(blocker?.criterionId, 80),
      evidenceRefs: uniqueStrings(blocker?.evidenceRefs).slice(0, 50),
      recoverable: blocker?.recoverable === true,
      requiredAction: stringValue(blocker?.requiredAction)
    })),
    unresolvedIssues: (Array.isArray(result.unresolvedIssues) ? result.unresolvedIssues : []).slice(0, 50).map((issue) => ({
      criterionId: stringValue(issue?.criterionId, 80),
      description: stringValue(issue?.description || issue),
      reasonCodes: uniqueStrings(issue?.reasonCodes).slice(0, 20)
    })),
    reasonCodes: uniqueStrings(result.reasonCodes).slice(0, 50),
    diagnostics: {
      fallbackUsed: result?.diagnostics?.fallbackUsed === true,
      repairCount: Math.max(0, Number(result?.diagnostics?.repairCount) || 0)
    }
  };
}

function startCompletionAttempt(next, payload, occurredAt) {
  const completionAttemptId = String(payload.completionAttemptId || "");
  const verificationId = String(payload.verificationId || "");
  const proposalDecisionId = String(payload.proposalDecisionId || "");
  if (!completionAttemptId || !verificationId || !proposalDecisionId) return "invalid-completion-attempt";
  if (isTerminalCompletionStatus(next.completion.status)) return "completion-already-terminal";
  const proposal = next.recentDecisions.find((decision) => decision.decisionId === proposalDecisionId);
  if (!proposal || proposal.type !== "propose_completion" || proposal.status !== "executed") return "invalid-completion-proposal";
  const currentAttempt = next.verification.activeAttempt;
  const isRetry = currentAttempt?.completionAttemptId === completionAttemptId;
  if (currentAttempt && currentAttempt.status === "verifying" && !isRetry) return "completion-attempt-active";
  if (isRetry && currentAttempt.status !== "verifying") return "completion-attempt-not-verifying";
  if (isRetry && Number(currentAttempt.requestCount) >= 2) return "verification-retry-limit";
  if (Number(payload.basedOnVerificationContextVersion) !== Number(next.verificationContextVersion)) return "stale-verification-context";
  next.verification.activeAttempt = {
    completionAttemptId,
    proposalDecisionId,
    verificationId,
    status: "verifying",
    basedOnStateVersion: next.stateVersion + 1,
    basedOnVerificationContextVersion: next.verificationContextVersion,
    contractFingerprint: stringValue(payload.contractFingerprint, 128),
    evidenceVersion: Math.max(0, Number(payload.evidenceVersion) || 0),
    evidenceFingerprint: stringValue(payload.evidenceFingerprint, 128),
    evidenceIndex: (Array.isArray(payload.evidenceIndex) ? payload.evidenceIndex : []).slice(0, 120).map((entry) => ({
      id: stringValue(entry?.id, 160),
      admissible: entry?.admissible === true
    })).filter((entry) => entry.id),
    evidenceSelectionTruncatedCriterionIds: uniqueStrings(payload.evidenceSelectionTruncatedCriterionIds).slice(0, 100),
    unknownCitedEvidenceIds: uniqueStrings(payload.unknownCitedEvidenceIds).slice(0, 50),
    requestCount: isRetry ? Number(currentAttempt.requestCount) + 1 : 1,
    startedAt: isRetry ? currentAttempt.startedAt : occurredAt,
    lastRequestedAt: occurredAt
  };
  next.completion = {
    ...next.completion,
    status: "verifying",
    completionAttemptId,
    proposalDecisionId,
    verificationId,
    reasonCodes: [],
    unresolvedIssues: [],
    finalResponse: null
  };
  return "";
}

function supersedeCompletionAttempt(next, payload, occurredAt) {
  const attempt = next.verification.activeAttempt;
  if (!attempt || attempt.completionAttemptId !== String(payload.completionAttemptId || "")) return "unknown-completion-attempt";
  if (attempt.status !== "verifying") return "completion-attempt-not-verifying";
  next.verification.activeAttempt = { ...attempt, status: "superseded", endedAt: occurredAt };
  next.completion = {
    ...next.completion,
    status: "rejected",
    reasonCodes: uniqueStrings(payload.reasonCodes).slice(0, 50),
    unresolvedIssues: []
  };
  return "";
}

function recordVerificationResult(next, payload, occurredAt) {
  const attempt = next.verification.activeAttempt;
  const result = normalizeVerificationResult(payload.result);
  if (!attempt || attempt.status !== "verifying") return "completion-attempt-not-verifying";
  if (result.runId !== next.run.runId) return "wrong-verification-run";
  if (result.completionAttemptId !== attempt.completionAttemptId) return "wrong-completion-attempt";
  if (result.verificationId !== attempt.verificationId) return "wrong-verification-result";
  if (result.proposalDecisionId !== attempt.proposalDecisionId) return "wrong-completion-proposal";
  if (result.basedOnStateVersion !== attempt.basedOnStateVersion) return "stale-verification-state";
  if (result.basedOnVerificationContextVersion !== next.verificationContextVersion) return "stale-verification-context";
  if (result.contractFingerprint !== attempt.contractFingerprint) return "stale-intent-contract";
  if (result.evidenceVersion !== attempt.evidenceVersion || result.evidenceFingerprint !== attempt.evidenceFingerprint) return "stale-evidence-snapshot";
  if (next.verification.history.some((entry) => entry.verificationId === result.verificationId)) return "duplicate-verification-result";
  const verdictById = new Map(result.criteria.map((criterion) => [criterion.id, criterion]));
  next.criteria = next.criteria.map((criterion) => {
    const verdict = verdictById.get(criterion.id);
    return verdict ? { ...criterion, status: verdict.status, evidenceRefs: [...verdict.evidenceRefs] } : criterion;
  });
  next.verification = {
    ...next.verification,
    overallStatus: result.verificationStatus,
    criteria: cloneSerializable(result.criteria),
    assessedAt: occurredAt,
    latestResult: result,
    history: [...next.verification.history, {
      completionAttemptId: result.completionAttemptId,
      verificationId: result.verificationId,
      verificationStatus: result.verificationStatus,
      status: "accepted",
      recordedAt: occurredAt
    }].slice(-MAX_RECENT_VERIFICATIONS),
    acceptedCount: next.verification.acceptedCount + 1
  };
  next.artifacts.evidenceRefs = uniqueStrings([
    ...next.artifacts.evidenceRefs,
    ...result.criteria.flatMap((criterion) => criterion.evidenceRefs)
  ]);
  return "";
}

function rejectVerificationResult(next, payload, occurredAt) {
  const attempt = next.verification.activeAttempt;
  if (!attempt || attempt.completionAttemptId !== String(payload.completionAttemptId || "")) return "unknown-completion-attempt";
  if (attempt.status !== "verifying") return "completion-attempt-not-verifying";
  if (attempt.verificationId !== String(payload.verificationId || "")) return "wrong-verification-result";
  if (next.verification.history.some((entry) => entry.verificationId === attempt.verificationId)) return "duplicate-verification-result";
  const reasonCodes = uniqueStrings(payload.reasonCodes).slice(0, 50);
  next.verification = {
    ...next.verification,
    history: [...next.verification.history, {
      completionAttemptId: attempt.completionAttemptId,
      verificationId: attempt.verificationId,
      verificationStatus: "unsatisfied",
      status: "rejected",
      reasonCodes,
      recordedAt: occurredAt
    }].slice(-MAX_RECENT_VERIFICATIONS),
    rejectedCount: next.verification.rejectedCount + 1,
    staleCount: next.verification.staleCount + Number(reasonCodes.some((code) => /^stale_/.test(code)))
  };
  next.completion = { ...next.completion, reasonCodes };
  return "";
}

function acceptCompletion(next, payload, occurredAt) {
  const result = next.verification.latestResult;
  if (!result || result.verificationId !== String(payload.verificationId || "")) return "wrong-verification-result";
  const gate = evaluateCompletionPolicy({ state: next, result });
  if (!gate.accepted) return gate.reasonCodes[0] || "completion-gate-rejected";
  next.verification.activeAttempt = { ...next.verification.activeAttempt, status: "completed", endedAt: occurredAt };
  next.completion = {
    ...next.completion,
    status: "succeeded",
    completionAttemptId: result.completionAttemptId,
    proposalDecisionId: result.proposalDecisionId,
    verificationId: result.verificationId,
    reasonCodes: [],
    unresolvedIssues: []
  };
  return "";
}

function rejectCompletion(next, payload, occurredAt) {
  const result = next.verification.latestResult;
  if (!result || result.verificationId !== String(payload.verificationId || "")) return "wrong-verification-result";
  if (next.verification.activeAttempt?.status !== "verifying") return "completion-attempt-not-verifying";
  next.verification.activeAttempt = { ...next.verification.activeAttempt, status: "rejected", endedAt: occurredAt };
  next.completion = {
    ...next.completion,
    status: "rejected",
    reasonCodes: uniqueStrings(payload.reasonCodes).slice(0, 50),
    unresolvedIssues: cloneSerializable(result.unresolvedIssues)
  };
  return "";
}

function terminateCompletion(next, payload, occurredAt) {
  const status = String(payload.status || "");
  if (!isTerminalCompletionStatus(status) || status === "succeeded") return "invalid-completion-termination";
  if (isTerminalCompletionStatus(next.completion.status)) return "completion-already-terminal";
  if (next.verification.activeAttempt?.status === "verifying") {
    next.verification.activeAttempt = { ...next.verification.activeAttempt, status, endedAt: occurredAt };
  }
  next.completion = {
    ...next.completion,
    status,
    reasonCodes: uniqueStrings(payload.reasonCodes).slice(0, 50),
    unresolvedIssues: cloneSerializable(payload.unresolvedIssues || [])
  };
  return "";
}

function recordFinalResponse(next, payload, occurredAt) {
  if (!isTerminalCompletionStatus(next.completion.status)) return "completion-not-terminal";
  if (next.completion.finalResponse) return "duplicate-final-response";
  const response = payload.response;
  if (!response || response.schemaVersion !== 1 || String(response.outcome || "") !== next.completion.status) return "invalid-final-response";
  next.completion = {
    ...next.completion,
    finalResponse: {
      schemaVersion: 1,
      outcome: next.completion.status,
      content: stringValue(response.content, 12000),
      claimValidation: {
        valid: response?.claimValidation?.valid === true,
        reasonCodes: uniqueStrings(response?.claimValidation?.reasonCodes).slice(0, 20)
      },
      reasonCodes: uniqueStrings(response.reasonCodes).slice(0, 50),
      recordedAt: occurredAt
    }
  };
  return "";
}

/**
 * Apply one completion-owned event to a reducer draft.
 * @param {object} next Reducer-owned AgentState draft.
 * @param {object} event Validated AgentState event.
 * @returns {string} Empty string when accepted, otherwise a rejection reason.
 */
function applyAgentCompletionTransition(next, event) {
  const payload = event.payload;
  switch (event.type) {
    case "completion_attempt_started": return startCompletionAttempt(next, payload, event.occurredAt);
    case "completion_attempt_superseded": return supersedeCompletionAttempt(next, payload, event.occurredAt);
    case "verification_result_recorded": return recordVerificationResult(next, payload, event.occurredAt);
    case "verification_result_rejected": return rejectVerificationResult(next, payload, event.occurredAt);
    case "completion_accepted": return acceptCompletion(next, payload, event.occurredAt);
    case "completion_rejected": return rejectCompletion(next, payload, event.occurredAt);
    case "completion_terminated": return terminateCompletion(next, payload, event.occurredAt);
    case "final_response_recorded": return recordFinalResponse(next, payload, event.occurredAt);
    default: return "unsupported-completion-event-type";
  }
}

module.exports = {
  COMPLETION_EVENT_TYPES,
  applyAgentCompletionTransition,
  createInitialCompletionState,
  createInitialVerificationState,
  normalizeVerificationResult
};
