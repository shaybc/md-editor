/** Canonical run-scoped discovery, activation, refresh, and recovery for rules. */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { companionProfilePath } = require("../profile-storage");
const { parseRuleDefinition } = require("./rule-definition-parser");
const { HierarchicalRuleSource } = require("./hierarchical-rule-source");
const { MarkdownRuleSource } = require("./markdown-rule-source");
const { matchesRule, normalizeWorkspacePath, patternSpecificity } = require("./rule-path-matcher");

const MAX_IMPORT_DEPTH = 5;
const MAX_IMPORTED_FILES = 20;
const MAX_IMPORTED_CHARACTERS = 262144;

class RuleCatalog {
  constructor(request, emit = () => {}) {
    this.request = request;
    this.emit = typeof emit === "function" ? emit : () => {};
    this.entries = new Map();
    this.active = new Map();
    this.diagnostics = new Map();
    this.observedPaths = new Set();
    this.injectedIds = new Set();
    this.pending = [];
    this.queue = Promise.resolve();
    this.hierarchical = new HierarchicalRuleSource(request.workspaceRoot);
    this.sources = [
      ...(request.profileRoot ? [new MarkdownRuleSource({
        scope: "user", root: companionProfilePath(request.profileRoot, "rules"),
        workspaceRoot: request.workspaceRoot, rank: 100
      })] : []),
      new MarkdownRuleSource({
        scope: "workspace", root: path.join(request.workspaceRoot, ".md-editor", "rules"),
        workspaceRoot: request.workspaceRoot, rank: 200
      })
    ];
  }

  setEmitter(emit) {
    this.emit = typeof emit === "function" ? emit : () => {};
  }

  /** Discover rule metadata and activate unconditional and initial-path rules. */
  async load(activePath = "") {
    await this.discoverStatic();
    await this.activateUnconditional("run-start");
    await this.activateForPaths([activePath || this.request.workspaceRoot], "active-file");
    this.emit({ type: "rules-discovered", count: this.entries.size, unavailable: this.diagnostics.size, summary: `${this.entries.size} rule definitions discovered.` });
    return this.snapshot();
  }

  /** Serialize path-triggered activation to avoid duplicates across parallel tools. */
  activateForPaths(paths, reason = "tool-path") {
    this.queue = this.queue.then(() => this.activatePaths(paths, reason));
    return this.queue;
  }

  async activatePaths(paths, reason) {
    const normalized = Array.from(new Set((Array.isArray(paths) ? paths : [paths])
      .map((candidate) => normalizeWorkspacePath(this.request.workspaceRoot, candidate))
      .filter(Boolean)));
    if (!normalized.length && reason !== "active-file") return [];
    normalized.forEach((candidate) => this.observedPaths.add(candidate));
    const hierarchicalPaths = normalized.length ? normalized : [""];
    for (const workspacePath of hierarchicalPaths) {
      const hierarchical = await this.hierarchical.discoverForPath(workspacePath);
      for (const candidate of hierarchical) {
        if (this.register(candidate)) await this.activateCandidate(candidate, reason, workspacePath);
      }
    }
    const activated = [];
    for (const candidate of this.entries.values()) {
      if (!candidate.definition?.conditional || this.active.has(candidate.id)) continue;
      const trigger = normalized.find((workspacePath) => matchesRule(candidate.definition, workspacePath));
      if (!trigger) continue;
      const value = await this.activateCandidate(candidate, reason, trigger);
      if (value) activated.push(value);
    }
    return activated;
  }

  /** Return newly activated instructions once for insertion before the next model call. */
  consumeActivated() {
    const result = this.pending.filter((entry) => !this.injectedIds.has(entry.id));
    result.forEach((entry) => this.injectedIds.add(entry.id));
    this.pending = [];
    return result.map(publicInstruction);
  }

