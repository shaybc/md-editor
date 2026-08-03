/**
 * Hybrid conflict detection and bounded contract revision.
 *
 * Two paths, one bounded revision budget per request:
 * - Harness-auto: deterministic conclusions the harness reaches on its own (a named
 *   target proven absent from tracked searches) drive a revision directly.
 * - Model-reported: report_intent_conflict raises semantic conflicts (relocation,
 *   misread, unreachable). The harness validates the report (the field reference
 *   resolves, cited evidence exists, and the evidence meets the conflict type's
 *   admissibility bar) before acting, then routes by provenance/authority.
 *
 * Routing: inferred/carried targets, assumptions, and decisions are revised directly;
 * inferred goal/expectedOutcome/criterion descriptions are never silently revised
 * (they ask the user or are recorded as controlling decisions); explicit, clarified,
 * and uninterpreted content is immutable.
 *
 * Pure module: it operates on a normalized search tracker and returns new contracts;
 * it performs no IO and no provider calls.
 */

"use strict";

const approvalCapabilities = require("./approval-capability-registry");

/** Search/discovery tools whose results are tracked for conflict evidence. */
const SEARCH_TOOLS = Object.freeze(new Set(["list_files", "glob", "search_grep", "read_file", "search_vault", "read_open_tabs"]));

/** Provenance values that are immutable to discovery evidence. */
const IMMUTABLE_PROVENANCE = Object.freeze(new Set(["explicit", "clarified", "uninterpreted"]));

/** The read-only tool the model calls to raise a semantic conflict. */
const REPORT_INTENT_CONFLICT_TOOL = Object.freeze({
  type: "function",
  function: {
    name: "report_intent_conflict",
    description: "Report that workspace evidence contradicts the intent contract. Read-only; cite the tool call ids that show the conflict.",
    parameters: {
      type: "object",
      required: ["fieldRef", "conflictType", "evidenceToolCallIds"],
      properties: {
        fieldRef: { type: "string", description: "Canonical field reference, e.g. target:T1, assumption:A1, criterion:AC2, goal, expectedOutcome." },
        conflictType: { type: "string", enum: ["assumption-contradicted", "target-relocated", "goal-misread", "outcome-misread", "criterion-unreachable"] },
        evidenceToolCallIds: { type: "array", items: { type: "string" }, description: "Ids of prior tool calls whose results show the conflict." },
        explanation: { type: "string" },
        userClarificationRequired: { type: "boolean" }
      },
      additionalProperties: false
    }
  }
});

function normalizePath(value) {
  return approvalCapabilities.normalizePath(value);
}

/**
 * Create a per-request tracker of normalized search records. Each record captures
 * whether a search was empty, whether a read reported not-found, and whether the result
 * was truncated (so a limited search never proves absence).
 *
 * @returns {object} A tracker with add/all/has/get.
 */
function createSearchTracker() {
  const records = [];
  return {
    add(record) {
      if (!record || !record.toolCallId) return;
      records.push({
        toolCallId: String(record.toolCallId),
        tool: String(record.tool || ""),
        query: String(record.query || ""),
        empty: record.empty === true,
        notFound: record.notFound === true,
        truncated: record.truncated === true,
        exhaustive: record.exhaustive === true,
        succeeded: record.succeeded !== false,
        matches: Array.isArray(record.matches) ? record.matches.map((value) => normalizePath(value)).filter(Boolean) : []
      });
    },
    all() { return records.slice(); },
    has(toolCallId) { return records.some((record) => record.toolCallId === toolCallId); },
    get(toolCallId) { return records.find((record) => record.toolCallId === toolCallId) || null; }
  };
}

/**
 * Normalize a search tool result into the tracker's signal shape. Best-effort across the
 * common workspace tool result shapes; empty/truncated heuristics may be tuned later.
 *
 * @param {string} tool - Search tool name.
 * @param {object} args - Tool arguments.
 * @param {*} result - Tool result (array or object), or null on a caught not-found.
 * @param {{ notFound?: boolean }} [flags] - Explicit flags from the caller (e.g. read errors).
 * @returns {{ tool: string, query: string, empty: boolean, notFound: boolean, truncated: boolean }} Normalized record body.
 */
