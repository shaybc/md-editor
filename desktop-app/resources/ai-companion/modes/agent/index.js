/**
 * Agent mode for visible multi-step workspace tasks.
 */

"use strict";

const runtime = require("../../core/agent-runtime");
const { composeFinalResponse } = require("../../core/agent-final-response-composer");
const { createAgentStateShadow, isAgentCancellation, terminalReasonForError } = require("../../core/agent-state-shadow");
const { AGENT_APPROVAL_RATIONALE_INSTRUCTION, AGENT_COMPLETION_REPORTING_INSTRUCTION, LEGACY_AGENT_COMPLETION_REPORTING_INSTRUCTION, DEFAULT_AI_COMPANION_PROMPTS, loadAiCompanionPrompts } = require("../../config/prompts");
const AGENT_MODE_SYSTEM_PROMPT = `${DEFAULT_AI_COMPANION_PROMPTS.agentSystem} ${AGENT_APPROVAL_RATIONALE_INSTRUCTION} ${LEGACY_AGENT_COMPLETION_REPORTING_INSTRUCTION}`;

async function runAgentMode(request, emit) {
  const prompt = String(request.prompt || "");
  let stateSession = null;
  let verifierCompletionEnabled = false;
  let observedEmit = emit;
  try {
    const settings = runtime.normalizeAiCompanionSettings(request.settings);
    stateSession = createAgentStateShadow({
      requestId: request.requestId,
      chatId: request.chatId,
      turnIndex: request.turnIndex,
      executionKind: request.executionKind,
      executionGeneration: request.executionGeneration,
      prompt,
      controlMode: settings.agentDecisionControllerEnabled === true ? "controller" : "shadow",
      progressEvaluationEnabled: settings.agentProgressEvaluationEnabled === true,
      progressControlEnabled: settings.agentProgressControlEnabled === true,
      noProgressThreshold: settings.agentNoProgressActionLimit,
      maxStrategyReplans: settings.agentMaxStrategyReplans
    });
    observedEmit = stateSession.wrapEmit(emit);
    if (!settings.enabled || !settings.agentEnabled) throw new Error("AI Companion agent mode is disabled.");
    if (settings.agentVerifierCompletionEnabled === true
      && (settings.agentDecisionControllerEnabled !== true
        || settings.intentContractsEnabled !== true
        || settings.intentExperiment?.intentCompletionAssessment !== true)) {
      throw new Error("Agent verifier completion requires the Agent decision controller, intent contracts, and completion assessment.");
    }
    if (settings.agentProgressEvaluationEnabled === true
      && (settings.agentDecisionControllerEnabled !== true || settings.intentContractsEnabled !== true)) {
      throw new Error("Agent progress evaluation requires the Agent decision controller and intent contracts.");
    }
    if (settings.agentProgressControlEnabled === true
      && (settings.agentProgressEvaluationEnabled !== true || settings.agentVerifierCompletionEnabled !== true)) {
      throw new Error("Agent progress control requires progress evaluation and verifier-owned completion.");
    }
    verifierCompletionEnabled = settings.agentVerifierCompletionEnabled === true;
    runtime.throwIfAborted(request.signal);
    const provider = runtime.createProvider(settings);
    const prompts = await loadAiCompanionPrompts({ profileRoot: request.profileRoot });
    const completionInstruction = settings.intentExperiment?.intentCompletionAssessment === true
      ? AGENT_COMPLETION_REPORTING_INSTRUCTION
      : LEGACY_AGENT_COMPLETION_REPORTING_INSTRUCTION;
    const loopOptions = { signal: request.signal, profileRoot: request.profileRoot, activeFile: request.activeFile, editorReadContext: request.editorReadContext, attachments: request.attachments, conversationHistory: request.conversationHistory, resumeCheckpoint: request.resumeCheckpoint, resumeIntentContext: request.resumeIntentContext, requestApproval: request.requestApproval, requestAppAction: request.requestAppAction, requestClarification: request.requestClarification, requestChatTitle: request.requestChatTitle === true, requestId: request.requestId, chatId: request.chatId, turnIndex: request.turnIndex, executionKind: request.executionKind, executionGeneration: request.executionGeneration, savedIntentContract: request.savedIntentContract, savedIntentContractMeta: request.savedIntentContractMeta, priorIntentContract: request.priorIntentContract, priorIntentContractMeta: request.priorIntentContractMeta, appVersion: request.appVersion, securityContext: request.securityContext, systemPrompt: `${prompts.agentSystem} ${AGENT_APPROVAL_RATIONALE_INSTRUCTION} ${completionInstruction}`, prompts };
    stateSession.configureContextSources({
      requestId: request.requestId,
      systemPrompt: loopOptions.systemPrompt,
      prompt,
      activeFile: request.activeFile,
      editorReadContext: request.editorReadContext,
      attachments: request.attachments,
      conversationHistory: request.conversationHistory,
      intentInjectedMaxChars: settings.intentInjectedMaxChars
    });
    loopOptions.observeToolEvidence = stateSession.observeToolEvidence;
    loopOptions.observeDecisionContext = stateSession.observeDecisionContext;
    loopOptions.requestApproval = stateSession.wrapApproval(loopOptions.requestApproval);
    loopOptions.requestClarification = stateSession.wrapClarification(loopOptions.requestClarification);
    if (settings.agentDecisionControllerEnabled === true) loopOptions.agentStateSession = stateSession;
    const response = await runtime.runAgentToolLoop(provider, settings, request.workspaceRoot, prompt, "agent", observedEmit, runtime, loopOptions);
    observedEmit({ type: "content", content: response });
    stateSession.emitTerminalSnapshot(emit, "completed", {
      reason: stateSession.getControllerTerminationReason() || "agent-run-completed"
    });
    return { content: response };
  } catch (error) {
    const status = isAgentCancellation(error, request.signal) ? "cancelled" : "failed";
    if (verifierCompletionEnabled && stateSession) {
      let state = stateSession.getState();
      if (!["succeeded", "blocked", "provisional", "unverified", "budget_exhausted", "failed", "cancelled"].includes(state.completion?.status)) {
        stateSession.applyControllerEvent("completion_terminated", {
          status,
          reasonCodes: [status === "cancelled" ? "run_cancelled" : "runtime_failure"],
          unresolvedIssues: [{ description: terminalReasonForError(error, status) }]
        });
        state = stateSession.getState();
      }
      if (!state.completion?.finalResponse) {
        stateSession.applyControllerEvent("final_response_recorded", {
          response: composeFinalResponse({
            state,
            outcome: state.completion.status,
            proposalContent: "",
            reasonCodes: state.completion.reasonCodes
          })
        });
      }
    }
    stateSession?.emitTerminalSnapshot(emit, status, { reason: terminalReasonForError(error, status) });
    throw error;
  }
}

module.exports = {
  AGENT_MODE_SYSTEM_PROMPT,
  runAgentMode
};
