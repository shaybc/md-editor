/**
 * Plan progress detection, anti-loop control, and budgets (M8.6).
 *
 * Reuses the shared strategy-signature primitives to detect both exact repeated
 * actions and conceptual repetition (plan rewrites without new coverage). When a
 * stall threshold is crossed the tracker requires a typed strategy revision
 * through the next normal decision — it never adds a second planner call. Budgets
 * bound replans and total decisions and terminate honestly when exhausted.
 *
 * Progress control may never satisfy a requirement or authorize completion; it
 * only requests replanning or bounded termination.
 */

"use strict";

const DEFAULTS = Object.freeze({
  noProgressThreshold: 3,
  maxStrategyReplans: 2,
  maxDecisions: 40
});

/**
 * Meaningful Plan progress: a new action that produced new evidence or expanded
 * requirement coverage / resolved ambiguity.
 *
 * @param {object} params
 * @returns {{ progress: boolean, reasonCode: string }}
 */
function classifyPlanProgress(params = {}) {
  const { actionSignature, seenSignatures, producedNewEvidence, coverageDelta = 0, resolvedAmbiguity = false } = params;
  const repeated = seenSignatures instanceof Set && actionSignature && seenSignatures.has(actionSignature);
  if (repeated) return { progress: false, reasonCode: "repeated_action" };
  if (producedNewEvidence === true || coverageDelta > 0 || resolvedAmbiguity === true) {
    return { progress: true, reasonCode: "new_evidence_or_coverage" };
  }
  return { progress: false, reasonCode: "no_new_evidence" };
}

/**
 * Create a stateful Plan progress tracker.
 * @param {object} [options]
 * @returns {object}
 */
function createPlanProgressTracker(options = {}) {
  const noProgressThreshold = Number.isInteger(options.noProgressThreshold) ? options.noProgressThreshold : DEFAULTS.noProgressThreshold;
  const maxStrategyReplans = Number.isInteger(options.maxStrategyReplans) ? options.maxStrategyReplans : DEFAULTS.maxStrategyReplans;
  const maxDecisions = Number.isInteger(options.maxDecisions) ? options.maxDecisions : DEFAULTS.maxDecisions;

  const seenSignatures = new Set();
  const blockedStrategySignatures = new Set();
  let consecutiveNoProgress = 0;
  let strategyReplans = 0;
  let decisionCount = 0;
  let replanRequired = false;
  let lastPlanCoverageCount = -1;

  function terminalIfExhausted(reasonCode) {
    if (strategyReplans > maxStrategyReplans) {
      return { terminal: true, terminalStatus: "budget_exhausted", reasonCodes: ["strategy_replan_budget_exhausted"] };
    }
    if (decisionCount > maxDecisions) {
      return { terminal: true, terminalStatus: "budget_exhausted", reasonCodes: ["decision_budget_exhausted"] };
    }
    return { terminal: false, terminalStatus: null, reasonCodes: reasonCode ? [reasonCode] : [] };
  }

  return {
    /** Record a read-only action and classify progress. */
    recordAction(params = {}) {
      decisionCount += 1;
      const classification = classifyPlanProgress({ ...params, seenSignatures });
      if (params.actionSignature) seenSignatures.add(params.actionSignature);
      if (classification.progress) {
        consecutiveNoProgress = 0;
        replanRequired = false;
      } else {
        consecutiveNoProgress += 1;
        if (consecutiveNoProgress >= noProgressThreshold) replanRequired = true;
      }
      return { ...classification, replanRequired, ...terminalIfExhausted(classification.reasonCode) };
    },

    /** Record a plan proposal; a rewrite with no new coverage is not progress. */
    recordPlanProposal(params = {}) {
      decisionCount += 1;
      const coverageCount = Number(params.coverageCount) || 0;
      const improved = coverageCount > lastPlanCoverageCount;
      lastPlanCoverageCount = Math.max(lastPlanCoverageCount, coverageCount);
      if (improved) {
        consecutiveNoProgress = 0;
        replanRequired = false;
        return { progress: true, reasonCode: "coverage_improved", replanRequired, ...terminalIfExhausted() };
      }
      consecutiveNoProgress += 1;
      if (consecutiveNoProgress >= noProgressThreshold) replanRequired = true;
      return { progress: false, reasonCode: "plan_rewrite_without_coverage", replanRequired, ...terminalIfExhausted("plan_rewrite_without_coverage") };
    },

    /**
     * Record a typed strategy revision. A revision equivalent to a blocked
     * strategy is not a real change and does not clear the stall window.
     */
    recordStrategyRevision(params = {}) {
      const signature = String(params.strategySignature || "");
      if (signature && blockedStrategySignatures.has(signature)) {
        return { accepted: false, reasonCode: "repeated_strategy", replanRequired: true, ...terminalIfExhausted("repeated_strategy") };
      }
      if (signature) blockedStrategySignatures.add(signature);
      strategyReplans += 1;
      consecutiveNoProgress = 0;
      replanRequired = false;
      return { accepted: true, reasonCode: "strategy_revised", replanRequired, ...terminalIfExhausted() };
    },

    /** Current stall / budget assessment. */
    assess() {
      return {
        replanRequired,
        consecutiveNoProgress,
        strategyReplans,
        decisionCount,
        ...terminalIfExhausted()
      };
    }
  };
}

module.exports = {
  DEFAULTS,
  classifyPlanProgress,
  createPlanProgressTracker
};
