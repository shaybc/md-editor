# Stage 7.5 Plan: Dynamic Scoped Rule Loading

## Summary

Replace the current one-time rule loader with a default-on `RuleCatalog` for the autonomous runtime.

The catalog will discover user, workspace, hierarchical, and path-scoped rules. Unconditional rules load at run start; conditional rules load only when the active file or a tool-accessed path matches their patterns.

Rule activation guides the model through system instructions. It must not reject actions, evaluate compliance, force retries, or recreate legacy semantic policing.

## Rule sources

Support these locations:

- User rules: `profileRoot/companion/rules/**/*.md`
- Workspace rules: `workspaceRoot/.md-editor/rules/**/*.md`
- Hierarchical rules: `AGENTS.md` from the workspace root toward an accessed file
- Application and editable mode prompts remain supplied by the existing prompt profile

Rules without frontmatter are unconditional.

Path-scoped rules use independently authored metadata:

```md
---
paths:
  - "desktop-app/**/*.js"
  - "desktop-app/tests/**"
exclude:
  - "**/vendor/**"
imports:
  - "shared/javascript-conventions.md"
---

Follow the desktop JavaScript conventions.
```

Rules receive stable internal identities derived from their scope and canonical relative path. Authors do not need to provide IDs.

## Rule catalog

Add a run-scoped `RuleCatalog` responsible for:

- Recursively discovering rule metadata.
- Separating unconditional and conditional rules.
- Loading conditional bodies only after activation.
- Tracking active rules, matching paths, source scope, fingerprints, imports, and injection state.
- Serializing active state for recovery.
- Refreshing changed rule files during context renewal.
- Returning ordered active instructions to the context builder.

Use this precedence:

1. Application safety and mode instructions.
2. User-profile rules.
3. Workspace rules.
4. Hierarchical rules, ordered from workspace root toward the accessed file.
5. Matching path-scoped rules, with more specific patterns and directories placed later.

Precedence is communicated through ordered instructions and source labels; the runtime does not semantically judge rule conflicts.

## Discovery and parsing

Add focused rule modules:

- `RuleDefinitionParser`: parses optional YAML frontmatter and Markdown bodies.
- `MarkdownRuleSource`: recursively discovers profile and workspace rule files.
- `HierarchicalRuleSource`: discovers applicable `AGENTS.md` files.
- `RulePathMatcher`: normalizes workspace-relative paths and evaluates `paths` and `exclude`.
- `RuleCatalog`: coordinates sources, activation, refresh, imports, and snapshots.
- `ToolPathObserver`: extracts workspace paths from registered tool inputs and outputs.

Discovery reads only bounded frontmatter for conditional rules. Complete bodies load only for unconditional or activated rules.

Invalid rules remain visible through diagnostics but are not injected silently.

## Path matching

Normalize all candidate paths to workspace-relative forward-slash paths.

Rules must support:

- `*`, `**`, and `?` glob behavior.
- Multiple include patterns.
- Separate exclusion patterns.
- Platform-appropriate path casing.
- Directory-boundary containment checks.
- Workspace rules relative to the workspace root.
- User rules evaluated relative to the active workspace.
- Hierarchical rules applying only to their directory subtree.

Reject absolute patterns, upward traversal, escaped paths, and malformed metadata.

## Dynamic activation

Create `RuleCatalog.activateForPaths(paths, reason)`.

Activate rules when paths originate from:

- The request’s active file.
- `read_file`.
- `search_text` result paths.
- `apply_edit` and `write_file`.
- Application tools whose capability registrations declare path-bearing input or output fields.
- Worker file operations within their effective workspace.

File enumeration alone, such as `list_files` or `glob_files`, does not activate rules because it does not inspect file contents.

Command strings are not parsed to guess touched files.

Tool registrations gain optional path metadata:

```js
rulePaths: {
  arguments: ["path"],
  results: ["path"]
}
```

The observer validates every extracted path against the canonical workspace root.

## Model-context integration

Before each model request:

- Consume newly activated rules.
- Append one system message containing only newly activated rule bodies and their sources.
- Avoid reinjecting rules already present in the active transcript.
- Emit a bounded notice when a rule is invalid or unavailable.

The current tool call is not rejected or replayed when a new rule activates. The new instructions guide the model’s next decision.

At run start, the main system message includes:

- Unconditional user and workspace rules.
- Root-level hierarchical rules.
- Rules matching the active file.

## Imports and safety

Support bounded rule imports through `imports`.

- Resolve imports relative to the importing rule.
- Permit imports only within the owning profile-rule or workspace-rule root.
- Limit import depth and total imported files.
- Detect cycles and duplicate imports.
- Reject binary, escaped, inaccessible, and oversized files.
- Preserve source attribution for every imported fragment.
- Never load external imports automatically.

