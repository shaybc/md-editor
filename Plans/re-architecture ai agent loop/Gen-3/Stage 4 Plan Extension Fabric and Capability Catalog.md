# Stage 4 Plan: Extension Fabric and Capability Catalog

## Summary

Replace metadata-only extension discovery with an executable, security-scoped extension system. Add lazy capabilities, Markdown skills and agents, declarative plugin bundles, lifecycle hooks, and MCP connections over stdio and Streamable HTTP.

Legacy remains available and default. Memory improvements, agent messaging, and final cutover remain later stages.

## Important rules

- Reference-project product names must not appear in code, plans, manifests, prompts, or bundled artifacts.
- Reimplement concepts and behavioral flows independently; do not copy source, prompts, names, or architectural terminology.
- Preserve important behavioral details when independently rewriting built-in instructions and workflows.
- Extensions may narrow permissions but never expand the parent run’s capabilities or bypass approvals.
- Plugins are declarative bundles; arbitrary in-process plugin JavaScript is prohibited.
- Autonomous modules must not import M0–M11 controllers or their tool dispatcher.

## Implementation Changes

### Capability Catalog

- Replace the static tool array with `CapabilityCatalog`, exposing:
  - `discover(query, context)`
  - `activate(ids, context)`
  - `definitions(context)`
  - `invoke(call, context)`
- Keep essential read, task, and capability-search tools initially visible. Load mutation, specialized, plugin, and MCP tools only after model-directed discovery.
- Rebuild provider tool definitions before every model round so newly activated capabilities become callable immediately.
- Register independently authored schemas and adapters for all retained tool families: workspace, editor, Git, plans, graph, API client, conversion/export, preferences, structured builds/tests, and package operations.
- Continue invoking existing low-level implementations, approval services, security policy, and audit infrastructure. Do not import the legacy roster or executor.

### Skills, Agents, and Core Pack

- Discover from bundled, profile, and workspace roots. Duplicate IDs are configuration errors; no source silently shadows another.
- Parse Markdown YAML frontmatter with `yaml@2.9.0`.
- Skill fields: `id`, `name`, `description`, `triggers`, `allowedModes`, and optional capability IDs. Load only metadata initially; inject the complete body when explicitly activated or when `/skill-id` is entered.
- Agent fields: `id`, `name`, `description`, `model`, allowed capabilities, tool allow/deny lists, and Markdown instructions.
- Agent models may be `inherit` or an exact model ID using the current provider connector. Agents cannot override providers, endpoints, or credentials.
- Child capability policy is the intersection of parent policy, agent definition, security policy, and current approvals.
- Upgrade delegated subtasks to run the autonomous kernel with the selected agent definition. Long-lived messaging and team coordination remain Stage 5.
- Ship an independently authored core pack:
  - Agents: repository explorer, implementation planner, change builder, issue investigator, change reviewer, and test auditor.
  - Skills: investigate a defect, develop a change, review changes, create an implementation plan, and verify completed work.
  - Rules remain prompt guidance; they must not introduce semantic response rejection or forced verification calls.

### Declarative Plugins, Hooks, and MCP

- Plugin bundle format: `extension.json` with `schemaVersion`, `id`, `name`, `version`, `description`, and contribution paths for skills, agents, hooks, and MCP servers.
- Roots:
  - Bundled: application resources.
  - User: `<profileRoot>/companion/extensions/`.
  - Workspace: `<workspace>/.md-editor/companion/extensions/`.
