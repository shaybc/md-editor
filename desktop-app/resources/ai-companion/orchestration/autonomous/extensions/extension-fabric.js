/** Coordinates extension discovery, trust, metadata, and lazy content loading. */

"use strict";

const fs = require("node:fs/promises");
const { discoverBundles } = require("./bundle-discovery");
const { isExtensionEnabled, isExtensionTrusted, loadExtensionState, updateExtensionState } = require("./extension-state-store");
const { parseMarkdownDefinition } = require("./markdown-definition");
const { AgentDefinitionPolicy } = require("../agents/agent-definition-policy");

class ExtensionFabric {
  constructor(request) { this.request = request; this.bundles = []; this.errors = []; this.entries = new Map(); }

  /** Discover bundles and expose metadata only for enabled, trusted contributions. */
  async load() {
    const discovered = await discoverBundles(this.request);
    const state = await loadExtensionState(this.request.profileRoot);
    this.errors = discovered.errors;
    this.bundles = discovered.bundles.map((bundle) => ({
      ...bundle,
      enabled: isExtensionEnabled(state, bundle),
      trusted: isExtensionTrusted(state, this.request.workspaceRoot, bundle)
    }));
    this.entries.clear();
    for (const bundle of this.bundles.filter((candidate) => candidate.enabled && candidate.trusted)) {
      for (const entry of bundle.contributions) {
        const id = `${bundle.id}:${entry.id}`;
        if (entry.kind === "agent") {
          const validation = AgentDefinitionPolicy.validate(entry.metadata);
          if (!validation.valid) {
            this.errors.push({ id, error: `Invalid agent definition: ${validation.errors.join(" ")}` });
            continue;
          }
        }
        if (this.entries.has(id)) this.errors.push({ id, error: `Duplicate contribution id: ${id}` });
        else this.entries.set(id, { ...entry, id, localId: entry.id, extensionId: bundle.id, scope: bundle.scope });
      }
    }
    return this.snapshot();
  }

  /** Return redacted extension metadata suitable for UI and model discovery. */
  snapshot() {
    return {
      bundles: this.bundles.map(({ contributions, root, manifestPath, ...bundle }) => ({ ...bundle, contributionCount: contributions.length })),
      entries: Array.from(this.entries.values(), ({ filePath, bundleRoot, metadata, ...entry }) => ({ ...entry, metadata: redactMetadata(metadata) })),
      errors: this.errors.slice()
    };
  }

  /** Load complete Markdown instructions only after explicit activation. */
  async activate(id) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown or unavailable extension contribution: ${id}`);
    if (entry.kind !== "skill" && entry.kind !== "agent") return { ...entry, metadata: redactMetadata(entry.metadata) };
    const parsed = parseMarkdownDefinition(await fs.readFile(entry.filePath, "utf8"), { source: entry.filePath });
    if (entry.kind === "agent") {
      const validation = AgentDefinitionPolicy.validate(parsed.metadata);
      if (!validation.valid) throw new Error(`Invalid agent definition '${id}': ${validation.errors.join(" ")}`);
    }
    return { ...entry, metadata: parsed.metadata, body: parsed.body };
  }

  /** Persist an enable/trust decision and rebuild the active index. */
  async configure(change) {
    const bundle = this.bundles.find((candidate) => candidate.id === change.id);
    if (!bundle) throw new Error(`Unknown extension: ${change.id}`);
    await updateExtensionState(this.request.profileRoot, this.request.workspaceRoot, { ...change, digest: bundle.digest });
    return this.load();
  }
}

function redactMetadata(value) {
  const copy = JSON.parse(JSON.stringify(value || {}));
  for (const key of Object.keys(copy)) if (/authorization|token|secret|api.?key|password/i.test(key)) copy[key] = "[redacted]";
  return copy;
}

module.exports = { ExtensionFabric, redactMetadata };
