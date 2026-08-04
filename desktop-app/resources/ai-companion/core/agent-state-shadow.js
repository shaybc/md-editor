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

const IGNORED_RUNTIME_EVENT_TYPES = new Set([
  "start",
  "content",
  "content-delta",
  "reasoning-delta",
  "usage",
  "context",
  "narration",
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
 * Create one request-local observer that can never intentionally control Agent execution.
 * @param {object} options Agent request identity plus optional deterministic clock.
 * @returns {object} Shadow observation and snapshot API.
 */
function createAgentStateShadow(options = {}) {
  const clock = typeof options.clock === "function" ? options.clock : Date.now;
  const runId = String(options.runId || options.requestId || `agent-shadow-${++fallbackRunId}-${clock()}`);
  let sequence = 0;
  let state = createInitialAgentState({ ...options, runId });
  const diagnostics = {
    ignoredEventCount: 0,
    unmappedEventCount: 0,
    unmatchedActionFinishCount: 0,
    rejectedTransitionCount: 0,
    shadowErrorCount: 0
  };

  function allocateObservation() {
    sequence += 1;
    return { sequence, occurredAt: toIsoTimestamp(clock()) };
  }

  function applyAtObservation(type, payload, observation) {
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
        return false;
      }
      state = result.state;
      return true;
    } catch (_error) {
      diagnostics.shadowErrorCount += 1;
      return false;
    }
  }

  function applyNewObservation(type, payload) {
    return applyAtObservation(type, payload, allocateObservation());
  }

  applyNewObservation("run_started", {});

  function observeActionEvent(event, observation) {
    const actionId = actionIdForEvent(event, observation.sequence);
    const isStart = event.type === "tool" && (event.summary === "running" || event.activity?.status === "running");
    if (isStart) {
      applyAtObservation("action_started", {
        actionId,
        tool: String(event.tool || event.activity?.tool || ""),
        input: String(event.input || "")
      }, observation);
      return;
    }
    if (!state.activeActions.some((action) => action.actionId === actionId)) diagnostics.unmatchedActionFinishCount += 1;
    applyAtObservation("action_finished", {
      actionId,
      tool: String(event.tool || event.activity?.tool || ""),
      input: String(event.input || ""),
      status: actionStatusForEvent(event),
      summary: String(event.summary || event.activity?.resultSummary || ""),
      error: String(event.error || "")
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
    } catch (_error) {
      diagnostics.shadowErrorCount += 1;
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
      applyAtObservation("user_input_requested", { interactionId: id, prompt: createClarificationPrompt(details) }, requested);
      try {
        const response = await callback(details);
        applyNewObservation("user_input_resolved", { interactionId: id, response });
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
      applyAtObservation("approval_requested", { interactionId: id, prompt: createApprovalPrompt(details) }, requested);
      try {
        const response = await callback(details);
        const decision = response === true ? "approve" : response === false ? "reject" : String(response?.decision || (response?.approved === true ? "approve" : "reject"));
        applyNewObservation("approval_resolved", {
          interactionId: id,
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
    } catch (_error) {
      diagnostics.shadowErrorCount += 1;
      return null;
    }
    if (!snapshot || typeof emit !== "function") return snapshot;
    try {
      emit({ type: "agent-state-snapshot", snapshot });
    } catch (_error) {
      diagnostics.shadowErrorCount += 1;
    }
    return snapshot;
  }

  return {
    emitTerminalSnapshot,
    getDiagnostics: () => cloneSerializable(diagnostics),
    getState: () => cloneSerializable(state),
    observeRuntimeEvent,
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
