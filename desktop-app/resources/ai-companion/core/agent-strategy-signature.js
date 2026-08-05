/**
 * Canonical action and strategy identities for Agent progress control.
 *
 * Pure module: it stores no arguments and performs no IO or provider calls.
 */

"use strict";

const crypto = require("node:crypto");
const { describeToolEffect } = require("./agent-tool-effect-registry");

const STRATEGY_CLASSES = Object.freeze([
  "search_concept",
  "read_neighboring_files",
  "trace_symbol_references",
  "inspect_failure",
  "rerun_validation",
  "edit_target",
  "verify_state",
  "other"
]);

const SEARCH_TOOLS = new Set(["search_vault", "search_text", "glob", "list_files", "graph_search_nodes", "api_asset_search", "preferences_search"]);
const VALIDATION_TOOLS = new Set(["run_tests", "compile_project", "run_command"]);
const TRACE_TOOLS = new Set(["graph_find_paths", "graph_get_node_context", "get_link_context"]);
const FILLER_WORDS = new Set(["again", "careful", "carefully", "different", "more", "new", "now", "retry", "thorough", "thoroughly"]);
const CONCEPT_ALIASES = Object.freeze({
  authentication: "auth",
  authenticated: "auth",
  authorization: "auth",
  checking: "validate",
  checks: "validate",
  check: "validate",
  validation: "validate",
  validating: "validate",
  validator: "validate",
  verification: "verify",
  verifying: "verify"
});

function hash(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).filter((key) => key !== "_decision").sort().reduce((result, key) => {
    result[key] = canonicalValue(value[key]);
    return result;
  }, {});
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_./\\-]+/g, " ")
    .trim();
}

function conceptTokens(value) {
  return [...new Set(normalizeText(value).split(/\s+/).filter(Boolean).map((token) => {
    const singular = token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token;
    return CONCEPT_ALIASES[singular] || singular;
  }).filter((token) => token.length > 1 && !FILLER_WORDS.has(token)))].sort();
}

function queryText(args = {}) {
  return [args.query, args.pattern, args.search, args.term, args.symbol, args.name, args.glob, args.path]
    .filter((value) => typeof value === "string")
    .join(" ");
}

function strategyClassFor(toolName, effect) {
  if (SEARCH_TOOLS.has(toolName)) return "search_concept";
  if (TRACE_TOOLS.has(toolName)) return "trace_symbol_references";
  if (VALIDATION_TOOLS.has(toolName)) return "rerun_validation";
  if (effect?.effect === "workspace-write" || effect?.effect === "external-write") return "edit_target";
  if (effect?.effect === "read" && effect.resource) return "read_neighboring_files";
  if (effect?.effect === "read") return "verify_state";
  if (effect?.effect === "execution") return "inspect_failure";
  return "other";
}

function targetScopeFor(effect, args = {}, strategyClass = "other") {
  const resource = String(effect?.resource || "").replace(/\\/g, "/").toLowerCase();
  if (resource) {
    if (strategyClass !== "read_neighboring_files") return resource;
    const resourceParts = resource.split("/").filter(Boolean);
    return resourceParts.length > 1 ? resourceParts.slice(0, -1).join("/") : ".";
  }
  const pathValue = String(args.path || args.expectedPath || args.file || "").replace(/\\/g, "/").toLowerCase();
  if (!pathValue) return "";
  const parts = pathValue.split("/").filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join("/") : pathValue;
}

/**
 * Hash one executable action without retaining its raw arguments.
 * @param {string} toolName Executable tool name.
 * @param {object} args Sanitized tool arguments.
 * @returns {string} Stable SHA-256 action signature.
 */
function createActionSignature(toolName, args = {}) {
  return hash(JSON.stringify({ tool: String(toolName || ""), arguments: canonicalValue(args) }));
}

/**
 * Describe the strategy represented by a proposed tool action.
 * @param {{toolName:string,args?:object,intentId?:string,conceptClusterId?:string}} input Candidate action.
 * @returns {object} Content-limited strategy descriptor and stable signature.
 */
function createStrategyDescriptor(input = {}) {
  const toolName = String(input.toolName || "");
  const args = input.args && typeof input.args === "object" ? input.args : {};
  const effect = describeToolEffect(toolName, args);
  const strategyClass = strategyClassFor(toolName, effect);
  const targetScope = targetScopeFor(effect, args, strategyClass);
  const tokens = conceptTokens(queryText(args));
  const conceptClusterId = String(input.conceptClusterId || tokens.join(":"));
  const identity = {
    intentId: String(input.intentId || ""),
    strategyClass,
    targetScope,
    conceptClusterId
  };
  return {
    ...identity,
    conceptTokens: tokens,
    strategySignature: hash(JSON.stringify(identity))
  };
}

/** Return Jaccard similarity for two normalized token collections. */
function tokenSimilarity(left, right) {
  const a = new Set(Array.isArray(left) ? left : conceptTokens(left));
  const b = new Set(Array.isArray(right) ? right : conceptTokens(right));
  if (!a.size && !b.size) return 1;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

/**
 * Detect a superficial wording-only strategy revision.
 * @param {string} abandonedApproach Previously stalled approach.
 * @param {string} revisedApproach Proposed replacement.
 * @returns {{different:boolean,ambiguous:boolean,similarity:number,reasonCode:string}}
 */
function compareApproachText(abandonedApproach, revisedApproach) {
  const oldTokens = conceptTokens(abandonedApproach);
  const newTokens = conceptTokens(revisedApproach);
  const similarity = tokenSimilarity(oldTokens, newTokens);
  if (!newTokens.length) return { different: false, ambiguous: false, similarity, reasonCode: "missing_revised_approach" };
  if (oldTokens.join(":") === newTokens.join(":")) return { different: false, ambiguous: false, similarity, reasonCode: "unchanged_replan_approach" };
  if (similarity >= 0.8) return { different: false, ambiguous: false, similarity, reasonCode: "superficial_replan_approach" };
  if (similarity <= 0.35) return { different: true, ambiguous: false, similarity, reasonCode: "materially_different_approach" };
  return { different: false, ambiguous: true, similarity, reasonCode: "ambiguous_replan_difference" };
}

module.exports = {
  STRATEGY_CLASSES,
  compareApproachText,
  conceptTokens,
  createActionSignature,
  createStrategyDescriptor,
  tokenSimilarity
};
