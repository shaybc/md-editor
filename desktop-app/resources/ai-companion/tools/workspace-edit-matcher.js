/**
 * Prepares bounded, byte-preserving workspace search/replace edits.
 */

"use strict";

const crypto = require("node:crypto");

const APPLY_EDIT_CODES = Object.freeze({
  SEARCH_NOT_FOUND: "APPLY_EDIT_SEARCH_NOT_FOUND",
  AMBIGUOUS_MATCH: "APPLY_EDIT_AMBIGUOUS_MATCH",
  MATCH_COUNT_CHANGED: "APPLY_EDIT_MATCH_COUNT_CHANGED",
  STALE_PREVIEW: "APPLY_EDIT_STALE_PREVIEW"
});

function hashWorkspaceContent(content) {
  return crypto.createHash("sha256").update(String(content || ""), "utf8").digest("hex");
}

function normalizeLineEndings(value) {
  return String(value || "").replace(/\r\n|\r/g, "\n");
}

function canonicalizeEditSearch(value) {
  return normalizeLineEndings(value)
    .split("\n")
    .map((line) => line.replace(/^[\t ]+/, "").replace(/[\t ]+$/, ""))
    .join("\n");
}

function detectNewlineStyle(content) {
  const matches = String(content || "").match(/\r\n|\r|\n/g) || [];
  if (!matches.length) return "\n";
  const counts = new Map();
  for (const match of matches) counts.set(match, (counts.get(match) || 0) + 1);
  let selected = matches[0];
  for (const [newline, count] of counts) {
    if (count > (counts.get(selected) || 0)) selected = newline;
  }
  return selected;
}

function convertReplacementNewlines(replacement, newline) {
  return normalizeLineEndings(replacement).replace(/\n/g, newline);
}

function normalizeWithOffsets(value, whitespaceTolerant) {
  const source = String(value || "");
  const chars = [];
  const starts = [];
  const ends = [];
  for (let index = 0; index < source.length;) {
    if (source[index] === "\r") {
      const end = source[index + 1] === "\n" ? index + 2 : index + 1;
      chars.push("\n");
      starts.push(index);
      ends.push(end);
      index = end;
    } else {
      chars.push(source[index]);
      starts.push(index);
      ends.push(index + 1);
      index += 1;
    }
  }
  if (!whitespaceTolerant) return { text: chars.join(""), starts, ends };

  const keptChars = [];
  const keptStarts = [];
  const keptEnds = [];
  let lineStart = 0;
  for (let index = 0; index <= chars.length; index += 1) {
    if (index < chars.length && chars[index] !== "\n") continue;
    let contentStart = lineStart;
    let contentEnd = index;
    while (contentStart < contentEnd && (chars[contentStart] === " " || chars[contentStart] === "\t")) contentStart += 1;
    while (contentEnd > contentStart && (chars[contentEnd - 1] === " " || chars[contentEnd - 1] === "\t")) contentEnd -= 1;
    for (let charIndex = contentStart; charIndex < contentEnd; charIndex += 1) {
      keptChars.push(chars[charIndex]);
      keptStarts.push(starts[charIndex]);
      keptEnds.push(ends[charIndex]);
    }
    if (index < chars.length) {
      keptChars.push("\n");
      keptStarts.push(starts[index]);
      keptEnds.push(ends[index]);
    }
    lineStart = index + 1;
  }
  return { text: keptChars.join(""), starts: keptStarts, ends: keptEnds };
}

function findOccurrences(haystack, needle) {
  const matches = [];
  if (!needle) return matches;
  let offset = 0;
  while (offset <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) break;
    matches.push({ start: index, end: index + needle.length });
    offset = index + Math.max(1, needle.length);
  }
  return matches;
}

function toRawMatches(currentContent, search, mode) {
  if (mode === "exact") return findOccurrences(currentContent, search);
  const tolerant = mode === "whitespace";
  const current = normalizeWithOffsets(currentContent, tolerant);
  const needle = normalizeWithOffsets(search, tolerant).text;
  return findOccurrences(current.text, needle).map((match) => ({
    start: current.starts[match.start],
    end: current.ends[match.end - 1]
  }));
}

