/**
 * State-grounded final response composition for controller-enabled Agent runs.
 */

"use strict";

const MAX_FINAL_RESPONSE_CHARS = 12000;
const SUCCESS_CLAIM_PATTERN = /\b(?:completed|finished|fixed|implemented|updated|changed|tests? pass(?:ed)?|build (?:pass(?:ed)?|succeeded))\b/i;
const FILE_TOKEN_PATTERN = /(?:^|[\s("'`])([\w.@+-]+(?:[\\/][\w.@+ -]+)+\.[A-Za-z0-9_-]+|[\w.@+-]+\.[A-Za-z0-9_-]{1,12})(?=$|[\s),;:"'`])/g;

function boundedText(value, maximum = MAX_FINAL_RESPONSE_CHARS) {
  const text = String(value || "").trim();
  return text.length > maximum ? text.slice(0, maximum) : text;
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function allowedFileReferences(state) {
  const values = [
    ...(state?.artifacts?.changedFiles || []),
    ...(state?.artifacts?.attemptedFiles || []),
    ...(state?.recentObservations || []).flatMap((observation) => observation?.files || [])
  ];
  return new Set(values.map((entry) => normalizePath(entry?.path || entry)).filter(Boolean));
}

function hasSucceededValidationEvidence(state) {
  return (state?.recentObservations || []).some((observation) =>
    observation?.executionStatus === "executed"
    && observation?.outcome === "succeeded"
    && /^(?:run_command|run_test|run_tests|compile_project)$/.test(String(observation?.tool || "")));
}

function unsupportedProposalClaims(candidate, state, outcome) {
  const reasons = [];
  const content = String(candidate || "");
  if (outcome !== "succeeded" && SUCCESS_CLAIM_PATTERN.test(content)) reasons.push("success_claim_without_success");
  if (/\btests? pass(?:ed)?\b|\bbuild (?:pass(?:ed)?|succeeded)\b/i.test(content) && !hasSucceededValidationEvidence(state)) {
    reasons.push("validation_claim_without_evidence");
  }
  const allowedFiles = allowedFileReferences(state);
  for (const match of content.matchAll(FILE_TOKEN_PATTERN)) {
    const token = normalizePath(match[1]);
    if (token && !allowedFiles.has(token) && ![...allowedFiles].some((path) => path.endsWith(`/${token}`))) {
      reasons.push("file_claim_without_state_reference");
      break;
    }
  }
  return [...new Set(reasons)];
}

function defaultSummary(outcome) {
  if (outcome === "succeeded") return "The requested Agent task completed and passed its verification gate.";
  if (outcome === "blocked") return "The Agent task stopped because a required condition could not be completed.";
  if (outcome === "provisional") return "The Agent task produced a provisional result that cannot be confirmed as complete.";
  if (outcome === "unverified") return "The Agent task ended without enough verifiable criteria to confirm completion.";
  if (outcome === "budget_exhausted") return "The Agent task stopped after reaching its execution budget.";
  if (outcome === "cancelled") return "The Agent task was cancelled before completion.";
  if (outcome === "failed") return "The Agent task failed before completion could be verified.";
  return "The Agent task is not complete yet.";
}

/**
 * Project only authoritative, user-visible completion facts from AgentState.
 * @param {object} state Accepted AgentState.
 * @param {string} outcome Semantic outcome.
 * @returns {object} FinalResponseViewV1.
 */
function createFinalResponseView(state, outcome) {
  const criteria = (state?.criteria || []).map((criterion) => ({
    id: String(criterion.id || ""),
    status: String(criterion.status || "unsatisfied"),
    evidenceRefs: [...(criterion.evidenceRefs || [])]
  }));
  const validationEvidence = (state?.recentObservations || [])
    .filter((observation) => /^(?:run_command|run_test|run_tests|compile_project)$/.test(String(observation?.tool || "")))
    .map((observation) => ({
      tool: String(observation.tool || ""),
      outcome: String(observation.outcome || "unknown"),
      evidenceRef: String(observation.evidenceRef || "")
    }));
  const blockers = state?.verification?.latestResult?.blockers || [];
  return {
    schemaVersion: 1,
    outcome,
    terminalReason: String(state?.terminalReason || ""),
    satisfiedCriteria: criteria.filter((criterion) => criterion.status === "satisfied"),
    unsatisfiedCriteria: criteria.filter((criterion) => criterion.status !== "satisfied"),
    changedFiles: (state?.artifacts?.changedFiles || []).map((file) => String(file?.path || file)).filter(Boolean),
    attemptedFiles: (state?.artifacts?.attemptedFiles || []).map((file) => String(file?.path || file)).filter(Boolean),
    blockedChanges: (state?.artifacts?.blockedChanges || []).map((change) => ({
      code: String(change?.code || ""),
      capability: String(change?.capability || "")
    })),
    validationEvidence,
    remainingIssues: (state?.completion?.unresolvedIssues || []).map((issue) => String(issue?.description || issue)).filter(Boolean),
    requiredUserActions: blockers.map((blocker) => String(blocker?.requiredAction || "")).filter(Boolean),
    progress: state?.progress ? {
      terminalReason: String(state.progress.terminalReason || ""),
      stallScore: Number(state.progress.stallScore) || 0,
      unproductiveActions: (state.progress.recentAssessments || []).filter((assessment) => assessment.status !== "meaningful").length,
      replanAttemptCount: Number(state.progress.replanAttemptCount) || 0,
      acceptedReplanCount: Number(state.progress.acceptedReplanCount) || 0
    } : null,
    allowedEvidenceClaims: (state?.recentObservations || []).map((observation) => ({
      evidenceRef: String(observation?.evidenceRef || ""),
      summary: String(observation?.summary?.text || ""),
      outcome: String(observation?.outcome || "unknown")
    })).filter((entry) => entry.evidenceRef)
  };
}

function renderCriteria(view) {
  const criteria = [...view.satisfiedCriteria, ...view.unsatisfiedCriteria];
  if (!criteria.length) return "";
  return [
    "## Verification",
    "",
    ...criteria.map((criterion) => {
      const status = criterion.status === "satisfied" ? "Satisfied" : (criterion.status === "provisional" ? "Provisional" : (criterion.status === "unverified" ? "Unverified" : "Unsatisfied"));
      const evidence = (criterion.evidenceRefs || []).length ? ` - evidence: ${criterion.evidenceRefs.join(", ")}` : "";
      return `- ${criterion.id}: ${status}${evidence}`;
    })
  ].join("\n");
}

function renderChanges(view) {
  const sections = [];
  if (view.changedFiles.length) sections.push("## Changed files", "", ...view.changedFiles.map((file) => `- ${file}`));
  if (view.attemptedFiles.length) sections.push("## Attempted changes", "", ...view.attemptedFiles.map((file) => `- ${file}`));
  if (view.blockedChanges.length) sections.push("## Blocked changes", "", ...view.blockedChanges.map((change) => `- ${change.code || change.capability || "Blocked change"}`));
  return sections.join("\n");
}

function renderValidation(view) {
  if (!view.validationEvidence.length) return "";
  return ["## Validation", "", ...view.validationEvidence.map((entry) =>
    `- ${entry.tool}: ${entry.outcome}${entry.evidenceRef ? ` - evidence: ${entry.evidenceRef}` : ""}`)].join("\n");
}

function renderRemainingIssues(view) {
  const sections = [];
  if (view.remainingIssues.length) sections.push("## Remaining issues", "", ...view.remainingIssues.map((issue) => `- ${issue}`));
  if (view.requiredUserActions.length) sections.push("## Required user actions", "", ...view.requiredUserActions.map((action) => `- ${action}`));
  return sections.join("\n");
}

function renderProgressBudget(view) {
  if (view.outcome !== "budget_exhausted" || view.progress?.terminalReason !== "no_progress_budget_exhausted") return "";
  return [
    "## Progress limit",
    "",
    `- Unproductive actions: ${view.progress.unproductiveActions}`,
    `- Current stall score: ${view.progress.stallScore}`,
    `- Strategy revisions attempted: ${view.progress.replanAttemptCount}`,
    `- Strategy revisions accepted: ${view.progress.acceptedReplanCount}`
  ].join("\n");
}

/**
 * Build the immutable state view and deterministic content returned to the user.
 * @param {{state: object, outcome: string, proposalContent?: string, reasonCodes?: string[]}} input Composition inputs.
 * @returns {object} FinalResponseViewV1 with validated content.
 */
function composeFinalResponse(input = {}) {
  const state = input.state || {};
  const outcome = String(input.outcome || state.completion?.status || "failed");
  const view = createFinalResponseView(state, outcome);
  const claimValidation = unsupportedProposalClaims(input.proposalContent, state, outcome);
  const narrative = claimValidation.length ? defaultSummary(outcome) : (boundedText(input.proposalContent) || defaultSummary(outcome));
  const sections = [narrative, renderProgressBudget(view), renderChanges(view), renderCriteria(view), renderValidation(view), renderRemainingIssues(view)].filter(Boolean);
  return {
    schemaVersion: 1,
    outcome,
    content: boundedText(sections.join("\n\n")),
    claimValidation: { valid: claimValidation.length === 0, reasonCodes: claimValidation },
    reasonCodes: [...new Set((input.reasonCodes || []).map(String).filter(Boolean))],
    view
  };
}

module.exports = {
  composeFinalResponse,
  createFinalResponseView,
  unsupportedProposalClaims
};
