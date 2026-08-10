/** Correlates durable user decisions with their original transcript tool calls. */

"use strict";

/** Resolve the tool-call identity owned by a saved foreground interaction. */
function resolveInteractionToolCallId(snapshot, messages = [], pendingTools = []) {
  const explicit = String(snapshot?.pending?.toolCallId || "").trim();
  if (explicit) return explicit;
  const pendingIds = new Set((Array.isArray(pendingTools) ? pendingTools : [])
    .filter((entry) => entry?.name === "request_user_choice" && entry?.id)
    .map((entry) => String(entry.id)));
  const resultIds = new Set((Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role === "tool" && message?.tool_call_id)
    .map((message) => String(message.tool_call_id)));
  const candidates = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    for (const call of message?.tool_calls || []) {
      if (String(call?.function?.name || "") !== "request_user_choice" || resultIds.has(String(call.id))) continue;
      if (!pendingIds.size || pendingIds.has(String(call.id))) candidates.push(String(call.id));
    }
  }
  return candidates.length === 1 ? candidates[0] : "";
}

/** Return whether the transcript already contains the interaction's tool result. */
function hasInteractionToolResult(messages, toolCallId) {
  const id = String(toolCallId || "");
  return Boolean(id) && (Array.isArray(messages) ? messages : []).some((message) => message?.role === "tool" && String(message.tool_call_id || "") === id);
}


/** Insert a restored result beside its assistant tool call and existing sibling results. */
function insertInteractionToolResult(messages, toolMessage) {
  const callId = String(toolMessage?.tool_call_id || "");
  const assistantIndex = (Array.isArray(messages) ? messages : []).findIndex((message) => (message?.tool_calls || []).some((call) => String(call?.id || "") === callId));
  if (assistantIndex < 0) return false;
  let insertionIndex = assistantIndex + 1;
  while (messages[insertionIndex]?.role === "tool") insertionIndex += 1;
  messages.splice(insertionIndex, 0, toolMessage);
  return true;
}
module.exports = { hasInteractionToolResult, insertInteractionToolResult, resolveInteractionToolCallId };
