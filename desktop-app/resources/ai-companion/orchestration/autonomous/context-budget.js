/** Compatibility exports for the autonomous model-aware context services. */

"use strict";

const { estimateMessageTokens, estimateTokens, resolveContextLimits } = require("./context/token-budget");
const { WindowSteward } = require("./context/window-steward");

/** Preserve the former diagnostic unit for callers that only display characters. */
function estimateCharacters(messages) {
  return (messages || []).reduce((total, message) => total + String(message?.content || "").length + JSON.stringify(message?.tool_calls || []).length, 0);
}

module.exports = { WindowSteward, estimateCharacters, estimateMessageTokens, estimateTokens, resolveContextLimits };
