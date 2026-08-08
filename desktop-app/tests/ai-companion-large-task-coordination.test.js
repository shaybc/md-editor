"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { WorkLedger } = require("../resources/ai-companion/orchestration/autonomous/work/work-ledger");
const { AutonomousOrchestrator } = require("../resources/ai-companion/orchestration/autonomous/autonomous-orchestrator");
const { prepareWorkerWorkspace } = require("../resources/ai-companion/orchestration/autonomous/workers/worker-workspace");
const { WorkerHub } = require("../resources/ai-companion/orchestration/autonomous/workers/worker-hub");
const { ArtifactVault } = require("../resources/ai-companion/orchestration/autonomous/artifacts/artifact-vault");

test("work ledger persists monotonic items and symmetric dependencies", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-work-ledger-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const request = { profileRoot: root, workspaceRoot: root, taskId: "large-task" };
  const ledger = new WorkLedger(request);
  await ledger.load();
  const first = await ledger.create({ subject: "First", description: "First outcome" });
  const second = await ledger.create({ subject: "Second", description: "Second outcome" });
  await ledger.update(first.id, { addBlocks: [second.id], owner: "worker-1", status: "in_progress" });
  assert.deepEqual(ledger.get(first.id).blocks, [second.id]);
  assert.deepEqual(ledger.get(second.id).blockedBy, [first.id]);
  const restored = new WorkLedger(request);
  await restored.load();
  assert.equal(restored.get(first.id).owner, "worker-1");
  await restored.remove(first.id);
  assert.deepEqual(restored.get(second.id).blockedBy, []);
  assert.equal((await restored.create({ subject: "Third", description: "Third outcome" })).id, "3");
});

test("parent completion waits for a background worker and receives its summary", async () => {
  let parentRound = 0;
  const provider = { async completeMessage(messages) {
    const isWorker = /delegated work/i.test(String(messages[0]?.content || ""));
    if (isWorker) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { content: "Worker evidence collected.", toolCalls: [] };
    }
    parentRound += 1;
    if (parentRound === 1) return { content: "", toolCalls: [{ id: "launch", function: { name: "worker_launch", arguments: JSON.stringify({ description: "Collect evidence", prompt: "Inspect delegated work", background: true }) } }] };
    if (parentRound === 2) return { content: "Tentative answer", toolCalls: [] };
    assert.equal(messages.some((message) => /Worker updates/.test(String(message.content))), true);
    return { content: "Final after worker evidence.", toolCalls: [] };
  } };
  const events = [];
  const result = await new AutonomousOrchestrator().run({ action: "agent", prompt: "large task", workspaceRoot: process.cwd(), profileRoot: "", settings: { enabled: true, agentEnabled: true, agentLoopArchitecture: "autonomous", agentMaxResponseTokens: 0 }, securityContext: { policy: { shell: { mode: "deny-and-audit" } } } }, { provider }, (event) => events.push(event));
  assert.equal(result.content, "Final after worker evidence.");
  assert.equal(events.some((event) => event.type === "worker-completed"), true);
  assert.equal(events.filter((event) => event.type === "assistant-final").length, 1);
});

test("denied worktree isolation falls back to the shared workspace", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-worker-space-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = await prepareWorkerWorkspace({ workspaceRoot: root, profileRoot: root, requestApproval: async () => ({ approved: false }), securityContext: { policy: {} } }, "worker-1", "worktree", []);
  assert.equal(workspace.root, root);
  assert.equal(workspace.isolation, "shared");
  assert.match(workspace.fallbackReason, /denied/i);
});

test("interrupted workers resume from private transcripts without replaying unfinished tools", async () => {
  const request = { action: "agent", workspaceRoot: process.cwd(), profileRoot: "", settings: { model: "test" }, securityContext: { policy: { shell: { mode: "deny-and-audit" } } } };
  let observedUnknownOutcome = false;
  const provider = { async completeMessage(messages) {
    observedUnknownOutcome = messages.some((message) => message.role === "tool" && /outcome is unknown/i.test(String(message.content)));
    return { content: "Recovered worker finished.", toolCalls: [] };
  } };
  const parentContext = {
    taskGrants: [],
    capabilities: { definitions: () => [] },
    artifactVault: new ArtifactVault(request),
    saveSnapshot: async () => {}
  };
  const hub = new WorkerHub(provider, request, { fabric: { activate: async () => null }, parentContext, events: { emit() {} } });
  await hub.restoreExecutable([{
    id: "worker-1",
    description: "Recovered work",
    prompt: "Finish the delegated recovery",
    status: "running",
    background: true,
    isolation: "shared",
    messages: [
      { role: "system", content: "Complete delegated work." },
      { role: "user", content: "Finish the delegated recovery" },
      { role: "assistant", content: "", tool_calls: [{ id: "unfinished", function: { name: "write_file", arguments: "{}" } }] }
    ]
  }]);
  const result = await hub.wait("worker-1", { block: true, timeoutMs: 30000 });
  assert.equal(result.status, "completed");
  assert.equal(result.result, "Recovered worker finished.");
  assert.equal(observedUnknownOutcome, true);
  await hub.close();
});
