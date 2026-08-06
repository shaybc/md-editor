"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  AGENT_STATE_EVENT_SCHEMA_VERSION,
  applyAgentStateEvent,
  createInitialAgentState,
  validateTerminalAgentStateSnapshot
} = require("../resources/ai-companion/core/agent-state");
const { createAgentStateShadow } = require("../resources/ai-companion/core/agent-state-shadow");
const runtime = require("../resources/ai-companion/core/agent-runtime");
const { runAgentMode } = require("../resources/ai-companion/modes/agent");

function event(runId, sequence, type, payload = {}) {
  return {
    schemaVersion: AGENT_STATE_EVENT_SCHEMA_VERSION,
    runId,
    sequence,
    occurredAt: new Date(1700000000000 + sequence).toISOString(),
    type,
    payload
  };
}

test("AgentState accepts sequence gaps while stateVersion counts accepted mutations", () => {
  const initial = createInitialAgentState({ runId: "run-1", prompt: "fix it", executionGeneration: 2 });
  const started = applyAgentStateEvent(initial, event("run-1", 1, "run_started"));
  assert.equal(started.accepted, true);
  assert.equal(started.state.stateVersion, 1);
  assert.equal(initial.lifecycle.status, "initialized", "the reducer must not mutate its input");

  const action = applyAgentStateEvent(started.state, event("run-1", 3, "action_started", {
    actionId: "tool-1",
    tool: "read_file",
    input: "src/a.js"
  }));
  assert.equal(action.accepted, true);
  assert.equal(action.state.lastAcceptedSequence, 3);
  assert.equal(action.state.stateVersion, 2);

  const duplicate = applyAgentStateEvent(action.state, event("run-1", 3, "action_finished", { actionId: "tool-1", status: "succeeded" }));
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, "duplicate-sequence");
  assert.strictEqual(duplicate.state, action.state);

  const wrongRun = applyAgentStateEvent(action.state, event("other", 4, "action_finished", { actionId: "tool-1", status: "succeeded" }));
  assert.equal(wrongRun.reason, "wrong-run");
  assert.equal(applyAgentStateEvent(action.state, event("run-1", 2, "action_finished", { actionId: "tool-1", status: "succeeded" })).reason, "out-of-order-sequence");
  assert.equal(applyAgentStateEvent(action.state, { ...event("run-1", 4, "action_finished"), payload: null }).reason, "invalid-payload");

  const finished = applyAgentStateEvent(action.state, event("run-1", 5, "action_finished", { actionId: "tool-1", status: "succeeded" }));
  const completed = applyAgentStateEvent(finished.state, event("run-1", 6, "run_completed", { reason: "done" }));
  assert.equal(completed.state.lifecycle.status, "completed");
  assert.equal(completed.state.activeActions.length, 0);
  assert.equal(completed.state.stateVersion, 4);
  assert.equal(applyAgentStateEvent(completed.state, event("run-1", 7, "steering_observed", {})).reason, "post-terminal-event");
});

