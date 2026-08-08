/** Validates and normalizes declarative delegated-agent execution boundaries. */

"use strict";

const MODES = new Set(["chat", "plan", "agent"]);
const CAPABILITIES = new Set(["read", "context", "edit", "execute", "delegate"]);
const ISOLATIONS = new Set(["shared", "worktree"]);
const LIFETIMES = new Set(["action", "task", "workspace"]);
const PERMISSION_KEYS = new Set(["workspaceWrites", "commands", "networkAccess", "approvalCapabilities", "maximumGrantLifetime"]);
const TOOL_KEYS = new Set(["allow", "deny"]);

function list(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return null;
}

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

class AgentDefinitionPolicy {
  /** Normalize supported metadata without granting authority or mutating the source. */
  static normalize(metadata = {}) {
    const source = object(metadata);
    const permissions = object(source.permissions);
    const tools = object(source.tools);
    const normalized = {
      ...source,
      allowedModes: list(source.allowedModes),
      capabilities: list(source.capabilities),
      tools: { allow: list(tools.allow ?? source.allowedTools), deny: list(tools.deny ?? source.deniedTools) },
      permissions: {
        ...permissions,
        approvalCapabilities: Object.hasOwn(permissions, "approvalCapabilities") ? list(permissions.approvalCapabilities) : undefined
      }
    };
    if (source.isolation != null) normalized.isolation = String(source.isolation).trim();
    if (source.model != null) normalized.model = String(source.model).trim();
    return normalized;
  }

  /** Validate metadata and return all fail-closed definition errors. */
  static validate(metadata = {}) {
    const source = object(metadata);
    const value = AgentDefinitionPolicy.normalize(source);
    const errors = [];
    if (source.allowedModes != null && value.allowedModes === null) errors.push("allowedModes must be a string or list.");
    else for (const mode of value.allowedModes || []) if (!MODES.has(mode)) errors.push(`Unsupported allowed mode: ${mode}`);
    if (source.capabilities != null && value.capabilities === null) errors.push("capabilities must be a string or list.");
    else for (const capability of value.capabilities || []) if (!CAPABILITIES.has(capability)) errors.push(`Unsupported capability: ${capability}`);
    if (source.tools != null && (typeof source.tools !== "object" || Array.isArray(source.tools))) errors.push("tools must be an object.");
    for (const key of Object.keys(object(source.tools))) if (!TOOL_KEYS.has(key)) errors.push(`Unknown tools field: ${key}`);
    for (const key of ["allow", "deny"]) if (value.tools[key] === null) errors.push(`tools.${key} must be a string or list.`);
    if (source.permissions != null && (typeof source.permissions !== "object" || Array.isArray(source.permissions))) errors.push("permissions must be an object.");
    for (const key of Object.keys(object(source.permissions))) if (!PERMISSION_KEYS.has(key)) errors.push(`Unknown permission: ${key}`);
    for (const key of ["workspaceWrites", "commands", "networkAccess"]) {
      if (source.permissions?.[key] != null && typeof source.permissions[key] !== "boolean") errors.push(`permissions.${key} must be true or false.`);
    }
    if (source.permissions?.approvalCapabilities != null && value.permissions.approvalCapabilities === null) errors.push("permissions.approvalCapabilities must be a string or list.");
    if (source.permissions?.maximumGrantLifetime != null && !LIFETIMES.has(source.permissions.maximumGrantLifetime)) errors.push("permissions.maximumGrantLifetime must be action, task, or workspace.");
    if (source.isolation != null && !ISOLATIONS.has(value.isolation)) errors.push("isolation must be shared or worktree.");
    if (source.model != null && !value.model) errors.push("model must be a non-empty string.");
    return { valid: errors.length === 0, errors, value };
  }
}

module.exports = { AgentDefinitionPolicy, CAPABILITIES, MODES };
