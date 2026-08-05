/**
 * Plan checkpoint phases and read-only recovery policy (M8.7).
 *
 * Plan reuses the M7 checkpoint schema and store unchanged. This module maps the
 * Plan-facing phase vocabulary onto the shared checkpoint phases and encodes the
 * recovery rules that hold BECAUSE Plan is read-only:
 *
 *   - repeated reads may be safely retried after policy checks,
 *   - a lost model call may be repeated from the same durable state,
 *   - a pending clarification returns as a new live interaction,
 *   - accepted user answers remain authoritative,
 *   - stale decisions and verifier results remain invalid,
 *   - saved-plan finalization is idempotent,
 *   - terminal checkpoints never offer resume.
 *
 * Because nothing mutates the workspace, recovery never needs the Agent's
 * mutation-reconciliation path — every recoverable continuation is safe.
 */

"use strict";

/** Plan-facing phase -> shared checkpoint phase (companion-checkpoint-schema). */
const PLAN_PHASE_TO_CHECKPOINT_PHASE = Object.freeze({
  decision_ready: "decision_ready",
  model_pending: "model_pending",
  interaction_pending: "interaction_pending",
  inspection_prepared: "action_prepared",
  inspection_observed: "action_observed",
  progress_pending: "decision_ready",
  verification_pending: "verification_pending",
  finalizing: "finalizing",
  terminal: "terminal"
});

const PLAN_PHASES = Object.freeze(Object.keys(PLAN_PHASE_TO_CHECKPOINT_PHASE));

/**
 * @param {string} planPhase
 * @returns {string} Shared checkpoint phase.
 */
function planPhaseToCheckpointPhase(planPhase) {
  return PLAN_PHASE_TO_CHECKPOINT_PHASE[planPhase] || "decision_ready";
}

/**
 * @param {object} checkpoint - { checkpointKind, phase }.
 * @returns {boolean} False for terminal checkpoints (no resume).
 */
function isPlanCheckpointResumable(checkpoint) {
  if (!checkpoint) return false;
  if (checkpoint.checkpointKind === "terminal") return false;
  return checkpoint.phase !== "terminal";
}

/**
 * Resolve the safe recovery continuation for a Plan checkpoint.
 *
 * @param {object} checkpoint - { checkpointKind, phase, continuation }.
 * @returns {{ continuation: string, resumable: boolean, reasonCodes: string[], invalidates: string[] }}
 */
function resolvePlanRecovery(checkpoint = {}) {
  const phase = checkpoint.phase || "decision_ready";

  if (checkpoint.checkpointKind === "terminal" || phase === "terminal") {
    return { continuation: "repair_terminal_projection", resumable: false, reasonCodes: ["terminal_no_resume"], invalidates: [] };
  }

  switch (phase) {
    case "model_pending":
      // A lost model call is repeated from the same durable state.
      return { continuation: "restart_decision", resumable: true, reasonCodes: ["repeat_model_call"], invalidates: [] };

    case "interaction_pending":
      // Pending clarification returns as a fresh live interaction; any accepted
      // answer already in state remains authoritative.
      return { continuation: "reissue_clarification", resumable: true, reasonCodes: ["reissue_pending_clarification"], invalidates: [] };

    case "action_prepared":
    case "action_observed":
      // Read-only inspections are safe to retry or reuse.
      return { continuation: "retry_read", resumable: true, reasonCodes: ["read_only_retry_safe"], invalidates: [] };

    case "verification_pending":
      // A verifier result interrupted mid-flight is stale and must be redone.
      return { continuation: "restart_decision", resumable: true, reasonCodes: ["stale_verification_discarded"], invalidates: ["verification_result"] };

    case "finalizing":
      // Saving is idempotent — never write the plan twice.
      return { continuation: "idempotent_finalize", resumable: true, reasonCodes: ["idempotent_save"], invalidates: [] };

    case "decision_ready":
    default:
      // Any stale in-flight decision is invalid on restart.
      return { continuation: "restart_decision", resumable: true, reasonCodes: ["rebuild_from_state"], invalidates: ["in_flight_decision"] };
  }
}

module.exports = {
  PLAN_PHASES,
  PLAN_PHASE_TO_CHECKPOINT_PHASE,
  planPhaseToCheckpointPhase,
  isPlanCheckpointResumable,
  resolvePlanRecovery
};
