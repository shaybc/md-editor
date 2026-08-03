/**
 * Multi-turn intent relationship handling: merges a newly extracted contract with the
 * prior turn according to independent/continues/extends/corrects/uncertain semantics.
 *
 * Pure module: it performs no IO, provider calls, persistence, or UI work.
 */

"use strict";

const { normalizeIntentContract } = require("./intent-contract");

const { isCanonicalFieldRef } = require("./intent-field-references");

const UNCERTAIN_CONTRACT_MODES = Object.freeze({
  CURRENT_AUTHORITATIVE: "current-authoritative",
  PRIOR_GATED: "prior-gated"
});

function asCarried(entry) {
  return entry && typeof entry === "object" ? { ...entry, provenance: "carried" } : entry;
}

function nextAvailableId(prefix, used) {
  let ordinal = 1;
  while (used.has(`${prefix}${ordinal}`)) ordinal += 1;
  const id = `${prefix}${ordinal}`;
  used.add(id);
  return id;
}

function appendWithCollisionRemap(prior, current, prefix, options = {}) {
  const result = (prior || []).map(asCarried);
  const used = new Set(result.map((entry) => entry.id).filter(Boolean));
  const remaps = [];
  for (const entry of (current || [])) {
    const existing = result.find((candidate) => candidate.id && candidate.id === entry.id);
    if (existing && options.replaceCollisions === true) {
      result[result.indexOf(existing)] = entry;
      continue;
    }
    if (existing && JSON.stringify({ ...existing, provenance: undefined }) === JSON.stringify({ ...entry, provenance: undefined })) continue;
    if (existing) {
      const replacement = nextAvailableId(prefix, used);
      remaps.push({ from: entry.id, to: replacement });
      result.push({ ...entry, id: replacement });
      continue;
    }
    if (entry.id) used.add(entry.id);
    result.push(entry);
  }
  return { entries: result, remaps };
}

function preserveCarriedConstraints(prior, current, key, prefix) {
  const incoming = current[key] || [];
  const seenValues = new Set(incoming.map((entry) => String(entry.value || "").trim()).filter(Boolean));
  const preserved = (prior[key] || []).filter((entry) => !seenValues.has(String(entry.value || "").trim())).map(asCarried);
  return appendWithCollisionRemap(preserved, incoming, prefix, { replaceCollisions: false });
}

function mergeNamedTargets(prior, current, replaceCollisions) {
  const groups = {};
  const remaps = [];
  const groupNames = ["files", "symbols", "errors", "uiAreas"];
  for (const group of groupNames) groups[group] = (prior.namedTargets?.[group] || []).map(asCarried);
  const used = new Set(groupNames.flatMap((group) => groups[group].map((entry) => entry.id)).filter(Boolean));
  for (const group of groupNames) {
    for (const entry of (current.namedTargets?.[group] || [])) {
      const sameGroupIndex = groups[group].findIndex((candidate) => candidate.id === entry.id);
      if (sameGroupIndex >= 0 && replaceCollisions) {
        groups[group][sameGroupIndex] = entry;
        continue;
      }
      if (used.has(entry.id)) {
        const replacement = nextAvailableId("T", used);
        remaps.push({ from: entry.id, to: replacement });
        groups[group].push({ ...entry, id: replacement });
      } else {
        if (entry.id) used.add(entry.id);
        groups[group].push(entry);
      }
    }
  }
  return { groups, remaps };
}