function normalizeSearchRecord(tool, args = {}, result, flags = {}) {
  const items = Array.isArray(result) ? result : (Array.isArray(result?.matches) ? result.matches : (Array.isArray(result?.files) ? result.files : (Array.isArray(result?.tabs) ? result.tabs : null)));
  const query = tool === "read_file" ? normalizePath(args.path)
    : (tool === "glob" || tool === "search_grep" || tool === "search_vault") ? String(args.pattern || args.query || "")
      : (tool === "read_open_tabs") ? "" : "";
  return {
    tool,
    query,
    empty: items ? items.length === 0 : false,
    notFound: flags.notFound === true || result?.notFound === true,
    truncated: result?.truncated === true,
    exhaustive: flags.exhaustive === true || (["glob", "search_grep", "read_file"].includes(tool) && result?.truncated !== true),
    succeeded: flags.failed !== true,
    matches: (items || []).map((item) => typeof item === "string" ? item : (item?.path || item?.value || "")).filter(Boolean)
  };
}

function flattenTargets(contract) {
  const groups = (contract && contract.namedTargets) || {};
  return ["files", "symbols", "errors", "uiAreas"].flatMap((group) => (Array.isArray(groups[group]) ? groups[group] : []));
}

/**
 * Deterministically detect named targets proven absent from tracked searches.
 * - file-path: a direct read reported not-found and the file is not an open (unsaved)
 *   tab, or an exhaustive, untruncated glob on it returned empty.
 * - symbol: an exhaustive, untruncated symbol search returned empty.
 * - ui-area and error-text are never auto-marked absent. list_files never proves absence.
 *
 * @param {object} contract - The active contract.
 * @param {object} tracker - The search tracker.
 * @returns {Array<{ id: string, value: string, kind: string }>} Absent targets.
 */
function detectAbsentTargets(contract, tracker) {
  const records = tracker.all();
  const openTabPaths = new Set(records.filter((record) => record.tool === "read_open_tabs" && record.query).map((record) => normalizePath(record.query)));
  const absent = [];
  for (const target of flattenTargets(contract)) {
    if (target.status !== "unverified") continue;
    if (target.kind === "file-path") {
      const value = normalizePath(target.value);
      const directMiss = records.some((record) => record.tool === "read_file" && normalizePath(record.query) === value && record.notFound) && !openTabPaths.has(value);
      const globMiss = records.some((record) => record.tool === "glob" && normalizePath(record.query) === value && record.empty && record.exhaustive && !record.truncated);
      if ((directMiss || globMiss) && !openTabPaths.has(value)) absent.push({ id: target.id, value: target.value, kind: target.kind });
    } else if (target.kind === "filename") {
      const filename = normalizePath(target.value).split("/").pop();
      const hasOpenTab = [...openTabPaths].some((tabPath) => tabPath.split("/").pop() === filename);
      const exactGlobMiss = records.some((record) => {
        const query = normalizePath(record.query);
        return (query === filename || query === `**/${filename}`) && record.empty && record.exhaustive && !record.truncated;
      });
      if (!hasOpenTab && exactGlobMiss) absent.push({ id: target.id, value: target.value, kind: target.kind });
    } else if (target.kind === "symbol") {
      const grepMiss = records.some((record) => record.tool === "search_grep" && record.query === target.value && record.empty && record.exhaustive && !record.truncated);
      if (grepMiss) absent.push({ id: target.id, value: target.value, kind: target.kind });
    }
  }
  return absent;
}

/**
 * Find named targets positively confirmed by successful tracked evidence.
 * @param {object} contract - Active contract.
 * @param {object} tracker - Per-request search tracker.
 * @returns {string[]} Target IDs confirmed by the evidence.
 */
