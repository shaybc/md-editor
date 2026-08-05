/**
 * Plan context building policy (M8.3).
 *
 * Plan reuses the shared M3 Context Builder (`buildAgentContext`) rather than a
 * second pipeline. This module maps the Plan projection into the builder's state
 * shape and applies Plan source priorities:
 *
 *   Mandatory: system+policy, current prompt, intent contract / acceptance
 *   criteria, verbatim clarifications, user constraints, Plan state projection.
 *   Optional:  observations + artifact excerpts, active buffer, attachments.
 *
 * Guarantees preserved by delegating to the shared builder:
 *   - live editor buffer supersedes stale reads/excerpts for the same path,
 *   - verbatim user text is preserved as an authoritative source,
 *   - a deterministic omitted-source manifest is produced.
 */

"use strict";

const { buildAgentContext } = require("./agent-context-builder");

/**
 * Map a Plan projection to a state object the shared Context Builder understands.
 * Uses schemaVersion 3 so the builder does not require the Agent verification
 * sub-schema; Plan verification/progress are injected as needed by later
 * sub-milestones.
 *
 * @param {object} planProjection - From plan-state-projection.
 * @param {object} [opts]
 * @param {object} [opts.intentContract] - Read-only intent contract if present.
 * @param {object} [opts.intentContractMeta]
 * @returns {object} Builder-compatible state.
 */
function mapPlanProjectionToBuilderState(planProjection, opts = {}) {
  const plan = (planProjection && planProjection.plan) || {};
  const coverage = new Map((plan.requirementCoverage || []).map((entry) => [entry.id, entry.covered === true]));
  return {
    schemaVersion: 3,
    stateVersion: (planProjection && planProjection.stateVersion) || 0,
    controlMode: "controller",
    originalPrompt: (planProjection && planProjection.prompt) || "",
    intentContract: opts.intentContract || null,
    intentContractMeta: opts.intentContractMeta || null,
    // Clarifications surface verbatim as authoritative user instructions.
    interactions: (plan.clarifications || []).map((clarification, index) => ({
      interactionId: clarification.questionId || `plan-clarification-${index}`,
      instructions: clarification.text
    })),
    criteria: (plan.requirements || []).map((requirement) => ({
      id: requirement.id,
      description: requirement.statement,
      status: coverage.get(requirement.id) ? "satisfied" : "pending",
      provisional: requirement.provisional === true
    })),
    recentObservations: Array.isArray(plan.observations) ? plan.observations : [],
    lifecycle: { status: plan.status || "drafting" },
    completion: null,
    verification: null,
    progress: null,
    artifacts: null
  };
}

/**
 * Build a Plan context by delegating to the shared Context Builder.
 *
 * @param {object} input
 * @param {object} input.planProjection
 * @param {string} input.systemPrompt - Plan system + policy instructions.
 * @param {object} [input.intentContract]
 * @param {object} [input.activeFile] - Live editor buffer { path, content }.
 * @param {object} [input.editorReadContext]
 * @param {object[]} [input.attachments]
 * @param {object} [input.artifactStore]
 * @param {string} [input.requestId]
 * @param {number} [input.maxChars]
 * @returns {object} { mode:"plan", stateVersion, messages, manifest }.
 */
function buildPlanContext(input = {}) {
  const state = mapPlanProjectionToBuilderState(input.planProjection, {
    intentContract: input.intentContract,
    intentContractMeta: input.intentContractMeta
  });
  const built = buildAgentContext({
    state,
    systemPrompt: input.systemPrompt,
    prompt: state.originalPrompt,
    activeFile: input.activeFile,
    editorReadContext: input.editorReadContext,
    attachments: input.attachments,
    artifactStore: input.artifactStore,
    requestId: input.requestId,
    intentInjectedMaxChars: input.intentInjectedMaxChars,
    maxChars: input.maxChars
  });
  return { ...built, mode: "plan" };
}

module.exports = {
  mapPlanProjectionToBuilderState,
  buildPlanContext
};
