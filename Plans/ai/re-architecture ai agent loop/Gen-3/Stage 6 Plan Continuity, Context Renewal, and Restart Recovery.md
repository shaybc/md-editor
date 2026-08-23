# Stage 6 Plan: Continuity, Context Renewal, and Restart Recovery

## Summary

Replace the prototype character-based transcript trimming and single-file checkpoint with a default-on continuity system for the autonomous runtime.

The runtime will preserve useful history through lightweight observation thinning, structured context renewal, bounded long-term recall, append-only run journaling, and executable restart recovery. It will restore active instructions, loaded capabilities, work items, workers, and unresolved actions without introducing acceptance-criteria evaluation or semantic action policing.

## Implementation Changes

### Continuity recall

- Add a run-scoped `ContinuityRecord` stored as structured Markdown with independently authored sections for:
  - Current focus and next actions.
  - Original user request.
  - Decisions and constraints.
  - Important files and components.
  - Commands and verification results.
  - Problems, corrections, and abandoned approaches.
  - Useful findings.
  - Delivered results.
  - Concise activity history.
- Update the record through an isolated, tool-restricted model call that can only modify the continuity artifact.
- Start extraction after approximately 10,000 estimated tokens. Update after at least 5,000 additional tokens and either three new tool calls or a natural no-tool stopping point.
- Run extraction as a serialized background operation. Wait for an in-progress update for at most 15 seconds before context renewal or restart serialization.
- Limit the complete record to approximately 12,000 tokens and each section to approximately 2,000 tokens. Condense older material while prioritizing current state, user corrections, unresolved work, and exact requested results.
- Add a workspace-local recall index containing bounded metadata and summaries from prior autonomous runs. Select relevant records using workspace identity, prompt terms, active paths, recency, and unresolved-work markers.
- Inject only the three most relevant summaries, with a combined 6,000-token ceiling. Add a read-only `continuity_search` tool for lazy retrieval of additional records.
- Treat recalled content as historical reference, never as active instructions. Current application, user, workspace, and path-scoped rules always take precedence.

### Observation thinning and artifact references

- Replace direct character truncation with a `WindowSteward` that estimates tokens using provider usage when available and a conservative local estimator otherwise.
- Resolve context capacity and output limits from the existing model registry. Pass custom-model limits from the UI request; retain the existing character limit only as an unknown-model fallback.
- Before every model request:
  - Preserve system instructions, recent conversational turns, active errors, work state, worker notifications, and complete tool-call/result pairs.
  - Collapse older large read, search, command, web, and external-tool results into bounded reference markers.
  - Remove obsolete duplicate observations and older resolved errors without interpreting task success.
- Persist every collapsed raw result in a run artifact store with an identifier, tool name, byte count, digest, timestamp, and preview.
- Add a read-only `artifact_read` tool supporting bounded offset/length retrieval. Artifacts remain available after compaction and restart.
- Track the five most recently accessed files. Context renewal may re-anchor bounded current excerpts with a maximum of approximately 5,000 tokens per file and 50,000 tokens overall.

### Structured context renewal

- Trigger renewal before a model call when estimated usage reaches the model window minus:
  - Up to 20,000 reserved output tokens.
  - An adaptive safety buffer between 13,000 and 30,000 tokens.
- Partition history on complete conversational turns and never split tool calls from their results.
- Keep the five most recent turn groups and replace older history with a model-generated `RunDigest` containing:
  - User objective and constraints.
  - Decisions and rejected approaches.
  - Files and artifacts changed or inspected.
  - Completed work and verified results.
  - Current execution state.
  - Problems, corrections, and unsuccessful attempts.
  - Active work items, owners, workers, and unread messages.
  - Remaining actions, unresolved questions, and exact key results.
- Generate the digest through an isolated no-tool model call. Strip bulky binary/media content and substitute artifact references before sending the summarization request.
- After renewal, rebuild the authoritative context from current sources:
  - Application and active scoped rules.
  - The new digest and recent turns.
  - Relevant continuity records.
  - Active work items and worker state.
  - Loaded skill and agent bodies.
  - Enabled capability and external-server metadata.
  - Active file references and unresolved tool outcomes.
- Preserve activated extension bodies in a run-scoped registry so they can be reinserted after renewal instead of retaining only their identifiers.
- Attempt a reactive renewal once when a provider reports context overflow. Never automatically repeat the failed model request more than once.
- After three consecutive renewal failures, pause automatic renewal for five minutes, continue with safe observation thinning where possible, and emit a visible diagnostic event.

### Run chronicle and recovery snapshots

- Replace direct checkpoint writes with a versioned `RunChronicle`:
  - Append-only JSONL records with monotonic sequence numbers.
  - Atomic current and previous recovery snapshots.
  - Per-run serialized writes preventing interleaving.
  - Validation of schema, run identity, workspace, mode, and record integrity.
  - Recovery from the previous snapshot or valid journal tail when the newest write is torn or corrupt.
- Record user/model messages, tool lifecycle boundaries, artifact references, context renewals, continuity updates, work changes, worker changes, cancellation, failure, and final completion.
- Store provider/model identity, model limits, workspace identity, instruction and extension fingerprints, active capabilities, renewal state, and the authoritative-final marker.
- Continue writing chronicles for every autonomous run. Load them only for an explicit durable resume or application-driven restart recovery.
- Keep autonomous chronicle schemas independent from legacy state and checkpoints.

### Executable restart reconciliation

