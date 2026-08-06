/**
 * Preference task bridge (M11.4b wiring helpers).
 *
 * Pure functions that translate between the live agent loop and the deterministic
 * task-profile modules for the preferences-update profile:
 *
 *   - parseExplicitPreferenceTargets: extract fully-qualified preference keys and a
 *     desired value from the prompt, when the user stated them explicitly. High
 *     precision by design — only dotted paths count, and a value is set only when the
 *     prompt is unambiguous. When nothing parses, the profile still restricts the tool
 *     surface but readiness stays incomplete (the gate never forces an action).
 *
 *   - deriveTaskObservation: map a live preferences tool result into the compact
 *     observation the reducer consumes. Defensive about result shape: if the expected
 *     fields are absent, it degrades to "nothing resolved / not verified", so a wrong
 *     assumption fails safe (no forced action) rather than acting incorrectly.
 *
 * Pure: no IO, no provider calls, no side effects.
 */

"use strict";

const { verifyPersistedValues } = require("./workflow-progression");

// A fully-qualified preference path: <group>.<key...> (e.g. aiCompanionSettings.chatX).
const DOTTED_KEY = /\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)\b/g;
const TRUE_INTENT = /\b(true|enabled?|turn\s+on|switch\s+on|on)\b/i;
const FALSE_INTENT = /\b(false|disabled?|turn\s+off|switch\s+off|off)\b/i;

function toText(value) {
  return String(value == null ? "" : value);
}

/**
 * Parse explicit fully-qualified preference targets and a desired value from a prompt.
 *
 * @param {string} prompt
 * @returns {{ requestedKeys: string[], desiredValues: object, valueKnown: boolean }}
 */
function parseExplicitPreferenceTargets(prompt) {
  const text = toText(prompt);
  const requestedKeys = [...new Set((text.match(DOTTED_KEY) || []).filter((token) => token.includes(".")))];

  const wantsTrue = TRUE_INTENT.test(text);
  const wantsFalse = FALSE_INTENT.test(text);
  // A value is known only when the prompt is unambiguous (exactly one direction).
  const valueKnown = wantsTrue !== wantsFalse;
  const value = wantsTrue;

  const desiredValues = {};
  if (valueKnown) for (const key of requestedKeys) desiredValues[key] = value;

  return { requestedKeys, desiredValues, valueKnown };
}

function readEntries(result) {
  if (!result || typeof result !== "object") return [];
  if (Array.isArray(result.entries)) return result.entries;
  if (Array.isArray(result.results)) return result.results;
  if (Array.isArray(result.preferences)) return result.preferences;
  return [];
}

function entryKey(entry) {
  if (!entry || typeof entry !== "object") return "";
  return toText(entry.key || entry.path || entry.name);
}

/**
 * Derive the compact reducer observation from a live preferences tool result.
 *
 * @param {string} name - The tool name.
 * @param {object} result - The tool result.
 * @param {object} ctx - { requestedKeys: string[], desiredValues: object }
 * @returns {object|null} An observation for task_profile_updated, or null.
 */
function deriveTaskObservation(name, result, ctx = {}) {
  const requestedKeys = Array.isArray(ctx.requestedKeys) ? ctx.requestedKeys.map(String) : [];
  const desiredValues = ctx.desiredValues && typeof ctx.desiredValues === "object" ? ctx.desiredValues : {};

  if (name === "preferences_search") {
    const found = new Set(readEntries(result).map(entryKey).filter(Boolean));
    const matches = requestedKeys.filter((key) => found.has(key)).map((key) => ({ key, descriptor: "" }));
    const resolvedAllKeys = requestedKeys.length > 0 && requestedKeys.every((key) => found.has(key));
    return { tool: "preferences_search", accepted: true, matches, resolvedAllKeys };
  }

  if (name === "preferences_update") {
    // Accepted only when the update changed values AND left nothing unresolved.
    const unresolved = Array.isArray(result?.unresolved) ? result.unresolved : [];
    const accepted = result?.changed === true && unresolved.length === 0;
    const matches = (Array.isArray(result?.changes) ? result.changes : [])
      .filter((change) => change && change.changed !== false)
      .map((change) => ({ key: toText(change.key) }))
      .filter((m) => m.key);
    return { tool: "preferences_update", accepted, matches };
  }

  if (name === "preferences_get") {
    const observed = {};
    const matches = [];
    for (const entry of readEntries(result)) {
      const key = entryKey(entry);
      if (!key) continue;
      matches.push({ key, value: entry.value });
      observed[key] = entry.value;
    }
    const verified = verifyPersistedValues(desiredValues, observed).verified;
    return { tool: "preferences_get", accepted: true, matches, verified };
  }

  return null;
}

module.exports = {
  parseExplicitPreferenceTargets,
  deriveTaskObservation
};
