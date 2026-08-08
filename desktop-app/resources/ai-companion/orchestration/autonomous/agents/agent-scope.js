/** Applies a declarative agent definition to the parent capability roster. */

"use strict";

const CAPABILITY_PREFIXES = Object.freeze({
  read: ["list_", "glob_", "search_", "read_", "discover_", "capability_", "mcp_search_", "mcp_read_", "mcp_get_"],
  context: ["context_", "artifact_read"],
  edit: ["apply_edit", "write_file"],
  execute: ["run_command", "run_tests", "compile_", "restore_", "manage_"],
  delegate: ["worker_"]
});

function matchesCapability(name, capability) {
  return (CAPABILITY_PREFIXES[capability] || []).some((prefix) => name === prefix || name.startsWith(prefix));
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

/** Return only tools allowed by an agent's capability and explicit tool filters. */
function scopeAgentTools(definitions, metadata = {}) {
  const capabilities = normalizeList(metadata.capabilities);
  const allow = normalizeList(metadata.tools?.allow || metadata.allowedTools);
  const deny = new Set(normalizeList(metadata.tools?.deny || metadata.deniedTools));
  return definitions.filter((definition) => {
    const name = definition?.function?.name || "";
    if (name.startsWith("worker_")) return false;
    if (capabilities.length && !capabilities.some((capability) => matchesCapability(name, capability))) return false;
    if (allow.length && !allow.some((entry) => entry === name || (entry.endsWith("*") && name.startsWith(entry.slice(0, -1))))) return false;
    return !deny.has(name);
  });
}

module.exports = { scopeAgentTools };
