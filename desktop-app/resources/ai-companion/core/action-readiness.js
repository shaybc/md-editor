/**
 * Action-readiness / information-sufficiency gate (M11.3).
 *
 * Deterministically decides when discovery is complete and the runtime must act. It
 * reads typed state — the requested targets, their resolved descriptors, the desired
 * values, whether a capable tool is available, and whether the task is authorized — and
 * returns exactly one of:
 *
 *   incomplete         - facts are missing; bounded discovery may continue.
 *   ready_for_approval - facts are complete but runtime execution approval is pending.
 *   ready_for_action   - facts are complete and no approval is pending; the next
 *                        decision MUST be the action (further reads are rejected).
 *
 * Two authorizations are kept strictly separate. The user's request authorizes the task
 * *semantically* (`taskAuthorized`); the runtime approval policy decides whether *this
 * specific action may execute now* (`approvalRequired` / `approvalGranted`, supplied by
 * the caller from agent-approval-policy). Sufficiency never substitutes for approval.
 *
 * Partial resolution is all-or-nothing: while any requested target is unresolved or
 * lacks a desired value, the gate stays `incomplete`.
 *
 * Readiness is stamped and bound to the state version + a fingerprint of the resolved
 * targets and desired values, so a later change (user steering, a re-resolved
 * descriptor) invalidates a stale verdict before the action runs.
 *
 * Pure: no IO, no provider calls, no side effects.
 */

"use strict";

const crypto = require("node:crypto");

const READINESS = Object.freeze({
  INCOMPLETE: "incomplete",
  READY_FOR_APPROVAL: "ready_for_approval",
  READY_FOR_ACTION: "ready_for_action"
});

function toList(value) {
  return Array.isArray(value) ? value : [];
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

/** Stable fingerprint of the resolved target set (order-independent). */
function targetFingerprint(resolvedTargets) {
  return fingerprint([...toList(resolvedTargets)].map(String).sort());
}

/** Stable fingerprint of the desired-values map (key-sorted). */
function desiredValuesFingerprint(desiredValues) {
  const source = desiredValues && typeof desiredValues === "object" ? desiredValues : {};
  const sorted = Object.keys(source).sort().map((key) => [key, source[key]]);
  return fingerprint(sorted);
}

/**
 * Evaluate action readiness from typed state.
 *
 * @param {object} input
 * @param {string[]} input.requestedTargets - the keys/targets the user asked to act on.
 * @param {string[]} input.resolvedTargets - targets confirmed via their authoritative reader.
 * @param {object} [input.desiredValues] - map target -> desired value (known values).
 * @param {boolean} input.capableToolAvailable - the required action tool is in reach.
 * @param {string} input.requiredAction - the action tool name (e.g. preferences_update).
 * @param {boolean} [input.taskAuthorized=true] - the user semantically authorized the task.
 * @param {boolean} [input.approvalRequired=false] - from the runtime approval policy.
 * @param {boolean} [input.approvalGranted=false] - whether approval has been granted.
 * @param {number} [input.stateVersion=0] - current typed-state version (for the stamp).
 * @returns {{
 *   status: string,
 *   requiredAction: string,
 *   missingFacts: string[],
 *   approvalRequired: boolean,
 *   resolution: { requestedKeys: number, resolvedKeys: number, unresolvedKeys: number },
 *   readiness: object|null
 * }}
 */
function evaluateActionReadiness(input = {}) {
  const requested = toList(input.requestedTargets).map(String);
  const resolvedSet = new Set(toList(input.resolvedTargets).map(String));
  const desiredValues = input.desiredValues && typeof input.desiredValues === "object" ? input.desiredValues : {};
  const requiredAction = String(input.requiredAction || "");
  const taskAuthorized = input.taskAuthorized !== false;
  const approvalRequired = input.approvalRequired === true;
  const approvalGranted = input.approvalGranted === true;
  const stateVersion = Number.isFinite(Number(input.stateVersion)) ? Number(input.stateVersion) : 0;

  const missingFacts = [];

  if (!taskAuthorized) missingFacts.push("not-authorized");
  if (!requiredAction) missingFacts.push("no-required-action");
  if (!input.capableToolAvailable) missingFacts.push("no-capable-tool");

  const unresolved = requested.filter((key) => !resolvedSet.has(key));
  unresolved.forEach((key) => missingFacts.push(`unresolved:${key}`));

  // Desired value must be known for every requested target (all-or-nothing).
  requested.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(desiredValues, key)) missingFacts.push(`no-desired-value:${key}`);
  });

  if (requested.length === 0) missingFacts.push("no-requested-targets");

  const resolution = {
    requestedKeys: requested.length,
    resolvedKeys: requested.filter((key) => resolvedSet.has(key)).length,
    unresolvedKeys: unresolved.length
  };

  if (missingFacts.length > 0) {
    return { status: READINESS.INCOMPLETE, requiredAction, missingFacts, approvalRequired, resolution, readiness: null };
  }

  const stamp = {
    readinessId: `ready-${stateVersion}`,
    basedOnStateVersion: stateVersion,
    targetFingerprint: targetFingerprint(input.resolvedTargets),
    desiredValuesFingerprint: desiredValuesFingerprint(desiredValues),
    requiredAction
  };

  const status = approvalRequired && !approvalGranted ? READINESS.READY_FOR_APPROVAL : READINESS.READY_FOR_ACTION;
  return { status, requiredAction, missingFacts: [], approvalRequired, resolution, readiness: stamp };
}

/**
 * Revalidate a readiness stamp immediately before execution. Any drift in the state
 * version, the resolved-target set, the desired values, or the required action
 * invalidates the verdict (and any pending approval bound to it).
 *
 * @param {object} stamp - A readiness stamp from evaluateActionReadiness.
 * @param {object} current - { stateVersion, resolvedTargets, desiredValues, requiredAction }
 * @returns {{ valid: boolean, stale: boolean, reasons: string[] }}
 */
function revalidateReadiness(stamp, current = {}) {
  const reasons = [];
  if (!stamp || typeof stamp !== "object") return { valid: false, stale: true, reasons: ["no-stamp"] };

  const stateVersion = Number.isFinite(Number(current.stateVersion)) ? Number(current.stateVersion) : 0;
  if (stamp.basedOnStateVersion !== stateVersion) reasons.push("state-version-changed");
  if (stamp.targetFingerprint !== targetFingerprint(current.resolvedTargets)) reasons.push("resolved-targets-changed");
  if (stamp.desiredValuesFingerprint !== desiredValuesFingerprint(current.desiredValues)) reasons.push("desired-values-changed");
  if (String(current.requiredAction || "") && stamp.requiredAction !== String(current.requiredAction)) reasons.push("required-action-changed");

  const stale = reasons.length > 0;
  return { valid: !stale, stale, reasons };
}

module.exports = {
  READINESS,
  targetFingerprint,
  desiredValuesFingerprint,
  evaluateActionReadiness,
  revalidateReadiness
};