  /** Return all current instructions in stable authority and specificity order. */
  activeInstructions(options = {}) {
    const values = Array.from(this.active.values()).sort(compareRules);
    if (options.markInjected === true) values.forEach((entry) => this.injectedIds.add(entry.id));
    return values.map(publicInstruction);
  }

  /** Rediscover definitions and reapply every observed path using current files. */
  async refresh() {
    const previous = new Map(Array.from(this.active, ([id, entry]) => [id, entry.fingerprint]));
    const paths = Array.from(this.observedPaths);
    this.entries.clear();
    this.active.clear();
    this.diagnostics.clear();
    this.pending = [];
    await this.discoverStatic();
    await this.activateUnconditional("context-renewal");
    await this.activateForPaths(paths.length ? paths : [this.request.workspaceRoot], "context-renewal");
    const changed = [];
    const missing = [];
    for (const [id, fingerprint] of previous) {
      const current = this.active.get(id);
      if (!current) missing.push(id);
      else if (current.fingerprint !== fingerprint) changed.push(id);
    }
    this.emit({ type: "rules-refreshed", active: this.active.size, changed, missing, summary: `${this.active.size} active rules refreshed from current files.` });
    return { changed, missing, active: this.activeInstructions() };
  }

  /** Re-evaluate persisted path references without trusting saved rule bodies. */
  async restore(snapshot = {}) {
    for (const candidate of Array.isArray(snapshot.observedPaths) ? snapshot.observedPaths : []) {
      const normalized = normalizeWorkspacePath(this.request.workspaceRoot, candidate);
      if (normalized) this.observedPaths.add(normalized);
    }
    if (this.observedPaths.size) await this.activateForPaths(Array.from(this.observedPaths), "restart-recovery");
    const saved = new Map(Array.isArray(snapshot.active) ? snapshot.active.map((entry) => [entry.id, entry.fingerprint]) : []);
    const changed = [];
    const missing = [];
    for (const [id, fingerprint] of saved) {
      const current = this.active.get(id);
      if (!current) missing.push(id);
      else if (current.fingerprint !== fingerprint) changed.push(id);
    }
    if (changed.length || missing.length) {
      this.emit({ type: "rule-unavailable", changed, missing, summary: "Saved rule state changed; current rule files are authoritative." });
    }
    return { changed, missing };
  }

  snapshot() {
    return {
      version: 1,
      observedPaths: Array.from(this.observedPaths),
      injectedIds: Array.from(this.injectedIds),
      active: Array.from(this.active.values(), (entry) => ({ id: entry.id, source: entry.source, fingerprint: entry.fingerprint, triggerPaths: entry.triggerPaths })),
      unavailable: Array.from(this.diagnostics.entries())
    };
  }

  async discoverStatic() {
    for (const source of this.sources) {
      for (const candidate of await source.discover()) this.register(candidate);
    }
  }

  register(candidate) {
    if (candidate.error) {
      this.recordUnavailable(candidate.id, candidate.source, candidate.error);
      return false;
    }
    const existing = this.entries.get(candidate.id);
    if (existing && path.resolve(existing.source) !== path.resolve(candidate.source)) {
      this.recordUnavailable(candidate.id, candidate.source, "Rule identity is ambiguous.");
      this.entries.delete(candidate.id);
      return false;
    }
    this.entries.set(candidate.id, candidate);
    return true;
  }

  async activateUnconditional(reason) {
    for (const candidate of this.entries.values()) {
      if (!candidate.definition?.conditional) await this.activateCandidate(candidate, reason, "");
    }
  }

