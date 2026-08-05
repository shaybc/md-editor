"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  resolveModePolicy,
  isControllerMode,
  isConversationalMode
} = require("../resources/ai-companion/core/companion-mode-policy");

/**
 * Legacy inline expressions that gated controller eligibility before the M8.1
 * mode-policy seam. These reproduce the exact conjunctions that used to live in
 * agent-tool-loop.js (minus the runtime-only `Boolean(agentStateSession)` guard,
 * which the loop still applies inline). The equivalence tests below pin the seam
 * to these formulas so Agent behavior cannot drift.
 */
function legacyAgentControllerEnabled(mode, s) {
  return mode === "agent" && s.agentDecisionControllerEnabled === true;
}
function legacyAgentVerifierCompletionEnabled(mode, s) {
  return mode === "agent"
    && s.agentVerifierCompletionEnabled === true
    && s.agentDecisionControllerEnabled === true
    && s.intentContractsEnabled === true
    && s.intentExperiment?.intentCompletionAssessment === true;
}
function legacyAgentProgressEvaluationEnabled(mode, s) {
  return legacyAgentControllerEnabled(mode, s) && s.agentProgressEvaluationEnabled === true;
}

function* settingsMatrix() {
  const bits = [false, true];
  for (const controller of bits)
    for (const verifier of bits)
      for (const progressEval of bits)
        for (const intent of bits)
          for (const assessment of bits) {
            yield {
              agentDecisionControllerEnabled: controller,
              agentVerifierCompletionEnabled: verifier,
              agentProgressEvaluationEnabled: progressEval,
              intentContractsEnabled: intent,
              intentExperiment: { intentCompletionAssessment: assessment }
            };
          }
}

test("agent policy reproduces the legacy controller-eligibility formulas exactly", () => {
  let checked = 0;
  for (const s of settingsMatrix()) {
    const policy = resolveModePolicy("agent", s);
    assert.equal(
      policy.controllerEligible,
      legacyAgentControllerEnabled("agent", s),
      `controllerEligible mismatch for ${JSON.stringify(s)}`
    );
    assert.equal(
      policy.verifierCompletionEligible,
      legacyAgentVerifierCompletionEnabled("agent", s),
      `verifierCompletionEligible mismatch for ${JSON.stringify(s)}`
    );
    assert.equal(
      policy.progressEvaluationEligible,
      legacyAgentProgressEvaluationEnabled("agent", s),
      `progressEvaluationEligible mismatch for ${JSON.stringify(s)}`
    );
    checked += 1;
  }
  assert.equal(checked, 32);
});

test("agent remains read-write and mutation-capable", () => {
  const policy = resolveModePolicy("agent", { agentDecisionControllerEnabled: true });
  assert.equal(policy.isControllerMode, true);
  assert.equal(policy.mutability, "read-write");
  assert.equal(policy.allowsMutation, true);
});

test("plan is a read-only controller mode gated by planStatefulControllerEnabled", () => {
  const off = resolveModePolicy("plan", { planStatefulControllerEnabled: false });
  assert.equal(off.isControllerMode, true);
  assert.equal(off.controllerEligible, false, "plan must be legacy while the flag is off");

  const on = resolveModePolicy("plan", { planStatefulControllerEnabled: true, intentContractsEnabled: true });
  assert.equal(on.controllerEligible, true);
  assert.equal(on.mutability, "read-only");
  assert.equal(on.allowsMutation, false, "plan may never mutate the workspace");
});

test("plan sub-capabilities stay off until their own flags exist (later M8 sub-milestones)", () => {
  const on = resolveModePolicy("plan", {
    planStatefulControllerEnabled: true,
    intentContractsEnabled: true,
    // Any agent-named capability flags must not leak into Plan eligibility.
    agentVerifierCompletionEnabled: true,
    agentProgressEvaluationEnabled: true,
    agentProgressControlEnabled: true,
    agentDurableRecoveryEnabled: true
  });
  assert.equal(on.verifierCompletionEligible, false);
  assert.equal(on.progressEvaluationEligible, false);
  assert.equal(on.progressControlEligible, false);
  assert.equal(on.durableRecoveryEligible, false);
});

test("non-controller modes are never controller-eligible", () => {
  for (const mode of ["chat", "autocomplete", "gitSummary", "testConnection", "unknown"]) {
    const policy = resolveModePolicy(mode, {
      agentDecisionControllerEnabled: true,
      planStatefulControllerEnabled: true,
      intentContractsEnabled: true
    });
    assert.equal(policy.isControllerMode, false, `${mode} must not be a controller mode`);
    assert.equal(policy.controllerEligible, false);
    assert.equal(policy.verifierCompletionEligible, false);
    assert.equal(policy.durableRecoveryEligible, false);
  }
});

test("mode classification helpers", () => {
  assert.equal(isControllerMode("agent"), true);
  assert.equal(isControllerMode("plan"), true);
  assert.equal(isControllerMode("chat"), false);
  assert.equal(isConversationalMode("chat"), true);
  assert.equal(isConversationalMode("plan"), true);
  assert.equal(isConversationalMode("gitSummary"), false);
});

test("progress control requires evaluation and verifier eligibility together", () => {
  // Agent path: control on but verifier off must stay ineligible.
  const s = {
    agentDecisionControllerEnabled: true,
    agentProgressEvaluationEnabled: true,
    agentProgressControlEnabled: true,
    agentVerifierCompletionEnabled: false,
    intentContractsEnabled: true,
    intentExperiment: { intentCompletionAssessment: true }
  };
  const policy = resolveModePolicy("agent", s);
  assert.equal(policy.progressEvaluationEligible, true);
  assert.equal(policy.verifierCompletionEligible, false);
  assert.equal(policy.progressControlEligible, false);
});
