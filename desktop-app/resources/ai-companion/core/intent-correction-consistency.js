/**
 * Intent correction consistency: derives resource replacement facts from accepted
 * approval steering and verifies that later produced effects use the authoritative
 * replacement. Pure module: no IO, provider calls, or mutations.
 */

"use strict";

const path = require("node:path");
const toolEffects = require("./agent-tool-effect-registry");

const MAX_REPLACEMENTS = 20;
const MAX_REFERENCES_PER_REPLACEMENT = 8;
const MAX_REFERENCE_CHARS = 1000;

function boundedReference(value) {
  return String(value || "").trim().slice(0, MAX_REFERENCE_CHARS);
}

/** Normalize a structural resource reference without changing its case. */
function normalizeResourceReference(value) {
  return boundedReference(value).replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function resourceAliases(value) {
  const normalized = normalizeResourceReference(value);
  if (!normalized) return [];
  const baseName = path.posix.basename(normalized);
  return [...new Set([normalized, baseName].filter(Boolean))].slice(0, MAX_REFERENCES_PER_REPLACEMENT);
}

function targetById(contract, id) {
  for (const group of ["files", "symbols", "errors", "uiAreas"]) {
    const target = (contract?.namedTargets?.[group] || []).find((entry) => entry?.id === id);
    if (target) return { group, target };
  }
  return null;
}

/**
 * Derive exact structural old-to-new resource mappings for one accepted amendment.
 * Ambiguous or non-file corrections deliberately produce no enforceable mapping.
 */
function deriveReferenceReplacements(params = {}) {
  const correctedRefs = Array.isArray(params.correctedFieldRefs) ? params.correctedFieldRefs : [];
  const correctedFileTargets = correctedRefs.map((fieldRef) => {
    const match = String(fieldRef).match(/^target:(.+)$/);
    if (!match) return null;
    const next = targetById(params.refreshedContract, match[1]);
    if (!next || next.group !== "files") return null;
    return { fieldRef, id: match[1], next: next.target, prior: targetById(params.priorContract, match[1])?.target || null };
  }).filter(Boolean);
  if (correctedFileTargets.length !== 1) return [];

  const target = correctedFileTargets[0];
  const replacement = normalizeResourceReference(target.next?.value);
  if (!replacement) return [];
  const superseded = [...new Set([
    ...resourceAliases(params.rejectedResource),
    ...resourceAliases(target.prior?.value)
  ].filter((value) => value && value !== replacement && value !== path.posix.basename(replacement)))].slice(0, MAX_REFERENCES_PER_REPLACEMENT);
  if (!superseded.length) return [];

  return [{
    fieldRef: boundedReference(target.fieldRef),
    kind: "resource",
    superseded,
    replacement,
    replacementAliases: resourceAliases(replacement).filter((value) => value !== replacement),
    sourceToolCallId: boundedReference(params.sourceToolCallId)
  }].slice(0, MAX_REPLACEMENTS);
}

/** Return all bounded, applied resource replacements from the active contract. */
function listActiveReferenceReplacements(contract) {
  const activeByField = new Map();
  for (const amendment of contract?.amendments || []) {
    if (amendment?.applied !== true) continue;
    for (const fieldRef of amendment.changedFields || []) activeByField.delete(boundedReference(fieldRef));
    for (const replacement of amendment.referenceReplacements || []) {
      const normalized = {
        amendmentId: boundedReference(amendment.id),
        fieldRef: boundedReference(replacement?.fieldRef),
        kind: replacement?.kind === "resource" ? "resource" : "",
        superseded: [...new Set((replacement?.superseded || []).map(normalizeResourceReference).filter(Boolean))].slice(0, MAX_REFERENCES_PER_REPLACEMENT),
        replacement: normalizeResourceReference(replacement?.replacement),
        replacementAliases: [...new Set((replacement?.replacementAliases || []).map(normalizeResourceReference).filter(Boolean))].slice(0, MAX_REFERENCES_PER_REPLACEMENT),
        sourceToolCallId: boundedReference(replacement?.sourceToolCallId),
        summary: boundedReference(amendment.summary).slice(0, 240)
      };
      if (normalized.fieldRef && normalized.kind && normalized.replacement && normalized.superseded.length) {
        activeByField.set(normalized.fieldRef, normalized);
      }
    }
  }
  return [...activeByField.values()].slice(-MAX_REPLACEMENTS);
}

function containsStructuralReference(value, reference) {
  const text = String(value || "").replace(/\\/g, "/");
  const normalized = normalizeResourceReference(reference);
  if (!text || !normalized) return false;
  if (normalizeResourceReference(text) === normalized) return true;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[\\s('"=<>\\[\\]])${escaped}(?=$|[\\s)'"<>\\]\\},;:.!?])`).test(text);
}

function findReferencesInValues(values, replacements) {
  const matches = [];
  for (const replacement of replacements) {
    const argumentPaths = [];
    let supersededReference = "";
    for (const value of values) {
      const hit = replacement.superseded.find((reference) => containsStructuralReference(value.value, reference));
      if (hit) {
        supersededReference ||= hit;
        argumentPaths.push(value.path);
      }
    }
    if (argumentPaths.length) matches.push({ ...replacement, supersededReference, argumentPaths: [...new Set(argumentPaths)] });
  }
  return matches;
}

/** Find superseded references only in arguments that produce an action's effect. */
function findStaleEffectReferences(toolName, args, contract) {
  const replacements = listActiveReferenceReplacements(contract);
  if (!replacements.length) return [];
  return findReferencesInValues(toolEffects.getProducedEffectValues(toolName, args), replacements);
}

/**
 * Record bounded post-action facts for completion assessment. Post-state content is
 * inspected when available but is never retained in the returned checks.
 */
function createPostActionReferenceChecks(toolName, args, mutationDetails, contract) {
  const replacements = listActiveReferenceReplacements(contract);
  if (!replacements.length) return [];
  const values = toolEffects.getProducedEffectValues(toolName, args).slice();
  const afterContent = mutationDetails?.compare?.afterContent;
  if (typeof afterContent === "string") values.push({ path: "post-state-content", value: afterContent });
  return replacements.map((replacement) => {
    const supersededLocations = [];
    const replacementLocations = [];
    for (const value of values) {
      if (replacement.superseded.some((reference) => containsStructuralReference(value.value, reference))) supersededLocations.push(value.path);
      if ([replacement.replacement, ...replacement.replacementAliases].some((reference) => containsStructuralReference(value.value, reference))) replacementLocations.push(value.path);
    }
    return {
      amendmentId: replacement.amendmentId,
      fieldRef: replacement.fieldRef,
      replacementFound: replacementLocations.length > 0,
      supersededFound: supersededLocations.length > 0,
      checkedLocations: [...new Set([...values.map((value) => value.path)])].slice(0, 20)
    };
  });
}

/** Find exact superseded resource references in arbitrary response text. */
function findSupersededReferencesInText(text, contract) {
  return listActiveReferenceReplacements(contract).filter((replacement) =>
    replacement.superseded.some((reference) => containsStructuralReference(text, reference))
  );
}

module.exports = {
  MAX_REPLACEMENTS,
  normalizeResourceReference,
  deriveReferenceReplacements,
  listActiveReferenceReplacements,
  findStaleEffectReferences,
  createPostActionReferenceChecks,
  findSupersededReferencesInText
};