function detectConfirmedTargets(contract, tracker) {
  const records = tracker.all();
  const confirmed = [];
  for (const target of flattenTargets(contract)) {
    if (target.status !== "unverified") continue;
    if (target.kind === "file-path") {
      const value = normalizePath(target.value);
      if (records.some((record) => (
        (record.tool === "read_file" && record.succeeded && normalizePath(record.query) === value && !record.notFound)
        || (record.tool === "read_open_tabs" && normalizePath(record.query) === value)
        || (record.tool === "glob" && record.matches.includes(value))
      ))) confirmed.push(target.id);
    } else if (target.kind === "filename") {
      const filename = normalizePath(target.value).split("/").pop();
      if (records.some((record) => record.matches.some((match) => match.split("/").pop() === filename))) confirmed.push(target.id);
    } else if (target.kind === "symbol") {
      if (records.some((record) => record.tool === "search_grep" && record.query === target.value && !record.empty)) confirmed.push(target.id);
    }
  }
  return [...new Set(confirmed)];
}

/** Return a contract with the supplied named targets marked confirmed. */
function confirmTargets(contract, targetIds) {
  const ids = new Set(targetIds || []);
  const namedTargets = {};
  for (const group of ["files", "symbols", "errors", "uiAreas"]) {
    namedTargets[group] = (contract.namedTargets?.[group] || []).map((target) => ids.has(target.id) ? { ...target, status: "confirmed" } : target);
  }
  return { ...contract, namedTargets };
}

/** Whether a caught read error conclusively represents a missing path. */
function isNotFoundError(error) {
  return error?.code === "ENOENT" || /(?:not found|does not exist|cannot find)/i.test(String(error?.message || ""));
}

/**
 * Resolve a canonical field reference to its contract node, kind, and provenance.
 *
 * @param {object} contract - The active contract.
 * @param {string} fieldRef - Canonical reference (goal, expectedOutcome, kind:id).
 * @returns {{ kind: string, id?: string, node: object, provenance: string } | null} Resolution.
 */
function resolveFieldRef(contract, fieldRef) {
  if (fieldRef === "goal") return { kind: "goal", node: contract.goal, provenance: contract.goal?.provenance };
  if (fieldRef === "expectedOutcome") return { kind: "expectedOutcome", node: contract.expectedOutcome, provenance: contract.expectedOutcome?.provenance };
  const match = /^([a-zA-Z]+):(.+)$/.exec(String(fieldRef || ""));
  if (!match) return null;
  const kind = match[1];
  const id = match[2];
  const lists = {
    criterion: contract.acceptanceCriteria,
    target: flattenTargets(contract),
    assumption: contract.assumptions,
    decision: contract.unresolvedDecisions,
    requestedAction: contract.requestedActions,
    prohibitedAction: contract.prohibitedActions,
    outOfScope: contract.outOfScope
  };
  const list = Array.isArray(lists[kind]) ? lists[kind] : null;
  if (!list) return null;
  const node = list.find((entry) => entry.id === id);
  if (!node) return null;
  const provenance = node.provenance || (kind === "target" || kind === "decision" ? "inferred" : "inferred");
  return { kind, id, node, provenance };
}

/**
 * Validate a model-reported conflict before any revision runs.
 *
 * @param {object} report - report_intent_conflict arguments.
 * @param {object} context - { contract, tracker }.
 * @returns {{ valid: boolean, errors: string[], resolved: object|null }} Validation outcome.
 */
function validateConflictReport(report, context) {
  const { contract, tracker } = context;
  const errors = [];
  const resolved = resolveFieldRef(contract, report.fieldRef);
  if (!resolved) errors.push("unresolvable-fieldRef");
  const ids = Array.isArray(report.evidenceToolCallIds) ? report.evidenceToolCallIds : [];
  if (!ids.length) errors.push("no-evidence");
  else if (!ids.every((id) => tracker.has(id))) errors.push("unknown-evidence");
  const cited = ids.map((id) => tracker.get(id)).filter(Boolean);
  if (report.conflictType === "target-relocated" && !cited.some((record) => !record.empty)) errors.push("no-positive-match");
  if (report.conflictType === "assumption-contradicted" && resolved && resolved.kind === "assumption") {
    const keys = [...(resolved.node.keywords || []), ...(resolved.node.relatedTargets || [])].map(String).filter(Boolean);
    if (!keys.length || !cited.some((record) => keys.some((key) => record.query.includes(key)))) errors.push("evidence-not-related");
  }
  return { valid: errors.length === 0, errors, resolved };
}

