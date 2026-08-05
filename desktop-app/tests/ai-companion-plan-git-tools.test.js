"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { getAgentToolDefinitions } = require("../resources/ai-companion/core/agent-tool-loop");
const { describeToolEffect } = require("../resources/ai-companion/core/agent-tool-effect-registry");
const { derivePlanAllowedToolNames } = require("../resources/ai-companion/core/plan-decision-contract");
const { toCanonicalName } = require("../resources/ai-companion/core/tool-scope-registry");

// Definitions/allowlists expose model-facing names; compare on canonical names.
const canonNames = (defs) => defs.map((d) => d.function && toCanonicalName(d.function.name));
const canonSet = (set) => new Set([...set].map(toCanonicalName));

const GIT_READ = ["git_status", "git_changes_digest", "git_diff", "git_branches", "git_pr_notes"];
const GIT_MUTATE = ["git_commit", "git_push", "git_pull", "git_fetch", "git_stage", "git_unstage", "git_branch_create", "git_branch_switch"];
const ON = { planGitReadToolsEnabled: true };

test("Fix 3 flag off: Plan mode exposes no git tools (legacy)", () => {
  const names = canonNames(getAgentToolDefinitions("plan"));
  for (const tool of [...GIT_READ, ...GIT_MUTATE]) assert.ok(!names.includes(tool), `plan should not expose ${tool} with flag off`);
});

test("Fix 3 flag on: Plan mode exposes read-only git tools", () => {
  const names = canonNames(getAgentToolDefinitions("plan", ON));
  for (const tool of GIT_READ) assert.ok(names.includes(tool), `plan should expose ${tool} with flag on`);
});

test("Plan mode never exposes mutating git tools, flag on or off", () => {
  for (const opts of [{}, ON]) {
    const names = canonNames(getAgentToolDefinitions("plan", opts));
    for (const tool of GIT_MUTATE) assert.ok(!names.includes(tool), `plan must not expose ${tool}`);
  }
});

test("git read tools are classified read-only (non-effectful)", () => {
  for (const tool of GIT_READ) {
    assert.equal(describeToolEffect(tool, {}).effectful, false, `${tool} must be non-effectful`);
  }
});

test("Agent mode still exposes mutating git tools (unchanged)", () => {
  const names = canonNames(getAgentToolDefinitions("agent"));
  for (const tool of GIT_MUTATE) assert.ok(names.includes(tool), `agent should still expose ${tool}`);
});

test("git read tools flow into the M8 plan allowlist only when the flag is on", () => {
  const off = canonSet(derivePlanAllowedToolNames());
  for (const tool of GIT_READ) assert.ok(!off.has(tool), `${tool} should be absent with flag off`);
  const on = canonSet(derivePlanAllowedToolNames(ON));
  for (const tool of GIT_READ) assert.ok(on.has(tool), `${tool} should be allowlisted with flag on`);
  for (const tool of GIT_MUTATE) assert.ok(!on.has(tool), `${tool} must never be allowlisted`);
});
