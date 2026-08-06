const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "resources");

function loadSettingsTools(overrides = {}) {
  const source = fs.readFileSync(path.join(repoRoot, "js", "ai-companion", "settings-tools.js"), "utf8");
  const app = {
    modules: {},
    registerModule(name, api) {
      this.modules[name] = api;
    }
  };
  const context = { console, window: {} };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "settings-tools.js" });

  const defaultState = overrides.defaultState || {
    theme: "light",
    editorFontSize: 14,
    wordWrapEnabled: false,
    aiCompanionSettings: { model: "llama3.1", apiKey: "", agentEnabled: false },
    apiClientRequestSettings: { timeoutMs: 60000 }
  };
  let savedState = overrides.savedState || {};
  const replacements = [];
  const refreshes = [];
  const deps = Object.assign({
    aiCompanionSettings: {
      defaults: defaultState.aiCompanionSettings,
      normalize: (settings) => Object.assign({}, defaultState.aiCompanionSettings, settings || {})
    },
    getDefaultGlobalState: () => defaultState,
    loadGlobalState: () => savedState,
    saveGlobalState: (patch) => {
      savedState = Object.assign({}, savedState, patch);
    },
    replaceGlobalState: (state) => {
      replacements.push(state);
      savedState = state;
    },
    refreshPreferences: async (options) => refreshes.push(options),
    settingsTransfer: {
      buildSettingsExportPayload: () => ({
        documentType: "md-editor-settings",
        schemaVersion: 1,
        app: "MD-Editor",
        exportedAt: "2026-07-07T00:00:00.000Z",
        settings: Object.assign({}, defaultState, savedState)
      }),
      parseSettingsImportText: (text) => {
        const payload = JSON.parse(text);
        if (payload.documentType !== "md-editor-settings") throw new Error("This file is not an MD-Editor settings export.");
        return Object.assign({}, defaultState, payload.settings || {});
      }
    }
  }, overrides.deps || {});
  const api = context.registerMarkdownViewerAiCompanionSettingsTools(app, deps);
  return {
    api,
    app,
    get savedState() { return savedState; },
    replacements,
    refreshes
  };
}

test("reads current and default preference values", async () => {
  const harness = loadSettingsTools({ savedState: { editorFontSize: 16 } });

  const result = await harness.api.execute("preferences_get", { keys: ["editorFontSize"] });

  assert.equal(harness.app.modules.aiCompanionSettingsTools, harness.api);
  assert.deepEqual(JSON.parse(JSON.stringify(result.preferences[0])), {
    path: ["editorFontSize"],
    key: "editorFontSize",
    category: "editor",
    label: "Editor font size",
    valueType: "number",
    hasChildren: false,
    value: 16,
    changedFromDefault: true,
    defaultValue: 14
  });
});

test("searches preferences by label and category", async () => {
  const harness = loadSettingsTools();

  const result = await harness.api.execute("preferences_search", { query: "editor", maxResults: 5 });

  assert.ok(result.results.some((preference) => preference.key === "editorFontSize"));
});

test("returns structured failures for unknown preference keys", async () => {
  const harness = loadSettingsTools();

  const result = await harness.api.execute("preferences_get", { keys: ["missingPreference"] });

  assert.equal(result.status, "failed");
  assert.equal(result.complete, false);
  assert.equal(result.error.code, "unknown-preference");
  assert.equal(result.error.retryable, false);
});

test("updates boolean string number and nested preferences", async () => {
  const harness = loadSettingsTools();

  const result = await harness.api.execute("preferences_update", {
    changes: [
      { key: "wordWrapEnabled", value: true },
      { key: "theme", value: "dark" },
      { key: "editorFontSize", value: 18 },
      { key: "aiCompanionSettings.model", value: "gpt-test" }
    ]
  });

  assert.equal(result.changed, true);
  assert.equal(harness.savedState.wordWrapEnabled, true);
  assert.equal(harness.savedState.theme, "dark");
  assert.equal(harness.savedState.editorFontSize, 18);
  assert.equal(harness.savedState.aiCompanionSettings.model, "gpt-test");
  assert.equal(harness.refreshes.length, 1);
});

