/** Detect repeated equivalent tool failures without conflating unrelated failures. */

"use strict";

const DEFAULT_THRESHOLD = 3;
const TARGET_KEYS = Object.freeze(["path", "cwd", "url", "id", "query", "command"]);

class ToolFailureLoopGuard {
  /** Create a run-scoped equivalent-failure tracker. */
  constructor(options = {}) {
    this.threshold = Math.max(2, Number(options.threshold) || DEFAULT_THRESHOLD);
    this.failures = new Map();
    this.tripped = null;
    this.restore(options);
  }

  /** Record a failed call and return a blocker after the bounded threshold. */
  recordFailure(tool, input = {}, error) {
    const failure = describeFailure(tool, input, error);
    const previous = this.failures.get(failure.signature) || { count: 0 };
    const entry = { ...failure, count: previous.count + 1 };
    this.failures.set(failure.signature, entry);
    if (entry.count >= this.threshold && !this.tripped) this.tripped = { ...entry };
    return this.tripped ? { ...this.tripped } : null;
  }

  /** Clear only failures equivalent to a successful operation. */
  recordSuccess(tool, input = {}) {
    const target = normalizeTarget(input);
    for (const [signature, entry] of this.failures) {
      if (entry.tool === String(tool || "") && entry.target === target) this.failures.delete(signature);
    }
  }

  /** Return the current blocker without exposing mutable internal state. */
  blocker() { return this.tripped ? { ...this.tripped } : null; }

  /** Return restart-safe repeated-failure state. */
  snapshot() {
    return { threshold: this.threshold, failures: Array.from(this.failures.entries()), tripped: this.tripped ? { ...this.tripped } : null };
  }

  /** Restore only bounded plain-data failure entries. */
  restore(snapshot = {}) {
    const entries = Array.isArray(snapshot.failures) ? snapshot.failures.slice(-100) : [];
    this.failures = new Map(entries.filter((entry) => Array.isArray(entry) && entry.length === 2));
    this.tripped = snapshot.tripped && typeof snapshot.tripped === "object" ? { ...snapshot.tripped } : null;
  }
}

/** Build a stable signature from operation, error category, and target resource. */
function describeFailure(tool, input = {}, error) {
  const name = String(tool || "tool");
  const category = String(error?.code || error?.name || "TOOL_ERROR").toUpperCase();
  const target = normalizeTarget(input);
  return {
    signature: JSON.stringify([name, category, target]),
    tool: name,
    category,
    target,
    error: String(error?.message || error || "The tool failed.")
  };
}

function normalizeTarget(input) {
  const source = input && typeof input === "object" ? input : {};
  const key = TARGET_KEYS.find((candidate) => source[candidate] != null && String(source[candidate]).trim());
  return key ? `${key}:${String(source[key]).trim().replace(/\\/g, "/").toLowerCase()}` : "tool";
}

module.exports = { DEFAULT_THRESHOLD, ToolFailureLoopGuard, describeFailure };
