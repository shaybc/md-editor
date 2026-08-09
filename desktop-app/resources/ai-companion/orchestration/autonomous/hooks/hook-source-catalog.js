/** Loads lifecycle automation from profile, workspace, extensions, skills, and run requests. */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { companionProfilePath } = require("../profile-storage");
const { normalizeHookDefinition } = require("./hook-definition-policy");

class HookSourceCatalog {
  constructor(request, fabric) { this.request = request; this.fabric = fabric; this.definitions = []; this.errors = []; this.declarationOrder = 0; }

  /** Load every active source into one stable, validated catalog. */
  async load() {
    this.definitions = [];
    this.errors = [];
    this.declarationOrder = 0;
    const sources = [];
    for (const entry of Array.from(this.fabric?.entries?.values?.() || []).filter((candidate) => candidate.kind === "hook")) {
      sources.push({ entries: [entry], source: { scope: entry.scope || "extension", id: entry.id, trusted: true, fingerprint: fingerprint(entry.metadata) } });
    }
    if (this.request.profileRoot) sources.push(await readHookFile(companionProfilePath(this.request.profileRoot, "hooks", "hooks.json"), { scope: "profile", id: "profile-hooks", trusted: true }));
    if (this.request.workspaceRoot) {
      const trusted = this.request.settings?.trustWorkspaceHooks === true;
      sources.push(await readHookFile(path.join(this.request.workspaceRoot, ".md-editor", "companion", "hooks", "hooks.json"), { scope: "workspace", id: "workspace-hooks", trusted }));
    }
    sources.push({ entries: Array.isArray(this.request.settings?.lifecycleHooks) ? this.request.settings.lifecycleHooks : [], source: { scope: "settings", id: "profile-settings-hooks", trusted: true, fingerprint: fingerprint(this.request.settings?.lifecycleHooks || []) } });
    sources.push({ entries: Array.isArray(this.request.hooks) ? this.request.hooks : [], source: { scope: "run", id: "request-hooks", trusted: this.request.hooksTrusted === true, fingerprint: fingerprint(this.request.hooks || []) } });
    for (const group of sources) this.addGroup(group);
    this.definitions.sort((left, right) => right.priority - left.priority || left.declarationOrder - right.declarationOrder);
    return this.snapshot();
  }

  /** Register definitions activated during a run, such as skill-owned hooks. */
  register(entries, source = {}) {
    this.addGroup({ entries: Array.from(entries || []), source: { scope: "runtime", trusted: true, ...source } });
    return this.snapshot();
  }

  addGroup(group) {
    if (group?.error) this.errors.push({ source: group?.source?.id || "unknown", error: group.error });
    for (const raw of group?.entries || []) {
      try {
        for (const entry of expandSettingsShape(raw)) this.definitions.push({ ...normalizeHookDefinition(entry, group.source), declarationOrder: this.declarationOrder++ });
      } catch (error) { this.errors.push({ source: group?.source?.id || "unknown", error: error?.message || String(error) }); }
    }
  }

  snapshot() { return { version: 2, definitions: this.definitions.map((entry) => JSON.parse(JSON.stringify(entry))), errors: this.errors.slice() }; }
}

async function readHookFile(filePath, source) {
  try {
    const value = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (source.scope === "workspace" && source.trusted !== true) return { entries: [], source, error: `Workspace hooks require trust: ${filePath}` };
    const entries = Array.isArray(value) ? value : (Array.isArray(value.hooks) ? value.hooks : [value]);
    return { entries, source: { ...source, fingerprint: fingerprint(value), filePath } };
  } catch (error) {
    if (error?.code === "ENOENT") return { entries: [], source };
    return { entries: [], source, error: error?.message || String(error) };
  }
}

function expandSettingsShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.event || value.metadata) return [value];
  const expanded = [];
  for (const [event, matchers] of Object.entries(value)) {
    if (["version", "enabled"].includes(event) || !Array.isArray(matchers)) continue;
    for (const [matcherIndex, matcher] of matchers.entries()) {
      for (const [actionIndex, action] of (Array.isArray(matcher?.hooks) ? matcher.hooks : []).entries()) {
        expanded.push({ id: `${event}-${matcherIndex + 1}-${actionIndex + 1}`, event, matcher: typeof matcher.matcher === "string" ? { tool: matcher.matcher } : matcher.matcher, action });
      }
    }
  }
  return expanded.length ? expanded : [value];
}

function fingerprint(value) { return crypto.createHash("sha256").update(JSON.stringify(value || null)).digest("hex"); }

module.exports = { HookSourceCatalog, expandSettingsShape, readHookFile };
