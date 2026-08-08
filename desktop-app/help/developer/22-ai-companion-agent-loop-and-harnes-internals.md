---
tags: []
---
# AI Companion Autonomous Runtime Internals

Chat, Plan, and Agent share one model-directed runtime under `resources/ai-companion/orchestration/autonomous/`. The stable entry point is `CompanionOrchestrator.run(request, services, emit)`; mode differences are capability policies, not separate conversational loops.

## Request flow

1. The renderer creates a version-6 task record and sends the selected mode, prompt, conversation history, workspace context, model limits, and current settings through the Neutralino bridge.
2. The bridge builds the effective security context and supplies provider, approval, application-action, cancellation, and profile services.
3. The autonomous orchestrator loads current instructions and extension metadata, then builds the mode policy and structured tool catalog.
4. The model may answer naturally or call tools. Tool calls are validated, approved when required, executed through retained MD-Editor services, recorded, and returned as observations.
5. The loop continues until natural text completion, cancellation, or a structural limit. One authoritative final event is persisted and rendered.

## Mode policies

- Chat can answer normally and use configured read-only capabilities.
- Plan can research read-only state and create or update only its repository plan artifact.
- Agent can use configured reads, writes, commands, external capabilities, work items, and workers, subject to security and approval policy.
- Autocomplete and Git summary remain focused non-conversational modes outside this kernel.

## Context and continuity

`WindowSteward` budgets model context, stores large observations in `ArtifactVault`, and performs structured renewal before overflow. `ContinuityRecord` maintains bounded run notes and workspace-local recall. Active instructions, loaded extension bodies, work state, worker state, recent turns, and unresolved tool outcomes are re-anchored after renewal.

## Extensibility

Rules load by application, user, workspace, and path scope. Skills, agents, hooks, plugins, deferred tools, and external servers are discovered as metadata and activated lazily. Activated bodies remain run-scoped so renewal and recovery can restore them without loading every extension initially.

## Large tasks

`WorkLedger` stores model-created work items. `WorkerHub` launches bounded delegated jobs, keeps private transcripts and inboxes, and reports notifications to the parent. Decomposition and replanning remain model decisions.

## Recovery

`RunChronicle` writes an append-only journal plus atomic current and previous snapshots. `RestartReconciler` classifies saved runs as completed, cancelled, recoverable, or incompatible. Pending approvals and uncertain mutating calls are never replayed. The read-only `runRecoveryInspect` bridge action determines whether the UI may offer Resume without making a provider request.

Saved task records use schema version 6. Older completed conversations remain readable; interrupted records from the retired runtime are historical and cannot resume.

## Events

The shared event contract covers run lifecycle, one authoritative assistant final response, tool lifecycle, approvals, rate-limit waiting, work items, workers, continuity, context thinning and renewal, chronicle saves, restoration, cancellation, and failure.

## Tests

Autonomous acceptance tests cover ordinary text, tools, approval and denial, plan persistence, cancellation, parallel calls, context renewal, recovery, extension loading, large-task coordination, and exactly-once final persistence. Provider, security, approval, plan-repository, and application-tool suites remain independent of orchestration internals.

Previous: [9. AI Companion Internals](09-ai-companion-internals.md)
