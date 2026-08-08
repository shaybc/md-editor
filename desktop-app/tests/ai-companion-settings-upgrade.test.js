"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const upgrade = require("../resources/js/ai-companion/settings-upgrade");

test("settings compatibility facade reports the current revision without forced migrations", () => {
  const detection = upgrade.detectSettingsUpgrade({ persisted: { model: "custom" }, storedRevision: 1 });
  assert.deepEqual(detection, {
    status: "current",
    fromRevision: 1,
    toRevision: upgrade.CURRENT_DEFAULTS_REVISION,
    conflicts: [],
    autoUpgraded: {}
  });
  assert.deepEqual(upgrade.changedDefaultsBetween(1, upgrade.CURRENT_DEFAULTS_REVISION), {});
  assert.deepEqual(upgrade.DEFAULTS_HISTORY, []);
  assert.deepEqual(upgrade.FORCED_DEFAULT_KEYS, []);
});

test("settings compatibility facade preserves persisted settings and advances the revision stamp", () => {
  const persisted = { enabled: true, model: "custom", toolScopes: { "git.read": false } };
  const applied = upgrade.applySettingsUpgrade({ persisted });
  assert.deepEqual(applied.settings, persisted);
  assert.notEqual(applied.settings, persisted);
  assert.equal(applied.revision, upgrade.CURRENT_DEFAULTS_REVISION);
});

test("forced-default compatibility call leaves current user settings unchanged", () => {
  const persisted = { enabled: false, model: "custom" };
  assert.equal(upgrade.applyForcedDefaults(persisted), persisted);
});
