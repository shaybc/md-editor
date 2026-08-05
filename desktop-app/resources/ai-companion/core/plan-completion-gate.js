/**
 * Deterministic Plan completion gate (M8.5).
 *
 * The model cannot declare a Plan complete through text, a provider finish
 * reason, or a pseudo-tool. Success is decided here, from accepted state plus a
 * fresh verifier result. The gate is pure: it returns a decision; the reducer
 * applies the terminal transition.
 */

"use strict";

const SUCCESS = "succeeded";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Evaluate whether a Plan run may complete.
 *
 * @param {object} input
 * @param {object} input.projection - Current Plan projection.
 * @param {object} [input.verification] - Latest verifier result.
 * @param {object} [input.pending] - { clarification, decision, observation } booleans.
 * @param {boolean} [input.terminationRequested] - Budget/cancel forces an honest end.
 * @param {string} [input.terminationStatus] - Requested terminal status when forced.
 * @returns {{ decision: "complete"|"continue"|"terminate", status: string|null, reasonCodes: string[] }}
 */
function evaluatePlanCompletion(input = {}) {
  const projection = input.projection || {};
  const plan = projection.plan || {};
  const verification = input.verification || null;
  const pending = input.pending || {};
  const reasonCodes = [];

  // The run must be active.
  if (["succeeded", "blocked", "budget_exhausted", "failed", "cancelled"].includes(plan.status)) {
    return { decision: "terminate", status: plan.status, reasonCodes: ["already_terminal"] };
  }

  // Pending work must be drained before completion can be considered.
  if (pending.clarification || pending.decision || pending.observation) {
    if (input.terminationRequested) {
      return { decision: "terminate", status: forcedStatus(input, verification), reasonCodes: ["terminated_with_pending_work"] };
    }
    return { decision: "continue", status: null, reasonCodes: ["pending_work"] };
  }

  // A forced termination (budget/cancel/fatal blocker) ends honestly.
  if (input.terminationRequested) {
    return { decision: "terminate", status: forcedStatus(input, verification), reasonCodes: ["termination_requested"] };
  }

  if (!verification) {
    return { decision: "continue", status: null, reasonCodes: ["no_verification"] };
  }

  // Non-satisfied verifier results map to honest, non-success handling.
  if (verification.status === "blocked") {
    return { decision: "terminate", status: "blocked", reasonCodes: uniq(["blocked", ...asArray(verification.reasonCodes)]) };
  }
  if (verification.status === "unverified") {
    return { decision: "continue", status: null, reasonCodes: ["unverified"] };
  }
  if (verification.status === "provisional") {
    return { decision: "continue", status: null, reasonCodes: uniq(["provisional", ...asArray(verification.reasonCodes)]) };
  }
  if (verification.status === "unsatisfied") {
    return { decision: "continue", status: null, reasonCodes: uniq(["unsatisfied", ...asArray(verification.reasonCodes)]) };
  }

  // status === "satisfied": apply the deterministic success preconditions.
  if (verification.fresh === false) return { decision: "continue", status: null, reasonCodes: ["stale_verification"] };
  if (!plan.artifact) reasonCodes.push("no_accepted_artifact");
  if (!plan.latestProposalDecisionId) reasonCodes.push("no_proposal");
  if (!plan.latestVerificationId) reasonCodes.push("no_verification_recorded");

  const coverage = asArray(verification.requirementCoverage);
  const uncovered = coverage.filter((entry) => entry.required && !entry.covered);
  if (uncovered.length > 0) reasonCodes.push("incomplete_coverage");

  if (plan.requirementsProvisional === true && input.userConfirmed !== true) {
    reasonCodes.push("provisional_requirements_unconfirmed");
  }

  if (reasonCodes.length > 0) {
    return { decision: "continue", status: null, reasonCodes: uniq(reasonCodes) };
  }

  return { decision: "complete", status: SUCCESS, reasonCodes: [] };
}

function forcedStatus(input, verification) {
  if (input.terminationStatus) return input.terminationStatus;
  if (verification && ["blocked", "unverified", "provisional"].includes(verification.status)) return verification.status === "provisional" ? "failed" : verification.status;
  return "failed";
}

function uniq(codes) {
  return [...new Set(asArray(codes).map(String).filter(Boolean))];
}

module.exports = {
  evaluatePlanCompletion
};