test("M11 task-profile slice drives readiness through the reducer (golden preferences flow)", () => {
  const { createWorkflowState, getProfile } = require("../resources/ai-companion/core/task-profiles");
  const { createTaskState } = require("../resources/ai-companion/core/task-observation-projection");
  const profile = getProfile("preferences-update");
  const keys = ["aiCompanionSettings.a", "aiCompanionSettings.b"];
  const desired = { [keys[0]]: true, [keys[1]]: true };

  let state = createInitialAgentState({ runId: "run-prefs", prompt: "set prefs", controlMode: "controller" });
  state = applyAgentStateEvent(state, event("run-prefs", 1, "run_started")).state;

  // Seed: nothing resolved yet -> incomplete.
  const seed = applyAgentStateEvent(state, event("run-prefs", 2, "task_profile_seeded", {
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    workflowVersion: profile.workflowVersion,
    requiredActionTool: profile.mutationTool,
    capableToolAvailable: true,
    requestedKeys: keys,
    desiredValues: desired,
    taskState: createTaskState({ requestedKeys: keys, desiredValues: desired, requiredActionTool: profile.mutationTool }),
    workflowState: createWorkflowState(profile)
  }));
  assert.equal(seed.accepted, true);
  assert.equal(seed.state.actionReadiness.status, "incomplete");
  assert.equal(seed.state.taskProfile.workflowState.activeStepId, "resolve");

  // Resolve all keys via preferences_search -> ready_for_action, resolve step completed.
  const resolved = applyAgentStateEvent(seed.state, event("run-prefs", 3, "task_profile_updated", {
    observation: { tool: "preferences_search", accepted: true, resolvedAllKeys: true, matches: keys.map((key) => ({ key, descriptor: "d" })) }
  }));
  assert.equal(resolved.state.actionReadiness.status, "ready_for_action");
  assert.equal(resolved.state.taskProfile.workflowState.steps[0].status, "completed");
  assert.equal(resolved.state.taskProfile.workflowState.activeStepId, "update");
  assert.equal(resolved.state.actionReadiness.readiness.requiredAction, "preferences_update");

  // Approval required flips it to ready_for_approval (never bypasses approval).
  const needsApproval = applyAgentStateEvent(resolved.state, event("run-prefs", 4, "task_profile_updated", { approvalRequired: true }));
  assert.equal(needsApproval.state.actionReadiness.status, "ready_for_approval");

  // Update applied -> update step completes.
  const updated = applyAgentStateEvent(needsApproval.state, event("run-prefs", 5, "task_profile_updated", {
    approvalGranted: true,
    observation: { tool: "preferences_update", accepted: true }
  }));
  assert.equal(updated.state.taskProfile.workflowState.steps[1].status, "completed");
  assert.equal(updated.state.taskProfile.workflowState.activeStepId, "verify");

  // Read-back verifies -> verify step completes, profile completed.
  const verified = applyAgentStateEvent(updated.state, event("run-prefs", 6, "task_profile_updated", {
    observation: { tool: "preferences_get", accepted: true, verified: true, matches: keys.map((key) => ({ key, value: true })) }
  }));
  assert.equal(verified.state.taskProfile.workflowState.profileStatus, "completed");
  assert.equal(verified.state.taskProfile.taskState.observedValues[keys[0]], true);
});

test("M11 reducer does not create a task-profile slice without a seed (legacy runs unaffected)", () => {
  let state = createInitialAgentState({ runId: "run-legacy", prompt: "x", controlMode: "controller" });
  state = applyAgentStateEvent(state, event("run-legacy", 1, "run_started")).state;
  assert.equal(state.taskProfile, null);
  assert.equal(state.actionReadiness, null);
  // An update without a seed is rejected.
  const r = applyAgentStateEvent(state, event("run-legacy", 2, "task_profile_updated", { observation: { tool: "preferences_search", accepted: true } }));
  assert.equal(r.accepted, false);
  assert.equal(r.reason, "task-profile-not-seeded");
});

