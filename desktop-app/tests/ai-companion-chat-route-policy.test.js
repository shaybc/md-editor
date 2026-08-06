"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { CHAT_ROUTES } = require("../resources/ai-companion/core/chat-request-router");
const {
  CHAT_DEPTH,
  DIRECT_TURN_OUTCOMES,
  selectChatControllerDepth,
  parseDirectTurnResponse,
  directTurnEscalation
} = require("../resources/ai-companion/core/chat-route-policy");

test("route maps to controller depth (direct is the fast, loop-free path)", () => {
  const direct = selectChatControllerDepth(CHAT_ROUTES.DIRECT);
  assert.deepEqual(direct, { depth: CHAT_DEPTH.DIRECT, engagesController: false, runsLoop: false });
  const grounded = selectChatControllerDepth(CHAT_ROUTES.GROUNDED);
  assert.deepEqual(grounded, { depth: CHAT_DEPTH.GROUNDED, engagesController: true, runsLoop: false });
  const complex = selectChatControllerDepth(CHAT_ROUTES.COMPLEX);
  assert.deepEqual(complex, { depth: CHAT_DEPTH.COMPLEX, engagesController: true, runsLoop: true });
});

test("unknown route defaults to complex (most capable / safest)", () => {
  assert.equal(selectChatControllerDepth("nonsense").depth, CHAT_DEPTH.COMPLEX);
});

test("plain content resolves to propose_answer carrying the content", () => {
  const r = parseDirectTurnResponse({ content: "The capital of France is Paris." });
  assert.equal(r.outcome, DIRECT_TURN_OUTCOMES.PROPOSE_ANSWER);
  assert.equal(r.answer, "The capital of France is Paris.");
});

test("typed control tool calls are parsed into their outcome", () => {
  const grounding = parseDirectTurnResponse({ toolCalls: [{ function: { name: "request_grounding", arguments: JSON.stringify({ reason: "needs config" }) } }] });
  assert.equal(grounding.outcome, DIRECT_TURN_OUTCOMES.REQUEST_GROUNDING);
  assert.equal(grounding.reason, "needs config");

  const complex = parseDirectTurnResponse({ toolCalls: [{ function: { name: "request_complex_investigation", arguments: "{}" } }] });
  assert.equal(complex.outcome, DIRECT_TURN_OUTCOMES.REQUEST_COMPLEX);

  const ask = parseDirectTurnResponse({ toolCalls: [{ function: { name: "request_user_input", arguments: JSON.stringify({ question: "Which file?" }) } }] });
  assert.equal(ask.outcome, DIRECT_TURN_OUTCOMES.REQUEST_USER_INPUT);
  assert.equal(ask.question, "Which file?");

  const answer = parseDirectTurnResponse({ toolCalls: [{ function: { name: "propose_answer", arguments: JSON.stringify({ answer: "42" }) } }] });
  assert.equal(answer.outcome, DIRECT_TURN_OUTCOMES.PROPOSE_ANSWER);
  assert.equal(answer.answer, "42");
});

test("escalation mapping: grounding/complex escalate, user-input clarifies, answer stays", () => {
  assert.deepEqual(directTurnEscalation(DIRECT_TURN_OUTCOMES.REQUEST_GROUNDING), { escalate: true, toDepth: CHAT_DEPTH.GROUNDED, clarify: false });
  assert.deepEqual(directTurnEscalation(DIRECT_TURN_OUTCOMES.REQUEST_COMPLEX), { escalate: true, toDepth: CHAT_DEPTH.COMPLEX, clarify: false });
  assert.deepEqual(directTurnEscalation(DIRECT_TURN_OUTCOMES.REQUEST_USER_INPUT), { escalate: false, toDepth: null, clarify: true });
  assert.deepEqual(directTurnEscalation(DIRECT_TURN_OUTCOMES.PROPOSE_ANSWER), { escalate: false, toDepth: null, clarify: false });
});
