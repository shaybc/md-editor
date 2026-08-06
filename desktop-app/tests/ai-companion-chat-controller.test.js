"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { classifyAnswerText, reconcileClaim, CLAIM_LEVELS } = require("../resources/ai-companion/core/chat-claim-classifier");
const { createAnswerArtifact, reconcileArtifact } = require("../resources/ai-companion/core/chat-answer-artifact");
const { makeCarriedFact, evaluateCarriedFact, partitionCarriedFacts } = require("../resources/ai-companion/core/chat-carried-fact");
const { detectMutationRequest, createTurnIdentity } = require("../resources/ai-companion/core/chat-route-policy");

// --- claim classifier -------------------------------------------------------

test("generic knowledge is not escalated", () => {
  const r = classifyAnswerText("A debounce delays a function until input stops.");
  assert.equal(r.level, CLAIM_LEVELS.GENERIC);
  assert.equal(r.requiresVerification, false);
});

test("file reference is a workspace claim", () => {
  const r = classifyAnswerText("The retry logic lives in agent-tool-loop.js near the top.");
  assert.equal(r.level, CLAIM_LEVELS.WORKSPACE);
  assert.equal(r.requiresVerification, true);
});

test("'this project' phrasing is a workspace claim", () => {
  const r = classifyAnswerText("In this project, tools are gated by a scope registry.");
  assert.equal(r.level, CLAIM_LEVELS.WORKSPACE);
});

test("ambiguous value claim escalates (biased toward verification)", () => {
  const r = classifyAnswerText("The timeout defaults to 30 seconds.");
  assert.equal(r.level, CLAIM_LEVELS.AMBIGUOUS);
  assert.equal(r.requiresVerification, true);
});

test("model 'general-knowledge' label cannot exempt a workspace claim", () => {
  const rec = reconcileClaim({ statement: "The config in defaults.js sets it to 5.", kind: "general-knowledge" });
  assert.equal(rec.requiresVerification, true, "scanner overrides the model label");
  assert.equal(rec.overrodeModel, true);
});

// --- answer artifact + consistency -----------------------------------------

test("workspace-fact claim without evidence is flagged", () => {
  const artifact = createAnswerArtifact({
    answerMarkdown: "The default is 3.",
    claims: [{ statement: "The default in defaults.js is 3.", kind: "workspace-fact", evidenceRefs: [] }]
  });
  const r = reconcileArtifact(artifact);
  assert.ok(r.issues.some((i) => i.type === "workspace-claim-without-evidence"));
  assert.equal(r.consistent, false);
});

test("material prose statement missing from claims is caught", () => {
  const artifact = createAnswerArtifact({
    // The prose asserts a workspace fact, but claims omits it (dodging evidence).
    answerMarkdown: "Everything looks fine. The value in config.js is 42.",
    claims: []
  });
  const r = reconcileArtifact(artifact);
  assert.ok(r.issues.some((i) => i.type === "unclassified-statement"));
});

test("a grounded answer with an evidence-backed claim reconciles", () => {
  const artifact = createAnswerArtifact({
    answerMarkdown: "The value in config.js is 42.",
    claims: [{ statement: "The value in config.js is 42.", kind: "workspace-fact", evidenceRefs: ["cite1"] }],
    citations: [{ id: "cite1", label: "config.js", ref: "config.js:10" }]
  });
  const r = reconcileArtifact(artifact);
  assert.equal(r.consistent, true, JSON.stringify(r.issues));
});

// --- carried-fact freshness -------------------------------------------------

test("carried workspace fact is reusable when fingerprints match", () => {
  const fact = makeCarriedFact({ factId: "f1", statement: "x", kind: "workspace", resourceFingerprints: { "config.js": "abc" } });
  assert.equal(evaluateCarriedFact(fact, { "config.js": "abc" }).status, "reusable");
});

test("carried workspace fact is stale when a resource changed", () => {
  const fact = makeCarriedFact({ factId: "f1", statement: "x", kind: "workspace", resourceFingerprints: { "config.js": "abc" } });
  const r = evaluateCarriedFact(fact, { "config.js": "DEF" });
  assert.equal(r.status, "stale");
  assert.deepEqual(JSON.parse(JSON.stringify(r.staleResources)), ["config.js"]);
});

test("workspace fact without fingerprints must be re-observed; general facts carry", () => {
  assert.equal(evaluateCarriedFact(makeCarriedFact({ kind: "workspace" }), {}).status, "stale");
  assert.equal(evaluateCarriedFact(makeCarriedFact({ kind: "general" }), {}).status, "reusable");
});

test("partitionCarriedFacts splits reusable and stale", () => {
  const facts = [
    makeCarriedFact({ factId: "a", kind: "workspace", resourceFingerprints: { f: "1" } }),
    makeCarriedFact({ factId: "b", kind: "workspace", resourceFingerprints: { f: "2" } }),
    makeCarriedFact({ factId: "c", kind: "general" })
  ];
  const { reusable, stale } = partitionCarriedFacts(facts, { f: "1" });
  assert.deepEqual(reusable.map((x) => x.factId).sort(), ["a", "c"]);
  assert.deepEqual(stale.map((x) => x.factId), ["b"]);
});

// --- mutation-request handoff + turn identity ------------------------------

test("mutation requests are detected; questions about fixing are not", () => {
  assert.equal(detectMutationRequest("Fix the bug in defaults.js and save the file.").isMutation, true);
  assert.equal(detectMutationRequest("Create a new file utils.js").isMutation, true);
  assert.equal(detectMutationRequest("How do I fix the bug in defaults.js?").isMutation, false);
  assert.equal(detectMutationRequest("Explain how the tool scoping works").isMutation, false);
  assert.equal(detectMutationRequest("What version is this project?").isMutation, false);
});

test("turn identity separates conversation vs turn vs run scope", () => {
  const id = createTurnIdentity({ chatId: "c1", turnIndex: 2, requestId: "r9" });
  assert.equal(id.chatId, "c1");
  assert.equal(id.turnId, "c1:2");
  assert.equal(id.runId, "r9");
});
