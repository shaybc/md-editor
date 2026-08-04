# M2 — Shadow AgentState and Typed State Transitions

## Summary

M2 introduces structured state for Agent mode only. It observes and persists existing Agent behavior but cannot influence prompts, model calls, tools, approvals, verification, completion, retries, or responses.

Its defining invariant is:

```text
Shadow state may observe and persist existing Agent behavior,
but it must never influence that behavior in M2.
```

## State, event, and snapshot contracts

- Use this typed internal event envelope:

  ```js
  {
    schemaVersion: 1,
    runId,
    sequence,
    occurredAt,
    type,
    payload
  }
  ```

- `sequence` is the position of every observation attempt within the run. Ignored, unmapped, or rejected observations may consume a sequence number.
- `stateVersion` is the number of accepted state mutations. It increments exactly once per accepted transition and may be lower than `sequence`.
- Accept these transition types:

  - `run_started`
  - `intent_contract_observed`
  - `action_started`
  - `action_finished`
  - `approval_requested`
  - `approval_resolved`
  - `user_input_requested`
  - `user_input_resolved`
  - `verification_recorded`
  - `steering_observed`
  - `run_summary_observed`
  - `run_completed`
  - `run_failed`
  - `run_cancelled`

- `AgentState` schema version 1 contains:

  - Run identity, execution generation, lifecycle, timestamps, last accepted sequence, and `stateVersion`.
  - Original prompt and latest normalized intent contract.
  - Acceptance criteria with verification status and evidence references.
  - Active actions, latest 50 terminal actions, and aggregate outcome counts.
  - Clarification and approval interactions with provenance.
  - Latest completion assessment.
  - Changed, attempted, and blocked file references.
  - Steering count and last steering reason.
  - Non-null terminal reason after termination.

- Action statuses are:

  ```text
  running
  succeeded
  partial
  failed
  denied
  cancelled
  interrupted
  unknown
  ```

- Persist a wrapper rather than a bare state:

  ```js
  {
    schemaVersion: 1,
    snapshotKind: "terminal",
    runId,
    executionGeneration,
    stateVersion,
    lastSequence,
    terminalEventType,
    capturedAt,
    diagnostics,
    state
  }
  ```

- Keep adapter diagnostics outside authoritative state:

  ```js
  {
    ignoredEventCount,
    unmappedEventCount,
    unmatchedActionFinishCount,
    rejectedTransitionCount,
    shadowErrorCount
  }
  ```

- Emit one terminal bridge event:

  ```js
  {
    type: "agent-state-snapshot",
    snapshot
  }
  ```

- Upgrade saved Agent task records to version 4 with `agentStateSnapshot: null | snapshot`. Older records load with `null`.

## Implementation order and behavior

1. **Single-writer state reducer**
   - Add initialization, schema validation, and immutable transition application.
   - Accept sequence gaps while rejecting duplicate, decreasing, wrong-run, malformed, and post-terminal transitions.
   - Keep technical lifecycle separate from verification outcome.
   - Do not let adapter diagnostics increment `stateVersion`.

2. **Shadow adapter**
   - Allocate a sequence for every runtime event, callback observation, and terminalization attempt.
   - Map relevant runtime events to typed transitions.
   - Count explicitly excluded content, narration, reasoning, usage, and context events as ignored.
   - Count unknown runtime shapes as unmapped without creating invalid state transitions.
   - Wrap clarification and approval callbacks without changing their arguments, results, rejection behavior, or timing.
   - Preserve prompts, clarification answers, and approval instructions verbatim with `source: "user"`.
   - Exclude chain-of-thought, raw provider messages, file contents, and raw tool-result bodies.

3. **Action and interaction reconciliation**
   - A finish without a matching start creates a terminal action marked `matchStatus: "unmatched"` and increments `unmatchedActionFinishCount`.
   - On successful run termination, remaining active actions become `interrupted`.
   - On failed termination, remaining active actions become `interrupted`.
   - On cancellation, remaining active actions become `cancelled`.
   - Each reconciled action receives the run terminal reason.
   - Pending approvals and clarifications become `abandoned` on completion/failure and `cancelled` on cancellation.
   - No terminal snapshot may contain a running action or pending interaction.

