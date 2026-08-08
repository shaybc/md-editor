# Stage 7.2 Plan: Complete On-Demand Tool Schema Runtime

## Summary

Replace the current MCP-only schema activation with a provider-neutral system covering every autonomous tool source.

Only a small, mode-appropriate core will be sent to the model initially. Secondary built-in, application, plugin, work, worker, context, plan, and external-server schemas will remain in a harness-side inventory. The model can discover and activate them through `capability_search`.

This changes schema exposure only. It does not change permissions, approvals, execution behavior, or give the harness control over task decomposition.

## Tool Exposure Classification

| Category | Initial exposure |
|---|---|
| `capability_search`, extension discovery/loading | Full schema |
| Workspace list, search, and read tools | Full schema |
| Workspace edit and command primitives | Full schema in Agent mode only |
| Plan repository tools | Full schema in Plan mode because persistence is mandatory; deferred in Agent mode |
| Worker launch | Full schema in Agent mode |
| Worker control, work tracking, continuity, artifacts, and context tools | Deferred |
| Git, API Client, graph, preferences, conversion, execution, and other application tools | Deferred |
| External-server tools | Deferred individually |
| Tools explicitly marked `alwaysLoad` | Full schema when allowed by policy |

Mode policy and user tool settings remain authoritative. A prohibited tool is absent from both the initial roster and deferred inventory.

## Implementation Changes

### Unified schema inventory

Add a `ToolSchemaInventory` containing one record per currently permitted tool:

- Canonical tool name.
- Full provider schema.
- Lightweight display name and summary.
- Hidden search description and search hints.
- Source and domain.
- Required mode, capability, and permission scope.
- `alwaysLoad` and `deferred` classification.
- Definition fingerprint.
- Execution owner.
- Optional external server and remote tool identity.

Core, application, plugin, and external tools must register through this one inventory. Duplicate canonical names fail during assembly instead of silently shadowing one another.

Keep schema metadata separate from provider JSON so internal fields can never leak into connector requests.

### Exposure policy

Add a `ToolExposurePolicy` that classifies permitted inventory records into:

- Always loaded.
- Deferred and available.
- Activated for this run.
- Currently unavailable.
- Prohibited.

The classification must consider:

- Chat, Plan, or Agent mode.
- Existing tool-scope settings.
- Agent-definition capability scope.
- Worker isolation.
- External-server trust and availability.
- Mandatory Plan-mode persistence.
- Explicit `alwaysLoad` declarations.

There is no user feature flag. Schema deferral is default-on in the autonomous runtime.

### Search and activation

Evolve `capability_search` into the single search operation for all deferred tools.

Supported queries:

- `select:plan_read,plan_update` for exact multi-selection.
- A bare exact name as a tolerant exact selection.
- Keywords such as `git branch`.
- Required terms such as `+graph path`.
- External prefixes such as `mcp__server`.
- A bounded `maxResults`, defaulting to five.

Ranking uses harness-side metadata without exposing complete descriptions or schemas:

1. Exact canonical name.
2. Exact domain or name component.
3. Partial name component.
4. Search-hint match.
5. Description match.
6. Stable canonical-name ordering for ties.

A search result returns:

- Matched names.
- Newly activated names.
- Already active names.
- Missing requested names.
- Deferred inventory count.
- Pending or unavailable external servers.

Only matched schemas become active. Searching a server must not activate all of its tools.

### Lightweight availability notices

Inject an independently authored, bounded system notice containing deferred tool names but no JSON schemas.

The notice must:

- Use the current mode and permission-filtered inventory.
- Include additions and removals after plugin or server changes.
- Avoid repeating an unchanged catalog every round.
- Survive context renewal by being rebuilt from the authoritative inventory.
- Group names by domain or server when useful.
- Fall back to a compact domain summary if names exceed the context budget.

Always-loaded instructions explain that a deferred tool must first be activated with `capability_search`.

Update mandatory instructions and reminders—including Plan persistence and Observation Release—to mention exact selection when their tools are deferred.

