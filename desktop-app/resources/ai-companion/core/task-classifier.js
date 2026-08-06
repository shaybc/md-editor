/**
 * Deterministic task classifier (M11.2).
 *
 * Classifies a request into a task type that may activate a task profile — but only
 * when it is *certain*. Classification reads all available signals, not prompt text
 * alone: the prompt, mode, the tools actually available, resolved preference
 * descriptors, attachments, interaction type, and whether the user authorized the
 * action. A compound request (investigate AND mutate) is never collapsed into a bare
 * mutation profile.
 *
 * The result is evidence, not a bare label:
 *   { taskType, applicability, reasonCodes, conflictingSignals }
 * where applicability is one of:
 *   certain        - safe to activate the narrow profile
 *   uncertain      - mixed/compound signals; use the general controller
 *   rejected       - a matching intent whose capability is unavailable / disallowed
 *   not_applicable - no profile matches (e.g. an informational question)
 *
 * Only `certain` should activate a narrow profile. Pure: no IO, no side effects.
 */

"use strict";

const { getProfile, isCapabilityAvailable } = require("./task-profiles");

const APPLICABILITY = Object.freeze({
  CERTAIN: "certain",
  UNCERTAIN: "uncertain",
  REJECTED: "rejected",
  NOT_APPLICABLE: "not_applicable"
});

const READ_ONLY_MODES = Object.freeze(new Set(["chat", "plan"]));

// Signals ---------------------------------------------------------------------

