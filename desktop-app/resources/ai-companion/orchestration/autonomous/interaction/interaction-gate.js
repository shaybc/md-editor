/** Run-scoped user decision requests that suspend model execution without granting authority. */

"use strict";

const crypto = require("node:crypto");
const { resolveInteractionToolCallId } = require("./pending-interaction-recovery");

class InteractionGate {
  constructor(request, emit = () => {}, onChange = () => {}) {
    this.request = request;
    this.emit = typeof emit === "function" ? emit : () => {};
    this.onChange = typeof onChange === "function" ? onChange : () => {};
    this.pending = null;
  }

  /** Ask the foreground user for bounded task information and return it as a tool result. */
  async requestChoice(input = {}, options = {}) {
    if (this.pending) throw interactionError("USER_INPUT_ALREADY_PENDING", "A user decision is already pending for this run.");
    if (typeof this.request.requestUserInput !== "function") throw interactionError("USER_INPUT_CHANNEL_UNAVAILABLE", "Interactive user input is unavailable.");
    const hookDecision = await this.request.lifecycleHooks?.run?.("user-input-request", { input });
    if (hookDecision?.continue === false) throw interactionError("USER_INPUT_STOPPED", hookDecision.stopReason || "Lifecycle automation stopped the user question.");
    const effectiveInput = hookDecision?.updatedInput ? { ...input, ...hookDecision.updatedInput } : input;
    const interaction = {
      id: crypto.randomUUID(),
      toolCallId: String(options.toolCallId || ""),
      questions: normalizeQuestions(effectiveInput.questions),
      reason: String(effectiveInput.reason || "").trim().slice(0, 500),
      requestedAt: new Date().toISOString(),
      status: "waiting",
      response: null,
      responseRecordedAt: ""
    };
    this.pending = interaction;
    this.emitRequested(interaction, false);
    await this.persistPendingState();
    try {
      const response = await this.request.requestUserInput(publicInteraction(interaction));
      return await this.recordResponse(interaction, response, false);
    } catch (error) {
      if (this.pending === interaction && interaction.status === "waiting") {
        this.pending = null;
        await this.persistPendingState();
      }
      throw error;
    }
  }

  /** Return restart-safe metadata without attempting to serialize a live Promise. */
  snapshot() { return this.pending ? { version: 2, pending: privateInteraction(this.pending) } : { version: 2, pending: null }; }

  /** Restore a durable interaction without opening its live UI channel yet. */
  restore(snapshot, context = {}) {
    if (!snapshot?.pending) return null;
    const toolCallId = resolveInteractionToolCallId(snapshot, context.messages, context.pendingTools);
    if (!toolCallId) {
      this.emit({ type: "recovery-warning", reason: "user-input-call-ambiguous", summary: "The interrupted user question could not be matched safely to its original tool call." });
      this.emit({ type: "user-input-declined", interactionId: snapshot.pending.id, interrupted: true, summary: "A previous user question was interrupted and could not be restored safely." });
      return null;
    }
    const status = snapshot.pending.response && ["answered", "declined"].includes(snapshot.pending.status) ? snapshot.pending.status : "waiting";
    this.pending = {
      ...publicInteraction(snapshot.pending),
      toolCallId,
      status,
      response: status === "waiting" ? null : normalizeResponse(snapshot.pending, snapshot.pending.response),
      responseRecordedAt: String(snapshot.pending.responseRecordedAt || "")
    };
    return privateInteraction(this.pending);
  }

  /** Rebind a restored waiting question or return its persisted response. */
  async resumePending() {
    const interaction = this.pending;
    if (!interaction) return null;
    if (interaction.status !== "waiting") return { toolCallId: interaction.toolCallId, result: interaction.response };
    if (typeof this.request.requestUserInput !== "function") throw interactionError("USER_INPUT_CHANNEL_UNAVAILABLE", "Interactive user input is unavailable.");
    this.emitRequested(interaction, true);
    const response = await this.request.requestUserInput({ ...publicInteraction(interaction), restored: true });
    const result = await this.recordResponse(interaction, response, true);
    return { toolCallId: interaction.toolCallId, result };
  }

