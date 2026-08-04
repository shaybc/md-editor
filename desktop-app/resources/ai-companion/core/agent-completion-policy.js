/**
 * Deterministic semantic-completion policy for controller-enabled Agent runs.
 *
 * This module is pure: it performs no IO and owns no state. Both orchestration and
 * the AgentState reducer use the same checks so semantic success cannot drift.
 */

"use strict";

const TERMINAL_COMPLETION_STATUSES = new Set([
  "succeeded", "blocked", "provisional", "unverified",
  "budget_exhausted", "failed", "cancelled"
]);

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
}

function activeContractCriteria(state) {
  return Array.isArray(state?.intentContract?.acceptanceCriteria)
    ? state.intentContract.acceptanceCriteria.filter((criterion) => criterion?.id)
    : [];
}

function hasBlockingAmbiguity(state) {
  return (state?.intentContract?.ambiguities || []).some((entry) => entry?.blocking === true);
}

function findProposal(state, proposalDecisionId) {
  return (state?.recentDecisions || []).find((decision) => decision?.decisionId === String(proposalDecisionId || ""));
}

function validateAttemptIdentity(state, result, reasonCodes) {
  const attempt = state?.verification?.activeAttempt;
  if (!attempt) {
    reasonCodes.push("missing_completion_attempt");
    return null;
  }
  if (attempt.status !== "verifying") reasonCodes.push("completion_attempt_not_verifying");
  if (attempt.completionAttemptId !== result?.completionAttemptId) reasonCodes.push("wrong_completion_attempt");
  if (attempt.proposalDecisionId !== result?.proposalDecisionId) reasonCodes.push("wrong_completion_proposal");
  if (attempt.verificationId !== result?.verificationId) reasonCodes.push("wrong_verification_result");
  if (attempt.basedOnVerificationContextVersion !== result?.basedOnVerificationContextVersion
    || Number(state?.verificationContextVersion) !== Number(result?.basedOnVerificationContextVersion)) {
    reasonCodes.push("stale_verification_context");
  }
  if (attempt.contractFingerprint !== result?.contractFingerprint) reasonCodes.push("stale_intent_contract");
  if (Number(attempt.evidenceVersion) !== Number(result?.evidenceVersion)
    || attempt.evidenceFingerprint !== result?.evidenceFingerprint) {
    reasonCodes.push("stale_evidence_snapshot");
  }
  return attempt;
}

function validateProposal(state, attempt, reasonCodes) {
  if (!attempt) return;
  const proposal = findProposal(state, attempt.proposalDecisionId);
  if (!proposal || proposal.type !== "propose_completion") {
    reasonCodes.push("invalid_completion_proposal");
    return;
  }
  if (proposal.status !== "executed") reasonCodes.push("completion_proposal_not_executed");
}

function validateCriteria(state, result, attempt, reasonCodes) {
  const required = activeContractCriteria(state);
  const verdicts = Array.isArray(result?.criteria) ? result.criteria : [];
  const verdictIds = verdicts.map((criterion) => String(criterion?.id || "")).filter(Boolean);
  if (new Set(verdictIds).size !== verdictIds.length) reasonCodes.push("duplicate_criterion_result");
  const verdictById = new Map(verdicts.map((criterion) => [String(criterion?.id || ""), criterion]));
  const evidenceIndex = new Map((attempt?.evidenceIndex || []).map((entry) => [String(entry?.id || ""), entry]));
  const overflowIds = new Set(attempt?.evidenceSelectionTruncatedCriterionIds || []);
  if ((attempt?.unknownCitedEvidenceIds || []).length) reasonCodes.push("invalid_completion_proposal");

  for (const criterion of required) {
    const verdict = verdictById.get(String(criterion.id));
    if (!verdict) {
      reasonCodes.push("missing_required_criterion");
      continue;
    }
    if (verdict.status !== "satisfied") reasonCodes.push("criterion_unsatisfied");
    if (overflowIds.has(String(criterion.id))) reasonCodes.push("evidence_scope_overflow");
    for (const evidenceRef of uniqueStrings(verdict.evidenceRefs)) {
      const evidence = evidenceIndex.get(evidenceRef);
      if (!evidence || evidence.admissible !== true) reasonCodes.push("inadmissible_evidence");
    }
  }
  if (verdicts.some((verdict) => !required.some((criterion) => String(criterion.id) === String(verdict?.id || "")))) {
    reasonCodes.push("unknown_criterion_result");
  }
}

/**
 * Evaluate the semantic outcome for one reducer-accepted verification result.
 * @param {{state: object, result?: object}} input Current AgentState and candidate result.
 * @returns {{accepted: boolean, outcome: string, reasonCodes: string[]}} Gate decision.
 */
function evaluateCompletionPolicy(input = {}) {
  const state = input.state || {};
  const result = input.result || state.verification?.latestResult || null;
  const reasonCodes = [];

  if (state.lifecycle?.status !== "running") reasonCodes.push("run_not_active");
  if (TERMINAL_COMPLETION_STATUSES.has(state.completion?.status)) reasonCodes.push("completion_already_terminal");
  const attempt = validateAttemptIdentity(state, result, reasonCodes);
  validateProposal(state, attempt, reasonCodes);
  if ((state.activeActions || []).length) reasonCodes.push("pending_action");
  if ((state.pendingInteractions || []).length) reasonCodes.push("pending_interaction");
  if (hasBlockingAmbiguity(state)) reasonCodes.push("unresolved_blocker");
  if (state.intentContract?.verifiability === "provisional") reasonCodes.push("provisional_contract");
  else if (state.intentContract?.verifiability !== "verified") reasonCodes.push("unverified_contract");
  validateCriteria(state, result, attempt, reasonCodes);
  if ((result?.blockers || []).length) reasonCodes.push("unresolved_blocker");
  if (result?.verificationStatus !== "satisfied") reasonCodes.push("verification_not_satisfied");

  const normalizedReasons = uniqueStrings(reasonCodes);
  if (!normalizedReasons.length) return { accepted: true, outcome: "succeeded", reasonCodes: [] };
  if (result?.verificationStatus === "provisional" || normalizedReasons.includes("provisional_contract")) {
    return { accepted: false, outcome: "provisional", reasonCodes: normalizedReasons };
  }
  if (result?.verificationStatus === "unverified" || normalizedReasons.includes("unverified_contract")) {
    return { accepted: false, outcome: "unverified", reasonCodes: normalizedReasons };
  }
  const unrecoverableBlocker = (result?.blockers || []).some((blocker) => blocker?.type === "blocked" && blocker?.recoverable !== true);
  return {
    accepted: false,
    outcome: unrecoverableBlocker ? "blocked" : "rejected",
    reasonCodes: normalizedReasons
  };
}

/**
 * Return whether a semantic completion status ends the Agent run.
 * @param {string} status Semantic completion status.
 * @returns {boolean} True for a terminal semantic outcome.
 */
function isTerminalCompletionStatus(status) {
  return TERMINAL_COMPLETION_STATUSES.has(String(status || ""));
}

module.exports = {
  TERMINAL_COMPLETION_STATUSES,
  evaluateCompletionPolicy,
  isTerminalCompletionStatus
};
