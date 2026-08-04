/**
 * Request-local immutable storage for raw Agent tool artifacts.
 */

"use strict";

const crypto = require("node:crypto");

function defaultDigest(serialized) {
  return crypto.createHash("sha256").update(serialized, "utf8").digest("hex");
}

function serializeArtifactPayload(payload) {
  const serialized = JSON.stringify(payload);
  if (typeof serialized !== "string") throw new Error("Agent artifact payload is not JSON-serializable.");
  return serialized;
}

/**
 * Create one immutable artifact store whose lifetime matches an Agent request.
 * @param {{digest?: (serialized:string) => string}} [options] Optional deterministic digest implementation.
 * @returns {{put: Function, get: Function, readExcerpt: Function, size: Function}} Request-local artifact API.
 */
function createAgentArtifactStore(options = {}) {
  const digestValue = typeof options.digest === "function" ? options.digest : defaultDigest;
  const records = new Map();

  /** Store serialized bytes once and return their immutable content-addressed reference. */
  function put(payload, metadata = {}) {
    const serialized = serializeArtifactPayload(payload);
    const digest = String(digestValue(serialized) || "");
    if (!digest) throw new Error("Agent artifact digest is empty.");
    const id = `artifact:${digest}`;
    const existing = records.get(id);
    if (existing) {
      if (existing.serialized !== serialized) throw new Error(`Agent artifact identity collision for ${id}.`);
      return existing.reference;
    }
    const reference = Object.freeze({
      id,
      digest,
      kind: String(metadata.kind || "tool-result"),
      contentType: String(metadata.contentType || "application/json"),
      retention: "run",
      sizeChars: serialized.length,
      truncated: metadata.truncated === true
    });
    records.set(id, Object.freeze({ reference, serialized }));
    return reference;
  }

  /** Resolve an artifact reference without modifying the stored serialized bytes. */
  function get(reference) {
    const id = String(reference?.id || reference || "");
    const record = records.get(id);
    return record ? { reference: record.reference, serialized: record.serialized } : null;
  }

  /** Read a bounded text excerpt while retaining the original immutable artifact. */
  function readExcerpt(reference, maxChars = 12000) {
    const record = get(reference);
    if (!record) return null;
    const limit = Math.max(1, Number(maxChars) || 12000);
    return {
      text: record.serialized.slice(0, limit),
      truncated: record.serialized.length > limit,
      originalSizeChars: record.serialized.length
    };
  }

  return {
    put,
    get,
    readExcerpt,
    size: () => records.size
  };
}

module.exports = {
  createAgentArtifactStore,
  serializeArtifactPayload
};
