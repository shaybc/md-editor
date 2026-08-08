# Stage 5 Plan: Large-Task Coordination

## Summary

Replace the prototype task map and `SubtaskPool` with persistent model-controlled work tracking and isolated worker coordination. The model decides whether to decompose, delegate, replan, message, wait, stop, or complete; the runtime enforces only schemas, permissions, resource limits, and lifecycle integrity.

Add this rule to the master plan’s **Important rules**:

- During planning, ask the user only when a decision cannot be resolved from the behavioral reference codebase, explicit user requirements, or authoritative MD-Editor constraints. Otherwise, reproduce the reference behavior through independently authored code, prompts, flows, and original MD-Editor terminology.

## Implementation Changes

### Persistent work ledger

- Add a `WorkLedger` storing one validated record per item under the profile and autonomous run identity, using queued atomic writes and a non-reusable numeric high-water mark.
- Use `{ id, subject, description, activeForm?, owner?, status, blocks[], blockedBy[], metadata?, createdAt, updatedAt }`; statuses are `pending`, `in_progress`, and `completed`. Passing `deleted` to update removes the record.
- Keep dependency links symmetric, reject missing/self-referential dependencies, and expose blockers without automatically changing model-selected statuses.
- Replace `task_update` with deferred `work_create`, `work_get`, `work_list`, and `work_update` tools. Work tracking remains optional and is never synthesized from the prompt.

### Isolated worker hub

- Replace `SubtaskPool` with a session-scoped `WorkerHub` supporting `worker_launch`, `worker_list`, `worker_message`, `worker_wait`, and `worker_stop`.
- Launch workers with a fresh transcript containing only the selected Markdown agent definition, delegated prompt, active rules, workspace identity, and permitted capability metadata. Intermediate tool traffic stays out of the parent context; only bounded progress and final summaries return.
- Support synchronous and background launch. Parallel calls in one model response start concurrently, with a hard ceiling of 10 active workers and FIFO queuing beyond that limit.
- Block worker-to-worker delegation and worker launch tools inside workers. Preserve agent-defined tool, model, permission, and mode restrictions.
- Support `shared` and `worktree` isolation. Worktree creation requires approval, falls back to the requested workspace when Git isolation is unavailable, removes unchanged worktrees, and retains changed worktrees with their path and branch in the result.
- Parent cancellation propagates to workers because MD-Editor’s approval and request lifecycle remains authoritative. Bridge shutdown also stops every worker.

### Messaging, waiting, and completion

- Give each worker a serialized inbox. Messages are injected before its next model call; messaging a completed worker resumes its existing transcript. Guard status changes so concurrent messages cannot resume the same worker twice.
- `worker_wait` supports blocking or snapshot reads with a bounded timeout. `worker_stop` aborts only the selected worker and records a terminal stopped state.
- Queue worker completion/failure notifications for insertion before the parent’s next model call. If the parent returns final text while background workers are active, hold that response, inject worker status, and continue until workers finish or the model explicitly stops them.
- Add task and worker lifecycle events for creation, update, start, progress, message, waiting, completion, failure, and stop. Render a live work list and worker cards in the existing AI Companion inspector.
- Extend compaction summaries and running checkpoints with active work items, worker descriptors, unread messages, and unresolved ownership. Stage 5 restores records but marks previously running workers `interrupted`; executable restart recovery remains Stage 6.

## Public Interfaces

- `WorkLedger.create/get/list/update/remove/snapshot()`
- `WorkerHub.launch/list/message/wait/stop/snapshot/close()`
- New model tools: `work_create`, `work_get`, `work_list`, `work_update`, `worker_launch`, `worker_list`, `worker_message`, `worker_wait`, `worker_stop`.
- Agent metadata gains optional `isolation: "shared" | "worktree"` and continues supporting scoped tools, model, permissions, and instructions.
- Checkpoint schema advances independently from legacy state and accepts work/worker snapshots without importing legacy controller modules.

## Test Plan

- Model-created work items persist, maintain monotonic IDs, update dependencies atomically, merge/remove metadata, and reject invalid transitions or references.
- Synchronous, background, parallel, queued, failed, stopped, messaged, resumed, and timed-out workers behave deterministically.
- Worker transcripts remain isolated; agent tool scopes are enforced; recursive delegation is unavailable.
- Parent completion waits for active workers, receives bounded completion summaries, and still emits exactly one final-response event.
- Shared and worktree execution cover approval, unavailable-Git fallback, unchanged cleanup, and changed-worktree retention.
- Compaction retains active work, ownership, worker status, and unread messages.
- Cancellation stops workers and leaves no pending approval, wait, message, or provider promise.
- UI tests verify live task/worker updates, restored interrupted state, and final response persistence.
- Weak-model scenarios demonstrate model-owned decomposition and replanning without acceptance-criteria extraction, mandatory delegation, or semantic action policing.

## Expected files to change:

- [Master migration plan](C:/GitHub/shaybc/md-editor/Plans/re-architecture%20ai%20agent%20loop/Gen-3/Master%20Plan%20Autonomous%20Agent%20Runtime%20Migration.md)
- [Autonomous orchestration](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous)
- [Approval capability registry](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/approval-capability-registry.js)
- [AI Companion panel](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- [AI Companion markup](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [Desktop tests](C:/GitHub/shaybc/md-editor/desktop-app/tests)

## Assumptions

- Legacy remains the default architecture and is otherwise frozen.
- Provider connectors, approvals, security policy, structured execution, storage roots, and cancellation remain authoritative.
- No automatic decomposition, verification worker, completion assessment, or success-criteria enforcement is introduced.
- Executable worker recovery across application restart belongs to Stage 6; Stage 5 preserves enough state to resume it later.
- All new component, protocol, tool, prompt, and event names remain independently authored MD-Editor terminology.
