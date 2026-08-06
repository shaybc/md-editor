"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const profiles = require("../resources/ai-companion/core/task-profiles");
const { classifyTask, APPLICABILITY } = require("../resources/ai-companion/core/task-classifier");

// --- registry ---------------------------------------------------------------

test("preferences-update profile exposes only its allow-list plus control tools", () => {
  const p = profiles.getProfile("preferences-update");
  const { toolNames } = profiles.resolveProfileToolNames(p, { mode: "agent", enabledScopes: { preferences_update: true } });
  assert.ok(toolNames.includes("preferences_search"));
  assert.ok(toolNames.includes("preferences_update"));
  assert.ok(toolNames.includes("agent_request_user_input"));
  assert.ok(toolNames.includes("agent_report_blocked"));
  // Discovery tools must NOT be present.
  assert.ok(!toolNames.includes("list_files"));
  assert.ok(!toolNames.includes("glob"));
  assert.ok(!toolNames.includes("search_text"));
  assert.ok(!toolNames.includes("read_file"));
  // Other settings tools outside the allow-list are excluded.
  assert.ok(!toolNames.includes("preferences_reset"));
  assert.ok(!toolNames.includes("preferences_export"));
});

test("capability is unavailable when the write tool is toggled off", () => {
  const p = profiles.getProfile("preferences-update");
  assert.equal(profiles.isCapabilityAvailable(p, { mode: "agent", enabledScopes: { preferences_update: true } }), true);
  assert.equal(profiles.isCapabilityAvailable(p, { mode: "agent", enabledScopes: { preferences_update: false } }), false);
});

test("workflow state starts with the first step active and reducer-owned fields", () => {
  const p = profiles.getProfile("preferences-update");
  const state = profiles.createWorkflowState(p);
  assert.equal(state.profileId, "preferences-update");
  assert.equal(state.profileVersion, 1);
  assert.equal(state.workflowVersion, 1);
  assert.equal(state.activeStepId, "resolve");
  assert.equal(state.steps[0].status, "active");
  assert.equal(state.steps[1].status, "pending");
  assert.equal(state.profileStatus, "active");
  assert.equal(state.fallbackCount, 0);
});

test("workflow-state compatibility rejects a version mismatch", () => {
  const p = profiles.getProfile("preferences-update");
  const state = profiles.createWorkflowState(p);
  assert.equal(profiles.isWorkflowStateCompatible(state, p), true);
  assert.equal(profiles.isWorkflowStateCompatible({ ...state, workflowVersion: 99 }, p), false);
  assert.equal(profiles.isWorkflowStateCompatible({ ...state, profileId: "other" }, p), false);
});

test("fallback event is built only for a recognized reason", () => {
  const ev = profiles.buildFallbackEvent({ fromProfile: "preferences-update", reasonCode: "unresolved_preference_key", boundedActions: 3 });
  assert.equal(ev.eventType, "task_profile_fallback_requested");
  assert.equal(ev.reasonCode, "unresolved_preference_key");
  assert.equal(ev.boundedActions, 3);
  assert.equal(profiles.buildFallbackEvent({ reasonCode: "because_the_model_wants_more" }), null);
});

// --- classifier -------------------------------------------------------------

test("clean settings mutation classifies certain", () => {
  const r = classifyTask({ prompt: "Enable the autocompleteEnabled setting", mode: "agent", context: { enabledScopes: { preferences_update: true } } });
  assert.equal(r.taskType, "preferences-update");
  assert.equal(r.applicability, APPLICABILITY.CERTAIN);
});

test("six-preferences golden prompt classifies certain", () => {
  const r = classifyTask({
    prompt: "Set all the chat controller preferences to true",
    mode: "agent",
    context: { enabledScopes: { preferences_update: true } }
  });
  assert.equal(r.applicability, APPLICABILITY.CERTAIN);
});

test("informational settings question is not_applicable, not a mutation", () => {
  const r = classifyTask({ prompt: "Explain how the preferences_update tool works", mode: "agent" });
  assert.equal(r.taskType, null);
  assert.equal(r.applicability, APPLICABILITY.NOT_APPLICABLE);
  assert.deepEqual(r.reasonCodes, ["informational_request"]);
});

test("compound request (mutate + investigate) is uncertain and keeps the investigation signal", () => {
  const r = classifyTask({
    prompt: "Find where autocompleteEnabled is implemented and then change it to true",
    mode: "agent",
    context: { enabledScopes: { preferences_update: true } }
  });
  assert.equal(r.applicability, APPLICABILITY.UNCERTAIN);
  assert.ok(r.conflictingSignals.includes("investigation-verb"));
  assert.ok(r.conflictingSignals.includes("multi-clause-request"));
});

test("mutation in a read-only mode is rejected", () => {
  const r = classifyTask({ prompt: "Set autocompleteEnabled to true", mode: "chat" });
  assert.equal(r.applicability, APPLICABILITY.REJECTED);
  assert.deepEqual(r.reasonCodes, ["read_only_mode"]);
});

test("mutation with the write capability disabled is rejected", () => {
  const r = classifyTask({ prompt: "Set autocompleteEnabled to true", mode: "agent", context: { enabledScopes: { preferences_update: false } } });
  assert.equal(r.applicability, APPLICABILITY.REJECTED);
  assert.deepEqual(r.reasonCodes, ["capability_unavailable"]);
});

test("an interrogative about which flags to enable is NOT a mutation (false-positive guard)", () => {
  const r = classifyTask({
    prompt: "which flags needs to be enabled so the M11 plan will be enabled and active ?",
    mode: "agent",
    context: { enabledScopes: { preferences_update: true } }
  });
  assert.equal(r.taskType, null);
  assert.equal(r.applicability, APPLICABILITY.NOT_APPLICABLE);
  assert.deepEqual(r.reasonCodes, ["informational_request"]);
});

test("'what settings are enabled?' is informational, not a mutation", () => {
  const r = classifyTask({ prompt: "what settings are currently enabled?", mode: "agent", context: { enabledScopes: { preferences_update: true } } });
  assert.equal(r.applicability, APPLICABILITY.NOT_APPLICABLE);
});

test("a non-settings request is not_applicable", () => {
  const r = classifyTask({ prompt: "Refactor the payment service for clarity", mode: "agent" });
  assert.equal(r.taskType, null);
  assert.equal(r.applicability, APPLICABILITY.NOT_APPLICABLE);
});
