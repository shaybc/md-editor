/** Tracks background lifecycle sequences without replaying uncertain work. */

"use strict";

class BackgroundActionRegistry {
  constructor(emit = () => {}) { this.emit = emit; this.sequence = 0; this.entries = new Map(); }

  /** Start one background sequence and retain bounded recovery metadata. */
  start(metadata, operation) {
    const id = `background-hook-${++this.sequence}`;
    const entry = { id, ...metadata, status: "running", startedAt: new Date().toISOString(), completedAt: "", error: "" };
    this.entries.set(id, entry);
    this.emit({ type: "hook-queued", backgroundId: id, ...metadata });
    entry.promise = Promise.resolve().then(operation).then((result) => {
      entry.status = "completed";
      entry.completedAt = new Date().toISOString();
      entry.result = boundedResult(result);
      return result;
    }, (error) => {
      entry.status = "failed";
      entry.completedAt = new Date().toISOString();
      entry.error = String(error?.message || error).slice(0, 4000);
      throw error;
    });
    entry.promise.catch(() => {});
    return entry;
  }

  /** Mark an active operation as cancelled; the run signal remains authoritative. */
  cancel(id) {
    const entry = this.entries.get(String(id || ""));
    if (!entry || entry.status !== "running") return false;
    entry.status = "cancelled";
    entry.completedAt = new Date().toISOString();
    return true;
  }

  async drain() { await Promise.allSettled(Array.from(this.entries.values(), (entry) => entry.promise).filter(Boolean)); }

  snapshot() {
    return {
      version: 1,
      entries: Array.from(this.entries.values(), (entry) => ({
        id: entry.id, hookId: entry.hookId, event: entry.event, actionTypes: entry.actionTypes,
        status: entry.status, startedAt: entry.startedAt, completedAt: entry.completedAt, error: entry.error, result: entry.result
      })).slice(-100)
    };
  }

  restore(snapshot = {}) {
    for (const saved of snapshot.entries || []) {
      const entry = { ...saved };
      if (entry.status === "running") {
        entry.status = "interrupted";
        entry.error = "The background lifecycle sequence was interrupted and was not replayed.";
        this.emit({ type: "recovery-warning", reason: "lifecycle-background-interrupted", hookId: entry.hookId, summary: entry.error });
      }
      this.entries.set(entry.id, entry);
    }
  }
}

function boundedResult(value) {
  try { return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "string" ? item.slice(0, 4000) : item)); }
  catch (_error) { return { summary: String(value).slice(0, 4000) }; }
}

module.exports = { BackgroundActionRegistry, boundedResult };
