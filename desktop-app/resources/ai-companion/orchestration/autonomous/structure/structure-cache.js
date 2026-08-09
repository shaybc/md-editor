/** Profile-scoped incremental cache for workspace structural extraction. */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { companionProfilePath } = require("../profile-storage");

class StructureCache {
  constructor(request) {
    const identity = crypto.createHash("sha256").update(path.resolve(String(request.workspaceRoot || "."))).digest("hex").slice(0, 24);
    this.filePath = companionProfilePath(request.profileRoot, "workspace-structure", `${identity}.json`);
    this.entries = new Map();
    this.dirty = false;
  }

  /** Load cache metadata without failing workspace analysis on corruption. */
  async load() {
    if (!this.filePath) return;
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, "utf8"));
      this.entries = new Map(Array.isArray(parsed.entries) ? parsed.entries.map((entry) => [entry.path, entry]) : []);
    } catch (error) { if (error?.code !== "ENOENT") this.entries.clear(); }
  }

  get(filePath, stat, digest) {
    const entry = this.entries.get(filePath);
    return entry && entry.size === stat.size && entry.modifiedMs === stat.mtimeMs && entry.digest === digest ? entry.structure : null;
  }

  set(filePath, stat, digest, structure) { this.entries.set(filePath, { path: filePath, size: stat.size, modifiedMs: stat.mtimeMs, digest, structure }); this.dirty = true; }
  retain(paths) { const keep = new Set(paths); for (const key of this.entries.keys()) if (!keep.has(key)) { this.entries.delete(key); this.dirty = true; } }

  async save() {
    if (!this.filePath || !this.dirty) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify({ version: 2, entries: Array.from(this.entries.values()) })}\n`, "utf8");
    await fs.rename(temporary, this.filePath);
    this.dirty = false;
  }

  async invalidate() { this.entries.clear(); this.dirty = true; await this.save(); }
  stats() { return { entries: this.entries.size, path: this.filePath }; }
}

module.exports = { StructureCache };
