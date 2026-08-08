/** Compatibility facade for the flat AI Companion settings revision stamp. */

(function(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MarkdownViewerAiCompanionSettingsUpgrade = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  const CURRENT_DEFAULTS_REVISION = 3;
  const BASELINE_REVISION = 1;
  const DEFAULTS_HISTORY = Object.freeze([]);
  const DEFINITIONS = Object.freeze({});
  const FORCED_DEFAULT_KEYS = Object.freeze([]);

  function normalizeRevision(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= BASELINE_REVISION ? Math.floor(number) : BASELINE_REVISION;
  }

  function applyForcedDefaults(settings) {
    return settings;
  }

  function changedDefaultsBetween() {
    return {};
  }

  function detectSettingsUpgrade(input = {}) {
    const fromRevision = normalizeRevision(input.storedRevision);
    return {
      status: "current",
      fromRevision,
      toRevision: CURRENT_DEFAULTS_REVISION,
      conflicts: [],
      autoUpgraded: {}
    };
  }

  function applySettingsUpgrade(input = {}) {
    const detection = input.detection || detectSettingsUpgrade(input);
    const persisted = input.persisted && typeof input.persisted === "object" && !Array.isArray(input.persisted)
      ? input.persisted
      : {};
    return { settings: { ...persisted }, revision: detection.toRevision };
  }

  return {
    CURRENT_DEFAULTS_REVISION,
    BASELINE_REVISION,
    DEFAULTS_HISTORY,
    DEFINITIONS,
    FORCED_DEFAULT_KEYS,
    applyForcedDefaults,
    changedDefaultsBetween,
    detectSettingsUpgrade,
    applySettingsUpgrade
  };
});
