# Stage 7.1 Plan: Model-Controlled Observation Release

## Summary

Add an autonomous, model-controlled context-cleanup capability named **Observation Release**.

The model can identify obsolete tool results, release their raw content from the active context, and retain durable artifact references for later retrieval. This complements automatic observation thinning and structured compaction; it does not replace either mechanism.

The capability is default-on in Chat, Plan, Agent, and delegated worker contexts. It changes only run-local context and therefore requires no approval.

## Important rules

- Use independently authored MD-Editor terminology, schemas, prompts, and implementation.
- Reimplement the architectural concept without copying source code, component names, or text from the reference project.
- Never remove system, user, or assistant messages.
- Never separate an assistant tool call from its corresponding tool-result message.
- Never permanently discard raw observations; store them in `ArtifactVault` before release.
- Never release active errors, denials, uncertain outcomes, pending approvals, current work state, or recent turns.
- Context release remains model-controlled and optional. It must not become semantic action policing or a completion gate.
- Simple conversations must not receive cleanup reminders.
- Releasing context does not prove task progress, success, or verification.
- A separate cleanup subagent will not be introduced because a worker cannot safely mutate its parent’s transcript. Every primary or delegated agent manages its own context.

## Implementation changes

### Observation identity and lifecycle

Add a run-scoped `ObservationLedger` responsible only for identifying and releasing tool observations.

Each completed tool result receives a stable `observation-N` identifier and metadata:

- Tool and tool-call identity.
- Model round and timestamp.
- Estimated token count.
- Short preview and digest.
- Whether it is releasable and, if not, the protection reason.
- Artifact identifier after automatic thinning or model release.
- Release initiator: `model`, `automatic`, or `compaction`.
- Release time and optional model-provided reason.

The ledger must operate on complete tool-call/result pairs while replacing only the result body.

### Eligibility policy

Add an isolated `ObservationReleasePolicy` that classifies observations structurally, without interpreting task success.

Protect:

- The five most recent conversational turn groups.
- Tool calls still running or with unknown outcomes.
- The latest occurrence of an active error.
- Denials, cancellations, approval requests, and recovery warnings.
- Active work and worker notifications.
- Authoritative plan metadata and final-response information.
- Already compacted system anchors.

Make older completed read, search, command, web, external-server, and other verbose tool results eligible when they exceed a bounded token threshold.

Parallel tool results from the current model round cannot be released until the next round.

### Model tools

Add two context-local tools:

- `context_observation_list`
  - Returns bounded releasable observation metadata.
  - Supports optional filtering by tool, minimum estimated tokens, and age.
  - Never returns complete raw bodies.

- `context_release`
  - Accepts one to twenty observation IDs and a concise reason.
  - Stores every raw result in `ArtifactVault`.
  - Replaces each result with a stable reference marker and preview.
  - Returns per-ID outcomes instead of failing the complete batch.
  - Is idempotent when an observation was already released.

`artifact_read` remains the retrieval path for released content.

These tools are available in every conversational mode and delegated worker, regardless of workspace-write capability, because they modify no external state.

### Automatic thinning integration

Route `WindowSteward.thinObservations()` through `ObservationLedger` rather than maintaining a second replacement implementation.

Automatic thinning and model-controlled release must therefore share:

- Eligibility protection.
- Artifact persistence.
- Reference formatting.
- Events and chronicle records.
- Idempotency.
- Recovery behavior.

Full structured compaction continues to operate independently after targeted release and lightweight thinning have run.

### Instructions and prompts

Add one concise always-loaded operational instruction:

- Release only observations that are clearly obsolete, superseded, duplicated, or no longer useful.
- Do not release active errors, unresolved outcomes, current evidence, or information still needed for the next decision.
- Use `context_observation_list` when candidate identities are unclear.
- Use `artifact_read` if released information becomes relevant again.
- Context cleanup is optional; ordinary responses should finish directly without cleanup calls.

Update Chat, Plan, and Agent prompt defaults while preserving their current mode behavior.

Increment the prompt default revision so existing profiles receive the independently authored instruction through the normal prompt-upgrade path.

### Dynamic reminder

Add a `ContextReleaseReminder` with bounded, pressure-based activation.

Issue a reminder only when:

- At least six releasable observations exist, or they represent approximately 8,000 estimated tokens.
- No release reminder was issued in the previous four model rounds.
- Releasable context has grown materially since the previous reminder.
- The runtime is not already renewing or compacting context.

