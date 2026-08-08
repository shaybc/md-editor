/** Model-directed observe/act loop with bounded structural recovery. */

"use strict";

const { EVENT_TYPES } = require("../shared/events");
const { createProviderDebugEmitter } = require("../../core/provider-debug");
const { buildRuleActivationMessage, serializeToolResult } = require("./context-builder");
const { executeTool } = require("./tool-executor");
const { isContextOverflowError } = require("./context/window-steward");
const { buildModelResponseCorrection, findModelResponseIssue } = require("./model-response-guard");

function assistantMessage(response) {
  const message = { role: "assistant", content: String(response.content || "") };
  if (response.toolCalls?.length) message.tool_calls = response.toolCalls.map((call) => call.raw || call);
  return message;
}

/** Run until natural text completion, cancellation, or a structural hard limit. */
async function runAutonomousLoop(input) {
  const { provider, messages, tools, getTools, request, events, context } = input;
  const maxRounds = Math.max(1, Math.min(Number(request.autonomousMaxRounds || 40), 100));
  let consecutiveFailures = 0;
  let consecutiveRejectedResponses = 0;
  for (let round = 1; round <= maxRounds; round++) {
    context.currentRound = round;
    context.messages = messages;
    const activatedRules = context.ruleCatalog?.consumeActivated?.() || [];
    const ruleMessage = buildRuleActivationMessage(activatedRules);
    if (ruleMessage) messages.push({ role: "system", content: ruleMessage });
    const workerNotifications = context.workers?.drainNotifications?.() || [];
    if (workerNotifications.length) messages.push({ role: "system", content: `Worker updates:\n${JSON.stringify(workerNotifications)}` });
    if (request.signal?.aborted) throw Object.assign(new Error("AI Companion request cancelled."), { name: "AbortError" });

    const catalogNotice = context.capabilities?.consumeCatalogNotice?.();
    if (catalogNotice) {
      messages.push({ role: "system", content: catalogNotice });
      events.emit({ type: "tool-catalog-updated", ...context.capabilities.metrics(), summary: "Deferred tool catalog made available to the model." });
    }
    const currentTools = typeof getTools === "function" ? getTools() : tools;
    context.currentToolDefinitions = currentTools;
    context.observationLedger?.refresh?.(messages, { currentRound: round });
    const prepared = await context.windowSteward.prepare(messages, context);
    const releaseReminder = context.contextReleaseReminder?.consider?.(context.observationLedger.summary(), { round, renewed: prepared.renewed });
    if (releaseReminder) messages.push({ role: "system", content: releaseReminder });
    await context.saveSnapshot?.("running", { round, boundary: "before-model" });
    const beforeModel = await context.hooks?.run("before-model", { round });
    for (const additionalContext of beforeModel?.additionalContext || []) messages.push({ role: "system", content: `Lifecycle context:\n${additionalContext}` });
    const response = await completeWithOverflowRecovery(provider, messages, {
      tools: currentTools,
      toolChoice: currentTools.length ? "auto" : undefined,
      temperature: 0.2,
      maxTokens: request.settings.agentMaxResponseTokens || undefined,
      signal: request.signal,
      onDebug: createProviderDebugEmitter(events.emit),
      onUsage: (usage) => {
        context.windowSteward.recordUsage(usage);
        events.emit({ type: "usage", ...usage, reported: true });
      }
    }, context);
    await context.hooks?.run("after-model", { round, finishReason: response.finishReason, toolCount: response.toolCalls?.length || 0 });
    const responseIssue = findModelResponseIssue(response);
    if (responseIssue) {
      consecutiveRejectedResponses += 1;
      events.emit({ type: EVENT_TYPES.RECOVERY_WARNING, reason: responseIssue.code, summary: responseIssue.summary, finishReason: responseIssue.finishReason, round });
      await context.chronicle?.append?.("model-response-rejected", { round, ...responseIssue });
      if (consecutiveRejectedResponses > 1) {
        throw new Error(`The model returned an unusable response twice (${responseIssue.code}, finish reason: ${responseIssue.finishReason}).`);
      }
      messages.push({ role: "system", content: buildModelResponseCorrection(responseIssue) });
      await context.saveSnapshot?.("running", { round, boundary: "model-response-correction", responseIssue: responseIssue.code });
      continue;
    }
    consecutiveRejectedResponses = 0;
    const assistant = assistantMessage(response);
    messages.push(assistant);
    await context.chronicle?.append?.("assistant-message", { round, message: assistant });
    context.continuity?.scheduleUpdate?.(messages, {
      reportedTokens: context.windowSteward.reportedTokens,
      naturalStop: !response.toolCalls?.length
    });

    if (!response.toolCalls?.length) {
      if (context.workers?.hasActive?.()) {
        messages.push({ role: "system", content: "Background workers are still active. Wait for their results, send guidance, or stop them before completing." });
        await context.workers.waitForChange();
        continue;
      }
      await context.saveSnapshot?.("running", { round, boundary: "natural-completion" });
      return String(response.content || "").trim();
    }
    if (response.content) events.emit({ type: "narration", content: response.content });

    context.pendingTools = response.toolCalls.map((call) => ({ id: call.id, name: String(call?.function?.name || "tool"), startedAt: new Date().toISOString() }));
    await context.saveSnapshot?.("running", { round, boundary: "before-tools" });
    const results = await Promise.all(response.toolCalls.map(async (call) => {
      const name = String(call?.function?.name || "tool");
      events.emit({ type: EVENT_TYPES.TOOL_STARTED, tool: name, callId: call.id, round });
      await context.chronicle?.append?.("tool-started", { round, tool: name, callId: call.id });
      try {
        const beforeTool = await context.hooks?.run("before-tool", { tool: name, call });
        for (const additionalContext of beforeTool?.additionalContext || []) messages.push({ role: "system", content: `Tool lifecycle context:\n${additionalContext}` });
        const registration = context.capabilities?.registration?.(name);
        await context.rulePathObserver?.beforeTool?.(name, parseToolArguments(call), registration);
        const result = await executeTool(call, context);
        await context.rulePathObserver?.afterTool?.(name, parseToolArguments(call), result, registration);
        consecutiveFailures = 0;
        events.emit({ type: EVENT_TYPES.TOOL_COMPLETED, tool: name, callId: call.id, result });
        await context.hooks?.run("after-tool", { tool: name, call, result });
        await context.chronicle?.append?.("tool-completed", { round, tool: name, callId: call.id });
        const toolMessage = { role: "tool", tool_call_id: call.id, content: await serializeRuntimeToolResult(result, name, call.id, context) };
        context.observationLedger?.register?.(toolMessage, { tool: name, callId: call.id, round });
        return toolMessage;
      } catch (error) {
        consecutiveFailures += 1;
        const message = error?.message || String(error);
        events.emit({ type: EVENT_TYPES.TOOL_FAILED, tool: name, callId: call.id, error: message });
        await context.hooks?.run("tool-failure", { tool: name, call, error: message });
        await context.chronicle?.append?.("tool-failed", { round, tool: name, callId: call.id, error: message });
        const toolMessage = { role: "tool", tool_call_id: call.id, content: JSON.stringify({
          error: message,
          code: error?.code || undefined,
          retryable: error?.retryable === false ? false : consecutiveFailures < 3,
          doNotRetry: error?.doNotRetry === true
        }) };
        context.observationLedger?.register?.(toolMessage, { tool: name, callId: call.id, round });
        return toolMessage;
      }
    }));
    messages.push(...results);
    context.observationLedger?.refresh?.(messages, { currentRound: round });
    context.pendingTools = [];
    context.continuity?.scheduleUpdate?.(messages, { reportedTokens: context.windowSteward.reportedTokens });
    await context.saveSnapshot?.("running", { round, boundary: "after-tools" });
    if (consecutiveFailures >= 3) messages.push({ role: "system", content: "Tool attempts failed repeatedly. Change strategy or explain the blocker; do not repeat an unchanged call." });
  }
  throw new Error(`Autonomous runtime reached its structural limit of ${maxRounds} model rounds.`);
}

function parseToolArguments(call) {
  const value = call?.function?.arguments;
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch (_error) { return {}; }
}

async function completeWithOverflowRecovery(provider, messages, options, context) {
  try {
    return await provider.completeMessage(messages, options);
  } catch (error) {
    if (!isContextOverflowError(error)) throw error;
    const renewal = await context.windowSteward.prepare(messages, context, { force: true, trigger: "provider-overflow" });
    if (!renewal.renewed) throw error;
    await context.saveSnapshot?.("running", { boundary: "overflow-renewal" });
    return provider.completeMessage(messages, options);
  }
}

async function serializeRuntimeToolResult(result, tool, callId, context) {
  const raw = typeof result === "string" ? result : (JSON.stringify(result) ?? String(result ?? ""));
  if (raw.length <= 24000 || !context.artifactVault) return serializeToolResult(result);
  const artifact = await context.artifactVault.store(raw, { tool, callId });
  return context.artifactVault.reference(artifact);
}

module.exports = { assistantMessage, completeWithOverflowRecovery, runAutonomousLoop, serializeRuntimeToolResult };