test("coerces string values to the preference's declared type (Gemini round-trip)", async () => {
  const harness = loadSettingsTools();

  // A provider that can only send strings passes "true"/"18"; they must round-trip.
  const result = await harness.api.execute("preferences_update", {
    changes: [
      { key: "wordWrapEnabled", value: "true" },
      { key: "editorFontSize", value: "18" }
    ]
  });

  assert.equal(result.changed, true);
  assert.equal(harness.savedState.wordWrapEnabled, true, "string 'true' coerced to boolean");
  assert.equal(harness.savedState.editorFontSize, 18, "numeric string coerced to number");
  // A genuine string preference is untouched.
  await harness.api.execute("preferences_update", { changes: [{ key: "theme", value: "dark" }] });
  assert.equal(harness.savedState.theme, "dark");
});

test("persists multiple nested updates that share one parent setting", async () => {
  const defaultState = {
    theme: "light",
    aiCompanionSettings: {
      intentContractsEnabled: false,
      intentClarificationMode: "assume",
      intentFastPathEnabled: true
    }
  };
  const harness = loadSettingsTools({ defaultState });

  const result = await harness.api.execute("preferences_update", {
    changes: [
      { key: "aiCompanionSettings.intentContractsEnabled", value: true },
      { key: "aiCompanionSettings.intentClarificationMode", value: "ask" },
      { key: "aiCompanionSettings.intentFastPathEnabled", value: false }
    ]
  });
  const persisted = await harness.api.execute("preferences_get", {
    keys: [
      "aiCompanionSettings.intentContractsEnabled",
      "aiCompanionSettings.intentClarificationMode",
      "aiCompanionSettings.intentFastPathEnabled"
    ]
  });

  assert.equal(result.changed, true);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.savedState.aiCompanionSettings)), {
    intentContractsEnabled: true,
    intentClarificationMode: "ask",
    intentFastPathEnabled: false
  });
  assert.deepEqual(Object.fromEntries(persisted.preferences.map((preference) => [preference.key, preference.value])), {
    "aiCompanionSettings.intentClarificationMode": "ask",
    "aiCompanionSettings.intentContractsEnabled": true,
    "aiCompanionSettings.intentFastPathEnabled": false
  });
  assert.equal(harness.refreshes.length, 1);
});

test("resets preferences to defaults", async () => {
  const harness = loadSettingsTools({ savedState: { editorFontSize: 22 } });

  const result = await harness.api.execute("preferences_reset", { keys: ["editorFontSize"] });

  assert.equal(result.changed, true);
  assert.equal(harness.savedState.editorFontSize, 14);
});

test("previews import without applying and applies when requested", async () => {
  const payload = JSON.stringify({
    documentType: "md-editor-settings",
    settings: { theme: "dark", editorFontSize: 20 }
  });
  const harness = loadSettingsTools();

  const preview = await harness.api.execute("preferences_import", { text: payload });

  assert.equal(preview.valid, true);
  assert.equal(preview.changed, true);
  assert.equal(harness.savedState.theme, undefined);

  const applied = await harness.api.execute("preferences_import", { text: payload, apply: true });

  assert.equal(applied.changed, true);
  assert.equal(harness.replacements.length, 1);
  assert.equal(harness.savedState.theme, "dark");
});

test("redacts secret-like values in reads and exports", async () => {
  const harness = loadSettingsTools({ savedState: { aiCompanionSettings: { apiKey: "secret-key", model: "local" } } });

  const read = await harness.api.execute("preferences_get", { keys: ["aiCompanionSettings.apiKey"], redactSecrets: false });
  const exported = await harness.api.execute("preferences_export", {});

  assert.equal(read.preferences[0].value, "[redacted]");
  assert.equal(exported.entries.find((entry) => entry.key === "aiCompanionSettings.apiKey").value, "[redacted]");
  assert.equal(exported.manifest.documentType, "md-editor-settings");
});