### Provider request assembly

`CapabilityCatalog.definitions()` becomes a compatibility façade over:

```text
allowed always-loaded schemas + active deferred schemas
```

Before every provider request:

- Revalidate active definitions.
- Send only the current provider roster.
- Count schema tokens using only schemas actually sent.
- Keep the existing automatic tool choice.
- Preserve connector-specific schema normalization.

No connector-specific deferred-schema protocol is required. Activation works through the existing model round trip:

```text
capability_search result
→ record selected names
→ rebuild provider roster
→ next model call contains selected schemas
```

This keeps the behavior consistent across every connector.

### External-server integration

Split external-server discovery into:

- Server metadata registration without connection.
- Explicit server connection and offering indexing.
- Individual remote-tool metadata indexing.
- Exact definition retrieval for selected tools.
- Invocation through the existing approval gateway.

When a query matches a server:

- Connect only through existing validation and approval.
- Index its tools without adding them all to the provider roster.
- Rank individual remote tools.
- Activate only selected matches.

Idle disconnection must retain trusted metadata. Removed, failed, or changed tools become unavailable and are removed from the active roster with a model-visible notice.

### Inactive-tool calls

Before execution, distinguish:

- Active tool.
- Known but deferred tool.
- Known but prohibited tool.
- Previously active but now unavailable tool.
- Completely unknown tool.

A known deferred call returns one structural observation:

```text
This tool schema is not active. Use capability_search with select:<name>, then retry.
```

It must not be automatically executed, silently activated, treated as an unknown tool, or cause semantic response rejection.

Permission failures and unavailable tools retain their existing behavior.

### Run-scoped activation state

Add a `ToolActivationSession` tracking:

- Active deferred names.
- Activation source and timestamp.
- Inventory fingerprint.
- Announced catalog revision.
- Unavailable definitions.
- Search history metadata without prompt contents.

Activations remain available for the rest of the run unless the definition becomes invalid. Repeated selection is idempotent.

### Context renewal and recovery

Advance the autonomous recovery schema from version 4 to version 5.

Persist:

- Active deferred names.
- Inventory and definition fingerprints.
- Last announced catalog revision.
- Unavailable-tool notices.
- Worker-specific activation state.

After context renewal:

- Rebuild the availability notice.
- Preserve active schemas.
- Recalculate provider schema cost.
- Reinsert instructions for searching deferred tools.

After restart:

- Rebuild the inventory from current authoritative sources.
- Revalidate mode, permissions, agents, plugins, and servers.
- Restore only still-permitted activations.
- Report changed or missing definitions to the model.
- Never restore approval grants.

Keep a version-4 migration reader. The old `activeCapabilities` field is accepted as migration input but no longer written.

### Worker isolation

Each worker receives its own filtered inventory and activation session.

A worker:

- Starts with only its agent-scoped core schemas.
- Sees only deferred names permitted by its agent definition.
- Activates tools independently.
- Cannot inherit parent-only or sibling activations.
- Persists its private activation state in the worker snapshot.
- Restores definitions only after current agent and workspace validation.

Parent activation does not automatically increase worker context.

### Skills, agents, and prompts

Add a lazy built-in skill describing:

- Exact and keyword capability search.
- Loading the minimum useful schema set.
- Retrying after activation.
- Avoiding broad speculative loading.
- Handling unavailable and pending external tools.

Update:

- Always-loaded autonomous instructions.
- Plan persistence instructions.
- Observation Release instructions and reminders.
- Bundled agent instructions for scoped capability discovery.
- Prompt default revision.

All terminology and prompt wording must be independently authored.

### Events and UI

Add lifecycle events:

- `tool-catalog-updated`
- `tool-schema-activated`
- `tool-schema-restored`
- `tool-schema-unavailable`

Event payloads contain names, counts, source, and schema-token estimates but never complete schemas.

The activity inspector displays concise entries for:

