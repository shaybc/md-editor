/**
 * Observation -> typed-state projection + bounded context (M11.7).
 *
 * A one-action task should not cost hundreds of thousands of tokens. It does when raw
 * tool output (search hits, plan docs, binary matches) accumulates in the conversation.
 * This module projects a tool result into compact typed state — resolved keys, minimal
 * descriptors, the latest result summary — and drops the raw payload. The context the
 * model sees each turn is rebuilt from that typed state, so it does not grow with no-op
 * actions.
 *
 * Pure: no IO, no provider calls, no mutation of inputs.
 */

"use strict";

const MAX_DESCRIPTOR_CHARS = 160;
const MAX_SUMMARY_CHARS = 240;

function bounded(value, max) {
  return String(value == null ? "" : value).slice(0, max);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Create the initial compact task state for a preferences-update task.
 *
 * @param {object} params - { requestedKeys, desiredValues, requiredActionTool }
 * @returns {object} compact state.
 */
function createTaskState(params = {}) {
  return {
    requestedKeys: toArray(params.requestedKeys).map(String),
    desiredValues: params.desiredValues && typeof params.desiredValues === "object" ? { ...params.desiredValues } : {},
    requiredActionTool: bounded(params.requiredActionTool, 80),
    resolvedKeys: [],
    descriptors: {},        // key -> compact descriptor string
    observedValues: {},     // key -> value read back
    latestResultSummary: "",
    requestedKeysResolved: false
  };
}

function recomputeResolved(state) {
  const resolved = new Set(state.resolvedKeys);
  state.requestedKeysResolved = state.requestedKeys.length > 0 && state.requestedKeys.every((key) => resolved.has(key));
  return state;
}

/**
 * Project a preferences_search / preferences_get observation into typed state, keeping
 * only compact descriptors and dropping the raw payload. Idempotent: projecting the same
 * matches again does not grow the state.
 *
 * @param {object} prevState - Prior compact task state.
 * @param {object} observation - { tool, matches: [{ key, descriptor?, value? }], summary? }
 * @returns {object} New compact task state.
 */
function projectObservation(prevState, observation = {}) {
  const state = JSON.parse(JSON.stringify(prevState || createTaskState()));
  const tool = String(observation.tool || "");
  const matches = toArray(observation.matches);

  if (tool === "preferences_search" || tool === "preferences_get") {
    const resolved = new Set(state.resolvedKeys);
    for (const match of matches) {
      const key = String(match?.key || "");
      if (!key) continue;
      // Only track keys that are actually requested — ambient hits are dropped.
      if (!state.requestedKeys.includes(key)) continue;
      resolved.add(key);
      if (match.descriptor != null) state.descriptors[key] = bounded(match.descriptor, MAX_DESCRIPTOR_CHARS);
      if (Object.prototype.hasOwnProperty.call(match, "value")) state.observedValues[key] = match.value;
    }
    state.resolvedKeys = [...resolved];
  }

  state.latestResultSummary = bounded(observation.summary || `${tool}: ${matches.length} match(es)`, MAX_SUMMARY_CHARS);
  return recomputeResolved(state);
}

/**
 * Build the bounded context object the model sees for a task turn. Rebuilt from typed
 * state only — never accumulated tool history — so it stays small across no-op actions.
 *
 * @param {object} state - Compact task state.
 * @returns {object} A bounded context descriptor.
 */
function buildTaskContext(state) {
  const s = state || createTaskState();
  return {
    requestedKeys: s.requestedKeys,
    desiredValues: s.desiredValues,
    requiredActionTool: s.requiredActionTool,
    resolvedDescriptors: s.descriptors,
    observedValues: s.observedValues,
    requestedKeysResolved: s.requestedKeysResolved,
    latestResultSummary: s.latestResultSummary
  };
}

/** Rough size proxy for the built context (chars of its JSON) — for budget assertions. */
function contextSize(state) {
  return JSON.stringify(buildTaskContext(state)).length;
}

module.exports = {
  MAX_DESCRIPTOR_CHARS,
  MAX_SUMMARY_CHARS,
  createTaskState,
  projectObservation,
  buildTaskContext,
  contextSize
};
