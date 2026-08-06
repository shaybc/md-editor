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
const { resolveModePolicy, validateModeFlags } = require("../../core/companion-mode-policy");
const { CHAT_DEPTH, selectChatControllerDepth, detectMutationRequest } = require("../../core/chat-route-policy");
const { classifyAnswerText } = require("../../core/chat-claim-classifier");
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

/**
 * M9 stateful Chat path (flag-gated). Read-only. Adds deterministic guarantees over
 * the existing routed generation: a mutation-request handoff (Chat cannot edit), and
 * a post-answer claim safeguard that escalates a direct answer to the grounded
 * evidence path when it asserts a workspace-specific claim. Generation itself reuses
 * the proven chat loop / one-shot. Returns the response string; the caller emits it.
 */
async function runChatStatefulMode(provider, settings, request, emit, prompts, loopOptions) {
  const claimContext = { namedTargets: request.savedIntentContract && request.savedIntentContract.namedTargets };

  // Read-only mutation handoff: never answer a "change the file" request as if performed.
  const mutation = detectMutationRequest(request.prompt);
  if (mutation.isMutation) {
    emit({ type: "chat-controller", stage: "blocked", reason: mutation.reason });
    return "That looks like a request to change files, but Chat mode is read-only. Switch to Agent mode to apply changes — I can explain exactly what to change here, but I won't modify anything myself.";
  }

  if (settings.chatRequestRoutingEnabled === false) {
    return runChatLoop(provider, settings, request, emit, loopOptions);
  }

  const decision = classifyChatRequest(request);
  emit({ type: "chat-route", stage: "selected", route: decision.route, reasonCode: decision.reasonCode, classifier: "deterministic" });
  const depth = selectChatControllerDepth(decision.route);
  emit({ type: "chat-controller", stage: "depth", route: decision.route, depth: depth.depth, engagesController: depth.engagesController });

  let stage = depth.depth;

  if (stage === CHAT_DEPTH.DIRECT) {
    const raw = await runChatLoop(provider, settings, request, emit, createOneShotOptions(loopOptions, prompts.chatDirectSystem));
    const scan = classifyAnswerText(raw, claimContext);
    if (!scan.requiresVerification) return raw;
    // Safeguard: a direct answer that asserts a workspace claim must be grounded.
    emit({ type: "chat-controller", stage: "escalated", fromDepth: "direct", toDepth: "grounded", reason: "workspace-claim-safeguard", signals: scan.signals });
    stage = CHAT_DEPTH.GROUNDED;
  }

  if (stage === CHAT_DEPTH.GROUNDED) {
    const groundedDecision = decision.route === CHAT_ROUTES.GROUNDED ? decision : { ...decision, route: CHAT_ROUTES.GROUNDED };
    const grounding = await gatherGroundedEvidence(runtime, request, groundedDecision, emit);
    if (grounding.ok) {
      return runChatLoop(provider, settings, request, emit, createOneShotOptions(
        loopOptions, prompts.workspaceContextSystem, [buildGroundedContextMessage(grounding.evidence)]
      ));
    }
    emit({ type: "chat-controller", stage: "escalated", fromDepth: "grounded", toDepth: "complex", reason: grounding.reasonCode });
    stage = CHAT_DEPTH.COMPLEX;
  }

  // Complex: full controller loop (existing chat loop with tools).
  return runChatLoop(provider, settings, request, emit, loopOptions);
}

async function runChatMode(request, emit) {
  const settings = runtime.normalizeAiCompanionSettings(request.settings);
  if (!settings.enabled || !settings.chatEnabled) throw new Error("AI Companion chat mode is disabled.");
  const provider = runtime.createProvider(settings);
  const prompts = await loadAiCompanionPrompts({ profileRoot: request.profileRoot });
  const loopOptions = createChatLoopOptions(request, prompts);

  // M9: resolve the Chat controller policy. Fail closed to legacy on an invalid flag
  // matrix. When eligible, run the stateful path; otherwise the exact legacy routing.
  const chatPolicy = resolveModePolicy("chat", settings);
  const flagMatrix = validateModeFlags("chat", settings);
  if (settings.chatStatefulControllerEnabled === true && !flagMatrix.valid) {
    emit({ type: "chat-controller", stage: "fail-closed", errors: flagMatrix.errors });
  }
  const useStatefulController = chatPolicy.controllerEligible && flagMatrix.valid;

  let response;
  if (useStatefulController) {
    response = await runChatStatefulMode(provider, settings, request, emit, prompts, loopOptions);
  } else if (settings.chatRequestRoutingEnabled === false) {
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
