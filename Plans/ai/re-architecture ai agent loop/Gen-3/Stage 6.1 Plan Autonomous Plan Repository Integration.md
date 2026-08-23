# Stage 6.1 Plan: Autonomous Plan Repository Integration

## Summary

Make Plan mode durably create or update repository plans while preserving autonomous model control over plan content.

Plan persistence will be a mode-level transaction, not semantic completion evaluation. The model receives repository tools and one bounded persistence reminder. If a weak model still returns final plan text without using a persistence tool, the runtime saves that exact text deterministically. No acceptance-criteria extraction, plan-quality judgment, or legacy controller dependency is introduced.

## Implementation Changes

### Plan repository capability

- Add `plan_list`, `plan_read`, `plan_create`, and `plan_update` to the autonomous tool catalog and executor, backed by the existing authoritative plan repository.
- Add separate capability-policy fields:
  - `allowPlanReads`
  - `allowPlanWrites`
  - `requirePlanPersistence`
- Enable plan reads and writes in Plan and Agent modes while keeping them unavailable in Chat mode.
- Keep Plan mode workspace-read-only: repository writes must not enable `write_file`, `apply_edit`, commands, or delegation.
- Inject `workspaceRoot`, `sourceChatId`, and `sourceTaskId` from the trusted request instead of accepting model-supplied ownership values.

### Plan repository session

- Add a run-scoped `PlanRepositorySession` that tracks:
  - Requested operation: `create`, `update`, or `auto`.
  - Optional existing plan ID/path.
  - Successful repository operation and authoritative metadata.
  - Exact saved body.
  - Whether the bounded reminder was issued.
- Treat a main-composer “New Plan” request as `create`.
- Use `update` when the UI supplies an existing plan target.
- In `auto`, allow the model to select create or update using the supplied target and conversation context.
- Prevent duplicates by checking `sourceTaskId` before creation. A repeated create for the same task updates the already-created plan.
- Include session state in autonomous recovery snapshots so restart recovery cannot create the same plan twice.

### Instructions and completion behavior

- Extend the always-loaded Plan-mode instruction:
  - New plan → use `plan_create`.
  - Existing-plan revision → read and use `plan_update`.
  - Preserve the target plan identity during updates.
  - Do not create duplicates.
  - Persist the complete Markdown plan before finishing.
- Do not implement this behavior as a lazy skill; it is a mandatory Plan-mode contract.
- At a natural model completion without a successful plan operation, issue one system reminder and continue.
- If the next natural completion still has no plan operation, persist that exact final Markdown automatically:
  - Create when no target exists.
  - Update when an explicit target exists.
- If persistence fails, emit a visible run failure and never represent the response as a saved plan.
- After successful persistence, use the saved plan body and metadata as the authoritative final result and publish exactly one final-response event.

### UI and result synchronization

- Add optional request fields:
  - `planOperation: "create" | "update" | "auto"`
  - `planTarget: { id?: string, path?: string }`
- Return autonomous Plan results as `{ content, architecture, plan }`, where `plan` is authoritative repository metadata including a non-empty path.
- Remove synthetic saved-plan IDs for autonomous responses lacking repository metadata.
- Mark the chat task `planned` only after repository persistence succeeds.
- Refresh the Plans list after create or update.
- Preserve the existing direct plan editor, status changes, execution actions, and repository bridge APIs.

## Public Interfaces

- Capability policy gains `allowPlanReads`, `allowPlanWrites`, and `requirePlanPersistence`.
- Autonomous requests gain optional `planOperation` and `planTarget`.
- Autonomous results gain `plan`.
- Recovery snapshots gain `planPersistence`.
- Add `plan-saved` and `plan-updated` lifecycle events containing repository metadata but not duplicated plan bodies.

## Test Plan

- Main-composer Plan mode creates a Markdown repository plan and immediately displays it in the Plans list.
- A targeted revision updates the existing plan without creating another file or ID.
- Plan mode can list/read plans but cannot modify workspace files or execute commands.
- Agent mode can explicitly manage plans; Chat mode cannot access plan tools.
- A model that follows instructions saves through the tool path.
- A weak model that ignores the first instruction receives exactly one reminder.
- A model that ignores the reminder has its exact final plan text persisted by the deterministic fallback.
- Tool failure produces an error task with no synthetic plan metadata.
- Cancellation before persistence creates no plan.
- Restart after a successful write does not duplicate the plan.
- Final event, repository metadata, chat task, restored UI, and Plans list all reference the same plan ID/path/body.
- Existing provider, approval, rate-limit, recovery, ordinary chat, and autonomous-loop tests remain passing.
- Static tests confirm no autonomous plan module imports legacy M0–M11 controllers.

## Expected files to change:

- [capability-policy.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/capability-policy.js)
- [tool-catalog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-catalog.js)
- [tool-executor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-executor.js)
- [context-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/context-builder.js)
- [autonomous-loop.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-loop.js)
- [autonomous-orchestrator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-orchestrator.js)
- New `plan-repository-session.js` under [autonomous orchestration](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous)
- [shared events.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/events.js)
- [panel.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- Existing autonomous, plan-repository, recovery, and panel tests under [desktop-app/tests](C:/GitHub/shaybc/md-editor/desktop-app/tests)

## Assumptions

- The existing plan repository remains authoritative and is reused unchanged unless idempotent lookup requires a narrowly scoped helper.
- Plan repository writes do not require user approval because Plan mode previously saved plans automatically.
- The deterministic fallback stores the model’s exact plan text and performs no semantic evaluation.
- Legacy Plan controllers remain frozen and are not imported by the autonomous implementation.
- No new feature flag is introduced; this behavior is default-on whenever autonomous Plan mode is selected.
