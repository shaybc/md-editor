"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { normalizeAiCompanionSettings } = require("../resources/ai-companion/config/defaults");
const { AutonomousOrchestrator } = require("../resources/ai-companion/orchestration/autonomous/autonomous-orchestrator");
const { ArtifactVault } = require("../resources/ai-companion/orchestration/autonomous/artifacts/artifact-vault");
const { WindowSteward } = require("../resources/ai-companion/orchestration/autonomous/context/window-steward");
const { getToolDefinitions } = require("../resources/ai-companion/orchestration/autonomous/tool-catalog");
const { resolveCapabilityPolicy } = require("../resources/ai-companion/orchestration/shared/capability-policy");
const planTools = require("../resources/ai-companion/tools/plan-repository-tools");
const { PlanRepositorySession, requireSavedPlanMetadata } = require("../resources/ai-companion/orchestration/autonomous/plan-repository-session");

function createRequest(overrides = {}) {
  return {
    action: "agent", prompt: "work", workspaceRoot: process.cwd(), profileRoot: "", taskId: "task-one",
    settings: { enabled: true, agentEnabled: true, agentLoopArchitecture: "autonomous", agentMaxResponseTokens: 0 },
    securityContext: { policy: { shell: { mode: "deny-and-audit" } } },
    ...overrides
  };
}

test("architecture settings normalize to a closed migration enum", () => {
  assert.equal(normalizeAiCompanionSettings({}).agentLoopArchitecture, "legacy");
  assert.equal(normalizeAiCompanionSettings({ agentLoopArchitecture: "autonomous" }).agentLoopArchitecture, "autonomous");
  assert.equal(normalizeAiCompanionSettings({ agentLoopArchitecture: "unknown" }).agentLoopArchitecture, "legacy");
});

test("read-only modes do not expose mutation, command, or delegation tools", () => {
  const names = getToolDefinitions({ allowWrites: false, allowCommands: false, allowDelegation: false }).map((entry) => entry.function.name);
  assert.equal(names.includes("read_file"), true);
  for (const name of ["apply_edit", "write_file", "run_command", "worker_launch", "worker_wait"]) assert.equal(names.includes(name), false);
});

test("plan repository capabilities are scoped independently from workspace writes", () => {
  const planNames = getToolDefinitions(resolveCapabilityPolicy("plan")).map((entry) => entry.function.name);
  const agentNames = getToolDefinitions(resolveCapabilityPolicy("agent")).map((entry) => entry.function.name);
  const chatNames = getToolDefinitions(resolveCapabilityPolicy("chat")).map((entry) => entry.function.name);
  for (const name of ["plan_list", "plan_read", "plan_create", "plan_update"]) {
    assert.equal(planNames.includes(name), true);
    assert.equal(agentNames.includes(name), true);
    assert.equal(chatNames.includes(name), false);
  }
  for (const name of ["apply_edit", "write_file", "run_command", "worker_launch"]) assert.equal(planNames.includes(name), false);
});

test("autonomous plan writes expose one canonical body field and require authoritative metadata", () => {
  const definitions = getToolDefinitions(resolveCapabilityPolicy("agent"));
  for (const name of ["plan_create", "plan_update"]) {
    const properties = definitions.find((entry) => entry.function.name === name).function.parameters.properties;
    assert.equal(Object.hasOwn(properties, "body"), true);
    assert.equal(Object.hasOwn(properties, "content"), false);
  }
  assert.throws(() => requireSavedPlanMetadata({ id: "plan-only" }), /id and path/i);
  assert.throws(() => requireSavedPlanMetadata({ path: "plans/only.md" }), /id and path/i);
  assert.doesNotThrow(() => requireSavedPlanMetadata({ id: "plan-complete", path: "plans/complete.md" }));
});

test("plan mode saves through a model-selected repository tool and returns the saved body", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-plan-tool-"));
  const body = "# Search Plan\n\n## M1: Index messages";
  let round = 0;
  const provider = { async completeMessage() {
    round += 1;
    if (round === 1) return { content: "", toolCalls: [{ id: "save", function: { name: "plan_create", arguments: JSON.stringify({ title: "Search Plan", body }) } }] };
    return { content: "The plan was saved.", toolCalls: [] };
  } };
  const events = [];
  try {
    const result = await new AutonomousOrchestrator().run(createRequest({ action: "plan", prompt: "Create a search plan", profileRoot, workspaceRoot: profileRoot, chatId: "chat-plan", taskId: "task-plan", sourceChatId: "chat-plan", sourceTaskId: "task-plan", planOperation: "create" }), { provider }, (event) => events.push(event));
    assert.equal(result.content, body);
    assert.ok(result.plan?.path);
    assert.equal(events.filter((event) => event.type === "plan-saved").length, 1);
    assert.deepEqual(events.filter((event) => event.type === "assistant-final").map((event) => event.content), [body]);
    const saved = await planTools.planRead(profileRoot, { id: result.plan.id }, { profileRoot });
    assert.equal(saved.body, body);
    assert.equal(saved.sourceChatId, "chat-plan");
    assert.equal(saved.sourceTaskId, "task-plan");
  } finally {
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
});

