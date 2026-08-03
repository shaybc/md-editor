/**
 * Raw intent-contract validation. Rejects malformed extractor output before the model
 * layer can normalize enums, provenance, IDs, or canonical correction references.
 *
 * Pure module: no IO, provider calls, persistence, or UI side effects.
 */

"use strict";

const {
  TASK_TYPES,
  RELATIONSHIP_VALUES,
  PROVENANCE_VALUES,
  TARGET_KINDS_BY_GROUP
} = require("./intent-contract");

const MAX_CRITERIA = 100;
const { FIELD_REF_PATTERN, collectCanonicalFieldRefs } = require("./intent-field-references");

const RELATIONSHIP_VALIDATION_ERRORS = Object.freeze(new Set([
  "missing-relationship-evidence",
  "relationship-evidence-not-in-current-prompt",
  "missing-carried-field-ref",
  "invalid-carried-field-ref",
  "unexpected-carried-field-ref",
  "missing-corrected-field-refs",
  "invalid-corrected-field-ref",
  "unresolvable-corrected-field-ref",
  "unexpected-corrected-field-ref",
  "relationship-without-prior-contract",
  "missing-or-unsupported-relationship",
  "unsupported-relationship"
]));

/** Return true when validation failed exclusively in the multi-turn relationship protocol. */
function isRelationshipOnly(errors) {
  return Array.isArray(errors) && errors.length > 0
    && errors.every((error) => RELATIONSHIP_VALIDATION_ERRORS.has(String(error || "")));
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return String(value == null ? "" : value).trim().length > 0;
}

function normalizeEvidenceText(value) {
  return String(value == null ? "" : value).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}


/**
 * Validate capture_intent_contract arguments before normalization.
 * @param {unknown} payload - Raw tool arguments.
 * @param {{ hasPriorContract?: boolean, priorContract?: object, currentPrompt?: string }} [options] - Multi-turn context.
 * @returns {{ valid: boolean, errors: string[] }} Raw validation outcome.
 */
