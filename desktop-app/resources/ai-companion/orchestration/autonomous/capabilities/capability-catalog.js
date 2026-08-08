/** Unified inventory, search, activation, and provider exposure for autonomous tools. */

"use strict";

const { ToolSchemaInventory } = require("./tool-schema-inventory");
const { ToolExposurePolicy } = require("./tool-exposure-policy");
const { ToolSearchIndex } = require("./tool-search-index");
const { ToolActivationSession } = require("./tool-activation-session");
const { ToolCatalogNotice } = require("./tool-catalog-notice");

class CapabilityCatalog {
  constructor(options) {
    this.policy = options.policy;
    this.fabric = options.fabric;
    this.mcp = options.mcp;
    this.emit = typeof options.emit === "function" ? options.emit : () => {};
    this.registrationFilter = typeof options.registrationFilter === "function" ? options.registrationFilter : () => true;
    this.metadataEntries = Array.isArray(options.metadataEntries) ? options.metadataEntries : [];
    const registrations = options.registrations || (options.baseDefinitions || []).map((definition) => ({ definition }));
    this.inventory = new ToolSchemaInventory(registrations);
    this.exposure = new ToolExposurePolicy(this.policy);
    this.searchIndex = new ToolSearchIndex();
    this.activation = new ToolActivationSession(this.emit);
    this.notice = new ToolCatalogNotice();
    this.unavailable = new Map();
    this.prohibited = new Set((options.knownToolNames || []).map(String).filter((name) => !this.inventory.find(name)));
    this.externalFailures = new Map();
    this.externalPending = new Set();
  }

  /** Return only immediate and explicitly activated schemas for the next provider call. */
  providerDefinitions() {
    const invalid = this.activation.validate(this.inventory);
    for (const name of invalid) this.unavailable.set(name, "The tool definition changed or disappeared.");
    if (invalid.length) this.emit({ type: "tool-schema-unavailable", names: invalid, summary: invalid.length + " active tool schemas changed or disappeared." });
    return this.inventory.list()
      .filter((record) => this.exposure.isImmediate(record) || this.activation.has(record.name))
      .map((record) => record.definition);
  }

  /** Compatibility alias retained while callers migrate to providerDefinitions. */
  definitions() { return this.providerDefinitions(); }

  /** Compatibility name for callers that request a deferred availability notice. */
  deferredNotice(options = {}) { return this.consumeCatalogNotice(options); }

  /** Return all current registrations for worker-specific filtering. */
  registrations() { return this.inventory.list(); }

  /** Return the provider roster and deferred inventory size without schema bodies. */
  metrics() {
    const records = this.inventory.list();
    const provider = this.providerDefinitions();
    const deferred = records.filter((record) => !this.exposure.isImmediate(record));
    const allCharacters = records.reduce((total, record) => total + JSON.stringify(record.definition).length, 0);
    const providerCharacters = provider.reduce((total, definition) => total + JSON.stringify(definition).length, 0);
    return {
      totalSchemas: records.length,
      providerSchemas: provider.length,
      deferredSchemas: deferred.length,
      activeDeferredSchemas: deferred.filter((record) => this.activation.has(record.name)).length,
      estimatedSchemaTokensSent: Math.ceil(providerCharacters / 4),
      estimatedSchemaTokensAvoided: Math.max(0, Math.ceil((allCharacters - providerCharacters) / 4))
    };
  }

  /** Search every deferred schema source and activate only the matched definitions. */
  async search(query, context = {}) {
    const extensionEntries = this.matchExtensionMetadata(query, context.maxResults);
    await this.indexMatchingExternalServers(query, extensionEntries);
    const deferred = this.inventory.list().filter((record) => !this.exposure.isImmediate(record));
    const candidates = /^select:/i.test(String(query || "")) ? this.inventory.list() : deferred;
    const result = this.searchIndex.search(query, candidates, { maxResults: context.maxResults });
    const selectedDeferred = result.matches.filter((record) => !this.exposure.isImmediate(record));
    const selectedImmediate = result.matches.filter((record) => this.exposure.isImmediate(record)).map((record) => record.name);
    const activation = this.activation.activate(selectedDeferred, { source: "capability-search" });
    this.activation.recordSearch({ queryType: result.queryType, matchCount: result.matches.length, activatedCount: activation.activated.length });
    const response = {
      query: String(query || ""),
      queryType: result.queryType,
      matches: result.matches.map((record) => record.name),
      activatedTools: activation.activated,
      alreadyActive: [...selectedImmediate, ...activation.alreadyActive],
      missing: result.missing,
      totalDeferredTools: deferred.length,
      availableServers: this.listServers(),
      pendingServers: Array.from(this.externalPending),
      unavailableServers: Array.from(this.externalFailures, ([serverId, reason]) => ({ serverId, reason })),
      entries: extensionEntries
    };
    this.emit({ type: "tool-search-completed", queryType: result.queryType, matchCount: response.matches.length, deferredCount: deferred.length, ...this.metrics() });
    return response;
  }

