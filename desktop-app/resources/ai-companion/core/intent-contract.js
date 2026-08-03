/**
 * Intent contract model: schema, normalization, validation, fallback creation,
 * request identity (fingerprint + conversation anchor), and the compacted system
 * message used to reinject the authoritative contract into every model round.
 *
 * This module is pure: it performs no IO, no provider calls, and no UI side effects.
 * The extraction/clarification flow (intent-analysis.js) and the tool loop consume it.
 */

"use strict";

const crypto = require("node:crypto");
const { isCanonicalFieldRef } = require("./intent-field-references");
const correctionConsistency = require("./intent-correction-consistency");
const {
  criterionHasCheckableState,
  deriveCriterionClaimType,
  hasChangeAction
} = require("./intent-claim-type");

/** Intent-contract schema version. Distinct from the task-record and prompt-profile schemas. */
const INTENT_CONTRACT_SCHEMA_VERSION = 6;

/** Task classifications the extractor may assign. */
const TASK_TYPES = Object.freeze(["answer", "diagnostic", "planning", "implementation", "conformance"]);

/**
 * Acceptance-criterion shapes (schema v6). Drives the per-task-type quality gate (Task 3)
 * and the content-level verifier (Phase 2). See PLAN-retrofit-phase0-schema.md section 3.
 */
const CRITERION_SHAPES = Object.freeze([
  "ears-ubiquitous", "ears-event", "ears-state", "ears-unwanted", "ears-optional",
  "diagnostic-finding", "conformance-inspection", "conformance-comparison",
  "conditional-action", "prohibited-action", "response-content", "planning-coverage"
]);

/** How a turn relates to the prior turn's contract. */
const RELATIONSHIP_VALUES = Object.freeze(["independent", "continues", "extends", "corrects", "uncertain"]);

/**
 * Provenance values ordered from most to least user-authoritative.
 * - explicit: directly stated by the user.
 * - clarified: established through a clarification answer.
 * - inferred: supplied by the extractor.
 * - carried: inherited from a prior turn's contract.
 * - uninterpreted: verbatim user text copied into a fallback contract without interpretation.
 */
const PROVENANCE_VALUES = Object.freeze(["explicit", "clarified", "inferred", "carried", "uninterpreted"]);

/** Named-target kinds; each selects a different absence rule downstream. */
const TARGET_KINDS = Object.freeze({
  files: "file-path",
  symbols: "symbol",
  errors: "error-text",
  uiAreas: "ui-area"
});

/** Allowed target kinds by named-target group. Files may be paths or basenames. */
const TARGET_KINDS_BY_GROUP = Object.freeze({
  files: Object.freeze(["file-path", "filename"]),
  symbols: Object.freeze(["symbol"]),
  errors: Object.freeze(["error-text"]),
  uiAreas: Object.freeze(["ui-area"])
});

/** Compacted-injection limits (see buildContractInjectionMessage). */
const DEFAULT_INJECTED_MAX_CHARS = 3500;
const HARD_INJECTED_MAX_CHARS = 6000;
const MAX_INJECTED_CRITERIA = 12;
const MAX_INJECTED_TARGETS = 20;

/** Structural bounds enforced during validation. */
const MAX_CRITERIA = 100;
const MAX_STRING_CHARS = 4000;
const CRITERION_GOAL_OVERLAP_THRESHOLD = 0.8;
const OVERLAP_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "if", "in",
  "is", "it", "of", "on", "or", "that", "the", "then", "this", "to", "was", "were", "with"
]);

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value, maxChars = MAX_STRING_CHARS) {
  return String(value == null ? "" : value).slice(0, maxChars);
}

/**
 * Normalize a free-form prompt for stable comparison and fingerprinting.
 *
 * @param {string} prompt - Raw user prompt.
 * @returns {string} Whitespace-collapsed, trimmed prompt text.
 */
function normalizePromptText(prompt) {
  return String(prompt == null ? "" : prompt).replace(/\s+/g, " ").trim();
}

