# M7 — Durable Checkpoints and Restart Recovery

## Summary

M7 makes controller-enabled Agent tasks recoverable from authoritative state, durable artifacts, checkpoint phase, and current workspace observations. Conversation history remains background only.

Core invariant:

```text
A recovered Agent may continue only from reducer-validated, durably stored
state whose identity, artifacts, policies, tools, and current workspace
conditions have been revalidated.

No uncertain external effect may be repeated or claimed successful without
current observable evidence or renewed user approval.
```

M7 activates only for Agent mode. Its storage contract is reusable by Plan and Chat in M8/M9. Autocomplete, Git Summary, connection tests, and specialized AI components remain unchanged.

## Implementation Changes

### 1. Checkpoint and identity contracts

Add a versioned recoverable-checkpoint envelope distinct from terminal snapshots:

```js
{
  checkpointVersion: 1,
  checkpointKind: "recoverable" | "terminal",
  checkpointId,
  previousCheckpointId,
  capturedAt,

  identity: {
    mode: "agent",
    workspaceIdentityFingerprint,
    chatId,
    taskId,
    runId,
    executionGeneration
  },

  cursor: {
    checkpointRevision,
    stateVersion,
    lastAcceptedSequence
  },

  phase:
    "decision_ready" |
    "model_pending" |
    "interaction_pending" |
    "action_prepared" |
    "action_dispatching" |
    "action_observed" |
    "verification_pending" |
    "finalizing" |
    "terminal",

  continuation: {
    decisionId,
    actionId,
    interactionId,
    completionAttemptId,
    verificationId,
    nextRuntimeStep
  },

  compatibility: {
    toolRegistryFingerprint,
    securityPolicyFingerprint,
    approvalPolicyFingerprint,
    controllerPolicyVersion,
    systemPromptFingerprint,
    appVersion
  },

  workspaceObservationManifest: [],
  artifactManifest: {},
  state: {},
  integrity: { algorithm: "sha256", digest }
}
```

Define workspace fingerprints separately:

- `workspaceIdentityFingerprint` is the hash of the canonical, platform-normalized workspace real path. It determines checkpoint eligibility and does not change when workspace files change.
- `workspaceObservationManifest` records relevant paths, existence, type, current/nearest-parent real path, content digest, and expected pre/postconditions. It is evaluated during reconciliation and may legitimately change.
- Re-resolve all paths and symlinks against the current filesystem during recovery.

Increment AgentState to version 6 with reducer-owned recovery state:

```js
{
  recovery: {
    status: "fresh" | "restored" | "reconciling" | "resumed" | "blocked",
    resumeAttempt: 0,
    restoredCheckpointId: "",
    restoredStateVersion: 0,
    restoredAt: null,
    interruptedDecisionId: "",
    interruptedActionId: "",
    interruptedInteractionId: "",
    lastCheckpointId: "",
    lastCheckpointPhase: "",
    lastCheckpointStateVersion: 0,
    recoveryDecision: "",
    reconciliationOutcome: "",
    lastReasonCode: ""
  }
}
```

Add typed reducer events for restoration, interaction interruption, action reconciliation, indeterminate actions, interrupted verification, resumed recovery, and blocked recovery. No recovery component may mutate state directly.

### 2. Eligibility and continuation decisions

Checkpoint validation returns two separate decisions:

```js
{
  eligible: true,
  eligibilityReasonCodes: [],
  continuation:
    "resume" |
    "reconcile" |
    "restart_decision" |
    "user_confirmation" |
    "repair_terminal_projection" |
    "blocked" |
    "none",
  compatibility: {
    tools: "current" | "changed" | "unsupported",
    securityPolicy: "current" | "changed",
    approvalPolicy: "current" | "changed",
    controllerPolicy: "current" | "changed" | "unsupported"
  },
  requiredObservations: [],
  reasonCodes: []
}
```

Eligibility requires valid schema, integrity, workspace identity, mode, task/run identity, execution generation, state cursor, and artifact manifest.

Continuation is evaluated independently:

- `decision_ready` and compatible `model_pending` checkpoints resume or restart the decision.
- Policy drift remains structurally eligible but forces current-policy revalidation.
- A prepared action under changed tool or policy fingerprints cannot dispatch automatically.
- Unsupported state/controller versions block recovery.
- Terminal checkpoints only repair stale task-record projections.
- Edited reruns increment `executionGeneration` and invalidate earlier checkpoints.

Compatibility fingerprints are computed from:

- Canonical tool schemas plus explicit execution/recovery-policy versions.
- The effective security policy’s normalized content and existing policy hash/version.
- Approval capability definitions, approval-policy version/content, and relevant active grants.
- Explicit decision-controller, completion-policy, progress-policy, and recovery-policy versions.

