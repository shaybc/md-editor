/** Resolves immutable delegated-agent authority as an intersection of parent boundaries. */

"use strict";

const crypto = require("node:crypto");
const { AgentDefinitionPolicy } = require("./agent-definition-policy");
const { scopeAgentTools } = require("./agent-scope");

const LIFETIME_RANK = Object.freeze({ action: 0, task: 1, workspace: 2 });

class AgentAuthorityResolver {
  /** Reject a definition that cannot execute in the current parent mode. */
  static assertModeAllowed(agent, mode) {
    const validation = AgentDefinitionPolicy.validate(agent?.metadata || {});
    if (!validation.valid) throw boundaryError(`Invalid agent definition '${agent?.id || "delegated-agent"}': ${validation.errors.join(" ")}`, "AGENT_DEFINITION_INVALID");
    const allowed = validation.value.allowedModes || [];
    if (allowed.length && !allowed.includes(mode)) throw boundaryError(`Agent '${agent?.id || "delegated-agent"}' is not available in ${mode} mode.`, "AGENT_MODE_NOT_ALLOWED");
    return validation.value;
  }

  /** Compute a frozen child boundary that never broadens its parent request. */
  static resolve(agent, parentContext, options = {}) {
    const mode = String(parentContext?.policy?.mode || parentContext?.request?.action || "chat");
    const metadata = AgentAuthorityResolver.assertModeAllowed(agent, mode);
    const permissions = metadata.permissions || {};
    const parentPolicy = parentContext?.policy || {};
    const parentSecurity = parentContext?.request?.securityContext?.policy || {};
    const parentApprovalCapabilities = Array.isArray(parentSecurity.approvals?.allowedCapabilities) ? parentSecurity.approvals.allowedCapabilities : ["*"];
    const approvalScope = intersectCapabilities(parentApprovalCapabilities, permissions.approvalCapabilities);
    const parentLifetime = parentSecurity.approvals?.maximumGrantLifetime?.default || "workspace";
    const maximumGrantLifetime = narrowerLifetime(parentLifetime, permissions.maximumGrantLifetime || parentLifetime);
    const workspaceWrites = parentPolicy.allowWrites === true && permissions.workspaceWrites !== false;
    const commands = parentPolicy.allowCommands === true && parentSecurity.shell?.mode === "sandbox-shell" && permissions.commands !== false;
    const networkAccess = parentSecurity.execution?.networkAccess !== false && permissions.networkAccess !== false;
    const isolation = metadata.isolation === "worktree" || options.requestedIsolation === "worktree" ? "worktree" : "shared";
    const requiresWorktree = metadata.isolation === "worktree";
    const candidate = {
      mode,
      capabilities: Object.freeze([...(metadata.capabilities || [])]),
      tools: Object.freeze({ allow: Object.freeze([...(metadata.tools?.allow || [])]), deny: Object.freeze([...(metadata.tools?.deny || [])]) }),
      workspaceWrites,
      commands,
      networkAccess,
      approvalCapabilities: Object.freeze(approvalScope),
      maximumGrantLifetime,
      isolation,
      requiresWorktree
    };
    const toolDefinitions = AgentAuthorityResolver.filterDefinitions(options.definitions || [], candidate);
    const toolNames = Object.freeze(toolDefinitions.map((definition) => definition?.function?.name).filter(Boolean));
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ ...candidate, toolNames })).digest("hex");
    return Object.freeze({ ...candidate, toolNames, fingerprint });
  }

  /** Filter a tool roster through the already-resolved child boundary. */
  static filterDefinitions(definitions, authority) {
    return scopeAgentTools(definitions, {
      capabilities: authority.capabilities,
      tools: authority.tools,
      permissions: {
        workspaceWrites: authority.workspaceWrites,
        commands: authority.commands,
        networkAccess: authority.networkAccess,
        approvalCapabilities: authority.approvalCapabilities
      }
    });
  }

  /** Clone the parent security context with child-only restrictions. */
  static restrictSecurityContext(securityContext = {}, authority) {
    const policy = JSON.parse(JSON.stringify(securityContext.policy || {}));
    policy.shell = { ...(policy.shell || {}), mode: authority.commands ? policy.shell?.mode : "deny-and-audit" };
    policy.execution = { ...(policy.execution || {}), networkAccess: authority.networkAccess };
    policy.approvals = {
      ...(policy.approvals || {}),
      allowedCapabilities: [...authority.approvalCapabilities],
      maximumGrantLifetime: { ...(policy.approvals?.maximumGrantLifetime || {}), default: authority.maximumGrantLifetime }
    };
    return { ...securityContext, policy };
  }
}

function intersectCapabilities(parent, requested) {
  if (!Array.isArray(requested)) return [...parent];
  if (parent.includes("*")) return [...requested];
  if (requested.includes("*")) return [...parent];
  const permitted = new Set(parent);
  return requested.filter((capability) => permitted.has(capability));
}

function narrowerLifetime(parent, requested) {
  const parentRank = LIFETIME_RANK[parent] ?? 0;
  const requestedRank = LIFETIME_RANK[requested] ?? 0;
  return requestedRank < parentRank ? requested : parent;
}

function boundaryError(message, code) {
  const error = new Error(message);
  error.code = code;
  error.retryable = false;
  error.doNotRetry = true;
  return error;
}

module.exports = { AgentAuthorityResolver };
