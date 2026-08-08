# Stage 7.3 Plan: Agent Execution Boundaries

## Summary

Enforce agent `allowedModes`, capability scope, tool filters, permissions, and workspace isolation at launch and recovery.

Agent definitions may only reduce the parent runtime’s authority. They can never enable a tool, approval, command, network operation, or workspace access prohibited by the parent mode or security policy.

## Implementation Changes

### Agent metadata validation

- Add an `AgentDefinitionPolicy` that validates and normalizes:
  - `allowedModes`: `chat`, `plan`, or `agent`.
  - `capabilities`: `read`, `context`, `edit`, `execute`, or `delegate`.
  - `tools.allow` and `tools.deny`.
  - `model` and `isolation`.
  - Agent-specific `permissions`.
- Supported permissions:
  - `workspaceWrites`
  - `commands`
  - `networkAccess`
  - `approvalCapabilities`
  - `maximumGrantLifetime`
- Missing permissions inherit parent restrictions.
- `true` values never broaden parent authority.
- Invalid modes, permission values, or unknown permission keys make the agent unavailable.

### Effective agent authority

- Add an `AgentAuthorityResolver` that intersects agent metadata with:
  - Current Chat, Plan, or Agent capability policy.
  - Parent tool inventory.
  - User tool settings.
  - Effective security policy.
  - Workspace isolation rules.
- Produce one immutable authority object containing:
  - Effective mode.
  - Permitted tools and capabilities.
  - Write, command, and network access.
  - Approval capability and lifetime limits.
  - Required workspace isolation.
  - Definition and authority fingerprints.

### Launch enforcement

- Before queuing a worker:
  - Confirm the current mode is in `allowedModes`.
  - Resolve the effective authority.
  - Reject definitions that attempt to broaden parent authority.
  - Enforce required worktree isolation; launch arguments cannot weaken it.
- Build the worker’s tool inventory exclusively from its effective authority.
- Give each worker a cloned, restricted security context.
- Start workers with an empty task-grant collection so parent task approvals cannot leak into delegated work.
- Inject a concise model-visible summary of the worker’s effective boundaries.

### Approval and execution enforcement

- Extend the approval gateway to check agent authority before consulting stored grants or requesting approval.
- A disallowed approval capability fails without showing an approval prompt.
- Workspace grants remain authoritative only when the agent permits that capability.
- Commands and network operations use the worker’s restricted security context.
- Guessed, restored, or deferred tool names cannot bypass agent restrictions.

### Discovery and activation

- Filter mode-incompatible agents from model-facing discovery.
- Revalidate mode and permissions when an agent definition is activated.
- Preserve metadata-only lazy discovery; agent instruction bodies remain unloaded until activation.

### Recovery

- Persist the agent-definition and effective-authority fingerprints in private worker snapshots.
- During restart:
  - Reload the current agent definition.
  - Recalculate authority from current mode, settings, tools, and security policy.
  - Never trust saved authority or approval grants.
  - Fail the worker visibly if its definition is missing, invalid, or no longer allowed.
  - Remove saved tool activations that current authority no longer permits.
  - Add an interruption notice when boundaries changed but recovery remains valid.

### Bundled agents

- Add explicit permission declarations to the six bundled roles.
- Read-oriented roles deny workspace writes.
- Execution roles permit commands only within parent policy.
- The builder permits approved writes and commands but does not gain network access automatically.
- Existing model and capability scopes remain unchanged.

## Public Interfaces

- `AgentDefinitionPolicy.normalize(metadata)`
- `AgentDefinitionPolicy.validate(metadata)`
- `AgentAuthorityResolver.resolve(agent, parentContext)`
- `AgentAuthorityResolver.assertModeAllowed(agent, mode)`
- Worker requests gain internal `agentAuthority`.
- Private worker snapshots gain `agentDefinitionFingerprint` and `agentAuthorityFingerprint`.

## Test Plan

- Mode-incompatible agents are hidden and rejected before provider execution.
- Invalid permission metadata fails closed.
- Agent permissions narrow but never broaden parent authority.
- Tool allow/deny and capability restrictions remain enforced after deferred activation.
- Parent task approvals do not leak into workers.
- Disallowed approval capabilities do not display an approval prompt.
- Commands, writes, and network access use the restricted worker policy.
- Required worktree isolation cannot be weakened by launch arguments.
- Recovery revalidates changed definitions and removes invalid tool activations.
- Existing worker messaging, interruption recovery, model selection, Plan mode, approvals, and autonomous-loop tests remain passing.

## Expected files to change:

- New [agent-definition-policy.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/agents/agent-definition-policy.js)
- New [agent-authority-resolver.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/agents/agent-authority-resolver.js)
- [agent-scope.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/agents/agent-scope.js)
- [bundle-discovery.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/bundle-discovery.js)
- [extension-fabric.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/extension-fabric.js)
- [worker-hub.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/workers/worker-hub.js)
- [approval-gateway.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/approval-gateway.js)
- Bundled definitions under [core-workflows/agents](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/extensions/bundled/core-workflows/agents)
- [ai-companion-large-task-coordination.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-large-task-coordination.test.js)
- [ai-companion-extension-fabric.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-extension-fabric.test.js)

## Intentionally Unchanged

Provider connectors, global security-policy loading, approval storage, workspace tool implementations, plan persistence, model-controlled delegation decisions, and the autonomous loop remain unchanged.