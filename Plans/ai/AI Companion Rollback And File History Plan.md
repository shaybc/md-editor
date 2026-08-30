# AI Companion Rollback And File History Plan

## Summary

Add a profile-local, git-backed `CompanionChangeJournal` that records full file snapshots for AI-authored workspace mutations. The UI will expose rollback at three levels: whole task, single file, and “restore chat to this point.” The same journal will also provide local file history for agent-created versions.

Rollback will restore from checkpointed file contents, not reverse-apply patches. Diffs remain display/review data only.

## Key Design Decisions

- Use a **shadow git repo under profile storage**, never the user workspace `.git`.
- Store **full file contents per checkpoint** for all known agent-touched workspace files.
- Index checkpoints by `workspaceFingerprint`, `chatId`, `taskId`, `actionId`, `round`, and `checkpointId`.
- Fully support `apply_edit` and `write_file` in v1.
- Support `run_command` only when changed paths can be detected by bounded before/after workspace scanning; otherwise mark the command as `partialRollback: true`.
- External file writes are recorded in task history but marked `restorable: false` for v1.
- Rollback itself is a user action, not an agent action, and must be previewed in a styled MD-Editor dialog before applying.

## Implementation Changes

### Change Journal Runtime

Create a new autonomous runtime service, tentatively:

`CompanionChangeJournal`

Core responsibilities:

- Resolve journal storage root:
  `<profileRoot>/.md-editor/companion/change-journals/<workspaceFingerprint>/`
- Initialize a private shadow git worktree/repo inside that directory.
- Maintain:
  - `repo/` shadow git repository
  - `index.json` fast lookup metadata
  - `current.json` latest journal head and touched paths
- Commit snapshots using local git config:
  `user.name=MD-Editor AI Companion`
  `user.email=md-editor-ai-companion@local`
- Store workspace files under a stable tree prefix such as:
  `workspace/<normalized-relative-path>`
- Store checkpoint metadata in:
  `.journal/manifest.json`
- Use `git commit --allow-empty` for task/chat position checkpoints that have no byte changes but need a stable restore point.

Minimum service API:

```js
await journal.open(request)

await journal.createTaskCheckpoint({
  kind: "before-task" | "after-task",
  chatId,
  taskId,
  turnIndex,
  label
})

await journal.recordFileMutation({
  tool,
  chatId,
  taskId,
  actionId,
  round,
  path,
  beforeContent,
  afterContent,
  beforeExists,
  afterExists
})

await journal.recordCommandMutation({
  chatId,
  taskId,
  actionId,
  round,
  beforeScan,
  afterScan,
  commandImpact
})

await journal.previewRestore({
  mode: "task" | "file" | "checkpoint",
  checkpointId,
  taskId,
  path
})

await journal.applyRestore(previewId)

await journal.listFileHistory({ path, chatId })
```

Checkpoint metadata shape:

```js
{
  schemaVersion: 1,
  workspaceFingerprint,
  workspaceRoot,
  chatId,
  taskId,
  actionId,
  round,
  kind,
  parentCheckpointId,
  checkpointId,
  commit,
  createdAt,
  paths: [
    {
      path,
      exists,
      sha256,
      size,
      binary,
      action,
      restorable
    }
  ]
}
```

### Runtime Integration

- Instantiate `CompanionChangeJournal` in the autonomous orchestrator next to `RunChronicle`.
- Add `changeJournal.snapshot()` to recovery snapshots so resumed tasks keep their rollback head and touched path set.
- At task start, create a `before-task` checkpoint.
- In `tool-executor`, wrap `apply_edit` and `write_file` after approval and after successful write:
  - use the already prepared mutation preview for before/after content
  - record one `after-action` checkpoint
  - attach `changeJournal` metadata to the tool result
- For `run_command` with `workspace-write` impact:
  - run a bounded pre-command scan of non-ignored workspace files
  - run the command
  - run a bounded post-command scan
  - journal detected changed/created/deleted paths
  - mark result `partialRollback: true` if scanning exceeded limits or path impact was unknown
