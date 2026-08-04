/**
 * Agent mode for visible multi-step workspace tasks.
 */

"use strict";

const runtime = require("../../core/agent-runtime");
const { getAgentToolDefinitions } = require("../../core/agent-tool-loop");
const { createAgentCheckpointRuntime } = require("../../core/agent-checkpoint-runtime");
const { recoverAgentCheckpoint } = require("../../core/agent-recovery-coordinator");
const { composeFinalResponse } = require("../../core/agent-final-response-composer");
const { createAgentStateShadow, isAgentCancellation, terminalReasonForError } = require("../../core/agent-state-shadow");
const { AGENT_APPROVAL_RATIONALE_INSTRUCTION, AGENT_COMPLETION_REPORTING_INSTRUCTION, LEGACY_AGENT_COMPLETION_REPORTING_INSTRUCTION, DEFAULT_AI_COMPANION_PROMPTS, loadAiCompanionPrompts } = require("../../config/prompts");
const AGENT_MODE_SYSTEM_PROMPT = `${DEFAULT_AI_COMPANION_PROMPTS.agentSystem} ${AGENT_APPROVAL_RATIONALE_INSTRUCTION} ${LEGACY_AGENT_COMPLETION_REPORTING_INSTRUCTION}`;

async function runAgentMode(request, emit) {
  const prompt = String(request.prompt || "");
  let stateSession = null;
  let verifierCompletionEnabled = false;
  let observedEmit = emit;
  let checkpointRuntime = null;
  let durableRecoveryEnabled = false;
  try {
    const settings = runtime.normalizeAiCompanionSettings(request.settings);
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
    if (settings.agentDurableRecoveryEnabled === true && settings.agentDecisionControllerEnabled !== true) {
      throw new Error("Agent durable recovery requires the Agent decision controller.");
    }
    durableRecoveryEnabled = settings.agentDurableRecoveryEnabled === true;
    verifierCompletionEnabled = settings.agentVerifierCompletionEnabled === true;
    runtime.throwIfAborted(request.signal);
    const provider = runtime.createProvider(settings);
    const prompts = await loadAiCompanionPrompts({ profileRoot: request.profileRoot });
    const completionInstruction = settings.intentExperiment?.intentCompletionAssessment === true
      ? AGENT_COMPLETION_REPORTING_INSTRUCTION
      : LEGACY_AGENT_COMPLETION_REPORTING_INSTRUCTION;
    const systemPrompt = `${prompts.agentSystem} ${AGENT_APPROVAL_RATIONALE_INSTRUCTION} ${completionInstruction}`;
    const runId = String(request.runId || request.taskId || request.requestId || "");
    checkpointRuntime = await createAgentCheckpointRuntime({
      enabled: durableRecoveryEnabled,
      profileRoot: request.profileRoot,
      workspaceRoot: request.workspaceRoot,
      chatId: request.chatId,
      taskId: request.taskId,
      chatCreatedAt: request.chatCreatedAt,
      runId,
      executionGeneration: request.executionGeneration,
      securityContext: request.securityContext,
      toolDefinitions: getAgentToolDefinitions("agent"),
      systemPrompt,
      appVersion: request.appVersion,
      emit
    });
    const loadedCheckpoint = durableRecoveryEnabled && request.durableResume === true
      ? await checkpointRuntime.load()
      : null;
    if (request.durableResume === true && !loadedCheckpoint?.checkpoint) {
      throw new Error(`Durable Agent checkpoint could not be restored: ${(loadedCheckpoint?.validation?.errors || ["checkpoint-missing"]).join(", ")}`);
    }
    if (loadedCheckpoint?.unavailableRefs?.length) throw new Error("Durable Agent checkpoint has missing or corrupt artifacts and cannot be resumed safely.");
    if (loadedCheckpoint?.checkpoint?.checkpointKind === "terminal") {
      const checkpoint = loadedCheckpoint.checkpoint;
      const terminalState = checkpoint.state;
      const status = terminalState.lifecycle?.status;
      const finalResponse = terminalState.completion?.finalResponse;
      const finalResponsePayload = typeof finalResponse === "string" ? finalResponse : finalResponse?.content;
      const content = String(finalResponsePayload || "");
      if (content) emit({ type: "content", content });
      emit({
        type: "agent-state-snapshot",
        snapshot: {
          schemaVersion: terminalState.schemaVersion,
          snapshotKind: "terminal",
          runId: terminalState.run?.runId,
          executionGeneration: terminalState.run?.executionGeneration,
          stateVersion: terminalState.stateVersion,
          lastSequence: terminalState.lastAcceptedSequence,
          terminalEventType: `run_${status}`,
          capturedAt: checkpoint.capturedAt,
          diagnostics: checkpoint.diagnostics || {},
          state: terminalState
        }
      });
      emit({
        type: "agent-summary",
        finalResponse: content,
        outcome: terminalState.completion?.status || status || "completed",
        changedFiles: terminalState.artifacts?.changedFiles || [],
        attemptedChanges: terminalState.artifacts?.attemptedChanges || [],
        blockedChanges: terminalState.artifacts?.blockedChanges || [],
        completionAssessment: terminalState.completion?.assessment || null,
        evidenceLedger: terminalState.artifacts?.evidenceLedger || [],
        recoveredTerminalProjection: true
      });
      emit({ type: "agent-recovery", checkpointId: checkpoint.checkpointId, continuation: "repair_terminal_projection", source: loadedCheckpoint.source });
      return { content };
    }
    stateSession = createAgentStateShadow({
      requestId: request.requestId,
      runId,
      chatId: request.chatId,
      turnIndex: request.turnIndex,
      executionKind: request.executionKind,
      executionGeneration: request.executionGeneration,
      prompt,
      controlMode: settings.agentDecisionControllerEnabled === true ? "controller" : "shadow",
      progressEvaluationEnabled: settings.agentProgressEvaluationEnabled === true,
      progressControlEnabled: settings.agentProgressControlEnabled === true,
      noProgressThreshold: settings.agentNoProgressActionLimit,
      maxStrategyReplans: settings.agentMaxStrategyReplans,
      restoredState: loadedCheckpoint?.checkpoint?.state || null,
      artifactRecords: loadedCheckpoint?.artifactRecords || [],
      checkpointBarrier: checkpointRuntime ? checkpointRuntime.commit : null
    });
    observedEmit = stateSession.wrapEmit(emit);
    if (loadedCheckpoint?.checkpoint) {
      const recoveryDecision = await recoverAgentCheckpoint({
        checkpoint: loadedCheckpoint.checkpoint,
        stateSession,
        currentCompatibility: checkpointRuntime.compatibility,
        workspaceRoot: request.workspaceRoot
      });
      if (recoveryDecision.continuation === "blocked") throw new Error(`Durable Agent recovery blocked: ${recoveryDecision.reasonCodes.join(", ") || "incompatible checkpoint"}`);
      emit({ type: "agent-recovery", checkpointId: loadedCheckpoint.checkpoint.checkpointId, continuation: recoveryDecision.continuation, source: loadedCheckpoint.source });
    }
    const restoredControllerState = loadedCheckpoint?.checkpoint?.state || null;
    const loopOptions = { signal: request.signal, profileRoot: request.profileRoot, activeFile: request.activeFile, editorReadContext: request.editorReadContext, attachments: request.attachments, conversationHistory: request.conversationHistory, resumeCheckpoint: request.resumeCheckpoint, resumeIntentContext: request.resumeIntentContext, requestApproval: request.requestApproval, requestAppAction: request.requestAppAction, requestClarification: request.requestClarification, requestChatTitle: request.requestChatTitle === true, requestId: request.requestId, chatId: request.chatId, turnIndex: request.turnIndex, executionKind: request.executionKind, executionGeneration: request.executionGeneration, savedIntentContract: request.savedIntentContract, savedIntentContractMeta: request.savedIntentContractMeta, priorIntentContract: request.priorIntentContract, priorIntentContractMeta: request.priorIntentContractMeta, appVersion: request.appVersion, securityContext: request.securityContext, systemPrompt, prompts, skipIntentPhase: !!restoredControllerState, intentContract: restoredControllerState?.intentContract || null, intentContractMeta: restoredControllerState?.intentContractMeta || null };
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
    if (durableRecoveryEnabled) await stateSession.checkpoint("terminal", { nextRuntimeStep: "none" });
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
    if (durableRecoveryEnabled && stateSession) {
      await stateSession.checkpoint("terminal", { nextRuntimeStep: "none", error: status }).catch(() => {});
    }
    throw error;
  }
}

module.exports = {
  AGENT_MODE_SYSTEM_PROMPT,
  runAgentMode
};
