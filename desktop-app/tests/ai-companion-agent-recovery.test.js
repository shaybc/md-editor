"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createAgentStateShadow } = require("../resources/ai-companion/core/agent-state-shadow");
const { fingerprint } = require("../resources/ai-companion/core/companion-checkpoint-schema");
const { observeWorkspacePath, reconcilePreparedAction } = require("../resources/ai-companion/core/agent-action-recovery-policy");
const { validateRecoveryScenarios } = require("./eval/ai-companion-mode-runner");

test("the M7 fault-injection fixture covers mandatory recovery barrier families", async () => {
  const source = await fs.readFile(path.join(__dirname, "eval", "recovery-scenarios.json"), "utf8");
  const scenarios = validateRecoveryScenarios(JSON.parse(source));
  assert.equal(scenarios.cases.some((scenario) => scenario.failurePoint === "after-dispatch-before-observation"), true);
  assert.equal(scenarios.cases.some((scenario) => scenario.failurePoint === "ancestor-replaced-by-external-symlink"), true);
});

test("restored AgentState continues its accepted sequence without another run_started", () => {
  const original = createAgentStateShadow({ runId: "run-1", chatId: "chat-1", executionGeneration: 1, controlMode: "controller" });
  original.applyControllerEvent("steering_observed", { revision: 1, reason: "before restart" });
  const saved = original.getState();
  const restored = createAgentStateShadow({
    runId: "run-1", chatId: "chat-1", executionGeneration: 1,
    controlMode: "controller", restoredState: saved
  });
  restored.applyControllerEvent("run_restored", { checkpointId: "checkpoint-1", phase: "decision_ready", stateVersion: saved.stateVersion });
  const next = restored.getState();
  assert.equal(next.lastAcceptedSequence, saved.lastAcceptedSequence + 1);
  assert.equal(next.recovery.resumeAttempt, 1);
  assert.deepEqual(restored.getTransitionsSince(saved.stateVersion).map((entry) => entry.type), ["run_restored"]);
});

test("browser recovery rejects duplicate resumes and late Agent bridge events", async () => {
  const panelSource = await fs.readFile(path.join(__dirname, "..", "resources", "js", "ai-companion", "panel.js"), "utf8");
  assert.ok(panelSource.includes("const durableResumeTaskIds = new Set()"));
  assert.ok(panelSource.includes("durableResumeTaskIds.has(taskId)"));
  assert.ok(panelSource.includes("let activeAgentRunEventToken = null"));
  assert.ok(panelSource.includes("activeAgentRunEventToken === agentEventToken"));
  assert.ok(panelSource.includes("checkpointSummary: null"));
  assert.ok(panelSource.includes('event.type === "agent-checkpoint"'));
});

test("reconcilable mutations prove postconditions or require a fresh decision", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m7-reconcile-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, "note.md");
  await fs.writeFile(target, "before", "utf8");
  const action = {
    actionId: "action-1", tool: "write_file", workspacePath: "note.md",
    preconditionFingerprint: fingerprint("before"), expectedPostcondition: fingerprint("after")
  };
  assert.equal((await reconcilePreparedAction(root, action)).outcome, "restart_decision");
  await fs.writeFile(target, "after", "utf8");
  assert.equal((await reconcilePreparedAction(root, action)).outcome, "reconciled");
  await fs.writeFile(target, "conflict", "utf8");
  assert.equal((await reconcilePreparedAction(root, action)).outcome, "indeterminate");
});

test("external effects are indeterminate and never authorize replay", async () => {
  const result = await reconcilePreparedAction(process.cwd(), { actionId: "cmd-1", tool: "run_command" });
  assert.equal(result.outcome, "indeterminate");
  assert.equal(result.reasonCode, "external-effect-indeterminate");
});

test("current symlink escape blocks recovery before execution", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m7-link-root-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m7-link-outside-"));
  t.after(() => Promise.all([fs.rm(root, { recursive: true, force: true }), fs.rm(outside, { recursive: true, force: true })]));
  const parent = path.join(root, "safe");
  await fs.mkdir(parent);
  await fs.writeFile(path.join(parent, "note.md"), "inside", "utf8");
  assert.equal((await observeWorkspacePath(root, "safe/note.md")).valid, true);
  await fs.rm(parent, { recursive: true, force: true });
  try {
    await fs.symlink(outside, parent, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "UNKNOWN"].includes(error?.code)) return t.skip("Symlink creation is unavailable in this environment.");
    throw error;
  }
  const observation = await observeWorkspacePath(root, "safe/note.md");
  assert.equal(observation.valid, false);
  assert.equal(observation.reason, "symlink-outside-workspace");
});
