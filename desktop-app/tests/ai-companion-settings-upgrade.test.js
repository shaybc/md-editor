"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const upgrade = require("../resources/js/ai-companion/settings-upgrade");
const { DEFAULT_AI_COMPANION_SETTINGS, normalizeAiCompanionSettings } = require("../resources/ai-companion/config/defaults");

const currentDefaults = DEFAULT_AI_COMPANION_SETTINGS;

test("plan flags default-on: a stale explicit-false store auto-upgrades without a conflict", () => {
  const stale = Object.assign({}, normalizeAiCompanionSettings({ enabled: true }), {
    planCapabilityGateEnabled: false,
    planRequireSuccessToSaveEnabled: false,
    planGitReadToolsEnabled: false
  });

  const detection = upgrade.detectSettingsUpgrade({ persisted: stale, storedRevision: undefined, currentDefaults });
  assert.equal(detection.status, "migrated");
  assert.equal(detection.conflicts.length, 0);
  assert.deepEqual(detection.autoUpgraded, {
    planCapabilityGateEnabled: true,
    planGitReadToolsEnabled: true,
    planRequireSuccessToSaveEnabled: true
  });

  const applied = upgrade.applySettingsUpgrade({ persisted: stale, currentDefaults, detection, strategy: "manual" });
  assert.equal(applied.settings.planCapabilityGateEnabled, true);
  assert.equal(applied.settings.planRequireSuccessToSaveEnabled, true);
  assert.equal(applied.settings.planGitReadToolsEnabled, true);
  assert.equal(applied.revision, upgrade.CURRENT_DEFAULTS_REVISION);
});

test("a store already at the current revision is left untouched", () => {
  const stale = { planGitReadToolsEnabled: false };
  const detection = upgrade.detectSettingsUpgrade({ persisted: stale, storedRevision: upgrade.CURRENT_DEFAULTS_REVISION, currentDefaults });
  assert.equal(detection.status, "current");
  assert.equal(detection.conflicts.length, 0);
  assert.deepEqual(detection.autoUpgraded, {});
});

test("a user already on the new default value produces no changes", () => {
  const persisted = { planGitReadToolsEnabled: true, planCapabilityGateEnabled: true, planRequireSuccessToSaveEnabled: true };
  const detection = upgrade.detectSettingsUpgrade({ persisted, storedRevision: 1, currentDefaults });
  assert.equal(detection.status, "current");
});

test("changedDefaultsBetween is bounded by the revision window", () => {
  assert.deepEqual(upgrade.changedDefaultsBetween(1, 2), {
    planCapabilityGateEnabled: false,
    planRequireSuccessToSaveEnabled: false,
    planGitReadToolsEnabled: false
  });
  assert.deepEqual(upgrade.changedDefaultsBetween(2, 2), {});
});

test("a genuine conflict is resolved by strategy while auto-upgrades still apply", () => {
  // Synthetic detection standing in for a future non-boolean default change.
  const detection = {
    status: "conflicts",
    fromRevision: 1,
    toRevision: 2,
    autoUpgraded: { planGitReadToolsEnabled: true },
    conflicts: [{ keyPath: "model", name: "Model", previousDefault: "old", userValue: "my-model", newDefault: "llama3.1" }]
  };
  const persisted = { model: "my-model", planGitReadToolsEnabled: false };
  const defaults = { model: "llama3.1", planGitReadToolsEnabled: true };

  const keepMine = upgrade.applySettingsUpgrade({ persisted, currentDefaults: defaults, detection, strategy: "keep-user" });
  assert.equal(keepMine.settings.model, "my-model");
  assert.equal(keepMine.settings.planGitReadToolsEnabled, true);

  const useDefaults = upgrade.applySettingsUpgrade({ persisted, currentDefaults: defaults, detection, strategy: "use-defaults" });
  assert.equal(useDefaults.settings.model, "llama3.1");

  const manual = upgrade.applySettingsUpgrade({ persisted, currentDefaults: defaults, detection, strategy: "manual", resolutions: [{ keyPath: "model", choice: "merged", value: "merged-model" }] });
  assert.equal(manual.settings.model, "merged-model");
});

test("forced no-UI defaults are pinned to the current default regardless of stored value", () => {
  const defaults = { planGitReadToolsEnabled: true, planCapabilityGateEnabled: true, planRequireSuccessToSaveEnabled: true, model: "x" };
  const stale = { planGitReadToolsEnabled: false, planCapabilityGateEnabled: false, planRequireSuccessToSaveEnabled: false, model: "mine" };
  const out = upgrade.applyForcedDefaults(stale, defaults);
  assert.equal(out.planGitReadToolsEnabled, true);
  assert.equal(out.planCapabilityGateEnabled, true);
  assert.equal(out.planRequireSuccessToSaveEnabled, true);
  assert.equal(out.model, "mine", "non-forced settings are untouched");
  assert.equal(stale.planGitReadToolsEnabled, false, "input object is not mutated");
});

test("manual resolution missing a conflict entry throws instead of persisting a partial result", () => {
  const detection = {
    status: "conflicts",
    fromRevision: 1,
    toRevision: 2,
    autoUpgraded: {},
    conflicts: [{ keyPath: "model", previousDefault: "old", userValue: "my-model", newDefault: "llama3.1" }]
  };
  assert.throws(
    () => upgrade.applySettingsUpgrade({ persisted: { model: "my-model" }, currentDefaults: { model: "llama3.1" }, detection, strategy: "manual", resolutions: [] }),
    (error) => error.code === "incomplete-resolution"
  );
});
