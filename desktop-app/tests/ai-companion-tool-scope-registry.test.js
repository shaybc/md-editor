"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const scopes = require("../resources/ai-companion/core/tool-scope-registry");

test("default per-tool allow-list: read tools on, write/execution tools off", () => {
  const d = scopes.defaultToolScopes();
  assert.equal(d["git_status"], true, "read tool on");
  assert.equal(d["plan_read"], true, "read tool on");
  assert.equal(d["git_commit"], false, "write tool off");
  assert.equal(d["run_command"], false, "execution tool off");
});

test("normalize keeps explicit per-tool choices, applies read-on/write-off for missing", () => {
  const n = scopes.normalizeToolScopes({ git_push: true, git_status: false });
  assert.equal(n["git_push"], true, "explicit write-tool on respected");
  assert.equal(n["git_status"], false, "explicit read-tool off respected");
  assert.equal(n["git_diff"], true, "missing read tool defaults on");
  assert.equal(n["git_commit"], false, "missing write tool defaults off");
});

test("plan mode: core readers + enabled read tools only, never edit/write", () => {
  const { toolNames, scopes: active } = scopes.resolveToolset({ mode: "plan" });
  assert.ok(toolNames.includes("read_file") && toolNames.includes("glob") && toolNames.includes("search_text"));
  assert.ok(toolNames.includes("git_status"), "git read tool on by default");
  assert.ok(!toolNames.includes("git_commit"), "no git write tool");
  assert.ok(!toolNames.includes("apply_edit"), "plan never gets edit");
  assert.ok(!active.includes("edit"));
  assert.ok(!toolNames.includes("run_command"), "plan never gets execution");
});

test("agent mode default: readers + edit + read tools, write tools off", () => {
  const { toolNames } = scopes.resolveToolset({ mode: "agent" });
  assert.ok(toolNames.includes("apply_edit") && toolNames.includes("write_file"), "edit present in agent");
  assert.ok(toolNames.includes("git_status"), "git read tool default on");
  assert.ok(!toolNames.includes("git_push"), "git write tool default off");
  assert.ok(!toolNames.includes("run_command"), "execution default off");
});

test("agent mode with specific write tools enabled exposes exactly those", () => {
  const enabledScopes = { git_push: true, run_command: true };
  const { toolNames } = scopes.resolveToolset({ mode: "agent", enabledScopes });
  assert.ok(toolNames.includes("git_push"), "enabled write tool present");
  assert.ok(toolNames.includes("run_command"), "enabled execution tool present");
  assert.ok(!toolNames.includes("git_commit"), "other git write tool still off");
  assert.ok(!toolNames.includes("run_tests"), "other execution tool still off");
});

test("per-tool granularity: one read tool can be off while its domain siblings stay on", () => {
  const { toolNames } = scopes.resolveToolset({ mode: "agent", enabledScopes: { git_status: false } });
  assert.ok(!toolNames.includes("git_status"), "explicitly disabled read tool dropped");
  assert.ok(toolNames.includes("git_diff"), "sibling read tool stays on");
});

test("taskScopes narrows to a subset even within an enabled mode", () => {
  const { toolNames } = scopes.resolveToolset({ mode: "agent", taskScopes: ["git.read"] });
  assert.ok(toolNames.includes("git_status"));
  assert.ok(!toolNames.includes("plan_read"), "plan.read not requested by task");
  assert.ok(toolNames.includes("read_file"), "core always present");
  assert.ok(!toolNames.includes("apply_edit"), "edit not requested by task");
});

test("core readers are always present even when every domain tool is disabled", () => {
  const enabledScopes = {};
  for (const name of scopes.allDomainTools()) enabledScopes[name] = false;
  // chat is not edit-capable, so only the core readers should remain.
  const { toolNames } = scopes.resolveToolset({ mode: "chat", enabledScopes });
  assert.deepEqual(toolNames.sort(), ["glob", "read_file", "search_text"].sort());
});

test("scopeForTool maps tools back to their scope", () => {
  assert.equal(scopes.scopeForTool("read_file"), "core.read");
  assert.equal(scopes.scopeForTool("apply_edit"), "edit");
  assert.equal(scopes.scopeForTool("git_commit"), "git.write");
  assert.equal(scopes.scopeForTool("run_command"), "execution");
  assert.equal(scopes.scopeForTool("nope"), null);
});

test("filterToolNames drops removals, gates per-tool, keeps unknowns", () => {
  const input = [
    "read_file", "glob",     // core -> keep
    "get_workspace_state",   // removed -> drop
    "git_status",            // git read tool (on) -> keep
    "git_push",              // git write tool (off by default) -> drop
    "run_command",           // execution (off) -> drop
    "apply_edit",            // edit (agent) -> keep
    "some_future_tool"       // unknown -> keep (conservative)
  ];
  const kept = scopes.filterToolNames(input, { mode: "agent" });
  assert.ok(kept.includes("read_file") && kept.includes("glob"));
  assert.ok(!kept.includes("get_workspace_state"), "removed tool dropped");
  assert.ok(kept.includes("git_status"), "enabled read tool kept");
  assert.ok(!kept.includes("git_push"), "disabled write tool dropped");
  assert.ok(!kept.includes("run_command"), "disabled execution dropped");
  assert.ok(kept.includes("apply_edit"), "edit kept in agent");
  assert.ok(kept.includes("some_future_tool"), "unknown tool kept conservatively");
});

test("getDomainToolGroups exposes labeled read/write tools per domain", () => {
  const groups = scopes.getDomainToolGroups();
  const git = groups.find((g) => g.id === "git");
  assert.ok(git, "git domain present");
  assert.ok(git.read.some((t) => t.name === "git_status" && t.label), "git read tools labeled");
  assert.ok(git.write.some((t) => t.name === "git_commit" && t.label), "git write tools labeled");
  const execution = groups.find((g) => g.id === "execution");
  assert.deepEqual(execution.read, [], "execution has no read tools");
  assert.ok(execution.write.some((t) => t.name === "run_command"));
});
