/**
 * Request-scoped completion evidence normalization and admissibility.
 *
 * Tool payloads remain in provider history; this ledger stores only bounded facts needed
 * by the completion assessor and persisted task record.
 */

"use strict";

const crypto = require("node:crypto");

const CANDIDATE_EVIDENCE_ID = "EV-CANDIDATE-1";
const MAX_EVIDENCE_SUMMARY_CHARS = 1200;
const EXECUTION_TOOLS = new Set(["run_command", "run_test", "compile_project", "run_tests", "restore_dependencies", "manage_package"]);
const MUTATION_TOOLS = new Set(["apply_edit", "write_file"]);
const LOCALIZATION_FILE_TOOLS = new Set([
  "read_file", "read_active_document", "read_open_tabs",
  "apply_edit", "write_file", "create_document_tab", "insert_at_cursor",
  "replace_selection", "replace_document_range", "extract_selection_to_note"
]);

function boundedText(value, maximum = MAX_EVIDENCE_SUMMARY_CHARS) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maximum ? `${text.slice(0, maximum)}...[truncated]` : text;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function evidenceFingerprint(entries) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(entries))).digest("hex");
}

function containsTruncationSignal(value, depth = 0) {
  if (depth > 3 || value == null) return false;
  if (typeof value === "string") return /\.\.\.\[(?:truncated|compacted)/i.test(value);
  if (Array.isArray(value)) return value.slice(0, 30).some((entry) => containsTruncationSignal(entry, depth + 1));
  if (typeof value !== "object") return false;
  if (value.truncated === true || value.outputTruncated === true || value.stdoutTruncated === true || value.stderrTruncated === true) return true;
  return Object.values(value).slice(0, 30).some((entry) => containsTruncationSignal(entry, depth + 1));
}

function isDeniedError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "");
  return /approval|denied|rejected|blocked|not.?permitted|policy/i.test(`${code} ${message}`);
}

// Structured signals that a tool made no change because the target already matched the
// intended state -- a "no-op", NOT a denial or failure. Read from the tool's own structured
// output so this generalizes to any tool that reports "nothing to do", not one message.
const NO_CHANGE_CODES = new Set(["APPROVAL_ACTION_NO_CHANGE"]);
function isNoOpOutcome(result, error) {
  return NO_CHANGE_CODES.has(String(error?.code || ""))
    || error?.actionAnalysis?.operation === "no-op"
    || result?.operation === "no-op";
}

function classifyToolOutcome(result, error) {
  // A no-op (already-satisfied) is its own category: not denied, not failed, not succeeded.
  // Its meaning is decided downstream by the criterion (conditional vs required change).
  if (isNoOpOutcome(result, error)) return "no-op";
  if (result?.executed === false) return "not-executed";
  if (error) return isDeniedError(error) ? "denied" : "failed";
  if (result?.status === "failed" || result?.success === false || result?.timedOut === true || result?.cancelled === true) return "failed";
  return "succeeded";
}

function normalizeSuccessConfirmation(tool, result, mutationDetails, outcome) {
  if (outcome !== "succeeded") return { verifiedState: false, successConfirmedIndependently: false, confirmationSource: "" };
  if (MUTATION_TOOLS.has(tool)) {
    const confirmed = !!mutationDetails?.compare;
    return {
      verifiedState: confirmed,
      successConfirmedIndependently: confirmed,
      confirmationSource: confirmed ? "post-mutation-comparison" : ""
    };
  }
  if (EXECUTION_TOOLS.has(tool)) {
    const hasExitStatus = result?.success === true || Number(result?.exitCode) === 0;
    const commandCompleted = (tool === "run_command" || tool === "run_test") && result && result.executed !== false;
    const confirmed = hasExitStatus || commandCompleted;
    return {
      verifiedState: confirmed,
      successConfirmedIndependently: confirmed,
      confirmationSource: hasExitStatus ? "exit-status" : (confirmed ? "command-completion" : "")
    };
  }
  if (/^git_panel_/.test(tool) && !/^git_panel_(?:status|branch_list|compare_file|changes_digest|pr_notes_context)$/.test(tool)) {
    return { verifiedState: true, successConfirmedIndependently: true, confirmationSource: "git-post-state" };
  }
  if (result?.status === "partial") {
    return { verifiedState: true, successConfirmedIndependently: true, confirmationSource: "partial-result" };
  }
  return { verifiedState: true, successConfirmedIndependently: true, confirmationSource: "tool-result" };
}