- Deferred catalog changes.
- Tool activation.
- Recovery restoration.
- External-tool unavailability.

Debug telemetry records:

- Permitted schema count.
- Initial schema count.
- Deferred count.
- Active deferred count.
- Estimated schema tokens sent and avoided.
- Search query type and match count.

## Public Interfaces

- `ToolSchemaInventory.register/synchronize/find/list/snapshot()`
- `ToolExposurePolicy.classify(record, context)`
- `ToolSearchIndex.search(query, options)`
- `ToolActivationSession.activate/definitions/validate/snapshot/restore()`
- `CapabilityCatalog.providerDefinitions()`
- `CapabilityCatalog.deferredNotice()`
- `CapabilityCatalog.search(query, options)`
- `CapabilityCatalog.classifyCall(name)`
- `CapabilityCatalog.consumeInventoryChanges()`
- `McpConnectionManager.indexToolMetadata(serverId)`
- `McpConnectionManager.getToolDefinition(serverId, toolName)`
- `getToolRegistrations(policy, settings)`
- `getApplicationToolRegistrations(policy, settings)`
- Recovery schema version 5 with version-4 migration.

Retain `CapabilityCatalog.definitions()` temporarily as an internal compatibility alias to `providerDefinitions()`.

## Completion Gates

- A first model request contains only the classified core schemas.
- A plain greeting does not activate or search for secondary tools.
- Exact selection activates only the requested permitted schemas on the next request.
- Keyword search ranks built-in, application, plugin, and remote tools together.
- Searching one external server does not expose every remote schema.
- Prohibited tools never appear in either catalog or search results.
- Known inactive calls produce one search-first observation.
- Plan mode can still persist plans reliably.
- Observation Release remains reachable through its updated instruction path.
- Parent and worker activation sets remain isolated.
- Activated schemas survive context renewal and restart.
- Removed or changed definitions are not restored or invoked.
- All connectors receive the same provider-neutral activation behavior.
- Schema telemetry demonstrates that deferred schemas are absent from initial and unrelated calls.
- No autonomous module imports retired orchestration controllers.
- No prohibited reference-project names appear in code, prompts, skills, agents, documentation, schemas, or events.

## Expected files to change:

New focused modules under the capabilities domain:

- [tool-schema-inventory.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/capabilities/tool-schema-inventory.js)
- [tool-schema-record.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/capabilities/tool-schema-record.js)
- [tool-exposure-policy.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/capabilities/tool-exposure-policy.js)
- [tool-search-index.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/capabilities/tool-search-index.js)
- [tool-activation-session.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/capabilities/tool-activation-session.js)
- [tool-catalog-notice.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/capabilities/tool-catalog-notice.js)

Existing runtime integration:

- [capability-catalog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/capabilities/capability-catalog.js)
- [tool-catalog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-catalog.js)
- [application-tool-adapter.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/application-tool-adapter.js)
- [tool-executor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-executor.js)
- [autonomous-loop.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-loop.js)
- [autonomous-orchestrator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-orchestrator.js)
- [context-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/context-builder.js)
- [mcp-connection-manager.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/mcp/mcp-connection-manager.js)
- [worker-hub.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/workers/worker-hub.js)
- [agent-scope.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/agents/agent-scope.js)

Continuity and presentation:

- [run-chronicle.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/recovery/run-chronicle.js)
- [restart-reconciler.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/recovery/restart-reconciler.js)
- [events.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/shared/events.js)
- [prompts.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/config/prompts.js)
- [core workflow manifest](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/extensions/bundled/core-workflows/extension.json)
- New capability-discovery skill under [core workflow skills](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/extensions/bundled/core-workflows/skills)
- [panel.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)

## Intentionally Unchanged

- Provider connector APIs and native schema conversions.
- Tool execution implementations.
- Permission and approval authority.
- Security policy and audit behavior.
- Plan repository semantics.
- Workspace mutation behavior.
- User tool-scope settings.
- Model-controlled decomposition and completion decisions.
- Legacy or unrelated application code.