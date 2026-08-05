"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { getAgentToolDefinitions } = require("../resources/ai-companion/core/agent-tool-loop");
const { describeToolEffect } = require("../resources/ai-companion/core/agent-tool-effect-registry");
const { derivePlanAllowedToolNames } = require("../resources/ai-companion/core/plan-decision-contract");

const GIT_READ = ["git_panel_status", "git_panel_changes_digest", "git_panel_compare_file", "git_panel_branch_list", "git_panel_pr_notes_context"];
const GIT_MUTATE = ["git_panel_commit", "git_panel_push", "git_panel_pull", "git_panel_fetch", "git_panel_stage_files", "git_panel_unstage_files", "git_panel_create_branch", "git_panel_switch_branch"];
const ON = { planGitReadToolsEnabled: true };

test("Fix 3 flag off: Plan mode exposes no git tools (legacy)", () => {
  const names = getAgentToolDefinitions("plan").map((d) => d.function && d.function.name);
  for (const tool of [...GIT_READ, ...GIT_MUTATE]) assert.ok(!names.includes(tool), `plan should not expose ${tool} with flag off`);
});

test("Fix 3 flag on: Plan mode exposes read-only git tools", () => {
  const names = getAgentToolDefinitions("plan", ON).map((d) => d.function && d.function.name);
  for (const tool of GIT_READ) assert.ok(names.includes(tool), `plan should expose ${tool} with flag on`);
});

test("Plan mode never exposes mutating git tools, flag on or off", () => {
  for (const opts of [{}, ON]) {
    const names = getAgentToolDefinitions("plan", opts).map((d) => d.function && d.function.name);
    for (const tool of GIT_MUTATE) assert.ok(!names.includes(tool), `plan must not expose ${tool}`);
  }
});

test("git read tools are classified read-only (non-effectful)", () => {
  for (const tool of GIT_READ) {
    assert.equal(describeToolEffect(tool, {}).effectful, false, `${tool} must be non-effectful`);
  }
});

test("Agent mode still exposes mutating git tools (unchanged)", () => {
  const names = getAgentToolDefinitions("agent").map((d) => d.function && d.function.name);
  for (const tool of GIT_MUTATE) assert.ok(names.includes(tool), `agent should still expose ${tool}`);
});

test("git read tools flow into the M8 plan allowlist only when the flag is on", () => {
  const off = derivePlanAllowedToolNames();
  for (const tool of GIT_READ) assert.ok(!off.has(tool), `${tool} should be absent with flag off`);
  const on = derivePlanAllowedToolNames(ON);
  for (const tool of GIT_READ) assert.ok(on.has(tool), `${tool} should be allowlisted with flag on`);
  for (const tool of GIT_MUTATE) assert.ok(!on.has(tool), `${tool} must never be allowlisted`);
});
