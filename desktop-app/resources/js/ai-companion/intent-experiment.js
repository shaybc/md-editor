/**
 * Intent-contract experiment configuration shared by browser and headless runtimes.
 */
(function(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MarkdownViewerIntentExperiment = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  const DIMENSIONS = Object.freeze([
    "intentExtraction",
    "intentClarification",
    "intentRevision",
    "intentCompletionAssessment"
  ]);
  const ALL_ON = Object.freeze(Object.fromEntries(DIMENSIONS.map((key) => [key, true])));
  const ALL_OFF = Object.freeze(Object.fromEntries(DIMENSIONS.map((key) => [key, false])));

  /** Validate one internal experiment configuration without applying the master flag. */
  function validateIntentExperiment(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : ALL_ON;
    const experiment = Object.fromEntries(DIMENSIONS.map((key) => [key, source[key] !== false]));
    const errors = [];
    if (!experiment.intentExtraction && experiment.intentRevision) errors.push("intent-revision-requires-extraction");
    if (!experiment.intentExtraction && experiment.intentCompletionAssessment) errors.push("completion-assessment-requires-extraction");
    return { valid: errors.length === 0, errors, experiment };
  }

  /** Resolve an effective experiment, with the user master preference taking precedence. */
  function resolveIntentExperiment(value, masterEnabled, options = {}) {
    if (masterEnabled !== true) return { ...ALL_OFF };
    const validation = validateIntentExperiment(value);
    if (!validation.valid && options.rejectInvalid === true) {
      const error = new Error(`Invalid intent experiment: ${validation.errors.join(", ")}`);
      error.code = "INVALID_INTENT_EXPERIMENT";
      error.validationErrors = validation.errors;
      throw error;
    }
    return validation.valid ? validation.experiment : { ...ALL_OFF };
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /** Assign one valid internal configuration deterministically for the lifetime of a chat. */
  function assignIntentExperiment(chatId, configured = ALL_ON) {
    const candidates = Array.isArray(configured) ? configured : [configured];
    const valid = candidates.map((candidate) => validateIntentExperiment(candidate)).filter((entry) => entry.valid);
    if (!valid.length) {
      const error = new Error("No coherent intent experiment configuration is available.");
      error.code = "INVALID_INTENT_EXPERIMENT";
      throw error;
    }
    return { ...valid[stableHash(chatId) % valid.length].experiment };
  }

  return {
    ALL_OFF,
    ALL_ON,
    DIMENSIONS,
    assignIntentExperiment,
    resolveIntentExperiment,
    validateIntentExperiment
  };
});