test("plan mode rejects textual completion without authoritative repository metadata", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-plan-fallback-"));
  let calls = 0;
  const provider = { async completeMessage() {
    calls += 1;
    return { content: "# Unsaved Plan", toolCalls: [] };
  } };
  try {
    await assert.rejects(
      () => new AutonomousOrchestrator().run(createRequest({ action: "plan", profileRoot, workspaceRoot: profileRoot, taskId: "fallback-task", sourceTaskId: "fallback-task", planOperation: "create" }), { provider }, () => {}),
      /authoritative plan id and path/i
    );
    assert.equal(calls, 1);
    const listed = await planTools.planList(profileRoot, { workspaceRoot: profileRoot }, { profileRoot });
    assert.equal(listed.plans.length, 0);
  } finally {
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
});

test("targeted plan revisions update the existing repository identity", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-plan-update-"));
  const revisedBody = "# Revised Plan\n\nUpdated content.";
  try {
    const created = await planTools.planCreate(profileRoot, { title: "Original Plan", body: "# Original Plan", workspaceRoot: profileRoot }, { profileRoot });
    let round = 0;
    const provider = { async completeMessage() {
      round += 1;
      if (round === 1) return { content: "", toolCalls: [{ id: "update", function: { name: "plan_update", arguments: JSON.stringify({ id: "wrong-id", title: "Revised Plan", body: revisedBody }) } }] };
      return { content: "Updated.", toolCalls: [] };
    } };
    const result = await new AutonomousOrchestrator().run(createRequest({ action: "plan", profileRoot, workspaceRoot: profileRoot, taskId: "update-task", planOperation: "update", planTarget: { id: created.plan.id, path: created.plan.path } }), { provider }, () => {});
    assert.equal(result.plan.id, created.plan.id);
    const listed = await planTools.planList(profileRoot, { workspaceRoot: profileRoot }, { profileRoot });
    assert.equal(listed.plans.length, 1);
    const saved = await planTools.planRead(profileRoot, { id: created.plan.id }, { profileRoot });
    assert.equal(saved.body, revisedBody);
  } finally {
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
});

test("repeated creates for one source task update the existing plan instead of duplicating it", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-plan-idempotent-"));
  const request = createRequest({ action: "plan", profileRoot, workspaceRoot: profileRoot, sourceTaskId: "same-source-task", planOperation: "create" });
  const events = [];
  try {
    const firstSession = new PlanRepositorySession(request, resolveCapabilityPolicy("plan"), (event) => events.push(event));
    const first = await firstSession.execute("plan_create", { title: "First title", body: "# First body" });
    const recoveredSession = new PlanRepositorySession(request, resolveCapabilityPolicy("plan"), (event) => events.push(event));
    const second = await recoveredSession.execute("plan_create", { title: "Updated title", body: "# Updated body" });
    assert.equal(second.plan.id, first.plan.id);
    const listed = await planTools.planList(profileRoot, { workspaceRoot: profileRoot }, { profileRoot });
    assert.equal(listed.plans.length, 1);
    const saved = await planTools.planRead(profileRoot, { id: first.plan.id }, { profileRoot });
    assert.equal(saved.body, "# Updated body");
    assert.deepEqual(events.map((event) => event.type), ["plan-saved", "plan-updated"]);
  } finally {
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
});

test("parallel calls all produce observations before continuation", async () => {
  let round = 0;
  const provider = { async completeMessage() {
    round += 1;
    if (round === 1) return { content: "", toolCalls: [
      { id: "a", function: { name: "work_create", arguments: JSON.stringify({ subject: "A", description: "First item" }) } },
      { id: "b", function: { name: "work_create", arguments: JSON.stringify({ subject: "B", description: "Second item" }) } }
    ] };
    return { content: "Both finished.", toolCalls: [] };
  } };
  const events = [];
  await new AutonomousOrchestrator().run(createRequest(), { provider }, (event) => events.push(event));
  assert.equal(events.filter((event) => event.type === "tool-completed").length, 2);
  assert.equal(events.filter((event) => event.type === "assistant-final").length, 1);
});

