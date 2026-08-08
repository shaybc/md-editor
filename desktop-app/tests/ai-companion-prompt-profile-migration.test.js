"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  flattenPrompts,
  migratePromptProfile,
  resolvePromptUpgrade
} = require("../resources/ai-companion/config/prompt-profile-migration");
const {
  DEFAULT_AI_COMPANION_PROMPTS,
  PROMPTS_DEFAULT_REVISION,
  createDefaultPromptProfile
} = require("../resources/ai-companion/config/prompts");

function options(profile, currentDefaults, extra = {}) {
  return {
    profile,
    currentDefaults,
    documentType: "prompts",
    schemaVersion: 3,
    defaultRevision: 8,
    legacyDefaultsBySchema: {},
    renamesByRevision: {},
    definitions: [],
    ...extra
  };
}

test("three-way migration adds and removes untouched prompts without conflicts", () => {
  const result = migratePromptProfile(options({
    schemaVersion: 3,
    resolvedDefaultRevision: 7,
    prompts: { unchanged: "old", removed: "remove me" },
    basePrompts: { unchanged: "old", removed: "remove me" }
  }, { unchanged: "new", added: "added" }));

  assert.equal(result.status, "migrated");
  assert.deepEqual(flattenPrompts(result.profile.prompts), { added: "added", unchanged: "new" });
  assert.equal(result.profile.resolvedDefaultRevision, 8);
});

test("customized removed prompts and unknown baselines require resolution", () => {
  const result = migratePromptProfile(options({
    schemaVersion: 3,
    resolvedDefaultRevision: 7,
    prompts: { removed: "custom", unknown: "mine" },
    basePrompts: { removed: "old" }
  }, { current: "default", unknown: "theirs" }));

  assert.deepEqual(result.conflicts.map((entry) => [entry.keyPath, entry.kind]), [
    ["removed", "removed"],
    ["unknown", "unknown-baseline"]
  ]);
});

test("declared prompt renames preserve customization state", () => {
  const result = migratePromptProfile(options({
    schemaVersion: 3,
    resolvedDefaultRevision: 7,
    prompts: { oldName: "custom" },
    basePrompts: { oldName: "base" }
  }, { newName: "base" }, { renamesByRevision: { 7: { oldName: "newName" } } }));

  assert.equal(result.conflicts.length, 0);
  assert.equal(result.profile.prompts.newName, "custom");
});

test("manual resolution archives removed prompts and accepts merged values", () => {
  const migration = migratePromptProfile(options({
    schemaVersion: 3,
    resolvedDefaultRevision: 7,
    prompts: { changed: "mine", removed: "mine removed" },
    basePrompts: { changed: "base", removed: "base removed" }
  }, { changed: "theirs" }));
  const resolved = resolvePromptUpgrade({
    ...options(migration.profile, { changed: "theirs" }),
    upgradeToken: migration.upgradeToken,
    strategy: "manual",
    resolutions: [
      { keyPath: "changed", choice: "merged", value: "merged" },
      { keyPath: "removed", choice: "mine" }
    ]
  });

  assert.equal(resolved.prompts.changed, "merged");
  assert.equal(resolved.retiredPrompts.removed, "mine removed");
  assert.equal(resolved.pendingUpgrade, null);
});

test("use-defaults removes every customization, including non-conflicting ones", () => {
  const migration = migratePromptProfile(options({
    schemaVersion: 3,
    resolvedDefaultRevision: 7,
    prompts: { conflict: "mine", userOnly: "custom" },
    basePrompts: { conflict: "base", userOnly: "default" },
    retiredPrompts: { retired: "custom" }
  }, { conflict: "theirs", userOnly: "default" }));
  const resolved = resolvePromptUpgrade({
    ...options(migration.profile, { conflict: "theirs", userOnly: "default" }),
    upgradeToken: migration.upgradeToken,
    strategy: "use-defaults"
  });

  assert.deepEqual(resolved.prompts, { conflict: "theirs", userOnly: "default" });
  assert.deepEqual(resolved.retiredPrompts, {});
});

test("current autonomous defaults contain the expanded operating contracts", () => {
  assert.equal(PROMPTS_DEFAULT_REVISION, 15);
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.chatSystem, /focused read or search/i);
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.agentSystem, /Read every target file before editing/i);
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.agentSystem, /inspect the resulting diff/i);
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.agentSystem, /verify behavior/i);
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.planSystem, /decision-complete Markdown implementation plan/i);
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.planSystem, /write only to the plan repository/i);

  const profile = createDefaultPromptProfile();
  assert.equal(profile.resolvedDefaultRevision, 15);
  assert.equal(profile.prompts.agentSystem, DEFAULT_AI_COMPANION_PROMPTS.agentSystem);
  assert.equal(profile.basePrompts.planSystem, DEFAULT_AI_COMPANION_PROMPTS.planSystem);
});
