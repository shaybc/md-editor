# Stage 7.5 Plan: Skill Invocation and Workflow Routing

## Summary

Complete the autonomous skill system by adding deterministic slash-workflow expansion, model-controlled relevant-skill invocation, enforced mode/tool permissions, dynamic path-based discovery, and independently authored bundled workflows.

Skills remain lazily loaded. The model receives only bounded metadata and decides whether a natural-language request needs a skill. Exact slash invocations are resolved deterministically before the provider call.

No natural-language classifier, semantic completion evaluator, forced retry, or legacy controller dependency is introduced.

## Implementation Changes

### Canonical skill catalog

- Add a run-scoped `SkillCatalog` covering:
  - Bundled application skills.
  - User-profile skills.
  - Workspace skills.
  - Nested path-specific workspace skills.
  - Enabled and trusted extension bundles.
  - MCP-provided skills.
- Normalize each definition into independently authored metadata:
  - Stable ID, name, aliases, description, and usage guidance.
  - Argument hint and named arguments.
  - `allowedModes`.
  - Allowed tool names or capability scopes.
  - Optional model, agent, hooks, and inline/worker execution.
  - User-invocable and model-invocable controls.
  - Optional path patterns.
  - Source, trust, precedence, and content fingerprint.
- Validate definitions during discovery and fail closed for malformed security-sensitive metadata.
- Use deterministic precedence: nested workspace → workspace → user → bundled, while preserving explicit extension identity.
- Detect duplicate canonical names and ambiguous aliases.
- Keep complete skill bodies unloaded until invocation.

### Bounded skill advertisement

- Before model calls, inject a compact catalog containing only eligible skill names, descriptions, usage guidance, and argument hints.
- Filter advertisements by:
  - Current Chat, Plan, or Agent mode.
  - Extension enablement and trust.
  - Model-invocation permission.
  - Required capabilities currently available to the run.
- Budget the advertisement relative to the model context window, with a fixed maximum.
- Preserve bundled workflow descriptions before truncating optional extension descriptions.
- Tell the model to invoke `skill_invoke` when a clearly relevant advertised skill matches the user’s request.
- Do not automatically execute a skill based on free-form keyword matching.
- Emit a visible diagnostic when catalog entries are excluded because of invalid metadata, mode, trust, or missing capabilities.

### Skill invocation tool

- Add a core `skill_invoke` tool with:
  - Exact skill name.
  - Optional argument string or structured arguments.
- On invocation:
  1. Resolve the canonical definition or alias.
  2. Revalidate mode, trust, model invocation, and current capabilities.
  3. Calculate an effective tool scope that can only narrow the parent run.
  4. Load and fingerprint the complete skill body.
  5. Validate and substitute declared arguments without executing embedded shell expressions.
  6. Register skill-specific hooks.
  7. Execute inline or through a scoped worker.
  8. Insert a marked instruction block into the transcript.
- The invocation wrapper never grants tool approval. Existing tool permissions and approvals remain authoritative.
- Reject recursive invocation of an already-running skill.
- Bound nested skill depth and prevent invocation loops.
- Publish model-visible tool errors for unknown, unavailable, or prohibited skills without rejecting unrelated model output.

### Deterministic slash-workflow routing

- Add a `SlashWorkflowRouter` before the first provider call.
- Recognize only an exact leading `/workflow-name` followed by optional arguments.
- Resolve aliases through the canonical catalog.
- For a valid user invocation:
  - Preserve the original slash input in chat history.
  - Load and expand the workflow deterministically.
  - Add an invocation marker and expanded instructions to model context.
  - Apply the workflow’s narrowed tool, model, agent, and hook settings.
  - Avoid requiring the model to call `skill_invoke` again.
- Unknown slash names produce a visible user error and no provider call.
- Text containing a slash elsewhere remains ordinary text.
- Support slash routing from the main composer, edited prompts, saved-task reruns, and direct runtime requests.
- Never treat model-generated text as a trusted user slash invocation.

### Dynamic path-specific skills

- Support optional path metadata on skills.
- Keep conditional skills absent from the advertised catalog until:
  - The active file matches.
  - A file is read.
  - Search results identify a matching file.
  - A file is edited or written.
  - An application tool declares and returns matching workspace paths.
- Reuse the established workspace containment and glob rules.
- File enumeration and command-string parsing must not activate path-specific skills.
- Discover nested skill directories while walking from an accessed file toward the workspace root.
- Invalidate the bounded skill advertisement when new eligible skills become available.
- Path activation only makes a skill discoverable; it does not execute it.

