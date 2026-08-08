/** Authoritative run-scoped inventory of permitted tool schemas. */

"use strict";

const crypto = require("node:crypto");
const { createToolSchemaRecord } = require("./tool-schema-record");

class ToolSchemaInventory {
  constructor(registrations = []) {
    this.records = new Map();
    this.sources = new Map();
    this.revision = 0;
    this.replaceSource("initial", registrations);
  }

  /** Register one new schema without replacing an existing canonical name. */
  register(registration) {
    const record = createToolSchemaRecord(registration);
    if (this.records.has(record.name)) throw new Error("Duplicate autonomous tool schema name: " + record.name);
    this.records.set(record.name, record);
    this.sources.set("registration:" + record.name, new Set([record.name]));
    this.revision += 1;
    return record;
  }

  /** Synchronize the complete schema set owned by one source. */
  synchronize(sourceKey, registrations = []) { return this.replaceSource(sourceKey, registrations); }

  /** Replace all records owned by one source and reject cross-source name collisions. */
  replaceSource(sourceKey, registrations = []) {
    const owner = String(sourceKey || "unknown");
    const previous = this.sources.get(owner) || new Set();
    const nextRecords = registrations.map((value) => createToolSchemaRecord(value));
    const next = new Set(nextRecords.map((record) => record.name));
    if (next.size !== nextRecords.length) throw new Error("Duplicate autonomous tool schema name in source: " + owner);
    for (const record of nextRecords) {
      const existing = this.records.get(record.name);
      if (existing && !previous.has(record.name)) {
        throw new Error("Duplicate autonomous tool schema name: " + record.name);
      }
    }
    const removed = Array.from(previous).filter((name) => !next.has(name));
    const added = [];
    const changed = [];
    for (const name of removed) this.records.delete(name);
    for (const record of nextRecords) {
      const existing = this.records.get(record.name);
      if (!existing) added.push(record.name);
      else if (existing.fingerprint !== record.fingerprint) changed.push(record.name);
      this.records.set(record.name, record);
    }
    this.sources.set(owner, next);
    if (added.length || removed.length || changed.length) this.revision += 1;
    return { added, removed, changed };
  }

  /** Return one record by canonical name. */
  find(name) { return this.records.get(String(name || "")) || null; }

  /** Return all records in stable canonical-name order. */
  list() { return Array.from(this.records.values()).sort((left, right) => left.name.localeCompare(right.name)); }

  /** Return a stable fingerprint for recovery revalidation and catalog notices. */
  fingerprint() {
    const values = this.list().map((record) => record.name + ":" + record.fingerprint);
    return crypto.createHash("sha256").update(values.join("|")).digest("hex");
  }

  /** Return bounded inventory metadata without provider schemas. */
  snapshot() {
    return { revision: this.revision, fingerprint: this.fingerprint(), names: this.list().map((record) => record.name) };
  }
}

module.exports = { ToolSchemaInventory };
