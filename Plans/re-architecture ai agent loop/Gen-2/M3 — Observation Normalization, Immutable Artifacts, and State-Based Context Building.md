# M3 — Observation Normalization, Immutable Artifacts, and State-Based Context Building

## Summary

M3 makes Agent tool outcomes usable as structured state and proves that every Agent decision context can be rebuilt from that state.

M3 remains shadow-only:

```text
Existing Agent context → provider, unchanged
Tool outcome → immutable artifact + normalized observation → AgentState
AgentState + authoritative request sources → shadow ContextBundle
Legacy context ↔ shadow context coverage comparison
```

Success means every existing Agent decision point produces a bounded, deterministic, provider-neutral `ContextBundle` containing all authoritative requirements and relevant evidence, while legacy provider context and Agent behavior remain unchanged.

## Contracts and implementation order

1. **Immutable request-local artifact store**
   - Serialize each raw tool result or normalized error once and calculate its SHA-256 digest.
   - Use content-addressed identity so identical bytes deduplicate safely:

     ```js
     {
       id: "artifact:<digest>",
       digest,
       kind: "tool-result",
       contentType: "application/json",
       retention: "run",
       sizeChars,
       truncated
     }
     ```

   - Guarantee that one artifact ID always resolves to the same serialized bytes and cannot be replaced.
   - Reject digest/identity collisions rather than overwriting existing content.
   - Store raw bytes only in request memory; AgentState and persisted snapshots receive metadata references.
   - Provide bounded excerpt retrieval without mutating the stored artifact.
   - Contain serialization or storage failures without affecting the Agent run.

2. **Orthogonal normalized observations**
   - Normalize the existing evidence details and returned evidence-ledger entry into:

     ```js
     {
       schemaVersion: 1,
       observationId,
       source: "tool",
       toolCallId,
       tool,
       executionStatus: "executed | denied | skipped | cancelled",
       outcome: "succeeded | partial | failed | no-op | unknown",
       summary: {
         text,
         source: "deterministic | tool | model | legacy-event"
       },
       effect,
       capability,
       resource,
       files,
       evidenceRef,
       artifactRef,
       truncated,
       verification: {
         verifiedState,
         independentlyConfirmed,
         confirmationSource
       }
     }
     ```

   - Map execution independently from outcome:
     - Policy/approval rejection → `denied` + `unknown`.
     - Explicit non-execution → `skipped` + `unknown`, unless the runtime established `no-op`.
     - Cancellation → `cancelled` + `unknown`.
     - An executed partial result → `executed` + `partial`.
   - Reuse the completion ledger’s outcome, confirmation, truncation, evidence ID, and localized files.
   - Reuse the canonical tool-effect registry for effect, capability, and resource.
   - Default current runtime-produced summaries to `deterministic`; use `tool`, `model`, or `legacy-event` only when the upstream source explicitly establishes that provenance.
   - Do not infer relevance, goal progress, criterion satisfaction, retryability, or semantic success.
   - Deduplicate observations by tool-call/evidence identity.

3. **AgentState v2**
   - Add `observation_recorded` to the typed event protocol.
   - Add the latest 50 normalized observations and aggregate counts for both execution disposition and outcome.
   - Associate terminal actions with their normalized observation ID when available.
   - Keep observations immutable, bounded, JSON-serializable, and free of raw tool-result bodies.
   - Preserve the single-writer invariant: only `applyAgentStateEvent` mutates authoritative state.
   - Increment state and event schema versions to 2.
   - Continue storing terminal snapshots in the existing task field; legacy v1 snapshots remain readable but are not resumed as v2 state.

4. **Source identity and deduplication**
   - Assign every context input a stable `sourceId`, source type, authority level, and content fingerprint.
   - Use these precedence rules:
     - Raw current user input and attachments beat derived summaries.
     - Resolved user clarification or approval instructions beat prior/derived state text.
     - The live editor buffer beats saved-file reads and older artifact excerpts for the same path.
     - Current intent-contract projection beats earlier contract revisions.
     - A source is rendered once; later sections reference its ID rather than repeat its text.
   - Exclude the original prompt and verbatim user responses from the state projection when already rendered as authoritative user content.
   - Deduplicate identical user/history messages using role plus canonical content fingerprint.
   - Preserve the intent contract as a distinct normalized requirement source even though it derives from the user prompt.
   - Record deduplication decisions in the manifest:

     ```js
     {
       sourceId,
       renderedInSection,
       omittedFromSections,
       omissionReason
     }
     ```

5. **Provider-neutral Context Builder**
   - Return:

     ```js
     {
       schemaVersion: 1,
       mode: "agent",
       stateVersion,
       messages,
       manifest: {
         totalChars,
         estimatedTokens,
         sections,
         sourceDecisions,
         includedObservationIds,
         includedArtifactRefs,
         omittedCounts,
         requiredSourcesMissing,
         overBudget
       }
     }
     ```

   - Treat these bounded sources as mandatory:
     - System, security, and policy instructions.
     - Current user prompt and image parts.
     - Current intent contract and acceptance criteria.
     - User-authored clarification and approval instructions from the current run.
     - Authoritative AgentState projection.
     - Current text attachments.
     - Live active-file buffer when provided by the current request.
   - Treat recent observations, artifact excerpts, and older conversation history as optional supporting context.
   - Preserve existing source limits: 20,000 active-file characters, 12,000 per text attachment, 32,000 total attachment characters, 24 history messages, and 4,000 characters per history message.
   - Apply a 96,000-character optional-context target; mandatory content is not silently discarded and any resulting overflow is reported.
   - Cap the state projection at 12,000 characters and recent observations/artifact excerpts at 24,000 characters.
   - Select newest observations first, then render selected observations chronologically.
   - Include bounded excerpts only for the newest artifacts that fit; older observations retain summaries and immutable references.
   - Keep tools, typed decisions, validation, provider conversion, and semantic relevance ranking out of M3.

