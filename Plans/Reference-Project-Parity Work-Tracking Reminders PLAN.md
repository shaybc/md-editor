# Reference-Project-Parity Work-Tracking Reminders

## Summary

Strengthen work tracking for weaker models while keeping it advisory and model-controlled. Port the reference project’s behavior: clearer complex-task guidance, inactivity reminders after 10 assistant turns, live stale-item context, completion verification nudges, worker follow-up guidance, and periodic mode reminders.

Strict parity excludes model-switch reminders and universal verification-after-every-edit reminders because the reference project does not implement them.

## Implementation changes

- Recommend work items for multi-step, long-running, or delegated tasks, while discouraging them for simple requests.
- Expand `work_create` and `work_update` descriptions with lifecycle guidance.
- Add a bounded work-tracking reminder:
  - Trigger after 10 assistant turns without a successful `work_create` or `work_update`.
  - Wait another 10 turns before repeating.
  - Reset inactivity after either work mutation succeeds.
  - Include the current work list and prompt the model to update statuses, remove stale items, or begin tracking.
  - Explain how to activate deferred work capabilities when necessary.
- Add completion verification guidance:
  - After three or more completed work items, emit a one-time advisory when no verification item exists.
  - Recognize verification items through `test`, `testing`, `verify`, `verification`, `validate`, `validation`, `audit`, or `check`.
  - Recommend creating a verification item or launching the existing `test-auditor` worker.
  - Re-arm after a verification item is created or the qualifying completion state is removed.
- Enhance completed-worker notifications to direct the parent model to inspect `work_list` and reconcile the associated work item.
- Add five-user-turn workflow reminders:
  - Apply only to Plan and Agent modes.
  - Alternate full and abbreviated reminders.
  - Restate read-only planning and durable plan persistence in Plan mode.
  - Restate autonomous execution, work tracking, and verification in Agent mode.
  - Do not emit workflow reminders in Chat mode.
- Persist reminder state in parent and worker snapshots.
- Add canonical events for work-tracking and workflow reminders.

## Internal interfaces

- Add reminder components exposing `consider(...)`, activity-recording methods, `snapshot()`, and `restore()`.
- Extend internal run and worker snapshots with `workTrackingReminder` and `workflowModeReminder`.
- Keep existing work-tool request and response schemas unchanged.

## Test plan

- Verify the new system and tool guidance.
- Verify the 10-turn inactivity threshold, repeat suppression, and mutation reset.
- Verify reminders contain the live ledger without modifying it.
- Verify reminder state survives parent and worker restoration.
- Verify completion advisories are bounded and suppressed by verification work.
- Verify worker-completion reconciliation guidance.
- Verify five-user-turn Plan and Agent reminder cadence and Chat-mode exclusion.
- Run the focused orchestration and large-task coordination suites.

## Expected files to change:

- [runtime-guidance.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/prompts/runtime-guidance.js)
- [context-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/context-builder.js)
- [tool-catalog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-catalog.js)
- [work-tracking-reminder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/work/work-tracking-reminder.js) — new
- [workflow-mode-reminder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/context/workflow-mode-reminder.js) — new
- [autonomous-loop.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-loop.js)
- [autonomous-orchestrator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-orchestrator.js)
- [worker-hub.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/workers/worker-hub.js)
- [events.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/events.js)
- [ai-companion-large-task-coordination.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-large-task-coordination.test.js)
- [ai-companion-autonomous-orchestrator.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-autonomous-orchestrator.test.js)
- [ai-companion-autonomous-continuity.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-autonomous-continuity.test.js)

## Assumptions

- Parity targets the reference project’s current behavior, translated from its task tools to MD-Editor work tools.
- The reference project’s autonomous mode maps to MD-Editor Agent mode.
- Reminders remain advisory system context and never mutate work items automatically.
- No UI, ledger schema, public tool schema, routing, permission, or unrelated orchestration behavior will change.
