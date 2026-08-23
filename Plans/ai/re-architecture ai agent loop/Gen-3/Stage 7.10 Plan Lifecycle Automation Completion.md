# Stage 7.10 Plan: Lifecycle Automation Completion

## Summary

Replace the limited hook gateway with a complete lifecycle automation system based behaviorally on the reference implementation while using independently authored MD-Editor terminology, schemas, prompts, and code.

The system will support declarative lifecycle events, ordered actions, prompt and tool-input rewriting, permission decisions, explicit continuation control, notifications, background execution, guarded automation sequences, and durable recovery.

The hook engine is active automatically in autonomous runs, but no behavior occurs unless hooks are configured.

## Important rules

- Reimplement concepts and execution flow independently; do not copy source code, prompts, schemas, component names, or architectural terminology.

- Hooks must never bypass security policy, immutable denials, tool schemas, workspace isolation, or approval boundaries.

- Hooks are user-configured lifecycle automation, not hidden acceptance evaluation or semantic action policing.

- Original user prompts, tool inputs, and tool outputs remain preserved in the chronicle even when hooks provide transformed versions.

- Commands, HTTP requests, workers, model calls, and callbacks use their existing authoritative MD-Editor security and routing infrastructure.

- Uncertain actions interrupted by restart are never replayed automatically.

## Implementation stages

### 1. Hook contracts and source catalog

Replace ad-hoc normalization with a versioned `LifecycleAutomationCatalog`.

Support these sources:

- Bundled extension contributions.

- Profile configuration under `C:\Users\<user>\.md-editor\companion\hooks\hooks.json`.

- Workspace configuration under `.md-editor/companion/hooks/hooks.json`.

- Activated skill definitions.

- Trusted application callbacks.

- Run-scoped `request.hooks`.

Give every hook a namespaced identity, source, trust level, fingerprint, enabled state, declaration order, matcher, timeout, repetition limits, and one or more actions.

Fix the known request wiring bug by registering validated `request.hooks` with the runtime catalog instead of advertising them only through extension discovery.

Add a compatibility reader for existing single-action hook definitions. New writes use a versioned multi-action schema.

### 2. Lifecycle event coverage

Add canonical events for:

- Run opening, restoration, completion, cancellation, and failure.

- User prompt submission.

- Before and after each model request.

- Before tool execution, successful completion, failure, and denial.

- Permission request and permission resolution.

- User-question request and resolution.

- Context renewal before and after.

- Work-item creation, update, and completion.

- Worker queueing, start, completion, failure, and stop.

- Schedule firing, completion, and failure.

- Instruction and configuration changes.

- Watched file creation, modification, and deletion.

- Workspace-directory changes.

- Before authoritative final response publication.

Existing event names receive compatibility aliases but are normalized internally.

Each event gets a typed, bounded payload and documented matcher fields. Matching supports exact values, safe wildcards, path globs, modes, statuses, error categories, and bounded field comparisons—without arbitrary executable regular expressions.

### 3. Action executors

Support independently isolated action types:

- `context`: append bounded lifecycle context.

- `command`: execute through the structured execution broker.

- `model-check`: perform an isolated, no-tool model request using the configured quick route by default.

- `delegated-run`: launch a scoped worker through the existing agent catalog and worker authority resolver.

- `web-request`: send a bounded JSON POST through an SSRF-protected network gateway.

- `application-callback`: invoke only explicitly registered trusted callbacks; never load callback code from JSON.

- `notify-user`: publish a visible informational, warning, or error notification.

Actions in one hook execute sequentially. Each action receives the original event plus the normalized result of prior actions.

Model and delegated actions receive strict token, turn, tool, timeout, and recursion limits. HTTP actions use HTTPS by default, bounded redirects and response sizes, explicit environment-variable allowlists, secret redaction, and existing external-content permissions.

### 4. Result aggregation and control protocol

Add a validated `LifecycleDecision` result containing optional:

- Additional model context.

- Rewritten user prompt.

- Updated tool input.

- Updated external-tool output.

- Permission recommendation or denial.

- Continue or stop instruction.

- Stop reason.

- User notifications.

- Additional watched paths.

- Retry recommendation.

- Suppressed transcript output.

Aggregate results deterministically:

- Actions run in declaration order.

- Input transformations are sequential.

- Deny and stop decisions override allow or continue decisions.

