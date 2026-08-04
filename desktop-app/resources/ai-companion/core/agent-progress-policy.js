/**
 * Pure Agent progress classification, weighted-stall, and loop-control policy.
 */

"use strict";

const MAX_RECENT_PROGRESS = 30;
const MAX_BLOCKED_SIGNATURES = 30;

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(number)));
}

/** Create the request-scoped M6 progress state. */
function createInitialProgressState(options = {}) {
  const evaluationEnabled = options.evaluationEnabled === true;
  const controlEnabled = evaluationEnabled && options.controlEnabled === true;
  return {
    policyVersion: 1,
    mode: controlEnabled ? "enforce" : (evaluationEnabled ? "shadow" : "off"),
    progressEpoch: 0,
    strategyRevision: 0,
    stallScore: 0,
    consecutiveInconclusive: 0,
    replanRequired: false,
    replanAttemptCount: 0,
    acceptedReplanCount: 0,
    recentAssessments: [],
    recentStrategies: [],
    blockedActionSignatures: [],
    blockedStrategySignatures: [],
    budgets: {
      noProgressThreshold: boundedNumber(options.noProgressThreshold, 3, 1, 10),
      maxStrategyReplans: boundedNumber(options.maxStrategyReplans, 2, 0, 10)
    },
    lastControlAction: "continue",
    terminalReason: null
  };
}

function isRepeatedSignature(entries, signature, field) {
  return Boolean(signature) && entries.some((entry) => entry?.[field] === signature);
}

/**
 * Classify outcomes whose meaning is deterministic.
 * @param {{state:object,decision:object,observation:object,actionSignature:string,strategySignature:string}} input Completed action facts.
 * @returns {{status:string,reasonCode:string}|null} Classification, or null when semantic judgment is required.
 */
function classifyDeterministicProgress(input = {}) {
  const progress = input.state?.progress || {};
  const observation = input.observation || {};
  if (observation.executionStatus === "cancelled") return { status: "cancelled", reasonCode: "action_cancelled" };
  if (["denied", "skipped"].includes(observation.executionStatus)) return { status: "no_progress", reasonCode: `action_${observation.executionStatus}` };
  if (observation.outcome === "no-op") return { status: "no_progress", reasonCode: "action_no_op" };
  if (progress.blockedActionSignatures?.includes(input.actionSignature)) return { status: "no_progress", reasonCode: "blocked_action_repeated" };
  if (progress.blockedStrategySignatures?.includes(input.strategySignature)) return { status: "no_progress", reasonCode: "blocked_strategy_repeated" };
  const sameAction = isRepeatedSignature(progress.recentAssessments || [], input.actionSignature, "actionSignature");
  if (sameAction) return { status: "no_progress", reasonCode: observation.outcome === "failed" ? "unchanged_failure_repeated" : "exact_action_repeated" };
  if (observation.verification?.independentlyConfirmed === true
    && observation.outcome === "succeeded"
    && observation.effect !== "read") {
    return { status: "meaningful", reasonCode: "independently_verified_progress" };
  }
  if (["workspace-write", "external-write"].includes(observation.effect) && observation.outcome === "succeeded") {
    return { status: "meaningful", reasonCode: "accepted_non_empty_mutation" };
  }
  return null;
}

function hasPairOscillation(entries, field) {
  if (entries.length < 4) return false;
  const last = entries.slice(-4).map((entry) => entry?.[field] || "");
  return Boolean(last[0] && last[1] && last[0] !== last[1] && last[0] === last[2] && last[1] === last[3]);
}

function thirdRepeatedStrategy(entries) {
  const last = entries.at(-1)?.strategySignature;
  if (!last) return false;
  return entries.filter((entry) => entry.strategySignature === last && entry.status !== "meaningful").length >= 3;
}

