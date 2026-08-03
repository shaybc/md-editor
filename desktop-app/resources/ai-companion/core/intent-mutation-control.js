/**
 * Control-scoped mutation blocking: decides whether a proposed Agent mutation is gated
 * by an open, mutation-controlling decision in the active intent contract.
 *
 * A decision blocks a mutation when the mutation's capability is in the decision's
 * controlledCapabilities, or its resolved resource matches one of the decision's
 * controlledTargets. A decision with no scope (no capabilities and no targets)
 * conservatively blocks every effectful tool. Reads, ui-state, and the discovery seed
 * are never blocked. Enforcement is identical regardless of clarification preference.
 *
 * Pure module: no IO, no provider calls, no side effects.
 */

"use strict";

const toolEffects = require("./agent-tool-effect-registry");
const approvalCapabilities = require("./approval-capability-registry");

/**
 * The open, mutation-controlling decisions of a contract. A decision controls mutation
 * when controlsMutation is true; resolved decisions are excluded.
 *
 * @param {object} contract - The active intent contract.
 * @returns {object[]} Open controlling decisions.
 */
function getOpenControllingDecisions(contract) {
  const decisions = contract && Array.isArray(contract.unresolvedDecisions) ? contract.unresolvedDecisions : [];
  return decisions.filter((decision) => decision && decision.controlsMutation === true && decision.status !== "resolved");
}

/**
 * Whether a decision carries an explicit control scope (any capability or target).
 * A decision without scope blocks all mutations, conservatively.
 *
 * @param {object} decision - A controlling decision.
 * @returns {boolean} True when the decision names at least one capability or target.
 */
function decisionHasScope(decision) {
  const capabilities = Array.isArray(decision.controlledCapabilities) ? decision.controlledCapabilities : [];
  const targets = Array.isArray(decision.controlledTargets) ? decision.controlledTargets : [];
  return capabilities.length > 0 || targets.length > 0;
}

/**
 * Resolve a decision's controlledTargets to normalized resource paths. Each entry may be
 * a contract target id (for example "T1"), resolved to its named-target value, or a
 * literal path/glob.
 *
 * @param {object} decision - A controlling decision.
 * @param {object} contract - The active contract (for target-id resolution).
 * @returns {string[]} Normalized target paths/globs.
 */
function resolveControlledTargetPaths(decision, contract) {
  const byId = new Map();
  const groups = contract && contract.namedTargets ? contract.namedTargets : {};
  for (const target of (Array.isArray(groups.files) ? groups.files : [])) {
    if (target && target.id && target.status === "confirmed" && target.kind === "file-path") {
      byId.set(target.id, approvalCapabilities.normalizePath(target.value));
    }
  }
  return (Array.isArray(decision.controlledTargets) ? decision.controlledTargets : [])
    .map((entry) => {
      if (byId.has(entry)) return byId.get(entry);
      if (/^T\d+$/i.test(String(entry || ""))) return "";
      return approvalCapabilities.normalizePath(entry);
    })
    .filter(Boolean);
}

function allAssociatedResourcePaths(contract) {
  const files = contract?.namedTargets?.files;
  return (Array.isArray(files) ? files : [])
    .filter((target) => target && target.status === "confirmed" && target.kind === "file-path")
    .map((target) => approvalCapabilities.normalizePath(target.value))
    .filter(Boolean);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match a normalized resource against a target pattern. Patterns may use "*" (within a
 * path segment) and "**" (across segments); otherwise matching is exact equality.
 *
 * @param {string} pattern - Target path or glob.
 * @param {string} value - Normalized resource path.
 * @returns {boolean} True when the value matches the pattern.
 */
function globMatch(pattern, value) {
  if (!pattern.includes("*")) return pattern === value;
  const body = pattern.split("**").map((segment) => segment.split("*").map(escapeRegExp).join("[^/]*")).join(".*");
  return new RegExp(`^${body}$`).test(value);
}

/**
 * Whether a single decision blocks a described mutation, and by what route.
 *
 * @param {object} description - Tool effect description (capability, resource, effectful).
 * @param {object} decision - A controlling decision.
 * @param {object} contract - The active contract (for target resolution).
 * @returns {{ matched: boolean, via?: string }} Match outcome.
 */
function decisionBlocks(description, decision, contract) {
  const capabilities = Array.isArray(decision.controlledCapabilities) ? decision.controlledCapabilities : [];
  if (!description.capability && capabilities.length) return { matched: true, via: "unknown-capability" };
  if (capabilities.includes(description.capability)) return { matched: true, via: "capability" };
  if (!decisionHasScope(decision)) return { matched: true, via: "unknown-scope" };
  const controlledTargets = Array.isArray(decision.controlledTargets) ? decision.controlledTargets : [];
  if (controlledTargets.length) {
    const paths = resolveControlledTargetPaths(decision, contract);
    if (paths.length !== controlledTargets.length || !description.resource) return { matched: true, via: "unknown-target" };
    if (paths.some((pattern) => globMatch(pattern, description.resource))) return { matched: true, via: "target" };
    const associated = allAssociatedResourcePaths(contract);
    if (!associated.some((pattern) => globMatch(pattern, description.resource))) return { matched: true, via: "unknown-target" };
  }
  return { matched: false };
}

/**
 * Evaluate whether a proposed tool call is blocked by any open controlling decision.
 * Non-effectful tools (reads, ui-state, discovery seed) are never blocked.
 *
 * @param {string} toolName - Agent tool name.
 * @param {object} args - Parsed tool arguments.
 * @param {object} contract - The active intent contract.
 * @returns {{ blocked: boolean, decision?: object, via?: string, description?: object }} Outcome.
 */
function evaluateMutationControl(toolName, args, contract) {
  const description = toolEffects.describeToolEffect(toolName, args) || {
    tool: toolName,
    effect: "unknown",
    capability: "",
    effectful: toolEffects.isEffectfulTool(toolName),
    resource: ""
  };
  if (!description.effectful) return { blocked: false };
  for (const decision of getOpenControllingDecisions(contract)) {
    const outcome = decisionBlocks(description, decision, contract);
    if (outcome.matched) return { blocked: true, decision, via: outcome.via, description };
  }
  return { blocked: false };
}

module.exports = {
  getOpenControllingDecisions,
  decisionHasScope,
  resolveControlledTargetPaths,
  globMatch,
  evaluateMutationControl
};
