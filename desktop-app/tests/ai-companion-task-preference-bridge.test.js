"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { parseExplicitPreferenceTargets, deriveTaskObservation } = require("../resources/ai-companion/core/task-preference-bridge");

// --- prompt parsing ---------------------------------------------------------

test("explicit dotted keys with a clear value are parsed", () => {
  const r = parseExplicitPreferenceTargets("Set aiCompanionSettings.chatStatefulControllerEnabled and aiCompanionSettings.chatVerifierCompletionEnabled to true");
  assert.deepEqual(r.requestedKeys.sort(), [
    "aiCompanionSettings.chatStatefulControllerEnabled",
    "aiCompanionSettings.chatVerifierCompletionEnabled"
  ]);
  assert.equal(r.valueKnown, true);
  assert.equal(r.desiredValues["aiCompanionSettings.chatStatefulControllerEnabled"], true);
});

test("a disable prompt yields false", () => {
  const r = parseExplicitPreferenceTargets("disable aiCompanionSettings.chatDurableRecoveryEnabled");
  assert.equal(r.valueKnown, true);
  assert.equal(r.desiredValues["aiCompanionSettings.chatDurableRecoveryEnabled"], false);
});

test("ambiguous value (both true and false words) is not known", () => {
  const r = parseExplicitPreferenceTargets("change aiCompanionSettings.x from true to false");
  assert.equal(r.valueKnown, false);
  assert.deepEqual(r.desiredValues, {});
});

test("bare (non-dotted) names are not treated as keys", () => {
  const r = parseExplicitPreferenceTargets("enable chatStatefulControllerEnabled");
  assert.deepEqual(r.requestedKeys, []);
});

// --- observation derivation -------------------------------------------------

const keys = ["aiCompanionSettings.a", "aiCompanionSettings.b"];

test("preferences_search resolves all requested keys", () => {
  const result = { entries: [{ path: "aiCompanionSettings.a" }, { key: "aiCompanionSettings.b" }, { path: "unrelated" }] };
  const obs = deriveTaskObservation("preferences_search", result, { requestedKeys: keys });
  assert.equal(obs.resolvedAllKeys, true);
  assert.equal(obs.matches.length, 2);
});

test("preferences_search with a missing key does not resolve all", () => {
  const result = { results: [{ key: "aiCompanionSettings.a" }] };
  const obs = deriveTaskObservation("preferences_search", result, { requestedKeys: keys });
  assert.equal(obs.resolvedAllKeys, false);
});

test("unknown result shape degrades to not-resolved (fail safe)", () => {
  const obs = deriveTaskObservation("preferences_search", { somethingElse: true }, { requestedKeys: keys });
  assert.equal(obs.resolvedAllKeys, false);
  assert.deepEqual(obs.matches, []);
});

test("preferences_update accepted only when changed and nothing unresolved", () => {
  assert.equal(deriveTaskObservation("preferences_update", { changed: true, changes: [{ key: "a", changed: true }] }, {}).accepted, true);
  assert.equal(deriveTaskObservation("preferences_update", { changed: true, unresolved: [{ key: "b" }] }, {}).accepted, false);
  assert.equal(deriveTaskObservation("preferences_update", { changed: false }, {}).accepted, false);
});

test("preferences_get verified against desired values", () => {
  const desiredValues = { "aiCompanionSettings.a": true, "aiCompanionSettings.b": true };
  const ok = deriveTaskObservation("preferences_get", { entries: [{ key: "aiCompanionSettings.a", value: true }, { key: "aiCompanionSettings.b", value: true }] }, { desiredValues });
  assert.equal(ok.verified, true);
  const bad = deriveTaskObservation("preferences_get", { entries: [{ key: "aiCompanionSettings.a", value: true }, { key: "aiCompanionSettings.b", value: false }] }, { desiredValues });
  assert.equal(bad.verified, false);
});

test("a non-preferences tool yields no observation", () => {
  assert.equal(deriveTaskObservation("read_file", {}, {}), null);
});
