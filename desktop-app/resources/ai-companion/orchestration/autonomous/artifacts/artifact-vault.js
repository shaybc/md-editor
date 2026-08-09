/** Durable storage for large observations removed from the active model window. */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { getRunIdentity } = require("../work/run-identity");
const { companionProfilePath } = require("../profile-storage");

class ArtifactVault {
  constructor(request, emit = () => {}) {
    this.emit = emit;
    this.sequence = 0;
    this.entries = new Map();
    this.directory = companionProfilePath(request.profileRoot, "autonomous-runs", getRunIdentity(request), "artifacts");
  }

  /** Load persisted artifact metadata without loading artifact bodies. */
  async load() {
    if (!this.directory) return this.snapshot();
    try {
      const names = await fs.readdir(this.directory);
      for (const name of names.filter((candidate) => candidate.endsWith(".meta.json"))) {
        const entry = JSON.parse(await fs.readFile(path.join(this.directory, name), "utf8"));
        this.entries.set(entry.id, entry);
        this.sequence = Math.max(this.sequence, Number(String(entry.id).replace(/^artifact-/, "")) || 0);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return this.snapshot();
  }

  /** Store one raw observation and return its compact reference metadata. */
  async store(content, metadata = {}) {
    const body = typeof content === "string" ? content : JSON.stringify(content);
    const digest = crypto.createHash("sha256").update(body).digest("hex");
    const existing = Array.from(this.entries.values()).find((entry) => entry.digest === digest);
    if (existing) return existing;
    const id = `artifact-${++this.sequence}`;
    const entry = {
      id,
      tool: String(metadata.tool || "observation"),
      callId: String(metadata.callId || ""),
      bytes: Buffer.byteLength(body, "utf8"),
      digest,
      createdAt: new Date().toISOString(),
      preview: body.slice(0, 600)
    };
    this.entries.set(id, entry);
    if (this.directory) {
      await fs.mkdir(this.directory, { recursive: true });
      await atomicWrite(path.join(this.directory, `${id}.txt`), body);
      await atomicWrite(path.join(this.directory, `${id}.meta.json`), `${JSON.stringify(entry, null, 2)}\n`);
    } else {
      entry.body = body;
    }
    this.emit({ type: "artifact-stored", artifact: entry });
    return entry;
  }

  /** Read a bounded range from one stored artifact. */
  async read(id, options = {}) {
    const entry = this.entries.get(String(id || ""));
    if (!entry) throw new Error(`Unknown artifact: ${id}`);
    const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
    const length = Math.max(1, Math.min(Math.floor(Number(options.length) || 16000), 64000));
    const body = entry.body !== undefined
      ? entry.body
      : await fs.readFile(path.join(this.directory, `${entry.id}.txt`), "utf8");
    return { ...entry, offset, content: body.slice(offset, offset + length), hasMore: offset + length < body.length };
  }

  /** Format a provider-safe reference marker for collapsed content. */
  reference(entry) {
    return `[Observation stored as ${entry.id}; tool=${entry.tool}; bytes=${entry.bytes}; digest=${entry.digest.slice(0, 12)}. Use artifact_read to retrieve it.]\nPreview: ${entry.preview}`;
  }

  /** Return serializable metadata without raw artifact bodies. */
  snapshot() {
    return Array.from(this.entries.values(), ({ body, ...entry }) => ({ ...entry }));
  }
}

async function atomicWrite(target, content) {
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, content, "utf8");
  await fs.rename(temporary, target);
}

module.exports = { ArtifactVault };
