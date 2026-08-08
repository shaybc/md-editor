/** Maintains the run-scoped set of visible, deferred, and external capabilities. */

"use strict";

class CapabilityCatalog {
  constructor(options) {
    this.policy = options.policy;
    this.fabric = options.fabric;
    this.mcp = options.mcp;
    this.baseDefinitions = options.baseDefinitions || [];
    this.activeDefinitions = new Map();
  }

  /** Return the provider tool roster for the next model round. */
  definitions() {
    const combined = [...this.baseDefinitions, ...this.activeDefinitions.values()];
    return combined.filter((entry, index) => combined.findIndex((candidate) => candidate.function?.name === entry.function?.name) === index);
  }

  /** Search extension metadata and lazily activate matching external tool schemas. */
  async discover(query, context = {}) {
    const needle = String(query || "").trim().toLowerCase();
    const snapshot = this.fabric.snapshot();
    const entries = snapshot.entries.filter((entry) => !needle || `${entry.id} ${entry.name || ""} ${entry.description || ""} ${JSON.stringify(entry.metadata || {})}`.toLowerCase().includes(needle)).slice(0, Math.max(1, Math.min(Number(context.maxResults || 12), 30)));
    for (const entry of entries.filter((candidate) => candidate.kind === "mcp-server")) {
      const server = this.fabric.entries.get(entry.id);
      const serverId = String(server?.metadata?.id || server?.localId || "");
      for (const definition of await this.mcp.getToolDefinitions(serverId)) this.activeDefinitions.set(definition.function.name, definition);
    }
    return { entries, activatedTools: Array.from(this.activeDefinitions.keys()), availableServers: this.mcp.listServers() };
  }

  /** Revalidate previously active external schemas against current trusted servers. */
  async restore(names) {
    const requested = new Set(Array.isArray(names) ? names.map(String) : []);
    const baseNames = new Set(this.baseDefinitions.map((entry) => entry.function?.name).filter(Boolean));
    for (const name of baseNames) requested.delete(name);
    if (!requested.size) return { restored: [], missing: [] };
    for (const entry of this.fabric.entries.values()) {
      if (entry.kind !== "mcp-server") continue;
      const serverId = String(entry.metadata?.id || entry.localId || "");
      try {
        for (const definition of await this.mcp.getToolDefinitions(serverId)) {
          const name = definition.function?.name;
          if (requested.has(name)) this.activeDefinitions.set(name, definition);
        }
      } catch (_error) { /* Missing servers remain model-visible through the returned list. */ }
    }
    const restored = Array.from(this.activeDefinitions.keys()).filter((name) => requested.has(name));
    return { restored, missing: Array.from(requested).filter((name) => !this.activeDefinitions.has(name)) };
  }

  /** Invoke an active non-core capability. */
  async invoke(name, args) {
    if (name.startsWith("mcp__")) return this.mcp.invoke(name, args);
    throw new Error(`Capability is not active: ${name}`);
  }
}

module.exports = { CapabilityCatalog };
