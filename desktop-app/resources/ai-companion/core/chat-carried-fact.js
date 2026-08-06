/**
 * Cross-turn carried-fact freshness (M9.2).
 *
 * A workspace fact accepted in an earlier turn can go stale when its underlying
 * resources change. This module models the carried-fact contract and decides, from
 * resource fingerprints, whether a carried fact is reusable or must be re-observed.
 * General (non-workspace) conversational facts carry without workspace revalidation.
 *
 * Pure module: no IO, no provider calls, no side effects.
 */

"use strict";

function str(value) { return typeof value === "string" ? value : String(value == null ? "" : value); }

/**
 * Build a normalized carried fact.
 * @returns {{ factId, statement, sourceTurnId, kind, evidenceRefs, resourceFingerprints, verifiedAt }}
 */
function makeCarriedFact(input = {}) {
  return {
    factId: str(input.factId),
    statement: str(input.statement),
    sourceTurnId: str(input.sourceTurnId),
    kind: input.kind === "general" ? "general" : "workspace",
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.map(str).filter(Boolean) : [],
    resourceFingerprints: (input.resourceFingerprints && typeof input.resourceFingerprints === "object" && !Array.isArray(input.resourceFingerprints))
      ? { ...input.resourceFingerprints } : {},
    verifiedAt: str(input.verifiedAt)
  };
}

/**
 * Decide whether a carried fact may support a new answer without re-observation.
 *
 * @param {object} fact - A carried fact (see makeCarriedFact).
 * @param {object} [currentFingerprints] - Map of resource id -> current fingerprint.
 * @returns {{ status: "reusable"|"stale", reason: string, staleResources: string[] }}
 */
function evaluateCarriedFact(fact, currentFingerprints = {}) {
  if (!fact || fact.kind === "general") {
    return { status: "reusable", reason: "general-fact", staleResources: [] };
  }
  const fingerprints = fact.resourceFingerprints || {};
  const resources = Object.keys(fingerprints);
  if (!resources.length) {
    // A workspace fact with no fingerprints cannot be proven fresh -> must re-observe.
    return { status: "stale", reason: "no-fingerprints", staleResources: [] };
  }
  const stale = [];
  const current = currentFingerprints && typeof currentFingerprints === "object" ? currentFingerprints : {};
  for (const resource of resources) {
    const now = current[resource];
    if (now === undefined || now === null || String(now) !== String(fingerprints[resource])) {
      stale.push(resource);
    }
  }
  if (stale.length) return { status: "stale", reason: "resource-changed", staleResources: stale };
  return { status: "reusable", reason: "fingerprints-match", staleResources: [] };
}

/**
 * Partition carried facts into reusable vs stale (needing re-observation).
 * @returns {{ reusable: object[], stale: object[] }}
 */
function partitionCarriedFacts(facts, currentFingerprints = {}) {
  const reusable = [];
  const stale = [];
  for (const fact of (Array.isArray(facts) ? facts : [])) {
    (evaluateCarriedFact(fact, currentFingerprints).status === "reusable" ? reusable : stale).push(fact);
  }
  return { reusable, stale };
}

module.exports = {
  makeCarriedFact,
  evaluateCarriedFact,
  partitionCarriedFacts
};
