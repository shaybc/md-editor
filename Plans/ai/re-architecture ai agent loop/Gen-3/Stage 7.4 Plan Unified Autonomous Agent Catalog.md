# Stage 7.4 Plan: Unified Autonomous Agent Catalog

## Summary

Replace the split agent-discovery path with one canonical `AgentCatalog`.

The catalog will merge workspace `.agents/*.md` definitions and enabled, trusted bundle agents into one validated active-agent collection. Model discovery, lazy loading, worker launch, authority resolution, recovery, and fingerprints will all use this same collection.

Agent instruction bodies remain lazily loaded. Only bounded metadata is advertised upfront.

## Implementation Changes

### Canonical agent model

- Add a normalized `AgentCatalogEntry` containing:
  - Stable logical agent ID.
  - Name and description.
  - Source and source priority.
  - Metadata and metadata fingerprint.
  - Lazy body loader.
  - File or bundle identity.
  - Compatibility aliases.
- Reuse `AgentDefinitionPolicy` for validation.
- Keep authority resolution in `AgentAuthorityResolver`.
- Invalid definitions remain unavailable and produce bounded discovery diagnostics.

### Agent sources

- Add separate source adapters for:
  - Workspace `.agents/*.md` definitions.
  - Enabled and trusted bundle agent contributions.
- Require executable workspace agents to use the same independently authored Markdown frontmatter schema as bundle agents.
- Retain body loading by file path or bundle activation only after explicit loading or launch.
- Stop `extension-registry.js` from independently advertising `.agents/*.md` entries.

### Merge and precedence

- Merge sources by normalized logical agent ID.
- Use deterministic precedence:
  1. Workspace agent.
  2. Enabled and trusted workspace bundle agent.
  3. Enabled and trusted application bundle agent.
- Preserve legacy IDs such as `.agents/example.md` and `bundle-id:example` as lookup aliases.
- Advertise only the winning active definition.
- Record shadowed definitions in diagnostics without exposing duplicate selectable agents.
- Reject ambiguous aliases rather than selecting unpredictably.

### Discovery and lazy activation

- Add `AgentCatalog.load()`, `list()`, `resolve()`, and `activate()`.
- `list()` returns metadata without instruction bodies.
- `activate()` reloads and validates the current definition before returning its complete instructions.
- `discover_extensions({ kind: "agent" })` reads exclusively from `AgentCatalog.list()`.
- `load_extension` delegates agent IDs and aliases to `AgentCatalog.activate()`.
- The system extension summary includes bounded active-agent metadata from this catalog.
- Skills, rules, hooks, plugins, and external-server entries continue using their existing sources.

### Worker launch

- Inject `AgentCatalog` into `WorkerHub`.
- Replace direct `ExtensionFabric.activate(agentId)` calls with `AgentCatalog.activate(agentId)`.
- Pass the complete resolved agent definition into:
  - `AgentAuthorityResolver`.
  - Model selection.
  - Instruction construction.
  - Tool scoping.
  - Workspace isolation.
  - Worker persistence.
- Keep `ExtensionFabric` in workers only for non-agent extension and capability operations.
- A model-visible launch failure must distinguish:
  - Unknown agent.
  - Shadowed or ambiguous alias.
  - Invalid definition.
  - Mode-incompatible agent.
  - Definition changed or disappeared.

### Capability discovery

- Let `CapabilityCatalog` search the canonical agent metadata alongside other extension metadata without loading agent bodies.
- Searching for an agent must not activate tool schemas or load the agent instructions.
- Exact agent activation remains the responsibility of `load_extension` or `worker_launch`.

### Recovery

- Persist:
  - Logical agent ID.
  - Resolved source identity.
  - Definition fingerprint.
  - Authority fingerprint.
- During restart:
  - Reload all current agent sources.
  - Resolve the saved logical ID through the current catalog.
  - Revalidate metadata, mode, permissions, tools, and isolation.
  - Recompute authority.
- If source precedence changes but the logical agent remains available, emit a recovery warning and continue using the current winning definition.
- Missing, invalid, or incompatible definitions produce a model-visible worker failure.
- Never restore a serialized instruction body as executable authority.

### Fingerprints and renewal

- Include the active agent metadata fingerprint in autonomous extension fingerprints.
- Preserve loaded agent bodies in the existing run-scoped extension-body registry.
- After context renewal, reinsert an activated agent body from the current catalog only when its fingerprint remains valid.
- Remove unavailable or changed loaded bodies and add a concise change notice.

## Public Interfaces

- `AgentCatalog.load()`
- `AgentCatalog.list({ mode?, includeUnavailable? })`
- `AgentCatalog.resolve(idOrAlias)`
- `AgentCatalog.activate(idOrAlias)`
- `AgentCatalog.snapshot()`
- `AgentCatalog.fingerprint()`
- `WorkspaceAgentSource.discover()`
- `BundleAgentSource.discover(fabric)`
- `WorkerHub` receives `agentCatalog`.
- Autonomous context gains `agentCatalog`.
- Recovery worker records gain `agentLogicalId` and `agentSourceIdentity`.

## Test Plan

- A valid `.agents/*.md` definition appears in agent discovery and launches successfully.
- Workspace agent instruction bodies are not read into model context before activation.
- Bundle agents remain discoverable and launchable.
- Discovery and worker launch resolve through the same catalog instance.
- The same agent is not listed twice by the extension registry and bundle system.
- Workspace definitions override bundle definitions with the same logical ID.
- Legacy workspace-path and bundle-prefixed IDs resolve through compatibility aliases.
- Ambiguous aliases fail closed.
- Invalid definitions are unavailable and produce diagnostics.
- Mode-incompatible agents are neither advertised nor launchable.
- Tool, model, permission, network, approval, and isolation enforcement remains active after catalog resolution.
- Capability search returns agent metadata without loading bodies or activating schemas.
- Recovery reloads the current winning definition and recomputes authority.
- Changed precedence produces a warning; missing definitions produce worker failure.
- Context renewal retains only valid activated agent bodies.
- Static tests confirm `WorkerHub` no longer resolves agents directly through `ExtensionFabric`.
- Existing autonomous, extension, worker, recovery, approval, and deferred-tool tests remain passing.

## Expected files to change:

- New [agent-catalog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/agents/agent-catalog.js)
- New [workspace-agent-source.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/agents/workspace-agent-source.js)
- New [bundle-agent-source.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/agents/bundle-agent-source.js)
- [agent-definition-policy.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/agents/agent-definition-policy.js)
- [extension-registry.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extension-registry.js)
- [extension-fabric.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/extension-fabric.js)
- [autonomous-orchestrator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-orchestrator.js)
- [tool-executor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-executor.js)
- [capability-catalog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/capabilities/capability-catalog.js)
- [worker-hub.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/workers/worker-hub.js)
- [ai-companion-extension-fabric.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-extension-fabric.test.js)
- [ai-companion-large-task-coordination.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-large-task-coordination.test.js)
- [ai-companion-autonomous-runtime.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-autonomous-runtime.test.js)

## Intentionally Unchanged

- Provider connectors.
- Autonomous loop completion behavior.
- Existing security and approval storage.
- Tool execution implementations.
- Skills, hooks, plugins, and external-server loading.
- Plan persistence.
- Worker scheduling and messaging semantics.
- Legacy runtime code.