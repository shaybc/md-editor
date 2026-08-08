/** Run-scoped discovery, eligibility, lazy loading, and recovery for skills. */

"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { matchesRule, normalizeWorkspacePath } = require("../rules/rule-path-matcher");
const { SkillDefinitionPolicy } = require("./skill-definition-policy");
const { SkillSourceLoader } = require("./skill-source-loader");

const MAX_LISTING_CHARACTERS = 8000;
const MAX_DESCRIPTION_CHARACTERS = 250;

class SkillCatalog {
  constructor(request, options = {}) {
    this.request = request;
    this.fabric = options.fabric;
    this.capabilities = options.capabilities;
    this.agentCatalog = options.agentCatalog;
    this.emit = typeof options.emit === "function" ? options.emit : () => {};
    this.sourceLoader = new SkillSourceLoader(request);
    this.entries = new Map();
    this.byName = new Map();
    this.aliases = new Map();
    this.ambiguousNames = new Set();
    this.diagnostics = new Map();
    this.observedPaths = new Set();
    this.invoked = new Map();
    this.pendingInstructions = [];
    this.pendingDiscoveries = [];
    this.queue = Promise.resolve();
  }

  setEmitter(emit) { this.emit = typeof emit === "function" ? emit : () => {}; }

  /** Discover all initial sources and activate active-file conditional skills. */
  async load(activePath = "") {
    for (const entry of await this.sourceLoader.discoverInitial()) this.register(entry);
    for (const entry of this.fabric?.entries?.values?.() || []) if (entry.kind === "skill") this.register(fabricEntry(entry, this.fabric));
    for (const [index, value] of (Array.isArray(this.request.skills) ? this.request.skills : []).entries()) this.register(injectedEntry(value, index));
    this.activateUnconditional();
    if (activePath) await this.activateForPaths([activePath], "active-file");
    for (const entry of this.entries.values()) {
      if (!entry.active) continue;
      const availability = this.isAvailable(entry, { model: true });
      if (!availability.available) this.recordUnavailable(entry.id, entry.source, availability.reason);
    }
    this.emit({ type: "skills-discovered", count: this.entries.size, eligible: this.list({ model: true }).length, unavailable: this.diagnostics.size, skills: this.list({ user: true }), summary: `${this.entries.size} workflow skills discovered.` });
    return this.snapshot();
  }

  /** Register one candidate while applying deterministic source precedence. */
  register(candidate) {
    if (candidate.error) return this.recordUnavailable(candidate.id, candidate.source, candidate.error);
    const validation = SkillDefinitionPolicy.validate(candidate.metadata);
    if (!validation.valid) return this.recordUnavailable(candidate.id, candidate.source, validation.errors.join(" "));
    const entry = { ...candidate, trusted: candidate.trusted !== false, definition: validation.value, active: validation.value.paths.length === 0, fingerprint: fingerprint(validation.value) };
    this.entries.set(entry.id, entry);
    this.indexName(entry.definition.name, entry);
    for (const alias of entry.definition.aliases) this.indexAlias(alias, entry);
    return true;
  }

  /** Return bounded metadata for skills eligible in the current run. */
  list(options = {}) {
    return Array.from(this.byName.values())
      .filter((entry) => entry.active && this.isAvailable(entry, options).available)
      .sort((left, right) => Number(right.rank === 100) - Number(left.rank === 100) || left.definition.name.localeCompare(right.definition.name))
      .map(publicMetadata);
  }

  /** Build a token-conscious model advertisement without loading bodies. */
  advertisement() {
    const entries = this.list({ model: true });
    if (!entries.length) return "No workflow skills are currently available.";
    const contextWindow = Number(this.request.modelLimits?.contextWindow) || 0;
    const budget = Math.max(500, Math.min(MAX_LISTING_CHARACTERS, contextWindow ? Math.floor(contextWindow * 4 * 0.01) : MAX_LISTING_CHARACTERS));
    const lines = [];
    let used = 0;
    for (const entry of entries) {
      const guidance = [entry.description, entry.usage, entry.triggers.length ? `Use for: ${entry.triggers.join(", ")}.` : ""].filter(Boolean).join(" ");
      const suffix = guidance.length > MAX_DESCRIPTION_CHARACTERS ? guidance.slice(0, MAX_DESCRIPTION_CHARACTERS - 1) + "…" : guidance;
      const line = `- ${entry.name}${entry.argumentHint ? ` ${entry.argumentHint}` : ""}: ${suffix}`;
      if (used + line.length + 1 > budget) break;
      lines.push(line);
      used += line.length + 1;
    }
    return lines.length ? `Available workflow skills (invoke with skill_invoke only when relevant):\n${lines.join("\n")}` : "Workflow skills exist but their metadata exceeded the current listing budget.";
  }

