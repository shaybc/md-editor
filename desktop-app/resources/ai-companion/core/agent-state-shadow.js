/**
 * Agent-only shadow adapter from existing runtime observations to typed AgentState events.
 */

"use strict";

const {
  AGENT_STATE_EVENT_SCHEMA_VERSION,
  AGENT_STATE_SCHEMA_VERSION,
  applyAgentStateEvent,
  createInitialAgentState,
  validateTerminalAgentStateSnapshot
} = require("./agent-state");
const { createAgentArtifactStore } = require("./agent-artifact-store");
const { buildAgentContext } = require("./agent-context-builder");
const { compareAgentContexts } = require("./agent-context-comparison");
const { normalizeToolObservation } = require("./agent-observation-normalizer");

const IGNORED_RUNTIME_EVENT_TYPES = new Set([
  "start",
  "content",
  "content-delta",
  "reasoning-delta",
  "usage",
  "context",
  "narration",
  "agent-decision",
  "intent-evaluation",
  "intent-uninterpreted",
  "chat-title",
  "rate-limit-wait",
  "done",
  "cancelled",
  "error"
]);

let fallbackRunId = 0;

function cloneSerializable(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function toIsoTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function actionIdForEvent(event, sequence) {
  return String(event?.activity?.id || event?.activityId || `action-${sequence}`);
}

function actionStatusForEvent(event) {
  if (event?.type === "tool-error") {
    const failure = event.structuredResult || {};
    const code = String(failure?.error?.code || failure.code || "").toLowerCase();
    if (failure.preExecution === true || failure.executed === false || /denied|rejected|blocked/.test(code)) return "denied";
    if (failure.cancelled === true || code.includes("cancel")) return "cancelled";
    return "failed";
  }
  if (event?.activity?.status === "partial" || String(event?.summary || "").toLowerCase() === "partial") return "partial";
  return "succeeded";
}

function createClarificationPrompt(details = {}) {
  return {
    ambiguityId: String(details.ambiguityId || ""),
    question: String(details.question || ""),
    reason: String(details.reason || ""),
    answerType: String(details.answerType || ""),
    choices: Array.isArray(details.choices) ? details.choices.map(String) : []
  };
}

function createApprovalPrompt(details = {}) {
  return {
    decisionId: String(details.decisionId || ""),
    tool: String(details.tool || ""),
    input: String(details.input || ""),
    approvalReason: String(details.approvalReason || ""),
    capability: String(details.capability || ""),
    resource: details.resource || null,
    summary: String(details.summary || ""),
    approvalKind: String(details.approvalKind || ""),
    limitKind: String(details.limitKind || ""),
    approveLabel: String(details.approveLabel || ""),
    rejectLabel: String(details.rejectLabel || ""),
    maximumGrantLifetime: String(details.maximumGrantLifetime || "")
  };
}

/**
 * Derive bounded terminal text without changing the original error.
 * @param {unknown} error Existing Agent failure.
 * @param {string} status Fallback terminal lifecycle status.
 * @returns {string} Terminal reason for the observational state.
 */
function terminalReasonForError(error, status) {
  const message = String(error?.message || error || "").trim();
  return message || status;
}

/**
 * Identify cancellation without modifying the error object supplied by the existing runtime.
 * @param {unknown} error Existing Agent failure.
 * @param {AbortSignal} signal Request abort signal.
 * @returns {boolean} Whether the failure represents cancellation.
 */
function isAgentCancellation(error, signal) {
  return signal?.aborted === true
    || error?.cancelled === true
    || /\bcancel(?:led|ed|lation)?\b/i.test(String(error?.message || error || ""));
}

/**
 * Create one request-local Agent state session in shadow or controller mode.
 * @param {object} options Agent request identity plus optional deterministic clock.
 * @returns {object} State observation, controller-transition, and snapshot API.
 */
function createAgentStateShadow(options = {}) {
  const clock = typeof options.clock === "function" ? options.clock : Date.now;
  const runId = String(options.runId || options.requestId || `agent-shadow-${++fallbackRunId}-${clock()}`);
  const isControllerMode = options.controlMode === "controller";
  let sequence = 0;
  let state = createInitialAgentState({ ...options, runId });
  const artifactStore = createAgentArtifactStore();
  const observationIdsByToolCall = new Map();
  const transitionJournal = [];
  let contextSources = {};
  let controllerTerminationReason = "";
  const diagnostics = {
    ignoredEventCount: 0,
    unmappedEventCount: 0,
    unmatchedActionFinishCount: 0,
    rejectedTransitionCount: 0,
    shadowErrorCount: 0,
    normalizedObservationCount: 0,
    observationNormalizationErrorCount: 0,
    contextBuildCount: 0,
    contextBuildErrorCount: 0,
    latestContextComparison: null
  };

  function allocateObservation() {
    sequence += 1;
    return { sequence, occurredAt: toIsoTimestamp(clock()) };
  }

  function applyAtObservation(type, payload, observation) {
    const beforeStateVersion = state.stateVersion;
    try {
      const result = applyAgentStateEvent(state, {
        schemaVersion: AGENT_STATE_EVENT_SCHEMA_VERSION,
        runId,
        sequence: observation.sequence,
        occurredAt: observation.occurredAt,
        type,
        payload: payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}
      });
      if (!result.accepted) {
        diagnostics.rejectedTransitionCount += 1;
        if (isControllerMode) throw new Error(`Agent controller rejected ${type}: ${result.reason}`);
        return false;
      }
      state = result.state;
      transitionJournal.push({
        type,
        payload: cloneSerializable(payload || {}),
        sequence: observation.sequence,
        beforeStateVersion,
        afterStateVersion: state.stateVersion
      });
      return true;
    } catch (error) {
      diagnostics.shadowErrorCount += 1;
      if (isControllerMode) throw error;
      return false;
    }
  }

  function applyNewObservation(type, payload) {
    return applyAtObservation(type, payload, allocateObservation());
  }

  /** Apply a typed controller event through the same single-writer reducer. */
  function applyControllerEvent(type, payload = {}) {
    if (!isControllerMode) throw new Error("Controller events require controller mode.");
    applyNewObservation(type, payload);
    return cloneSerializable(state);
  }

  /** Return accepted transitions after the supplied state version without exposing mutable state. */
  function getTransitionsSince(stateVersion) {
    const minimum = Number(stateVersion) || 0;
    return cloneSerializable(transitionJournal.filter((entry) => entry.afterStateVersion > minimum));
  }

  applyNewObservation("run_started", {});

  /** Configure immutable request sources after the Agent prompt profile is loaded. */
  function configureContextSources(sources = {}) {
    contextSources = {
      requestId: sources.requestId,
      systemPrompt: sources.systemPrompt,
      additionalSystemMessages: sources.additionalSystemMessages,
      prompt: sources.prompt,
      activeFile: sources.activeFile,
      editorReadContext: sources.editorReadContext,
      attachments: sources.attachments,
      conversationHistory: sources.conversationHistory,
      intentInjectedMaxChars: sources.intentInjectedMaxChars
    };
  }

  /** Normalize one canonical evidence record and submit it through the state reducer. */
  function observeToolEvidence(details = {}) {
    try {
      const observation = normalizeToolObservation(details, artifactStore);
      if (state.observationIds.includes(observation.observationId)) return observation;
      if (!applyNewObservation("observation_recorded", { observation })) return null;
      if (observation.toolCallId) observationIdsByToolCall.set(observation.toolCallId, observation.observationId);
      diagnostics.normalizedObservationCount += 1;
      return observation;
    } catch (error) {
      diagnostics.observationNormalizationErrorCount += 1;
      diagnostics.shadowErrorCount += 1;
      if (isControllerMode) throw error;
      return null;
    }
  }

  /** Build and compare shadow context without changing the messages sent to the provider. */
  function observeDecisionContext(details = {}) {
    try {
      const contextBundle = buildAgentContext({
        ...contextSources,
        state,
        artifactStore
      });
      diagnostics.contextBuildCount += 1;
      diagnostics.latestContextComparison = compareAgentContexts(details.messages, contextBundle);
      return contextBundle;
    } catch (error) {
      diagnostics.contextBuildErrorCount += 1;
      diagnostics.shadowErrorCount += 1;
      if (isControllerMode) throw error;
      return null;
    }
  }

  function observeActionEvent(event, observation) {
    const actionId = actionIdForEvent(event, observation.sequence);
    const isStart = event.type === "tool" && (event.summary === "running" || event.activity?.status === "running");
    if (isStart) {
      applyAtObservation("action_started", {
        actionId,
        decisionId: String(event.decisionId || ""),
        tool: String(event.tool || event.activity?.tool || ""),
        input: String(event.input || "")
      }, observation);
      return;
    }
    if (!state.activeActions.some((action) => action.actionId === actionId)) diagnostics.unmatchedActionFinishCount += 1;
    applyAtObservation("action_finished", {
      actionId,
      decisionId: String(event.decisionId || ""),
      tool: String(event.tool || event.activity?.tool || ""),
      input: String(event.input || ""),
      status: actionStatusForEvent(event),
      summary: String(event.summary || event.activity?.resultSummary || ""),
      error: String(event.error || ""),
      observationId: observationIdsByToolCall.get(actionId) || ""
    }, observation);
  }

  function observeRuntimeEventUnsafe(event) {
    const observation = allocateObservation();
    if (!event || typeof event !== "object" || Array.isArray(event) || !event.type) {
      diagnostics.unmappedEventCount += 1;
      return;
    }
    if (IGNORED_RUNTIME_EVENT_TYPES.has(event.type)) {
      diagnostics.ignoredEventCount += 1;
      return;
    }
    if (event.type === "intent-contract") {
      applyAtObservation("intent_contract_observed", { contract: event.contract, meta: event.meta || null }, observation);
      return;
    }
    if (event.type === "tool" || event.type === "tool-error") {
      observeActionEvent(event, observation);
      return;
    }
    if (event.type === "completion-assessment") {
      if (isControllerMode && event.stateOwned === true) {
        diagnostics.ignoredEventCount += 1;
        return;
      }
      applyAtObservation("verification_recorded", {
        assessment: event.assessment || {},
        evidenceRefs: (Array.isArray(event.evidenceLedger) ? event.evidenceLedger : []).map((entry) => entry?.id).filter(Boolean)
      }, observation);
      return;
    }
    if (event.type === "steering") {
      applyAtObservation("steering_observed", { revision: event.revision, reason: event.reason }, observation);
      return;
    }
    if (event.type === "agent-summary") {
      applyAtObservation("run_summary_observed", {
        changedFiles: event.changedFiles,
        attemptedChanges: event.attemptedChanges,
        blockedChanges: event.blockedChanges
      }, observation);
      return;
    }
    if (event.type === "approval") {
      applyAtObservation("approval_resolved", {
        interactionId: String(event.approvalId || `approval-${observation.sequence}`),
        decisionId: String(event.decisionId || ""),
        status: event.approved === false ? "denied" : "resolved",
        decision: event.approved === false ? "reject" : "approve",
        response: { approved: event.approved !== false, autoApproved: event.autoApproved === true },
        instructions: ""
      }, observation);
      return;
    }
    if (event.type === "clarification") {
      applyAtObservation("user_input_requested", {
        interactionId: String(event.clarificationId || `clarification-${observation.sequence}`),
        prompt: createClarificationPrompt(event)
      }, observation);
      return;
    }
    if (event.type === "clarification-resolved") {
      applyAtObservation("user_input_resolved", {
        interactionId: String(event.clarificationId || `clarification-${observation.sequence}`),
        response: event.answer
      }, observation);
      return;
    }
    diagnostics.unmappedEventCount += 1;
  }

  /** Observe one existing runtime event while containing all shadow failures. */
  function observeRuntimeEvent(event) {
    try {
      observeRuntimeEventUnsafe(event);
    } catch (error) {
      diagnostics.shadowErrorCount += 1;
      if (isControllerMode) throw error;
    }
  }

  /** Wrap the existing event sink without swallowing or rewriting its behavior. */
  function wrapEmit(emit) {
    return (event) => {
      observeRuntimeEvent(event);
      return emit(event);
    };
  }

  function interactionId(details, kind, observation) {
    return String(details?.approvalId || details?.clarificationId || details?.ambiguityId || `${kind}-${observation.sequence}`);
  }

  /** Wrap the Agent clarification callback and retain its exact user response. */
  function wrapClarification(callback) {
    if (typeof callback !== "function") return callback;
    return async (details) => {
      const requested = allocateObservation();
      const id = interactionId(details, "clarification", requested);
      applyAtObservation("user_input_requested", {
        interactionId: id,
        decisionId: String(details.decisionId || ""),
        prompt: createClarificationPrompt(details)
      }, requested);
      try {
        const response = await callback(details);
        applyNewObservation("user_input_resolved", { interactionId: id, decisionId: String(details.decisionId || ""), response });
        return response;
      } catch (error) {
        allocateObservation();
        throw error;
      }
    };
  }

  /** Wrap the Agent approval callback and retain its exact user decision/instructions. */
  function wrapApproval(callback) {
    if (typeof callback !== "function") return callback;
    return async (details) => {
      const requested = allocateObservation();
      const id = interactionId(details, "approval", requested);
      const decisionId = String(details.decisionId || "");
      applyAtObservation("approval_requested", { interactionId: id, decisionId, prompt: createApprovalPrompt(details) }, requested);
      try {
        const response = await callback(details);
        const decision = response === true ? "approve" : response === false ? "reject" : String(response?.decision || (response?.approved === true ? "approve" : "reject"));
        applyNewObservation("approval_resolved", {
          interactionId: id,
          decisionId,
          status: decision === "approve" ? "resolved" : "denied",
          decision,
          instructions: response && typeof response === "object" ? String(response.instructions || response.prompt || "") : "",
          response
        });
        return response;
      } catch (error) {
        allocateObservation();
        throw error;
      }
    };
  }

  function createTerminalSnapshot(status, details = {}) {
    if (!new Set(["completed", "failed", "cancelled"]).has(status)) {
      diagnostics.shadowErrorCount += 1;
      return null;
    }
    const terminalEventType = `run_${status}`;
    const accepted = applyNewObservation(terminalEventType, { reason: String(details.reason || status) });
    if (!accepted) return null;
    const snapshot = {
      schemaVersion: AGENT_STATE_SCHEMA_VERSION,
      snapshotKind: "terminal",
      runId,
      executionGeneration: state.run.executionGeneration,
      stateVersion: state.stateVersion,
      lastSequence: sequence,
      terminalEventType,
      capturedAt: toIsoTimestamp(clock()),
      diagnostics: cloneSerializable(diagnostics),
      state: cloneSerializable(state)
    };
    const validation = validateTerminalAgentStateSnapshot(snapshot);
    if (!validation.valid) {
      diagnostics.shadowErrorCount += 1;
      return null;
    }
    return snapshot;
  }

  /** Finalize and emit a snapshot without allowing the additive event to fail the Agent run. */
  function emitTerminalSnapshot(emit, status, details = {}) {
    let snapshot = null;
    try {
      snapshot = createTerminalSnapshot(status, details);
    } catch (error) {
      diagnostics.shadowErrorCount += 1;
      if (isControllerMode) throw error;
      return null;
    }
    if (!snapshot || typeof emit !== "function") return snapshot;
    try {
      emit({ type: "agent-state-snapshot", snapshot });
    } catch (error) {
      diagnostics.shadowErrorCount += 1;
      if (isControllerMode) throw error;
    }
    return snapshot;
  }

  return {
    applyControllerEvent,
    configureContextSources,
    emitTerminalSnapshot,
    getControllerTerminationReason: () => controllerTerminationReason,
    getDiagnostics: () => cloneSerializable(diagnostics),
    readArtifactExcerpt: (reference, maximum) => artifactStore.readExcerpt(reference, maximum),
    getState: () => cloneSerializable(state),
    getTransitionsSince,
    observeDecisionContext,
    observeRuntimeEvent,
    observeToolEvidence,
    setControllerTerminationReason: (reason) => {
      controllerTerminationReason = String(reason || "");
    },
    wrapApproval,
    wrapClarification,
    wrapEmit
  };
}

module.exports = {
  createAgentStateShadow,
  isAgentCancellation,
  terminalReasonForError
};
