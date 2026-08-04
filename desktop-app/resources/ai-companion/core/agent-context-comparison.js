/**
 * Content-free coverage comparison between legacy and state-built Agent contexts.
 */

"use strict";

function messageTextLength(message) {
  if (typeof message?.content === "string") return message.content.length;
  if (!Array.isArray(message?.content)) return 0;
  return message.content.reduce((total, part) => total + (part?.type === "text" ? String(part.text || "").length : 0), 0);
}

function estimateMessageTokens(messages) {
  const chars = (Array.isArray(messages) ? messages : []).reduce((total, message) => total + messageTextLength(message), 0);
  return Math.ceil(chars / 4);
}

function sourceWasRendered(manifest, sourceType, absentIsPreserved = true) {
  const candidates = (manifest?.sourceDecisions || []).filter((entry) => entry.sourceType === sourceType);
  return candidates.length === 0
    ? absentIsPreserved
    : candidates.every((entry) => Boolean(entry.renderedInSection) || entry.omissionReason === "duplicate-authoritative-source");
}

/**
 * Compare the exact legacy provider messages with a shadow ContextBundle.
 * @param {object[]} legacyMessages Messages that will be sent to the provider.
 * @param {object} contextBundle State-built shadow context.
 * @returns {object} Content-free size and authoritative-source coverage metrics.
 */
function compareAgentContexts(legacyMessages, contextBundle) {
  const legacyEstimatedTokens = estimateMessageTokens(legacyMessages);
  const stateContextEstimatedTokens = Number(contextBundle?.manifest?.estimatedTokens) || 0;
  const observationsIncluded = contextBundle?.manifest?.includedObservationIds?.length || 0;
  const observationsOmitted = Number(contextBundle?.manifest?.omittedCounts?.observations) || 0;
  return {
    legacyEstimatedTokens,
    stateContextEstimatedTokens,
    reductionRatio: legacyEstimatedTokens > 0
      ? (legacyEstimatedTokens - stateContextEstimatedTokens) / legacyEstimatedTokens
      : null,
    observationsIncluded,
    observationsOmitted,
    requiredSourcesMissing: [...(contextBundle?.manifest?.requiredSourcesMissing || [])],
    currentPromptPreserved: sourceWasRendered(contextBundle?.manifest, "current-prompt", false),
    intentContractPreserved: sourceWasRendered(contextBundle?.manifest, "intent-contract", false),
    userInstructionsPreserved: sourceWasRendered(contextBundle?.manifest, "user-instruction"),
    liveBufferPreserved: sourceWasRendered(contextBundle?.manifest, "active-file")
  };
}

module.exports = {
  compareAgentContexts,
  estimateMessageTokens
};