test("AgentState v5 records validated decision lifecycle without raw tool arguments", () => {
  let state = createInitialAgentState({ runId: "run-decisions", prompt: "inspect", controlMode: "controller" });
  const events = [
    event("run-decisions", 1, "run_started"),
    event("run-decisions", 2, "decision_proposed", {
      decision: {
        decisionId: "D1",
        basedOnStateVersion: 1,
        type: "tool_call",
        intentId: "task",
        rationale: "Inspect the file",
        expectedObservation: "File contents",
        tool: { name: "read_file", providerCallId: "call-1", arguments: { path: "secret.txt" } }
      }
    }),
    event("run-decisions", 3, "decision_accepted", { decisionId: "D1" }),
    event("run-decisions", 4, "decision_execution_authorized", { decisionId: "D1" }),
    event("run-decisions", 5, "decision_executed", { decisionId: "D1" })
  ];
  for (const nextEvent of events) {
    const result = applyAgentStateEvent(state, nextEvent);
    assert.equal(result.accepted, true);
    state = result.state;
  }
  assert.equal(state.controlMode, "controller");
  assert.equal(state.recentDecisions[0].status, "executed");
  assert.equal(state.recentDecisions[0].proposedAtStateVersion, 2);
  assert.equal(state.recentDecisions[0].acceptedAtStateVersion, 3);
  assert.equal(state.recentDecisions[0].authorizedAtStateVersion, 4);
  assert.equal(state.recentDecisions[0].executedAtStateVersion, 5);
  assert.equal(JSON.stringify(state.recentDecisions).includes("secret.txt"), false);
  assert.deepEqual(state.decisionCounts, { proposed: 1, accepted: 1, rejected: 0, executed: 1, superseded: 0 });

  let superseded = createInitialAgentState({ runId: "run-superseded", controlMode: "controller" });
  for (const nextEvent of [
    event("run-superseded", 1, "run_started"),
    event("run-superseded", 2, "decision_proposed", { decision: { decisionId: "D2", type: "tool_call", intentId: "task" } }),
    event("run-superseded", 3, "decision_accepted", { decisionId: "D2" }),
    event("run-superseded", 4, "decision_superseded", { decisionId: "D2", runtimeReasonCodes: ["stale_state_version"] })
  ]) {
    const result = applyAgentStateEvent(superseded, nextEvent);
    assert.equal(result.accepted, true);
    superseded = result.state;
  }
  assert.equal(superseded.recentDecisions[0].status, "superseded");
  assert.deepEqual(superseded.recentDecisions[0].runtimeReasonCodes, ["stale_state_version"]);
});

test("AgentState v5 rejects invalid decision lifecycle transitions", () => {
  let state = createInitialAgentState({ runId: "invalid-lifecycle", controlMode: "controller" });
  state = applyAgentStateEvent(state, event("invalid-lifecycle", 1, "run_started")).state;
  state = applyAgentStateEvent(state, event("invalid-lifecycle", 2, "decision_proposed", {
    decision: { decisionId: "D-invalid", type: "tool_call", intentId: "task" }
  })).state;
  state = applyAgentStateEvent(state, event("invalid-lifecycle", 3, "decision_rejected", {
    decisionId: "D-invalid", runtimeReasonCodes: ["unknown_tool"]
  })).state;
  const executed = applyAgentStateEvent(state, event("invalid-lifecycle", 4, "decision_executed", { decisionId: "D-invalid" }));
  assert.equal(executed.accepted, false);
  assert.equal(executed.reason, "invalid-decision-status");
  assert.equal(executed.state.recentDecisions[0].status, "rejected");
});

test("terminal transitions reconcile active actions and pending interactions", () => {
  let state = createInitialAgentState({ runId: "run-reconcile", prompt: "work" });
  for (const nextEvent of [
    event("run-reconcile", 1, "run_started"),
    event("run-reconcile", 2, "action_started", { actionId: "a1", tool: "write_file", input: "a.js" }),
    event("run-reconcile", 3, "approval_requested", { interactionId: "p1", prompt: { question: "allow?" } }),
    event("run-reconcile", 4, "user_input_requested", { interactionId: "q1", prompt: { question: "which?" } }),
    event("run-reconcile", 5, "run_cancelled", { reason: "user cancelled" })
  ]) {
    const result = applyAgentStateEvent(state, nextEvent);
    assert.equal(result.accepted, true);
    state = result.state;
  }
  assert.equal(state.activeActions.length, 0);
  assert.equal(state.pendingInteractions.length, 0);
  assert.equal(state.recentActions.at(-1).status, "cancelled");
  assert.equal(state.recentActions.at(-1).terminalReason, "user cancelled");
  assert.deepEqual(state.interactions.map((entry) => entry.status), ["cancelled", "cancelled"]);
});