4. **Agent-mode integration**
   - Instantiate the tracker only inside `runAgentMode`.
   - Pass the existing runtime a wrapped emitter and semantically equivalent approval/clarification callbacks.
   - Preserve the existing Agent content event and `{ content }` return value.
   - Emit the terminal snapshot after successful completion.
   - On cancellation or failure, emit the corresponding snapshot and rethrow the original error unchanged.
   - Make all shadow processing and snapshot delivery fail-open so tracking cannot change Agent behavior or provider-call counts.

5. **Task persistence**
   - Recognize `agent-state-snapshot` without rendering it.
   - Store `event.snapshot` at `record.agentStateSnapshot`.
   - Do not duplicate the snapshot in the ordinary task event array.
   - Clear it when editing, rerunning, or replacing a prompt.
   - Validate that the snapshot’s execution generation matches the task execution generation before storing it.
   - Preserve existing task status, summaries, evidence, conversation history, and resume behavior.

6. **Terminal snapshot gate**
   - Persist only snapshots satisfying:

     ```js
     state.lifecycle.status !== "running";
     state.activeActions.length === 0;
     state.pendingInteractions.length === 0;
     state.terminalReason != null;
     state.stateVersion > 0;
     snapshot.terminalEventType === `run_${state.lifecycle.status}`;
     ```

   - Invalid snapshots are not persisted, increment `shadowErrorCount`, and cannot affect the Agent result.

## Test plan

- Reducer tests for immutable transitions, sequence gaps, duplicate and out-of-order rejection, wrong-run rejection, post-terminal rejection, and independent `sequence`/`stateVersion`.
- Adapter tests distinguishing ignored, unmapped, unmatched, rejected, and shadow-error diagnostics.
- Action tests for matched completion, unmatched finishes, partial results, denial, cancellation, and active-action reconciliation.
- Interaction tests for verbatim user answers/instructions, provenance, resolved, abandoned, and cancelled states.
- Agent-mode tests for successful, incomplete, unverified, failed, and cancelled runs.
- Assert unchanged provider-call counts, content, returned values, callback semantics, and thrown errors.
- Snapshot tests for terminal invariants, metadata, execution-generation matching, bounded collections, and JSON serialization.
- Persistence tests for task schema v4, legacy v1–v3 loading, rerun reset, and rejection of stale or non-terminal snapshots.
- Boundary tests proving Chat, Plan, Autocomplete, Git Summary, model testing, and specialized AI components never instantiate the tracker or emit snapshots.
- Run the new tests plus existing mode-boundary, prompt, task-storage, intent-phase, and approval-policy suites.

## Expected files to change:

- [agent-state.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-state.js) — new state schema, validation, initialization, and reducer.
- [agent-state-shadow.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-state-shadow.js) — new event adapter, diagnostics, reconciliation, and callback wrappers.
- [Agent mode](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/modes/agent/index.js) — Agent-only shadow integration and terminal snapshot emission.
- [AI Companion panel](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js) — task schema v4 and snapshot persistence.
- [AgentState tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-agent-state.test.js) — reducer, adapter, reconciliation, snapshot, and integration tests.
- [Mode-boundary tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-mode-boundaries.test.js) — protected-mode assertions.
- [Task-storage tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-chat-storage.test.js) — saved snapshot, generation, and migration assertions.

## Assumptions and deferred work

- Shadow tracking is always enabled for Agent mode and remains fail-open.
- M2 persists one terminal snapshot, not the complete typed event history.
- M2 does not use state for context building, decisions, tool validation, planning, budgets, retries, no-progress detection, completion authority, checkpoints, or recovery.
- Chat and Plan controller integration remains deferred to their later milestones.
- No unrelated or specialized AI behavior is modified.