### Mode and authority enforcement

- Add a `SkillDefinitionPolicy` that validates and enforces `allowedModes`.
- Apply mode checks at:
  - Discovery.
  - Advertisement.
  - Slash resolution.
  - `skill_invoke` validation.
  - Worker restoration.
- Tool declarations narrow the parent capability set and cannot enable unavailable tools.
- Model selection must use an existing configured model and remain subject to provider policy.
- Worker-backed skills use the existing agent catalog, authority resolver, workspace isolation, and private transcripts.
- Missing agents, tools, or models produce an unavailable-skill result rather than silently falling back to broader authority.

### Bundled workflows

Add independently authored MD-Editor workflows:

- `record-change`
  - Inspect repository status and diffs.
  - Select relevant files.
  - Create a new revision safely.
  - Verify final repository status.
- `refine-change`
  - Inspect changed code for reuse, maintainability, correctness, and efficiency.
  - Optionally delegate bounded reviews.
  - Apply only justified improvements.
  - Verify the resulting changes.
- `companion-settings`
  - Read current configuration and schema.
  - Choose the correct user or workspace scope.
  - Validate proposed settings.
  - Apply through authoritative preference/configuration tools.
- `repeat-work`
  - Execute a requested task immediately.
  - Create, inspect, or cancel a bounded scheduled continuation.
  - Preserve the original authorization boundary.
- `build-document`
  - Select the requested output type.
  - Load the appropriate document-generation capability.
  - Generate, verify, and return the saved artifact.
- `inspect-pull-request`
  - Resolve a pull-request target.
  - Retrieve metadata and changes.
  - Review correctness, security, maintainability, and tests.
  - Return findings without publishing comments unless explicitly authorized.

Each workflow declares its modes, tools, usage guidance, arguments, and execution context. Content must be independently written and use MD-Editor terminology.

### Scheduling support

- Add a local `RunScheduler` for the `repeat-work` workflow.
- Add scoped tools:
  - `schedule_create`
  - `schedule_list`
  - `schedule_cancel`
- Support one-time and recurring schedules with explicit interval limits.
- Store schedules under the authoritative profile storage root.
- Preserve workspace, mode, prompt, and capability boundaries.
- Do not persist approval grants.
- On a resumed iteration, rebuild current rules, skills, permissions, tools, and provider settings.
- Add expiration and maximum-frequency safeguards.
- Show scheduled, running, completed, failed, and cancelled states in the activity inspector.

### Continuity and recovery

- Add `skillState` to autonomous recovery snapshots:
  - Discovered conditional skill paths.
  - Activated skill identities and fingerprints.
  - Invocation stack.
  - Loaded bodies and source references.
  - Applied tool/model/agent scopes.
  - Scheduled continuation references.
- On restart:
  - Reload definitions from current sources.
  - Revalidate mode, trust, tools, model, and agent.
  - Never trust stored bodies or permissions as current authority.
  - Continue inline invocations from the next model decision.
  - Restore worker-backed invocations through existing worker recovery.
- During context renewal:
  - Reinsert active skill bodies and invocation markers.
  - Rebuild the bounded eligible-skill catalog.
  - Report changed or missing invoked skills to the model.
- Preserve skill state independently from legacy checkpoints.

### Events and UI

Add lifecycle events:

- `skills-discovered`
- `skills-changed`
- `skill-invocation-started`
- `skill-invocation-completed`
- `skill-invocation-failed`
- `skill-unavailable`
- `slash-workflow-expanded`
- `schedule-created`
- `schedule-fired`
- `schedule-cancelled`

UI changes:

- Add slash-workflow autocomplete to the main and edited composers.
- Filter suggestions by the selected mode.
- Show argument hints and short descriptions.
- Display invoked workflow, scoped tools, worker execution, and failure reasons in the activity inspector.
- Persist original slash input while keeping expanded instructions out of the visible user message.
- Display restored workflow and schedule state without exposing private worker transcripts.

## Public Interfaces

- `SkillCatalog.load/list/resolve/activateForPaths/refresh/snapshot/restore`
- `SkillDefinitionPolicy.validate/isAvailable/resolveAuthority`
- `SkillInvocationSession.start/complete/fail/snapshot/restore`
- `SlashWorkflowRouter.parse/resolve/expand`
- `RunScheduler.create/list/cancel/restore`
- New model tool: `skill_invoke`
- New scheduling tools: `schedule_create`, `schedule_list`, `schedule_cancel`
- Autonomous requests gain optional trusted `slashInvocation`.
- Autonomous recovery snapshots gain `skillState` and `scheduleState`.
- Tool capability registrations may declare skill availability requirements.