function validateRawIntentContract(payload, options = {}) {
  const errors = [];
  if (!isPlainObject(payload)) return { valid: false, errors: ["invalid-shape"] };
  if (!TASK_TYPES.includes(payload.taskType)) errors.push("unsupported-task-type");
  if (options.hasPriorContract && !RELATIONSHIP_VALUES.includes(payload.relationshipToPrior)) errors.push("missing-or-unsupported-relationship");
  if (payload.relationshipToPrior != null && !RELATIONSHIP_VALUES.includes(payload.relationshipToPrior)) errors.push("unsupported-relationship");
  const relationship = payload.relationshipToPrior || "independent";
  const relationshipEvidence = Array.isArray(payload.relationshipEvidence) ? payload.relationshipEvidence : [];
  const carriedRefs = Array.isArray(payload.carriedFieldRefs) ? payload.carriedFieldRefs : [];
  if (!Array.isArray(payload.relationshipEvidence) || !Array.isArray(payload.carriedFieldRefs)) errors.push("invalid-shape");
  const normalizedPrompt = normalizeEvidenceText(options.currentPrompt);
  if (relationship !== "independent" && relationshipEvidence.length === 0) errors.push("missing-relationship-evidence");
  if (relationshipEvidence.some((entry) => !isPlainObject(entry) || !hasText(entry.quote) || !hasText(entry.explanation))) {
    errors.push("missing-relationship-evidence");
  }
  if (relationshipEvidence.some((entry) => !normalizedPrompt.includes(normalizeEvidenceText(entry?.quote)))) {
    errors.push("relationship-evidence-not-in-current-prompt");
  }
  if (relationship !== "continues" && relationship !== "extends" && carriedRefs.length > 0) errors.push("unexpected-carried-field-ref");
  if ((relationship === "continues" || relationship === "extends") && carriedRefs.length === 0) errors.push("missing-carried-field-ref");
  if (relationship === "continues" && (!carriedRefs.includes("goal") || !carriedRefs.includes("expectedOutcome"))) {
    errors.push("missing-carried-field-ref");
  }
  if (carriedRefs.some((ref) => !FIELD_REF_PATTERN.test(String(ref || "")))) errors.push("invalid-carried-field-ref");
  if (!options.hasPriorContract && relationship !== "independent") errors.push("relationship-without-prior-contract");
  if (!options.hasPriorContract && (relationshipEvidence.length > 0 || carriedRefs.length > 0)) errors.push("relationship-without-prior-contract");
  if (options.hasPriorContract && isPlainObject(options.priorContract)) {
    const known = new Set(collectCanonicalFieldRefs(options.priorContract));
    if (carriedRefs.some((ref) => !known.has(ref))) errors.push("invalid-carried-field-ref");
  }

  const validateTaggedValue = (field, label, valueKey = "value") => {
    if (!isPlainObject(field) || !hasText(field[valueKey])) errors.push(`missing-${label}`);
    if (!isPlainObject(field) || !PROVENANCE_VALUES.includes(field.provenance)) errors.push(`missing-or-unsupported-${label}-provenance`);
  };
  const validateTaggedList = (value, label, valueKey) => {
    if (value == null) return;
    if (!Array.isArray(value)) {
      errors.push(`invalid-${label}`);
      return;
    }
    // valueKey may be a single field name or a list of acceptable field names
    // (criteria accept the v6 `statement` or the legacy `description`).
    const valueKeys = Array.isArray(valueKey) ? valueKey : [valueKey];
    for (const entry of value) {
      const hasValue = isPlainObject(entry) && valueKeys.some((key) => hasText(entry[key]));
      if (!hasValue) errors.push(`invalid-${label}`);
      if (!isPlainObject(entry) || !PROVENANCE_VALUES.includes(entry.provenance)) errors.push(`missing-or-unsupported-${label}-provenance`);
    }
  };
  validateTaggedValue(payload.goal, "goal");
  validateTaggedValue(payload.expectedOutcome, "expected-outcome");
  validateTaggedList(payload.requestedActions, "requested-action", "value");
  validateTaggedList(payload.prohibitedActions, "prohibited-action", "value");
  validateTaggedList(payload.outOfScope, "out-of-scope", "value");
  validateTaggedList(payload.acceptanceCriteria, "criterion", ["statement", "description"]);
  validateTaggedList(payload.assumptions, "assumption", "statement");
  if (!Array.isArray(payload.acceptanceCriteria) || payload.acceptanceCriteria.length === 0) errors.push("missing-criteria");
  if (Array.isArray(payload.acceptanceCriteria) && payload.acceptanceCriteria.length > MAX_CRITERIA) errors.push("over-limit");

  const suppliedIds = [];
  const collectIds = (list) => (Array.isArray(list) ? list : []).forEach((entry) => {
    if (isPlainObject(entry) && hasText(entry.id)) suppliedIds.push(String(entry.id).trim());
  });
  for (const list of [payload.acceptanceCriteria, payload.requestedActions, payload.prohibitedActions, payload.outOfScope, payload.assumptions, payload.unresolvedDecisions, payload.ambiguities]) collectIds(list);
  const targetGroups = isPlainObject(payload.namedTargets) ? payload.namedTargets : {};
  for (const group of Object.keys(TARGET_KINDS_BY_GROUP)) {
    const targets = targetGroups[group];
    if (targets != null && !Array.isArray(targets)) errors.push(`invalid-target-group-${group}`);
    for (const target of (Array.isArray(targets) ? targets : [])) {
      if (!isPlainObject(target) || !hasText(target.value)) errors.push("invalid-target");
      if (!isPlainObject(target) || !TARGET_KINDS_BY_GROUP[group].includes(target.kind)) errors.push("missing-or-unsupported-target-kind");
    }
    collectIds(targets);
  }
  if (new Set(suppliedIds).size !== suppliedIds.length) errors.push("duplicate-supplied-id");

  const correctedRefs = Array.isArray(payload.correctedFieldRefs) ? payload.correctedFieldRefs : [];
  if (payload.relationshipToPrior === "corrects" && correctedRefs.length === 0) errors.push("missing-corrected-field-refs");
  if (payload.relationshipToPrior !== "corrects" && correctedRefs.length > 0) errors.push("unexpected-corrected-field-ref");
  if (correctedRefs.some((ref) => !FIELD_REF_PATTERN.test(String(ref || "")))) errors.push("invalid-corrected-field-ref");
  if (payload.relationshipToPrior === "corrects" && isPlainObject(options.priorContract)) {
    const known = new Set(collectCanonicalFieldRefs(options.priorContract));
    if (correctedRefs.some((ref) => !known.has(ref))) errors.push("unresolvable-corrected-field-ref");
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

module.exports = {
  RELATIONSHIP_VALIDATION_ERRORS,
  isRelationshipOnly,
  validateRawIntentContract
};
