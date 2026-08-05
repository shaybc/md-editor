/**
 * Plan observation normalization and progress signatures (M8.3).
 *
 * Read-only observations flow through the shared observation normalizer; this
 * module adds a Plan-specific read-only guard (any effectful/mutating tool
 * result is a policy violation that must never enter Plan state) and exposes
 * strategy signatures for the M6 progress detector so conceptual repetition —
 * not only exact tool arguments — can be detected.
 */

"use strict";

const { normalizeToolObservation } = require("./agent-observation-normalizer");
const { createActionSignature, createStrategyDescriptor, compareApproachText } = require("./agent-strategy-signature");

/**
 * Normalize a read-only tool observation for Plan mode and assert it performed
 * no mutation.
 *
 * @param {object} details - Tool execution details (tool, args, result, evidenceEntry).
 * @param {object} [artifactStore]
 * @returns {{ observation: object, readOnly: boolean, violationReason: string }}
 */
function normalizePlanObservation(details = {}, artifactStore) {
  const observation = normalizeToolObservation(details, artifactStore);
  // Effect classification comes from the shared tool-effect registry via the
  // normalizer. Anything effectful is a mutation and violates Plan policy.
  const mutating = observation.effect && observation.effect !== "read" && observation.effect !== "unknown";
  return {
    observation,
    readOnly: !mutating,
    violationReason: mutating ? `plan_mode_mutation:${observation.effect}` : ""
  };
}

/**
 * Deterministic action signature for a Plan tool call, used to detect repeated
 * equivalent reads/searches.
 * @param {string} toolName
 * @param {object} [args]
 * @returns {string}
 */
function planActionSignature(toolName, args = {}) {
  return createActionSignature(toolName, args);
}

/**
 * Conceptual strategy descriptor for a Plan investigation approach, so repeated
 * plan rewrites without new coverage register as the same strategy.
 * @param {object} input
 * @returns {object}
 */
function planStrategyDescriptor(input = {}) {
  return createStrategyDescriptor(input);
}

/**
 * Compare two approach descriptions for conceptual equivalence (reused from the
 * shared strategy-signature module).
 * @param {string} abandonedApproach
 * @param {string} revisedApproach
 * @returns {object}
 */
function planApproachChange(abandonedApproach, revisedApproach) {
  return compareApproachText(abandonedApproach, revisedApproach);
}

module.exports = {
  normalizePlanObservation,
  planActionSignature,
  planStrategyDescriptor,
  planApproachChange
};