test("shadow adapter separates ignored, unmapped, unmatched, and accepted observations", () => {
  let now = 1700000000000;
  const shadow = createAgentStateShadow({ requestId: "shadow-1", prompt: "inspect", clock: () => now++ });
  shadow.observeRuntimeEvent({ type: "content", content: "unchanged" });
  shadow.observeRuntimeEvent({ type: "legacy-unknown", payload: true });
  const cyclicContract = { acceptanceCriteria: [] };
  cyclicContract.self = cyclicContract;
  shadow.observeRuntimeEvent({ type: "intent-contract", contract: cyclicContract });
  shadow.observeRuntimeEvent({ type: "tool", tool: "read_file", input: "a.js", summary: "partial", activity: { id: "unmatched", status: "partial" } });
  shadow.observeRuntimeEvent({ type: "tool", tool: "write_file", input: "b.js", summary: "running", activity: { id: "active", status: "running" } });
  const snapshotEvents = [];
  const snapshot = shadow.emitTerminalSnapshot((value) => snapshotEvents.push(value), "failed", { reason: "provider failed" });

  assert.ok(snapshot);
  assert.equal(snapshot.lastSequence > snapshot.stateVersion, true);
  assert.equal(snapshot.diagnostics.ignoredEventCount, 1);
  assert.equal(snapshot.diagnostics.unmappedEventCount, 1);
  assert.equal(snapshot.diagnostics.unmatchedActionFinishCount, 1);
  assert.equal(snapshot.diagnostics.shadowErrorCount, 1);
  assert.equal(snapshot.state.activeActions.length, 0);
  assert.equal(snapshot.state.recentActions.find((action) => action.actionId === "unmatched").status, "partial");
  assert.equal(snapshot.state.recentActions.find((action) => action.actionId === "active").status, "interrupted");
  assert.equal(snapshotEvents[0].type, "agent-state-snapshot");
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test("snapshot delivery failures remain contained inside shadow diagnostics", () => {
  const shadow = createAgentStateShadow({ requestId: "delivery-failure", prompt: "work" });
  assert.doesNotThrow(() => shadow.emitTerminalSnapshot(() => { throw new Error("sink failed"); }, "completed", { reason: "done" }));
  assert.equal(shadow.getDiagnostics().shadowErrorCount, 1);
});

test("non-serializable callback observations cannot change callback results", async () => {
  const shadow = createAgentStateShadow({ requestId: "callback-observation-failure", prompt: "ask" });
  const response = {};
  response.self = response;
  const clarification = shadow.wrapClarification(async () => response);
  assert.strictEqual(await clarification({ ambiguityId: "AMB-CYCLE" }), response);
  assert.equal(shadow.getDiagnostics().shadowErrorCount, 1);
  const snapshot = shadow.emitTerminalSnapshot(() => {}, "completed", { reason: "done" });
  assert.equal(snapshot.state.interactions[0].status, "abandoned");
});

test("shadow callbacks preserve user responses and callback semantics", async () => {
  const shadow = createAgentStateShadow({ requestId: "shadow-callbacks", prompt: "ask" });
  const clarificationResponse = "Use the exact user answer — unchanged.";
  const approvalResponse = { decision: "instruct", instructions: "Do not edit generated files." };
  const clarification = shadow.wrapClarification(async (details) => {
    assert.equal(details.question, "Which path?");
    return clarificationResponse;
  });
  const approval = shadow.wrapApproval(async (details) => {
    assert.equal(details.tool, "write_file");
    return approvalResponse;
  });

  assert.equal(await clarification({ ambiguityId: "AMB1", question: "Which path?" }), clarificationResponse);
  assert.strictEqual(await approval({ approvalId: "AP1", tool: "write_file", preview: { content: "secret file body" }, compare: { beforeContent: "secret" }, resumeAction: { args: { content: "secret" } } }), approvalResponse);
  const snapshot = shadow.emitTerminalSnapshot(() => {}, "completed", { reason: "done" });
  const clarificationState = snapshot.state.interactions.find((entry) => entry.kind === "clarification");
  const approvalState = snapshot.state.interactions.find((entry) => entry.kind === "approval");
  assert.equal(clarificationState.response, clarificationResponse);
  assert.equal(clarificationState.responseSource, "user");
  assert.equal(approvalState.instructions, approvalResponse.instructions);
  assert.equal(approvalState.status, "denied");
  assert.deepEqual(approvalState.response, approvalResponse);
  assert.equal(Object.hasOwn(approvalState.prompt, "preview"), false);
  assert.equal(Object.hasOwn(approvalState.prompt, "compare"), false);
  assert.equal(Object.hasOwn(approvalState.prompt, "resumeAction"), false);
});

test("terminal snapshot validation checks metadata and generation", () => {
  const shadow = createAgentStateShadow({ requestId: "snapshot-1", prompt: "work", executionGeneration: 3 });
  const snapshot = shadow.emitTerminalSnapshot(() => {}, "completed", { reason: "done" });
  assert.equal(snapshot.schemaVersion, 6);
  assert.equal(snapshot.state.schemaVersion, 6);
  assert.deepEqual(validateTerminalAgentStateSnapshot(snapshot, { executionGeneration: 3 }), { valid: true, errors: [] });
  const stale = structuredClone(snapshot);
  stale.executionGeneration = 2;
  const validation = validateTerminalAgentStateSnapshot(stale, { executionGeneration: 3 });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("execution-generation-mismatch"));
  assert.ok(validation.errors.includes("stale-execution-generation"));
});

test("shadow state bounds recent actions while retaining aggregate counts", () => {
  const shadow = createAgentStateShadow({ requestId: "bounded-actions", prompt: "inspect many" });
  for (let index = 0; index < 55; index += 1) {
    shadow.observeRuntimeEvent({ type: "tool", tool: "read_file", input: `file-${index}.js`, summary: "read", activity: { id: `read-${index}`, status: "completed" } });
  }
  const snapshot = shadow.emitTerminalSnapshot(() => {}, "completed", { reason: "done" });
  assert.equal(snapshot.state.recentActions.length, 50);
  assert.equal(snapshot.state.actionCounts.succeeded, 55);
  assert.equal(snapshot.diagnostics.unmatchedActionFinishCount, 55);
});

test("verification outcome remains independent from technical run completion", () => {
  const shadow = createAgentStateShadow({ requestId: "verification-1", prompt: "verify" });
  shadow.observeRuntimeEvent({
    type: "intent-contract",
    contract: { acceptanceCriteria: [{ id: "AC1", description: "The change is verified" }] }
  });
  shadow.observeRuntimeEvent({
    type: "completion-assessment",
    assessment: { overallStatus: "incomplete", criteria: [{ id: "AC1", status: "unmet", evidenceIds: [] }] },
    evidenceLedger: []
  });
  assert.equal(shadow.getState().verification.overallStatus, "incomplete");
  shadow.observeRuntimeEvent({
    type: "completion-assessment",
    assessment: { overallStatus: "unverified", criteria: [{ id: "AC1", status: "unknown", evidenceIds: [] }] },
    evidenceLedger: []
  });
  const snapshot = shadow.emitTerminalSnapshot(() => {}, "completed", { reason: "technical work ended" });
  assert.equal(snapshot.state.lifecycle.status, "completed");
  assert.equal(snapshot.state.verification.overallStatus, "unverified");
});

test("Agent mode adds one terminal snapshot without changing existing result or provider calls", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-agent-state-success-"));
  const originalCreateProvider = runtime.createProvider;
  const originalRunAgentToolLoop = runtime.runAgentToolLoop;
  let calls = 0;
  runtime.createProvider = () => ({});
  runtime.runAgentToolLoop = async (_provider, _settings, _root, _prompt, mode, emit) => {
    calls += 1;
    assert.equal(mode, "agent");
    emit({ type: "tool", tool: "read_file", input: "README.md", summary: "running", activity: { id: "read-1", status: "running" } });
    emit({ type: "tool", tool: "read_file", input: "README.md", summary: "read", activity: { id: "read-1", status: "completed" } });
    emit({ type: "agent-summary", changedFiles: [], attemptedChanges: [], blockedChanges: [] });
    return "same response";
  };
  const events = [];
  try {
    const result = await runAgentMode({
      settings: { enabled: true, agentEnabled: true },
      workspaceRoot: profileRoot,
      profileRoot,
      requestId: "mode-success",
      executionGeneration: 4,
      prompt: "inspect readme"
    }, (value) => events.push(value));
    assert.deepEqual(result, { content: "same response" });
  } finally {
    runtime.createProvider = originalCreateProvider;
    runtime.runAgentToolLoop = originalRunAgentToolLoop;
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
  assert.equal(calls, 1);
  assert.deepEqual(events.filter((value) => value.type !== "agent-state-snapshot").map((value) => value.type), ["tool", "tool", "agent-summary", "content"]);
  const snapshot = events.at(-1).snapshot;
  assert.equal(snapshot.terminalEventType, "run_completed");
  assert.equal(snapshot.executionGeneration, 4);
});

test("Agent mode emits a cancelled snapshot and rethrows the original error", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-agent-state-cancel-"));
  const originalCreateProvider = runtime.createProvider;
  const originalRunAgentToolLoop = runtime.runAgentToolLoop;
  const cancellation = new Error("AI Companion request cancelled.");
  cancellation.cancelled = true;
  runtime.createProvider = () => ({});
  runtime.runAgentToolLoop = async () => { throw cancellation; };
  const events = [];
  try {
    await assert.rejects(() => runAgentMode({
      settings: { enabled: true, agentEnabled: true },
      workspaceRoot: profileRoot,
      profileRoot,
      requestId: "mode-cancel",
      prompt: "stop"
    }, (value) => events.push(value)), (error) => error === cancellation);
  } finally {
    runtime.createProvider = originalCreateProvider;
    runtime.runAgentToolLoop = originalRunAgentToolLoop;
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
  assert.equal(events.at(-1).snapshot.terminalEventType, "run_cancelled");
  assert.equal(events.at(-1).snapshot.state.lifecycle.status, "cancelled");
});

test("Agent mode emits a failed snapshot and rethrows the original provider error", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-agent-state-failure-"));
  const originalCreateProvider = runtime.createProvider;
  const originalRunAgentToolLoop = runtime.runAgentToolLoop;
  const failure = new Error("provider failed");
  runtime.createProvider = () => ({});
  runtime.runAgentToolLoop = async () => { throw failure; };
  const events = [];
  try {
    await assert.rejects(() => runAgentMode({
      settings: { enabled: true, agentEnabled: true },
      workspaceRoot: profileRoot,
      profileRoot,
      requestId: "mode-failure",
      prompt: "work"
    }, (value) => events.push(value)), (error) => error === failure);
  } finally {
    runtime.createProvider = originalCreateProvider;
    runtime.runAgentToolLoop = originalRunAgentToolLoop;
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
  assert.equal(events.at(-1).snapshot.terminalEventType, "run_failed");
  assert.equal(events.at(-1).snapshot.state.terminalReason, "provider failed");
});

test("M5 Agent failures record semantic failure and one final response before technical failure", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-agent-state-m5-failure-"));
  const originalCreateProvider = runtime.createProvider;
  const originalRunAgentToolLoop = runtime.runAgentToolLoop;
  const failure = new Error("provider failed during verification");
  runtime.createProvider = () => ({});
  runtime.runAgentToolLoop = async () => { throw failure; };
  const events = [];
  try {
    await assert.rejects(() => runAgentMode({
      settings: {
        enabled: true,
        agentEnabled: true,
        agentDecisionControllerEnabled: true,
        agentVerifierCompletionEnabled: true,
        intentContractsEnabled: true
      },
      workspaceRoot: profileRoot,
      profileRoot,
      requestId: "mode-m5-failure",
      prompt: "work"
    }, (value) => events.push(value)), (error) => error === failure);
  } finally {
    runtime.createProvider = originalCreateProvider;
    runtime.runAgentToolLoop = originalRunAgentToolLoop;
    await fs.rm(profileRoot, { recursive: true, force: true });
  }
  const state = events.at(-1).snapshot.state;
  assert.equal(state.lifecycle.status, "failed");
  assert.equal(state.completion.status, "failed");
  assert.equal(state.completion.finalResponse.outcome, "failed");
  assert.equal(state.verificationContextVersion > 0, true);
});
