"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { resolveModePolicy, validateModeFlags, isControllerMode, isConversationalMode } =
  require("../resources/ai-companion/core/companion-mode-policy");
const { normalizeAiCompanionSettings } = require("../resources/ai-companion/config/defaults");

test("chat has a read-only controller spec but is legacy by default", () => {
  assert.equal(isControllerMode("chat"), true);
  assert.equal(isConversationalMode("chat"), true);
  const p = resolveModePolicy("chat", normalizeAiCompanionSettings({}));
  assert.equal(p.mutability, "read-only");
  assert.equal(p.allowsMutation, false);
  assert.equal(p.controllerEligible, false, "default-off flag keeps chat on the legacy path");
});

test("chat controller becomes eligible only with the master flag", () => {
  const p = resolveModePolicy("chat", normalizeAiCompanionSettings({ chatStatefulControllerEnabled: true }));
  assert.equal(p.controllerEligible, true);
  // Sub-capabilities remain off until their own flags (and prerequisites) are set.
  assert.equal(p.verifierCompletionEligible, false);
  assert.equal(p.progressEvaluationEligible, false);
  assert.equal(p.durableRecoveryEligible, false);
});

test("chat verifier completion requires controller + intent contracts", () => {
  const off = resolveModePolicy("chat", normalizeAiCompanionSettings({
    chatStatefulControllerEnabled: true, chatVerifierCompletionEnabled: true
  }));
  assert.equal(off.verifierCompletionEligible, false, "no intent contracts -> not eligible");
  const on = resolveModePolicy("chat", normalizeAiCompanionSettings({
    chatStatefulControllerEnabled: true, chatVerifierCompletionEnabled: true, intentContractsEnabled: true
  }));
  assert.equal(on.verifierCompletionEligible, true);
});

test("flag matrix flags contradictory combinations", () => {
  // Sub-capability on while master off -> invalid.
  const bad = validateModeFlags("chat", normalizeAiCompanionSettings({ chatVerifierCompletionEnabled: true }));
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.some((e) => /chatVerifierCompletionEnabled requires chatStatefulControllerEnabled/.test(e)));

  // Progress control without its prerequisites -> invalid.
  const bad2 = validateModeFlags("chat", normalizeAiCompanionSettings({
    chatStatefulControllerEnabled: true, chatProgressControlEnabled: true
  }));
  assert.equal(bad2.valid, false);
  assert.ok(bad2.errors.length >= 1);

  // A coherent combination is valid.
  const good = validateModeFlags("chat", normalizeAiCompanionSettings({
    chatStatefulControllerEnabled: true, chatVerifierCompletionEnabled: true,
    chatProgressEvaluationEnabled: true, chatProgressControlEnabled: true, intentContractsEnabled: true
  }));
  assert.equal(good.valid, true, good.errors.join("; "));

  // Default settings are valid (everything off).
  assert.equal(validateModeFlags("chat", normalizeAiCompanionSettings({})).valid, true);
});

test("adding chat spec does not change agent or plan resolution", () => {
  const agent = resolveModePolicy("agent", normalizeAiCompanionSettings({ agentDecisionControllerEnabled: true }));
  assert.equal(agent.mutability, "read-write");
  assert.equal(agent.controllerEligible, true);
  const plan = resolveModePolicy("plan", normalizeAiCompanionSettings({ planStatefulControllerEnabled: true }));
  assert.equal(plan.mutability, "read-only");
  assert.equal(plan.controllerEligible, true);
  // A mode with no spec stays ineligible.
  const none = resolveModePolicy("autocomplete", normalizeAiCompanionSettings({}));
  assert.equal(none.isControllerMode, false);
  assert.equal(none.controllerEligible, false);
});
