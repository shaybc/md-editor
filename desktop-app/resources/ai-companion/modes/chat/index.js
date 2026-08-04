/**
 * Chat mode for project questions.
 */

"use strict";

const runtime = require("../../core/agent-runtime");
const {
  CHAT_ROUTES,
  buildGroundedContextMessage,
  classifyChatRequest,
  gatherGroundedEvidence
} = require("../../core/chat-request-router");
const { loadAiCompanionPrompts } = require("../../config/prompts");

function createChatLoopOptions(request, prompts) {
  return {
    signal: request.signal,
    activeFile: request.activeFile,
    editorReadContext: request.editorReadContext,
    attachments: request.attachments,
    conversationHistory: request.conversationHistory,
    resumeIntentContext: request.resumeIntentContext,
    requestApproval: request.requestApproval,
    requestAppAction: request.requestAppAction,
    requestClarification: request.requestClarification,
    requestChatTitle: request.requestChatTitle === true,
    requestId: request.requestId,
    chatId: request.chatId,
    turnIndex: request.turnIndex,
    executionKind: request.executionKind,
    executionGeneration: request.executionGeneration,
    savedIntentContract: request.savedIntentContract,
    savedIntentContractMeta: request.savedIntentContractMeta,
    priorIntentContract: request.priorIntentContract,
    priorIntentContractMeta: request.priorIntentContractMeta,
    systemPrompt: prompts.chatSystem,
    prompts
  };
}

function createOneShotOptions(loopOptions, systemPrompt, additionalSystemMessages = []) {
  return {
    ...loopOptions,
    activeFile: undefined,
    editorReadContext: undefined,
    attachments: undefined,
    systemPrompt,
    toolDefinitionsOverride: [],
    requireInitialDiscoveryOverride: false,
    skipIntentPhase: true,
    additionalSystemMessages,
    narrationEnabled: false
  };
}

async function runChatLoop(provider, settings, request, emit, options) {
  return runtime.runAgentToolLoop(provider, settings, request.workspaceRoot, request.prompt, "chat", emit, runtime, options);
}

async function runChatMode(request, emit) {
  const settings = runtime.normalizeAiCompanionSettings(request.settings);
  if (!settings.enabled || !settings.chatEnabled) throw new Error("AI Companion chat mode is disabled.");
  const provider = runtime.createProvider(settings);
  const prompts = await loadAiCompanionPrompts({ profileRoot: request.profileRoot });
  const loopOptions = createChatLoopOptions(request, prompts);
  let response;
  if (settings.chatRequestRoutingEnabled === false) {
    response = await runChatLoop(provider, settings, request, emit, loopOptions);
  } else {
    const decision = classifyChatRequest(request);
    emit({ type: "chat-route", stage: "selected", route: decision.route, reasonCode: decision.reasonCode, classifier: "deterministic" });
    if (decision.route === CHAT_ROUTES.DIRECT) {
      response = await runChatLoop(provider, settings, request, emit, createOneShotOptions(loopOptions, prompts.chatDirectSystem));
    } else if (decision.route === CHAT_ROUTES.GROUNDED) {
      const grounding = await gatherGroundedEvidence(runtime, request, decision, emit);
      if (grounding.ok) {
        response = await runChatLoop(provider, settings, request, emit, createOneShotOptions(
          loopOptions,
          prompts.workspaceContextSystem,
          [buildGroundedContextMessage(grounding.evidence)]
        ));
      } else {
        emit({
          type: "chat-route",
          stage: "escalated",
          route: CHAT_ROUTES.COMPLEX,
          fromRoute: CHAT_ROUTES.GROUNDED,
          reasonCode: grounding.reasonCode,
          classifier: "deterministic"
        });
        response = await runChatLoop(provider, settings, request, emit, loopOptions);
      }
    } else {
      response = await runChatLoop(provider, settings, request, emit, loopOptions);
    }
  }
  emit({ type: "content", content: response });
  return { content: response };
}

module.exports = {
  runChatMode
};