- Add a `RestartReconciler` that classifies saved runs as:
  - Completed: restore the persisted final response without another provider call.
  - Cancelled: terminal and not automatically resumed.
  - Recoverable: rebuild the runtime and continue.
  - Incompatible: retain the record for inspection but start no execution.
- Require matching autonomous architecture, logical run identity, action mode, and canonical workspace root.
- Allow provider/model changes, instruction changes, and extension changes, but reload current definitions and inject a concise change notice for model consideration.
- Never restore approval grants or replay pending external, mutating, or otherwise uncertain tool calls. Record their outcomes as unknown and let the model inspect state and choose the next action.
- Persist private worker transcripts, inboxes, selected agent fingerprints, model choice, tool scope, workspace isolation data, and completion state.
- Restore queued or formerly running workers as resumable jobs on their existing transcripts. Inject an interruption notice and continue from the next model decision without replaying an in-flight tool call.
- Revalidate current agent definitions, permissions, tools, and workspace isolation before worker execution. Missing definitions or inaccessible workspaces produce model-visible worker failures.
- Flush a recovery snapshot at safe model/tool boundaries, after context renewal, after work or worker changes, and before controlled shutdown.
- Preserve the exactly-once final-response invariant across completion, restoration, UI persistence, and repeated resume requests.

### Events and UI

- Extend autonomous events with:
  - `context-thinned`
  - `continuity-updated`
  - `chronicle-saved`
  - `run-restored`
  - `recovery-warning`
- Enrich `compaction` events with trigger, estimated tokens before/after, preserved turns, artifact count, and renewal result.
- Display context renewal, restored-run status, interrupted tool outcomes, and resumed workers in the existing activity inspector.
- Persist the recovery summary alongside the task record so the restored UI can explain what resumed without exposing private worker transcripts or raw artifact contents.

## Public Interfaces

- `ContinuityRecord.scheduleUpdate/flush/search/snapshot()`
- `WindowSteward.prepare(messages, context, limits)`
- `WindowSteward.renew(messages, context, options)`
- `ArtifactVault.store/read/reference/snapshot()`
- `RunChronicle.append/saveSnapshot/loadRecovery()`
- `RestartReconciler.evaluate/rebuild()`
- `WorkerHub.snapshot({ private: true })` and `WorkerHub.restoreExecutable(snapshot)`
- New model tools: `continuity_search` and `artifact_read`.
- Autonomous recovery schema advances from version 2 to version 3 with an explicit version-2 migration reader.
- Model requests gain optional `{ contextWindow, maxOutputTokens }` limits resolved from the existing registry.

## Test Plan

- Lightweight thinning collapses eligible old outputs while preserving recent turns, system instructions, active errors, and valid tool-call/result pairing.
- Raw collapsed results remain retrievable through bounded artifact references before and after restart.
- Context thresholds work for large, small, custom, and unknown model windows.
- Structured renewal preserves objectives, decisions, corrections, active work, worker ownership, loaded capabilities, rules, and recent turns.
- Renewed contexts reload changed path-scoped rules and retain previously loaded skill bodies.
- Failed digest generation retries safely, trips the three-failure cooldown, and never creates a request loop.
- Provider context-overflow errors trigger one reactive renewal and one retry.
- Continuity extraction respects initialization/update thresholds, serialization, timeouts, section budgets, workspace isolation, and historical-content precedence.
- Recall returns bounded relevant records without leaking information between workspaces.
- Chronicle writes survive concurrent events, torn current files, malformed journal tails, schema upgrades, and missing previous snapshots.
- Completed, cancelled, recoverable, incompatible, and corrupted runs receive the correct recovery treatment.
- Pending mutating calls and approvals are never replayed after restart.
- Running and queued workers restore their private transcripts, messages, scopes, and isolation state and continue without recursive delegation.
- Compaction followed by process restart can continue a large task, finish remaining work, and publish exactly one final response.
- UI tests cover saved/restored activity, recovery warnings, worker resumption, final persistence, and reopening the completed task.
- Static boundary tests confirm no autonomous memory, renewal, chronicle, or recovery module imports legacy M0–M11 controllers.
- Existing greeting, ordinary chat, tool approval, denial, cancellation, extension, and large-task acceptance tests remain passing.

## Expected files to change:

- [Autonomous orchestrator](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-orchestrator.js)
- [Autonomous loop](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-loop.js)
- [Context budgeting](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/context-budget.js)
- [Context builder](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/context-builder.js)
- [Instruction loader](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/instruction-loader.js)
- [Autonomous checkpoint compatibility facade](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/transcript-checkpoint.js)
- [Autonomous worker hub](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/workers/worker-hub.js)
- [Autonomous orchestration modules](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous)
- [Shared runtime events](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/events.js)
- [Bridge model registry](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/config/model-registry.js)
- [AI Companion panel](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- [Desktop tests](C:/GitHub/shaybc/md-editor/desktop-app/tests)

## Assumptions

- These capabilities are enabled automatically whenever the autonomous architecture is selected; no additional feature flags are introduced.
- Legacy remains the default architecture until the final cutover stage and is otherwise untouched.
- Existing providers, permissions, approvals, cancellation, security policy, transport, profile roots, and task persistence remain authoritative.
- No automatic task decomposition, completion evaluation, acceptance-criteria extraction, workspace-discovery requirement, or semantic action rejection is introduced.
- Continuity records, chronicles, artifacts, and private worker transcripts stay local to the existing profile storage root.
- Existing autonomous version-2 checkpoints remain readable, but all new writes use version 3.
- All new component names, prompts, schemas, and implementation flows use independently authored MD-Editor terminology and code.
