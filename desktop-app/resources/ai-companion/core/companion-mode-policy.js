/**
 * Central mode-policy seam for the AI Companion stateful controller (M8.1).
 *
 * Purpose
 * -------
 * Before M8, controller eligibility was decided by scattered `mode === "agent"`
 * checks inside the shared tool loop and Agent mode wiring. That made it
 * impossible for another conversational mode (Plan in M8, Chat later in M9) to
 * opt into the same controller without duplicating the loop.
 *
 * This module concentrates the "which mode may use which stateful controller
 * capability, and under which settings flag" decision in one place. The tool
 * loop and mode entry points consult `resolveModePolicy` instead of hard-coding
 * a mode name.
 *
 * Invariants
 * ----------
 * - Agent behavior is preserved exactly. For `mode === "agent"` the resolved
 *   eligibility booleans are logically identical to the previous inline
 *   expressions (see `ai-companion-mode-policy.test.js`, which pins this).
 * - Plan mode is read-only. `mutability` is `"read-only"` and mutation is never
 *   authorized through this policy.
 * - A mode with no controller spec (chat, autocomplete, git-summary,
 *   testConnection, …) is never controller-eligible.
 * - This module is pure and provider-neutral: it reads only settings and never
 *   performs I/O or model calls.
 *
 * Runtime-owned guards that depend on live objects (for example the presence of
 * an authoritative state session) are intentionally NOT resolved here; callers
 * still apply them so the composition stays byte-for-byte equivalent to the
 * legacy code.
 */

"use strict";

/**
 * Per-mode controller specification.
 *
 * `mutability` documents whether the mode may ever perform workspace mutations
 * through the controller. Sub-capability flags name the settings key that gates
 * each capability. Plan's finer-grained capability flags do not exist yet (they
 * arrive with M8.4/M8.5); until then they resolve to `false` because the named
 * settings keys are undefined, which keeps Plan fully legacy while the master
 * `planStatefulControllerEnabled` flag is off.
 */
const MODE_CONTROLLER_SPECS = Object.freeze({
  agent: Object.freeze({
    mutability: "read-write",
    controllerFlag: "agentDecisionControllerEnabled",
    verifierCompletionFlag: "agentVerifierCompletionEnabled",
    progressEvaluationFlag: "agentProgressEvaluationEnabled",
    progressControlFlag: "agentProgressControlEnabled",
    durableRecoveryFlag: "agentDurableRecoveryEnabled",
    requiresIntentContracts: true,
    requiresCompletionAssessment: true
  }),
  plan: Object.freeze({
    mutability: "read-only",
    controllerFlag: "planStatefulControllerEnabled",
    // Plan-specific capability flags are introduced in later M8 sub-milestones.
    // Referencing not-yet-defined keys keeps them false until then.
    verifierCompletionFlag: "planVerifierCompletionEnabled",
    progressEvaluationFlag: "planProgressEvaluationEnabled",
    progressControlFlag: "planProgressControlEnabled",
    durableRecoveryFlag: "planDurableRecoveryEnabled",
    requiresIntentContracts: true,
    requiresCompletionAssessment: false
  })
});

/** Modes that participate in the intent/observation conversational pipeline. */
const CONVERSATIONAL_MODES = Object.freeze(["agent", "chat", "plan"]);

function flagOn(settings, key) {
  return Boolean(settings) && settings[key] === true;
}

function completionAssessmentOn(settings) {
  return Boolean(settings)
    && Boolean(settings.intentExperiment)
    && settings.intentExperiment.intentCompletionAssessment === true;
}

/**
 * Resolve the stateful-controller policy for a mode + settings pair.
 *
 * @param {string} mode - The companion mode ("agent", "plan", "chat", …).
 * @param {object} [settings] - Normalized AI Companion settings.
 * @returns {{
 *   mode: string,
 *   isControllerMode: boolean,
 *   mutability: "read-only"|"read-write",
 *   controllerEligible: boolean,
 *   verifierCompletionEligible: boolean,
 *   progressEvaluationEligible: boolean,
 *   progressControlEligible: boolean,
 *   durableRecoveryEligible: boolean,
 *   allowsMutation: boolean
 * }}
 */
function resolveModePolicy(mode, settings = {}) {
  const spec = MODE_CONTROLLER_SPECS[mode] || null;

  if (!spec) {
    return Object.freeze({
      mode,
      isControllerMode: false,
      mutability: "read-write",
      controllerEligible: false,
      verifierCompletionEligible: false,
      progressEvaluationEligible: false,
      progressControlEligible: false,
      durableRecoveryEligible: false,
      allowsMutation: false
    });
  }

  const controllerEligible = flagOn(settings, spec.controllerFlag);
  const intentContractsSatisfied = spec.requiresIntentContracts
    ? flagOn(settings, "intentContractsEnabled")
    : true;
  const completionAssessmentSatisfied = spec.requiresCompletionAssessment
    ? completionAssessmentOn(settings)
    : true;

  const verifierCompletionEligible = controllerEligible
    && flagOn(settings, spec.verifierCompletionFlag)
    && intentContractsSatisfied
    && completionAssessmentSatisfied;

  const progressEvaluationEligible = controllerEligible
    && flagOn(settings, spec.progressEvaluationFlag);

  const progressControlEligible = progressEvaluationEligible
    && verifierCompletionEligible
    && flagOn(settings, spec.progressControlFlag);

  const durableRecoveryEligible = controllerEligible
    && flagOn(settings, spec.durableRecoveryFlag);

  return Object.freeze({
    mode,
    isControllerMode: true,
    mutability: spec.mutability,
    controllerEligible,
    verifierCompletionEligible,
    progressEvaluationEligible,
    progressControlEligible,
    durableRecoveryEligible,
    allowsMutation: spec.mutability === "read-write"
  });
}

/** True when the mode has a controller spec at all (independent of flags). */
function isControllerMode(mode) {
  return Boolean(MODE_CONTROLLER_SPECS[mode]);
}

/** True for the conversational modes that share the observation pipeline. */
function isConversationalMode(mode) {
  return CONVERSATIONAL_MODES.includes(mode);
}

module.exports = {
  MODE_CONTROLLER_SPECS,
  CONVERSATIONAL_MODES,
  resolveModePolicy,
  isControllerMode,
  isConversationalMode
};