- Lower-trust hooks cannot reverse a higher-trust denial.

- Context and notifications accumulate within strict size limits.

- Conflicting permission decisions resolve to the most restrictive result.

After tool-input rewriting, rerun tool-schema validation, scoped-rule activation, risk analysis, permission checks, and workspace-path validation before execution.

Prompt rewriting occurs before the first model request. The original prompt remains visible and journaled; the transformed prompt is recorded separately.

### 5. Permission and approval integration

Before showing a tool approval dialog, dispatch the permission-request event.

A hook may:

- Deny with a visible reason.

- Recommend approval.

- Narrow or rewrite tool input.

- Request normal user approval.

Hook approval cannot override:

- Security-policy denial.

- Observe-only or Plan-mode restrictions.

- Denial-ledger protection.

- Missing tool capability.

- Invalid input or inaccessible workspace paths.

A trusted hook approval may avoid a second prompt only when the current permission mode explicitly permits hook-managed decisions.

Hook actions requiring side effects receive separate approval categories for commands, HTTP requests, workers, model calls, and callbacks. Approval keys include hook fingerprint, action index, workspace, and action details so edited hooks invalidate previous grants.

Hook-action approval bypasses permission-request hooks to prevent recursive approval loops.

### 6. Completion control and failure-loop protection

Before publishing a natural final response, dispatch a completion event.

A configured hook may:

- Accept completion.

- Add a user notification.

- Request one more model decision by returning bounded continuation context.

- Stop the run explicitly.

Do not run completion hooks for unusable provider responses, rate-limit failures, cancellation, or context-overflow errors.

Protect continuation with:

- Per-hook cooldown.

- Event/action deduplication.

- Output-digest deduplication.

- Maximum sequence depth.

- Maximum completion continuations per run.

- Consecutive hook-failure circuit breaker.

Exceeding a guard produces a visible diagnostic and allows safe completion or fails explicitly according to the hook’s configured failure policy. It must never create an invisible model-request loop.

### 7. Workspace observers

Add a run-scoped `WorkspaceLifecycleObserver`.

It will:

- Watch only explicitly configured workspace-contained paths.

- Support add, change, and delete events.

- Debounce incomplete writes.

- Deduplicate equivalent events.

- Rebuild watch registrations when configuration or the active workspace changes.

- Accept additional bounded watch paths returned by trusted hooks.

- Dispose all watchers when the run closes.

- Emit directory-change events for application-driven workspace changes, worker isolation changes, and restart re-anchoring—not for a command hook’s temporary working directory.

File and directory hooks run outside the model loop when appropriate and deliver notifications or bounded context at the next safe model boundary.

### 8. Guarded automation sequences

Allow a hook definition to contain ordered actions and conditional follow-up branches.

Add:

- Per-sequence depth limits.

- Per-rule cooldowns.

- Event/action deduplication windows.

- Abort-safe execution.

- Failure routing.

- Conditions over tool names, work status, worker status, error text, mode, source, and bounded event fields.

- Safe worker fallback and user-notification actions.

A sequence cannot recursively trigger itself unless explicitly allowed and still within the depth limit.

### 9. Background execution and recovery

Support background command and HTTP actions with:

- Configurable timeout.

- Progress events.

- Cancellation propagation.

- Bounded output capture.

- Optional model wake-up at the next safe boundary.

Persist:

- Hook catalog fingerprint.

- Once-only consumption state.

- Cooldown and deduplication state.

- Active sequence depth.

- Pending background-action metadata.

- Delivered notifications.

On restart:

- Completed results may be restored.

- Pending command, HTTP, callback, and worker actions are classified as uncertain and are not replayed.

- The model and user receive a concise interruption notice.

- Current hook definitions and permissions are revalidated.

- Changed or missing definitions produce recovery warnings.

### 10. Settings and activity UI

Add Settings → AI → Hooks with:

- Structured table showing enabled state, source, event, matcher, action summary, and validation status.

- Details dialog.

- Create/edit wizard with event-specific matcher help.

- Ordered action editor.

- Action-specific fields.

- Enable/disable controls.

- JSON editor for advanced configuration.

- Reload and validation actions.

- Read-only display for hooks owned by extensions, skills, or application callbacks.

- Clear trust and approval explanations.

- Configuration preview that validates matching without executing side effects.

Extend the activity inspector with:

- Hook queued, started, progress, waiting-for-approval, completed, blocked, skipped, failed, and notification entries.

