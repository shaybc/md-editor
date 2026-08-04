/**
 * Deterministic normalization of Agent tool evidence into state-safe observations.
 */

"use strict";

const { describeToolEffect } = require("./agent-tool-effect-registry");

const SUMMARY_SOURCES = new Set(["deterministic", "tool", "model", "legacy-event"]);

function normalizeError(error) {
  if (!error) return null;
  return {
    name: String(error.name || "Error"),
    code: String(error.code || ""),
    message: String(error.message || error),
    cancelled: error.cancelled === true
  };
}

function isCancellation(details) {
  const error = details.error;
  const result = details.result;
  return result?.cancelled === true
    || error?.cancelled === true
    || /\bcancel(?:led|ed|lation)?\b/i.test(String(error?.code || error?.message || error || ""));
}

function resolveExecutionStatus(details, evidence) {
  if (isCancellation(details)) return "cancelled";
  if (evidence?.outcome === "denied") return "denied";
  if (evidence?.outcome === "not-executed" || details.result?.executed === false) return "skipped";
  return "executed";
}

function resolveOutcome(details, evidence, executionStatus) {
  if (evidence?.outcome === "no-op") return "no-op";
  if (executionStatus === "cancelled" || executionStatus === "denied" || executionStatus === "skipped") return "unknown";
  if (details.result?.status === "partial") return "partial";
  if (evidence?.outcome === "succeeded") return "succeeded";
  if (evidence?.outcome === "failed") return "failed";
  return "unknown";
}

/**
 * Normalize one recorded tool-evidence entry without evaluating semantic progress.
 * @param {object} details Raw evidence details plus the canonical evidence entry.
 * @param {object} artifactStore Request-local immutable artifact store.
 * @returns {object} JSON-serializable normalized tool observation.
 */
function normalizeToolObservation(details = {}, artifactStore) {
  const evidence = details.evidenceEntry || {};
  const tool = String(details.tool || evidence.tool || "");
  const toolCallId = String(details.toolCallId || evidence.toolCallId || "");
  const effect = describeToolEffect(tool, details.args || {}) || {
    effect: "unknown",
    capability: "unknown",
    resource: ""
  };
  const executionStatus = resolveExecutionStatus(details, evidence);
  const outcome = resolveOutcome(details, evidence, executionStatus);
  const artifactRef = artifactStore?.put?.({
    result: details.result === undefined ? null : details.result,
    error: normalizeError(details.error)
  }, {
    kind: "tool-result",
    contentType: "application/json",
    truncated: evidence.truncated === true
  }) || null;
  const summarySource = SUMMARY_SOURCES.has(details.summarySource) ? details.summarySource : "deterministic";
  const identity = toolCallId || String(evidence.id || artifactRef?.digest || "unknown");
  return {
    schemaVersion: 1,
    observationId: `observation:${identity}`,
    source: "tool",
    toolCallId,
    tool,
    executionStatus,
    outcome,
    summary: {
      text: String(evidence.summary || details.summary || details.error?.message || details.error || outcome),
      source: summarySource
    },
    effect: String(effect.effect || "unknown"),
    capability: String(effect.capability || "unknown"),
    resource: String(effect.resource || ""),
    files: Array.isArray(evidence.files) ? evidence.files.map(String) : [],
    evidenceRef: String(evidence.id || ""),
    artifactRef,
    truncated: evidence.truncated === true,
    verification: {
      verifiedState: evidence.verifiedState === true,
      independentlyConfirmed: evidence.successConfirmedIndependently === true,
      confirmationSource: String(evidence.confirmationSource || "")
    }
  };
}

module.exports = {
  normalizeToolObservation,
  resolveExecutionStatus,
  resolveOutcome
};
