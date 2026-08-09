/** Cooldown, deduplication, once-only, and depth protection for lifecycle hooks. */

"use strict";

const crypto = require("node:crypto");

class AutomationRepetitionGuard {
  constructor(snapshot = {}) { this.restore(snapshot); }

  /** Determine whether a hook may run for the current event payload. */
  allow(hook, event, payload, depth = 0) {
    if (depth >= hook.maxDepth) return { allowed: false, reason: "maximum lifecycle depth reached" };
    if (hook.once && this.once.has(hook.id)) return { allowed: false, reason: "once-only hook already ran" };
    const now = Date.now();
    const lastRun = this.lastRuns.get(hook.id) || 0;
    if (hook.cooldownMs && now - lastRun < hook.cooldownMs) return { allowed: false, reason: "hook cooldown active" };
    const key = digest({ hook: hook.id, event, payload: boundedPayload(payload) });
    const duplicateAt = this.dedup.get(key) || 0;
    if (hook.dedupWindowMs && now - duplicateAt < hook.dedupWindowMs) return { allowed: false, reason: "duplicate lifecycle event suppressed" };
    return { allowed: true, key };
  }

  /** Record one hook execution after it has passed guard checks. */
  record(hook, key) {
    const now = Date.now();
    this.lastRuns.set(hook.id, now);
    if (key) this.dedup.set(key, now);
    if (hook.once) this.once.add(hook.id);
    this.prune(now);
  }

  snapshot() { return { version: 1, once: Array.from(this.once), lastRuns: Array.from(this.lastRuns), dedup: Array.from(this.dedup) }; }
  restore(snapshot = {}) { this.once = new Set(snapshot.once || []); this.lastRuns = new Map(snapshot.lastRuns || []); this.dedup = new Map(snapshot.dedup || []); }
  prune(now = Date.now()) { for (const [key, timestamp] of this.dedup) if (now - timestamp > 3600000) this.dedup.delete(key); }
}

function boundedPayload(value) { try { return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "string" ? item.slice(0, 2000) : item)); } catch (_error) { return String(value); } }
function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

module.exports = { AutomationRepetitionGuard };
