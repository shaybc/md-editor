# Stage 7.12 Plan: Persistent Extension Tools and Commands

## Summary

Allow persistent profile and workspace extension bundles to contribute executable tools and user commands without storing JavaScript functions in manifests or loading arbitrary code into the main application process.

Follow the reference runtime’s separation of:

- Lazy, declarative capability discovery.
- Trusted runtime-owned execution adapters.
- External processes for third-party executable code.
- Explicit permissions and approval checks.
- Deterministic user-command expansion.

All terminology, schemas, prompts, and implementation code will be independently authored for MD-Editor.

## Important rules

- Do not load arbitrary JavaScript modules from extension folders.
- Extension manifests describe capabilities; trusted runtime adapters execute them.
- Existing approvals, security policies, command analysis, workspace isolation, cancellation, and audit logging remain authoritative.
- Workspace extension changes invalidate trust.
- Tool schemas remain deferred until capability search or direct activation.
- A disabled, untrusted, invalid, or mode-incompatible extension contributes nothing executable.
- Extension commands must not bypass tool permissions.
- Existing skills continue to provide prompt-driven slash workflows; commands will not duplicate that behavior.
- Third-party native code runs through an external server or approved process boundary, never inside the main application process.

## Implementation changes

### 1. Manifest contributions

Advance the extension manifest schema with two optional contribution groups:

```json
{
  "contributions": {
    "tools": ["tools/repository-map.json"],
    "commands": ["commands/repository-map.md"]
  }
}
```

A tool definition contains:

- Stable tool name and description.
- JSON input schema.
- Search hints and domain.
- Allowed modes.
- Required permission capability.
- Execution adapter and adapter configuration.
- Argument and result path metadata.
- Whether it is always loaded or deferred.

Supported execution adapters:

- `application-action`: invokes an allowlisted MD-Editor action handler.
- `command`: runs an executable through the existing secured command pipeline.
- `web-request`: calls a configured endpoint through network permissions.
- `external-tool`: forwards execution to an existing external server tool.
- `workflow`: invokes a named skill and returns its result.

No serialized functions, dynamic imports, or source-code entrypoints are accepted.

### 2. Persistent tool registry

Add an `ExtensionToolRegistry` that:

- Reads metadata only from enabled and trusted bundles.
- Validates unique canonical tool names across extensions and built-in tools.
- Rejects attempts to replace built-in capabilities.
- Advertises compact metadata to capability search.
- Loads the complete input schema and adapter configuration only when activated.
- Registers activated definitions with the existing capability catalog.
- Preserves extension ID, digest, scope, permission requirements, and execution adapter as provenance.

Tool activation must not execute the tool.

### 3. Runtime execution adapters

Add an `ExtensionToolDispatcher` behind the normal tool executor.

Before execution it will:

1. Resolve the authoritative active extension and verify its current digest.
2. Recheck enabled, trusted, mode, and permission state.
3. Validate arguments against the declared JSON schema.
4. Resolve workspace-relative paths safely.
5. Run the existing risk and approval pipeline.
6. Dispatch through the declared adapter.
7. Apply cancellation, timeout, output limits, artifact storage, and audit logging.
8. Validate or normalize the result.
9. Return ordinary tool output to the autonomous loop.

Adapter behavior:

- Application actions may invoke only IDs registered in a new allowlisted `ApplicationActionRegistry`.
- Command actions use the existing command parser, risk adviser, approvals, environment restrictions, and output artifact handling.
- Web actions use existing external-content permissions and prevent unrestricted secret interpolation.
- External-tool actions resolve only tools belonging to the declared server.
- Workflow actions use the existing skill invocation policy and recursion limits.

### 4. Application action registry

Create a runtime-owned registry for safe application callbacks.

Each handler registration declares:

- Action ID.
- Input schema.
- Permission capability.
- Allowed modes.
- Whether it mutates state.
- Approval requirements.
- Execution callback.

Persistent extensions can reference a handler ID but cannot define or replace the callback.

Initially register existing suitable MD-Editor actions through adapters rather than moving their implementation.

Unknown or unavailable handler IDs make the extension tool unavailable and produce a visible diagnostic.

### 5. Extension commands

Add `commands/<id>.md` definitions containing structured frontmatter and a Markdown body.

Supported command types:

- `workflow`: deterministic invocation of an extension skill.
- `tool`: invokes one named extension or built-in tool using parsed arguments.
- `prompt`: expands independently authored Markdown into the user request before the provider call.
- `application-action`: invokes an allowlisted application action without involving the model when appropriate.

Command metadata includes:

- ID, name, description, and argument hint.
- Aliases.
- Allowed modes.
- Required permissions.
- Command type and target.
- Whether model invocation is allowed.

The existing slash router will:

- Merge commands and user-invocable skills.
- Detect name and alias collisions.
- Show them in composer autocomplete.
- Validate arguments before expansion.
- Emit a visible command lifecycle event.
- Preserve the exact original user input in the transcript.
- Route tool and application actions through the same approval pipeline as model-selected tools.

