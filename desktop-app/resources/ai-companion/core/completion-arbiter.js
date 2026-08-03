/**
 * Four-way failure arbiter for completion assessment.
 *
 * When a criterion is unmet, "incomplete" alone is not actionable. The arbiter classifies
 * each unmet criterion into one of four failure classes and attaches routing guidance, so
 * the response tells the user WHY it failed and WHAT to do -- and, crucially, routes
 * ambiguity/spec-gap toward fixing the contract rather than blindly redoing the work.
 *
 * Classes (after Sengupta et al. 2026, contract-driven adversarial verification):
 *   - blocked      : a required tool was denied/failed/not-executed (environmental). Not the
 *                    model's fault; resolve the blocker and re-run. (arxiv "noise".)
 *   - ambiguity    : the request left a blocking ambiguity; confirm intent, then re-run.
 *   - spec-gap     : the criterion was inferred by the assistant, not stated by the user;
 *                    it may not match intent -- adjust the request or accept it as incomplete.
 *   - unsatisfied  : a clear, user-stated outcome simply was not established (a genuine bug);
 *                    the work must be completed or redone.
 *
 * Pure module: no IO, provider calls, or side effects.
 */

"use strict";

const { getCriterionEvidenceFamilies, isToolInEvidenceFamily } = require("./agent-tool-effect-registry");

const ARBITER_CLASSES = Object.freeze(["blocked", "ambiguity", "spec-gap", "unsatisfied"]);
// "blocked" is for environmental failure only (denied / failed / not-executed). A "no-op"
// (the tool did nothing because the target already matched) is deliberately NOT here: it is
// not a blocker, and its meaning is decided by the criterion, not the arbiter.
const BLOCKED_OUTCOMES = new Set(["denied", "failed", "not-executed"]);

/**
 * Classify a single unmet criterion from harness signals only (deterministic).
 *
 * @param {object} criterion - The acceptance criterion.
 * @param {object} contract - The intent contract (for families, ambiguities).
 * @param {Array} evidenceLedger - The request evidence ledger (all outcomes, not just admissible).
 * @returns {{ class: string, reason: string, guidance: string }} The arbitration verdict.
 */
function classifyUnmetCriterion(criterion, contract, evidenceLedger) {
  const families = getCriterionEvidenceFamilies(criterion, contract);
  const blockedAttempt = (Array.isArray(evidenceLedger) ? evidenceLedger : []).find((entry) =>
    entry && entry.source === "tool"
      && BLOCKED_OUTCOMES.has(entry.outcome)
      && (!families.length || families.some((family) => isToolInEvidenceFamily(entry.tool, family))));
  if (blockedAttempt) {
    return {
      class: "blocked",
      reason: `A required tool (${blockedAttempt.tool || "unknown"}) was ${blockedAttempt.outcome}.`,
      guidance: "Resolve the blocker (grant approval or fix the environment), then re-run."
    };
  }
  const blockingAmbiguities = (Array.isArray(contract && contract.ambiguities) ? contract.ambiguities : [])
    .filter((ambiguity) => ambiguity && ambiguity.blocking);
  if (blockingAmbiguities.length) {
    return {
      class: "ambiguity",
      reason: "The request left a blocking ambiguity unresolved.",
      guidance: "Confirm the intended interpretation, then re-run."
    };
  }
  if (criterion && criterion.provenance === "inferred") {
    return {
      class: "spec-gap",
      reason: "This criterion was inferred by the assistant, not stated in your request.",
      guidance: "If it does not match your intent, adjust the request; otherwise treat the work as incomplete."
    };
  }
  return {
    class: "unsatisfied",
    reason: "The required outcome was not established by admissible evidence.",
    guidance: "The work is genuinely incomplete; complete or redo the outstanding action."
  };
}

/**
 * Attach an `arbitration` verdict to every unmet criterion of an assessment. Met, unverified,
 * and coherence-only criteria are left untouched.
 *
 * @param {object} assessment - A normalized assessment ({ overallStatus, criteria, ... }).
 * @param {object} contract - The intent contract.
 * @param {Array} evidenceLedger - The request evidence ledger.
 * @returns {object} The same assessment, with arbitration attached to unmet criteria.
 */
function arbitrateAssessment(assessment, contract, evidenceLedger) {
  if (!assessment || !Array.isArray(assessment.criteria)) return assessment;
  const criterionById = new Map((contract && Array.isArray(contract.acceptanceCriteria) ? contract.acceptanceCriteria : [])
    .map((criterion) => [criterion.id, criterion]));
  for (const verdict of assessment.criteria) {
    if (verdict.status !== "unmet") {
      delete verdict.arbitration;
      continue;
    }
    verdict.arbitration = classifyUnmetCriterion(criterionById.get(verdict.id) || {}, contract, evidenceLedger);
  }
  return assessment;
}

module.exports = {
  ARBITER_CLASSES,
  classifyUnmetCriterion,
  arbitrateAssessment
};
