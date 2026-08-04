/**
 * Bounded verification evidence views and freshness identities for Agent completion.
 *
 * The existing completion ledger remains the canonical recorder. This module derives
 * immutable verification snapshots without changing ledger recording semantics.
 */

"use strict";

const crypto = require("node:crypto");
const { CANDIDATE_EVIDENCE_ID, isEvidenceAdmissible } = require("./completion-evidence-ledger");
const { deriveCriterionClaimType } = require("./intent-claim-type");
const {
  getCriterionEvidenceFamilies,
  getCriterionFileTargets,
  isToolInEvidenceFamily
} = require("./agent-tool-effect-registry");

const MAX_EVIDENCE_PER_CRITERION = 20;
const MAX_EVIDENCE_TOTAL = 120;

function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

/** Return a stable SHA-256 identity for one JSON-compatible value. */
function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
}

function matchesCriterion(entry, criterion, contract) {
  if (entry?.id === CANDIDATE_EVIDENCE_ID) return deriveCriterionClaimType(criterion, contract) !== "workspace-state";
  if (entry?.source !== "tool") return false;
  const families = getCriterionEvidenceFamilies(criterion, contract);
  if (families.length && !families.some((family) => isToolInEvidenceFamily(entry.tool, family))) return false;
  const targets = getCriterionFileTargets(criterion, contract).map(normalizePath).filter(Boolean);
  const files = (entry.files || []).map(normalizePath).filter(Boolean);
  return !targets.length || !files.length || files.some((file) => targets.some((target) => file === target || file.endsWith(`/${target}`) || target.endsWith(`/${file}`)));
}

function hasExactTarget(entry, criterion, contract) {
  const targets = getCriterionFileTargets(criterion, contract).map(normalizePath).filter(Boolean);
  const files = (entry?.files || []).map(normalizePath).filter(Boolean);
  return targets.length > 0 && files.some((file) => targets.some((target) => file === target || file.endsWith(`/${target}`) || target.endsWith(`/${file}`)));
}

function hasRelevantReferenceCheck(entry, criterion, contract) {
  if (!(entry?.referenceChecks || []).length) return false;
  const targets = getCriterionFileTargets(criterion, contract).map(normalizePath).filter(Boolean);
  if (!targets.length) return true;
  const locations = [
    ...(entry.files || []),
    ...(entry.referenceChecks || []).flatMap((check) => check?.checkedLocations || [])
  ].map(normalizePath).filter(Boolean);
  return locations.some((location) => targets.some((target) =>
    location === target || location.endsWith(`/${target}`) || target.endsWith(`/${location}`)));
}