  /** Resolve one exact canonical name or unambiguous alias. */
  resolve(name, options = {}) {
    const key = String(name || "").trim().toLowerCase().replace(/^\//, "");
    if (!key) return null;
    const explicit = this.entries.get(key);
    if (explicit) return explicit.active && this.isAvailable(explicit, options).available ? explicit : null;
    if (this.ambiguousNames.has(key)) return null;
    const entry = this.byName.get(key) || this.aliases.get(key);
    return entry?.active && this.isAvailable(entry, options).available ? entry : null;
  }

  /** Lazily load one currently eligible skill body. */
  async invoke(name, options = {}) {
    const entry = this.resolve(name, options);
    if (!entry) {
      const error = new Error(`Workflow skill '${name}' is unavailable in the current mode or capability scope.`);
      error.code = "SKILL_UNAVAILABLE";
      throw error;
    }
    const loaded = await entry.load(options.arguments);
    const body = String(loaded.body || loaded.content || "").trim();
    if (!body) throw new Error(`Workflow skill '${entry.definition.name}' has no instructions.`);
    const active = { ...entry, body, contentFingerprint: fingerprint(body), trigger: options.trigger || "model" };
    this.invoked.set(entry.definition.name, active);
    if (options.inject !== false) this.pendingInstructions.push(active);
    this.emit({ type: "skill-invocation-started", id: entry.id, name: entry.definition.name, source: entry.source, trigger: active.trigger, summary: `Workflow ${entry.definition.name} activated.` });
    return active;
  }

  /** Return newly invoked bodies once for insertion before the next model call. */
  consumeActivated() {
    const values = this.pendingInstructions.splice(0);
    return values.map(publicInstruction);
  }

  /** Return metadata for newly path-eligible skills without their bodies. */
  consumeDiscoveries() { return this.pendingDiscoveries.splice(0).map(publicMetadata); }

  /** Return all invoked bodies for compaction re-anchoring. */
  activeInstructions() { return Array.from(this.invoked.values()).map(publicInstruction); }

  /** Add approved external prompt offerings as lazy workflow skills. */
  registerExternalPrompts(serverId, prompts, manager) {
    const activated = [];
    for (const prompt of Array.isArray(prompts) ? prompts : []) {
      const remoteName = String(prompt.name || "").trim();
      const command = `external:${String(serverId || "").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()}:${remoteName.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()}`;
      const registered = this.register({
        id: `skill:external:${serverId}:${remoteName}`, scope: "external", rank: 150, source: `external:${serverId}`, trusted: true,
        metadata: {
          id: command, name: String(prompt.title || remoteName), description: String(prompt.description || `External workflow ${remoteName}.`),
          arguments: Object.keys(prompt.arguments || prompt.inputSchema?.properties || {}), allowedModes: ["chat", "plan", "agent"]
        },
        load: async (argumentsValue) => {
          const result = await manager.getPrompt(serverId, remoteName, externalArguments(argumentsValue));
          return { body: extractExternalPrompt(result) };
        }
      });
      if (registered) {
        const entry = this.byName.get(command);
        if (entry) {
          entry.active = true;
          this.pendingDiscoveries.push(entry);
          activated.push(command);
        }
      }
    }
    return activated;
  }

  /** Discover nested roots and make matching conditional skills eligible. */
  activateForPaths(paths, reason = "tool-path") {
    const operation = () => this.activatePaths(paths, reason);
    this.queue = this.queue.then(operation, operation);
    return this.queue;
  }

  async activatePaths(paths, reason) {
    const normalized = Array.from(new Set((Array.isArray(paths) ? paths : [paths]).map((candidate) => normalizeWorkspacePath(this.request.workspaceRoot, candidate)).filter(Boolean)));
    normalized.forEach((candidate) => this.observedPaths.add(candidate));
    for (const entry of await this.sourceLoader.discoverForPaths(normalized)) this.register(entry);
    const activated = [];
    for (const entry of this.entries.values()) {
      if (entry.active || !entry.definition.paths.length) continue;
      const triggerPath = normalized.find((candidate) => matchesRule({ paths: entry.definition.paths, exclude: entry.definition.exclude }, candidate));
      if (!triggerPath) continue;
      entry.active = true;
      entry.triggerPaths = [triggerPath];
      this.pendingDiscoveries.push(entry);
      activated.push(entry.definition.name);
      this.emit({ type: "skills-changed", name: entry.definition.name, reason, paths: entry.triggerPaths, summary: `Workflow ${entry.definition.name} is now available.` });
    }
    return activated;
  }

  /** Rediscover current definitions while preserving path and invocation references. */
  async refresh() {
    const saved = this.snapshot();
    this.sourceLoader.resetNestedDiscovery();
    this.entries.clear(); this.byName.clear(); this.aliases.clear(); this.ambiguousNames.clear(); this.diagnostics.clear(); this.invoked.clear(); this.pendingInstructions = []; this.pendingDiscoveries = [];
    await this.load();
    const reconciliation = await this.restore(saved);
    this.emit({ type: "skills-changed", reason: "context-renewal", ...reconciliation, summary: "Workflow skill definitions refreshed." });
    return reconciliation;
  }

  /** Restore references by reloading current definitions and bodies. */
  async restore(snapshot = {}) {
    if (Array.isArray(snapshot.observedPaths) && snapshot.observedPaths.length) await this.activateForPaths(snapshot.observedPaths, "restart-recovery");
    const changed = [];
    const missing = [];
    for (const saved of Array.isArray(snapshot.invoked) ? snapshot.invoked : []) {
      const entry = this.resolve(saved.name, { model: true }) || this.resolve(saved.name, { user: true });
      if (!entry) { missing.push(saved.name); continue; }
      const active = await this.invoke(saved.name, { trigger: "restart-recovery" });
      if (saved.contentFingerprint && saved.contentFingerprint !== active.contentFingerprint) changed.push(saved.name);
    }
    if (changed.length || missing.length) this.emit({ type: "skill-unavailable", changed, missing, summary: "Saved workflow definitions changed; current definitions are authoritative." });
    return { changed, missing };
  }

  snapshot() {
    return {
      version: 1,
      observedPaths: Array.from(this.observedPaths),
      invoked: Array.from(this.invoked.values(), (entry) => ({ name: entry.definition.name, id: entry.id, source: entry.source, contentFingerprint: entry.contentFingerprint })),
      unavailable: Array.from(this.diagnostics.entries())
    };
  }

  isAvailable(entry, options = {}) {
    const toolNames = new Set(this.capabilities?.registrations?.().map((record) => record.name) || []);
    const modelNames = new Set([this.request.settings?.model, ...(Array.isArray(this.request.configuredModels) ? this.request.configuredModels : [])].filter(Boolean).map(String));
    const availability = SkillDefinitionPolicy.availability(entry.definition, { mode: this.request.action, toolNames, modelNames, trusted: entry.trusted, ...options });
    if (!availability.available) return availability;
    if (entry.definition.agent && !this.agentCatalog?.has?.(entry.definition.agent)) return { available: false, reason: `Required agent is unavailable: ${entry.definition.agent}.` };
    return availability;
  }

  activateUnconditional() { for (const entry of this.entries.values()) if (!entry.definition.paths.length) entry.active = true; }

  indexName(name, entry) {
    const existing = this.byName.get(name);
    if (!existing || existing.rank < entry.rank) this.byName.set(name, entry);
    else if (existing.rank === entry.rank && existing.id !== entry.id) { this.byName.delete(name); this.ambiguousNames.add(name); this.recordUnavailable(entry.id, entry.source, `Ambiguous workflow name: ${name}.`); }
  }

  indexAlias(alias, entry) {
    const existing = this.aliases.get(alias) || this.byName.get(alias);
    if (!existing || existing.rank < entry.rank) this.aliases.set(alias, entry);
    else if (existing.id !== entry.id && existing.rank === entry.rank) { this.aliases.delete(alias); this.ambiguousNames.add(alias); }
  }

  recordUnavailable(id, source, reason) {
    this.diagnostics.set(id, reason);
    this.emit({ type: "skill-unavailable", id, source, reason, summary: `Workflow unavailable: ${reason}` });
    return false;
  }
}

function fabricEntry(entry, fabric) {
  return { id: entry.id, scope: entry.scope || "bundle", rank: 100, source: entry.filePath, metadata: entry.metadata, load: () => fabric.activate(entry.id) };
}

function injectedEntry(value, index) {
  const metadata = value.metadata && typeof value.metadata === "object" ? value.metadata : value;
  const id = String(value.id || metadata.id || `injected-${index + 1}`);
  return { id: `skill:injected:${id}`, scope: "injected", rank: 250, source: `request:${id}`, trusted: value.trusted !== false, metadata, load: async () => ({ body: String(value.body || value.content || "") }) };
}

function publicMetadata(entry) {
  return { id: entry.id, name: entry.definition.name, displayName: entry.definition.displayName, description: entry.definition.description, usage: entry.definition.usage, triggers: entry.definition.triggers.slice(), argumentHint: entry.definition.argumentHint, allowedModes: entry.definition.allowedModes.slice(), source: entry.source, scope: entry.scope, triggerPaths: (entry.triggerPaths || []).slice() };
}

function publicInstruction(entry) {
  return { ...publicMetadata(entry), body: entry.body, allowedTools: entry.definition.allowedTools.slice(), allowedCapabilities: entry.definition.allowedCapabilities.slice(), model: entry.definition.model, agent: entry.definition.agent, executionContext: entry.definition.executionContext, contentFingerprint: entry.contentFingerprint };
}

function fingerprint(value) { return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value || null)).digest("hex"); }

function extractExternalPrompt(result) {
  const messages = Array.isArray(result?.messages) ? result.messages : [];
  const text = messages.flatMap((message) => Array.isArray(message.content) ? message.content : [message.content])
    .map((content) => typeof content === "string" ? content : content?.text).filter(Boolean).join("\n\n");
  return text || String(result?.description || "Follow the selected external workflow.");
}

function externalArguments(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const result = {};
  const expression = /--([a-zA-Z0-9_-]+)(?:=|\s+)("[^"]*"|'[^']*'|[^\s]+)/g;
  for (const match of String(value || "").matchAll(expression)) result[match[1]] = match[2].replace(/^("|')|("|')$/g, "");
  return result;
}

module.exports = { MAX_LISTING_CHARACTERS, SkillCatalog, fingerprint, publicInstruction, publicMetadata };
