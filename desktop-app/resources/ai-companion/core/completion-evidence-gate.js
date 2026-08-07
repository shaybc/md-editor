/**
 * Completion evidence gate (controller-side tool-use enforcement).
 *
 * The typed controller normally forces a tool call each round via tool_choice
 * "required". Some providers (e.g. Gemini's OpenAI-compat endpoint) do not support
 * forced tool calls, so a weak model can propose completion immediately without doing
 * the inspection the task requires. This gate makes tool use a requirement of the
 * *contract*, not the transport: if the task's acceptance criteria require evidence but
 * the run gathered none, a proposed completion is rejected and the run is steered to
 * inspect before answering.
 *
 * Provider-agnostic and deterministic. Pure: no IO, no side effects.
 */

"use strict";

// Task types that inherently require workspace evidence before a truthful completion.
const EVIDENCE_REQUIRING_TASK_TYPES = new Set(["diagnostic", "conformance", "implementation"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Whether the intent contract requires the run to gather evidence (inspect the
 * workspace) before completing. True when the task type inherently needs inspection,
 * or any acceptance criterion names a `mustInspect` target.
 *
 * @param {object} contract - Normalized intent contract (may be null).
 * @returns {boolean}
 */
function requiresEvidence(contract) {
  if (!isPlainObject(contract)) return false;
  if (EVIDENCE_REQUIRING_TASK_TYPES.has(String(contract.taskType))) return true;
  const criteria = Array.isArray(contract.acceptanceCriteria) ? contract.acceptanceCriteria : [];
  return criteria.some((criterion) => Array.isArray(criterion?.mustInspect) && criterion.mustInspect.length > 0);
}

/**
 * Evaluate whether a proposed completion should be blocked for lack of evidence.
 *
 * @param {object} input
 * @param {object} input.contract - Intent contract.
 * @param {boolean} input.usedTools - Whether any tool ran during the task.
 * @param {number} [input.evidenceCount=0] - Count of gathered observations/evidence.
 * @param {boolean} [input.reportedBlocked=false] - A genuine blocker report is exempt.
 * @param {number} [input.retriesUsed=0] - How many times we've already steered for this.
 * @param {number} [input.maxRetries=2] - Cap on evidence-steering retries.
 * @returns {{ blocked: boolean, reasonCode: string, exhausted: boolean }}
 */
function evaluateCompletionEvidence(input = {}) {
  const needsEvidence = requiresEvidence(input.contract);
  const hasEvidence = input.usedTools === true || (Number(input.evidenceCount) || 0) > 0;
  if (input.reportedBlocked === true || !needsEvidence || hasEvidence) {
    return { blocked: false, reasonCode: "", exhausted: false };
  }
  const retriesUsed = Number(input.retriesUsed) || 0;
  const maxRetries = Number.isFinite(input.maxRetries) ? input.maxRetries : 2;
  if (retriesUsed >= maxRetries) {
    // Give up steering after the budget: don't loop forever, but flag it so the
    // completion is reported honestly as unverified rather than silently accepted.
    return { blocked: false, reasonCode: "evidence_required_but_unmet", exhausted: true };
  }
  return { blocked: true, reasonCode: "completion_requires_evidence", exhausted: false };
}

/**
 * Build the steering message that tells the model to inspect before answering.
 *
 * @param {object} contract - Intent contract (used to name required inspections).
 * @returns {string}
 */
function buildEvidenceSteeringMessage(contract) {
  const inspections = [];
  const criteria = isPlainObject(contract) && Array.isArray(contract.acceptanceCriteria) ? contract.acceptanceCriteria : [];
  for (const criterion of criteria) {
    for (const target of (Array.isArray(criterion?.mustInspect) ? criterion.mustInspect : [])) {
      if (target && !inspections.includes(target)) inspections.push(target);
    }
  }
  const targetText = inspections.length ? ` Inspect: ${inspections.slice(0, 10).join(", ")}.` : "";
  return `Do not answer yet. This task requires inspecting the workspace with tools before you can truthfully report a result — you have not called any inspection tool.${targetText} Call the appropriate read tool(s) first, then propose completion based on what you actually observed.`;
}

module.exports = {
  EVIDENCE_REQUIRING_TASK_TYPES,
  requiresEvidence,
  evaluateCompletionEvidence,
  buildEvidenceSteeringMessage
};