function mergeContinuation(prior, current, relationship) {
  const supersededIds = new Set((current.supersededCriteria || []).map((entry) => typeof entry === "string" ? entry : entry?.id).filter(Boolean));
  const supersededPrior = (prior.acceptanceCriteria || []).filter((criterion) => supersededIds.has(criterion.id));
  const retainedPriorCriteria = (prior.acceptanceCriteria || []).filter((criterion) => !supersededIds.has(criterion.id));
  const criteria = appendWithCollisionRemap(retainedPriorCriteria, current.acceptanceCriteria, "AC", { replaceCollisions: false });
  const requested = appendWithCollisionRemap(prior.requestedActions, current.requestedActions, "RA", { replaceCollisions: false });
  const prohibited = preserveCarriedConstraints(prior, current, "prohibitedActions", "P");
  const scope = preserveCarriedConstraints(prior, current, "outOfScope", "S");
  const targets = mergeNamedTargets(prior, current, false);
  const assumptions = appendWithCollisionRemap(prior.assumptions, current.assumptions, "A", { replaceCollisions: false });
  const decisions = appendWithCollisionRemap(prior.unresolvedDecisions, current.unresolvedDecisions, "D", { replaceCollisions: false });
  return normalizeIntentContract({
    ...current,
    relationshipToPrior: relationship,
    requestedActions: requested.entries,
    prohibitedActions: prohibited.entries,
    outOfScope: scope.entries,
    acceptanceCriteria: criteria.entries,
    namedTargets: targets.groups,
    assumptions: assumptions.entries,
    unresolvedDecisions: decisions.entries,
    supersededCriteria: [...(prior.supersededCriteria || []), ...supersededPrior, ...(current.supersededCriteria || [])],
    idRemaps: [...(prior.idRemaps || []), ...criteria.remaps, ...requested.remaps, ...prohibited.remaps, ...scope.remaps, ...targets.remaps, ...assumptions.remaps, ...decisions.remaps]
  });
}

function replaceCorrectedCriteria(prior, current, correctedRefs) {
  const correctedIds = new Set(correctedRefs.filter((ref) => ref.startsWith("criterion:")).map((ref) => ref.slice("criterion:".length)));
  const replacements = new Map((current.acceptanceCriteria || []).map((criterion) => [criterion.id, criterion]));
  const active = [];
  const superseded = [...(prior.supersededCriteria || [])];
  for (const criterion of (prior.acceptanceCriteria || [])) {
    if (!correctedIds.has(criterion.id)) {
      active.push(asCarried(criterion));
      replacements.delete(criterion.id);
      continue;
    }
    superseded.push({ ...criterion, supersededByTurn: true });
    if (replacements.has(criterion.id)) active.push(replacements.get(criterion.id));
    replacements.delete(criterion.id);
  }
  active.push(...replacements.values());
  return { active, superseded };
}

function replaceCorrectedCollection(prior, current, correctedRefs, kind, prefix) {
  const correctedIds = new Set(correctedRefs.filter((ref) => ref.startsWith(`${kind}:`)).map((ref) => ref.slice(kind.length + 1)));
  const priorIds = new Set((prior || []).map((entry) => entry.id).filter(Boolean));
  const retained = (prior || []).filter((entry) => !correctedIds.has(entry.id));
  const acceptedCurrent = (current || []).filter((entry) => correctedIds.has(entry.id) || !priorIds.has(entry.id));
  return appendWithCollisionRemap(retained, acceptedCurrent, prefix, { replaceCollisions: false }).entries;
}

function replaceCorrectedTargets(prior, current, correctedRefs) {
  const correctedIds = new Set(correctedRefs.filter((ref) => ref.startsWith("target:")).map((ref) => ref.slice("target:".length)));
  const groups = {};
  for (const group of ["files", "symbols", "errors", "uiAreas"]) {
    const priorEntries = prior.namedTargets?.[group] || [];
    const priorIds = new Set(priorEntries.map((entry) => entry.id).filter(Boolean));
    const retained = priorEntries.filter((entry) => !correctedIds.has(entry.id));
    const acceptedCurrent = (current.namedTargets?.[group] || []).filter((entry) => correctedIds.has(entry.id) || !priorIds.has(entry.id));
    groups[group] = appendWithCollisionRemap(retained, acceptedCurrent, "T", { replaceCollisions: false }).entries;
  }
  return groups;
}