The reminder should state the number and approximate size of releasable observations and leave the decision to the model.

After release, suppress further reminders until another meaningful accumulation occurs.

### Lazy skill

Add a bundled `manage-context` skill containing independently authored guidance for:

- Recognizing stale versus active observations.
- Listing candidates before release.
- Releasing duplicated searches, superseded file reads, old command output, and resolved diagnostics.
- Preserving active errors and decision-critical evidence.
- Recovering released content through artifact retrieval.
- Avoiding cleanup calls in short or low-context conversations.

The skill remains lazily loaded. Its full body is not placed in every request.

### Delegated agents

Expose run-local context tools to workers without granting additional workspace permissions.

Add a shared worker instruction explaining that:

- A worker may release only observations from its own private transcript.
- It cannot affect the parent transcript.
- It must retain evidence needed for its final handoff.
- Its released artifacts remain private to its run context.

Agent tool scoping must treat Observation Release as a distinct `context` capability that cannot imply read, edit, execute, or delegation access.

### Chronicle and restart recovery

Advance the autonomous recovery schema from version 3 to version 4 with a version-3 migration reader.

Recovery snapshots store:

- Observation sequence.
- Observation-to-tool-call bindings.
- Protection and release state.
- Artifact identifiers.
- Reminder cooldown and growth watermark.

Append `observation-released` chronicle records containing metadata but no raw observation body.

On restart:

- Rebind ledger entries to restored tool-result messages.
- Preserve released markers.
- Never duplicate artifacts.
- Treat missing artifacts as visible recovery warnings.
- Keep already released observations idempotent.

### Events and UI

Add:

- `observation-released`
- `observation-release-reminder`

Enrich `context-thinned` events with the observation IDs and initiator.

The activity inspector should display concise entries such as:

- “Released 3 older observations · approximately 6,400 tokens”
- “Context cleanup available · 8 observations”

Do not expose raw artifact contents or private worker observations in the UI.

## Public interfaces

- `ObservationLedger.register(message, metadata)`
- `ObservationLedger.list(options)`
- `ObservationLedger.release(ids, options)`
- `ObservationLedger.releaseEligibleBefore(boundary, options)`
- `ObservationLedger.snapshot()`
- `ObservationLedger.restore(snapshot, messages)`
- `ObservationReleasePolicy.evaluate(observation, context)`
- `ContextReleaseReminder.evaluate(ledger, round, context)`
- New model tools: `context_observation_list` and `context_release`
- Autonomous recovery schema version 4 with version-3 compatibility

## Acceptance gates

- Ordinary greetings and short questions produce no context-cleanup calls or reminders.
- The model can list and release eligible older tool results.
- Recent results, active errors, denials, and unresolved outcomes cannot be released.
- Tool-call/result pairing remains valid after release.
- Raw released content remains retrievable through `artifact_read`.
- Releasing the same observation twice is harmless.
- Parallel calls cannot release results created in their own round.
- Automatic thinning and model release use the same canonical implementation.
- Released observations remain released after structured compaction and restart.
- Workers can manage only their private context.
- Context release never requests approval or changes workspace state.
- Exactly-once final-response behavior remains unchanged.

## Expected files to change:

- New [observation-ledger.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/context/observation-ledger.js)
- New [observation-release-policy.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/context/observation-release-policy.js)
- New [context-release-reminder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/context/context-release-reminder.js)
- [window-steward.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/context/window-steward.js)
- [artifact-vault.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/artifacts/artifact-vault.js)
- [autonomous-orchestrator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-orchestrator.js)
- [autonomous-loop.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-loop.js)
- [tool-catalog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-catalog.js)
- [tool-executor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-executor.js)
- [context-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/context-builder.js)
- [agent-scope.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/agents/agent-scope.js)
- [worker-hub.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/workers/worker-hub.js)
- [run-chronicle.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/recovery/run-chronicle.js)
- [restart-reconciler.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/recovery/restart-reconciler.js)
- [events.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/events.js)
- [prompts.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/config/prompts.js)
- New [manage-context.md](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/extensions/bundled/core-workflows/skills/manage-context.md)
- [core-workflows extension manifest](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/extensions/bundled/core-workflows/extension.json)
- [panel.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)

No feature flag is introduced; Observation Release is enabled automatically with the autonomous runtime.