### 3. Atomic persistence and artifacts

Store recovery data beneath the existing task’s chat directory:

```text
<profile>/companion/chats/YYYY/MM/DD/<chatId>/
  <taskId>.json
  <taskId>.recovery/
    checkpoint.json
    checkpoint.bak.json
    artifacts/<sha256>.json
```

Use a per-task queued writer:

1. Export and persist new content-addressed artifacts.
2. Verify every artifact against its digest.
3. Build and validate the new checkpoint.
4. Write and validate a temporary checkpoint.
5. Replace `checkpoint.bak.json` with the formerly current valid checkpoint.
6. Promote the temporary checkpoint to `checkpoint.json`.
7. Re-read and validate the promoted checkpoint.
8. Retain the backup as the previous valid checkpoint until the next successful rotation.

A failed mandatory checkpoint stops controller execution before the next mutation.

Bounds:

- Checkpoint envelope: 512 KiB.
- Individual artifact: 2 MiB.
- Artifact storage per task: 32 MiB.
- Latest and previous valid checkpoint retained.

Oversized artifacts retain their digest and bounded excerpt but become unavailable as authoritative evidence until re-observed.

M7 uses complete state snapshots, not incremental state deltas. Performance optimization is limited to artifact deduplication, exporting only new artifacts, skipping identical checkpoints, and coalescing reducer-only transitions before mandatory barriers.

### 4. Dispatch identity and checkpoint barriers

Every tool attempt receives a runtime-owned identity that is not exposed as model-controlled tool arguments:

```js
{
  actionId,
  executionAttemptId,
  dispatchNonce,
  dispatchState: "prepared" | "dispatching" | "observed" |
                 "reconciled" | "indeterminate",
  preconditionFingerprint,
  expectedPostcondition
}
```

Mutation sequence:

```text
Accept and authorize decision
→ allocate execution identity
→ reducer records action prepared
→ persist action_prepared checkpoint
→ reducer records dispatching
→ persist action_dispatching checkpoint
→ invoke executor with execution identity
→ normalize outcome and artifacts
→ reducer records observation
→ persist action_observed checkpoint
```

A `dispatching` checkpoint means the effect may have occurred. It never authorizes blind replay.

Mandatory awaited barriers occur:

- Before each controller model request.
- Before presenting approval or clarification.
- After recording the response to an interaction.
- Before dispatching every tool.
- After normalized tool outcome and artifact insertion.
- Before and after progress evaluation or completion verification.
- Before final composition and after final-response recording.
- Before the bridge publishes terminal completion, cancellation, or error.

Mutation barriers are never relaxed for performance.

### 5. Recovery coordinator and reconciliation

Add a deterministic recovery coordinator that:

1. Loads and validates the newest checkpoint, using the retained backup only if needed.
2. Hydrates verified immutable artifacts.
3. Restores the state session at the saved sequence without emitting another `run_started`.
4. Applies restoration events through the reducer.
5. Computes eligibility, compatibility, and continuation strategy.
6. Re-observes relevant workspace paths using current real paths and symlink boundaries.
7. Reconciles interrupted work.
8. Persists the reconciliation result before restarting the controller.

Tool recovery classes:

- `repeatable_read`: may run again after current validation.
- `reconcilable_mutation`: compare saved precondition, expected postcondition, and current observation.
- `indeterminate_external`: commands, processes, network effects, Git remote operations, exports, conversions, and uncertain app actions are never replayed automatically.
- `nonresumable`: invalid paths, symlink escapes, unavailable capabilities, corrupted arguments, secrets, or unsupported tool versions block continuation.

Mutation reconciliation outcomes:

- Postcondition proven: record `reconciled` success without replay.
- Original precondition still proven: return for a fresh typed decision and current approval.
- Neither condition proven: record conflict/indeterminate outcome and require a new decision or user confirmation.
- Current path resolves outside the workspace: block recovery.

Pending approvals and clarifications become new live bridge interactions. Existing version-1 approval action/precondition validation remains supported and is always rerun under current policy.

Interrupted verifier calls are discarded. A verifier may be rerun with a new verification ID only when the restored contract, evidence, and verification-context versions remain current.

### 6. Task integration and rollout

Durable resume continues the same logical task:

- Preserve `taskId`, `runId`, and `executionGeneration`.
- Increment `recovery.resumeAttempt`.
- Tag subsequent visible events with recovery attempt and checkpoint ID.
- Preserve accepted instructions, evidence references, progress state, and task lineage.
- Never start recovery automatically.

Bump task records to version 5 with only content-free checkpoint summary fields. Raw state and artifacts remain in the recovery directory.