  async activateCandidate(candidate, reason, triggerPath) {
    const existing = this.active.get(candidate.id);
    if (existing) {
      if (triggerPath && !existing.triggerPaths.includes(triggerPath)) existing.triggerPaths.push(triggerPath);
      return existing;
    }
    try {
      const loaded = await loadRule(candidate);
      if (!loaded.content.trim()) return null;
      const active = {
        ...candidate,
        content: loaded.content,
        fingerprint: hash(loaded.content),
        triggerPaths: triggerPath ? [triggerPath] : [],
        specificity: Math.max(0, ...(candidate.definition?.paths || []).map(patternSpecificity)),
        reason
      };
      this.active.set(candidate.id, active);
      this.pending.push(active);
      this.emit({ type: "rule-activated", id: active.id, source: active.source, scope: active.scope, reason, paths: active.triggerPaths, summary: `Rule activated from ${active.relativePath}.` });
      return active;
    } catch (error) {
      this.recordUnavailable(candidate.id, candidate.source, error?.message || String(error));
      return null;
    }
  }

  recordUnavailable(id, source, reason) {
    this.diagnostics.set(id, reason);
    this.emit({ type: "rule-unavailable", id, source, reason, summary: `Rule unavailable: ${reason}` });
  }
}

async function loadRule(candidate) {
  const source = candidate.prefetchedContent ?? await fs.readFile(candidate.source, "utf8");
  if (source.includes("\0")) throw new Error("Rule files must contain text, not binary data.");
  const definition = parseRuleDefinition(source, { source: candidate.source });
  const fragments = [{ source: candidate.source, body: definition.body }];
  const resolvedSource = path.resolve(candidate.source);
  const state = { visited: new Set([resolvedSource]), stack: new Set([resolvedSource]), count: 0, characters: definition.body.length };
  for (const imported of definition.imports) {
    await loadImport(path.resolve(path.dirname(candidate.source), imported), candidate.sourceRoot, fragments, state, 1);
  }
  return {
    content: fragments.filter((fragment) => fragment.body.trim()).map((fragment, index) =>
      index === 0 ? fragment.body : `Imported rule fragment from ${fragment.source}:\n${fragment.body}`
    ).join("\n\n")
  };
}

async function loadImport(filePath, sourceRoot, fragments, state, depth) {
  if (depth > MAX_IMPORT_DEPTH) throw new Error(`Rule imports exceed the maximum depth of ${MAX_IMPORT_DEPTH}.`);
  const root = path.resolve(sourceRoot);
  const resolved = path.resolve(filePath);
  const relative = path.relative(root, resolved);
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Rule import escapes its owning rule directory.");
  }
  if (state.stack.has(resolved)) throw new Error("Rule import cycle detected.");
  if (state.visited.has(resolved)) throw new Error("Duplicate rule import detected.");
  if (++state.count > MAX_IMPORTED_FILES) throw new Error(`Rule imports exceed the maximum of ${MAX_IMPORTED_FILES} files.`);
  state.visited.add(resolved);
  state.stack.add(resolved);
  const buffer = await fs.readFile(resolved);
  if (buffer.includes(0)) throw new Error("Rule imports must contain text, not binary data.");
  const source = buffer.toString("utf8");
  const definition = parseRuleDefinition(source, { source: resolved });
  state.characters += definition.body.length;
  if (state.characters > MAX_IMPORTED_CHARACTERS) throw new Error("Combined rule imports exceed the 262144 character limit.");
  fragments.push({ source: resolved, body: definition.body });
  for (const imported of definition.imports) {
    await loadImport(path.resolve(path.dirname(resolved), imported), root, fragments, state, depth + 1);
  }
  state.stack.delete(resolved);
}

function compareRules(left, right) {
  return instructionRank(left) - instructionRank(right) || left.specificity - right.specificity || left.source.localeCompare(right.source);
}

function instructionRank(entry) { return entry.definition?.conditional ? 400 + entry.rank : entry.rank; }

function publicInstruction(entry) {
  return {
    id: entry.id,
    source: entry.source,
    scope: entry.scope,
    content: entry.content,
    triggerPaths: entry.triggerPaths.slice(),
    fingerprint: entry.fingerprint
  };
}

function hash(value) { return crypto.createHash("sha256").update(String(value || "")).digest("hex"); }

module.exports = { RuleCatalog, loadImport, loadRule };
