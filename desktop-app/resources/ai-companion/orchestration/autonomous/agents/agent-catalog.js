/** Canonical metadata, precedence, activation, and lookup for autonomous agents. */

"use strict";

const crypto = require("node:crypto");
const { AgentDefinitionPolicy } = require("./agent-definition-policy");

class AgentCatalog {
  constructor(request, sources = []) {
    this.request = request;
    this.sources = sources;
    this.entries = new Map();
    this.aliases = new Map();
    this.unavailable = new Map();
    this.errors = [];
    this.shadowed = [];
  }

  /** Load every source and select one active definition for each logical ID. */
  async load() {
    this.entries.clear();
    this.aliases.clear();
    this.unavailable.clear();
    this.errors = [];
    this.shadowed = [];
    const candidates = [];
    for (const source of this.sources) {
      try {
        const discovered = await source.discover();
        candidates.push(...(discovered.entries || []));
        this.errors.push(...(discovered.errors || []));
      } catch (error) {
        this.errors.push({ source: source.constructor?.name || "agent-source", error: error?.message || String(error) });
      }
    }
    for (const candidate of candidates) this.validateCandidate(candidate);
    for (const [logicalId, group] of groupCandidates(candidates).entries()) this.selectWinner(logicalId, group);
    return this.snapshot();
  }

  /** Return bounded active metadata without loading instruction bodies. */
  list() { return Array.from(this.entries.values(), publicEntry); }

  /** Return whether an ID or compatibility alias currently resolves. */
  has(id) { try { this.resolve(id); return true; } catch (_error) { return false; } }

  /** Return whether an ID belongs to the catalog, including ambiguous aliases. */
  owns(id) { const key = String(id || "").trim(); return this.entries.has(key) || this.aliases.has(key) || this.unavailable.has(key); }

  /** Resolve one active metadata entry without loading its instructions. */
  resolve(id) {
    const requested = String(id || "").trim();
    const unavailable = this.unavailable.get(requested);
    if (unavailable) throw catalogError(unavailable.message, unavailable.code);
    const logicalId = this.entries.has(requested) ? requested : this.aliases.get(requested);
    if (logicalId === null) throw catalogError(`Agent alias '${requested}' is ambiguous.`, "AGENT_ALIAS_AMBIGUOUS");
    const entry = this.entries.get(logicalId);
    if (!entry) throw catalogError(`Unknown or unavailable agent definition: ${requested}`, "AGENT_NOT_FOUND");
    return entry;
  }

  /** Load and revalidate one selected agent's complete instruction body. */
  async activate(id) {
    const entry = this.resolve(id);
    const loaded = await entry.activate();
    const validation = AgentDefinitionPolicy.validate(loaded.metadata);
    if (!validation.valid) throw catalogError(`Invalid agent definition '${entry.logicalId}': ${validation.errors.join(" ")}`, "AGENT_DEFINITION_INVALID");
    if (validation.value.id !== entry.logicalId) throw catalogError(`Agent '${entry.logicalId}' changed its logical identifier.`, "AGENT_DEFINITION_CHANGED");
    const currentFingerprint = fingerprint(loaded.metadata);
    if (currentFingerprint !== entry.metadataFingerprint) throw catalogError(`Agent '${entry.logicalId}' changed after discovery. Reload the agent catalog before launching it.`, "AGENT_DEFINITION_CHANGED");
    const mode = String(this.request.action || "");
    if (mode && validation.value.allowedModes.length && !validation.value.allowedModes.includes(mode)) throw catalogError(`Agent '${entry.logicalId}' is not available in ${mode} mode.`, "AGENT_MODE_NOT_ALLOWED");
    return {
      id: entry.logicalId,
      localId: entry.logicalId,
      kind: "agent",
      name: entry.name,
      description: entry.description,
      metadata: validation.value,
      body: String(loaded.body || ""),
      source: entry.source,
      sourceIdentity: entry.sourceIdentity,
      metadataFingerprint: entry.metadataFingerprint
    };
  }

  /** Return serializable metadata, diagnostics, and shadowing state. */
  snapshot() { return { entries: this.list(), errors: this.errors.slice(), shadowed: this.shadowed.slice(), fingerprint: this.fingerprint() }; }

