/** Persistent model-controlled work items for one autonomous run. */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { getRunIdentity } = require("./run-identity");
const { companionProfilePath } = require("../profile-storage");

const STATUSES = new Set(["pending", "in_progress", "completed"]);

class WorkLedger {
  constructor(request, emit = () => {}) {
    this.request = request;
    this.emit = emit;
    this.items = new Map();
    this.highWaterMark = 0;
    this.queue = Promise.resolve();
    this.directory = companionProfilePath(request.profileRoot, "autonomous-work", getRunIdentity(request), "items");
  }

  /** Load validated work records and mark ownership state available to the run. */
  async load() {
    if (!this.directory) return this.snapshot();
    await fs.mkdir(this.directory, { recursive: true });
    for (const name of await fs.readdir(this.directory)) {
      if (name === ".high-water-mark") {
        this.highWaterMark = Math.max(this.highWaterMark, Number(await fs.readFile(path.join(this.directory, name), "utf8")) || 0);
      } else if (/^\d+\.json$/.test(name)) {
        const item = normalizeItem(JSON.parse(await fs.readFile(path.join(this.directory, name), "utf8")));
        this.items.set(item.id, item);
        this.highWaterMark = Math.max(this.highWaterMark, Number(item.id) || 0);
      }
    }
    return this.snapshot();
  }

  /** Create a pending work item with a monotonic identifier. */
  create(input) {
    return this.serialize(async () => {
      const now = new Date().toISOString();
      const item = normalizeItem({ id: String(++this.highWaterMark), subject: input.subject, description: input.description, activeForm: input.activeForm, status: "pending", owner: "", blocks: [], blockedBy: [], metadata: input.metadata || {}, createdAt: now, updatedAt: now });
      this.items.set(item.id, item);
      await Promise.all([this.persist(item), this.persistHighWaterMark()]);
      this.emit({ type: "work-created", item });
      return item;
    });
  }

  /** Return one work item or null when it does not exist. */
  get(id) { return this.items.get(String(id || "")) || null; }

  /** Return work items in stable numeric order. */
  list() { return this.snapshot(); }

  /** Apply a model-selected update while maintaining symmetric dependency links. */
  update(id, input) {
    return this.serialize(async () => {
      const key = String(id || "");
      const existing = this.items.get(key);
      if (!existing) throw new Error(`Unknown work item: ${key}`);
      if (input.status === "deleted") return this.removeItem(key);
      if (input.status !== undefined && !STATUSES.has(input.status)) throw new Error(`Invalid work status: ${input.status}`);
      const touched = new Set([key]);
      const next = { ...existing, metadata: { ...existing.metadata } };
      for (const field of ["subject", "description", "activeForm", "owner", "status"]) if (input[field] !== undefined) next[field] = String(input[field]);
      if (input.metadata) for (const [name, value] of Object.entries(input.metadata)) value === null ? delete next.metadata[name] : next.metadata[name] = value;
      this.addDependencies(next, "blocks", "blockedBy", input.addBlocks, touched);
      this.addDependencies(next, "blockedBy", "blocks", input.addBlockedBy, touched);
      next.updatedAt = new Date().toISOString();
      this.items.set(key, normalizeItem(next));
      await Promise.all(Array.from(touched, (itemId) => this.persist(this.items.get(itemId))));
      this.emit({ type: "work-updated", item: this.items.get(key) });
      return this.items.get(key);
    });
  }

  /** Delete one work item and remove every dependency reference to it. */
  remove(id) {
    const key = String(id || "");
    return this.serialize(() => this.removeItem(key));
  }

  async removeItem(key) {
      if (!this.items.delete(key)) return { deleted: false, id: key };
      const touched = [];
      for (const item of this.items.values()) {
        const blocks = item.blocks.filter((value) => value !== key);
        const blockedBy = item.blockedBy.filter((value) => value !== key);
        if (blocks.length !== item.blocks.length || blockedBy.length !== item.blockedBy.length) {
          Object.assign(item, { blocks, blockedBy, updatedAt: new Date().toISOString() });
          touched.push(this.persist(item));
        }
      }
      if (this.directory) await fs.rm(path.join(this.directory, `${key}.json`), { force: true });
      await Promise.all(touched);
      this.emit({ type: "work-deleted", id: key });
      return { deleted: true, id: key };
  }

  /** Return a serializable snapshot for compaction, UI, and checkpoints. */
  snapshot() { return Array.from(this.items.values()).sort((a, b) => Number(a.id) - Number(b.id)).map((item) => JSON.parse(JSON.stringify(item))); }

  addDependencies(item, field, reverseField, values, touched) {
    for (const value of Array.isArray(values) ? values.map(String) : []) {
      if (value === item.id) throw new Error("A work item cannot depend on itself.");
      const peer = this.items.get(value);
      if (!peer) throw new Error(`Unknown work dependency: ${value}`);
      if (!item[field].includes(value)) item[field].push(value);
      if (!peer[reverseField].includes(item.id)) peer[reverseField].push(item.id);
      peer.updatedAt = new Date().toISOString();
      touched.add(value);
    }
  }

  serialize(operation, nested = false) {
    if (nested) return operation();
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => {});
    return result;
  }

  async persist(item) {
    if (!this.directory || !item) return;
    await fs.mkdir(this.directory, { recursive: true });
    const target = path.join(this.directory, `${item.id}.json`);
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(item, null, 2)}\n`, "utf8");
    await fs.rename(temporary, target);
  }

  async persistHighWaterMark() {
    if (!this.directory) return;
    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(path.join(this.directory, ".high-water-mark"), String(this.highWaterMark), "utf8");
  }
}

function normalizeItem(value) {
  const status = STATUSES.has(value.status) ? value.status : "pending";
  const subject = String(value.subject || "").trim();
  const description = String(value.description || "").trim();
  if (!String(value.id || "") || !subject || !description) throw new Error("Work items require id, subject, and description.");
  return { id: String(value.id), subject, description, activeForm: String(value.activeForm || ""), owner: String(value.owner || ""), status, blocks: Array.isArray(value.blocks) ? value.blocks.map(String) : [], blockedBy: Array.isArray(value.blockedBy) ? value.blockedBy.map(String) : [], metadata: value.metadata && typeof value.metadata === "object" ? value.metadata : {}, createdAt: String(value.createdAt || new Date().toISOString()), updatedAt: String(value.updatedAt || new Date().toISOString()) };
}

module.exports = { STATUSES, WorkLedger, normalizeItem };
