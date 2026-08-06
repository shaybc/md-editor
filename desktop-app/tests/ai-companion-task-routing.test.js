"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { resolveTaskProfile } = require("../resources/ai-companion/core/task-routing");
const { getAgentToolDefinitions } = require("../resources/ai-companion/core/agent-tool-loop");

const enabledScopes = { preferences_update: true, preferences_search: true, preferences_get: true };

test("routing is a no-op when the flag is off", () => {
  const r = resolveTaskProfile({ prompt: "Set autocompleteEnabled to true", mode: "agent", settings: {}, enabledScopes });
  assert.equal(r.engaged, false);
  assert.equal(r.reason, "flag-off");
});

test("a certain profile engages and yields the restricted tool surface + workflow", () => {
  const r = resolveTaskProfile({
    prompt: "Set autocompleteEnabled to true",
    mode: "agent",
    settings: { taskProfileRoutingEnabled: true },
    enabledScopes
  });
  assert.equal(r.engaged, true);
  assert.equal(r.profile.profileId, "preferences-update");
  assert.ok(r.toolNames.includes("preferences_update"));
  assert.ok(!r.toolNames.includes("glob"));
  assert.equal(r.workflowState.activeStepId, "resolve");
});

test("a compound request does not engage even with the flag on", () => {
  const r = resolveTaskProfile({
    prompt: "Find where autocompleteEnabled is set and then change it",
    mode: "agent",
    settings: { taskProfileRoutingEnabled: true },
    enabledScopes
  });
  assert.equal(r.engaged, false);
  assert.ok(r.reason.startsWith("not-certain"));
});

test("getAgentToolDefinitions narrows to the profile allow-list", () => {
  const full = getAgentToolDefinitions("agent", { enabledScopes }).map((d) => d.function.name);
  assert.ok(full.includes("glob"), "full set has discovery tools");

  const narrowed = getAgentToolDefinitions("agent", {
    enabledScopes,
    taskProfileToolNames: ["preferences_search", "preferences_get", "preferences_update"]
  }).map((d) => d.function.name);

  assert.deepEqual(narrowed.sort(), ["preferences_get", "preferences_search", "preferences_update"]);
  assert.ok(!narrowed.includes("glob"));
  assert.ok(!narrowed.includes("read_file"));
  assert.ok(!narrowed.includes("search_text"));
});
