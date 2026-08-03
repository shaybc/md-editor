/**
 * Response parser for the git-summary mode.
 *
 * The model is asked for a bare JSON object, but real-world responses arrive
 * fenced, prose-wrapped, or malformed. This parser extracts what it can and
 * degrades to a plain-text summary instead of failing the request.
 */

"use strict";

function extractJsonCandidate(text) {
  const source = String(text || "").trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : source;
  if (candidate.startsWith("{")) return candidate;
  // Prose-wrapped object: take the outermost brace span.
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return "";
}

function normalizeCommitSubject(value) {
  return String(value || "").split(/\r?\n/)[0].trim();
}

/**
 * Parse the model response into commit-message and summary fields.
 *
 * @param text - Raw model response content.
 * @returns { commitSubject, commitBody, summaryMarkdown, parsed } where
 *          parsed is false when the JSON contract was not honored and the raw
 *          text was kept as the summary instead.
 */
function parseGitSummaryResponse(text) {
  const fallback = {
    commitSubject: "",
    commitBody: "",
    summaryMarkdown: String(text || "").trim(),
    parsed: false
  };
  const candidate = extractJsonCandidate(text);
  if (!candidate) return fallback;
  let value;
  try {
    value = JSON.parse(candidate);
  } catch (_error) {
    return fallback;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  return {
    commitSubject: normalizeCommitSubject(value.commitSubject),
    commitBody: String(value.commitBody || "").trim(),
    summaryMarkdown: String(value.summaryMarkdown || "").trim(),
    parsed: true
  };
}

module.exports = {
  parseGitSummaryResponse
};