function overlapTokens(value) {
  return [...new Set(String(value || "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !OVERLAP_STOPWORDS.has(token)))];
}

/** Measure normalized token containment between a criterion and goal. */
function criterionGoalOverlap(criterion, goal) {
  const criterionTokens = overlapTokens(criterion?.description || criterion);
  const goalTokens = overlapTokens(goal?.value || goal);
  if (criterionTokens.length < 2 || goalTokens.length < 2) return 0;
  const goalSet = new Set(goalTokens);
  const shared = criterionTokens.filter((token) => goalSet.has(token)).length;
  return shared / Math.min(criterionTokens.length, goalTokens.length);
}

/** Decide whether a criterion merely restates the goal instead of defining an outcome. */
function criterionRestatesGoal(criterion, goal, threshold = CRITERION_GOAL_OVERLAP_THRESHOLD) {
  return criterionGoalOverlap(criterion, goal) >= threshold;
}

/**
 * Coerce a provenance value to the allowed set.
 *
 * @param {unknown} value - Candidate provenance.
 * @param {string} fallback - Provenance to use when the candidate is invalid.
 * @returns {string} A valid provenance value.
 */
function normalizeProvenance(value, fallback = "inferred") {
  return PROVENANCE_VALUES.includes(value) ? value : fallback;
}

/**
 * Normalize a singleton { value, provenance } field such as goal or expectedOutcome.
 *
 * @param {unknown} field - Candidate field.
 * @param {string} provenanceFallback - Provenance used when unspecified/invalid.
 * @returns {{ value: string, provenance: string }} Normalized field.
 */
function normalizeValueField(field, provenanceFallback = "inferred") {
  const source = isPlainObject(field) ? field : { value: field };
  return {
    value: boundedString(source.value).trim(),
    provenance: normalizeProvenance(source.provenance, provenanceFallback)
  };
}

/**
 * Normalize a provenance-tagged list (requestedActions, prohibitedActions, outOfScope),
 * assigning stable sequential IDs under the given prefix when absent.
 *
 * @param {unknown} list - Candidate array.
 * @param {string} prefix - ID prefix (e.g. "RA", "P", "S").
 * @param {string} provenanceFallback - Provenance used when unspecified.
 * @returns {Array<{ id: string, value: string, provenance: string }>} Normalized entries.
 */
function normalizeProvenanceList(list, prefix, provenanceFallback) {
  if (!Array.isArray(list)) return [];
  const used = new Set();
  return list
    .map((entry, index) => {
      const source = isPlainObject(entry) ? entry : { value: entry };
      const id = allocateId(source.id, prefix, index + 1, used);
      return { id, value: boundedString(source.value).trim(), provenance: normalizeProvenance(source.provenance, provenanceFallback) };
    })
    .filter((entry) => entry.value);
}

/**
 * Allocate a stable, collision-free ID for a list entry.
 *
 * @param {unknown} preferred - Candidate ID supplied by the extractor.
 * @param {string} prefix - ID prefix.
 * @param {number} ordinal - 1-based position used to synthesize an ID when needed.
 * @param {Set<string>} used - Set of IDs already taken; updated in place.
 * @returns {string} A unique ID.
 */
function allocateId(preferred, prefix, ordinal, used) {
  const candidate = typeof preferred === "string" && preferred.trim() ? preferred.trim() : `${prefix}${ordinal}`;
  let unique = candidate;
  let counter = ordinal;
  while (used.has(unique)) unique = `${prefix}${++counter}`;
  used.add(unique);
  return unique;
}

/**
 * Normalize acceptance criteria, assigning stable AC IDs and preserving verification text.
 *
 * @param {unknown} list - Candidate criteria array.
 * @returns {Array<object>} Normalized criteria (id, description, verification, provenance).
 */
function normalizeCriteria(list) {
  if (!Array.isArray(list)) return [];
  const used = new Set();
  return list
    .map((entry, index) => {
      const source = isPlainObject(entry) ? entry : { description: entry };
      // v6: statement is canonical; description kept as a back-compat alias so
      // claim-type/evidence code that still reads `description` keeps working.
      const statement = boundedString(source.statement || source.description).trim();
      const evidenceRequired = boundedString(source.evidenceRequired || source.verification).trim();
      const shape = CRITERION_SHAPES.includes(source.shape) ? source.shape : "";
      const mustInspect = Array.isArray(source.mustInspect)
        ? source.mustInspect.map((item) => boundedString(item).trim()).filter(Boolean)
        : [];
      return {
        id: allocateId(source.id, "AC", index + 1, used),
        shape,
        statement,
        description: statement,
        sourceSpan: boundedString(source.sourceSpan).trim(),
        mustInspect,
        evidenceRequired,
        verification: evidenceRequired,
        provenance: normalizeProvenance(source.provenance, "inferred")
      };
    })
    .filter((entry) => entry.statement);
}

/**
 * Normalize the namedTargets groups, tagging each entry with its target kind and a
 * verification status, and assigning stable T IDs across all groups.
 *
 * @param {unknown} targets - Candidate namedTargets object.
 * @returns {object} Normalized namedTargets with files/symbols/errors/uiAreas arrays.
 */
function normalizeNamedTargets(targets) {
  const source = isPlainObject(targets) ? targets : {};
  const used = new Set();
  let ordinal = 0;
  const normalizeGroup = (groupKey) => {
    const entries = Array.isArray(source[groupKey]) ? source[groupKey] : [];
    return entries
      .map((entry) => {
        const item = isPlainObject(entry) ? entry : { value: entry };
        ordinal += 1;
        return {
          id: allocateId(item.id, "T", ordinal, used),
          value: boundedString(item.value).trim(),
          kind: TARGET_KINDS_BY_GROUP[groupKey].includes(item.kind) ? item.kind : TARGET_KINDS[groupKey],
          source: boundedString(item.source || "prompt").trim(),
          status: ["unverified", "confirmed", "absent"].includes(item.status) ? item.status : "unverified"
        };
      })
      .filter((entry) => entry.value);
  };
  return {
    files: normalizeGroup("files"),
    symbols: normalizeGroup("symbols"),
    errors: normalizeGroup("errors"),
    uiAreas: normalizeGroup("uiAreas")
  };
}

/**
 * Normalize assumptions, preserving the evidence-association fields (kind, relatedTargets,
 * keywords) that later let discovery contradict a conceptual assumption.
 *
 * @param {unknown} list - Candidate assumptions array.
 * @returns {Array<object>} Normalized assumptions.
 */
function normalizeAssumptions(list) {
  if (!Array.isArray(list)) return [];
  const used = new Set();
  return list
    .map((entry, index) => {
      const source = isPlainObject(entry) ? entry : { statement: entry };
      return {
        id: allocateId(source.id, "A", index + 1, used),
        statement: boundedString(source.statement).trim(),
        kind: ["locational", "behavioral", "environmental", "policy"].includes(source.kind) ? source.kind : "behavioral",
        risk: ["low", "medium", "high"].includes(source.risk) ? source.risk : "low",
        provenance: normalizeProvenance(source.provenance, "inferred"),
        relatedTargets: Array.isArray(source.relatedTargets) ? source.relatedTargets.map((id) => boundedString(id, 40).trim()).filter(Boolean) : [],
        keywords: Array.isArray(source.keywords) ? source.keywords.map((word) => boundedString(word, 60).trim()).filter(Boolean) : []
      };
    })
    .filter((entry) => entry.statement);
}

/**
 * Normalize unresolved decisions, preserving the mutation-control scope used to block
 * exactly the dependent mutations.
 *
 * @param {unknown} list - Candidate decisions array.
 * @returns {Array<object>} Normalized decisions.
 */
function normalizeDecisions(list) {
  if (!Array.isArray(list)) return [];
  const used = new Set();
  return list
    .map((entry, index) => {
      const source = isPlainObject(entry) ? entry : { description: entry };
      return {
        id: allocateId(source.id, "D", index + 1, used),
        description: boundedString(source.description).trim(),
        blocking: source.blocking === true,
        controlsMutation: source.controlsMutation === true,
        controlledCapabilities: Array.isArray(source.controlledCapabilities) ? source.controlledCapabilities.map((cap) => boundedString(cap, 80).trim()).filter(Boolean) : [],
        controlledTargets: Array.isArray(source.controlledTargets) ? source.controlledTargets.map((id) => boundedString(id, 40).trim()).filter(Boolean) : []
      };
    })
    .filter((entry) => entry.description);
}

/**
 * Normalize ambiguities, including the status/resolution state used by the Plan
 * finalization gate.
 *
 * @param {unknown} list - Candidate ambiguities array.
 * @returns {Array<object>} Normalized ambiguities.
 */
function normalizeAmbiguities(list) {
  if (!Array.isArray(list)) return [];
  const used = new Set();
  return list
    .map((entry, index) => {
      const source = isPlainObject(entry) ? entry : { question: entry };
      const resolution = isPlainObject(source.resolution) ? source.resolution : {};
      return {
        id: allocateId(source.id, "AMB", index + 1, used),
        question: boundedString(source.question).trim(),
        reason: boundedString(source.reason).trim(),
        impact: ["low", "medium", "high"].includes(source.impact) ? source.impact : "medium",
        blocking: source.blocking === true,
        safetyOrScopeCritical: source.safetyOrScopeCritical === true,
        suggestedAnswers: Array.isArray(source.suggestedAnswers) ? source.suggestedAnswers.map((answer) => boundedString(answer, 200).trim()).filter(Boolean) : [],
        status: source.status === "resolved" ? "resolved" : "open",
        resolution: {
          source: ["user", "evidence"].includes(resolution.source) ? resolution.source : "",
          answer: boundedString(resolution.answer, 2000).trim(),
          evidenceIds: Array.isArray(resolution.evidenceIds) ? resolution.evidenceIds.map((id) => boundedString(id, 40).trim()).filter(Boolean) : []
        }
      };
    })
    .filter((entry) => entry.question);
}

/**
 * Normalize a raw extractor payload into a well-formed intent contract.
 *
 * Missing collections become empty arrays; IDs are assigned where absent; enum-like
 * fields are coerced to their allowed sets. This never throws -- structural validity is
 * reported separately by validateIntentContract.
 *
 * @param {unknown} payload - Raw contract object (e.g. capture_intent_contract arguments).
 * @returns {object} A normalized contract at INTENT_CONTRACT_SCHEMA_VERSION.
 */
function normalizeIntentContract(payload) {
  const source = isPlainObject(payload) ? payload : {};
  const sourceName = boundedString(source.source || "extracted", 40).trim();
  const inferredVerifiability = sourceName === "raw-prompt-fallback"
    ? "unverified"
    : (sourceName === "extracted-reduced" ? "provisional" : "verified");
  return {
    schemaVersion: INTENT_CONTRACT_SCHEMA_VERSION,
    source: sourceName,
    verifiability: ["verified", "provisional", "unverified"].includes(source.verifiability)
      ? source.verifiability : inferredVerifiability,
    relationshipToPrior: RELATIONSHIP_VALUES.includes(source.relationshipToPrior) ? source.relationshipToPrior : "independent",
    taskType: TASK_TYPES.includes(source.taskType) ? source.taskType : "answer",
    goal: normalizeValueField(source.goal, "inferred"),
    expectedOutcome: normalizeValueField(source.expectedOutcome, "inferred"),
    requestedActions: normalizeProvenanceList(source.requestedActions, "RA", "inferred"),
    prohibitedActions: normalizeProvenanceList(source.prohibitedActions, "P", "inferred"),
    outOfScope: normalizeProvenanceList(source.outOfScope, "S", "inferred"),
    acceptanceCriteria: normalizeCriteria(source.acceptanceCriteria),
    supersededCriteria: Array.isArray(source.supersededCriteria) ? source.supersededCriteria : [],
    namedTargets: normalizeNamedTargets(source.namedTargets),
    assumptions: normalizeAssumptions(source.assumptions),
    unresolvedDecisions: normalizeDecisions(source.unresolvedDecisions),
    ambiguities: normalizeAmbiguities(source.ambiguities),
    clarifications: Array.isArray(source.clarifications) ? source.clarifications : [],
    amendments: Array.isArray(source.amendments) ? source.amendments : [],
    revisions: Array.isArray(source.revisions) ? source.revisions : [],
    relationshipEvidence: Array.isArray(source.relationshipEvidence) ? source.relationshipEvidence.map((entry) => ({
      quote: boundedString(entry?.quote, 1000).trim(),
      explanation: boundedString(entry?.explanation, 1000).trim()
    })).filter((entry) => entry.quote) : [],
    carriedFieldRefs: Array.isArray(source.carriedFieldRefs) ? source.carriedFieldRefs.map((entry) => boundedString(entry, 80).trim()).filter(Boolean) : [],
    correctedFieldRefs: Array.isArray(source.correctedFieldRefs) ? source.correctedFieldRefs.map((entry) => boundedString(entry, 80).trim()).filter(Boolean) : [],
    idRemaps: Array.isArray(source.idRemaps) ? source.idRemaps : [],
    fallbackReason: boundedString(source.fallbackReason, 120).trim(),
    relationshipDegraded: source.relationshipDegraded === true,
    relationshipResolutionSource: boundedString(source.relationshipResolutionSource, 80).trim(),
    pendingRelationshipContract: isPlainObject(source.pendingRelationshipContract) ? source.pendingRelationshipContract : null
  };
}

/**
 * Structurally validate a normalized intent contract.
 *
 * @param {object} contract - A contract produced by normalizeIntentContract.
 * @param {{ enforceCriterionQuality?: boolean }} [options] - Extraction-only semantic gate options.
 * @returns {{ valid: boolean, errors: string[], hints: string[] }} Validation outcome with error codes and soft hints.
 */
function validateIntentContract(contract, options = {}) {
  const errors = [];
  const hints = [];
  if (!isPlainObject(contract)) return { valid: false, errors: ["invalid-shape"], hints };
  if (!TASK_TYPES.includes(contract.taskType)) errors.push("unsupported-task-type");
  if (!contract.goal || !contract.goal.value) errors.push("missing-goal");
  if (!contract.expectedOutcome || !contract.expectedOutcome.value) errors.push("missing-expected-outcome");
  if (!Array.isArray(contract.acceptanceCriteria) || contract.acceptanceCriteria.length === 0) errors.push("missing-criteria");
  if (Array.isArray(contract.acceptanceCriteria)) {
    if (contract.acceptanceCriteria.length > MAX_CRITERIA) errors.push("over-limit");
    const ids = contract.acceptanceCriteria.map((criterion) => criterion.id);
    if (new Set(ids).size !== ids.length) errors.push("duplicate-criterion-id");
    if (contract.acceptanceCriteria.some((criterion) => !criterion.description)) errors.push("invalid-shape");
    if (contract.verifiability !== "unverified" && options.enforceCriterionQuality !== false) {
      const criteria = contract.acceptanceCriteria;
      const shapes = new Set(criteria.map((criterion) => criterion.shape).filter(Boolean));
      // Grounding is enforced only on fully verified extraction. It replaces the old
      // criterion-restates-goal penalty, which punished criteria for staying faithful to
      // the prompt; v6 instead REQUIRES faithfulness via a cited source span.
      // Grounding signals are HINTS, not fatal errors: they guide repair and feed the eval
      // metrics without cascading a weak model to the reduced/raw fallback. The extraction
      // prompt drives shapes and source spans; Phase 2's verifier enforces grounding on
      // content. This replaces the old criterion-restates-goal ERROR, which punished
      // criteria for staying faithful to the prompt (the opposite of what v6 wants).
      if (contract.verifiability === "verified") {
        if (criteria.some((criterion) => !CRITERION_SHAPES.includes(criterion.shape))) hints.push("criterion-missing-shape");
        if (criteria.some((criterion) => criterion.provenance === "explicit" && !criterion.sourceSpan)) hints.push("criterion-missing-source-span");
      }
      // A conformance task must BOTH read the artifacts and compare them. This is the one
      // structural rule promoted to a hard error, because it is the flagship failure: a
      // conformance run that never compares (or a reduced one-criterion contract) is wrong.
      if (contract.taskType === "conformance") {
        if (!shapes.has("conformance-inspection")) errors.push("conformance-missing-inspection-criterion");
        if (!shapes.has("conformance-comparison")) errors.push("conformance-missing-comparison-criterion");
      }
      if (["diagnostic", "implementation"].includes(contract.taskType)) {
        const hasOutcomeCriterion = criteria.some((criterion) =>
          ["workspace-state", "mixed"].includes(deriveCriterionClaimType(criterion, contract))
            && criterionHasCheckableState(criterion, contract)
        );
        if (!hasOutcomeCriterion) errors.push("missing-outcome-criterion");
      }
      // Change verb in the goal (diagnostic/conformance) without a conditional-action
      // criterion: a hint. The prompt drives the decomposition and the verifier enforces it.
      if (["diagnostic", "conformance"].includes(contract.taskType)
        && hasChangeAction(contract.goal?.value)
        && !shapes.has("conditional-action")
        && !criteria.some((criterion) => hasChangeAction(criterion.description))) {
        hints.push("missing-conditional-action-criterion");
      }
    }
  }
  const carriedRefs = Array.isArray(contract.carriedFieldRefs) ? contract.carriedFieldRefs : [];
  const correctedRefs = Array.isArray(contract.correctedFieldRefs) ? contract.correctedFieldRefs : [];
  if (contract.relationshipToPrior === "corrects" && carriedRefs.length) errors.push("unexpected-carried-field-ref");
  if (contract.relationshipToPrior === "corrects" && !correctedRefs.length) errors.push("missing-corrected-field-refs");
  if (contract.relationshipToPrior !== "corrects" && correctedRefs.length) errors.push("unexpected-corrected-field-ref");
  if (carriedRefs.some((ref) => !isCanonicalFieldRef(ref))) errors.push("invalid-carried-field-ref");
  if (correctedRefs.some((ref) => !isCanonicalFieldRef(ref))) errors.push("invalid-corrected-field-ref");
  return { valid: errors.length === 0, errors: [...new Set(errors)], hints: [...new Set(hints)] };
}

/**
 * Create a raw-prompt fallback contract when structured extraction is unavailable.
 * The user's own words are copied verbatim with provenance "uninterpreted".
 *
 * @param {string} prompt - Raw user prompt.
 * @param {{ reason?: string }} [options] - Fallback reason for auditing/warnings.
 * @returns {object} A normalized fallback contract carrying a visible warning flag.
 */
function createRawFallbackContract(prompt, options = {}) {
  const text = normalizePromptText(prompt) || "Respond to the user's request.";
  return normalizeIntentContract({
    source: "raw-prompt-fallback",
    verifiability: "unverified",
    taskType: "answer",
    goal: { value: text, provenance: "uninterpreted" },
    expectedOutcome: { value: text, provenance: "uninterpreted" },
    acceptanceCriteria: [{ id: "AC1", description: "The response satisfies the user's request.", provenance: "uninterpreted" }],
    fallbackReason: boundedString(options.reason || "extraction-unavailable", 120)
  });
}

/**
 * Create a Chat-only fast-path contract that skips extraction for a trivial read-only
 * prompt. Active-editor questions carry the active file path as an unverified target.
 *
 * @param {string} prompt - Raw user prompt.
 * @param {{ activeFilePath?: string }} [options] - Optional active-editor context.
 * @returns {object} A normalized fast-path contract.
 */
function createFastPathContract(prompt, options = {}) {
  const text = normalizePromptText(prompt) || "Answer the user's question.";
  const files = options.activeFilePath
    ? [{ value: boundedString(options.activeFilePath, 400).trim(), source: "active-editor", status: "unverified" }]
    : [];
  return normalizeIntentContract({
    source: "fast-path",
    verifiability: "verified",
    taskType: "answer",
    goal: { value: text, provenance: "uninterpreted" },
    expectedOutcome: { value: text, provenance: "uninterpreted" },
    acceptanceCriteria: [{ id: "AC1", shape: "response-content", statement: "The response answers the user's question.", provenance: "uninterpreted" }],
    namedTargets: { files }
  });
}

/**
 * Compute a stable fingerprint of a prompt for contract reuse decisions. An edited or
 * rerun prompt yields a different fingerprint and therefore a fresh contract.
 *
 * @param {string} prompt - Raw user prompt.
 * @returns {string} A short hex fingerprint.
 */
function computePromptFingerprint(prompt) {
  return crypto.createHash("sha256").update(normalizePromptText(prompt)).digest("hex").slice(0, 16);
}

/**
 * Build a conversation anchor identifying the turn a contract was produced for.
 *
 * @param {string} chatId - The chat/session identifier.
 * @param {number} turnIndex - Zero-based index of the turn within the chat.
 * @returns {{ chatId: string, turnIndex: number }} The anchor.
 */
function makeConversationAnchor(chatId, turnIndex) {
  return { chatId: boundedString(chatId, 120), turnIndex: Number.isFinite(Number(turnIndex)) ? Math.max(0, Math.floor(Number(turnIndex))) : 0 };
}

/**
 * Decide whether a persisted contract may be reused for the current request. Reuse
 * requires matching schema version, prompt fingerprint, workspace, mode, and chat.
 *
 * @param {object} savedMeta - Metadata of a persisted contract.
 * @param {object} currentMeta - Metadata of the current request.
 * @returns {boolean} True when the saved contract is safe to reuse.
 */
function canReuseContract(savedMeta, currentMeta) {
  if (!isPlainObject(savedMeta) || !isPlainObject(currentMeta)) return false;
  return savedMeta.validationState === "valid"
    && savedMeta.schemaVersion === currentMeta.schemaVersion
    && currentMeta.executionKind === "resume"
    && Number.isInteger(savedMeta.executionGeneration)
    && savedMeta.executionGeneration > 0
    && savedMeta.executionGeneration === currentMeta.executionGeneration
    && savedMeta.promptFingerprint === currentMeta.promptFingerprint
    && savedMeta.workspace === currentMeta.workspace
    && savedMeta.mode === currentMeta.mode
    && isPlainObject(savedMeta.conversationAnchor) && isPlainObject(currentMeta.conversationAnchor)
    && savedMeta.conversationAnchor.chatId === currentMeta.conversationAnchor.chatId
    && savedMeta.conversationAnchor.turnIndex === currentMeta.conversationAnchor.turnIndex;
}

/** Decide whether a prior-turn contract belongs to the same conversation/workspace. */
function canCarryPriorContract(priorMeta, currentMeta) {
  if (!isPlainObject(priorMeta) || !isPlainObject(currentMeta)) return false;
  return priorMeta.validationState === "valid"
    && priorMeta.schemaVersion === currentMeta.schemaVersion
    && priorMeta.workspace === currentMeta.workspace
    && isPlainObject(priorMeta.conversationAnchor) && isPlainObject(currentMeta.conversationAnchor)
    && priorMeta.conversationAnchor.chatId
    && priorMeta.conversationAnchor.chatId === currentMeta.conversationAnchor.chatId
    && priorMeta.conversationAnchor.turnIndex < currentMeta.conversationAnchor.turnIndex;
}

/**
 * Build the harness-owned metadata record persisted alongside a contract.
 *
 * @param {object} params - Metadata inputs.
 * @param {string} params.mode - Request mode (chat|agent|plan).
 * @param {string} params.workspaceRoot - Workspace root path.
 * @param {string} params.prompt - Raw user prompt (fingerprinted here).
 * @param {object} [params.conversationAnchor] - Conversation anchor.
 * @param {string} [params.validationState] - "valid" | "fallback" | "invalid".
 * @param {number} [params.revision] - Revision counter.
 * @param {string} [params.executionKind] - Request execution kind.
 * @param {number} [params.executionGeneration] - Stable generation for one execution.
 * @returns {object} A metadata record for persistence and reuse checks.
 */
function createContractMeta(params = {}) {
  const executionKind = ["new", "edited-rerun", "resume"].includes(params.executionKind)
    ? params.executionKind
    : "new";
  const executionGeneration = Number(params.executionGeneration);
  return {
    schemaVersion: INTENT_CONTRACT_SCHEMA_VERSION,
    mode: boundedString(params.mode, 40),
    workspace: boundedString(params.workspaceRoot, 1000),
    promptFingerprint: computePromptFingerprint(params.prompt),
    conversationAnchor: isPlainObject(params.conversationAnchor) ? params.conversationAnchor : makeConversationAnchor(params.chatId, params.turnIndex),
    validationState: ["valid", "fallback", "invalid"].includes(params.validationState) ? params.validationState : "valid",
    revision: Number.isFinite(Number(params.revision)) ? Math.max(0, Math.floor(Number(params.revision))) : 0,
    executionKind,
    executionGeneration: Number.isInteger(executionGeneration) && executionGeneration > 0 ? executionGeneration : 1,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Project a contract into a compact object for injection, ordered so that mandatory
 * fields are emitted first and droppable fields last.
 *
 * @param {object} contract - Normalized contract.
 * @returns {{ mandatory: object, optional: object }} Projection tiers.
 */
function buildInjectionProjection(contract) {
  const openBlockingDecisions = (contract.unresolvedDecisions || [])
    .filter((decision) => decision.blocking || decision.controlsMutation)
    .map((decision) => ({ id: decision.id, description: decision.description, controlledCapabilities: decision.controlledCapabilities, controlledTargets: decision.controlledTargets }));
  const unverifiedTargets = ["files", "symbols", "errors", "uiAreas"]
    .flatMap((group) => (contract.namedTargets?.[group] || []))
    .filter((target) => target.status !== "confirmed")
    .slice(0, MAX_INJECTED_TARGETS)
    .map((target) => ({ id: target.id, value: target.value, kind: target.kind, status: target.status }));
  const activeCorrections = correctionConsistency.listActiveReferenceReplacements(contract).map((replacement) => ({
    amendmentId: replacement.amendmentId,
    fieldRef: replacement.fieldRef,
    superseded: replacement.superseded,
    replacement: replacement.replacement,
    replacementAliases: replacement.replacementAliases,
    instruction: replacement.summary
  }));
  return {
    mandatory: {
      verifiability: contract.verifiability,
      taskType: contract.taskType,
      goal: contract.goal?.value || "",
      prohibitedActions: (contract.prohibitedActions || []).map((entry) => entry.value),
      acceptanceCriteria: (contract.acceptanceCriteria || []).slice(0, MAX_INJECTED_CRITERIA).map((criterion) => ({ id: criterion.id, description: criterion.description })),
      openBlockingDecisions,
      unverifiedTargets,
      activeCorrections
    },
    optional: {
      expectedOutcome: contract.expectedOutcome?.value || "",
      requestedActions: (contract.requestedActions || []).map((entry) => entry.value),
      outOfScope: (contract.outOfScope || []).map((entry) => entry.value),
      assumptions: (contract.assumptions || []).filter((assumption) => assumption.risk !== "low").map((assumption) => assumption.statement),
      relationshipAmbiguities: (contract.ambiguities || [])
        .filter((ambiguity) => /relationship|previous task|prior intent/i.test(`${ambiguity.question} ${ambiguity.reason}`))
        .map((ambiguity) => ({ id: ambiguity.id, question: ambiguity.question, reason: ambiguity.reason }))
    }
  };
}

/**
 * Serialize a projection to JSON within a character budget, dropping optional fields
 * first and, only if mandatory fields alone still overflow, truncating criterion
 * descriptions. goal, prohibitedActions, criterion identity, open blocking decisions,
 * and unverified targets are never dropped.
 *
 * @param {{ mandatory: object, optional: object }} projection - Projection tiers.
 * @param {number} maxChars - Character budget.
 * @returns {string} A JSON string within (or as close as possible to) the budget.
 */
function serializeProjectionWithinBudget(projection, maxChars) {
  const optionalKeys = Object.keys(projection.optional);
  const optional = { ...projection.optional };
  let serialized = JSON.stringify({ ...projection.mandatory, ...optional });
  for (let index = optionalKeys.length - 1; index >= 0 && serialized.length > maxChars; index -= 1) {
    delete optional[optionalKeys[index]];
    serialized = JSON.stringify({ ...projection.mandatory, ...optional });
  }
  if (serialized.length <= maxChars) return serialized;
  const mandatory = JSON.parse(JSON.stringify(projection.mandatory));
  mandatory.acceptanceCriteria = mandatory.acceptanceCriteria.map((criterion) => ({
    id: criterion.id,
    description: criterion.description.length > 80 ? `${criterion.description.slice(0, 80)} (truncated)` : criterion.description
  }));
  return JSON.stringify(mandatory);
}

/**
 * Build the single authoritative contract system message reinjected into every model
 * round. The contract is compacted to a character budget; the accompanying instruction
 * keeps the model targeting the contract without treating named targets as verified.
 *
 * @param {object} contract - Normalized contract.
 * @param {{ maxChars?: number }} [options] - Optional injection budget override.
 * @returns {{ role: "system", content: string }} The system message.
 */
function buildContractInjectionMessage(contract, options = {}) {
  const maxChars = Math.min(HARD_INJECTED_MAX_CHARS, Math.max(500, Number(options.maxChars) || DEFAULT_INJECTED_MAX_CHARS));
  const projectionJson = serializeProjectionWithinBudget(buildInjectionProjection(contract), maxChars);
  const tierInstruction = contract.verifiability === "provisional"
    ? "This is a reduced contract. Use it to guide the work, but do not claim that it captures every requirement or constraint."
    : (contract.verifiability === "unverified"
      ? "Intent extraction was unsuccessful. Prefer discovery and planning, require explicit approval for every effect, and do not claim that the result fully satisfies the request."
      : "");
  const content = [
    "Authoritative task contract for the current request:",
    "",
    projectionJson,
    "",
    "Use this contract as the target for this request. The raw user prompt remains context,",
    "but do not broaden the goal, violate prohibited actions, or treat named targets as",
    "verified until tools confirm them. Keep every acceptance criterion in view. If tool",
    "evidence conflicts with a named target or a medium/high-risk assumption, surface it so",
    "the contract can be revised; do not silently change the user's goal. Active corrections",
    "supersede every earlier proposal. Rebuild dependent paths, links, labels, titles, content,",
    "approval descriptions, and final reporting from the corrected values.",
    tierInstruction
  ].filter(Boolean).join("\n");
  return { role: "system", content };
}

module.exports = {
  INTENT_CONTRACT_SCHEMA_VERSION,
  TASK_TYPES,
  CRITERION_SHAPES,
  RELATIONSHIP_VALUES,
  PROVENANCE_VALUES,
  TARGET_KINDS_BY_GROUP,
  DEFAULT_INJECTED_MAX_CHARS,
  HARD_INJECTED_MAX_CHARS,
  MAX_INJECTED_CRITERIA,
  MAX_INJECTED_TARGETS,
  normalizePromptText,
  criterionGoalOverlap,
  criterionRestatesGoal,
  normalizeIntentContract,
  validateIntentContract,
  createRawFallbackContract,
  createFastPathContract,
  computePromptFingerprint,
  makeConversationAnchor,
  canReuseContract,
  canCarryPriorContract,
  createContractMeta,
  buildContractInjectionMessage
};