- At task completion/cancel/failure, create an `after-task` checkpoint when the task has rollbackable changes.
- Ensure tool-completed events persist enough input/result metadata for the renderer to associate changed files with journal entries.

### Bridge And Renderer APIs

Add bridge actions to the AI Companion bridge:

- `change_journal_preview_restore`
- `change_journal_apply_restore`
- `change_journal_file_history`
- `change_journal_compare_checkpoint`

Expected restore preview response:

```js
{
  ok: true,
  previewId,
  mode,
  title,
  checkpointId,
  affectedFiles: [
    {
      path,
      action: "restore" | "delete" | "create" | "conflict" | "skipped",
      currentHash,
      targetHash,
      hasConflict,
      compare
    }
  ],
  blockedFiles: [],
  warnings: []
}
```

Expected apply response:

```js
{
  ok: true,
  restoredFiles,
  skippedFiles,
  warnings,
  checkpointId
}
```

Renderer behavior:

- Add “Rollback task” to task summary/actions when task has rollback metadata.
- Add “Rollback file” and “History” actions to changed-file rows.
- Add “Restore to here” on task/chat timeline positions with a checkpoint.
- Use existing compare tab behavior for preview diffs.
- Use MD-Editor styled dialogs and existing dialog button classes.
- Disable rollback while an agent task is running.
- After rollback, reload affected open tabs, refresh folder tree/git panel, and append a visible `rollback-applied` event to the selected task/chat.

### Expected files to change:

- [desktop-app/resources/ai-companion/orchestration/autonomous/change-journal.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/change-journal.js)
- [desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-orchestrator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-orchestrator.js)
- [desktop-app/resources/ai-companion/orchestration/autonomous/tool-executor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-executor.js)
- [desktop-app/resources/ai-companion/tools/workspace-tools.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/tools/workspace-tools.js)
- [desktop-app/resources/bridges/ai-companion-bridge/ai-companion-bridge.cjs](C:/GitHub/shaybc/md-editor/desktop-app/resources/bridges/ai-companion-bridge/ai-companion-bridge.cjs)
- [desktop-app/resources/js/ai-companion/panel.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- [desktop-app/resources/js/ai-companion/activity-renderer.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/activity-renderer.js)
- [desktop-app/resources/styles.css](C:/GitHub/shaybc/md-editor/desktop-app/resources/styles.css)
- [desktop-app/tests/ai-companion-change-journal.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-change-journal.test.js)
- [desktop-app/tests/ai-companion-activity-renderer.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-activity-renderer.test.js)
- [desktop-app/tests/ai-companion-approval-ui.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-approval-ui.test.js)

## Test Plan

- Unit test journal initialization, checkpoint commits, manifest validation, path containment, and recovery from `current.json`.
- Unit test restore preview for modified, created, deleted, missing, binary, and hash-conflict files.
- Unit test apply restore writes restored content, deletes files created after the checkpoint, and skips conflicted files unless explicitly confirmed.
- Runtime test `apply_edit` and `write_file` attach rollback metadata to tool results and saved task records.
- Runtime test `run_command` journaling marks rollback as partial when changed paths cannot be bounded.
- Renderer test task summary shows rollback only when rollback metadata exists.
- Renderer test changed-file rows show file rollback/history actions.
- Renderer test rollback is disabled while an agent run is active.
- Regression test old task records without rollback metadata still render normally.
- Run focused tests:
  `node --test desktop-app/tests/ai-companion-change-journal.test.js desktop-app/tests/ai-companion-activity-renderer.test.js desktop-app/tests/ai-companion-approval-ui.test.js`

## Assumptions And Defaults

- Existing AI task record schema advances from version 6 to version 7; version 6 records remain readable but do not gain rollback controls.
- Rollback affects only files recorded in the journal; unrelated workspace files are never touched.
- “Undo older task while preserving later tasks” is treated as selective restore and must warn when later checkpoints touched the same files.
- Shadow journal storage is local profile data and is not pushed, committed, or written into the user repository.
- No existing Git panel behavior, approval policy behavior, prompt history behavior, or recovery behavior should be changed except to attach/read rollback metadata.
