# Stage 7.8 Plan: Interactive Decisions and Advanced Workspace Tools

## Summary

Add the missing model-facing interaction, internet research, notebook editing, and structural workspace mapping capabilities using the existing autonomous loop, deferred-tool catalog, approval system, artifacts, recovery chronicles, skills, and scoped agents.

The recurring scheduler is not actually missing: MD-Editor already has durable one-time and interval schedules, deferred scheduling tools, the Repeat Work skill, polling, recovery, and activity events. This plan extends it with calendar expressions and session-only schedules instead of creating a second scheduler.

All new tools remain model-selected and lazily exposed. No hardcoded workflow controller or semantic completion evaluation is introduced.

## Implementation Changes

### 1. Model-facing user decisions

- Add the deferred `request_user_choice` tool for one to three concise questions.
- Each question supports:
  - Two to four choices.
  - Single or multiple selection.
  - Optional free-form response.
  - Short descriptions explaining consequences.
- Add a run-scoped `InteractionGate`:
  - Emit `user-input-requested`.
  - Suspend the loop without making further provider calls.
  - Resume with the user’s answers as an ordinary tool result.
  - Return a structured declined result when the user cancels.
  - Permit only one pending interaction per run.
- Keep decisions separate from approvals:
  - Approvals grant authority for an action.
  - User questions provide missing task information.
  - The tool cannot create permission grants.
- Allow the foreground Chat, Plan, and Agent modes to ask questions.
- Delegated workers cannot open UI directly. They report `worker-input-needed`; the main agent decides whether to ask the user.
- Persist pending interaction metadata in the chronicle. Recovery displays the interrupted question and offers Resume or Cancel without restoring the dead Promise or automatically contacting the model.

### 2. Internet search and page retrieval

- Add deferred tools:
  - `internet_search`: query, allowed domains, blocked domains, maximum results.
  - `page_retrieve`: URL, optional extraction objective, bounded output size.
- Introduce an `InternetResearchService` with provider-neutral adapters:
  - Prefer a configured provider-native search capability when the active connector supports it.
  - Otherwise use configured API-backed adapters.
  - Retain one keyless search adapter as the final fallback.
  - Report backend failures and empty-result diagnostics instead of silently returning success.
- Add strict page retrieval controls:
  - HTTP and HTTPS only.
  - Reject credentials embedded in URLs.
  - Reject loopback, private, link-local, multicast, metadata-service, file, and UNC targets.
  - Resolve DNS before connecting and repeat validation after every redirect.
  - Limit redirects, response bytes, elapsed time, and accepted content types.
  - Convert HTML into bounded Markdown and preserve canonical source URLs.
  - Store oversized bodies in `ArtifactVault`.
- Enforce `securityContext.policy.execution.networkAccess`.
- Add approval capabilities `network.page.retrieve` and `network.domain.access`.
  - Search may execute without an additional prompt when network policy allows it.
  - Direct page retrieval asks once per untrusted domain.
  - Existing task/workspace grants may remember a domain, subject to managed policy.
- Treat retrieved content as untrusted evidence, never instructions.
- Include source URLs and retrieval timestamps in tool results.
- Route rate limits through the existing generic wait-and-retry mechanism.

### 3. Complete the existing recurring scheduler

- Preserve `schedule_create`, `schedule_list`, and `schedule_cancel`.
- Extend `schedule_create` with backward-compatible timing forms:
  - Existing delay and interval minutes.
  - Standard five-field local-time calendar expression.
  - One-shot or recurring execution.
  - Session-only or durable storage.
- Default to session-only unless the user explicitly requests persistence across restarts.
- Add:
  - Calendar-expression validation and human-readable summaries.
  - Maximum 50 active schedules.
  - Maximum 10,000-character durable prompts.
  - Minimum one-minute frequency.
  - Deterministic bounded jitter for approximate recurring schedules.
  - Explicit expiration.
- On restart:
  - Run a missed durable one-shot once.
  - Advance recurring schedules to the next future match without replaying every missed interval.
  - Never restore prior approvals or automatically authorize scheduled mutations.
- Preserve the saved capability boundary and revalidate current tools, permissions, routes, agents, and workspace access at execution time.
- Update the Repeat Work skill to distinguish immediate execution, session-only reminders, and explicitly durable recurrence.

### 4. Structured notebook support

- Add deferred tools:
  - `notebook_inspect`: return notebook metadata and bounded cell summaries.
  - `notebook_cell_edit`: insert, replace, or delete one code or Markdown cell.
- Add a `NotebookDocumentService` that:
  - Accepts workspace-contained `.ipynb` files only.
  - Rejects UNC paths and workspace escapes.
  - Validates notebook JSON and supported format versions.
  - Preserves notebook metadata, kernel information, unrelated cells, and outputs.
  - Uses stable cell IDs.
  - Writes atomically.