Introduce internal `agentDurableRecoveryEnabled`, default `false`, requiring Agent controller mode.

Implementation order:

1. Checkpoint schema, AgentState v6, and pure validation.
2. Atomic store, retained backup, and artifact hydration.
3. Default-off shadow checkpoint writes and latency measurement.
4. Restore non-mutating phases.
5. Add dispatch identity and mutation reconciliation.
6. Integrate interactions, same-task UI resume, and terminal repair.
7. Run fault-injection evaluation and retain default-off until acceptance criteria pass.

## Test Plan

Test checkpoint serialization, digest validation, monotonic revisions, path containment, backup rotation, artifact hydration, storage limits, legacy snapshot compatibility, and state-sequence continuation.

Force process loss:

- Before and during a model request.
- Before dispatch and after `action_dispatching`.
- After mutation success but before observation persistence.
- Before and after read-only tool results.
- During approval and clarification.
- During progress evaluation and verification.
- During final-response and terminal projection.

Required assertions:

- No uncertain mutation is automatically replayed.
- No stale interaction, decision, verifier result, or execution token is reused.
- Current workspace observations override stale artifacts.
- Accepted instructions, evidence, progress counters, and budgets survive.
- Missing artifacts cannot establish completion.
- Double-click resume and late bridge output are idempotently rejected.

Add explicit upgrade coverage:

1. Prepare a mutation under tool registry/policy version A.
2. Restart under version B.
3. Confirm the checkpoint remains readable.
4. Confirm the prepared action is not dispatched.
5. Evaluate current compatibility and policy.
6. Reconcile, restart the decision, request confirmation, or block safely.

Add explicit symlink-race coverage:

1. Capture a valid in-workspace path.
2. Stop after the prepared checkpoint.
3. Replace the path or an ancestor with a symlink escaping the workspace.
4. Resume and resolve the current real path.
5. Confirm recovery blocks before approval or execution.

Measure checkpoint latency, total/barrier-blocked time, envelope and artifact bytes, deduplication, recovery-added tokens, provider calls, tool calls, and restore-to-decision/terminal latency.

Acceptance requires:

- Zero mutations dispatched before a durable dispatch checkpoint.
- Zero automatic duplicate or indeterminate-effect replays.
- Zero success claims based on missing, stale, corrupt, or unvalidated evidence.
- Every interrupted write loads the newest or previous complete checkpoint.
- Policy/tool drift never permits automatic prepared-action dispatch.
- M7-off Agent parity and full Chat, Plan, and specialized-component parity.
- Full desktop unit and deterministic recovery suites passing.
- Feature flag remains default-off.

## Expected files to change:

- [companion-checkpoint-schema.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/companion-checkpoint-schema.js)
- [companion-checkpoint-store.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/companion-checkpoint-store.js)
- [agent-recovery-coordinator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-recovery-coordinator.js)
- [agent-action-recovery-policy.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-action-recovery-policy.js)
- [agent-artifact-store.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-artifact-store.js)
- [agent-state.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-state.js)
- [agent-state-shadow.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-state-shadow.js)
- [agent-tool-loop.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-tool-loop.js)
- [interrupted-task-resume.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/interrupted-task-resume.js)
- [Agent mode](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/modes/agent/index.js)
- [headless defaults](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/config/defaults.js)
- [browser settings](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/settings.js)
- [browser interrupted-task-resume.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/interrupted-task-resume.js)
- [AI Companion panel](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- [AgentState tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-agent-state.test.js)
- [checkpoint-store tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-checkpoint-store.test.js)
- [Agent recovery tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-agent-recovery.test.js)
- [approval policy tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-agent-approval-policy.test.js)
- [chat storage tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-chat-storage.test.js)
- [mode-boundary tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-mode-boundaries.test.js)
- [evaluation runner](C:/GitHub/shaybc/md-editor/desktop-app/tests/eval/ai-companion-mode-runner.js)
- [recovery scenarios](C:/GitHub/shaybc/md-editor/desktop-app/tests/eval/recovery-scenarios.json)
- [Agent-loop internals](C:/GitHub/shaybc/md-editor/desktop-app/help/developer/22-ai-companion-agent-loop-and-harnes-internals.md)

## Assumptions and Defaults

- M0–M6 remain authoritative prerequisites.
- Workspace identity is based on canonical root identity, not mutable repository contents.
- Tool/policy drift changes continuation strategy but does not automatically make a structurally valid checkpoint unreadable.
- Full state snapshots are preferred over incremental state deltas in M7.
- Existing approval, security, executor, verifier, and progress-policy ownership remains unchanged.
- Plan and Chat adopt checkpoint recovery in M8/M9.
- No visible general setting, public tool schema, provider API, or specialized AI workflow changes.
