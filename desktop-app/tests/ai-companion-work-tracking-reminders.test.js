"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { AutonomousOrchestrator } = require("../resources/ai-companion/orchestration/autonomous/autonomous-orchestrator");
const { buildSystemMessage, buildWorkerUpdateMessage } = require("../resources/ai-companion/orchestration/autonomous/context-builder");
const { WorkflowModeReminder } = require("../resources/ai-companion/orchestration/autonomous/context/workflow-mode-reminder");
const { getToolDefinitions } = require("../resources/ai-companion/orchestration/autonomous/tool-catalog");
const { WorkTrackingReminder } = require("../resources/ai-companion/orchestration/autonomous/work/work-tracking-reminder");

function request(overrides = {}) {
  return {
    action: "agent", prompt: "complete a complex task", workspaceRoot: process.cwd(), profileRoot: "",
    settings: { enabled: true, agentEnabled: true, agentMaxResponseTokens: 0 },
    ...overrides
  };
}

test("work tracking inactivity reminders use a ten-turn bounded cadence and survive restore", () => {
  const events = [];
  const reminder = new WorkTrackingReminder((event) => events.push(event));
  const items = [{ id: "1", subject: "Old step", description: "Reconcile this step", status: "pending" }];
  for (let turn = 0; turn < 9; turn += 1) reminder.recordAssistantTurn();
  assert.equal(reminder.consider(items, { round: 9, available: true, active: false }), "");
  reminder.recordAssistantTurn();
  const first = reminder.consider(items, { round: 10, available: true, active: false });
  assert.match(first, /work tools have not been updated recently/i);
  assert.match(first, /select:<tool_name>/);
  assert.match(first, /Old step/);
  for (let turn = 0; turn < 9; turn += 1) reminder.recordAssistantTurn();
  assert.equal(reminder.consider(items, { round: 19, available: true, active: true }), "");
  const restored = new WorkTrackingReminder((event) => events.push(event));
  restored.restore(reminder.snapshot());
  restored.recordAssistantTurn();
  assert.match(restored.consider(items, { round: 20, available: true, active: true }), /work tracking reminder/i);
  restored.recordWorkMutation(items);
  for (let turn = 0; turn < 9; turn += 1) restored.recordAssistantTurn();
  assert.equal(restored.consider(items, { round: 29, available: true, active: true }), "");
  assert.equal(events.filter((event) => event.reason === "inactivity").length, 2);
});

test("completed work receives one verification advisory until verification state changes", () => {
  const reminder = new WorkTrackingReminder();
  const completed = [1, 2, 3].map((id) => ({ id: String(id), subject: `Step ${id}`, description: "Implementation", status: "completed" }));
  reminder.recordWorkMutation(completed);
  assert.match(reminder.consider(completed, { round: 3, available: true, active: true }), /test-auditor/);
  assert.equal(reminder.consider(completed, { round: 4, available: true, active: true }), "");
  const verified = [...completed, { id: "4", subject: "Verify behavior", description: "Run focused tests", status: "pending" }];
  reminder.recordWorkMutation(verified);
  assert.equal(reminder.consider(verified, { round: 5, available: true, active: true }), "");
  reminder.recordWorkMutation(completed);
  assert.match(reminder.consider(completed, { round: 6, available: true, active: true }), /verification work item/i);
});

test("workflow mode reminders alternate every five user turns and exclude chat", () => {
  const reminder = new WorkflowModeReminder();
  const messages = Array.from({ length: 4 }, (_, index) => ({ role: "user", content: `Turn ${index}` }));
  assert.equal(reminder.consider(messages, "agent"), "");
  messages.push({ role: "user", content: "Turn 5" });
  assert.match(reminder.consider(messages, "agent"), /continue autonomously/i);
  messages.push({ role: "user", content: "Turn 6" });
  assert.equal(reminder.consider(messages, "agent"), "");
  for (let index = 6; index < 10; index += 1) messages.push({ role: "user", content: `Turn ${index + 1}` });
  assert.match(reminder.consider(messages, "agent"), /remains active/i);
  assert.equal(new WorkflowModeReminder().consider(messages, "chat"), "");
  const planReminder = new WorkflowModeReminder();
  assert.match(planReminder.consider(messages.slice(0, 5), "plan"), /remain read-only/i);
  const restored = new WorkflowModeReminder();
  restored.restore(planReminder.snapshot());
  assert.equal(restored.consider(messages.slice(0, 5), "plan"), "");
});

test("guidance, tool descriptions, and terminal worker updates explain work lifecycle", () => {
  const system = buildSystemMessage(request(), { mode: "agent" }, [], { application: "", rules: [] }, []);
  assert.match(system, /complex work with several independent steps/i);
  assert.match(system, /complete it only after verification/i);
  const tools = getToolDefinitions("agent");
  assert.match(tools.find((entry) => entry.function.name === "work_create").function.description, /Skip this for simple requests/);
  assert.match(tools.find((entry) => entry.function.name === "work_update").function.description, /delete obsolete items/);
  const workerUpdate = buildWorkerUpdateMessage([{ id: "worker-1", status: "completed" }]);
  assert.match(workerUpdate, /Review work_list/);
  assert.match(workerUpdate, /work_update/);
});

test("autonomous loop injects the work reminder after ten assistant turns", async () => {
  let round = 0;
  const provider = { async completeMessage(messages) {
    round += 1;
    if (round === 11) {
      assert.equal(messages.some((message) => /Work tracking reminder/.test(String(message.content))), true);
      return { content: "Reminder observed.", toolCalls: [] };
    }
    return { content: "", toolCalls: [{ id: `search-${round}`, function: { name: "capability_search", arguments: JSON.stringify({ query: "select:work_list" }) } }] };
  } };
  const result = await new AutonomousOrchestrator().run(request({ autonomousMaxRounds: 12 }), { provider }, () => {});
  assert.equal(result.content, "Reminder observed.");
  assert.equal(round, 11);
});
