# Stage 7 Plan: Autonomous Cutover and Legacy Runtime Removal

## Summary

Make the autonomous runtime the only execution path for Chat, Plan, and Agent. Remove the architecture switch, legacy M0–M11 controllers, semantic action policing, legacy checkpoints, and their settings/UI.

Retain providers, tools, permissions, approvals, security, transport, cancellation, plan storage, task history, specialized non-conversational modes, and the complete autonomous runtime delivered in earlier stages.

Perform the cutover in guarded steps: establish autonomous vertical coverage, switch production routing, migrate persistence and recovery, then delete unreachable legacy code.

## Implementation Changes

### Production cutover

- Keep `CompanionOrchestrator.run(request, services, emit)` as the sole conversational entry point.
- Make it instantiate `AutonomousOrchestrator` unconditionally; remove the request-dependent factory and legacy adapter.
- Continue routing bridge actions `chat`, `plan`, and `agent` through this entry point.
- Apply capability policies through the shared kernel:
  - Chat: read-only workspace access and natural text completion.
  - Plan: read-only research plus permission to create/update its plan artifact.
  - Agent: configured workspace tools, writes, commands, and external capabilities subject to current security and approval policies.
- Keep autocomplete, Git summary, provider connection testing, certificate inspection, plan-repository management, approval management, and extension configuration outside the conversational loop.

### Settings and UI migration

- Remove `agentLoopArchitecture` from defaults, normalization, stored settings, launch requests, task pinning, and Settings UI.
- Ignore obsolete architecture and M0–M11 controller keys when reading older settings; omit them from every subsequent save.
- Remove controller, verifier, progress evaluator, intent-contract, deterministic chat-routing, capability-gate, and legacy durable-recovery controls.
- Retain user-facing enablement, provider/model, tool-scope, token, security, approval, extension, and command-execution settings.
- Remove legacy intent, evaluation, verification, evidence, and controller activity rendering while preserving autonomous tools, approvals, workers, work items, context renewal, continuity, and recovery activity.

### Task persistence and recovery

- Advance saved AI task records to version 6.
- New records omit `agentLoopArchitecture`, legacy intent state, and `checkpointSummary`; they retain mode, messages, activity, authoritative final output, and autonomous recovery summary.
- Replace `durableResume` with `resumeRun` for autonomous restart requests.
- Add a read-only bridge operation, `runRecoveryInspect`, which classifies a saved run without starting a provider request.
- Offer resume for recoverable Chat, Plan, and Agent runs; completed runs restore their persisted final output without another provider call.
- Preserve completed legacy task history as read-only conversation history.
- Mark interrupted legacy tasks as historical and non-resumable with a concise migration notice. Do not translate controller state into autonomous state.
- Stop discovering, reading, or writing legacy checkpoint files. Do not automatically delete historical files from user profile storage.

### Legacy removal

- Delete `LegacyOrchestrator` and the old Chat, Plan, and Agent mode implementations.
- Move the few still-authoritative connection/settings helpers out of `core/agent-runtime.js` into focused shared modules before deleting the old loop.
- Delete modules used exclusively for:
  - Intent extraction, contracts, amendments, conflict resolution, and completion steering.
  - Agent state shadows, observations, evidence ledgers, progress evaluation, action recovery, decision control, and verifier-owned completion.
  - Deterministic Chat routing, claim policing, stateful Chat control, and Chat recovery.
  - Stateful Plan control, capability blocking, progress/completion gates, and Plan recovery.
  - Legacy transcript checkpoints and controller artifact storage.
- Determine deletions through an import-reachability audit after production routing changes. Do not remove shared provider, tool, permission, approval, security, storage, or transport modules merely because their filenames contain older terminology.
- Remove tests that exist only to validate deleted controller behavior. Preserve reusable provider, tool, security, approval, and plan-repository tests.

### Important rules

- The prohibited upstream product and project names must not appear in code, tests, prompts, comments, or plans.
- External source code is a behavioral reference only. Reimplement its concepts and execution flow independently; do not copy source.
- Prompts, agents, built-in capabilities, instructions, and rules may inform coverage, but every artifact must be independently phrased and use MD-Editor terminology.
- Preserve the behavioral details, ordering rules, failure handling, continuation behavior, and extensibility concepts represented by the reference implementation.
- Create original names for mechanisms, architecture components, schemas, and internal concepts.
- Implementation questions are asked only when the behavioral reference, explicit requirements, and authoritative MD-Editor constraints do not supply an answer.

## Public Interfaces

- Retain `CompanionOrchestrator.run(request, services, emit)`.
- Remove `createCompanionOrchestrator` and `agentLoopArchitecture`.
- Add bridge action `runRecoveryInspect`.
- Replace request field `durableResume` with `resumeRun`.
- Advance task persistence to version 6 with autonomous recovery metadata and a compatibility reader for older task history.
- Retain autonomous chronicle version 3; do not introduce another recovery format unless implementation requires a schema change.
- Preserve the exactly-once authoritative final-response event contract.

## Test and Acceptance Gates

- A greeting and ordinary question travel through bridge → autonomous runtime → authoritative final event → persistence → reopened UI without tools or hidden verification.
- Chat, Plan, and Agent all use the same kernel with their correct capability policies.
- Read, edit, approval, denial, command, tool-error, cancellation, parallel-tool, and final-persistence scenarios pass vertically.
- Plan mode researches with read-only tools and saves only the intended plan artifact.
- Extensions, scoped rules, skills, agents, hooks, deferred tools, external servers, work items, workers, continuity, context renewal, and restart recovery remain default-on.
- Recoverable autonomous tasks resume in every conversational mode; completed tasks restore without a provider call.
- Interrupted legacy tasks remain viewable but cannot execute or replay pending actions.
- Weak-model tests prove bounded continuation and loop-failure handling without semantic action rejection.
- Static tests confirm:
  - No production imports reference the legacy adapter or removed controllers.
  - No architecture switch or retired controller setting remains.
  - Conversational bridge actions reach only the autonomous runtime.
  - Specialized non-conversational modes remain separate.
  - Prohibited names do not occur in code, tests, prompts, comments, or plans.
- Run the complete desktop test suite after deleting legacy files, not only autonomous tests.

## Expected files to change:

- [Orchestration entry point](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/index.js)
- [Legacy orchestration directory](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/legacy)
- [Autonomous orchestration directory](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous)
- [AI Companion bridge](C:/GitHub/shaybc/md-editor/desktop-app/resources/bridges/ai-companion-bridge/ai-companion-bridge.cjs)
- [Runtime defaults](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/config/defaults.js)
- [Browser settings model](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/settings.js)
- [Settings markup](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [Settings controller](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [AI Companion panel](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- [Legacy conversational modes](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/modes)
- [Legacy controller modules](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core)
- [Desktop tests](C:/GitHub/shaybc/md-editor/desktop-app/tests)

## Assumptions

- Stage 7 is the final migration stage; no second architecture switch or fallback loop remains afterward.
- Existing provider, model, tool, approval, security, transport, profile-storage, and cancellation infrastructure remains authoritative.
- Historical conversations are user data and are preserved even when their executable checkpoint format is retired.
- Legacy controller state cannot be resumed safely through the autonomous runtime and will not be converted.
- Legacy code is removed only after its replacement passes the vertical acceptance gates.
- No automatic task decomposition, acceptance-criteria extraction, completion evaluation, workspace-discovery requirement, or semantic action policing is introduced.
- The application remains runnable throughout implementation, and the final state contains only the autonomous conversational runtime.