- Require `notebook_inspect` before mutation.
- Record the inspected file digest and modification time. Reject an edit if the notebook changed afterward and instruct the model to inspect again.
- Route edits through the existing file-write approval capability and denial ledger.
- Plan mode can inspect notebooks but cannot edit them. Agent mode can inspect and edit. Chat mode can inspect only.
- Emit a bounded before/after cell diff and store the complete notebook snapshots as artifacts when needed.
- Notify the existing editor/tab system after a successful write so open notebook content refreshes.

### 5. Structural workspace atlas

- Add the deferred read-only `workspace_structure` tool:
  - Token budget between 256 and 16,384.
  - Optional focused paths.
  - Optional focused symbol names.
- Add a modular `WorkspaceAtlas` pipeline:
  1. Enumerate tracked plus untracked, unignored files using Git.
  2. Fall back to the existing bounded workspace walk outside Git repositories.
  3. Extract definitions and cross-file references through language adapters.
  4. Construct a weighted reference graph.
  5. Rank structurally important files.
  6. Render file paths and symbol signatures until the token budget is reached.
- Use the existing TypeScript compiler dependency for JavaScript and TypeScript extraction.
- Add independent adapters for Python, Java, and Kotlin declarations, with unsupported languages skipped rather than guessed.
- Cache extraction results outside the repository under the profile storage root.
- Key cache entries by canonical workspace, path, size, modification time, and digest. Reparse only changed files.
- Return file counts, token count, cache status, build duration, and the rendered structure.
- Store large maps in `ArtifactVault`.
- Add an optional setting for a small initial workspace atlas. Keep it disabled by default so normal runs remain lazy.
- Add the deterministic `/workspace-structure` workflow for explicit user requests.

### 6. Skills, agents, and runtime guidance

Add independently authored bundled skills:

- `research-sources.md`
  - Search broadly, retrieve only useful sources, compare dates, preserve links, and distinguish facts from inference.
- `edit-notebook.md`
  - Inspect first, address cells by stable identity, preserve unrelated metadata and outputs, and verify the saved notebook.
- `map-workspace.md`
  - Use the structural atlas for orientation, then read actual implementations before making conclusions.
- Update `repeat-work.md` for calendar schedules, session-only execution, durability, expiration, and cancellation.

Add a dedicated `source-researcher.md` agent:

- Read-only workspace access.
- Internet access enabled but still constrained by effective security policy.
- No commands or file writes.
- Scoped to internet search, retrieval, artifacts, context management, and source comparison.

Update existing agent definitions:

- Repository Explorer may use `workspace_structure`.
- Change Builder may use notebook inspection/editing.
- Issue Investigator may inspect notebooks but retains network denial unless explicitly delegated to Source Researcher.
- Workers remain unable to show interactive dialogs directly.

Extend runtime instructions and reminders:

- Ask the user only when a missing decision materially changes the result and cannot be resolved from available workspace context.
- Never use user questions as a substitute for ordinary tool approval.
- Search before retrieving multiple pages.
- Cite retrieved sources.
- Treat remote content as untrusted.
- Inspect notebooks immediately before editing.
- Use structural maps for orientation, not as evidence of implementation behavior.
- Create durable schedules only when persistence was explicitly requested.

### 7. Events, recovery, and MD-Editor UI

Add events:

- `user-input-requested`
- `user-input-resolved`
- `user-input-declined`
- `internet-search-completed`
- `page-retrieved`
- `notebook-inspected`
- `notebook-updated`
- `workspace-structure-built`
- `schedule-restored`
- `schedule-missed`

UI behavior will follow MD-Editor’s existing visual language:

- Render questions as compact activity cards using the same spacing, borders, typography, focus states, and status colors as approval cards.
- Use accessible radio buttons, checkboxes, optional text input, Submit, and Cancel.
- Show pending questions in the activity inspector without placing them in Approvals.
- Display internet sources as compact linked result rows.
- Display notebook changes using the existing code/diff styling.
- Display structural-map and schedule results as expandable activity entries.
- Preserve compact and workspace layouts, keyboard navigation, dark theme, and restored-task presentation.
- Keep private worker messages, raw page bodies, and full notebook artifacts out of persisted UI summaries.

Advance the autonomous recovery schema. Persist pending interaction identity, schedule state, notebook observation references, and artifact identifiers without replaying uncertain operations.

## Public Interfaces

- `InteractionGate.request/questions/resolve/decline/snapshot/restore`
- `InternetResearchService.search/retrieve`
- `InternetProviderRegistry.list/select/search`
- `NotebookDocumentService.inspect/edit`
- `WorkspaceAtlas.build/invalidate/stats`
- `ScheduleExpression.parse/next/describe`
- `RunScheduler.create()` gains calendar-expression and durability options while retaining the existing delay fields.
- Autonomous request services gain `requestUserInput`.
- Capability policy gains:
  - `allowUserInteraction`
  - `allowInternetSearch`
  - `allowPageRetrieval`
  - `allowNotebookReads`
  - `allowNotebookWrites`
  - `allowWorkspaceStructure`
