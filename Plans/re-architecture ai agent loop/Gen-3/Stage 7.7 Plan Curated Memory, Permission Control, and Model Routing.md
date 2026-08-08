# Stage 7.7 Plan: Curated Memory, Permission Control, and Model Routing

## Summary

Add three integrated, default-on autonomous runtime capabilities:

1. User-confirmed long-term memory with private and shared scopes.
2. Explicit permission modes with denial-loop protection.
3. Configurable model and provider routing with safe fallbacks.

These systems will extend the existing continuity, approval, provider, capability, recovery, and worker infrastructure. They will not introduce task-success evaluation, acceptance-criteria extraction, semantic action policing, or hardcoded agent workflows.

## Important rules

- Use independently authored MD-Editor names, schemas, prompts, instructions, and implementation.
- Reimplement the required concepts without copying source text or identifiers.
- The model may propose memory and select permitted routes, but the runtime enforces storage, authorization, privacy, and provider boundaries.
- Existing security policy, protected paths, tool scopes, managed rules, approvals, and cancellation remain authoritative.
- No permission mode may override a managed denial, protected resource, mode capability restriction, agent scope, or workspace boundary.
- Long-term memory is never written from automatic transcript extraction. A user must confirm every creation, update, or scope change.
- A provider switch must never send workspace or personal content to another provider unless the user enabled that route.
- No new feature flag. The systems are active whenever the autonomous runtime is used.

## Implementation changes

### 1. Curated memory repository

Add a `CuratedMemoryRepository` independent from run continuity.

Support two scopes:

- `personal`: private profile-owned memory.
- `team`: workspace-owned, shareable memory under `.md-editor/companion/memory/`.

Each Markdown topic receives validated front matter:

- Stable ID and scope.
- Type: `preference`, `convention`, `project-fact`, `decision`, `procedure`, or `reference`.
- Title, tags, concise summary, timestamps, and content digest.
- Confirmation metadata without storing private transcript content.

Add:

- `memory_search`: searches bounded metadata and summaries.
- `memory_read`: lazily loads a topic body.
- `memory_propose`: creates a pending proposal for UI confirmation.
- `memory_update`: proposes an update while preserving topic identity.
- `memory_forget`: requests confirmed deletion.

The model cannot call a direct persistence operation. Confirmed UI actions invoke an internal commit interface.

Keep a bounded catalog:

- Maximum 200 indexed topics per scope.
- Approximately 8,000 tokens per scope index.
- Inject only the most relevant summaries, capped at approximately 4,000 combined tokens.
- Load full topic bodies only through `memory_read`.
- Never store credentials, access tokens, private keys, or detected secrets.

Current rules and instructions always take precedence over memory.

### 2. Memory instructions and confirmation flow

Add always-loaded compact instructions explaining:

- Save only durable, reusable information.
- Use `memory_propose`; never claim something was remembered before confirmation.
- Prefer updating an existing topic over creating duplicates.
- Keep personal preferences private unless the user explicitly selects team scope.
- Treat recalled material as potentially outdated supporting context.
- Do not store transient task state; that remains in continuity and chronicles.

The confirmation UI must show the exact proposed body, type, and scope. The user can approve, edit, reject, or change scope.

A rejected proposal is recorded for the current task so the model does not repeatedly suggest the same memory.

### 3. Permission modes

Introduce a `PermissionModePolicy` intersected with the existing capability policy:

- `guided`: reads run automatically; mutations, shell actions, and external writes request approval.
- `observe-only`: state-changing operations are blocked.
- `edit-trusted`: ordinary workspace edits are automatic; commands, deletion, external access, and high-impact actions still require approval.
- `risk-routed`: a constrained action-risk advisor may authorize low-risk operations; ambiguous or high-impact actions request approval.
- `preauthorized-only`: no interactive prompts; only existing explicit grants can execute.
- `sandbox-unattended`: no prompts, available only when managed policy confirms a sufficiently isolated environment.

The precedence order is:

1. Managed security rules.
2. Explicit deny rules.
3. Current task denials.
4. Agent and capability restrictions.
5. Explicit task or workspace grants.
6. Permission-mode defaults.
7. Interactive approval.

Mode changes are user-controlled, journaled, and applied at the next safe tool boundary. The model cannot change its permission mode.

### 4. Denial protection

Add a `DenialLedger` using structural action fingerprints:

- Tool capability.
- Normalized path, command family, endpoint, or external target.
- Mutation category and workspace identity.

When the user denies an operation:

- Return a structured tool result containing the denial and optional user instructions.
- Tell the model not to repeat the equivalent request blindly.
- Suppress duplicate approval prompts for the same fingerprint.
- Permit retry only after explicit user authorization or a materially different action.
- Never interpret a reworded explanation as a different operation.

Add a denial-storm guard:

- Three consecutive denials or twenty total denials trip the guard.
- `risk-routed` falls back to `guided`.
- Automatic authorization pauses and a visible diagnostic is emitted.
- Advisor failures, invalid decisions, or timeouts fail closed.

Add task-scoped and explicitly persisted workspace deny choices. Transient approval grants remain non-restorable after restart.

### 5. Provider and model route catalog

Replace the single implicit provider selection with named connection profiles and routes.

A connection profile contains normalized existing connector settings. A route references:

