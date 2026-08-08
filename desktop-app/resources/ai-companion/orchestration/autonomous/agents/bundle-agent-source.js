/** Adapts enabled and trusted bundle agents into canonical catalog candidates. */

"use strict";

const crypto = require("node:crypto");

const SOURCE_PRIORITIES = Object.freeze({ workspace: 200, user: 150, bundled: 100 });

class BundleAgentSource {
  constructor(fabric) { this.fabric = fabric; }

  /** Return metadata-only candidates from the already validated extension fabric. */
  async discover() {
    const entries = Array.from(this.fabric.entries.values())
      .filter((entry) => entry.kind === "agent")
      .map((entry) => ({
        logicalId: String(entry.localId || entry.metadata?.id || ""),
        name: String(entry.name || entry.metadata?.name || ""),
        description: String(entry.description || entry.metadata?.description || ""),
        metadata: entry.metadata,
        metadataFingerprint: fingerprint(entry.metadata),
        source: `${entry.scope || "bundled"}-bundle-agent`,
        sourcePriority: SOURCE_PRIORITIES[entry.scope] || SOURCE_PRIORITIES.bundled,
        sourceIdentity: entry.id,
        aliases: [entry.id],
        activate: () => this.fabric.activate(entry.id)
      }));
    return { entries, errors: [] };
  }
}

function fingerprint(value) { return crypto.createHash("sha256").update(JSON.stringify(value || null)).digest("hex"); }

module.exports = { BundleAgentSource };
