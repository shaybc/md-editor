/** Normalizes programmatic, run-scoped extension contributions for executable composition. */

"use strict";

class RunExtensionCatalog {
  constructor(request = {}) {
    this.request = request;
    this.plugins = (Array.isArray(request.plugins) ? request.plugins : []).filter((plugin) => plugin?.enabled !== false);
    this.errors = [];
  }

  /** Return a request view containing plugin-owned declarative contributions. */
  extendRequest() {
    return {
      ...this.request,
      hooks: [...list(this.request.hooks), ...this.collect("hooks")],
      mcpServers: [...list(this.request.mcpServers), ...this.collect("mcpServers")],
      deferredTools: [...list(this.request.deferredTools), ...this.collect("deferredTools")],
      skills: [...list(this.request.skills), ...this.collect("skills")],
      agents: [...list(this.request.agents), ...this.collect("agents")]
    };
  }

  /** Build executable deferred-tool registrations and isolate invalid entries. */
  toolRegistrations(request = this.extendRequest()) {
    const registrations = [];
    for (const [index, entry] of list(request.deferredTools).entries()) {
      try { registrations.push(normalizeToolRegistration(entry, index, request)); }
      catch (error) { this.errors.push({ source: "deferred-tool", id: entry?.id || entry?.name || `deferred-${index + 1}`, error: error?.message || String(error) }); }
    }
    return registrations;
  }

  collect(kind) {
    return this.plugins.flatMap((plugin) => {
      const contributions = object(plugin.contributions);
      const values = list(contributions[kind] ?? plugin[kind]);
      return ["skills", "agents"].includes(kind) ? values.map(separateInstructionBody) : values;
    });
  }
}

function normalizeToolRegistration(entry, index, request) {
  const source = object(entry);
  const supplied = object(source.definition);
  const suppliedFunction = object(supplied.function);
  const name = String(suppliedFunction.name || source.name || source.id || "").trim();
  if (!name) throw new Error("An injected deferred tool requires a name.");
  const execute = typeof source.execute === "function"
    ? source.execute
    : (typeof source.handler === "function" ? source.handler : request.extensionCapabilityHandlers?.[source.handlerId || name]);
  if (typeof execute !== "function") throw new Error(`Injected deferred tool '${name}' requires an executable handler.`);
  const description = String(suppliedFunction.description || source.description || "Run-scoped extension capability.");
  const parameters = suppliedFunction.parameters || source.inputSchema || source.parameters || { type: "object", properties: {}, additionalProperties: false };
  return {
    ...source,
    definition: { type: "function", function: { name, description, parameters } },
    source: String(source.source || `run-extension:${source.pluginId || index + 1}`),
    domain: String(source.domain || "run-extension"),
    description,
    executionOwner: "run-extension",
    alwaysLoad: source.alwaysLoad === true,
    execute
  };
}

function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function separateInstructionBody(value) {
  if (!value || typeof value !== "object" || value.metadata) return value;
  const { body, content, ...metadata } = value;
  return { id: value.id, metadata, body: String(body || content || "") };
}

module.exports = { RunExtensionCatalog, normalizeToolRegistration };