/**
 * Route a validated conflict by provenance/authority.
 *
 * @param {{ kind: string, provenance: string }} resolved - Resolved field.
 * @param {object} settings - Normalized settings (uses intentClarificationMode).
 * @returns {{ action: "revise"|"ask"|"record"|"reject", reason?: string }} The route.
 */
function routeConflict(resolved, settings) {
  if (!resolved) return { action: "reject", reason: "unresolvable" };
  if (IMMUTABLE_PROVENANCE.has(resolved.provenance)) return { action: "reject", reason: "immutable" };
  if (["target", "assumption", "decision"].includes(resolved.kind)) return { action: "revise" };
  // goal, expectedOutcome, criterion description, requestedAction: never silently revised.
  return (settings && settings.intentClarificationMode === "off") ? { action: "record" } : { action: "ask" };
}

function setTargetStatus(namedTargets, targetId, status) {
  const groups = namedTargets || {};
  const next = {};
  for (const group of ["files", "symbols", "errors", "uiAreas"]) {
    next[group] = (Array.isArray(groups[group]) ? groups[group] : []).map((target) => (target.id === targetId ? { ...target, status } : target));
  }
  return next;
}

/**
 * Apply a bounded revision for a validated conflict, returning a new contract. Targets
 * are marked absent/relocated; assumptions have their risk raised; goal, expectedOutcome,
 * and criterion descriptions are never changed here. A revisions[] entry is appended.
 *
 * @param {object} contract - The active contract.
 * @param {object} params - { resolved, conflictType, trigger }.
 * @returns {object} The revised contract.
 */
function reviseContractForConflict(contract, params) {
  const { resolved, conflictType, trigger } = params;
  const revisionId = `R${(contract.revisions || []).length + 1}`;
  const fieldRef = resolved.id ? `${resolved.kind}:${resolved.id}` : resolved.kind;
  let updated = { ...contract };
  if (resolved.kind === "target") {
    updated.namedTargets = setTargetStatus(contract.namedTargets, resolved.id, "absent");
  } else if (resolved.kind === "assumption") {
    updated.assumptions = (contract.assumptions || []).map((assumption) => (assumption.id === resolved.id ? { ...assumption, risk: "high" } : assumption));
  }
  updated.revisions = [...(contract.revisions || []), { id: revisionId, trigger: trigger || "model-reported", fieldRef, conflictType, changedFields: [fieldRef] }];
  return updated;
}

/**
 * Record a semantic conflict as a controlling unresolved decision (used when clarification
 * is off and the conflict targets immutable-by-discovery content). Preserves both
 * interpretations and gates dependent mutations without changing the goal.
 *
 * @param {object} contract - The active contract.
 * @param {object} params - { resolved, conflictType, explanation }.
 * @returns {object} The updated contract.
 */
function recordConflictAsDecision(contract, params) {
  const { resolved, conflictType, explanation } = params;
  const decisionId = `D-conflict-${(contract.unresolvedDecisions || []).length + 1}`;
  const decision = {
    id: decisionId,
    description: `Evidence conflicts with ${resolved.id ? `${resolved.kind}:${resolved.id}` : resolved.kind} (${conflictType})${explanation ? `: ${explanation}` : ""}`,
    blocking: true,
    controlsMutation: true,
    controlledCapabilities: [],
    controlledTargets: []
  };
  return { ...contract, unresolvedDecisions: [...(contract.unresolvedDecisions || []), decision] };
}

module.exports = {
  SEARCH_TOOLS,
  REPORT_INTENT_CONFLICT_TOOL,
  createSearchTracker,
  normalizeSearchRecord,
  detectAbsentTargets,
  detectConfirmedTargets,
  confirmTargets,
  isNotFoundError,
  resolveFieldRef,
  validateConflictReport,
  routeConflict,
  reviseContractForConflict,
  recordConflictAsDecision
};