test("full-state get search and export bound cyclic and deeply nested values", async () => {
  const cyclic = { label: "runtime preference" };
  cyclic.self = cyclic;
  const deeplyNested = {};
  let cursor = deeplyNested;
  for (let depth = 0; depth < 10000; depth += 1) {
    cursor.child = {};
    cursor = cursor.child;
  }
  const defaultState = {
    theme: "light",
    aiCompanionSettings: { model: "llama3.1", apiKey: "secret" },
    cyclicPreference: cyclic,
    deeplyNestedPreference: deeplyNested
  };
  const harness = loadSettingsTools({ defaultState });

  const read = await harness.api.execute("preferences_get", {});
  const search = await harness.api.execute("preferences_search", { query: "runtime preference" });
  const exported = await harness.api.execute("preferences_export", {});

  const cyclicRead = read.preferences.find((preference) => preference.key === "cyclicPreference");
  const deepRead = read.preferences.find((preference) => preference.key === "deeplyNestedPreference");
  assert.equal(cyclicRead.hasChildren, true);
  assert.equal(Object.prototype.hasOwnProperty.call(cyclicRead, "value"), false);
  assert.equal(deepRead.hasChildren, true);
  assert.equal(search.results[0].key, "cyclicPreference.label");
  assert.equal(search.results[0].value, "runtime preference");
  assert.equal(exported.entries.find((entry) => entry.key === "aiCompanionSettings.apiKey").value, "[redacted]");
  assert.ok(exported.entries.length <= 25);
});

test("category reads and nested searches avoid unrelated failing preferences", async () => {
  const defaultState = {
    theme: "light",
    aiCompanionSettings: {
      intentContractsEnabled: true,
      intentClarificationMode: "ask",
      intentFastPathEnabled: false
    }
  };
  Object.defineProperty(defaultState, "brokenPreference", {
    enumerable: true,
    get() {
      throw new RangeError("Maximum call stack size exceeded");
    }
  });
  const harness = loadSettingsTools({ defaultState });

  const category = await harness.api.execute("preferences_get", { category: "ai-companion" });
  const search = await harness.api.execute("preferences_search", { query: "intentContractsEnabled", maxResults: 1 });
  const fullRead = await harness.api.execute("preferences_get", {});
  const exported = await harness.api.execute("preferences_export", {});

  assert.equal(category.complete, true);
  assert.deepEqual(JSON.parse(JSON.stringify(category.errors)), []);
  assert.equal(category.preferences[0].key, "aiCompanionSettings.intentClarificationMode");
  assert.equal(search.results[0].key, "aiCompanionSettings.intentContractsEnabled");
  assert.equal(search.results[0].value, true);
  assert.equal(fullRead.complete, false);
  assert.equal(fullRead.status, "partial");
  assert.equal(fullRead.errors[0].code, "preference-resolution-failed");
  assert.equal(exported.complete, false);
  assert.equal(exported.status, "partial");
  assert.equal(exported.errors[0].code, "preference-resolution-failed");
  assert.equal(exported.entries.find((entry) => entry.key === "aiCompanionSettings.intentClarificationMode").value, "ask");
});

test("paginates hierarchical reads before resolving later entries", async () => {
  const defaultState = {
    aiCompanionSettings: {
      enabled: false,
      agentEnabled: false,
      chatEnabled: true,
      model: "local"
    }
  };
  const harness = loadSettingsTools({ defaultState, savedState: { aiCompanionSettings: { enabled: true } } });

  const first = await harness.api.execute("preferences_get", { category: "ai-companion", valueType: "boolean", maxEntries: 2 });
  const second = await harness.api.execute("preferences_get", {
    category: "ai-companion",
    valueType: "boolean",
    maxEntries: 2,
    cursor: first.page.nextCursor
  });

  assert.equal(first.status, "success");
  assert.equal(first.entries.length, 2);
  assert.equal(first.page.hasMore, true);
  assert.equal(second.entries.length, 1);
  assert.equal(second.page.hasMore, false);
  assert.deepEqual([...first.entries, ...second.entries].map((entry) => entry.key), [
    "aiCompanionSettings.agentEnabled",
    "aiCompanionSettings.chatEnabled",
    "aiCompanionSettings.enabled"
  ]);
});

test("rejects cursors when filters change", async () => {
  const harness = loadSettingsTools();
  const first = await harness.api.execute("preferences_get", { maxEntries: 1 });
  const changed = await harness.api.execute("preferences_get", { maxEntries: 1, category: "editor", cursor: first.page.nextCursor });

  assert.equal(changed.status, "failed");
  assert.equal(changed.error.code, "invalid-cursor");
});

test("exact paths return a scalar or one page of object children", async () => {
  const harness = loadSettingsTools();

  const scalar = await harness.api.execute("preferences_get", { path: ["editorFontSize"] });
  const object = await harness.api.execute("preferences_get", { path: ["aiCompanionSettings"], maxEntries: 2 });

  assert.equal(scalar.entries.length, 1);
  assert.equal(scalar.entries[0].value, 14);
  assert.equal(object.entries.length, 2);
  assert.ok(object.entries.every((entry) => entry.path.length === 2));
  assert.equal(object.page.hasMore, true);
});