function mergeCorrection(prior, current) {
  const refs = (current.correctedFieldRefs || []).filter(isCanonicalFieldRef);
  const criteria = replaceCorrectedCriteria(prior, current, refs);
  const base = normalizeIntentContract({
    ...current,
    clarifications: [...(prior.clarifications || []), ...(current.clarifications || [])],
    amendments: [...(prior.amendments || []), ...(current.amendments || [])],
    revisions: [...(prior.revisions || []), ...(current.revisions || [])],
    idRemaps: [...(prior.idRemaps || []), ...(current.idRemaps || [])]
  });
  return normalizeIntentContract({
    ...base,
    relationshipToPrior: "corrects",
    goal: refs.includes("goal") ? current.goal : asCarried(prior.goal),
    expectedOutcome: refs.includes("expectedOutcome") ? current.expectedOutcome : asCarried(prior.expectedOutcome),
    requestedActions: replaceCorrectedCollection(prior.requestedActions, current.requestedActions, refs, "requestedAction", "RA"),
    prohibitedActions: replaceCorrectedCollection(prior.prohibitedActions, current.prohibitedActions, refs, "prohibitedAction", "P"),
    outOfScope: replaceCorrectedCollection(prior.outOfScope, current.outOfScope, refs, "outOfScope", "S"),
    acceptanceCriteria: criteria.active,
    namedTargets: replaceCorrectedTargets(prior, current, refs),
    assumptions: replaceCorrectedCollection(prior.assumptions, current.assumptions, refs, "assumption", "A"),
    unresolvedDecisions: replaceCorrectedCollection(prior.unresolvedDecisions, current.unresolvedDecisions, refs, "decision", "D"),
    supersededCriteria: criteria.superseded,
    correctedFieldRefs: refs
  });
}

/**
 * Build one of the two harness-owned uncertain relationship states.
 * @param {{ prior?: object, current: object, mode: "current-authoritative"|"prior-gated" }} options Relationship inputs.
 * @returns {object} A normalized uncertain contract.
 */
function buildUncertainContract(options = {}) {
  const prior = options.prior || normalizeIntentContract({});
  const current = normalizeIntentContract(options.current);
  const mode = options.mode;
  if (!Object.values(UNCERTAIN_CONTRACT_MODES).includes(mode)) {
    throw new Error("An explicit uncertain contract mode is required.");
  }
  if (mode === UNCERTAIN_CONTRACT_MODES.CURRENT_AUTHORITATIVE) {
    const ambiguityIds = new Set((current.ambiguities || []).map((ambiguity) => ambiguity.id));
    return normalizeIntentContract({
      ...current,
      relationshipToPrior: "uncertain",
      relationshipEvidence: [],
      carriedFieldRefs: [],
      correctedFieldRefs: [],
      supersededCriteria: [],
      ambiguities: [...(current.ambiguities || []), {
        id: nextAvailableId("AMB", ambiguityIds),
        question: "How does this request relate to the previous task?",
        reason: "The relationship to prior intent is unresolved; the current request remains authoritative.",
        impact: "low",
        blocking: false,
        safetyOrScopeCritical: false,
        suggestedAnswers: ["independent", "continues", "extends", "corrects"]
      }]
    });
  }
  const ambiguityId = `AMB${(prior.ambiguities || []).length + 1}`;
  const decisionId = `D${(prior.unresolvedDecisions || []).length + 1}`;
  return normalizeIntentContract({
    ...prior,
    source: current.source,
    relationshipToPrior: "uncertain",
    taskType: current.taskType,
    goal: asCarried(prior.goal),
    expectedOutcome: asCarried(prior.expectedOutcome),
    ambiguities: [...(prior.ambiguities || []), {
      id: ambiguityId,
      question: "Does this request continue, extend, correct, or replace the previous task?",
      reason: "The relationship to the prior intent could not be determined safely.",
      impact: "high",
      blocking: true,
      safetyOrScopeCritical: true,
      suggestedAnswers: ["continues", "extends", "corrects", "independent"]
    }],
    unresolvedDecisions: [...(prior.unresolvedDecisions || []), {
      id: decisionId,
      description: "Resolve how this request relates to the previous intent before dependent mutations.",
      blocking: true,
      controlsMutation: true,
      controlledCapabilities: [],
      controlledTargets: []
    }],
    pendingRelationshipContract: current
  });
}

function preserveUncertainRelationship(prior, current) {
  return buildUncertainContract({ prior, current, mode: UNCERTAIN_CONTRACT_MODES.PRIOR_GATED });
}

