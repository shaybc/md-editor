/**
 * Plan stateful controller orchestrator (M8.8).
 *
 * Composes the M8.2–M8.7 pieces into a single read-only controller run:
 *
 *   init state -> derive requirements (guarded) -> [decide -> validate ->
 *   execute read-only action / control action -> record observation ->
 *   detect progress] -> verify proposed artifact -> completion gate ->
 *   compose final response from accepted state.
 *
 * The orchestrator is dependency-injected: `requestDecision`, `executeReadOnlyTool`,
 * `requestClarification`, and `savePlan` are provided by the caller (plan/index.js
 * wires provider- and tool-backed implementations; tests inject scripted fakes).
 * This keeps the composed logic deterministically testable without a live model,
 * and keeps the orchestrator provider-neutral.
 */

"use strict";

const { createInitialPlanProjection, applyPlanEvent, PLAN_EVENT_TYPES } = require("./plan-state-projection");
const { derivePlanRequirements } = require("./plan-requirements-source");
const { validatePlanDecision, PLAN_DECISION_TYPES, derivePlanAllowedToolNames } = require("./plan-decision-contract");
const { normalizePlanObservation, planActionSignature } = require("./plan-observation-policy");
const { verifyPlanArtifact } = require("./plan-verification");
const { evaluatePlanCompletion } = require("./plan-completion-gate");
const { composePlanFinalResponse } = require("./plan-final-composer");
const { createPlanProgressTracker } = require("./plan-progress-policy");

const DEFAULT_MAX_DECISIONS = 40;

function apply(projectionRef, event) {
  const result = applyPlanEvent(projectionRef.value, event);
  if (result.accepted) projectionRef.value = result.projection;
  return result;
}

/**
 * Run the read-only Plan controller.
 *
 * @param {object} request - { prompt, intentContract, runId, activeFile, ... }.
 * @param {object} deps
 * @param {function} deps.requestDecision - async (projection) => typed decision.
 * @param {function} deps.executeReadOnlyTool - async (toolName, args) => details.
 * @param {function} [deps.requestClarification] - async (question) => answer text.
 * @param {function} [deps.savePlan] - async (body, projection) => savedRef.
 * @param {function} [deps.emit] - event emitter.
 * @param {Set<string>} [deps.allowedToolNames]
 * @param {object} [deps.budgets]
 * @returns {Promise<{ outcome: string, content: string, savedPlanRef: string|null, projection: object }>}
 */
