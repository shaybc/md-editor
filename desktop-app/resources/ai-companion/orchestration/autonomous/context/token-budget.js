/** Model-aware token estimation and context-limit resolution for autonomous runs. */

"use strict";

const { resolveModelInfo } = require("../../../config/model-registry");

const SUMMARY_OUTPUT_RESERVE = 20000;
const MINIMUM_SAFETY_BUFFER = 13000;
const MAXIMUM_SAFETY_BUFFER = 30000;

/** Conservatively estimate provider tokens without depending on one tokenizer. */
function estimateTokens(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value || "");
  return Math.ceil(text.length / 3);
}

/** Estimate the complete message list while honoring the latest provider usage. */
function estimateMessageTokens(messages, reportedTokens = 0) {
  const local = (messages || []).reduce((total, message) => total + estimateTokens({
    role: message?.role,
    content: message?.content,
    tool_calls: message?.tool_calls
  }), 0);
  return Math.max(local, Number(reportedTokens) || 0);
}

/** Resolve context limits from request metadata and the shared model registry. */
function resolveContextLimits(request = {}) {
  const configured = request.modelLimits && typeof request.modelLimits === "object" ? request.modelLimits : {};
  const registered = resolveModelInfo(request.settings?.model) || {};
  const contextWindow = positiveInteger(configured.contextWindow) || positiveInteger(registered.contextWindow);
  const knownOutput = positiveInteger(configured.maxOutputTokens)
    || positiveInteger(registered.maxOutputTokens)
    || positiveInteger(request.settings?.agentMaxResponseTokens);
  if (!contextWindow) {
    return {
      known: false,
      characterLimit: positiveInteger(request.autonomousContextCharacters) || 120000,
      contextWindow: 0,
      outputReserve: 0,
      renewalThreshold: 0
    };
  }
  const outputReserve = Math.min(SUMMARY_OUTPUT_RESERVE, knownOutput || Math.max(2000, Math.floor(contextWindow * 0.2)));
  const effectiveWindow = Math.max(outputReserve + MINIMUM_SAFETY_BUFFER, contextWindow - outputReserve);
  const safetyBuffer = Math.min(
    MAXIMUM_SAFETY_BUFFER,
    Math.max(MINIMUM_SAFETY_BUFFER, effectiveWindow - MAXIMUM_SAFETY_BUFFER)
  );
  return {
    known: true,
    contextWindow,
    maxOutputTokens: knownOutput,
    outputReserve,
    safetyBuffer,
    renewalThreshold: Math.max(1, effectiveWindow - safetyBuffer)
  };
}

function positiveInteger(value) {
  const number = Math.floor(Number(value) || 0);
  return number > 0 ? number : 0;
}

module.exports = {
  MAXIMUM_SAFETY_BUFFER,
  MINIMUM_SAFETY_BUFFER,
  SUMMARY_OUTPUT_RESERVE,
  estimateMessageTokens,
  estimateTokens,
  resolveContextLimits
};
