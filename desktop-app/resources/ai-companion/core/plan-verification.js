/**
 * Plan verification (M8.4).
 *
 * This is new verification logic that reuses shared plumbing (artifact schema,
 * evidence references) rather than a thin adapter: the Agent verifier checks
 * evidence of executed effects, whereas the Plan verifier checks a PROPOSED
 * artifact's internal coverage and consistency with nothing executed.
 *
 * The verifier is side-effect free. It produces a typed result only; the state
 * transition service and completion gate own status interpretation and
 * termination.
 *
 * Statuses: satisfied | unsatisfied | provisional | unverified | blocked.
 */

"use strict";

const { validatePlanArtifact } = require("./plan-artifact-schema");

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function hasImplementationActions(step) {
  const actions = asArray(step && step.actions).map(text).filter(Boolean);
  return actions.length > 0;
}

let verificationCounter = 0;
function nextVerificationId() {
  verificationCounter += 1;
  return `plan-verification:${verificationCounter}`;
}

/**
 * Verify a proposed Plan artifact against authoritative requirements and evidence.
 *
 * @param {object} input
 * @param {object} input.artifact - Proposed structured Plan artifact.
 * @param {Array<object>} input.requirements - Authoritative requirements
 *   ({ id, statement, required, provisional }).
 * @param {Set<string>|string[]} [input.admissibleEvidence] - Evidence refs proven
 *   by read-only observations.
 * @param {boolean} [input.requirementsProvisional] - True when the requirement
 *   set came from unconfirmed fallback derivation.
 * @param {boolean} [input.userConfirmed] - True when the user confirmed a
 *   provisional requirement set.
 * @param {boolean} [input.mutationOccurred] - True if any mutation was recorded.
 * @param {string} [input.proposalDecisionId] - The decision that produced the artifact.
 * @param {string} [input.currentProposalDecisionId] - The latest accepted proposal.
 * @param {number} [input.repairAttempts] - Prior repair rounds for this attempt.
 * @param {number} [input.maxRepairAttempts]
 * @returns {object} Typed verification result (no state mutation).
 */
