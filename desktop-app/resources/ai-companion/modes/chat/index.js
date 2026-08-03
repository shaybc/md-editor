/**
 * Chat mode for project questions.
 */

"use strict";

const runtime = require("../../core/agent-runtime");
const { loadAiCompanionPrompts } = require("../../config/prompts");

async function runChatMode(request, emit) {
  const settings = runtime.normalizeAiCompanionSettings(request.settings);
  if (!settings.enabled || !settings.chatEnabled) throw new Error("AI Companion chat mode is disabled.");
  const provider = runtime.createProvider(settings);
  const prompts = await loadAiCompanionPrompts({ profileRoot: request.profileRoot });
  const response = await runtime.runAgentToolLoop(provider, settings, request.workspaceRoot, request.prompt, "chat", emit, runtime, { signal: request.signal, activeFile: request.activeFile, editorReadContext: request.editorReadContext, attachments: request.attachments, conversationHistory: request.conversationHistory, resumeIntentContext: request.resumeIntentContext, requestApproval: request.requestApproval, requestAppAction: request.requestAppAction, requestClarification: request.requestClarification, requestChatTitle: request.requestChatTitle === true, requestId: request.requestId, chatId: request.chatId, turnIndex: request.turnIndex, executionKind: request.executionKind, executionGeneration: request.executionGeneration, savedIntentContract: request.savedIntentContract, savedIntentContractMeta: request.savedIntentContractMeta, priorIntentContract: request.priorIntentContract, priorIntentContractMeta: request.priorIntentContractMeta, systemPrompt: prompts.chatSystem, prompts });
  emit({ type: "content", content: response });
  return { content: response };
}

module.exports = {
  runChatMode
};
