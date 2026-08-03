/**
 * Agent mode for visible multi-step workspace tasks.
 */

"use strict";

const runtime = require("../../core/agent-runtime");
const { AGENT_APPROVAL_RATIONALE_INSTRUCTION, AGENT_COMPLETION_REPORTING_INSTRUCTION, LEGACY_AGENT_COMPLETION_REPORTING_INSTRUCTION, DEFAULT_AI_COMPANION_PROMPTS, loadAiCompanionPrompts } = require("../../config/prompts");
const AGENT_MODE_SYSTEM_PROMPT = `${DEFAULT_AI_COMPANION_PROMPTS.agentSystem} ${AGENT_APPROVAL_RATIONALE_INSTRUCTION} ${LEGACY_AGENT_COMPLETION_REPORTING_INSTRUCTION}`;

async function runAgentMode(request, emit) {
  const settings = runtime.normalizeAiCompanionSettings(request.settings);
  if (!settings.enabled || !settings.agentEnabled) throw new Error("AI Companion agent mode is disabled.");
  const prompt = String(request.prompt || "");
  runtime.throwIfAborted(request.signal);
  const provider = runtime.createProvider(settings);
  const prompts = await loadAiCompanionPrompts({ profileRoot: request.profileRoot });
  const completionInstruction = settings.intentExperiment?.intentCompletionAssessment === true
    ? AGENT_COMPLETION_REPORTING_INSTRUCTION
    : LEGACY_AGENT_COMPLETION_REPORTING_INSTRUCTION;
  const response = await runtime.runAgentToolLoop(provider, settings, request.workspaceRoot, prompt, "agent", emit, runtime, { signal: request.signal, profileRoot: request.profileRoot, activeFile: request.activeFile, editorReadContext: request.editorReadContext, attachments: request.attachments, conversationHistory: request.conversationHistory, resumeCheckpoint: request.resumeCheckpoint, resumeIntentContext: request.resumeIntentContext, requestApproval: request.requestApproval, requestAppAction: request.requestAppAction, requestClarification: request.requestClarification, requestChatTitle: request.requestChatTitle === true, requestId: request.requestId, chatId: request.chatId, turnIndex: request.turnIndex, executionKind: request.executionKind, executionGeneration: request.executionGeneration, savedIntentContract: request.savedIntentContract, savedIntentContractMeta: request.savedIntentContractMeta, priorIntentContract: request.priorIntentContract, priorIntentContractMeta: request.priorIntentContractMeta, appVersion: request.appVersion, securityContext: request.securityContext, systemPrompt: `${prompts.agentSystem} ${AGENT_APPROVAL_RATIONALE_INSTRUCTION} ${completionInstruction}`, prompts });
  emit({ type: "content", content: response });
  return { content: response };
}

module.exports = {
  AGENT_MODE_SYSTEM_PROMPT,
  runAgentMode
};
