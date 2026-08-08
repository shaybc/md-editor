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
const { AgentAuthorityResolver } = require("../resources/ai-companion/orchestration/autonomous/agents/agent-authority-resolver");
const { authorizeTool } = require("../resources/ai-companion/orchestration/autonomous/approval-gateway");

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
  const result = await new AutonomousOrchestrator().run({ action: "agent", prompt: "large task", workspaceRoot: process.cwd(), profileRoot: "", settings: { enabled: true, agentEnabled: true, agentMaxResponseTokens: 0 }, securityContext: { policy: { shell: { mode: "deny-and-audit" } } } }, { provider }, (event) => events.push(event));
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

test("delegated-agent authority only narrows parent tools and blocks disallowed approval prompts", async () => {
  const definition = (name) => ({ type: "function", function: { name, parameters: { type: "object", properties: {} } } });
  const parentContext = {
    policy: { mode: "agent", allowWrites: true, allowCommands: true },
    request: {
      action: "agent",
      securityContext: {
        policy: {
          shell: { mode: "sandbox-shell" },
          execution: { networkAccess: true },
          approvals: { allowedCapabilities: ["*"], maximumGrantLifetime: { default: "workspace" } }
        }
      }
    }
  };
  const agent = { id: "bounded", metadata: {
    allowedModes: ["agent"],
    capabilities: ["read", "edit", "execute"],
    permissions: {
      workspaceWrites: false,
      commands: true,
      networkAccess: false,
      approvalCapabilities: ["shell.freeform"],
      maximumGrantLifetime: "action"
    }
  } };
  const definitions = ["read_file", "apply_edit", "run_command", "mcp_read_resource"].map(definition);
  const authority = AgentAuthorityResolver.resolve(agent, parentContext, { definitions });
  assert.deepEqual(authority.toolNames, ["read_file", "run_command"]);
  assert.equal(authority.maximumGrantLifetime, "action");
  let approvalRequests = 0;
  await assert.rejects(() => authorizeTool({
    agentAuthority: authority,
    profileRoot: "",
    securityContext: parentContext.request.securityContext,
    requestApproval: async () => { approvalRequests += 1; return { approved: true }; }
  }, "write_file", { path: "blocked.md" }, []), (error) => error.code === "AGENT_APPROVAL_NOT_ALLOWED");
  assert.equal(approvalRequests, 0);
});

test("worker launch rejects an agent definition outside the parent mode", async () => {
  const request = { action: "agent", workspaceRoot: process.cwd(), profileRoot: "", securityContext: { policy: {} } };
  const parentContext = {
    request,
    policy: { mode: "agent", allowWrites: true, allowCommands: false },
    capabilities: { registrations: () => [], definitions: () => [] },
    taskGrants: []
  };
  const fabric = {};
  const agentCatalog = { activate: async () => ({ id: "planner", kind: "agent", metadata: { allowedModes: ["plan"] }, body: "Plan only." }) };
  const hub = new WorkerHub({ completeMessage: async () => ({ content: "", toolCalls: [] }) }, request, { fabric, agentCatalog, parentContext, events: { emit() {} } });
  await assert.rejects(() => hub.launch({ agentId: "planner", prompt: "Do work", background: true }), (error) => error.code === "AGENT_MODE_NOT_ALLOWED");
  assert.deepEqual(hub.list(), []);
});

test("worker launch resolves executable definitions through the canonical catalog only", async () => {
  const request = { action: "agent", workspaceRoot: process.cwd(), profileRoot: "", settings: {}, securityContext: { policy: { shell: { mode: "deny-and-audit" } } } };
  let catalogActivations = 0;
  const provider = { async completeMessage(messages) {
    assert.equal(messages.some((message) => /Catalog-owned instructions/.test(String(message.content))), true);
    return { content: "Catalog worker complete.", toolCalls: [] };
  } };
  const parentContext = {
    request,
    policy: { mode: "agent", allowWrites: true, allowCommands: false },
    capabilities: { registrations: () => [], definitions: () => [] },
    artifactVault: new ArtifactVault(request),
    taskGrants: []
  };
  const agentCatalog = {
    activate: async () => {
      catalogActivations += 1;
      return { id: "catalog-worker", kind: "agent", sourceIdentity: ".agents/catalog-worker.md", metadata: { allowedModes: ["agent"], capabilities: ["read"] }, body: "Catalog-owned instructions." };
    },
    list: () => []
  };
  const fabric = { activate: async () => { throw new Error("Bundle activation must not resolve agents."); } };
  const hub = new WorkerHub(provider, request, { fabric, agentCatalog, parentContext, events: { emit() {} } });
  const launched = await hub.launch({ agentId: "catalog-worker", prompt: "Complete catalog work", background: true });
  const completed = await hub.wait(launched.id, { block: true, timeoutMs: 30000 });
  assert.equal(completed.result, "Catalog worker complete.");
  assert.equal(catalogActivations, 1);
  await hub.close();
});
