/**
 * Chat controller depth selection + typed direct-turn protocol (M9.1).
 *
 * The chat router (`chat-request-router.js`) classifies a turn as direct, grounded,
 * or complex. This module maps that route to *how much controller* the turn uses
 * and interprets the typed direct-turn response so a `direct` turn can explicitly
 * escalate. Pure: no IO, no provider calls, no side effects.
 *
 * NOTE: M9.1 establishes the seam and the pure decision logic. Wiring these into
 * the shared stateful controller loop (state session, reducer, verification) is
 * M9.2+. Until then the chat controller flag is a resolved no-op and Chat keeps
 * its existing routed execution.
 */

"use strict";

const { CHAT_ROUTES } = require("./chat-request-router");

/** Controller depth per route. */
const CHAT_DEPTH = Object.freeze({
  DIRECT: "direct",
  GROUNDED: "grounded",
  COMPLEX: "complex"
});

/** Typed outcomes a single direct-turn model response may resolve to. */
const DIRECT_TURN_OUTCOMES = Object.freeze({
  PROPOSE_ANSWER: "propose_answer",
  REQUEST_GROUNDING: "request_grounding",
  REQUEST_COMPLEX: "request_complex_investigation",
  REQUEST_USER_INPUT: "request_user_input"
});

const DIRECT_TURN_OUTCOME_SET = Object.freeze(new Set(Object.values(DIRECT_TURN_OUTCOMES)));

/**
 * Map a router route to the controller depth for the turn.
 *
 * @param {string} route - A `CHAT_ROUTES` value.
 * @returns {{ depth: string, engagesController: boolean, runsLoop: boolean }}
 *   `engagesController` is false only for the direct fast path; `runsLoop` is true
 *   only for the complex full controller loop.
 */
function selectChatControllerDepth(route) {
  switch (route) {
    case CHAT_ROUTES.DIRECT:
      return { depth: CHAT_DEPTH.DIRECT, engagesController: false, runsLoop: false };
    case CHAT_ROUTES.GROUNDED:
      return { depth: CHAT_DEPTH.GROUNDED, engagesController: true, runsLoop: false };
    case CHAT_ROUTES.COMPLEX:
      return { depth: CHAT_DEPTH.COMPLEX, engagesController: true, runsLoop: true };
    default:
      // Unknown route is treated as complex (most capable, safest for correctness).
      return { depth: CHAT_DEPTH.COMPLEX, engagesController: true, runsLoop: true };
  }
}

function parseArguments(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try { return JSON.parse(raw); } catch (_error) { return {}; }
}

/**
 * Interpret a single direct-turn model response into exactly one typed outcome.
 *
 * Accepts either a tool-call-style outcome (a tool call whose name is one of the
 * `DIRECT_TURN_OUTCOMES`) or a plain content answer. Anything that is not an
 * explicit control outcome resolves to `propose_answer` carrying the content, so
 * a model that simply answers is treated as proposing an answer (which the M9.4
 * claim classifier / safeguard then inspects).
 *
 * @param {object} message - Provider message ({ content, toolCalls }).
 * @returns {{ outcome: string, answer: string, question: string, reason: string }}
 */
function parseDirectTurnResponse(message) {
  const toolCalls = Array.isArray(message?.toolCalls) ? message.toolCalls : [];
  const control = toolCalls.find((call) => DIRECT_TURN_OUTCOME_SET.has(call?.function?.name));
  if (control) {
    const name = control.function.name;
    const args = parseArguments(control.function.arguments);
    return {
      outcome: name,
      answer: name === DIRECT_TURN_OUTCOMES.PROPOSE_ANSWER ? String(args.answer || args.content || "") : "",
      question: name === DIRECT_TURN_OUTCOMES.REQUEST_USER_INPUT ? String(args.question || "") : "",
      reason: String(args.reason || "")
    };
  }
  return {
    outcome: DIRECT_TURN_OUTCOMES.PROPOSE_ANSWER,
    answer: String(message?.content || ""),
    question: "",
    reason: ""
  };
}

/**
 * Whether a direct-turn outcome requires escalation off the direct fast path, and
 * to which depth. `propose_answer` stays direct (subject to the M9.4 safeguard).
 *
 * @returns {{ escalate: boolean, toDepth: string|null, clarify: boolean }}
 */
function directTurnEscalation(outcome) {
  switch (outcome) {
    case DIRECT_TURN_OUTCOMES.REQUEST_GROUNDING:
      return { escalate: true, toDepth: CHAT_DEPTH.GROUNDED, clarify: false };
    case DIRECT_TURN_OUTCOMES.REQUEST_COMPLEX:
      return { escalate: true, toDepth: CHAT_DEPTH.COMPLEX, clarify: false };
    case DIRECT_TURN_OUTCOMES.REQUEST_USER_INPUT:
      return { escalate: false, toDepth: null, clarify: true };
    case DIRECT_TURN_OUTCOMES.PROPOSE_ANSWER:
    default:
      return { escalate: false, toDepth: null, clarify: false };
  }
}

// Imperative asks to change/create/delete/run something in the workspace. Chat is
// read-only, so these hand off to Agent rather than being answered as if performed.
const MUTATION_INTENT = /\b(fix|edit|modify|change|update|refactor|rename|delete|remove|create|implement|apply|write|replace|save|install|add)\b[^.?!]{0,60}\b(file|files|code|function|method|class|config(?:uration)?|it|this|the\s+[\w./-]+\.\w+|to\s+[\w./-]+\.\w+|\bin\s+[\w./-]+\.\w+)/i;
const SAVE_INTENT = /\b(and\s+)?(save|write|persist|commit)\s+(it|the\s+file|the\s+change|changes)\b/i;
const EXPLAIN_PREFIX = /^\s*(how\s+(do|would|can|to)|what|why|explain|describe|show me how|can you explain)\b/i;

/**
 * Detect a request to mutate the workspace (so Chat can hand off to Agent instead
 * of silently answering read-only and implying the change was made).
 *
 * @param {string} prompt
 * @returns {{ isMutation: boolean, reason: string }}
 */
function detectMutationRequest(prompt) {
  const text = String(prompt || "");
  // "How do I fix…/Explain how to change…" is a question, not a mutation request.
  if (EXPLAIN_PREFIX.test(text)) return { isMutation: false, reason: "" };
  if (SAVE_INTENT.test(text) || MUTATION_INTENT.test(text)) {
    return { isMutation: true, reason: "mutation-requires-agent" };
  }
  return { isMutation: false, reason: "" };
}

/**
 * Build the turn/run identity for a chat request (conversation-scoped vs turn-scoped).
 */
function createTurnIdentity(request = {}) {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return {
    chatId: String(request.chatId || ""),
    conversationId: String(request.conversationId || request.chatId || ""),
    turnId: String(request.turnId || `${request.chatId || "chat"}:${request.turnIndex ?? 0}`),
    runId: String(request.runId || request.requestId || rand()),
    executionGeneration: request.executionGeneration ?? 0
  };
}

module.exports = {
  CHAT_DEPTH,
  DIRECT_TURN_OUTCOMES,
  selectChatControllerDepth,
  parseDirectTurnResponse,
  directTurnEscalation,
  detectMutationRequest,
  createTurnIdentity
};
