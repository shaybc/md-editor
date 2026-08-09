/** Adapts programmatically injected agent definitions into canonical catalog candidates. */

"use strict";

const crypto = require("node:crypto");

class RunAgentSource {
  constructor(request) { this.request = request; }

  /** Return metadata-only candidates whose bodies remain lazy until activation. */
  async discover() {
    const entries = [];
    const errors = [];
    for (const [index, value] of (Array.isArray(this.request.agents) ? this.request.agents : []).entries()) {
      try {
        const metadata = agentMetadata(value);
        const logicalId = String(metadata?.id || value?.id || "").trim();
        if (!logicalId) throw new Error("An injected agent requires an id.");
        const sourceIdentity = `request-agent:${logicalId}`;
        entries.push({
          logicalId,
          name: String(metadata.name || logicalId),
          description: String(metadata.description || "Run-scoped agent definition."),
          metadata,
          metadataFingerprint: fingerprint(metadata),
          source: "run-agent",
          sourcePriority: 250,
          sourceIdentity,
          aliases: [sourceIdentity],
          activate: async () => ({ metadata, body: String(value.body || value.content || ""), sourceIdentity })
        });
      } catch (error) { errors.push({ source: "run-agent", index, error: error?.message || String(error) }); }
    }
    return { entries, errors };
  }
}

function fingerprint(value) { return crypto.createHash("sha256").update(JSON.stringify(value || null)).digest("hex"); }
function agentMetadata(value) {
  if (value?.metadata && typeof value.metadata === "object") return value.metadata;
  const { body: _body, content: _content, ...metadata } = value || {};
  return metadata;
}

module.exports = { RunAgentSource };