- Bundled extensions are enabled by default. User and workspace extensions require explicit enablement. Workspace trust is stored by workspace hash, extension ID, and manifest digest; any manifest change invalidates trust.
- Reject path traversal, escaped symlinks, invalid schemas, duplicate IDs, and references outside the bundle. One invalid extension must not disable unrelated extensions.
- Hook events: run start/finish, before/after model call, before/after tool call, tool failure, and before/after compaction.
- Hook actions may inject bounded context or run structured executable descriptors. They use the existing validation, approval, timeout, cancellation, and audit gateway.
- Pre-action hook failures are fail-closed; post-action failures emit diagnostics but preserve the completed action. Prevent hook recursion.
- Add `@modelcontextprotocol/client@2.0.0`, using dynamic imports for its ESM client.
- Support stdio and Streamable HTTP. Stdio launches require process validation and approval before the SDK spawns the server. HTTP connections require server-level approval and security-policy validation.
- Connect servers lazily when capability search selects them. Cache negotiated metadata for the run and close clients on completion, cancellation, configuration reload, or idle timeout.
- Expose MCP tools through namespaced capability IDs. Expose resources and prompts through deferred search/read/get tools rather than loading their contents eagerly.
- Treat all MCP invocations as approval-capable external actions by default. Server annotations may increase risk but may not suppress approval.
- Redact authorization headers and environment secrets from events, transcripts, errors, checkpoints, and UI.

### Configuration and UI

- Add an AI Extensions settings panel showing discovered bundles, source, trust state, enablement, validation errors, contributed capabilities, and MCP connection status.
- Add bridge actions for listing, enabling, trusting, refreshing, connecting, disconnecting, and testing extensions.
- Standardize events for capability activation, extension validation, skill activation, agent launch, hook execution, and MCP lifecycle.
- Persist only extension IDs, digests, statuses, and redacted diagnostics in autonomous checkpoints. On recovery, rediscover and verify the same digests before reinjecting active skills and agents.

## Public Interfaces

- `ExtensionFabric.load({profileRoot, workspaceRoot, securityContext})`
- `CapabilityCatalog.discover/activate/definitions/invoke`
- `HookGateway.run(event, payload, runtimeContext)`
- `McpConnectionManager.connect/search/invoke/readResource/getPrompt/close`
- Extend `subtask_create` with `agentId`; preserve existing create/list/wait calls.
- Add bridge events and actions without changing provider, approval, or transport contracts.

## Test Plan

- Verify lazy indexes contain descriptions but not full skill, agent, prompt, resource, or tool contents.
- Verify activation changes the next model call’s tool roster without restarting the run.
- Exercise every retained tool family through the new catalog and assert no legacy imports.
- Test skill activation, slash activation, invalid frontmatter, duplicate IDs, path escape, symlink escape, trust invalidation, and checkpoint reinjection.
- Test agent model inheritance/override, tool narrowing, parent permission intersection, cancellation, and failed child runs.
- Test hook ordering, matching, context injection, approval, denial, timeout, recursion prevention, fail-closed pre-hooks, and fail-open post-hooks.
- Test MCP stdio and HTTP discovery, tools, resources, prompts, parallel calls, reconnect, cancellation, idle shutdown, malformed schemas, unavailable servers, secret redaction, and approval denial.
- Add a vertical UI test: enable extension → start autonomous task → discover capability → invoke it → persist events → restore task.
- Run existing autonomous, settings, security, approval, mode-boundary, and panel suites.

## Expected files to change:

- [package.json](C:/GitHub/shaybc/md-editor/desktop-app/package.json)
- [package-lock.json](C:/GitHub/shaybc/md-editor/desktop-app/package-lock.json)
- [Autonomous orchestration](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous)
- [Approval capability registry](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/approval-capability-registry.js)
- [Structured execution broker](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/security/structured-execution-broker.js)
- [AI Companion bridge](C:/GitHub/shaybc/md-editor/desktop-app/resources/bridges/ai-companion-bridge/ai-companion-bridge.cjs)
- [Settings markup](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [Settings controller](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [AI Companion panel](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- [Bundled extension pack](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/extensions/bundled)
- [Desktop tests](C:/GitHub/shaybc/md-editor/desktop-app/tests)

## Assumptions

- Node.js 20 or newer is available; the official MCP client requires it. Its client supports stdio and Streamable HTTP transports according to the [official client documentation](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md).
- OAuth and interactive remote-server authentication are deferred; this stage supports configured headers with mandatory redaction.
- Plugin installation or marketplace downloading is not included. Bundles are installed by placing files in an extension root.
- The architecture setting remains defaulted to `legacy`; M0–M11 code and checkpoints are not removed in this stage.
