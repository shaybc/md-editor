"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createAgentArtifactStore } = require("../resources/ai-companion/core/agent-artifact-store");
const { applyAgentStateEvent, createInitialAgentState } = require("../resources/ai-companion/core/agent-state");
const { createCompanionCheckpointStore } = require("../resources/ai-companion/core/companion-checkpoint-store");
const {
  CONTROLLER_POLICY_VERSION,
  createWorkspaceIdentity,
  evaluateCheckpointContinuation,
  validateCheckpointEnvelope
} = require("../resources/ai-companion/core/companion-checkpoint-schema");

function nextState(state, type, payload = {}) {
  const result = applyAgentStateEvent(state, {
    schemaVersion: 6,
    runId: state.run.runId,
    sequence: state.lastAcceptedSequence + 1,
    occurredAt: new Date().toISOString(),
    type,
    payload
  });
  assert.equal(result.accepted, true, result.reason);
  return result.state;
}

function compatibility(suffix = "a") {
  return {
    toolRegistryFingerprint: `tools-${suffix}`,
    securityPolicyFingerprint: `security-${suffix}`,
    approvalPolicyFingerprint: `approval-${suffix}`,
    controllerPolicyVersion: CONTROLLER_POLICY_VERSION,
    systemPromptFingerprint: `prompt-${suffix}`,
    appVersion: "test"
  };
}

async function fixture() {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m7-profile-"));
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m7-workspace-"));
  const workspaceIdentity = await createWorkspaceIdentity(workspaceRoot);
  const identity = {
    mode: "agent",
    workspaceIdentityFingerprint: workspaceIdentity.workspaceIdentityFingerprint,
    chatId: "chat-1",
    taskId: "task-1",
    runId: "run-1",
    executionGeneration: 1
  };
  const store = createCompanionCheckpointStore({
    profileRoot,
    chatId: identity.chatId,
    taskId: identity.taskId,
    chatCreatedAt: "2026-08-04T00:00:00.000Z"
  });
  let state = createInitialAgentState({ runId: identity.runId, chatId: identity.chatId, executionGeneration: 1, controlMode: "controller" });
  state = nextState(state, "run_started");
  return { profileRoot, workspaceRoot, identity, store, state };
}

test("checkpoint store rotates the latest and previous complete checkpoint", async (t) => {
  const value = await fixture();
  t.after(() => Promise.all([
    fs.rm(value.profileRoot, { recursive: true, force: true }),
    fs.rm(value.workspaceRoot, { recursive: true, force: true })
  ]));

  const first = await value.store.commit({
    phase: "decision_ready", identity: value.identity, expectedIdentity: value.identity,
    compatibility: compatibility(), state: value.state
  });
  value.state = nextState(value.state, "steering_observed", { revision: 1, reason: "test" });
  const second = await value.store.commit({
    phase: "model_pending", identity: value.identity, expectedIdentity: value.identity,
    compatibility: compatibility(), state: value.state
  });

  assert.equal(second.checkpoint.cursor.checkpointRevision, 2);
  assert.equal(second.checkpoint.previousCheckpointId, first.checkpoint.checkpointId);
  const backup = JSON.parse(await fs.readFile(value.store.location.backupPath, "utf8"));
  assert.equal(backup.checkpointId, first.checkpoint.checkpointId);
});

test("load falls back to the previous valid checkpoint after a torn current write", async (t) => {
  const value = await fixture();
  t.after(() => Promise.all([
    fs.rm(value.profileRoot, { recursive: true, force: true }),
    fs.rm(value.workspaceRoot, { recursive: true, force: true })
  ]));
  const first = await value.store.commit({ phase: "decision_ready", identity: value.identity, expectedIdentity: value.identity, compatibility: compatibility(), state: value.state });
  value.state = nextState(value.state, "steering_observed", { revision: 1 });
  await value.store.commit({ phase: "model_pending", identity: value.identity, expectedIdentity: value.identity, compatibility: compatibility(), state: value.state });
  await fs.writeFile(value.store.location.checkpointPath, "{torn", "utf8");

  const loaded = await value.store.load(value.identity);
  assert.equal(loaded.source, "backup");
  assert.equal(loaded.checkpoint.checkpointId, first.checkpoint.checkpointId);

  value.state = nextState(value.state, "steering_observed", { revision: 2 });
  await value.store.commit({ phase: "decision_ready", identity: value.identity, expectedIdentity: value.identity, compatibility: compatibility(), state: value.state });
  const retained = JSON.parse(await fs.readFile(value.store.location.backupPath, "utf8"));
  assert.equal(retained.checkpointId, first.checkpoint.checkpointId);
});

test("artifacts are hydrated only when their stored digest is current", async (t) => {
  const value = await fixture();
  t.after(() => Promise.all([
    fs.rm(value.profileRoot, { recursive: true, force: true }),
    fs.rm(value.workspaceRoot, { recursive: true, force: true })
  ]));
  const artifacts = createAgentArtifactStore();
  const reference = artifacts.put({ output: "verified" });
  await value.store.commit({
    phase: "action_observed", identity: value.identity, expectedIdentity: value.identity,
    compatibility: compatibility(), state: value.state, artifactRecords: artifacts.exportRecords()
  });
  let loaded = await value.store.load(value.identity);
  assert.equal(loaded.artifactRecords.length, 1);
  await fs.writeFile(path.join(value.store.location.artifactDirectory, `${reference.digest}.json`), "tampered", "utf8");
  loaded = await value.store.load(value.identity);
  assert.deepEqual(loaded.artifactRecords, []);
  assert.deepEqual(loaded.unavailableRefs, [reference.id]);
});

test("identity and integrity are eligibility checks while policy drift changes continuation", async (t) => {
  const value = await fixture();
  t.after(() => Promise.all([
    fs.rm(value.profileRoot, { recursive: true, force: true }),
    fs.rm(value.workspaceRoot, { recursive: true, force: true })
  ]));
  const committed = await value.store.commit({ phase: "action_prepared", identity: value.identity, expectedIdentity: value.identity, compatibility: compatibility("a"), state: value.state });
  assert.equal(validateCheckpointEnvelope(committed.checkpoint, value.identity).valid, true);
  assert.equal(validateCheckpointEnvelope(committed.checkpoint, { ...value.identity, executionGeneration: 2 }).valid, false);
  const drift = evaluateCheckpointContinuation(committed.checkpoint, compatibility("b"));
  assert.equal(drift.eligible, true);
  assert.equal(drift.continuation, "reconcile");
  assert.equal(drift.compatibility.tools, "changed");
});