## Test Plan

- Skill bodies remain unloaded during discovery and advertisement.
- Advertisements respect mode, trust, capability, and model-invocation restrictions.
- Advertisement budgeting truncates optional descriptions without losing bundled workflow names.
- Natural-language requests allow the model to invoke a matching skill without runtime keyword routing.
- Ordinary prompts and greetings do not load or invoke skills.
- Exact slash workflows expand before the provider call.
- Unknown slash workflows produce an error without a provider call.
- Slash-like text in the middle of a message remains ordinary text.
- Arguments are validated and substituted without shell interpolation.
- User slash invocation and model tool invocation produce equivalent workflow instructions.
- `allowedModes` is enforced during discovery, slash expansion, tool invocation, and recovery.
- Skill tool scopes only narrow parent capabilities.
- Skill declarations never bypass existing approvals.
- Inline and worker-backed skills execute through their correct boundaries.
- Recursive and excessive nested invocation fails safely.
- Active-file and tool-accessed paths expose conditional skills.
- File enumeration and command strings do not activate skills.
- Nested workspace skills override shallower definitions deterministically.
- Compaction reinserts active skill bodies and invocation markers.
- Restart reloads current definitions and reports changed or missing skills.
- Scheduled work preserves scope, expires correctly, and restores without approval grants.
- Each bundled workflow has end-to-end tests for success, unavailable capabilities, cancellation, and tool failure.
- UI tests cover slash suggestions, mode filtering, activity, persistence, reruns, and restored workflows.
- Static tests confirm no autonomous skill module imports retired controllers.
- Existing Chat, Plan, Agent, rule, extension, approval, recovery, worker, and provider tests remain passing.

## Expected files to change:

New skill runtime modules:

- [skill-catalog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/skills/skill-catalog.js)
- [skill-definition-policy.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/skills/skill-definition-policy.js)
- [skill-invocation-session.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/skills/skill-invocation-session.js)
- [skill-source-loader.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/skills/skill-source-loader.js)
- [skill-path-observer.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/skills/skill-path-observer.js)
- [slash-workflow-router.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/skills/slash-workflow-router.js)
- [run-scheduler.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/scheduling/run-scheduler.js)

Runtime integration:

- [autonomous-orchestrator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-orchestrator.js)
- [autonomous-loop.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-loop.js)
- [context-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/context-builder.js)
- [tool-catalog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-catalog.js)
- [tool-executor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-executor.js)
- [capability-policy.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/capability-policy.js)
- [extension-registry.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extension-registry.js)
- [extension-fabric.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/extension-fabric.js)
- [markdown-definition.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/markdown-definition.js)
- [worker-hub.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/workers/worker-hub.js)
- [shared events.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/events.js)

Bundled workflows:

- [core-workflows extension](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/extensions/bundled/core-workflows)
- [core-workflows extension manifest](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/extensions/bundled/core-workflows/extension.json)

UI and persistence:

- [panel.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- Existing autonomous chronicle and recovery modules under [recovery](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/recovery)

Tests:

- New skill routing, invocation, scheduling, and recovery tests under [desktop-app/tests](C:/GitHub/shaybc/md-editor/desktop-app/tests)
- Existing autonomous acceptance, continuity, extension, worker, panel, approval, and tool tests under the same directory

## Important Rules

- Prohibited reference-project names must not appear in code, plans, prompts, workflow definitions, tests, or UI text.
- All terminology, schemas, prompts, and workflow content must be independently authored for MD-Editor.
- Concepts and behavioral flow may guide implementation, but code and wording must not be copied.
- System, mechanism, workflow, and architecture names must use original MD-Editor terminology.
- Decisions already answered by the available reference behavior should be implemented without additional questions.
- No hardcoded free-form intent classifier or semantic action policing is introduced.
- Skill instructions guide model decisions; they do not validate task success or reject final responses.
- Exact user slash invocations may be deterministic, but model-generated slash text is never treated as trusted input.
- Existing providers, tools, permissions, approvals, security policy, extension trust, storage roots, and worker isolation remain authoritative.
- No new feature flag is introduced; the skill system is default-on in the autonomous runtime.