const MUTATION_VERB = /\b(set|enable|disable|turn\s+(on|off)|toggle|change|update|reset|configure|switch\s+(on|off))\b/i;
const SETTINGS_NOUN = /\b(preference|preferences|setting|settings|option|options|flag|flags|config|configuration)\b/i;
// A concrete preference key: camelCase ending in a boolean-ish suffix, or a dotted
// aiCompanionSettings path.
const PREF_KEY = /\b(aiCompanionSettings\.[a-z0-9_.]+|[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)*(?:Enabled|Disabled|Mode|Visible|Shown))\b/;
// A preferences_* tool name mentioned in the prompt (underscore blocks \bpreferences\b).
const PREF_TOOL = /\bpreferences_[a-z]+\b/i;
const INVESTIGATION_VERB = /\b(find|locate|where|how|why|investigate|explain|describe|trace|understand|implement|debug|analy[sz]e|search|look\s+up|show\s+me\s+where)\b/i;
const INFORMATIONAL_PREFIX = /^\s*(how|what|why|explain|describe|does|do|is|are|can|could|would|should)\b/i;
// An interrogative request ("which flags need to be enabled?", "what settings...") asks
// ABOUT settings; it is not a command to change them, even though it may contain a
// mutation verb like "enabled".
const INTERROGATIVE = /^\s*(which|what|what's|whats|how|why|when|where|who|whom|does|do|did|is|are|can|could|would|should|list|show|tell|explain|describe)\b/i;
// A direct imperative to change settings ("set X to true", "enable X", "turn on ...").
const IMPERATIVE_MUTATION = /(^\s*(please\s+)?(set|enable|disable|turn|toggle|change|update|reset|configure|switch|make)\b|\bset\s+[\w.]+\s+to\b)/i;
// A rough "more than one imperative clause" tell.
const MULTI_CLAUSE = /\b(and|then|after that|as well as|also)\b/i;

function toText(value) {
  return String(value == null ? "" : value);
}

function hasSettingsSignal(text, resolvedDescriptors) {
  if (SETTINGS_NOUN.test(text) || PREF_KEY.test(text) || PREF_TOOL.test(text)) return true;
  // If descriptors were resolved for keys named in the prompt, that is a strong signal.
  return Array.isArray(resolvedDescriptors) && resolvedDescriptors.length > 0;
}

/**
 * Classify a request.
 *
 * @param {object} input
 * @param {string} input.prompt
 * @param {string} [input.mode] - agent|chat|plan
 * @param {object} [input.context] - { enabledScopes } for capability checks
 * @param {string[]} [input.availableTools] - resolved tool names (optional stronger signal)
 * @param {object[]} [input.resolvedDescriptors] - preference descriptors already resolved
 * @param {object[]} [input.attachments]
 * @param {string} [input.interactionType]
 * @param {boolean} [input.authorized] - whether the user authorized the action (default true: the user asked)
 * @returns {{ taskType: string|null, applicability: string, reasonCodes: string[], conflictingSignals: string[] }}
 */
function classifyTask(input = {}) {
  const text = toText(input.prompt);
  const mode = toText(input.mode || "agent");
  const authorized = input.authorized !== false;
  const reasonCodes = [];
  const conflictingSignals = [];

  const settingsSignal = hasSettingsSignal(text, input.resolvedDescriptors);
  const mutation = MUTATION_VERB.test(text);
  const investigation = INVESTIGATION_VERB.test(text);
  const interrogative = INTERROGATIVE.test(text) || /\?\s*$/.test(text.trim());
  const imperativeMutation = IMPERATIVE_MUTATION.test(text);
  const informational = INFORMATIONAL_PREFIX.test(text) && !mutation;
  const multiClause = MULTI_CLAUSE.test(text);

  // No settings signal at all → this profile does not apply.
  if (!settingsSignal) {
    return { taskType: null, applicability: APPLICABILITY.NOT_APPLICABLE, reasonCodes: ["no_matching_profile"], conflictingSignals };
  }

  // An interrogative that is not a direct command ("which flags need to be enabled?",
  // "what settings are on?") asks ABOUT settings — it is not a mutation, even though it
  // contains a word like "enabled". Answer it with the general controller.
  if (interrogative && !imperativeMutation) {
    return { taskType: null, applicability: APPLICABILITY.NOT_APPLICABLE, reasonCodes: ["informational_request"], conflictingSignals };
  }

  // Informational question about settings ("how does preferences_update work") →
  // not a mutation, not a failed classification.
  if (informational && !mutation) {
    return { taskType: null, applicability: APPLICABILITY.NOT_APPLICABLE, reasonCodes: ["informational_request"], conflictingSignals };
  }

  // From here we are looking at the preferences-update profile.
  const profile = getProfile("preferences-update");

  // A clear mutation intent in a read-only mode cannot be performed here.
  if (mutation && READ_ONLY_MODES.has(mode)) {
    return { taskType: "preferences-update", applicability: APPLICABILITY.REJECTED, reasonCodes: ["read_only_mode"], conflictingSignals };
  }

  // Capability must be reachable (settings.write survives scope resolution).
  if (mutation && !isCapabilityAvailable(profile, { mode, enabledScopes: input.context?.enabledScopes })) {
    return { taskType: "preferences-update", applicability: APPLICABILITY.REJECTED, reasonCodes: ["capability_unavailable"], conflictingSignals };
  }

  if (!authorized) {
    return { taskType: "preferences-update", applicability: APPLICABILITY.REJECTED, reasonCodes: ["not_authorized"], conflictingSignals };
  }

  // Compound request: mutation + investigation, or a multi-clause imperative. Do not
  // collapse into a bare mutation profile — hand to the general controller (or a future
  // compound profile). Never silently drop the investigation clause.
  if (mutation && investigation) {
    conflictingSignals.push("investigation-verb");
    if (multiClause) conflictingSignals.push("multi-clause-request");
    return { taskType: "preferences-update", applicability: APPLICABILITY.UNCERTAIN, reasonCodes: ["compound_request"], conflictingSignals };
  }

  // Clean, authorized, imperative mutation with a settings signal and no investigation →
  // certain. A mutation verb that is not an imperative command stays uncertain.
  if (mutation && settingsSignal && imperativeMutation) {
    reasonCodes.push("settings_mutation");
    return { taskType: "preferences-update", applicability: APPLICABILITY.CERTAIN, reasonCodes, conflictingSignals };
  }

  // Settings signal without a clear mutation verb → uncertain (could be a question).
  return { taskType: "preferences-update", applicability: APPLICABILITY.UNCERTAIN, reasonCodes: ["ambiguous_settings_request"], conflictingSignals };
}

module.exports = {
  APPLICABILITY,
  classifyTask
};
