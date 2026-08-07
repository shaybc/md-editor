"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { requiresEvidence, evaluateCompletionEvidence, buildEvidenceSteeringMessage } = require("../resources/ai-companion/core/completion-evidence-gate");

test("diagnostic/implementation/conformance tasks require evidence; answer tasks do not", () => {
  assert.equal(requiresEvidence({ taskType: "diagnostic" }), true);
  assert.equal(requiresEvidence({ taskType: "implementation" }), true);
  assert.equal(requiresEvidence({ taskType: "conformance" }), true);
  assert.equal(requiresEvidence({ taskType: "answer" }), false);
});

test("a mustInspect criterion forces evidence even for an answer task", () => {
  assert.equal(requiresEvidence({ taskType: "answer", acceptanceCriteria: [{ id: "AC1", mustInspect: ["src/x.js"] }] }), true);
});

test("completion with no tools on an evidence-requiring task is blocked", () => {
  const r = evaluateCompletionEvidence({ contract: { taskType: "diagnostic" }, usedTools: false });
  assert.equal(r.blocked, true);
  assert.equal(r.reasonCode, "completion_requires_evidence");
});

test("completion with tools used is allowed", () => {
  const r = evaluateCompletionEvidence({ contract: { taskType: "diagnostic" }, usedTools: true });
  assert.equal(r.blocked, false);
});

test("an answer task without evidence is not blocked", () => {
  assert.equal(evaluateCompletionEvidence({ contract: { taskType: "answer" }, usedTools: false }).blocked, false);
});

test("a genuine blocker report is exempt from the gate", () => {
  assert.equal(evaluateCompletionEvidence({ contract: { taskType: "diagnostic" }, usedTools: false, reportedBlocked: true }).blocked, false);
});

test("the gate stops blocking after the retry budget, but flags it unmet", () => {
  const r = evaluateCompletionEvidence({ contract: { taskType: "diagnostic" }, usedTools: false, retriesUsed: 2, maxRetries: 2 });
  assert.equal(r.blocked, false);
  assert.equal(r.exhausted, true);
  assert.equal(r.reasonCode, "evidence_required_but_unmet");
});

test("evidenceCount>0 counts as evidence even without usedTools flag", () => {
  assert.equal(evaluateCompletionEvidence({ contract: { taskType: "diagnostic" }, usedTools: false, evidenceCount: 3 }).blocked, false);
});

test("steering message names the required inspections", () => {
  const msg = buildEvidenceSteeringMessage({ acceptanceCriteria: [{ mustInspect: ["src/a.js", "src/b.js"] }] });
  assert.match(msg, /Do not answer yet/);
  assert.match(msg, /src\/a\.js/);
});