test("search cursors continue descriptor scanning without duplicate matches", async () => {
  const defaultState = {};
  for (let index = 0; index < 60; index++) defaultState[`booleanPreference${index}`] = index % 2 === 0;
  const harness = loadSettingsTools({ defaultState });
  const keys = [];
  let cursor = null;

  do {
    const result = await harness.api.execute("preferences_search", { query: "boolean", maxEntries: 7, cursor });
    assert.equal(result.status, "success");
    keys.push(...result.entries.map((entry) => entry.key));
    cursor = result.page.nextCursor;
  } while (cursor);

  assert.equal(keys.length, 60);
  assert.equal(new Set(keys).size, 60);
});

test("export cursors reject preference state changes between pages", async () => {
  const harness = loadSettingsTools();
  const first = await harness.api.execute("preferences_export", { maxEntries: 1 });
  await harness.api.execute("preferences_update", { changes: [{ key: "theme", value: "dark" }] });
  const stale = await harness.api.execute("preferences_export", { maxEntries: 1, cursor: first.page.nextCursor });

  assert.equal(stale.status, "failed");
  assert.equal(stale.error.code, "stale-cursor");
});

test("entry and serialized-size limits return bounded continuation metadata", async () => {
  const manyDefaults = {};
  for (let index = 0; index < 150; index++) manyDefaults[`setting${index}`] = index;
  const manyHarness = loadSettingsTools({ defaultState: manyDefaults });
  const capped = await manyHarness.api.execute("preferences_get", { maxEntries: 999 });

  assert.equal(capped.entries.length, 100);
  assert.equal(capped.page.hasMore, true);

  const largeHarness = loadSettingsTools({ defaultState: { oversizedSetting: "x".repeat(110 * 1024) } });
  const oversized = await largeHarness.api.execute("preferences_get", { keys: ["oversizedSetting"] });

  assert.equal(oversized.status, "partial");
  assert.equal(oversized.entries[0].valueOmitted, true);
  assert.equal(oversized.errors[0].code, "result-size-limit");
  assert.ok(JSON.stringify(oversized).length < 96 * 1024);
});

test("preview update does not persist or refresh", async () => {
  const harness = loadSettingsTools();

  const result = await harness.api.execute("preferences_update", {
    previewOnly: true,
    changes: [{ key: "editorFontSize", value: 16 }]
  });

  assert.equal(result.changed, true);
  assert.equal(harness.savedState.editorFontSize, undefined);
  assert.equal(harness.refreshes.length, 0);
});

test("bare nested key is suggested, never auto-applied", async () => {
  const harness = loadSettingsTools();
  const result = await harness.api.execute("preferences_update", { changes: [{ key: "agentEnabled", value: true }] });
  assert.equal(result.changed, false, "nothing is applied for an unresolved bare key");
  assert.ok(Array.isArray(result.unresolved) && result.unresolved.length === 1);
  assert.equal(result.unresolved[0].found, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.unresolved[0].suggestions)), ["aiCompanionSettings.agentEnabled"]);
  assert.match(result.unresolved[0].message, /Did you mean "aiCompanionSettings\.agentEnabled"/);
  assert.equal(harness.savedState.aiCompanionSettings, undefined, "state untouched");
  assert.equal(harness.refreshes.length, 0);
});

test("valid full path applies while a sibling bare key is only suggested", async () => {
  const harness = loadSettingsTools();
  const result = await harness.api.execute("preferences_update", { changes: [
    { key: "aiCompanionSettings.agentEnabled", value: true },
    { key: "model", value: "x" }
  ] });
  assert.equal(result.changed, true, "the valid full-path change applies");
  assert.equal(harness.savedState.aiCompanionSettings.agentEnabled, true);
  assert.ok(result.unresolved.some((u) => u.suggestions.includes("aiCompanionSettings.model")));
  // The bare "model" key was not applied.
  assert.notEqual(harness.savedState.aiCompanionSettings.model, "x");
});

test("unknown key with no namespace match returns an empty-suggestion notice", async () => {
  const harness = loadSettingsTools();
  const result = await harness.api.execute("preferences_update", { changes: [{ key: "totallyMadeUpKey", value: 1 }] });
  assert.equal(result.changed, false);
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.unresolved[0].suggestions.length, 0);
});