  /** Clear a resolved interaction only after its matching tool result is in context. */
  async acknowledgeToolResults(toolMessages = []) {
    if (!this.pending || this.pending.status === "waiting") return false;
    const matched = (Array.isArray(toolMessages) ? toolMessages : []).some((message) => message?.role === "tool" && String(message.tool_call_id || "") === this.pending.toolCallId);
    if (!matched) return false;
    this.pending = null;
    await this.persistPendingState();
    return true;
  }

  emitRequested(interaction, restored) {
    this.emit({ type: "user-input-requested", interaction: publicInteraction(interaction), restored: restored === true, toolCallId: interaction.toolCallId, summary: restored ? "The restored agent run is waiting for your decision." : "The agent is waiting for your decision." });
  }

  async recordResponse(interaction, response, restored) {
    const result = normalizeResponse(interaction, response);
    interaction.status = result.declined ? "declined" : "answered";
    interaction.response = result;
    interaction.responseRecordedAt = new Date().toISOString();
    await this.persistPendingState();
    await this.request.lifecycleHooks?.run?.(result.declined ? "user-input-declined" : "user-input-resolved", { interaction: publicInteraction(interaction), result, restored: restored === true });
    this.emit({
      type: result.declined ? "user-input-declined" : "user-input-resolved",
      interactionId: interaction.id,
      toolCallId: interaction.toolCallId,
      answers: result.answers,
      restored: restored === true,
      responseRecordedAt: interaction.responseRecordedAt,
      summary: result.declined ? "The user declined to answer." : "The user answered the agent's questions."
    });
    return result;
  }

  async persistPendingState() {
    try { await this.onChange(); }
    catch (error) {
      this.emit({ type: "recovery-warning", reason: "user-input-snapshot-failed", error: error?.message || String(error), summary: "The pending user question could not be added to the recovery snapshot." });
    }
  }
}

function normalizeQuestions(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) throw interactionError("USER_INPUT_INVALID", "Provide between one and three questions.");
  const seenQuestions = new Set();
  return value.map((entry, index) => {
    const question = String(entry?.question || "").trim();
    const header = String(entry?.header || "Decision").trim().slice(0, 24);
    if (!question || seenQuestions.has(question)) throw interactionError("USER_INPUT_INVALID", `Question ${index + 1} must be non-empty and unique.`);
    seenQuestions.add(question);
    const options = Array.isArray(entry?.options) ? entry.options : [];
    if (options.length < 2 || options.length > 4) throw interactionError("USER_INPUT_INVALID", `Question ${index + 1} must have two to four options.`);
    const labels = new Set();
    const normalizedOptions = options.map((option) => {
      const label = String(option?.label || "").trim().slice(0, 80);
      if (!label || labels.has(label)) throw interactionError("USER_INPUT_INVALID", `Question ${index + 1} contains an empty or duplicate option.`);
      labels.add(label);
      return { label, description: String(option?.description || "").trim().slice(0, 500) };
    });
    return { question, header, options: normalizedOptions, multiSelect: entry?.multiSelect === true, allowFreeText: entry?.allowFreeText !== false };
  });
}

function normalizeResponse(interaction, value = {}) {
  if (value?.declined === true || value?.cancelled === true) return { interactionId: interaction.id, declined: true, answers: {} };
  const source = value?.answers && typeof value.answers === "object" ? value.answers : {};
  const answers = {};
  for (const question of interaction.questions) {
    const raw = source[question.question];
    if (Array.isArray(raw)) answers[question.question] = raw.map((entry) => String(entry).trim()).filter(Boolean);
    else if (raw != null && String(raw).trim()) answers[question.question] = String(raw).trim();
  }
  return { interactionId: interaction.id, declined: false, answers };
}

function publicInteraction(value) { return { id: value.id, toolCallId: value.toolCallId, questions: value.questions, reason: value.reason, requestedAt: value.requestedAt }; }
function privateInteraction(value) { return { ...publicInteraction(value), status: value.status, response: value.response, responseRecordedAt: value.responseRecordedAt }; }
function interactionError(code, message) { const error = new Error(message); error.code = code; error.retryable = false; error.doNotRetry = true; return error; }

module.exports = { InteractionGate, normalizeQuestions };
