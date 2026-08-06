/**
 * Task-relative progress signals + batch-lookup budget (M11.5).
 *
 * The general progress controller (M6) measures whether the run is advancing. For a
 * classified task profile, "advancing" is task-relative: once a target has been resolved
 * through its authoritative tool, re-deriving it — a source search, a repeated
 * preferences_search — adds no task information and counts as no-progress. This module
 * provides the deterministic task-relative signals M6 consumes, plus a batch-first
 * lookup budget so resolution is bounded and efficient (not merely "no source reads").
 *
 * Pure: no IO, no provider calls, no mutation of inputs.
 */

"use strict";

/** Per-key lookup budget: one group/namespace search + one fallback lookup. */
const BATCH_LOOKUP_BUDGET = 2;

/** Tools that (re-)derive a target's descriptor/value; repeats over resolved keys stall. */
const DEFAULT_RESOLUTION_TOOLS = Object.freeze(new Set([
  "preferences_search", "preferences_get", "search_text", "glob", "read_file"
]));

function toKeys(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

/**
 * Classify whether a proposed/observed task action makes task-relative progress.
 *
 * @param {object} input
 * @param {string} input.tool - The action's tool name.
 * @param {string[]} [input.targetKeys] - The target keys this action concerns.
 * @param {string[]} [input.resolvedKeys] - Keys already resolved authoritatively.
 * @param {object} [input.lookupCounts] - map key -> prior resolution-lookup count.
 * @param {Set<string>} [input.resolutionTools] - override the resolution-tool set.
 * @param {number} [input.budget] - override the per-key budget.
 * @returns {{ progress: boolean, reasonCode: string, overBudgetKeys: string[] }}
 */
function classifyTaskProgress(input = {}) {
  const tool = String(input.tool || "");
  const targets = toKeys(input.targetKeys);
  const resolved = new Set(toKeys(input.resolvedKeys));
  const counts = input.lookupCounts && typeof input.lookupCounts === "object" ? input.lookupCounts : {};
  const resolutionTools = input.resolutionTools instanceof Set ? input.resolutionTools : DEFAULT_RESOLUTION_TOOLS;
  const budget = Number.isFinite(input.budget) ? input.budget : BATCH_LOOKUP_BUDGET;

  const isResolutionTool = resolutionTools.has(tool);

  // Re-deriving targets that are already resolved is no-progress.
  if (isResolutionTool && targets.length > 0 && targets.every((key) => resolved.has(key))) {
    return { progress: false, reasonCode: "rederiving_resolved_target", overBudgetKeys: [] };
  }

  // Exceeding the batch-lookup budget for a key is no-progress (and a fallback candidate).
  const overBudgetKeys = targets.filter((key) => (Number(counts[key]) || 0) >= budget);
  if (isResolutionTool && overBudgetKeys.length > 0) {
    return { progress: false, reasonCode: "lookup_budget_exceeded", overBudgetKeys };
  }

  return { progress: true, reasonCode: "", overBudgetKeys: [] };
}

/**
 * Return an updated lookup-count map after a resolution attempt over some keys.
 * (Pure — returns a new object.)
 *
 * @param {object} lookupCounts - prior counts.
 * @param {string[]} keys - keys touched by this resolution attempt.
 * @returns {object} new counts.
 */
function recordLookup(lookupCounts, keys) {
  const next = { ...(lookupCounts && typeof lookupCounts === "object" ? lookupCounts : {}) };
  for (const key of toKeys(keys)) next[key] = (Number(next[key]) || 0) + 1;
  return next;
}

/**
 * A stable task-relative action signature for dedupe/stall detection: same tool over the
 * same target-key set produces the same signature regardless of key order.
 *
 * @param {object} action - { tool, targetKeys }
 * @returns {string}
 */
function taskActionSignature(action = {}) {
  const tool = String(action.tool || "");
  const keys = toKeys(action.targetKeys).slice().sort();
  return `${tool}(${keys.join(",")})`;
}

module.exports = {
  BATCH_LOOKUP_BUDGET,
  DEFAULT_RESOLUTION_TOOLS,
  classifyTaskProgress,
  recordLookup,
  taskActionSignature
};