function lineNumberAt(content, offset) {
  return normalizeLineEndings(String(content || "").slice(0, offset)).split("\n").length;
}

function createCandidates(content, matches) {
  return matches.slice(0, 10).map((match, index) => ({
    occurrence: index + 1,
    startLine: lineNumberAt(content, match.start),
    endLine: lineNumberAt(content, match.end)
  }));
}

function createApplyEditError(code, filePath, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.path = String(filePath || "");
  error.retryable = details.retryable === true;
  error.doNotRetry = details.retryable !== true;
  error.preExecution = true;
  error.executed = false;
  if (Number.isInteger(details.matchCount)) error.matchCount = details.matchCount;
  if (Array.isArray(details.candidates)) error.candidates = details.candidates;
  return error;
}

function selectMatch(filePath, content, matches, occurrence, expectedMatches) {
  const count = matches.length;
  const candidates = createCandidates(content, matches);
  const hasOccurrence = occurrence !== undefined && occurrence !== null;
  if (hasOccurrence && (!Number.isInteger(occurrence) || occurrence < 1 || !Number.isInteger(expectedMatches) || expectedMatches < 1 || expectedMatches !== count || occurrence > count)) {
    throw createApplyEditError(APPLY_EDIT_CODES.MATCH_COUNT_CHANGED, filePath, "The selected occurrence cannot be applied because the match count changed or the selector is invalid.", { matchCount: count, candidates });
  }
  if (!count) {
    throw createApplyEditError(APPLY_EDIT_CODES.SEARCH_NOT_FOUND, filePath, "This exact normalized search cannot be applied.");
  }
  if (!hasOccurrence && count > 1) {
    throw createApplyEditError(APPLY_EDIT_CODES.AMBIGUOUS_MATCH, filePath, "The search matches more than one range. Use a more specific search or provide occurrence and expectedMatches.", { matchCount: count, candidates });
  }
  return { selected: matches[hasOccurrence ? occurrence - 1 : 0], occurrence: hasOccurrence ? occurrence : 1, count };
}

/**
 * Resolve an apply_edit proposal into the exact content that can be previewed and written.
 * @param {object} input Current file content and proposed edit arguments.
 * @returns {object} Prepared edit with raw offsets kept inside the harness.
 */
function prepareWorkspaceEdit(input = {}) {
  const currentContent = String(input.currentContent || "");
  const search = String(input.search || "");
  const filePath = String(input.path || "");
  if (!search) {
    throw createApplyEditError(APPLY_EDIT_CODES.SEARCH_NOT_FOUND, filePath, "This exact normalized search cannot be applied.");
  }
  let mode = "exact";
  let matches = toRawMatches(currentContent, search, mode);
  if (!matches.length) {
    mode = "line-ending";
    matches = toRawMatches(currentContent, search, mode);
  }
  if (!matches.length) {
    mode = "whitespace";
    matches = toRawMatches(currentContent, search, mode);
  }
  const selection = selectMatch(filePath, currentContent, matches, input.occurrence, input.expectedMatches);
  const newline = detectNewlineStyle(currentContent);
  const replacement = convertReplacementNewlines(input.replacement, newline);
  const proposedContent = currentContent.slice(0, selection.selected.start) + replacement + currentContent.slice(selection.selected.end);
  return {
    path: filePath,
    sourceHash: hashWorkspaceContent(currentContent),
    matchMode: mode,
    matchCount: selection.count,
    occurrence: selection.occurrence,
    startOffset: selection.selected.start,
    endOffset: selection.selected.end,
    startLine: lineNumberAt(currentContent, selection.selected.start),
    endLine: lineNumberAt(currentContent, selection.selected.end),
    proposedContent
  };
}

function createStalePreviewError(filePath) {
  return createApplyEditError(
    APPLY_EDIT_CODES.STALE_PREVIEW,
    filePath,
    "The file changed after the approved preview. Prepare and approve a new edit.",
    { retryable: true }
  );
}

module.exports = {
  APPLY_EDIT_CODES,
  canonicalizeEditSearch,
  createStalePreviewError,
  hashWorkspaceContent,
  prepareWorkspaceEdit
};
