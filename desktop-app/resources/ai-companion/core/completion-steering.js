/**
 * Closed-loop steering seam (Phase 0).
 *
 * When completion assessment returns "incomplete", the steering router turns the arbiter
 * classes into a decision that either steers the agent for another bounded pass, revises the
 * contract (clarification), or stops and reports honestly. This module currently defines the
 * shared vocabulary and the SteeringDecision shape; the router and message builder land in
 * Phase 1.
 *
 * Pure module: no IO, provider calls, or side effects.
 */

"use strict";

/** What the harness should do next after an assessment. */
const STEERING_ACTIONS = Object.freeze(["continue", "revise-contract", "stop"]);

/** Why that action was chosen (drives logging and the user-facing report). */
const STEERING_REASONS = Object.freeze([
  "unsatisfied",       // a clear outcome was not done -> steer the agent (continue)
  "blocked",           // a required tool was denied/failed -> stop and surface
  "ambiguity",         // unclear intent -> revise-contract via clarification
  "spec-gap",          // an inferred criterion may be wrong -> revise-contract via clarification
  "converged",         // assessment reached complete -> stop, success
  "budget-exhausted"   // out of revision budget -> stop, honest incomplete
]);

/**
 * @typedef {object} SteeringDecision
 * @property {"continue"|"revise-contract"|"stop"} action - What the loop does next.
 * @property {string} reason - One of STEERING_REASONS.
 * @property {string} feedback - The steering message injected into the next agent pass; empty
 *   when action is "stop".
 */

/** Criterion statement text, resilient to the shape/field variations across the pipeline. */
function criterionStatement(criterion) {
  return String((criterion && (criterion.statement || criterion.description)) || "").trim();
}

/**
 * Build the steering message injected into the next agent pass: the unmet criteria, each with
 * its arbiter guidance, plus a reflexion note for criteria that were already unmet on a prior
 * pass so the agent does not repeat the same miss.
 *
 * @param {object} assessment - The latest normalized+arbitrated assessment.
 * @param {object} contract - The intent contract (for criterion text).
 * @param {Set<string>} priorUnmetIds - Criterion ids that were unmet on an earlier pass.
 * @returns {string} The feedback message (empty if nothing is unmet).
 */
function buildSteeringFeedback(assessment, contract, priorUnmetIds = new Set()) {
  const unmet = (assessment && Array.isArray(assessment.criteria) ? assessment.criteria : [])
    .filter((verdict) => verdict.status === "unmet");
  if (!unmet.length) return "";
  const byId = new Map((contract && Array.isArray(contract.acceptanceCriteria) ? contract.acceptanceCriteria : [])
    .map((criterion) => [criterion.id, criterion]));
  const lines = [
    "The task is NOT yet complete. These acceptance criteria are still unmet. Perform the concrete actions needed to satisfy them, then stop. Do not claim success until they are actually done and backed by tool evidence."
  ];
  for (const verdict of unmet) {
    const text = criterionStatement(byId.get(verdict.id)) || verdict.id;
    const guidance = (verdict.arbitration && verdict.arbitration.guidance) || "";
    const repeat = priorUnmetIds.has(verdict.id) ? " (still unmet after a previous attempt -- do not repeat the same approach)" : "";
    lines.push(`- ${verdict.id}: ${text}. ${guidance}${repeat}`.trim());
  }
  return lines.join("\n");
}

/**
 * Decide what the loop does next after an assessment. Deterministic; the arbiter classes are
 * the routing signal. Priority: blocked -> stop and surface; ambiguity/spec-gap -> revise the
 * contract via clarification; unsatisfied -> steer the agent; budget/complete terminate.
 *
 * @param {object} params
 * @param {object} params.assessment - The arbitrated assessment.
 * @param {object} params.contract - The intent contract.
 * @param {number} params.iteration - Revisions already spent (0 on the first assessment).
 * @param {number} params.maxRevisions - The budget.
 * @param {Set<string>} [params.priorUnmetIds] - Criterion ids unmet on an earlier pass.
 * @returns {SteeringDecision}
 */
function decideSteering(params) {
  const { assessment, contract, iteration, maxRevisions, priorUnmetIds = new Set() } = params;
  const stop = (reason) => ({ action: "stop", reason, feedback: "" });
  if (!assessment) return stop("converged");
  if (assessment.overallStatus === "complete") return stop("converged");
  // Provisional / unverified contracts have nothing verifiable to steer toward; report as-is.
  if (assessment.overallStatus !== "incomplete") return stop("converged");

  const unmet = (assessment.criteria || []).filter((verdict) => verdict.status === "unmet");
  const classes = new Set(unmet.map((verdict) => verdict.arbitration && verdict.arbitration.class).filter(Boolean));
  // Blocked is environmental: retrying cannot help. Stop and surface.
  if (classes.has("blocked")) return stop("blocked");
  const budgetLeft = iteration < maxRevisions;
  const feedback = buildSteeringFeedback(assessment, contract, priorUnmetIds);
  // Ambiguity / spec-gap: fix the contract (clarification) before spending another pass.
  if (classes.has("ambiguity") || classes.has("spec-gap")) {
    if (!budgetLeft) return stop("budget-exhausted");
    return { action: "revise-contract", reason: classes.has("ambiguity") ? "ambiguity" : "spec-gap", feedback };
  }
  // Otherwise the outcome simply was not done: steer the agent.
  if (!budgetLeft) return stop("budget-exhausted");
  return { action: "continue", reason: "unsatisfied", feedback };
}

/** Criterion ids that are unmet in an assessment (carried forward for reflexion). */
function unmetCriterionIds(assessment) {
  return new Set((assessment && Array.isArray(assessment.criteria) ? assessment.criteria : [])
    .filter((verdict) => verdict.status === "unmet")
    .map((verdict) => verdict.id));
}

module.exports = {
  STEERING_ACTIONS,
  STEERING_REASONS,
  decideSteering,
  buildSteeringFeedback,
  unmetCriterionIds
};