- Connection profile and model.
- Intended purposes: primary work, quick lookup, context renewal, memory assistance, worker, review, or testing.
- Context and output limits.
- Tool, vision, and reasoning support.
- Allowed data scopes.
- Ordered fallback routes.
- Whether cross-provider fallback is permitted.

Existing settings migrate logically to:

- One `default` connection profile.
- One `primary` route.

Do not rewrite persisted settings until the user saves them.

Add compact, lazily inspectable routing capabilities:

- `route_list`
- `route_inspect`
- `route_select`

The model may select only user-enabled routes. Agent and skill definitions may reference a route ID. Workers inherit the selected route subject to their agent definition and data permissions.

### 6. Route selection and fallback behavior

Add a `ProviderRouteSession` that records the active route and selection reason.

Routes are selected from explicit signals:

- User-selected primary route.
- Agent or skill route declaration.
- Model `route_select` call.
- Worker or runtime operation purpose.
- Configured transport fallback.

Do not add a natural-language intent classifier.

Fallback occurs only for classified provider failures such as sustained rate limiting, temporary service unavailability, or endpoint failure. It must not occur for:

- Cancellation.
- Tool or approval denial.
- Invalid requests.
- Authentication failures unless a separately configured credentialed route exists.
- Ordinary model answers or content disagreements.

The generic connector retry guard runs before route fallback. Cross-provider fallback requires explicit route permission. Provider changes rebuild compatible context, preserve valid tool/result pairs, and inject a short model-visible route-change notice.

No credentials or connector secrets may appear in events, chronicles, memory, or model context.

### 7. Runtime, recovery, and UI integration

Extend recovery snapshots with:

- Confirmed memory references and pending proposal state.
- Permission mode and task denials.
- Active route, route history, and fallback state.

On restart:

- Reload current confirmed memory rather than trusting stale saved bodies.
- Restore task denials but never replay pending approvals.
- Revalidate the active route against current settings.
- Fall back to the configured primary route if the saved route no longer exists.
- Never replay an interrupted provider or tool call.

Add lifecycle events:

- `memory-proposed`
- `memory-confirmed`
- `memory-rejected`
- `memory-forgotten`
- `permission-mode-changed`
- `tool-denied`
- `denial-guard-tripped`
- `route-selected`
- `route-fallback`
- `route-unavailable`

Add UI surfaces for:

- Memory proposal confirmation and memory management.
- Permission-mode selection and current-mode display.
- Connection-profile and route configuration.
- Route-change and denial-guard activity entries.

## Public interfaces

- `CuratedMemoryRepository.search/read/propose/confirm/update/forget/indexSnapshot()`
- `MemoryProposalSession.snapshot/restore()`
- `PermissionModePolicy.resolve(descriptor, context)`
- `DenialLedger.check/record/authorize/snapshot/restore()`
- `ActionRiskAdvisor.evaluate(descriptor, context)`
- `ProviderRouteCatalog.list/inspect/resolve/validate()`
- `ProviderRouteSession.select/fallback/snapshot/restore()`
- Autonomous requests gain `permissionMode` and optional `routeId`.
- Agent and skill definitions gain optional `route`.
- Settings gain `connectionProfiles` and `providerRoutes`.

## Test and acceptance gates

- Personal memory cannot leak into another profile or workspace.
- Team memory is workspace-scoped and requires explicit confirmation.
- Rejected or unconfirmed proposals never create files.
- Memory indexes remain bounded and topic bodies load lazily.
- Secrets and credentials are rejected.
- Current rules override conflicting memory.
- Every permission mode follows its defined action matrix.
- Managed denials and protected resources override every mode.
- Repeated equivalent denied calls do not create repeated prompts.
- Denial thresholds safely downgrade automatic authorization.
- Existing single-provider settings migrate without behavior changes.
- Skills, agents, workers, renewal, and memory operations use configured routes.
- Rate-limit fallback occurs only after connector-level retry handling.
- Cross-provider routing never occurs without explicit authorization.
- Recovery preserves memory references, denials, and routing without replaying uncertain work.
- Static tests confirm no dependencies on removed orchestration controllers.
- Existing chat, plan, agent, approval, cancellation, compaction, extension, and worker tests remain passing.

## Expected files to change:

- [defaults.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/config/defaults.js)
- [model-registry.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/config/model-registry.js)
- [provider-factory.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/provider-factory.js)
- [capability-policy.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/capability-policy.js)
- [events.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/events.js)
- [autonomous-orchestrator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-orchestrator.js)
- [autonomous-loop.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-loop.js)
- [context-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/context-builder.js)
- [approval-gateway.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/approval-gateway.js)
- [tool-catalog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-catalog.js)
- [tool-executor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-executor.js)
- [run-chronicle.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/recovery/run-chronicle.js)
- [restart-reconciler.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/recovery/restart-reconciler.js)
- [worker-hub.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/workers/worker-hub.js)
- New modules under [autonomous memory](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/memory)
- New modules under [autonomous permissions](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/permissions)
- New modules under [autonomous routing](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/routing)
- [settings.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/settings.js)
- [panel.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- [script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [styles.css](C:/GitHub/shaybc/md-editor/desktop-app/resources/styles.css)
- Corresponding tests under [desktop-app/tests](C:/GitHub/shaybc/md-editor/desktop-app/tests)