  /** Backward-compatible discovery entry point. */
  discover(query, context = {}) { return this.search(query, context); }

  /** Return a model notice only when deferred availability changed. */
  consumeCatalogNotice(options = {}) {
    const deferred = this.inventory.list().filter((record) => !this.exposure.isImmediate(record));
    return this.notice.consume(deferred, { revision: this.inventory.revision, force: options.force === true });
  }

  /** Return the current bounded catalog notice and revision for polling integrations. */
  consumeInventoryChanges(options = {}) {
    return { revision: this.inventory.revision, notice: this.consumeCatalogNotice(options), metrics: this.metrics() };
  }

  /** Classify a model-requested tool without interpreting task semantics. */
  classifyCall(name) {
    const key = String(name || "");
    const record = this.inventory.find(key);
    if (!record) {
      if (this.unavailable.has(key)) return { status: "unavailable", reason: this.unavailable.get(key) };
      if (this.prohibited.has(key)) return { status: "prohibited" };
      return { status: "unknown" };
    }
    if (this.exposure.isImmediate(record) || this.activation.has(key)) return { status: "active", record };
    return { status: "deferred", record };
  }

  /** Reject only structurally inactive known schemas before execution. */
  assertCallable(name) {
    const classification = this.classifyCall(name);
    if (classification.status === "active") return classification.record;
    if (classification.status === "deferred") {
      const error = new Error("Tool schema '" + name + "' is not active. Use capability_search with query 'select:" + name + "', then retry.");
      error.code = "TOOL_SCHEMA_NOT_ACTIVE";
      error.retryable = true;
      throw error;
    }
    if (classification.status === "unavailable") {
      const error = new Error("Tool schema '" + name + "' is no longer available: " + classification.reason);
      error.code = "TOOL_SCHEMA_UNAVAILABLE";
      error.retryable = false;
      error.doNotRetry = true;
      throw error;
    }
    if (classification.status === "prohibited") {
      const error = new Error("Tool schema '" + name + "' is not permitted in the current mode or tool scope.");
      error.code = "TOOL_SCHEMA_PROHIBITED";
      error.retryable = false;
      error.doNotRetry = true;
      throw error;
    }
    return null;
  }

  /** Restore only names that remain permitted and definition-compatible. */
  async restore(snapshot) {
    const activationSnapshot = snapshot?.activation || snapshot;
    const requested = this.activation.requested(activationSnapshot);
    this.unavailable = new Map(Array.isArray(snapshot?.unavailable) ? snapshot.unavailable : []);
    this.externalFailures = new Map(Array.isArray(snapshot?.externalFailures) ? snapshot.externalFailures : []);
    if (!requested.length) {
      this.notice.restore(snapshot?.notice);
      return { restored: [], missing: [] };
    }
    await this.indexExternalNames(requested);
    const savedMetadata = new Map(Array.isArray(activationSnapshot?.active) ? activationSnapshot.active.filter(Array.isArray) : []);
    const restoredRecords = [];
    const missing = [];
    for (const name of requested) {
      const record = this.inventory.find(name);
      const savedFingerprint = savedMetadata.get(name)?.fingerprint;
      if (!record || (savedFingerprint && savedFingerprint !== record.fingerprint) || this.exposure.isImmediate(record)) {
        if (!record) {
          missing.push(name);
          this.unavailable.set(name, "The current inventory no longer provides this definition.");
        } else if (savedFingerprint && savedFingerprint !== record.fingerprint) {
          missing.push(name);
          this.unavailable.set(name, "The saved tool definition changed and must be selected again.");
        }
        continue;
      }
      restoredRecords.push(record);
    }
    const activation = this.activation.activate(restoredRecords, { source: "recovery" });
    this.notice.restore(snapshot?.notice);
    if (activation.activated.length) this.emit({ type: "tool-schema-restored", names: activation.activated, count: activation.activated.length, estimatedSchemaTokens: Math.ceil(restoredRecords.reduce((total, record) => total + JSON.stringify(record.definition).length, 0) / 4), summary: activation.activated.length + " deferred tool schemas restored." });
    if (missing.length) this.emit({ type: "tool-schema-unavailable", names: missing, count: missing.length, summary: missing.length + " saved tool schemas are unavailable." });
    return { restored: activation.activated, missing };
  }

  /** Return versioned activation state without embedding provider schemas. */
  snapshot() {
    return {
      inventoryFingerprint: this.inventory.fingerprint(),
      activation: this.activation.snapshot(),
      notice: this.notice.snapshot(),
      unavailable: Array.from(this.unavailable.entries()),
      externalFailures: Array.from(this.externalFailures.entries())
    };
  }

