/**
 * Workflow-step progression + read-back verification (M11.6).
 *
 * A task profile's workflow lives in typed state as the single source of truth for the
 * readiness gate, progress controller, verifier, checkpoints, and composer. This module
 * owns the ONE rule that keeps it trustworthy:
 *
 *   Only reducer-owned observation and verification events may advance a step.
 *
 * A model decision that *claims* a step is complete — through decision metadata or a
 * proposed completion — cannot advance the workflow. Steps move only when the reducer
 * derives an authoritative event from an accepted observation (e.g. an accepted
 * preferences_update) or a passing verification (read-back of persisted values).
 *
 * Read-back verification checks persisted values, not tool success: a preferences_update
 * response saying "six settings changed" is not proof; the verify step passes only when
 * a preferences_get read-back returns the requested value for every requested key.
 *
 * Pure: no IO, no provider calls, no mutation of inputs.
 */

"use strict";

const { STEP_STATUS, PROFILE_STATUS } = require("./task-profiles");

/** Who authored an advancement event. Only "reducer" may advance a step. */
const EVENT_SOURCE = Object.freeze({ REDUCER: "reducer", MODEL: "model" });

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Advance a workflow step from an authoritative event.
 *
 * @param {object} workflowState - The profile workflow state (from createWorkflowState).
 * @param {object} event - { stepId, source, evidenceAccepted }
 *   - source must be "reducer"; a "model" source is rejected.
 *   - evidenceAccepted must be true (a real, accepted observation/verification).
 * @returns {{ workflowState: object, changed: boolean, rejectedReason: string }}
 */
function advanceWorkflowStep(workflowState, event = {}) {
  if (!workflowState || !Array.isArray(workflowState.steps)) {
    return { workflowState, changed: false, rejectedReason: "no_workflow_state" };
  }
  if (event.source !== EVENT_SOURCE.REDUCER) {
    return { workflowState, changed: false, rejectedReason: "model_cannot_advance_steps" };
  }
  if (event.evidenceAccepted !== true) {
    return { workflowState, changed: false, rejectedReason: "unverified_evidence" };
  }
  const index = workflowState.steps.findIndex((step) => step.id === event.stepId);
  if (index < 0) return { workflowState, changed: false, rejectedReason: "unknown_step" };
  if (workflowState.steps[index].status === STEP_STATUS.COMPLETED) {
    return { workflowState, changed: false, rejectedReason: "already_completed" };
  }

  const next = clone(workflowState);
  next.steps[index].status = STEP_STATUS.COMPLETED;
  const following = next.steps[index + 1];
  if (following) {
    following.status = STEP_STATUS.ACTIVE;
    next.activeStepId = following.id;
  } else {
    next.activeStepId = null;
    next.profileStatus = PROFILE_STATUS.COMPLETED;
  }
  return { workflowState: next, changed: true, rejectedReason: "" };
}

/**
 * Mark the workflow failed (e.g. a verification mismatch that cannot be repaired).
 *
 * @param {object} workflowState
 * @returns {object} A new workflow state with profileStatus = failed.
 */
function failWorkflow(workflowState) {
  if (!workflowState) return workflowState;
  const next = clone(workflowState);
  next.profileStatus = PROFILE_STATUS.FAILED;
  return next;
}

/**
 * Derive the authoritative step-advancement event for the preferences-update profile
 * from an accepted observation. Returns null when the observation does not satisfy the
 * active step's completion condition — the reducer never advances on a guess.
 *
 * @param {object} workflowState
 * @param {object} observation - { tool, accepted, resolvedAllKeys, verified }
 * @returns {object|null} A reducer-sourced event, or null.
 */
function derivePreferencesStepEvent(workflowState, observation = {}) {
  if (!workflowState || !observation.accepted) return null;
  const active = workflowState.activeStepId;
  const tool = String(observation.tool || "");

  if (active === "resolve" && tool === "preferences_search" && observation.resolvedAllKeys === true) {
    return { stepId: "resolve", source: EVENT_SOURCE.REDUCER, evidenceAccepted: true };
  }
  if (active === "update" && tool === "preferences_update") {
    return { stepId: "update", source: EVENT_SOURCE.REDUCER, evidenceAccepted: true };
  }
  if (active === "verify" && tool === "preferences_get" && observation.verified === true) {
    return { stepId: "verify", source: EVENT_SOURCE.REDUCER, evidenceAccepted: true };
  }
  return null;
}

/**
 * Verify persisted preference values by read-back. A tool "success" response is not
 * enough — every requested key must be observed with its requested value.
 *
 * @param {object} requestedValues - map key -> requested value.
 * @param {object} observedValues - map key -> value read back via preferences_get.
 * @returns {{ verified: boolean, perKey: Array<object>, mismatches: Array<object>, missing: string[] }}
 */
function verifyPersistedValues(requestedValues, observedValues) {
  const requested = requestedValues && typeof requestedValues === "object" ? requestedValues : {};
  const observed = observedValues && typeof observedValues === "object" ? observedValues : {};
  const perKey = [];
  const mismatches = [];
  const missing = [];

  for (const key of Object.keys(requested)) {
    const requestedValue = requested[key];
    const present = Object.prototype.hasOwnProperty.call(observed, key);
    const observedValue = present ? observed[key] : undefined;
    const verified = present && observedValue === requestedValue;
    const entry = { key, requestedValue, observedValue, source: "preferences_get", verified };
    perKey.push(entry);
    if (!present) missing.push(key);
    else if (!verified) mismatches.push(entry);
  }

  return { verified: perKey.length > 0 && mismatches.length === 0 && missing.length === 0, perKey, mismatches, missing };
}

module.exports = {
  EVENT_SOURCE,
  advanceWorkflowStep,
  failWorkflow,
  derivePreferencesStepEvent,
  verifyPersistedValues
};