Large or invalid applicable rules produce visible diagnostics rather than silently disappearing.

## Context renewal and recovery

Store a `ruleState` recovery snapshot containing:

- Active rule identities.
- Triggering paths.
- Source and content fingerprints.
- Already-injected identities.
- Unavailable-rule diagnostics.

On renewal:

- Rediscover current definitions.
- Re-evaluate active and recently accessed paths.
- Reload changed bodies.
- Reinsert every active rule into authoritative context.
- Emit a change notice when a previously active rule changed or disappeared.

On restart:

- Treat persisted rule state as references, not authority.
- Reload rules from current files.
- Restore activation only for valid current definitions.
- Do not restore rule bodies blindly from the checkpoint.
- Continue with a model-visible warning for missing or changed rules.

## Workers

Each worker receives an independent catalog bound to its effective workspace.

- User rules are rediscovered from the same profile.
- Workspace and hierarchical rules come from the worker’s shared workspace or isolated worktree.
- Parent path-specific activations are not copied automatically.
- Worker recovery restores activation references and reloads current definitions.
- Private worker rule activity remains out of the main transcript unless reported as a warning or worker result.

## Events and UI

Add:

- `rules-discovered`
- `rule-activated`
- `rule-unavailable`
- `rules-refreshed`

Events contain IDs, sources, matching paths, and reasons, but not complete rule bodies.

Display rule discovery, path activation, refresh, and failures in the existing activity inspector.

## Public interfaces

- `RuleCatalog.load()`
- `RuleCatalog.activateForPaths(paths, reason)`
- `RuleCatalog.consumeActivated()`
- `RuleCatalog.activeInstructions()`
- `RuleCatalog.refresh()`
- `RuleCatalog.snapshot()`
- `RuleCatalog.restore(snapshot)`
- `ToolPathObserver.beforeTool(name, args, registration)`
- `ToolPathObserver.afterTool(name, args, result, registration)`
- Tool registrations gain optional `rulePaths`.
- Recovery snapshots gain `ruleState`.

## Test plan

- User rules load from `profileRoot/companion/rules`.
- Workspace rule directories are scanned recursively.
- Rules without frontmatter load at startup.
- Conditional rule bodies remain unloaded until a matching path is touched.
- Active-file matching works before the first model request.
- Include and exclude patterns produce correct matches.
- Deeper hierarchical rules load in root-to-leaf order.
- Reading or searching a matching file activates its rules for the next model request.
- Enumeration tools do not activate path rules.
- Write tools record activation without rejection, replay, or semantic evaluation.
- Application-tool path metadata activates appropriate rules.
- Parallel tool calls activate each rule once.
- Imports respect containment, depth, cycle, size, and duplication limits.
- Invalid and oversized rules emit visible diagnostics.
- Context renewal reinserts every active rule.
- Changed and deleted rules are reconciled during renewal and restart.
- Workers use rules from their effective workspace without leaking private transcripts.
- No autonomous rule module imports legacy controllers.
- Existing Chat, Plan, Agent, approval, recovery, compaction, and worker tests remain passing.

## Expected files to change:

New rule modules:

- [rule-catalog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/rules/rule-catalog.js)
- [rule-definition-parser.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/rules/rule-definition-parser.js)
- [markdown-rule-source.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/rules/markdown-rule-source.js)
- [hierarchical-rule-source.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/rules/hierarchical-rule-source.js)
- [rule-path-matcher.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/rules/rule-path-matcher.js)
- [tool-path-observer.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/rules/tool-path-observer.js)

Runtime integration:

- [instruction-loader.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/instruction-loader.js)
- [autonomous-orchestrator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-orchestrator.js)
- [autonomous-loop.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-loop.js)
- [tool-executor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-executor.js)
- [context-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/context-builder.js)
- [tool-catalog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-catalog.js)
- [application-tool-adapter.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/application-tool-adapter.js)
- [tool-schema-record.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/capabilities/tool-schema-record.js)
- [worker-hub.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/workers/worker-hub.js)
- [events.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/events.js)
- [panel.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)

Tests:

- New focused autonomous rule tests under [desktop-app/tests](C:/GitHub/shaybc/md-editor/desktop-app/tests)
- Existing continuity, recovery, worker, event, and panel tests under the same directory

## Important rules

- All terminology, schemas, prompts, and implementation code must be independently authored for MD-Editor.
- Reference behavior may guide concepts and flow, but code and wording must not be copied.
- The prohibited reference-project names must not appear in implementation artifacts.
- No legacy controller imports or acceptance-criteria evaluation may be introduced.
- Rule loading remains instructional and default-on for the autonomous runtime.
- Existing providers, tools, permissions, approvals, security, and storage roots remain authoritative.
- Questions are raised during implementation only when the answer cannot be determined from the available reference behavior or MD-Editor code.