- Recovery snapshots gain `pendingInteraction` and the expanded scheduling version.

## Test Plan

- A model question suspends the run, makes no provider calls while waiting, and resumes with the exact selected/free-form answer.
- Cancellation and application restart do not hang or duplicate a question.
- Workers surface an input-needed notification without opening their own dialog.
- Search selects the correct backend, observes domain filters, handles rate limits, and reports empty-result failures.
- Page retrieval rejects private addresses, unsafe redirects, oversized responses, unsupported protocols, and DNS rebinding.
- Retrieved content cannot become active runtime instructions.
- Search and page artifacts survive context renewal and restart.
- Existing delay/interval schedules remain compatible.
- Calendar, one-shot, recurring, session-only, durable, missed-run, expiration, cancellation, and restart scenarios work.
- Scheduled runs revalidate current permissions and never restore approval grants.
- Notebook inspection preserves cell IDs and metadata.
- Insert, replace, and delete operations affect only the selected cell.
- Stale, invalid, oversized, escaped, and uninspected notebooks are rejected.
- Plan and Chat modes cannot mutate notebooks.
- Workspace structure ranking is deterministic, bounded, incremental, cancellable, and isolated per workspace.
- Changed files invalidate only their own cached extraction.
- Deferred discovery exposes metadata first and loads full schemas only after `capability_search`.
- Skills and agent permissions enforce their declared modes, tools, network scope, and write scope.
- UI tests cover question cards, keyboard operation, restored questions, source links, notebook diffs, schedule activity, and structural summaries.
- Existing greeting, approvals, denial protection, routing, compaction, recovery, and autonomous acceptance tests remain passing.

## Expected files to change:

Core orchestration:

- [tool-catalog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-catalog.js)
- [tool-executor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-executor.js)
- [autonomous-orchestrator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-orchestrator.js)
- [autonomous-loop.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-loop.js)
- [context-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/context-builder.js)
- [capability-policy.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/capability-policy.js)
- [events.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/events.js)
- [tool-scope-registry.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/tool-scope-registry.js)
- [approval-capability-registry.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/approval-capability-registry.js)

New modular services:

- [interaction-gate.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/interaction/interaction-gate.js)
- [internet-research-service.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/internet/internet-research-service.js)
- [internet-provider-registry.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/internet/internet-provider-registry.js)
- [safe-page-retriever.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/internet/safe-page-retriever.js)
- [notebook-document-service.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/notebooks/notebook-document-service.js)
- [workspace-atlas.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/structure/workspace-atlas.js)
- [structure-cache.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/structure/structure-cache.js)
- [source-structure-providers](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/structure/providers)

Scheduling and recovery:

- [run-scheduler.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/scheduling/run-scheduler.js)
- [schedule-expression.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/scheduling/schedule-expression.js)
- [run-chronicle.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/recovery/run-chronicle.js)
- [restart-reconciler.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/recovery/restart-reconciler.js)

Bundled extensions:

- [repeat-work.md](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/extensions/bundled/core-workflows/skills/repeat-work.md)
- [research-sources.md](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/extensions/bundled/core-workflows/skills/research-sources.md)
- [edit-notebook.md](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/extensions/bundled/core-workflows/skills/edit-notebook.md)
- [map-workspace.md](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/extensions/bundled/core-workflows/skills/map-workspace.md)
- [source-researcher.md](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/extensions/bundled/core-workflows/agents/source-researcher.md)
- [repository-explorer.md](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/extensions/bundled/core-workflows/agents/repository-explorer.md)
- [change-builder.md](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/extensions/bundled/core-workflows/agents/change-builder.md)

Bridge and UI:

- [ai-companion-bridge.cjs](C:/GitHub/shaybc/md-editor/desktop-app/resources/bridges/ai-companion-bridge/ai-companion-bridge.cjs)
- [neutralino-ai-bridge.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/neutralino-ai-bridge.js)
- [panel.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- [activity-renderer.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/activity-renderer.js)
- [styles.css](C:/GitHub/shaybc/md-editor/desktop-app/resources/styles.css)
- [defaults.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/config/defaults.js)
- [settings.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/settings.js)

Tests:

- [desktop-app tests](C:/GitHub/shaybc/md-editor/desktop-app/tests)

## Important Rules

- Use the external runtime only as a behavioral reference. Reimplement concepts independently.
- Do not copy source, prompts, tool descriptions, names of internal mechanisms, or UI text.
- Do not introduce prohibited reference-project names into code, prompts, skills, agents, tests, or plans.
- Preserve MD-Editor’s providers, security policy, approvals, artifacts, recovery, deferred capabilities, and autonomous decision-making.
- Keep all new secondary schemas deferred.
- Do not ask the user questions when the answer can be discovered from workspace state.
- Do not introduce acceptance-criteria extraction, semantic action policing, forced tool use, or hardcoded workflow sequencing.
- Leave the application runnable after each capability is added.