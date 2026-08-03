/**
 * Approval-instruction amendments: when a user rejects an approval with alternative
 * instructions, that instruction is user-authoritative and amends the intent contract.
 *
 * Success path: an isolated capture_intent_contract refresh incorporates the verbatim
 * instruction (which may change goal, criteria, prohibitions, or scope), the refreshed
 * contract is validated and returned with an applied amendment record.
 *
 * Failure path (refresh unavailable or invalid): the instruction is never silently
 * dropped -- it is preserved as an unapplied amendment and a controlling decision is
 * added, scoped to the rejected resource when known or otherwise to its capability
 * (blocking all mutations only when no safe scope can be derived).
 *
 * Amendments outrank discovery revision and are not counted against the revision budget.
 * This module performs the refresh provider call but no workspace mutation.
 */

"use strict";

const { refreshContractFromUserContext } = require("./intent-analysis");
const toolEffects = require("./agent-tool-effect-registry");
const correctionConsistency = require("./intent-correction-consistency");
const MAX_PERSISTED_APPROVAL_INSTRUCTION_CHARS = 4000;

/** Allocate the next amendment id for a contract. */
function nextAmendmentId(contract) {
  return `AM${(contract.amendments || []).length + 1}`;
}

/**
 * Preserve the normalized approval instruction and rejected mutation identity.
 * @param {string} instructions - User-authored approval instruction.
 * @param {string} toolName - Rejected tool name.
 * @param {object} args - Rejected tool arguments.
 * @returns {{instruction:string,tool:string,capability:string,resource:string}} Recovery metadata.
 */
function createRecoveryMetadata(instructions, toolName, args) {
  const description = toolEffects.describeToolEffect(toolName, args);
  return {
    instruction: String(instructions || "").trim().slice(0, MAX_PERSISTED_APPROVAL_INSTRUCTION_CHARS),
    tool: String(toolName || ""),
    capability: String(description?.capability || ""),
    resource: String(description?.resource || "")
  };
}

/**
 * Return approval amendments that still require authoritative contract recovery.
 * @param {object} contract - Persisted intent contract.
 * @returns {object[]} Unapplied approval amendments in contract order.
 */
function getUnappliedApprovalAmendments(contract) {
  return (Array.isArray(contract?.amendments) ? contract.amendments : [])
    .filter((amendment) => amendment?.source === "approval-instruction" && amendment.applied === false);
}

/**
 * Add a controlling decision scoped to the rejected tool, preserving the instruction as
 * an unapplied amendment. When no capability or resource can be derived, the decision
 * has no scope and therefore blocks all mutations, conservatively.
 *
 * @param {object} contract - The current contract.
 * @param {object} params - { instructions, toolName, args, toolCallId, amendmentId }.
 * @returns {object} The contract with the block and unapplied amendment.
 */
function applyScopedBlock(contract, params) {
  const { instructions, toolName, args, toolCallId, amendmentId } = params;
  const description = toolEffects.describeToolEffect(toolName, args);
  const capability = description ? description.capability : "";
  const resource = description ? description.resource : "";
  const decision = {
    id: `D-${amendmentId}`,
    description: `Unapplied user instruction: ${String(instructions).slice(0, 160)}`,
    blocking: true,
    controlsMutation: true,
    controlledCapabilities: !resource && capability ? [capability] : [],
    controlledTargets: resource ? [resource] : []
  };
  const amendment = {
    id: amendmentId,
    source: "approval-instruction",
    provenance: "clarified",
    summary: String(instructions).slice(0, 200),
    changedFields: [`decision:${decision.id}`],
    toolCallId: toolCallId || "",
    rejectedToolCallId: toolCallId || "",
    ...createRecoveryMetadata(instructions, toolName, args),
    applied: false,
    diagnostics: Array.isArray(params.diagnostics) ? params.diagnostics.slice(-2) : []
  };
  return {
    ...contract,
    unresolvedDecisions: [...(contract.unresolvedDecisions || []), decision],
    amendments: [...(contract.amendments || []), amendment]
  };
}

/**
 * Apply an approval-instruction amendment to a contract, returning the updated contract.
 *
 * @param {object} params - Amendment inputs.
 * @param {object} params.provider - Provider exposing completeMessage.
 * @param {object} params.settings - Normalized settings.
 * @param {object} params.prompts - Loaded prompts.
 * @param {object} params.contract - The active contract.
 * @param {string} params.instructions - The verbatim user instruction.
 * @param {string} params.toolName - The rejected tool.
 * @param {object} params.args - The rejected tool's arguments.
 * @param {string} params.toolCallId - The rejected tool call id.
 * @param {AbortSignal} [params.signal] - Cancellation signal.
 * @returns {Promise<{contract:object,state:string,applied:boolean,amendmentId:string,diagnostics:object[]}>} Outcome.
 */