function findPriorField(prior, ref) {
  if (ref === "goal" || ref === "expectedOutcome") return { field: ref, value: prior[ref] };
  const separator = ref.indexOf(":");
  if (separator < 0) return null;
  const kind = ref.slice(0, separator);
  const id = ref.slice(separator + 1);
  const collections = {
    requestedAction: ["requestedActions", prior.requestedActions],
    prohibitedAction: ["prohibitedActions", prior.prohibitedActions],
    outOfScope: ["outOfScope", prior.outOfScope],
    criterion: ["acceptanceCriteria", prior.acceptanceCriteria],
    assumption: ["assumptions", prior.assumptions],
    decision: ["unresolvedDecisions", prior.unresolvedDecisions]
  };
  if (kind === "target") {
    for (const group of ["files", "symbols", "errors", "uiAreas"]) {
      const value = (prior.namedTargets?.[group] || []).find((entry) => entry.id === id);
      if (value) return { field: "namedTargets", group, value };
    }
    return null;
  }
  const collection = collections[kind];
  const value = collection?.[1]?.find((entry) => entry.id === id);
  return value ? { field: collection[0], value } : null;
}

function mergeSelectedPriorFields(prior, current, relationship) {
  const merged = {
    ...current,
    relationshipToPrior: relationship,
    idRemaps: [...(current.idRemaps || [])],
    namedTargets: Object.fromEntries(["files", "symbols", "errors", "uiAreas"].map((group) => [group, [...(current.namedTargets?.[group] || [])]]))
  };
  const prefixes = {
    requestedActions: "RA",
    prohibitedActions: "P",
    outOfScope: "S",
    acceptanceCriteria: "AC",
    assumptions: "A",
    unresolvedDecisions: "D",
    namedTargets: "T"
  };
  for (const ref of current.carriedFieldRefs || []) {
    const selected = findPriorField(prior, ref);
    if (!selected?.value) continue;
    if (selected.field === "goal" || selected.field === "expectedOutcome") {
      if (relationship === "continues") merged[selected.field] = asCarried(selected.value);
      continue;
    }
    if (selected.field === "namedTargets") {
      const entries = merged.namedTargets[selected.group];
      const collision = entries.find((entry) => entry.id === selected.value.id);
      if (collision) {
        const used = new Set(Object.values(merged.namedTargets).flat().map((entry) => entry.id).filter(Boolean));
        const replacement = nextAvailableId(prefixes.namedTargets, used);
        entries[entries.indexOf(collision)] = { ...collision, id: replacement };
        merged.idRemaps.push({ from: collision.id, to: replacement });
      }
      entries.unshift(asCarried(selected.value));
      continue;
    }
    const entries = [...(merged[selected.field] || [])];
    const collision = entries.find((entry) => entry.id === selected.value.id);
    if (collision) {
      const used = new Set(entries.map((entry) => entry.id).filter(Boolean));
      const replacement = nextAvailableId(prefixes[selected.field], used);
      entries[entries.indexOf(collision)] = { ...collision, id: replacement };
      merged.idRemaps.push({ from: collision.id, to: replacement });
    }
    entries.unshift(asCarried(selected.value));
    merged[selected.field] = entries;
  }
  return normalizeIntentContract(merged);
}

/**
 * Apply the extracted relationship to a prior contract.
 * @param {object|null} prior - Prior normalized contract, if one exists.
 * @param {object} current - Newly normalized contract.
 * @returns {object} The authoritative contract for the current turn.
 */
function mergeIntentContracts(prior, current) {
  if (!prior || current.relationshipToPrior === "independent") return current;
  if (current.relationshipToPrior === "continues") return mergeSelectedPriorFields(prior, current, "continues");
  if (current.relationshipToPrior === "extends") return mergeSelectedPriorFields(prior, current, "extends");
  if (current.relationshipToPrior === "corrects") return mergeCorrection(prior, current);
  return buildUncertainContract({ prior, current, mode: UNCERTAIN_CONTRACT_MODES.CURRENT_AUTHORITATIVE });
}

module.exports = {
  UNCERTAIN_CONTRACT_MODES,
  buildUncertainContract,
  preserveUncertainRelationship,
  mergeIntentContracts
};
