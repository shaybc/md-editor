/** Model-directed observe/act loop with bounded structural recovery. */

"use strict";

const { EVENT_TYPES } = require("../shared/events");
const { createProviderDebugEmitter } = require("../../core/provider-debug");
const { buildRuleActivationMessage, buildSkillActivationMessage, buildSkillDiscoveryMessage, buildWorkerUpdateMessage, serializeToolResult } = require("./context-builder");
const { executeTool } = require("./tool-executor");
const { validateToolInput } = require("./capabilities/tool-input-validator");
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
    for (const additionalContext of context.hooks?.drainContext?.() || []) messages.push({ role: "system", content: `Deferred lifecycle context:\n${additionalContext}` });
    const activatedRules = context.ruleCatalog?.consumeActivated?.() || [];
    const ruleMessage = buildRuleActivationMessage(activatedRules);
    if (ruleMessage) messages.push({ role: "system", content: ruleMessage });
    const skillMessage = buildSkillActivationMessage(context.skillCatalog?.consumeActivated?.() || []);
    if (skillMessage) messages.push({ role: "system", content: skillMessage });
    const skillDiscoveryMessage = buildSkillDiscoveryMessage(context.skillCatalog?.consumeDiscoveries?.() || []);
    if (skillDiscoveryMessage) messages.push({ role: "system", content: skillDiscoveryMessage });
    const workerNotifications = context.workers?.drainNotifications?.() || [];
    if (workerNotifications.length) messages.push({ role: "system", content: buildWorkerUpdateMessage(workerNotifications) });
    if (request.signal?.aborted) throw Object.assign(new Error("AI Companion request cancelled."), { name: "AbortError" });

    const catalogNotice = context.capabilities?.consumeCatalogNotice?.();
    if (catalogNotice) {
      messages.push({ role: "system", content: catalogNotice });
      events.emit({ type: "tool-catalog-updated", ...context.capabilities.metrics(), summary: "Deferred tool catalog made available to the model." });
    }
    const routeAllowsTools = context.routeSession?.active?.route?.capabilities?.tools !== false;
    const currentTools = routeAllowsTools ? (typeof getTools === "function" ? getTools() : tools) : [];
    context.currentToolDefinitions = currentTools;
    const workflowReminder = context.workflowModeReminder?.consider?.(messages, context.policy?.mode);
    if (workflowReminder) messages.push({ role: "system", content: workflowReminder });
    const activeToolNames = new Set(currentTools.map((definition) => String(definition?.function?.name || "")));
    const workReminder = context.workTrackingReminder?.consider?.(context.work?.list?.() || [], {
      round, available: Boolean(context.capabilities?.registration?.("work_update")), active: activeToolNames.has("work_update")
    });
    if (workReminder) messages.push({ role: "system", content: workReminder });
    context.observationLedger?.refresh?.(messages, { currentRound: round });
    const prepared = await context.windowSteward.prepare(messages, context);
    const releaseReminder = context.contextReleaseReminder?.consider?.(context.observationLedger.summary(), { round, renewed: prepared.renewed });
    if (releaseReminder) messages.push({ role: "system", content: releaseReminder });
    await context.saveSnapshot?.("running", { round, boundary: "before-model" });
    const beforeModel = await context.hooks?.run("before-model", { round });
    for (const additionalContext of beforeModel?.additionalContext || []) messages.push({ role: "system", content: `Lifecycle context:\n${additionalContext}` });
    if (beforeModel?.continue === false) throw lifecycleStop(beforeModel.stopReason || "Lifecycle automation stopped the model request.");
    const response = await completeWithOverflowRecovery(context.activeProvider || provider, messages, {
      tools: currentTools,
      toolChoice: currentTools.length ? "auto" : undefined,
      temperature: 0.2,
      maxTokens: request.settings.agentMaxResponseTokens || undefined,
      rateLimitMaxRetries: context.policy?.mode === "chat" ? 1 : undefined,
      signal: request.signal,
      onDebug: createProviderDebugEmitter(events.emit),
      onUsage: (usage) => {
        context.windowSteward.recordUsage(usage);
        events.emit({ type: "usage", ...usage, reported: true });
      }
    }, context);
    const afterModel = await context.hooks?.run("after-model", { round, finishReason: response.finishReason, toolCount: response.toolCalls?.length || 0 });
    for (const additionalContext of afterModel?.additionalContext || []) messages.push({ role: "system", content: `Lifecycle context after model response:\n${additionalContext}` });
    if (afterModel?.continue === false) throw lifecycleStop(afterModel.stopReason || "Lifecycle automation stopped the run after a model response.");
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
    context.workTrackingReminder?.recordAssistantTurn?.();
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
      const finalDecision = await context.hooks?.run("before-final", { round, content: String(response.content || "") });
      for (const additionalContext of finalDecision?.additionalContext || []) messages.push({ role: "system", content: `Lifecycle context before completion:\n${additionalContext}` });
      if (finalDecision?.continue === false) throw lifecycleStop(finalDecision.stopReason || "Lifecycle automation stopped the run before final publication.");
      if (finalDecision?.retry === true || finalDecision?.additionalContext?.length) {
        context.lifecycleContinuationCount = Number(context.lifecycleContinuationCount || 0) + 1;
        if (context.lifecycleContinuationCount > 3) {
          events.emit({ type: EVENT_TYPES.RECOVERY_WARNING, reason: "lifecycle-continuation-limit", summary: "Lifecycle completion checks reached their bounded continuation limit." });
        } else {
          messages.push({ role: "system", content: finalDecision?.stopReason || "A lifecycle completion check requested another model decision before finishing." });
          await context.saveSnapshot?.("running", { round, boundary: "lifecycle-continuation" });
          continue;
        }
      }
      await context.saveSnapshot?.("running", { round, boundary: "natural-completion" });
      if (finalDecision?.suppressOutput === true) return "";
      return String(finalDecision?.updatedOutput ?? response.content ?? "").trim();
    }
    if (response.content) events.emit({ type: "narration", content: response.content });

    context.pendingTools = response.toolCalls.map((call) => ({ id: call.id, name: String(call?.function?.name || "tool"), startedAt: new Date().toISOString() }));
    await context.saveSnapshot?.("running", { round, boundary: "before-tools" });
    const results = await Promise.all(response.toolCalls.map(async (call) => {
      const name = String(call?.function?.name || "tool");
      events.emit({ type: EVENT_TYPES.TOOL_STARTED, tool: name, callId: call.id, round });
      await context.chronicle?.append?.("tool-started", { round, tool: name, callId: call.id });
      let effectiveCall = call;
      let effectiveInput = {};
      try {
        const originalInput = parseToolArguments(call);
        effectiveInput = originalInput;
        const beforeTool = await context.hooks?.run("before-tool", { tool: name, call, input: originalInput });
        for (const additionalContext of beforeTool?.additionalContext || []) messages.push({ role: "system", content: `Tool lifecycle context:\n${additionalContext}` });
        if (beforeTool?.continue === false || beforeTool?.permissionDecision === "deny") {
          await context.hooks?.run("tool-denied", { tool: name, call, input: originalInput, source: "lifecycle", reason: beforeTool.stopReason || "Lifecycle automation denied the tool." });
          const error = new Error(beforeTool.stopReason || `Lifecycle automation denied ${name}.`);
          error.code = "HOOK_TOOL_DENIED";
          error.retryable = false;
          error.doNotRetry = true;
          throw error;
        }
        effectiveCall = withToolInput(call, beforeTool?.updatedInput);
        effectiveInput = parseToolArguments(effectiveCall);
        const registration = context.capabilities?.registration?.(name);
        if (effectiveCall !== call) {
          validateToolInput(registration?.definition?.function?.parameters, effectiveInput);
          await context.chronicle?.append?.("tool-input-rewritten", { round, tool: name, callId: call.id, originalInput, effectiveInput });
          events.emit({ type: "hook-input-rewritten", boundary: "before-tool", tool: name, callId: call.id, summary: "Lifecycle automation narrowed or changed tool input before validation and approval." });
        }
        await context.rulePathObserver?.beforeTool?.(name, effectiveInput, registration);
        await context.skillPathObserver?.beforeTool?.(name, effectiveInput, registration);
        const result = await executeTool(effectiveCall, context);
        context.runSummary?.recordToolCompleted(name, effectiveInput, result);
        await context.rulePathObserver?.afterTool?.(name, effectiveInput, result, registration);
        if (name === "work_create" || name === "work_update") context.workTrackingReminder?.recordWorkMutation?.(context.work?.list?.() || []);
        await context.skillPathObserver?.afterTool?.(name, result, registration);
        consecutiveFailures = 0;
        events.emit({ type: EVENT_TYPES.TOOL_COMPLETED, tool: name, callId: call.id, input: effectiveInput, result });
        const afterTool = await context.hooks?.run("after-tool", { tool: name, call: effectiveCall, input: effectiveInput, result });
        let effectiveResult = afterTool?.updatedOutput === undefined ? result : afterTool.updatedOutput;
        if (afterTool?.updatedOutput !== undefined || afterTool?.suppressOutput === true) {
          const raw = typeof result === "string" ? result : JSON.stringify(result);
          const artifact = await context.artifactVault?.store?.(raw || "", { tool: name, callId: call.id, purpose: "lifecycle-original-output" });
          await context.chronicle?.append?.("tool-output-rewritten", { round, tool: name, callId: call.id, originalArtifact: artifact?.id || "", suppressed: afterTool?.suppressOutput === true });
          if (afterTool?.suppressOutput === true) effectiveResult = { suppressed: true, originalArtifact: artifact ? context.artifactVault.reference(artifact) : undefined };
        }
        for (const additionalContext of afterTool?.additionalContext || []) messages.push({ role: "system", content: `Lifecycle context after tool execution:\n${additionalContext}` });
        if (afterTool?.continue === false) throw lifecycleStop(afterTool.stopReason || "Lifecycle automation stopped the run after tool execution.");
        await context.chronicle?.append?.("tool-completed", { round, tool: name, callId: call.id });
        const toolMessage = { role: "tool", tool_call_id: call.id, content: await serializeRuntimeToolResult(effectiveResult, name, call.id, context) };
        context.observationLedger?.register?.(toolMessage, { tool: name, callId: call.id, round });
        return toolMessage;
      } catch (error) {
        context.runSummary?.recordToolFailed(name, effectiveInput, error);
        if (error?.code === "LIFECYCLE_RUN_STOPPED") throw error;
        consecutiveFailures += 1;
        const message = error?.message || String(error);
        events.emit({ type: EVENT_TYPES.TOOL_FAILED, tool: name, callId: call.id, input: effectiveInput, error: message });
        const failureDecision = await context.hooks?.run("tool-failure", { tool: name, call, error: message });
        for (const additionalContext of failureDecision?.additionalContext || []) messages.push({ role: "system", content: `Lifecycle context after tool failure:\n${additionalContext}` });
        await context.chronicle?.append?.("tool-failed", { round, tool: name, callId: call.id, error: message });
        const toolMessage = { role: "tool", tool_call_id: call.id, content: JSON.stringify({
          error: message,
          code: error?.code || undefined,
          retryable: failureDecision?.retry === true ? true : (error?.retryable === false ? false : consecutiveFailures < 3),
          doNotRetry: error?.doNotRetry === true
        }) };
        context.observationLedger?.register?.(toolMessage, { tool: name, callId: call.id, round });
        return toolMessage;
      }
    }));
    messages.push(...results);
    context.observationLedger?.refresh?.(messages, { currentRound: round });
    context.pendingTools = [];
    await context.interactionGate?.acknowledgeToolResults?.(results);
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