async function applyApprovalAmendment(params) {
  const { provider, settings, prompts, contract, instructions, toolName, args, toolCallId, signal } = params;
  const amendmentId = nextAmendmentId(contract);
  const diagnostics = [];
  let refresh = await refreshContractFromUserContext({
    provider,
    settings,
    prompts,
    contract,
    userContext: `Approval instruction for ${toolName}: ${instructions}`,
    signal,
    attempt: 1
  });
  diagnostics.push(...(refresh.diagnostics || []));
  if (!refresh.contract || !refresh.validation.valid) {
    refresh = await refreshContractFromUserContext({
      provider,
      settings,
      prompts,
      contract,
      userContext: `Approval instruction for ${toolName}: ${instructions}`,
      signal,
      attempt: 2,
      repairErrors: refresh.validation?.errors || []
    });
    diagnostics.push(...(refresh.diagnostics || []));
  }
  if (refresh.contract && refresh.validation.valid) {
    const refreshed = refresh.contract;
    const recoveryMetadata = createRecoveryMetadata(instructions, toolName, args);
    const referenceReplacements = correctionConsistency.deriveReferenceReplacements({
      priorContract: contract,
      refreshedContract: refreshed,
      correctedFieldRefs: refreshed.correctedFieldRefs,
      rejectedResource: recoveryMetadata.resource,
      sourceToolCallId: toolCallId
    });
    refreshed.amendments = [...(contract.amendments || []), {
      id: amendmentId,
      source: "approval-instruction",
      provenance: "clarified",
      summary: String(instructions).slice(0, 200),
      changedFields: Array.isArray(refreshed.correctedFieldRefs) ? refreshed.correctedFieldRefs.slice(0, 40) : [],
      toolCallId: toolCallId || "",
      rejectedToolCallId: toolCallId || "",
      ...recoveryMetadata,
      referenceReplacements,
      applied: true,
      diagnostics
    }];
    return { contract: refreshed, state: "applied", applied: true, amendmentId, diagnostics };
  }
  return {
    contract: applyScopedBlock(contract, { instructions, toolName, args, toolCallId, amendmentId, diagnostics }),
    state: "blocked",
    applied: false,
    amendmentId,
    diagnostics
  };
}

/**
 * Recover unapplied approval instructions when a genuine interrupted run resumes.
 * @param {object} params - Provider, settings, prompts, contract, and signal.
 * @returns {Promise<{contract:object,state:string,applied:boolean,diagnostics:object[]}>} Recovery outcome.
 */
async function recoverUnappliedApprovalAmendments(params) {
  const pending = getUnappliedApprovalAmendments(params.contract);
  if (!pending.length) return { contract: params.contract, state: "clean", applied: true, diagnostics: [] };
  const userContext = pending.map((amendment) => [
    `Pending approval instruction ${amendment.id}:`,
    String(amendment.instruction || amendment.summary || "").trim()
  ].join(" ")).join("\n");
  const diagnostics = [];
  let refresh = await refreshContractFromUserContext({
    provider: params.provider,
    settings: params.settings,
    prompts: params.prompts,
    contract: params.contract,
    userContext,
    signal: params.signal,
    attempt: 1
  });
  diagnostics.push(...(refresh.diagnostics || []));
  if (!refresh.contract || !refresh.validation.valid) {
    refresh = await refreshContractFromUserContext({
      provider: params.provider,
      settings: params.settings,
      prompts: params.prompts,
      contract: params.contract,
      userContext,
      signal: params.signal,
      attempt: 2,
      repairErrors: refresh.validation?.errors || []
    });
    diagnostics.push(...(refresh.diagnostics || []));
  }
  if (!refresh.contract || !refresh.validation.valid) {
    return { contract: params.contract, state: "blocked", applied: false, diagnostics };
  }
  const pendingIds = new Set(pending.map((amendment) => amendment.id));
  const decisionIds = new Set(pending.map((amendment) => `D-${amendment.id}`));
  const changedFields = Array.isArray(refresh.contract.correctedFieldRefs)
    ? refresh.contract.correctedFieldRefs.slice(0, 40)
    : [];
  return {
    contract: {
      ...refresh.contract,
      amendments: (params.contract.amendments || []).map((amendment) => pendingIds.has(amendment.id)
        ? {
          ...amendment,
          applied: true,
          changedFields,
          referenceReplacements: correctionConsistency.deriveReferenceReplacements({
            priorContract: params.contract,
            refreshedContract: refresh.contract,
            correctedFieldRefs: refresh.contract.correctedFieldRefs,
            rejectedResource: amendment.resource,
            sourceToolCallId: amendment.rejectedToolCallId
          }),
          diagnostics,
          recoveredAt: new Date().toISOString()
        }
        : amendment),
      unresolvedDecisions: (refresh.contract.unresolvedDecisions || [])
        .filter((decision) => !decisionIds.has(decision?.id))
    },
    state: "applied",
    applied: true,
    diagnostics
  };
}

module.exports = {
  applyApprovalAmendment,
  applyScopedBlock,
  createRecoveryMetadata,
  getUnappliedApprovalAmendments,
  recoverUnappliedApprovalAmendments
};