/** Apply one fresh assessment to a cloned progress state. */
function applyProgressAssessment(progress, assessment) {
  const next = JSON.parse(JSON.stringify(progress));
  const entry = {
    assessmentId: String(assessment.assessmentId || ""),
    status: String(assessment.status || "inconclusive"),
    source: String(assessment.source || "deterministic"),
    decisionId: String(assessment.decisionId || ""),
    observationId: String(assessment.observationId || ""),
    intentId: String(assessment.intentId || ""),
    reasonCode: String(assessment.reasonCode || ""),
    evidenceIds: [...new Set((assessment.evidenceIds || []).map(String).filter(Boolean))].slice(0, 20),
    actionSignature: String(assessment.actionSignature || ""),
    strategySignature: String(assessment.strategySignature || ""),
    strategyClass: String(assessment.strategyClass || "other"),
    targetScope: String(assessment.targetScope || ""),
    conceptTokens: [...new Set((assessment.conceptTokens || []).map(String).filter(Boolean))].slice(0, 20),
    basedOnStateVersion: Number(assessment.basedOnStateVersion) || 0,
    progressEpoch: Number(assessment.progressEpoch) || 0,
    strategyRevision: Number(assessment.strategyRevision) || 0
  };
  next.recentAssessments = [...next.recentAssessments, entry].slice(-MAX_RECENT_PROGRESS);
  next.recentStrategies = [...next.recentStrategies, {
    strategyId: String(assessment.strategyId || entry.assessmentId),
    strategySignature: entry.strategySignature,
    strategyClass: entry.strategyClass,
    targetScope: entry.targetScope,
    conceptTokens: entry.conceptTokens,
    status: entry.status,
    progressEpoch: entry.progressEpoch
  }].slice(-MAX_RECENT_PROGRESS);

  if (entry.status === "meaningful") {
    next.progressEpoch += 1;
    next.stallScore = 0;
    next.consecutiveInconclusive = 0;
    next.replanRequired = false;
    next.blockedActionSignatures = [];
    next.blockedStrategySignatures = [];
    next.lastControlAction = "continue";
    return next;
  }

  next.stallScore += entry.status === "no_progress" ? 1 : 0.5;
  next.consecutiveInconclusive = entry.status === "inconclusive" ? next.consecutiveInconclusive + 1 : 0;
  if (entry.status === "no_progress" && entry.actionSignature) {
    next.blockedActionSignatures = [...new Set([...next.blockedActionSignatures, entry.actionSignature])].slice(-MAX_BLOCKED_SIGNATURES);
  }
  const loopDetected = hasPairOscillation(next.recentAssessments, "actionSignature")
    || hasPairOscillation(next.recentAssessments, "strategySignature")
    || thirdRepeatedStrategy(next.recentAssessments);
  const thresholdReached = next.stallScore >= next.budgets.noProgressThreshold
    || next.consecutiveInconclusive >= 5
    || loopDetected;
  if (thresholdReached) {
    const stalledStrategies = next.recentAssessments
      .filter((assessment) => assessment.progressEpoch === entry.progressEpoch && assessment.status !== "meaningful")
      .map((assessment) => assessment.strategySignature)
      .filter(Boolean);
    next.blockedStrategySignatures = [...new Set([...next.blockedStrategySignatures, ...stalledStrategies])].slice(-MAX_BLOCKED_SIGNATURES);
  }
  next.lastControlAction = thresholdReached
    ? (next.replanAttemptCount >= next.budgets.maxStrategyReplans ? "terminate" : "require_replan")
    : "continue";
  return next;
}

/** Mark the current stall episode as requiring a new strategy. */
function requireReplan(progress) {
  return { ...progress, replanRequired: true, lastControlAction: "require_replan" };
}

/** Consume one bounded replan opportunity. */
function recordReplanAttempt(progress) {
  return { ...progress, replanAttemptCount: progress.replanAttemptCount + 1 };
}

/** Accept a materially different strategy and reset only the current stall window. */
function acceptStrategyRevision(progress) {
  return {
    ...progress,
    strategyRevision: progress.strategyRevision + 1,
    acceptedReplanCount: progress.acceptedReplanCount + 1,
    stallScore: 0,
    consecutiveInconclusive: 0,
    replanRequired: false,
    lastControlAction: "continue"
  };
}

/** Record bounded non-success termination without changing completion authority. */
function exhaustProgressBudget(progress) {
  return { ...progress, replanRequired: false, lastControlAction: "terminate", terminalReason: "no_progress_budget_exhausted" };
}

module.exports = {
  acceptStrategyRevision,
  applyProgressAssessment,
  classifyDeterministicProgress,
  createInitialProgressState,
  exhaustProgressBudget,
  recordReplanAttempt,
  requireReplan,
  _test: { hasPairOscillation, thirdRepeatedStrategy }
};
