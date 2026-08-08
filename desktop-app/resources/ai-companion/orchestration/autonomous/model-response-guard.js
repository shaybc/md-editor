/** Provider-neutral validation for structurally unusable model responses. */

"use strict";

const MALFORMED_TOOL_REASONS = new Set(["malformed_function_call", "invalid_function_call", "malformed_tool_call", "invalid_tool_call"]);

/** Describe a response that cannot safely advance the autonomous conversation. */
function findModelResponseIssue(response = {}) {
  const finishReason = String(response.finishReason || "").trim();
  const normalizedReason = finishReason.toLowerCase();
  const hasToolCalls = Array.isArray(response.toolCalls) && response.toolCalls.length > 0;
  const hasContent = Boolean(String(response.content || "").trim());

  if (MALFORMED_TOOL_REASONS.has(normalizedReason)) {
    return {
      code: "malformed-tool-call",
      finishReason,
      summary: String(response.finishMessage || "The provider rejected a malformed tool call.").trim()
    };
  }
  if (!hasToolCalls && !hasContent) {
    return {
      code: "empty-model-response",
      finishReason: finishReason || "unknown",
      summary: "The model returned neither final text nor a usable tool call."
    };
  }
  return null;
}

/** Build one bounded correction that leaves the next action under model control. */
function buildModelResponseCorrection(issue) {
  if (issue?.code === "malformed-tool-call") {
    return "Your previous response was rejected by the provider because its tool call was malformed. Choose the next action again. If using a tool, send one valid native tool call that matches its declared schema; otherwise return a non-empty final response.";
  }
  return "Your previous response contained neither final text nor a usable tool call. Choose the next action again and return either a valid tool call or a non-empty final response.";
}

module.exports = { buildModelResponseCorrection, findModelResponseIssue };