function withToolInput(call, updatedInput) {
  if (!updatedInput || typeof updatedInput !== "object") return call;
  return { ...call, function: { ...call.function, arguments: JSON.stringify({ ...parseToolArguments(call), ...updatedInput }) } };
}

function lifecycleStop(message) {
  const error = new Error(message);
  error.name = "AbortError";
  error.code = "LIFECYCLE_RUN_STOPPED";
  error.doNotRetry = true;
  return error;
}

async function completeWithOverflowRecovery(provider, messages, options, context) {
  try {
    return await provider.completeMessage(messages, options);
  } catch (error) {
    if (isContextOverflowError(error)) {
      const renewal = await context.windowSteward.prepare(messages, context, { force: true, trigger: "provider-overflow" });
      if (!renewal.renewed) throw error;
      await context.saveSnapshot?.("running", { boundary: "overflow-renewal" });
      return provider.completeMessage(messages, options);
    }
    const fallback = context.routeSession?.fallback?.(error, { requiredDataScopes: ["workspace"] });
    if (!fallback) throw error;
    context.activeProvider = fallback.provider;
    context.windowSteward.limits = context.routeSession.limits();
    messages.push({ role: "system", content: fallback.notice });
    await context.saveSnapshot?.("running", { boundary: "provider-route-fallback" });
    return fallback.provider.completeMessage(messages, options);
  }
}

async function serializeRuntimeToolResult(result, tool, callId, context) {
  const raw = typeof result === "string" ? result : (JSON.stringify(result) ?? String(result ?? ""));
  if (raw.length <= 24000 || !context.artifactVault) return serializeToolResult(result);
  const artifact = await context.artifactVault.store(raw, { tool, callId });
  return context.artifactVault.reference(artifact);
}

module.exports = { assistantMessage, completeWithOverflowRecovery, runAutonomousLoop, serializeRuntimeToolResult };