### 6. Extension authoring UI

Extend **Settings → AI → Extensions** with:

- Tools and Commands contribution counts.
- Structured tool editor:
  - Name and description.
  - Input-schema builder with advanced JSON.
  - Execution adapter.
  - Mode and permission scope.
  - Adapter-specific configuration.
  - Deferred-loading metadata.
- Structured command editor:
  - Name, aliases, description, and argument hint.
  - Command type and target.
  - Allowed modes and permissions.
  - Markdown expansion body.
- Detailed `i` explanations for every field.
- Validation preview showing:
  - Tool-name collisions.
  - Missing action handlers.
  - Missing external tools or skills.
  - Unsafe command templates.
  - Invalid permissions or modes.
- Bundled extensions remain view-only.
- Save continues using staged validation, optimistic concurrency, rollback, and workspace trust invalidation.

### 7. Security and failure behavior

- Command templates use argument arrays, not shell-string interpolation.
- Variables are limited to documented values such as workspace root and validated command arguments.
- Secrets may be referenced by credential IDs but never stored in the extension bundle.
- Tool and command definitions receive schema-size, timeout, output-size, and recursion limits.
- An extension cannot grant itself permissions.
- Denials remain authoritative and cannot be converted into retries.
- Missing adapters, handlers, servers, tools, or workflows fail closed.
- A bundle failure is isolated and does not prevent other extensions from loading.
- In-flight extension executions retain their original digest and are cancelled if the bundle becomes unavailable.

## Public interfaces

- Manifest schema gains `tools` and `commands`.
- `ExtensionToolRegistry.loadMetadata/activate/register/snapshot()`
- `ExtensionToolDispatcher.execute(registration, arguments, context)`
- `ApplicationActionRegistry.register/describe/invoke()`
- `ExtensionCommandCatalog.load/list/resolve/expand()`
- Capability registrations gain:
  - `extensionId`
  - `extensionDigest`
  - `adapter`
  - `requiredMode`
  - `requiredCapability`
- New lifecycle events:
  - `extension-tool-activated`
  - `extension-tool-started`
  - `extension-tool-completed`
  - `extension-tool-failed`
  - `extension-command-expanded`
  - `extension-capability-unavailable`

## Test plan

- Valid persistent tools remain metadata-only until searched or directly selected.
- Activated schemas are added only to the current run.
- Built-in tool names cannot be replaced.
- Disabled and untrusted extensions contribute no tools or commands.
- Workspace edits invalidate trust and previously activated registrations.
- Application actions invoke only registered handlers.
- Command tools use structural command analysis, approvals, workspace isolation, and cancellation.
- Web actions enforce network permissions and secret protection.
- External-tool adapters cannot invoke tools from another server.
- Workflow adapters respect skill mode, permission, and recursion policies.
- Slash commands expand deterministically and preserve original user input.
- Tool and command aliases reject ambiguous collisions.
- Invalid bundles remain isolated and produce useful diagnostics.
- Restart recovery reloads current definitions rather than restoring stale executable registrations.
- Context renewal preserves activated extension metadata without serializing executable callbacks.
- Extension editor creates, updates, renames, duplicates, exports, deletes, and restores bundles containing tools and commands.
- Static tests confirm persistent bundles cannot load arbitrary JavaScript into the application process.
- Existing extension, skill, command, approval, cancellation, deferred-tool, and startup tests remain passing.

## Expected files to change:

- [manifest-schema.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/manifest-schema.js)
- [bundle-discovery.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/bundle-discovery.js)
- [extension-fabric.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/extension-fabric.js)
- [extension-authoring-validator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/extension-authoring-validator.js)
- [extension-authoring-repository.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/extension-authoring-repository.js)
- New `extension-tool-registry.js`, `extension-tool-policy.js`, `extension-tool-dispatcher.js`, and `extension-command-catalog.js` under [extensions](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions)
- [capability-catalog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/capabilities/capability-catalog.js)
- [tool-schema-record.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/capabilities/tool-schema-record.js)
- [tool-executor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-executor.js)
- [application-tool-adapter.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/application-tool-adapter.js)
- New `application-action-registry.js` under [autonomous orchestration](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous)
- [slash-workflow-router.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/skills/slash-workflow-router.js)
- [autonomous-orchestrator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-orchestrator.js)
- [extension-editor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/extension-editor.js)
- [extension-settings.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/extension-settings.js)
- [panel.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- [shared events.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/events.js)
- Existing focused tests under [desktop-app/tests](C:/GitHub/shaybc/md-editor/desktop-app/tests)

## Assumptions

- Existing external servers remain the recommended path for arbitrary third-party native code.
- Persistent extension tools are enabled automatically once their bundle is enabled and trusted.
- No additional feature flag is introduced.
- Existing run-scoped executable-tool injection remains supported.
- Existing skills remain the primary Markdown workflow mechanism.
- No legacy orchestration modules are imported or restored.