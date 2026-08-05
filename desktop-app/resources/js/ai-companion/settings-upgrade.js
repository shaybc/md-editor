/**
 * Settings-level defaults upgrade for AI Companion settings.
 *
 * Mirrors the prompt-profile three-way merge (see
 * ai-companion/config/prompt-profile-migration.js) but for the flat
 * `aiCompanionSettings` value blob instead of prompt text.
 *
 * A user's persisted setting is a claim relative to the default that was in
 * effect when they saved it. When an app update changes a default, we must
 * decide per key whether to silently adopt the new default (the user was on the
 * old default) or surface a conflict (the user had customised the value and the
 * default also moved). This module makes that decision deterministically with no
 * IO and no model calls, so both browser and headless runtimes agree.
 *
 * Revision model:
 *  - CURRENT_DEFAULTS_REVISION is the revision the current defaults represent.
 *  - DEFAULTS_HISTORY records, per revision bump, which default keys changed and
 *    the previous default value ("base") for each. The new default ("theirs") is
 *    read from the live defaults passed in, so it never drifts out of sync.
 *  - A persisted store without a stamped revision is treated as revision 1 (the
 *    baseline before this feature shipped).
 */
(function(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MarkdownViewerAiCompanionSettingsUpgrade = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  /** The revision that the current default settings represent. */
  const CURRENT_DEFAULTS_REVISION = 2;

  /** Store with no stamped revision predates this feature. */
  const BASELINE_REVISION = 1;

  /**
   * Ordered (ascending) record of default changes per revision. Each `changed`
   * entry maps a settings key to the default value it held BEFORE this revision
   * (its "base"). The post-change default is read live from currentDefaults.
   */
  const DEFAULTS_HISTORY = Object.freeze([
    Object.freeze({
      revision: 2,
      changed: Object.freeze({
        planCapabilityGateEnabled: false,
        planRequireSuccessToSaveEnabled: false,
        planGitReadToolsEnabled: false
      })
    })
  ]);

  /**
   * Internal flags with no user-facing control. They have no Settings UI toggle,
   * so a persisted value can only be a stale serialization of a past default, not
   * an intentional user choice. These always follow the current code default at
   * read time, which makes them robust even if a revision was stamped before the
   * value was reconciled. Remove a key here the moment it gains a real UI control.
   */
  const FORCED_DEFAULT_KEYS = Object.freeze([
    "planCapabilityGateEnabled",
    "planRequireSuccessToSaveEnabled",
    "planGitReadToolsEnabled"
  ]);

  /**
   * Overlay the forced no-UI defaults onto a settings object.
   * @param {object} settings - Normalized settings.
   * @param {object} currentDefaults - Live default settings.
   * @returns {object} A copy with forced keys pinned to the current default.
   */
  function applyForcedDefaults(settings, currentDefaults) {
    if (!isPlainObject(settings) || !isPlainObject(currentDefaults)) return settings;
    let out = settings;
    for (const key of FORCED_DEFAULT_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(currentDefaults, key)) continue;
      if (settings[key] === currentDefaults[key]) continue;
      if (out === settings) out = Object.assign({}, settings);
      out[key] = currentDefaults[key];
    }
    return out;
  }

  /** Human-readable labels for the resolution dialog. */
  const DEFINITIONS = Object.freeze({
    planCapabilityGateEnabled: Object.freeze({
      name: "Plan capability gate",
      description: "Stop or ask when Plan mode needs data no read-only tool can produce."
    }),
    planRequireSuccessToSaveEnabled: Object.freeze({
      name: "Save plan only on success",
      description: "Only save a plan when the run's completion assessment succeeds."
    }),
    planGitReadToolsEnabled: Object.freeze({
      name: "Plan git read tools",
      description: "Expose read-only git tools (status/diff/branches) to Plan mode."
    })
  });

  function isPlainObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeRevision(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < BASELINE_REVISION) return BASELINE_REVISION;
    return Math.floor(number);
  }

  function definitionFor(keyPath) {
    return DEFINITIONS[keyPath] || { name: keyPath, description: "" };
  }

  /**
   * Collect the keys whose default changed between two revisions, mapped to the
   * base (pre-change) default value. When a key changed across several revisions
   * the earliest base within the range is kept, so it reflects the value the user
   * was actually reconciled against.
   * @param {number} fromRevision
   * @param {number} toRevision
   * @returns {Object<string, *>}
   */
  function changedDefaultsBetween(fromRevision, toRevision) {
    const bases = {};
    for (const entry of DEFAULTS_HISTORY) {
      if (entry.revision <= fromRevision || entry.revision > toRevision) continue;
      for (const [keyPath, previousDefault] of Object.entries(entry.changed)) {
        if (!Object.prototype.hasOwnProperty.call(bases, keyPath)) bases[keyPath] = previousDefault;
      }
    }
    return bases;
  }

  /**
   * Deterministically classify how each changed default should be reconciled
   * against the user's persisted value.
   *
   * @param {object} input
   * @param {object} input.persisted - Raw persisted settings (may be partial).
   * @param {number} input.storedRevision - Revision the store was last reconciled to.
   * @param {object} input.currentDefaults - The live default settings.
   * @returns {{ status: "current"|"migrated"|"conflicts", fromRevision: number,
   *   toRevision: number, conflicts: Array<object>, autoUpgraded: Object<string,*> }}
   */
  function detectSettingsUpgrade(input) {
    const persisted = isPlainObject(input && input.persisted) ? input.persisted : {};
    const currentDefaults = isPlainObject(input && input.currentDefaults) ? input.currentDefaults : {};
    const fromRevision = normalizeRevision(input && input.storedRevision);
    const toRevision = CURRENT_DEFAULTS_REVISION;

    if (fromRevision >= toRevision) {
      return { status: "current", fromRevision, toRevision, conflicts: [], autoUpgraded: {} };
    }

    const bases = changedDefaultsBetween(fromRevision, toRevision);
    const conflicts = [];
    const autoUpgraded = {};

    for (const keyPath of Object.keys(bases).sort()) {
      if (!Object.prototype.hasOwnProperty.call(currentDefaults, keyPath)) continue;
      const base = bases[keyPath];
      const theirs = currentDefaults[keyPath];
      const hasMine = Object.prototype.hasOwnProperty.call(persisted, keyPath);
      const mine = hasMine ? persisted[keyPath] : base;

      if (equalValue(mine, theirs)) continue; // already at the new default
      if (equalValue(theirs, base)) continue; // default value did not really move
      if (equalValue(mine, base)) {
        autoUpgraded[keyPath] = theirs; // user was on the old default -> adopt the new one
        continue;
      }
      const definition = definitionFor(keyPath);
      conflicts.push({
        keyPath,
        name: definition.name,
        description: definition.description,
        previousDefault: base,
        userValue: mine,
        newDefault: theirs
      });
    }

    const status = conflicts.length ? "conflicts" : (Object.keys(autoUpgraded).length ? "migrated" : "current");
    return { status, fromRevision, toRevision, conflicts, autoUpgraded };
  }

  function equalValue(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a && b && typeof a === "object") return JSON.stringify(a) === JSON.stringify(b);
    return false;
  }

  /**
   * Produce the reconciled settings and the revision to stamp.
   *
   * Auto-upgrades always apply. Conflicts are resolved per `strategy`:
   *  - "keep-user": every conflict keeps the user's value.
   *  - "use-defaults": every conflict takes the new default.
   *  - "manual": each conflict is resolved by a matching entry in `resolutions`.
   *
   * When there are unresolved conflicts (manual without a full resolution set, or
   * a deferred decision) the caller should NOT stamp the new revision; this
   * function throws so a partial resolution can never be persisted silently.
   *
   * @param {object} input
   * @returns {{ settings: object, revision: number }}
   */
  function applySettingsUpgrade(input) {
    const persisted = isPlainObject(input && input.persisted) ? input.persisted : {};
    const currentDefaults = isPlainObject(input && input.currentDefaults) ? input.currentDefaults : {};
    const detection = input && input.detection
      ? input.detection
      : detectSettingsUpgrade({ persisted, storedRevision: input && input.storedRevision, currentDefaults });
    const strategy = String((input && input.strategy) || "manual");

    const settings = Object.assign({}, persisted, detection.autoUpgraded);

    const resolutionList = Array.isArray(input && input.resolutions) ? input.resolutions : [];
    const resolutions = new Map(resolutionList.map((entry) => [entry.keyPath, entry]));

    for (const conflict of detection.conflicts) {
      let choice;
      let mergedValue;
      if (strategy === "keep-user") {
        choice = "mine";
      } else if (strategy === "use-defaults") {
        choice = "theirs";
      } else {
        const resolution = resolutions.get(conflict.keyPath);
        if (!resolution || !["mine", "theirs", "merged"].includes(resolution.choice)) {
          const error = new Error(`Missing resolution for ${conflict.keyPath}.`);
          error.code = "incomplete-resolution";
          throw error;
        }
        choice = resolution.choice;
        mergedValue = resolution.value;
      }
      if (choice === "theirs") settings[conflict.keyPath] = currentDefaults[conflict.keyPath];
      else if (choice === "merged") settings[conflict.keyPath] = mergedValue;
      else settings[conflict.keyPath] = conflict.userValue;
    }

    return { settings, revision: detection.toRevision };
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