  /** Invoke an active external capability. */
  async invoke(name, args) {
    const record = this.assertCallable(name);
    if (name.startsWith("mcp__")) {
      await this.indexExternalServer(record.serverId);
      this.assertCallable(name);
      return this.mcp.invoke(name, args);
    }
    throw new Error("Capability is not externally invokable: " + name);
  }

  matchExtensionMetadata(query, maxResults = 12) {
    const needle = String(query || "").replace(/^select:/i, "").toLowerCase();
    const limit = Math.max(1, Math.min(Number(maxResults || 12), 30));
    const entries = [...this.fabric.snapshot().entries.filter((entry) => entry.kind !== "agent"), ...this.metadataEntries];
    const unique = Array.from(new Map(entries.map((entry) => [entry.id, entry])).values());
    return unique.filter((entry) => {
      const text = (entry.id + " " + (entry.name || "") + " " + (entry.description || "") + " " + JSON.stringify(entry.metadata || {})).toLowerCase();
      return !needle || needle.split(/[\s,]+/).some((term) => term && text.includes(term.replace(/^\+/, "")));
    }).slice(0, limit);
  }

  async indexMatchingExternalServers(query, extensionEntries) {
    const servers = this.listServers();
    const normalized = String(query || "").replace(/^select:/i, "").toLowerCase();
    const exactPrefixes = normalized.split(",").map((name) => name.trim()).filter((name) => name.startsWith("mcp__"));
    const matchedIds = new Set(extensionEntries.filter((entry) => entry.kind === "mcp-server").map((entry) => this.resolveServerId(entry)).filter(Boolean));
    for (const server of servers) {
      const text = (server.id + " " + server.name + " " + server.description).toLowerCase();
      if (normalized.split(/\s+/).some((term) => term && text.includes(term.replace(/^\+/, "")))) matchedIds.add(server.id);
      if (exactPrefixes.some((name) => name.startsWith("mcp__" + sanitize(server.id) + "__"))) matchedIds.add(server.id);
    }
    for (const serverId of matchedIds) {
      this.externalPending.add(serverId);
      try {
        await this.indexExternalServer(serverId);
        this.externalFailures.delete(serverId);
      } catch (error) {
        const reason = error?.message || String(error);
        this.externalFailures.set(serverId, reason);
        this.emit({ type: "tool-schema-unavailable", serverId, names: [], summary: "External tool catalog unavailable for " + serverId + ": " + reason });
      } finally {
        this.externalPending.delete(serverId);
      }
    }
  }

  async indexExternalNames(names) {
    const servers = this.listServers();
    for (const server of servers) {
      if (names.some((name) => name.startsWith("mcp__" + sanitize(server.id) + "__"))) await this.indexExternalServer(server.id);
    }
  }

  async indexExternalServer(serverId) {
    if (!serverId) return;
    const registrations = (typeof this.mcp.getToolRegistrations === "function"
      ? await this.mcp.getToolRegistrations(serverId)
      : (await this.mcp.getToolDefinitions(serverId)).map((definition) => ({
          definition,
          source: "external:" + serverId,
          domain: "external:" + serverId,
          description: definition.function?.description || "",
          external: true,
          serverId
        }))).filter((record) => this.registrationFilter(record));
    const delta = this.inventory.replaceSource("external:" + serverId, registrations);
    if (delta.added.length || delta.removed.length || delta.changed.length) {
      for (const name of [...delta.removed, ...delta.changed]) {
        this.activation.markUnavailable(name);
        this.unavailable.set(name, delta.removed.includes(name) ? "The external server no longer advertises this tool." : "The external server changed this tool definition; search again before use.");
      }
      this.emit({
        type: "tool-catalog-updated", serverId, ...delta,
        summary: "External tool catalog updated for " + serverId + "."
      });
    }
  }

  listServers() {
    const servers = typeof this.mcp?.listServers === "function"
      ? this.mcp.listServers()
      : Array.from(this.fabric?.entries?.values?.() || [])
      .filter((entry) => entry.kind === "mcp-server" || entry.metadata?.transport)
      .map((entry) => ({ id: String(entry.metadata?.id || entry.localId || entry.id || ""), name: String(entry.name || entry.metadata?.name || ""), description: String(entry.description || entry.metadata?.description || "") }));
    return servers.map((entry) => typeof entry === "string" ? { id: entry, name: entry, description: "" } : entry).filter((entry) => entry.id);
  }

  resolveServerId(entry) {
    const source = this.fabric?.entries?.get?.(entry.id);
    return String(source?.metadata?.id || source?.localId || entry.metadata?.id || entry.localId || "");
  }
}

function sanitize(value) { return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64).toLowerCase(); }

module.exports = { CapabilityCatalog };
