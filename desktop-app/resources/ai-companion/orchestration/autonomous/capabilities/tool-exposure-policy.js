/** Structural classification of permitted schemas into immediate and deferred exposure. */

"use strict";

const ALWAYS_LOADED = new Set([
  "capability_search", "discover_extensions", "load_extension", "skill_invoke",
  "list_files", "glob_files", "glob", "search_text", "read_file",
  "apply_edit", "write_file", "run_command", "worker_launch"
]);

class ToolExposurePolicy {
  constructor(policy = {}) { this.policy = policy; }

  /** Classify one already-permitted record for provider exposure. */
  classify(record) {
    if (record.alwaysLoad || ALWAYS_LOADED.has(record.name)) return "immediate";
    if (this.policy.mode === "plan" && record.name.startsWith("plan_")) return "immediate";
    return "deferred";
  }

  /** True when the record belongs in the initial provider roster. */
  isImmediate(record) { return this.classify(record) === "immediate"; }
}

module.exports = { ALWAYS_LOADED, ToolExposurePolicy };
