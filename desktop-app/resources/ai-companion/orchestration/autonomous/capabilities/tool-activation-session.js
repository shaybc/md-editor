/** Run-local activation state for schemas selected from the deferred inventory. */

"use strict";

class ToolActivationSession {
  constructor(emit = () => {}) {
    this.emit = emit;
    this.active = new Map();
    this.unavailable = new Set();
    this.searchHistory = [];
  }

  /** Activate selected records idempotently. */
  activate(records, metadata = {}) {
    const activated = [];
    const alreadyActive = [];
    for (const record of records) {
      if (this.active.has(record.name)) alreadyActive.push(record.name);
      else {
        this.active.set(record.name, { activatedAt: new Date().toISOString(), source: String(metadata.source || "search"), fingerprint: record.fingerprint });
        this.unavailable.delete(record.name);
        activated.push(record.name);
      }
    }
    if (activated.length) this.emit({
      type: "tool-schema-activated", names: activated, source: String(metadata.source || "search"),
      count: activated.length,
      estimatedSchemaTokens: Math.ceil(records.filter((record) => activated.includes(record.name)).reduce((total, record) => total + JSON.stringify(record.definition).length, 0) / 4),
      summary: activated.length + " deferred tool schema" + (activated.length === 1 ? "" : "s") + " activated."
    });
    return { activated, alreadyActive };
  }

  /** True when a deferred schema is active for this run. */
  has(name) { return this.active.has(String(name || "")); }

  /** Resolve active definitions against the current authoritative inventory. */
  definitions(inventory) {
    this.validate(inventory);
    return Array.from(this.active.keys(), (name) => inventory.find(name)).filter(Boolean).map((record) => record.definition);
  }

  /** Remove activations whose definition disappeared or changed. */
  validate(inventory) {
    const unavailable = [];
    for (const [name, metadata] of Array.from(this.active.entries())) {
      const record = inventory.find(name);
      if (!record || (metadata.fingerprint && metadata.fingerprint !== record.fingerprint)) {
        this.markUnavailable(name);
        unavailable.push(name);
      }
    }
    return unavailable;
  }

  /** Mark a previously known schema unavailable without granting new authority. */
  markUnavailable(name) {
    const key = String(name || "");
    this.active.delete(key);
    this.unavailable.add(key);
  }

  /** Retain bounded structural search telemetry without storing prompt text. */
  recordSearch(metadata = {}) {
    this.searchHistory.push({
      at: new Date().toISOString(),
      queryType: String(metadata.queryType || "keyword"),
      matchCount: Math.max(0, Number(metadata.matchCount) || 0),
      activatedCount: Math.max(0, Number(metadata.activatedCount) || 0)
    });
    if (this.searchHistory.length > 50) this.searchHistory.splice(0, this.searchHistory.length - 50);
  }

  /** Return serializable, non-authority-bearing activation metadata. */
  snapshot() { return { active: Array.from(this.active.entries()), unavailable: Array.from(this.unavailable), searchHistory: this.searchHistory.slice() }; }

  /** Extract requested names from current or legacy recovery state. */
  requested(snapshot) {
    if (Array.isArray(snapshot)) return snapshot.map(String);
    this.unavailable = new Set(Array.isArray(snapshot?.unavailable) ? snapshot.unavailable.map(String) : []);
    this.searchHistory = Array.isArray(snapshot?.searchHistory) ? snapshot.searchHistory.slice(-50) : [];
    return Array.isArray(snapshot?.active)
      ? snapshot.active.map((entry) => String(Array.isArray(entry) ? entry[0] : entry)).filter(Boolean)
      : [];
  }

  /** Restore compatible records from a serialized activation snapshot. */
  restore(snapshot, inventory) {
    const records = this.requested(snapshot).map((name) => inventory.find(name)).filter(Boolean);
    return this.activate(records, { source: "recovery" });
  }
}

module.exports = { ToolActivationSession };