test("denied writes become model observations instead of rejected final responses", async () => {
  let round = 0;
  let observedDenial = false;
  const provider = { async completeMessage(messages) {
    round += 1;
    if (round === 1) return { content: "", toolCalls: [{ id: "write", function: { name: "write_file", arguments: JSON.stringify({ path: "denied.txt", content: "no" }) } }] };
    observedDenial = messages.some((message) => message.role === "tool" && /denied/i.test(message.content));
    return { content: "The write was denied, so I made no change.", toolCalls: [] };
  } };
  const result = await new AutonomousOrchestrator().run(createRequest({ requestApproval: async () => ({ approved: false }) }), { provider }, () => {});
  assert.equal(observedDenial, true);
  assert.match(result.content, /denied/);
});

test("cancellation emits a terminal cancellation event", async () => {
  const controller = new AbortController();
  controller.abort();
  const events = [];
  await assert.rejects(() => new AutonomousOrchestrator().run(createRequest({ signal: controller.signal }), { provider: { completeMessage: async () => ({ content: "late", toolCalls: [] }) } }, (event) => events.push(event)), /cancelled/i);
  assert.equal(events.some((event) => event.type === "run-cancelled"), true);
});

test("window stewardship stores large old observations while preserving recent messages", async () => {
  const request = createRequest({ profileRoot: "", modelLimits: { contextWindow: 1000000, maxOutputTokens: 20000 } });
  const messages = [{ role: "system", content: "rules" }, { role: "assistant", content: "old call", tool_calls: [{ id: "old", function: { name: "read_file", arguments: "{}" } }] }, { role: "tool", tool_call_id: "old", content: `old-result-${"x".repeat(5000)}` }];
  for (let index = 0; index < 5; index++) messages.push({ role: "assistant", content: `recent-${index}` });
  const vault = new ArtifactVault(request);
  const steward = new WindowSteward(request, { completeMessage: async () => ({ content: "{}" }) }, vault);
  const result = await steward.prepare(messages, {});
  assert.equal(result.thinned.length, 1);
  assert.match(messages[2].content, /artifact-1/);
  assert.equal(messages.at(-1).content, "recent-4");
});

test("completed checkpoints restore without another provider call", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-autonomous-"));
  let calls = 0;
  const provider = { async completeMessage() { calls += 1; return { content: "Recovered answer", toolCalls: [] }; } };
  const base = createRequest({ profileRoot, workspaceRoot: profileRoot, chatId: "chat", taskId: "stable-task" });
  try {
    await new AutonomousOrchestrator().run(base, { provider }, () => {});
    const result = await new AutonomousOrchestrator().run({ ...base, requestId: "new-request", durableResume: true }, { provider }, () => {});
    assert.equal(result.recovered, true);
    assert.equal(result.content, "Recovered answer");
    assert.equal(calls, 1);
  } finally {
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
});

test("completed plan recovery restores the authoritative repository pointer without another provider call", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-autonomous-plan-recovery-"));
  const body = "# Recovered Plan\n\nPersist once.";
  let calls = 0;
  const provider = { async completeMessage() {
    calls += 1;
    if (calls === 1) return { content: "", toolCalls: [{ id: "save-recovery-plan", function: { name: "plan_create", arguments: JSON.stringify({ title: "Recovered Plan", body }) } }] };
    return { content: "The plan was saved.", toolCalls: [] };
  } };
  const base = createRequest({ action: "plan", prompt: "Create the recovery plan", profileRoot, workspaceRoot: profileRoot, chatId: "plan-chat", taskId: "stable-plan-task", sourceTaskId: "stable-plan-task", planOperation: "create" });
  try {
    const first = await new AutonomousOrchestrator().run(base, { provider }, () => {});
    const restored = await new AutonomousOrchestrator().run({ ...base, requestId: "new-plan-request", durableResume: true }, { provider }, () => {});
    assert.equal(restored.recovered, true);
    assert.equal(restored.content, body);
    assert.equal(restored.plan.id, first.plan.id);
    assert.equal(restored.plan.path, first.plan.path);
    assert.equal(calls, 2);
    const listed = await planTools.planList(profileRoot, { workspaceRoot: profileRoot }, { profileRoot });
    assert.equal(listed.plans.length, 1);
  } finally {
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
});