function isEvidenceAdmissible(entry) {
  if (!entry || entry.outcome !== "succeeded" || entry.verifiedState !== true) return false;
  if ((entry.referenceChecks || []).some((check) => check?.supersededFound === true)) return false;
  return entry.truncated !== true || entry.successConfirmedIndependently === true;
}

function localizationFiles(tool, args = {}, result = {}) {
  if (!LOCALIZATION_FILE_TOOLS.has(tool)) return [];
  const tabs = Array.isArray(result?.tabs) ? result.tabs : [];
  const values = [
    args.path, args.filePath, args.expectedPath, result.path, result.filePath,
    ...tabs.map((tab) => tab?.path || tab?.filePath),
    ...(Array.isArray(args.files) ? args.files : []),
    ...(Array.isArray(args.paths) ? args.paths : [])
  ];
  return [...new Set(values.map((value) => String(value || "").replace(/\\/g, "/").replace(/^\/+/, "").trim()).filter(Boolean))].slice(0, 20);
}

function createCompletionEvidenceLedger(initialEntries = []) {
  const entries = Array.isArray(initialEntries) ? initialEntries.map((entry) => ({ ...entry })) : [];
  let evidenceVersion = entries.length;
  let nextId = entries.reduce((maximum, entry) => {
    const match = String(entry?.id || "").match(/^EV(\d+)$/);
    return match ? Math.max(maximum, Number(match[1]) + 1) : maximum;
  }, 1);

  function recordToolEvidence(details = {}) {
    const toolCallId = String(details.toolCallId || "");
    if (toolCallId) {
      const existing = entries.find((entry) => entry.source === "tool" && entry.toolCallId === toolCallId);
      if (existing) return existing;
    }
    const outcome = classifyToolOutcome(details.result, details.error);
    const confirmation = normalizeSuccessConfirmation(String(details.tool || ""), details.result, details.mutationDetails, outcome);
    const entry = {
      id: `EV${nextId++}`,
      source: "tool",
      toolCallId,
      tool: String(details.tool || ""),
      outcome,
      summary: boundedText(details.summary || details.error?.message || details.error || outcome),
      verifiedState: confirmation.verifiedState,
      truncated: containsTruncationSignal(details.result),
      successConfirmedIndependently: confirmation.successConfirmedIndependently,
      confirmationSource: confirmation.confirmationSource
    };
    const files = localizationFiles(String(details.tool || ""), details.args, details.result);
    if (files.length) entry.files = files;
    if (Array.isArray(details.referenceChecks) && details.referenceChecks.length) {
      entry.referenceChecks = details.referenceChecks.slice(0, 20).map((check) => ({
        amendmentId: boundedText(check?.amendmentId, 80),
        fieldRef: boundedText(check?.fieldRef, 80),
        replacementFound: check?.replacementFound === true,
        supersededFound: check?.supersededFound === true,
        checkedLocations: Array.isArray(check?.checkedLocations)
          ? check.checkedLocations.slice(0, 20).map((location) => boundedText(location, 80))
          : []
      }));
    }
    entries.push(entry);
    evidenceVersion += 1;
    return entry;
  }

  function recordCandidateEvidence(candidate) {
    const existingIndex = entries.findIndex((entry) => entry.id === CANDIDATE_EVIDENCE_ID);
    const entry = {
      id: CANDIDATE_EVIDENCE_ID,
      source: "candidate-response",
      outcome: "succeeded",
      summary: "Normalized candidate response",
      verifiedState: true,
      truncated: false,
      successConfirmedIndependently: true,
      confirmationSource: "candidate-normalization",
      contentLength: String(candidate || "").length
    };
    if (existingIndex >= 0) {
      if (JSON.stringify(entries[existingIndex]) !== JSON.stringify(entry)) {
        entries[existingIndex] = entry;
        evidenceVersion += 1;
      }
    } else {
      entries.push(entry);
      evidenceVersion += 1;
    }
    return entry;
  }

  function listEvidence() {
    return entries.map((entry) => ({ ...entry }));
  }

  function getEvidenceById(evidenceId) {
    const entry = entries.find((candidate) => candidate.id === String(evidenceId || ""));
    return entry ? { ...entry } : null;
  }

  function getEvidenceSnapshot() {
    const normalizedEntries = listEvidence();
    return {
      evidenceVersion,
      evidenceFingerprint: evidenceFingerprint(normalizedEntries),
      entries: normalizedEntries
    };
  }

  return { recordToolEvidence, recordCandidateEvidence, listEvidence, getEvidenceById, getEvidenceSnapshot };
}

module.exports = {
  CANDIDATE_EVIDENCE_ID,
  createCompletionEvidenceLedger,
  evidenceFingerprint,
  isEvidenceAdmissible
};