- Source, event, action type, duration, and bounded output.

- Visible continuation and input-rewrite notices without exposing secrets.

## Public interfaces

- `LifecycleAutomationCatalog.load/registerRunHooks/registerCallback/reconcile/snapshot()`

- `LifecycleDispatcher.dispatch(event, payload, context)`

- `LifecycleDecisionAggregator.combine(results, eventPolicy)`

- `LifecycleActionRegistry.execute(action, event, context)`

- `WorkspaceLifecycleObserver.start/update/dispose/snapshot()`

- `AutomationRepetitionGuard.allow/record/snapshot/restore()`

- `BackgroundActionRegistry.start/cancel/drain/snapshot()`

- Autonomous requests retain `hooks` and gain trusted source-authority metadata.

- Recovery snapshots gain `lifecycleAutomation`.

- Hook configuration advances to version 2 with a version-1 compatibility reader.

## Test and acceptance plan

- `request.hooks` executes vertically and is no longer metadata-only.

- Profile, workspace, extension, skill, application, and run-scoped hooks load in stable order without duplicate execution.

- Every declared lifecycle event fires at its exact runtime boundary.

- Prompt rewriting preserves the original prompt and changes only the model-facing version.

- Tool-input rewriting is revalidated and cannot bypass permissions or path restrictions.

- Permission denial always wins; trusted approval works only within current policy.

- Context, command, model, delegated-run, HTTP, callback, and notification actions work independently.

- HTTP tests cover SSRF, redirects, timeouts, oversized responses, header interpolation, and secret redaction.

- Callback actions cannot be loaded from JSON or untrusted bundles.

- File watchers cover add/change/delete, debounce, path containment, dynamic paths, workspace changes, and disposal.

- Ordered actions, branching, cooldowns, deduplication, depth guards, once-only execution, and abort handling work.

- Completion hooks can request bounded continuation without creating response loops.

- Provider errors and cancellation skip completion continuation.

- Restart never replays uncertain external or mutating actions.

- Hook progress and notifications appear correctly in the activity inspector.

- Existing greeting, ordinary chat, Plan persistence, approvals, denial protection, compaction, workers, recovery, extensions, skills, and provider-routing tests remain passing.

- Static tests confirm lifecycle automation does not import removed M0–M11 controllers.

## Expected files to change:

- [Autonomous orchestrator](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-orchestrator.js)

- [Autonomous loop](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-loop.js)

- [Current hook gateway](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/hooks/hook-gateway.js)

- New lifecycle modules under [autonomous hooks](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/hooks)

- [Extension fabric](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/extension-fabric.js)

- [Bundle discovery](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/bundle-discovery.js)

- [Extension manifest schema](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/manifest-schema.js)

- [Extension registry](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extension-registry.js)

- [Skill definition policy](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/skills/skill-definition-policy.js)

- [Skill invocation session](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/skills/skill-invocation-session.js)

- [Approval gateway](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/approval-gateway.js)

- [Tool executor](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-executor.js)

- [Work ledger](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/work/work-ledger.js)

- [Worker hub](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/workers/worker-hub.js)

- [Context renewal](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/context/window-steward.js)

- [Run chronicle](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/recovery/run-chronicle.js)

- [Restart reconciler](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/recovery/restart-reconciler.js)

- [Shared events](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/events.js)

- [Configuration defaults](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/config/defaults.js)

- [AI settings controller](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/settings.js)

- New `hook-settings.js` under [AI Companion UI modules](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion)

- [AI Companion panel](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)

- [Activity renderer](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/activity-renderer.js)

- [Settings markup](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)

- [Application styles](C:/GitHub/shaybc/md-editor/desktop-app/resources/styles.css)

- Hook, extension, approval, worker, recovery, settings, panel, and acceptance tests under [desktop tests](C:/GitHub/shaybc/md-editor/desktop-app/tests)

## Assumptions

- Existing providers, routing, tools, security policy, approvals, workers, transport, chronicles, profile storage, and UI components remain authoritative.

- Existing hook definitions remain readable.

- No built-in hooks are introduced that silently alter normal agent behavior.

- The engine is default-on for autonomous runs, while each configured hook or sequence controls its own enabled state.

- Callback actions are available only to trusted in-process registrations.

- The implementation remains independent and uses the reference solely to ensure behavioral coverage.