# Safe External Paths and Restored Agent Summary Cards

## Summary

Correct AI Companion’s destination handling so the application directory is never treated as an implicit workspace. Relative actions use the opened folder; external actions require a location explicitly supplied by the user, including recognized folders such as Desktop or Documents.

Restore one authoritative terminal summary card for every agent run with `success`, `failure`, `cancelled`, or `aborted` status. File-change summaries and chat-card icons will come from recorded tool results, not optional model output.

## Implementation Changes

### 1. Establish trusted path authority

- Pass `activeFolderPath || ""` to operational AI requests. Do not fall back to the MD-Editor application directory.
- Add a run-scoped path-authority service that recognizes locations from user-authored prompts and `request_user_choice` answers:
  - Literal absolute files and folders.
  - Case-insensitive known folders: Home, Desktop, Documents, Downloads, Pictures, Music, and Videos.
  - Relative suffixes such as `Desktop\requirement.md`.
- Resolve known folders through platform-aware locations, including redirected Windows/OneDrive folders where available.
- Never treat paths generated only by the model, the process working directory, the application directory, or a previous workspace as user-authorized.
- Resolution rules:
  - Relative path + opened folder → resolve inside the opened folder.
  - Explicit absolute or known-folder path → resolve against that external authority.
  - Relative path + no opened folder → return `PATH_LOCATION_REQUIRED`.
  - Absolute path not present in trusted user input → return `PATH_NOT_AUTHORIZED`.
  - An explicitly named existing directory authorizes descendants; an explicitly named file authorizes only that file.
- When location is missing, runtime guidance must direct the agent to use `request_user_choice` with free text enabled. The answer becomes trusted path authority for the current run.
- `read_file`, `write_file`, and `apply_edit` accept workspace-relative, user-authorized absolute, or authorized known-folder paths.
- `run_command` gains an explicit `cwd`; it follows the same authority rules. Without an opened workspace or authorized `cwd`, the agent must ask the user.
- Prevent empty roots from reaching `path.resolve("")`, which currently resolves silently to the process directory.

### 2. Preserve approvals and path visibility

- Reading an explicitly supplied external file requires no additional approval beyond the user’s instruction.
- External writes and commands continue through the existing approval flow.
- Approval descriptors and UI must show the resolved absolute file or working-directory path.
- External grants must be exact-path or task-scoped; they must not become empty-workspace or application-directory grants.
- Tool descriptions and runtime guidance will explain both valid targeting modes: opened-folder-relative or explicitly user-supplied external location.
- Skills remain supplementary; path authority and enforcement stay in trusted runtime code.

### 3. Restore authoritative agent summaries

- Add a runtime-owned mutation ledger populated from tool execution:
  - Successful `write_file` records `created`, `modified`, or `unchanged`.
  - Successful `apply_edit` records `modified` or `unchanged`.
  - Denied, blocked, or failed mutations populate attempted/blocked changes.
  - Store resolved display paths so external changes remain identifiable.
- `write_file` must inspect target existence/content before writing and return an authoritative change type rather than unconditional `{ changed: true }`.
- Emit exactly one `agent-summary` terminal event for every agent-mode run:

```text
status: success | failure | cancelled | aborted
finalResponse
outcome
changedFiles
attemptedChanges
blockedChanges
validation
elapsedMs
completedAt
```

- Status mapping:
  - `success`: the run completed normally.
  - `failure`: an unrecovered provider, tool, or runtime error.
  - `cancelled`: the user explicitly pressed Stop/Cancel.
  - `aborted`: every other incomplete termination, including lifecycle termination, app shutdown, or an unrecoverable restored run.
- Remove persisted `interrupted` as a terminal state. On reload, stale running/interrupted tasks become `aborted` and receive a synthesized summary if one was not saved before shutdown.
- Keep `assistant-final` as the response payload, but agent mode renders it through the terminal summary card instead of leaving only a standalone response. Chat and plan presentation remain unchanged.
- Persist normalized changes before rendering/saving the summary. The full-layout chat card shows the created/edited-files icon whenever any task actually changed a file, even if the overall task later failed, was cancelled, or was aborted.
- Failed, denied, or unchanged writes do not produce the created/edited-files icon.

## Test Plan

- No folder + relative read/write/edit/command → user-location request, no filesystem or command execution.
- No folder + explicit absolute file → read succeeds; write succeeds only after exact-target approval.
- No folder + `Desktop`, `Documents`, or a known-folder-relative file → resolves to the platform folder.
- Opened folder + relative path → existing workspace behavior remains unchanged.
- Model-invented external path → rejected even if syntactically valid.
- Application/process directory is never selected implicitly.
- Approval UI displays the resolved absolute external target.
- New file, modified file, and unchanged write produce correct mutation records.
- Success, failure, user cancellation, and runtime abort each produce exactly one correctly styled summary card.
- Restoring a stale running task produces one aborted summary without resuming it.
- Successful file mutation without model-generated summary data still produces the Changes section and chat-card icon.
- Failed/denied mutation produces attempted or blocked details but no file-change icon.
- Run focused Node tests for path authority, workspace tools, autonomous orchestration, approvals, panel persistence, and activity rendering.

## Expected files to change:

- [script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [path-authority.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/path-authority.js) — new
- [run-summary.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/run-summary.js) — new
- [runtime-guidance.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/prompts/runtime-guidance.js)
- [tool-catalog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-catalog.js)
- [tool-executor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-executor.js)
- [autonomous-loop.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-loop.js)
- [autonomous-orchestrator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-orchestrator.js)
- [events.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/events.js)
- [workspace-tools.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/tools/workspace-tools.js)
- [approval-capability-registry.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/approval-capability-registry.js)
- [panel.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- [activity-renderer.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/activity-renderer.js)
- [ai-companion-path-authority.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-path-authority.test.js) — new
- [ai-companion-autonomous-orchestrator.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-autonomous-orchestrator.test.js)
- [ai-agent-approval-policy.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-agent-approval-policy.test.js)
- [ai-companion-activity-renderer.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-activity-renderer.test.js)
- [ai-companion-panel-preferences.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-panel-preferences.test.js)

## Assumptions and Unchanged Behavior

- Named operating-system folders are intentionally accepted as explicit locations.
- There is no persisted `interrupted` outcome; non-user incomplete termination is `aborted`.
- Existing approval requirements, command-impact analysis, workspace containment, chat behavior, plan behavior, and unrelated AI settings remain unchanged.
- Application/profile directories may still be used internally for MD-Editor configuration and chat storage; only operational workspace targeting loses the application-root fallback.
