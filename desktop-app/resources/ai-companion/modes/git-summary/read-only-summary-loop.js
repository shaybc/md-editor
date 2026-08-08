/** Bounded model-directed loop for the retained read-only Git summary feature. */

"use strict";

const { createProviderDebugEmitter } = require("../../core/provider-debug");
const { getToolDefinitions } = require("../../orchestration/autonomous/tool-catalog");
const { executeTool } = require("../../orchestration/autonomous/tool-executor");
const { assistantMessage } = require("../../orchestration/autonomous/autonomous-loop");
const { buildModelResponseCorrection, findModelResponseIssue } = require("../../orchestration/autonomous/model-response-guard");

const READ_ONLY_TOOL_NAMES = new Set(["list_files", "glob_files", "search_text", "read_file"]);

function readOnlyTools() {
  return getToolDefinitions({
    allowWrites: false,
    allowCommands: false,
    allowDelegation: false,
    allowPlanReads: false,
    allowPlanWrites: false
  }).filter((entry) => READ_ONLY_TOOL_NAMES.has(entry.function.name));
}

async function runReadOnlySummaryLoop(provider, request, systemPrompt, userPrompt, emit, maxTokens) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];
  const tools = readOnlyTools();
  let corrections = 0;
  for (let round = 1; round <= 8; round++) {
    const response = await provider.completeMessage(messages, {
      tools,
      toolChoice: "auto",
      temperature: 0.2,
      maxTokens,
      signal: request.signal,
      onDebug: createProviderDebugEmitter(emit),
      onToken: (content) => emit({ type: "content-delta", content })
    });
    const issue = findModelResponseIssue(response);
    if (issue) {
      if (++corrections > 1) throw new Error("The model returned an unusable Git summary response twice (" + issue.code + ").");
      messages.push({ role: "system", content: buildModelResponseCorrection(issue) });
      continue;
    }
    corrections = 0;
    messages.push(assistantMessage(response));
    if (!response.toolCalls?.length) return String(response.content || "").trim();
    const results = await Promise.all(response.toolCalls.map(async (call) => {
      const name = String(call?.function?.name || "");
      if (!READ_ONLY_TOOL_NAMES.has(name)) throw new Error("Git summary cannot use tool: " + name);
      emit({ type: "tool-started", tool: name, callId: call.id, round });
      try {
        const result = await executeTool(call, { request, windowSteward: null });
        emit({ type: "tool-completed", tool: name, callId: call.id, result });
        return { role: "tool", tool_call_id: call.id, content: JSON.stringify(result) };
      } catch (error) {
        const message = error?.message || String(error);
        emit({ type: "tool-failed", tool: name, callId: call.id, error: message });
        return { role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: message }) };
      }
    }));
    messages.push(...results);
  }
  throw new Error("Git summary reached its structural limit of 8 model rounds.");
}

module.exports = { READ_ONLY_TOOL_NAMES, readOnlyTools, runReadOnlySummaryLoop };
