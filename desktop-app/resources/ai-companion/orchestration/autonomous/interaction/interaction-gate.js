/** Run-scoped user decision requests that suspend model execution without granting authority. */

"use strict";

const crypto = require("node:crypto");

class InteractionGate {
  constructor(request, emit = () => {}, onChange = () => {}) {
    this.request = request;
    this.emit = typeof emit === "function" ? emit : () => {};
    this.onChange = typeof onChange === "function" ? onChange : () => {};
    this.pending = null;
  }

  /** Ask the foreground user for bounded task information and return it as a tool result. */
  async requestChoice(input = {}) {
    if (this.pending) throw interactionError("USER_INPUT_ALREADY_PENDING", "A user decision is already pending for this run.");
    if (typeof this.request.requestUserInput !== "function") throw interactionError("USER_INPUT_CHANNEL_UNAVAILABLE", "Interactive user input is unavailable.");
    const hookDecision = await this.request.lifecycleHooks?.run?.("user-input-request", { input });
    if (hookDecision?.continue === false) throw interactionError("USER_INPUT_STOPPED", hookDecision.stopReason || "Lifecycle automation stopped the user question.");
    const effectiveInput = hookDecision?.updatedInput ? { ...input, ...hookDecision.updatedInput } : input;
    const questions = normalizeQuestions(effectiveInput.questions);
    const interaction = {
      id: crypto.randomUUID(),
      questions,
      reason: String(effectiveInput.reason || "").trim().slice(0, 500),
      requestedAt: new Date().toISOString()
    };
    this.pending = interaction;
    this.emit({ type: "user-input-requested", interaction: publicInteraction(interaction), summary: "The agent is waiting for your decision." });
    await this.persistPendingState();
    try {
      const response = await this.request.requestUserInput(publicInteraction(interaction));
      const result = normalizeResponse(interaction, response);
      await this.request.lifecycleHooks?.run?.(result.declined ? "user-input-declined" : "user-input-resolved", { interaction: publicInteraction(interaction), result });
      this.emit({
        type: result.declined ? "user-input-declined" : "user-input-resolved",
        interactionId: interaction.id,
        answers: result.answers,
        summary: result.declined ? "The user declined to answer." : "The user answered the agent's questions."
      });
      return result;
    } finally {
      this.pending = null;
      await this.persistPendingState();
    }
  }

  /** Return restart-safe metadata without attempting to serialize a live Promise. */
  snapshot() { return this.pending ? { version: 1, pending: publicInteraction(this.pending) } : { version: 1, pending: null }; }

  /** Surface an interrupted interaction after restart without silently reissuing it. */
  restore(snapshot) {
    if (!snapshot?.pending) return null;
    this.emit({
      type: "user-input-declined",
      interactionId: snapshot.pending.id,
      interrupted: true,
      summary: "A previous user question was interrupted. Ask again only if the decision is still required."
    });
    return snapshot.pending;
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

function publicInteraction(value) { return { id: value.id, questions: value.questions, reason: value.reason, requestedAt: value.requestedAt }; }
function interactionError(code, message) { const error = new Error(message); error.code = code; error.retryable = false; error.doNotRetry = true; return error; }

module.exports = { InteractionGate, normalizeQuestions };