function verifyPlanArtifact(input = {}) {
  const artifact = input.artifact;
  const requirements = asArray(input.requirements);
  const admissible = input.admissibleEvidence instanceof Set
    ? input.admissibleEvidence
    : new Set(asArray(input.admissibleEvidence).map(text));
  const reasonCodes = [];
  const unresolvedIssues = [];
  const verificationId = nextVerificationId();

  const base = (status) => ({
    schemaVersion: 1,
    verificationId,
    status,
    reasonCodes: [...new Set(reasonCodes)],
    unresolvedIssues,
    requirementCoverage: [],
    fresh: true
  });

  // Check 14 — freshness. A stale proposal cannot be verified for completion.
  if (input.currentProposalDecisionId && input.proposalDecisionId
    && input.proposalDecisionId !== input.currentProposalDecisionId) {
    reasonCodes.push("stale_proposal");
    return { ...base("unverified"), fresh: false };
  }

  // Check 13 — no mutation may have been performed in read-only Plan mode.
  if (input.mutationOccurred === true) {
    reasonCodes.push("mutation_detected");
    return base("unsatisfied");
  }

  // Check 12 — schema validity / internal consistency.
  const schema = validatePlanArtifact(artifact);
  if (!schema.valid) {
    reasonCodes.push("schema_invalid", ...schema.issues.map((issue) => `schema:${issue}`));
    return base("unsatisfied");
  }

  const steps = asArray(artifact.steps);
  const artifactRequirementIds = new Set(asArray(artifact.requirements).map((r) => text(r.id)));

  // Checks 1 & 2 — no required requirement silently dropped/weakened.
  for (const requirement of requirements) {
    if (requirement.required === false) continue;
    if (!artifactRequirementIds.has(text(requirement.id))) {
      reasonCodes.push("requirement_dropped");
      unresolvedIssues.push({ requirementId: text(requirement.id), issue: "not represented in plan" });
    }
  }

  // Checks 1 & 3 — each required requirement maps to >=1 actionable step.
  const requirementCoverage = requirements.map((requirement) => {
    const coveringSteps = steps
      .filter((step) => asArray(step.requirementsCovered).map(text).includes(text(requirement.id)))
      .map((step) => text(step.id));
    return { id: text(requirement.id), required: requirement.required !== false, covered: coveringSteps.length > 0, stepIds: coveringSteps };
  });
  const missingCoverage = requirementCoverage.filter((entry) => entry.required && !entry.covered);
  if (missingCoverage.length > 0) {
    reasonCodes.push("missing_requirement_coverage");
    for (const entry of missingCoverage) unresolvedIssues.push({ requirementId: entry.id, issue: "no covering step" });
  }

  // Check 4 — steps are ordered or explicitly grouped as parallel.
  const orderedIds = asArray(artifact.sequencing && artifact.sequencing.orderedStepIds).map(text);
  const parallelIds = asArray(artifact.sequencing && artifact.sequencing.parallelGroups).flatMap((group) => asArray(group).map(text));
  const sequencedIds = new Set([...orderedIds, ...parallelIds]);
  const unsequenced = steps.filter((step) => !sequencedIds.has(text(step.id)));
  if (steps.length > 1 && unsequenced.length > 0) {
    reasonCodes.push("unsequenced_steps");
  }

  // Checks 6 & 7 — workspace-specific claims must cite admissible evidence.
  for (const step of steps) {
    const claimsWorkspace = asArray(step.filesOrComponents).length > 0 || asArray(step.affectedAreas).length > 0;
    if (!claimsWorkspace) continue;
    const evidenceRefs = asArray(step.evidenceRefs).map(text).filter(Boolean);
    if (evidenceRefs.length === 0) {
      reasonCodes.push("unsupported_workspace_claim");
      unresolvedIssues.push({ stepId: text(step.id), issue: "workspace claim without evidence" });
    } else if (admissible.size > 0 && !evidenceRefs.some((ref) => admissible.has(ref))) {
      reasonCodes.push("inadmissible_evidence");
      unresolvedIssues.push({ stepId: text(step.id), issue: "evidence not admissible" });
    }
  }

  // Check 8 — implementation steps need validation/test steps.
  for (const step of steps) {
    if (hasImplementationActions(step) && asArray(step.validations).map(text).filter(Boolean).length === 0) {
      reasonCodes.push("missing_validation_step");
      unresolvedIssues.push({ stepId: text(step.id), issue: "implementation without validation" });
    }
  }

  // Check 11 — blocking unresolved questions prevent success (blocked, not fail).
  const blockingQuestions = asArray(artifact.unresolvedQuestions).filter((question) => question && question.blocking === true && text(question.question));
  const hardFailures = reasonCodes.length > 0;

  if (blockingQuestions.length > 0) {
    reasonCodes.push("blocking_unresolved_question");
    for (const question of blockingQuestions) unresolvedIssues.push({ issue: "blocking question", question: text(question.question) });
    return { ...base("blocked"), requirementCoverage };
  }

  if (hardFailures) {
    // Deterministic all-unsatisfied fallback once the repair budget is spent.
    if (Number(input.repairAttempts) >= Number(input.maxRepairAttempts || 0) && Number(input.maxRepairAttempts) > 0) {
      reasonCodes.push("repair_budget_exhausted");
    }
    return { ...base("unsatisfied"), requirementCoverage };
  }

  // Soft conditions downgrade an otherwise-complete plan to provisional.
  // Check 9 — risks explicit where material (multi-step plans).
  const anyRisks = asArray(artifact.risks).some((risk) => text(risk && risk.description))
    || steps.some((step) => asArray(step.risks).length > 0);
  if (steps.length > 2 && !anyRisks) reasonCodes.push("missing_material_risks");

  // Fallback guard — provisional requirements cannot yield success unconfirmed.
  if (input.requirementsProvisional === true && input.userConfirmed !== true) {
    reasonCodes.push("provisional_requirements_unconfirmed");
  }

  if (reasonCodes.length > 0) {
    return { ...base("provisional"), requirementCoverage };
  }

  return { ...base("satisfied"), requirementCoverage };
}

module.exports = {
  verifyPlanArtifact
};
