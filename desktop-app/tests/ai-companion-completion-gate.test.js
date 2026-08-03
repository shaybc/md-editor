"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { _test } = require("../resources/ai-companion/core/agent-tool-loop");
const { shouldAssessCompletion } = _test;

const SETTINGS = {
  intentContractsEnabled: true,
  intentExperiment: { intentCompletionAssessment: true }
};

test("verified conformance contracts are assessed (regression: missing verdict table)", () => {
  const verifiedConformance = { verifiability: "verified", taskType: "conformance" };
  assert.equal(shouldAssessCompletion(SETTINGS, verifiedConformance), true,
    "a verified conformance run must produce a completion assessment / verdict table");
});

test("verified diagnostic/implementation still assessed; verified answer is not", () => {
  assert.equal(shouldAssessCompletion(SETTINGS, { verifiability: "verified", taskType: "diagnostic" }), true);
  assert.equal(shouldAssessCompletion(SETTINGS, { verifiability: "verified", taskType: "implementation" }), true);
  // A pure answer with a verified contract is not force-assessed (no workspace outcome).
  assert.equal(shouldAssessCompletion(SETTINGS, { verifiability: "verified", taskType: "answer" }), false);
});

test("provisional/unverified contracts are always assessed regardless of task type", () => {
  assert.equal(shouldAssessCompletion(SETTINGS, { verifiability: "provisional", taskType: "answer" }), true);
  assert.equal(shouldAssessCompletion(SETTINGS, { verifiability: "unverified", taskType: "answer" }), true);
});

test("assessment is gated off when the experiment flag or feature is disabled", () => {
  const conformance = { verifiability: "verified", taskType: "conformance" };
  assert.equal(shouldAssessCompletion({ ...SETTINGS, intentContractsEnabled: false }, conformance), false);
  assert.equal(shouldAssessCompletion({ intentContractsEnabled: true, intentExperiment: { intentCompletionAssessment: false } }, conformance), false);
});
