/**
 * Plan final-response and saved-plan composition (M8.5).
 *
 * The final response and saved plan are composed from accepted state, verified
 * evidence, explicit assumptions, unresolved questions, and termination reason —
 * never from conversation memory. Non-success outcomes produce honest responses
 * that must not use success wording. Saving is idempotent.
 */

"use strict";

const { renderPlanArtifactMarkdown } = require("./plan-artifact-schema");

const SUCCESS_STATUS = "succeeded";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const NON_SUCCESS_HEADINGS = Object.freeze({
  blocked: "Planning blocked",
  provisional: "Plan not confirmed",
  unverified: "Plan could not be verified",
  budget_exhausted: "Planning stopped: budget exhausted",
  failed: "Planning did not complete",
  cancelled: "Planning cancelled"
});

/**
 * Compose the final Plan response and (on success) the saved-plan body.
 *
 * @param {object} input
 * @param {object} input.projection - Accepted Plan projection.
 * @param {string} input.outcome - Terminal status.
 * @param {object} [input.verification] - Latest verifier result.
 * @returns {{ outcome: string, content: string, savedPlanBody: string|null, success: boolean }}
 */
function composePlanFinalResponse(input = {}) {
  const projection = input.projection || {};
  const plan = projection.plan || {};
  const outcome = String(input.outcome || plan.status || "failed");

  if (outcome === SUCCESS_STATUS) {
    const markdown = renderPlanArtifactMarkdown(plan.artifact);
    return { outcome, content: markdown, savedPlanBody: markdown, success: true };
  }

  // Honest non-success response — derived from state, no success wording.
  const heading = NON_SUCCESS_HEADINGS[outcome] || "Planning did not complete";
  const lines = [`# ${heading}`, ""];

  const reasons = asArray(input.verification && input.verification.reasonCodes).concat(asArray(plan.terminalReasonCodes));
  const uniqueReasons = [...new Set(reasons.map(String).filter(Boolean))];
  if (uniqueReasons.length) {
    lines.push("Reasons:");
    for (const reason of uniqueReasons) lines.push(`- ${reason.replace(/_/g, " ")}`);
    lines.push("");
  }

  const blockingQuestions = asArray(plan.artifact && plan.artifact.unresolvedQuestions).filter((q) => q && q.blocking);
  const openQuestions = asArray(plan.unresolvedQuestions).concat(blockingQuestions.map((q) => ({ question: q.question })));
  const questionText = openQuestions.map((q) => String(q.question || q).trim()).filter(Boolean);
  if (questionText.length) {
    lines.push("Open questions that must be resolved first:");
    for (const question of questionText) lines.push(`- ${question}`);
    lines.push("");
  }

  const requirements = asArray(plan.requirements);
  if (requirements.length) {
    lines.push("Requirements understood so far:");
    for (const requirement of requirements) lines.push(`- ${String(requirement.statement || "").trim()}`);
    lines.push("");
  }

  if (plan.requirementsProvisional === true) {
    lines.push("These requirements were inferred from your request and need your confirmation before a plan can be finalized.");
  }

  return { outcome, content: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n", savedPlanBody: null, success: false };
}

/**
 * Idempotency guard for saving a plan: a plan is saved at most once.
 * @param {object} projection
 * @returns {boolean} True only if no saved-plan reference has been recorded yet.
 */
function shouldSavePlan(projection) {
  const plan = (projection && projection.plan) || {};
  return plan.status === SUCCESS_STATUS && !plan.savedPlanRef;
}

module.exports = {
  composePlanFinalResponse,
  shouldSavePlan
};