6. **Freshness and conflict handling**
   - Mark the active-file source as `freshness: "live-editor"`.
   - Derive `unsaved: true` from `editorReadContext.activeDocument.dirty`; otherwise record `mayContainUnsavedChanges: true`.
   - When an artifact excerpt references the same normalized path as the live buffer:
     - Keep the observation and artifact reference.
     - Omit the stale excerpt from decision context.
     - Record `superseded-by-live-buffer` in the manifest.
     - Never present the stale artifact as equivalent current-state evidence.
   - Apply the same precedence to a current user attachment when it supersedes an older artifact for the same identified source.

7. **Shadow context comparison**
   - Add an optional hook immediately before every ordinary Agent decision-model call.
   - Build the state context without sending it to the provider.
   - Compare it with the exact legacy messages that will be sent:

     ```js
     {
       legacyEstimatedTokens,
       stateContextEstimatedTokens,
       reductionRatio,
       observationsIncluded,
       observationsOmitted,
       requiredSourcesMissing,
       currentPromptPreserved,
       intentContractPreserved,
       userInstructionsPreserved,
       liveBufferPreserved
     }
     ```

   - Calculate preservation from source identities/fingerprints, not fuzzy text matching.
   - Allow negative reduction ratios when the state context is larger; do not hide regressions.
   - Store only the latest content-free comparison and aggregate build/error counters in shadow diagnostics.
   - Do not emit context messages, artifacts, or comparisons as visible activity.

8. **Fail-open Agent-only wiring**
   - Extend the activity recorder with an optional callback invoked after evidence recording.
   - Pass the evidence entry and original tool details to the observation normalizer without changing the evidence ledger or activity event.
   - Wire artifact storage, observation transitions, context building, and comparison only from Agent mode.
   - Preserve the existing terminal `agent-state-snapshot` event.
   - Permit the panel to validate and save v2 snapshots while retaining legacy v1 snapshots.
   - Do not add settings, UI controls, provider calls, or visible behavior.

## Test plan

- Observation tests covering every execution/outcome combination, partial results, no-op, cancellation, provenance, unknown tools, truncation, confirmation, localization, and deduplication.
- Artifact tests for stable SHA-256 identity, byte immutability, identical-content deduplication, collision rejection, bounded excerpts, and request-local retention.
- Reducer tests for schema v2, `observation_recorded`, immutability, duplicate rejection, action association, bounded history, separate count families, and terminal serialization.
- Deduplication tests proving raw user instructions win and are not repeated in state/history sections.
- Context tests for mandatory-source preservation, deterministic ordering, budgets, observation selection, artifact excerpts, content-free manifests, and overflow reporting.
- Freshness conflict test where a saved-file artifact references file A while the dirty live editor contains newer content for file A; assert the live buffer is marked unsaved and the stale excerpt is omitted as superseded.
- Shadow comparison tests for token estimates, reduction ratio, inclusion/omission counts, source-preservation flags, and missing-source detection.
- Integration tests proving provider messages, tools, call counts, callbacks, final content, and thrown errors remain unchanged.
- Fail-open tests proving artifact, normalization, state, context, fingerprint, or comparison failures cannot fail the Agent request.
- Persistence tests for v2 snapshots and legacy v1 compatibility.
- Boundary tests proving Chat, Plan, Autocomplete, Git Summary, connection/model tests, and specialized AI components do not import or instantiate M3 components.
- Run the new suites plus existing AgentState, evidence, intent, prompt, approval, storage, and mode-boundary suites.

## Expected files to change:

- [agent-artifact-store.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-artifact-store.js) — immutable request-local storage, digests, identity, and excerpt retrieval.
- [agent-observation-normalizer.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-observation-normalizer.js) — orthogonal execution/outcome normalization and summary provenance.
- [agent-context-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-context-builder.js) — source identity, deduplication, freshness precedence, budgets, and manifests.
- [agent-context-comparison.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-context-comparison.js) — content-free legacy/state context coverage metrics.
- [agent-state.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-state.js) — AgentState/event schema v2 and normalized-observation transitions.
- [agent-state-shadow.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-state-shadow.js) — normalization, context hooks, comparison, and shadow diagnostics.
- [agent-activity.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-activity.js) — optional post-evidence observation callback.
- [agent-tool-loop.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-tool-loop.js) — additive decision-context observation hook only.
- [Agent mode](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/modes/agent/index.js) — Agent-only M3 setup and callback wiring.
- [AI Companion panel](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js) — v2 terminal snapshot acceptance with v1 compatibility.
- [observation/context tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-observation-context.test.js) — new artifact, normalization, context, freshness, and comparison coverage.
- [AgentState tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-agent-state.test.js) — v2 reducer, diagnostics, and snapshot tests.
- [mode-boundary tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-mode-boundaries.test.js) — Agent-only M3 and protected-component assertions.
- [task-storage tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-chat-storage.test.js) — v1/v2 snapshot persistence compatibility.

## Assumptions and deferred work

- M2 is complete and remains the authoritative state-transition foundation.
- M3 operates only in Agent shadow mode; Plan and Chat adoption remains M8 and M9 work.
- Artifact persistence is request-local. Durable storage, recovery, and cross-session resolution remain M7 work.
- The provider continues receiving legacy accumulated messages during M3; M4 activates the state-built bundle.
- M3 uses deterministic source precedence and does not introduce model-based relevance scoring.
- Verification, progress classification, retry policy, no-progress detection, replanning, budgets, and completion authority remain M5–M6 work.
- No unrelated or specialized AI behavior is modified.
