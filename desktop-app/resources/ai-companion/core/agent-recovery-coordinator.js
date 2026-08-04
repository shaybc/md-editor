/**
 * Deterministic recovery decisions and reducer-driven reconciliation for interrupted Agent runs.
 */

"use strict";

const { evaluateCheckpointContinuation } = require("./companion-checkpoint-schema");
const { reconcilePreparedAction } = require("./agent-action-recovery-policy");

/**
 * Reconcile a validated checkpoint before the restored controller may ask for another decision.
 * @param {object} options Validated checkpoint, restored state session, workspace, and current compatibility.
 * @returns {Promise<object>} Eligibility and safe continuation decision.
 */
async function recoverAgentCheckpoint(options = {}) {
  const checkpoint = options.checkpoint;
  const session = options.stateSession;
  if (!checkpoint || !session) throw new Error("Agent recovery requires a checkpoint and restored state session.");
  let decision = evaluateCheckpointContinuation(checkpoint, options.currentCompatibility || {}, options.requiredObservations || []);
  session.applyControllerEvent("run_restored", {
    checkpointId: checkpoint.checkpointId,
    phase: checkpoint.phase,
    stateVersion: checkpoint.cursor?.stateVersion,
    recoveryDecision: decision.continuation,
    reasonCode: decision.reasonCodes[0] || "checkpoint-restored"
  });
  session.applyControllerEvent("recovery_started", {
    recoveryDecision: decision.continuation,
    reasonCode: decision.reasonCodes[0] || "recovery-started"
  });

  if (decision.continuation === "blocked") {
    session.applyControllerEvent("recovery_blocked", { reasonCode: decision.reasonCodes[0] || "incompatible-controller-policy" });
    await session.checkpoint("decision_ready", { nextRuntimeStep: "blocked", recoveryDecision: "blocked" });
    return decision;
  }

  if (decision.continuation === "user_confirmation") {
    const interaction = session.getState().pendingInteractions?.[0];
    if (interaction) session.applyControllerEvent("interaction_interrupted", { interactionId: interaction.interactionId });
    decision = {
      ...decision,
      continuation: "restart_decision",
      reasonCodes: [...decision.reasonCodes, "interaction-interrupted"]
    };
    session.applyControllerEvent("recovery_resumed", { recoveryDecision: "restart_decision", reasonCode: "interaction-interrupted" });
    await session.checkpoint("decision_ready", { interactionId: interaction?.interactionId || "", nextRuntimeStep: "refresh_interaction" });
    return decision;
  }

  if (decision.continuation === "reconcile") {
    const action = session.getState().activeActions?.[0];
    if (!action) {
      decision = { ...decision, continuation: "restart_decision", reasonCodes: [...decision.reasonCodes, "prepared-action-missing"] };
    } else {
      session.applyControllerEvent("action_reconciliation_started", { actionId: action.actionId, reasonCode: "restart-reconciliation" });
      const reconciliation = await reconcilePreparedAction(options.workspaceRoot, action);
      if (reconciliation.outcome === "reconciled") {
        session.applyControllerEvent("action_reconciled", { actionId: action.actionId, reasonCode: reconciliation.reasonCode, summary: "Recovered action postcondition is present." });
        decision = { ...decision, continuation: "resume", reconciliation };
      } else if (reconciliation.outcome === "restart_decision") {
        session.applyControllerEvent("action_marked_indeterminate", { actionId: action.actionId, reasonCode: reconciliation.reasonCode, summary: "Interrupted action requires a fresh decision." });
        decision = { ...decision, continuation: "restart_decision", reconciliation };
      } else {
        session.applyControllerEvent("action_marked_indeterminate", { actionId: action.actionId, reasonCode: reconciliation.reasonCode, summary: "Interrupted action outcome is indeterminate." });
        decision = { ...decision, continuation: reconciliation.outcome === "blocked" ? "blocked" : "user_confirmation", reconciliation };
      }
    }
  }

  if (checkpoint.phase === "verification_pending") {
    session.applyControllerEvent("verification_interrupted", { verificationId: checkpoint.continuation?.verificationId || "" });
    decision = { ...decision, continuation: "restart_decision", reasonCodes: [...decision.reasonCodes, "verification-interrupted"] };
  }
  if (decision.continuation === "repair_terminal_projection") return decision;
  if (decision.continuation === "blocked") session.applyControllerEvent("recovery_blocked", { reasonCode: decision.reasonCodes.slice(-1)[0] || "recovery-blocked" });
  else session.applyControllerEvent("recovery_resumed", {
    recoveryDecision: decision.continuation,
    reconciliationOutcome: decision.reconciliation?.outcome || "",
    reasonCode: decision.reasonCodes.slice(-1)[0] || "recovery-resumed"
  });
  await session.checkpoint(decision.continuation === "user_confirmation" ? "interaction_pending" : "decision_ready", {
    nextRuntimeStep: decision.continuation,
    recoveryDecision: decision.continuation
  });
  return decision;
}

module.exports = {
  recoverAgentCheckpoint
};