  /** Fingerprint active identities and metadata for recovery compatibility notices. */
  fingerprint() { return fingerprint(this.list().map((entry) => ({ id: entry.id, sourceIdentity: entry.sourceIdentity, metadataFingerprint: entry.metadataFingerprint }))); }

  validateCandidate(candidate) {
    const validation = AgentDefinitionPolicy.validate(candidate.metadata);
    if (!validation.valid || validation.value.id !== candidate.logicalId) {
      candidate.invalid = true;
      this.errors.push({ id: candidate.logicalId, sourceIdentity: candidate.sourceIdentity, error: validation.valid ? "Agent metadata identifier does not match its source identifier." : validation.errors.join(" ") });
      return;
    }
    const mode = String(this.request.action || "");
    if (mode && validation.value.allowedModes.length && !validation.value.allowedModes.includes(mode)) candidate.unavailableMode = mode;
  }

  selectWinner(logicalId, candidates) {
    const eligible = candidates.filter((candidate) => !candidate.invalid && !candidate.unavailableMode).sort((left, right) => right.sourcePriority - left.sourcePriority);
    if (!eligible.length) {
      for (const candidate of candidates) {
        const code = candidate.invalid ? "AGENT_DEFINITION_INVALID" : "AGENT_MODE_NOT_ALLOWED";
        const message = candidate.invalid
          ? `Agent definition '${logicalId}' is invalid and unavailable.`
          : `Agent '${logicalId}' is not available in ${candidate.unavailableMode} mode.`;
        this.registerUnavailable(logicalId, code, message);
        this.registerUnavailable(candidate.sourceIdentity, code, message);
        for (const alias of candidate.aliases || []) this.registerUnavailable(alias, code, message);
      }
      return;
    }
    const highest = eligible[0].sourcePriority;
    const tied = eligible.filter((candidate) => candidate.sourcePriority === highest);
    if (tied.length > 1) {
      this.errors.push({ id: logicalId, error: `Multiple agent definitions have equal precedence: ${tied.map((entry) => entry.sourceIdentity).join(", ")}` });
      this.registerAlias(logicalId, null);
      for (const candidate of candidates) this.registerAlias(candidate.sourceIdentity, null);
      return;
    }
    const winner = eligible[0];
    this.entries.set(logicalId, winner);
    this.registerAlias(logicalId, logicalId);
    for (const candidate of candidates) {
      this.registerAlias(candidate.sourceIdentity, logicalId);
      for (const alias of candidate.aliases || []) this.registerAlias(alias, logicalId);
      if (candidate !== winner) this.shadowed.push({ id: logicalId, sourceIdentity: candidate.sourceIdentity, selectedSourceIdentity: winner.sourceIdentity });
    }
  }

  registerAlias(alias, logicalId) {
    const key = String(alias || "").trim();
    if (!key) return;
    if (this.aliases.has(key) && this.aliases.get(key) !== logicalId) this.aliases.set(key, null);
    else this.aliases.set(key, logicalId);
  }

  registerUnavailable(id, code, message) {
    const key = String(id || "").trim();
    if (key) this.unavailable.set(key, { code, message });
  }
}

function groupCandidates(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    const id = String(candidate.logicalId || "");
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(candidate);
  }
  return groups;
}

function publicEntry(entry) {
  return { id: entry.logicalId, kind: "agent", name: entry.name, description: entry.description, source: entry.source, sourceIdentity: entry.sourceIdentity, metadata: redactMetadata(entry.metadata), metadataFingerprint: entry.metadataFingerprint };
}

function fingerprint(value) { return crypto.createHash("sha256").update(JSON.stringify(value || null)).digest("hex"); }
function catalogError(message, code) { const error = new Error(message); error.code = code; error.retryable = false; error.doNotRetry = true; return error; }
function redactMetadata(value) { const copy = JSON.parse(JSON.stringify(value || {})); for (const key of Object.keys(copy)) if (/authorization|token|secret|api.?key|password/i.test(key)) copy[key] = "[redacted]"; return copy; }

module.exports = { AgentCatalog };