function evidenceSequence(entry) {
  const match = String(entry?.id || "").match(/^EV(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function sortEvidence(entries, criterion, contract, citedIds) {
  const citedOrder = new Map(citedIds.map((id, index) => [id, index]));
  return [...entries].sort((left, right) => {
    const leftCited = citedOrder.has(left.id) ? citedOrder.get(left.id) : Number.MAX_SAFE_INTEGER;
    const rightCited = citedOrder.has(right.id) ? citedOrder.get(right.id) : Number.MAX_SAFE_INTEGER;
    if (leftCited !== rightCited) return leftCited - rightCited;
    const targetDifference = Number(hasExactTarget(right, criterion, contract)) - Number(hasExactTarget(left, criterion, contract));
    if (targetDifference) return targetDifference;
    const confirmationDifference = Number(right.successConfirmedIndependently === true) - Number(left.successConfirmedIndependently === true);
    if (confirmationDifference) return confirmationDifference;
    return evidenceSequence(right) - evidenceSequence(left);
  });
}

/**
 * Select the deterministic bounded evidence subset for one verification request.
 * @param {{entries?: object[], contract?: object, citedEvidenceIds?: string[]}} options Selection inputs.
 * @returns {object} Selected entries, criterion references, and overflow metadata.
 */
function buildBoundedEvidenceSnapshot(options = {}) {
  const entries = cloneSerializable(Array.isArray(options.entries) ? options.entries : []);
  const contract = options.contract || {};
  const citedEvidenceIds = [...new Set((options.citedEvidenceIds || []).map(String).filter(Boolean))].slice(0, 50);
  const byId = new Map(entries.map((entry) => [String(entry?.id || ""), entry]));
  const selectedById = new Map();
  const criterionEvidence = [];
  const truncatedCriterionIds = [];

  for (const id of citedEvidenceIds) {
    if (byId.has(id)) selectedById.set(id, byId.get(id));
  }
  for (const criterion of (contract.acceptanceCriteria || [])) {
    const relevantEntries = entries.filter((entry) =>
      matchesCriterion(entry, criterion, contract) || hasRelevantReferenceCheck(entry, criterion, contract));
    const relevant = sortEvidence(relevantEntries, criterion, contract, citedEvidenceIds);
    if (relevant.length > MAX_EVIDENCE_PER_CRITERION) truncatedCriterionIds.push(String(criterion.id));
    const selected = relevant.slice(0, MAX_EVIDENCE_PER_CRITERION);
    selected.forEach((entry) => selectedById.set(entry.id, entry));
    criterionEvidence.push({ criterionId: String(criterion.id || ""), relevantEvidenceIds: selected.map((entry) => entry.id) });
  }

  const union = [...selectedById.values()];
  if (union.length > MAX_EVIDENCE_TOTAL) {
    const retainedIds = new Set(union.slice(0, MAX_EVIDENCE_TOTAL).map((entry) => entry.id));
    for (const criterion of criterionEvidence) {
      if (criterion.relevantEvidenceIds.some((id) => !retainedIds.has(id))) truncatedCriterionIds.push(criterion.criterionId);
      criterion.relevantEvidenceIds = criterion.relevantEvidenceIds.filter((id) => retainedIds.has(id));
    }
  }
  const selectedEntries = union.slice(0, MAX_EVIDENCE_TOTAL);
  return {
    entries: cloneSerializable(selectedEntries),
    criterionEvidence,
    citedEvidenceIds,
    unknownCitedEvidenceIds: citedEvidenceIds.filter((id) => !byId.has(id)),
    truncatedCriterionIds: [...new Set(truncatedCriterionIds)],
    evidenceIndex: selectedEntries.map((entry) => ({ id: entry.id, admissible: isEvidenceAdmissible(entry) })),
    selectionFingerprint: fingerprint(selectedEntries)
  };
}

/**
 * Track content-derived evidence versions for one request-scoped completion ledger.
 * @param {() => object[]} listEvidence Read-only ledger snapshot callback.
 * @returns {{snapshot: Function}} Monotonic freshness tracker.
 */
function createVerificationEvidenceTracker(listEvidence) {
  const initial = typeof listEvidence === "function" ? listEvidence() : [];
  const initialEntries = Array.isArray(initial) ? initial : (initial?.entries || []);
  let evidenceVersion = Number(initial?.evidenceVersion) || 0;
  let priorFingerprint = String(initial?.evidenceFingerprint || fingerprint(initialEntries));
  return {
    snapshot() {
      const source = typeof listEvidence === "function" ? listEvidence() : [];
      const entries = cloneSerializable(Array.isArray(source) ? source : (source?.entries || []));
      const evidenceFingerprint = String(source?.evidenceFingerprint || fingerprint(entries));
      if (Number.isFinite(Number(source?.evidenceVersion))) {
        evidenceVersion = Number(source.evidenceVersion);
      } else if (evidenceFingerprint !== priorFingerprint) {
        evidenceVersion += 1;
      }
      priorFingerprint = evidenceFingerprint;
      return { evidenceVersion, evidenceFingerprint, entries };
    }
  };
}

module.exports = {
  MAX_EVIDENCE_PER_CRITERION,
  MAX_EVIDENCE_TOTAL,
  buildBoundedEvidenceSnapshot,
  createVerificationEvidenceTracker,
  fingerprint
};
