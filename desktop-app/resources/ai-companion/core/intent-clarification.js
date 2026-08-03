/**
 * Pre-work clarification orchestration: selects the open blocking ambiguities worth
 * asking under the clarification preference, asks them (at most three) through a
 * caller-supplied requestClarification channel, and applies the answers back onto the
 * contract as clarified resolutions.
 *
 * The preference governs behavior:
 * - ask: ask the top blocking ambiguities.
 * - assume: proceed on visible assumptions; ask only safety/scope-critical ones.
 * - off: never ask; unresolved blocking ambiguities remain visible in the contract.
 *
 * This module performs no IO itself -- it awaits the requestClarification callback the
 * bridge provides. The loop sends collected answers through the isolated contract
 * refresh stage before accepting them as authoritative contract changes.
 */

"use strict";

/** Impact ranking used to prioritize which ambiguities to ask first. */
const IMPACT_RANK = Object.freeze({ high: 3, medium: 2, low: 1 });

/** Maximum blocking ambiguities asked in one pre-work batch. */
const MAX_CLARIFICATIONS = 3;

/**
 * Open blocking ambiguities of a contract, highest-impact first.
 *
 * @param {object} contract - The active intent contract.
 * @returns {object[]} Open blocking ambiguities sorted by impact.
 */
function openBlockingAmbiguities(contract) {
  return (contract && Array.isArray(contract.ambiguities) ? contract.ambiguities : [])
    .filter((ambiguity) => ambiguity && ambiguity.blocking === true && ambiguity.status !== "resolved")
    .sort((left, right) => (IMPACT_RANK[right.impact] || 0) - (IMPACT_RANK[left.impact] || 0));
}

/**
 * Partition open blocking ambiguities into those to ask and those to assume, per the
 * clarification preference.
 *
 * @param {object} contract - The active contract.
 * @param {object} settings - Normalized settings (uses intentClarificationMode).
 * @returns {{ toAsk: object[], toAssume: object[] }} The partition.
 */
function selectAmbiguities(contract, settings) {
  const mode = (settings && settings.intentClarificationMode) || "assume";
  const blocking = openBlockingAmbiguities(contract);
  if (mode === "off") return { toAsk: [], toAssume: [] };
  if (mode === "assume") {
    return {
      toAsk: blocking.filter((ambiguity) => ambiguity.safetyOrScopeCritical === true).slice(0, MAX_CLARIFICATIONS),
      toAssume: blocking.filter((ambiguity) => ambiguity.safetyOrScopeCritical !== true)
    };
  }
  return { toAsk: blocking.slice(0, MAX_CLARIFICATIONS), toAssume: [] };
}

/**
 * Apply clarification answers and assume-mode assumptions onto a contract, returning a
 * new contract. Answered ambiguities are marked resolved with a user resolution;
 * assumed ambiguities gain a corresponding visible assumption.
 *
 * @param {object} contract - The active contract.
 * @param {Array<{ ambiguityId: string, question: string, answer: string }>} clarifications - Collected answers.
 * @param {object[]} assumed - Ambiguities converted to assumptions.
 * @returns {object} The updated contract.
 */
function applyClarifications(contract, clarifications, assumed) {
  const answeredById = new Map(clarifications.map((entry) => [entry.ambiguityId, entry]));
  const ambiguities = (contract.ambiguities || []).map((ambiguity) => {
    const answer = answeredById.get(ambiguity.id);
    if (!answer) return ambiguity;
    return { ...ambiguity, status: "resolved", resolution: { source: "user", answer: answer.answer, evidenceIds: [] } };
  });
  const assumptions = [...(contract.assumptions || [])];
  for (const ambiguity of (assumed || [])) {
    assumptions.push({
      id: `A-${ambiguity.id}`,
      statement: `Proceeding on a conservative assumption for: ${ambiguity.question}`,
      kind: "behavioral",
      risk: "medium",
      provenance: "inferred",
      relatedTargets: [],
      keywords: []
    });
  }
  return {
    ...contract,
    ambiguities,
    assumptions,
    clarifications: [...(contract.clarifications || []), ...clarifications]
  };
}

/**
 * Extract a plain answer string from a requestClarification result, which may be a bare
 * string or an object carrying an `answer` field.
 *
 * @param {string|object} value - The clarification response.
 * @returns {string} The trimmed answer text.
 */
function toAnswerText(value) {
  const text = typeof value === "string" ? value : (value && value.answer) || "";
  return String(text || "").trim();
}

/**
 * Run one pre-work clarification batch for a Chat or Agent request. Asks the selected
 * blocking ambiguities in sequence through requestClarification and applies the answers.
 *
 * @param {object} params - Batch inputs.
 * @param {object} params.contract - The active contract.
 * @param {Function} params.requestClarification - async ({ ambiguityId, question, ... }) => answer.
 * @param {string} params.mode - Request mode (chat/agent pre-work; Plan only at finalization).
 * @param {string} [params.phase] - Set to plan-finalization for the one Plan gate batch.
 * @param {object} params.settings - Normalized settings.
 * @param {AbortSignal} [params.signal] - Cancellation signal.
 * @returns {Promise<{ contract: object, clarifications: object[] }>} Updated contract and answers.
 */
async function runClarificationBatch(params) {
  const { contract, requestClarification, mode, phase, settings, signal } = params;
  if (typeof requestClarification !== "function") return { contract, clarifications: [] };
  const isPlanFinalization = mode === "plan" && phase === "plan-finalization";
  if (mode !== "chat" && mode !== "agent" && !isPlanFinalization) return { contract, clarifications: [] };

  const { toAsk, toAssume } = selectAmbiguities(contract, settings);
  if (!toAsk.length && !toAssume.length) return { contract, clarifications: [] };

  const clarifications = [];
  for (const ambiguity of toAsk) {
    if (signal && signal.aborted) break;
    const answer = await requestClarification({
      ambiguityId: ambiguity.id,
      question: ambiguity.question,
      reason: ambiguity.reason,
      answerType: (ambiguity.suggestedAnswers && ambiguity.suggestedAnswers.length) ? "single_choice" : "free_text",
      choices: ambiguity.suggestedAnswers || []
    });
    const answerText = toAnswerText(answer);
    if (answerText) clarifications.push({ ambiguityId: ambiguity.id, question: ambiguity.question, answer: answerText });
  }

  return {
    contract: applyClarifications(contract, clarifications, toAssume),
    clarifications,
    assumedCount: toAssume.length,
    changed: clarifications.length > 0 || toAssume.length > 0
  };
}

module.exports = {
  MAX_CLARIFICATIONS,
  openBlockingAmbiguities,
  selectAmbiguities,
  applyClarifications,
  runClarificationBatch
};