async function runPlanStatefulController(request = {}, deps = {}) {
  // Fail closed before any provider request if required dependencies are absent.
  if (typeof deps.requestDecision !== "function") throw new Error("Plan controller requires a requestDecision dependency.");
  if (typeof deps.executeReadOnlyTool !== "function") throw new Error("Plan controller requires an executeReadOnlyTool dependency.");

  const emit = typeof deps.emit === "function" ? deps.emit : () => {};
  const allowedToolNames = deps.allowedToolNames instanceof Set ? deps.allowedToolNames : derivePlanAllowedToolNames();
  const maxDecisions = Number.isInteger(deps.budgets?.maxDecisions) ? deps.budgets.maxDecisions : DEFAULT_MAX_DECISIONS;
  const progress = createPlanProgressTracker({ ...deps.budgets, maxDecisions });

  const projectionRef = { value: createInitialPlanProjection({ prompt: request.prompt, runId: request.runId }) };

  // Requirements source with the fallback derivation guard.
  const derived = derivePlanRequirements({
    intentContract: request.intentContract,
    prompt: request.prompt,
    clarifications: request.clarifications
  });
  apply(projectionRef, {
    type: PLAN_EVENT_TYPES.REQUIREMENTS_DERIVED,
    requirements: derived.requirements,
    provenance: derived.provenance,
    provisional: derived.provisional
  });
  emit({ type: "plan-controller", phase: "requirements_derived", provenance: derived.provenance, provisional: derived.provisional });

  const admissibleEvidence = new Set();
  let userConfirmed = false;

  const finish = (outcome, verification) => {
    if (!["succeeded", "blocked", "budget_exhausted", "failed", "cancelled"].includes(projectionRef.value.plan.status)) {
      apply(projectionRef, { type: PLAN_EVENT_TYPES.COMPLETION_TERMINATED, status: outcome, reasonCodes: verification?.reasonCodes || [], userConfirmed });
    }
    const composed = composePlanFinalResponse({ projection: projectionRef.value, outcome: projectionRef.value.plan.status, verification });
    emit({ type: "plan-controller", phase: "final", outcome: composed.outcome, success: composed.success });
    return { outcome: composed.outcome, content: composed.content, savedPlanRef: projectionRef.value.plan.savedPlanRef, projection: projectionRef.value };
  };

  for (let round = 0; round < maxDecisions + 2; round += 1) {
    const budget = progress.assess();
    if (budget.terminal) return finish("budget_exhausted", { reasonCodes: budget.reasonCodes });

    const raw = await deps.requestDecision(projectionRef.value);
    const validation = validatePlanDecision(
      { ...raw, basedOnStateVersion: raw?.basedOnStateVersion ?? projectionRef.value.stateVersion },
      { currentStateVersion: projectionRef.value.stateVersion, allowedToolNames }
    );
    if (!validation.valid) {
      emit({ type: "plan-controller", phase: "decision_rejected", reasonCodes: validation.reasonCodes });
      // A rejected decision makes no progress; keep the loop bounded.
      const noProgress = progress.recordAction({ actionSignature: `invalid:${validation.reasonCodes.join(",")}`, producedNewEvidence: false });
      if (noProgress.terminal) return finish("budget_exhausted", { reasonCodes: noProgress.reasonCodes });
      continue;
    }

    const decision = validation.normalized;

    if (decision.type === PLAN_DECISION_TYPES.TOOL_CALL) {
      const details = await deps.executeReadOnlyTool(decision.toolName, raw.args || {});
      const normalized = normalizePlanObservation(details, deps.artifactStore);
      if (!normalized.readOnly) return finish("failed", { reasonCodes: [normalized.violationReason] });
      const evidenceRef = normalized.observation.evidenceRef || normalized.observation.observationId;
      if (evidenceRef) admissibleEvidence.add(String(evidenceRef));
      apply(projectionRef, { type: PLAN_EVENT_TYPES.OBSERVATION_RECORDED, observation: normalized.observation, evidenceRefs: [evidenceRef] });
      const step = progress.recordAction({
        actionSignature: planActionSignature(decision.toolName, raw.args || {}),
        producedNewEvidence: normalized.observation.outcome !== "no_change" && normalized.observation.executionStatus !== "failed"
      });
      if (step.terminal) return finish("budget_exhausted", { reasonCodes: step.reasonCodes });
      continue;
    }

    if (decision.type === PLAN_DECISION_TYPES.REQUEST_USER_INPUT) {
      if (typeof deps.requestClarification !== "function") return finish("blocked", { reasonCodes: ["clarification_unavailable"] });
      const answer = await deps.requestClarification(raw.question || raw.payload?.question || "");
      if (answer == null || String(answer).trim() === "") return finish("blocked", { reasonCodes: ["clarification_unanswered"] });
      apply(projectionRef, { type: PLAN_EVENT_TYPES.CLARIFICATION_RECORDED, text: String(answer) });
      userConfirmed = true; // an explicit answer confirms otherwise-provisional requirements
      continue;
    }

    if (decision.type === PLAN_DECISION_TYPES.REVISE_PLAN_STRATEGY) {
      const revision = progress.recordStrategyRevision({ strategySignature: String(raw.revisedApproach || raw.payload?.revisedApproach || "") });
      if (revision.accepted) {
        apply(projectionRef, { type: PLAN_EVENT_TYPES.STRATEGY_REVISED, abandonedApproach: raw.abandonedApproach, revisedApproach: raw.revisedApproach });
      }
      if (revision.terminal) return finish("budget_exhausted", { reasonCodes: revision.reasonCodes });
      continue;
    }

    if (decision.type === PLAN_DECISION_TYPES.REPORT_BLOCKED) {
      return finish("blocked", { reasonCodes: ["reported_blocked", ...(raw.blockerType ? [String(raw.blockerType)] : [])] });
    }

    if (decision.type === PLAN_DECISION_TYPES.PROPOSE_PLAN_COMPLETION) {
      const proposal = apply(projectionRef, { type: PLAN_EVENT_TYPES.PLAN_PROPOSED, artifact: raw.artifact, decisionId: decision.decisionId || `d-${round}` });
      if (!proposal.accepted) {
        const noProgress = progress.recordPlanProposal({ coverageCount: 0 });
        if (noProgress.terminal) return finish("budget_exhausted", { reasonCodes: noProgress.reasonCodes });
        continue;
      }
      const verification = verifyPlanArtifact({
        artifact: raw.artifact,
        requirements: projectionRef.value.plan.requirements,
        admissibleEvidence,
        requirementsProvisional: projectionRef.value.plan.requirementsProvisional,
        userConfirmed,
        proposalDecisionId: projectionRef.value.plan.latestProposalDecisionId,
        currentProposalDecisionId: projectionRef.value.plan.latestProposalDecisionId
      });
      apply(projectionRef, {
        type: PLAN_EVENT_TYPES.VERIFICATION_APPLIED,
        verificationId: verification.verificationId,
        proposalDecisionId: projectionRef.value.plan.latestProposalDecisionId,
        status: verification.status,
        requirementCoverage: verification.requirementCoverage
      });
      const coveredCount = (verification.requirementCoverage || []).filter((entry) => entry.covered).length;
      const gate = evaluatePlanCompletion({ projection: projectionRef.value, verification, pending: {}, userConfirmed });

      if (gate.decision === "complete") {
        // Compose (from the accepted, not-yet-terminal state — the artifact is
        // already recorded) and save exactly once BEFORE the single terminal
        // transition, so the saved-plan reference lands in one reducer event.
        const composed = composePlanFinalResponse({ projection: projectionRef.value, outcome: "succeeded", verification });
        let savedRef = null;
        if (typeof deps.savePlan === "function") savedRef = await deps.savePlan(composed.savedPlanBody, projectionRef.value);
        apply(projectionRef, {
          type: PLAN_EVENT_TYPES.COMPLETION_TERMINATED,
          status: "succeeded",
          reasonCodes: [],
          userConfirmed,
          savedPlanRef: savedRef ? String(savedRef) : undefined
        });
        emit({ type: "plan-controller", phase: "final", outcome: "succeeded", success: true });
        return { outcome: "succeeded", content: composed.content, savedPlanRef: projectionRef.value.plan.savedPlanRef, projection: projectionRef.value };
      }

      if (gate.decision === "terminate") return finish(gate.status, verification);

      // Continue: the proposal did not pass; count it as (non-)progress.
      const proposalProgress = progress.recordPlanProposal({ coverageCount: coveredCount });
      if (proposalProgress.terminal) return finish("budget_exhausted", { reasonCodes: proposalProgress.reasonCodes });
      continue;
    }
  }

  return finish("budget_exhausted", { reasonCodes: ["decision_budget_exhausted"] });
}

module.exports = {
  runPlanStatefulController
};
