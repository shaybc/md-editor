"use strict";

/**
 * Provides pure text and range helpers for Windows scripting analyzers.
 */

/**
 * Split a document into lines while preserving line-oriented positions.
 * @param {string} text Document text.
 * @returns {string[]} Lines without line-break characters.
 */
function splitLines(text) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/**
 * Build a zero-based LSP-style range on one line.
 * @param {number} line Line index.
 * @param {number} start Start character.
 * @param {number} end End character.
 * @returns {object} Range object.
 */
function lineRange(line, start, end) {
  return {
    start: { line, character: Math.max(0, start) },
    end: { line, character: Math.max(Math.max(0, start), end) }
  };
}

/**
 * Build a diagnostic with a consistent shape for server conversion.
 * @param {number} line Line index.
 * @param {number} start Start character.
 * @param {number} end End character.
 * @param {string} message Diagnostic message.
 * @param {string} severity Diagnostic severity name.
 * @returns {object} Analyzer diagnostic.
 */
function diagnostic(line, start, end, message, severity = "warning") {
  return {
    range: lineRange(line, start, end),
    message,
    severity,
    source: "windows-scripting"
  };
}

/**
 * Normalize an identifier for case-insensitive scripting language lookup.
 * @param {string} value Identifier text.
 * @returns {string} Normalized key.
 */
function normalizeKey(value) {
  return String(value || "").toLowerCase();
}

/**
 * Return whether a position is inside a range.
 * @param {object} position LSP position.
 * @param {object} range LSP range.
 * @returns {boolean} True when the position is inside the range.
 */
function positionInRange(position, range) {
  if (!position || !range) return false;
  if (position.line < range.start.line || position.line > range.end.line) return false;
  if (position.line === range.start.line && position.character < range.start.character) return false;
  if (position.line === range.end.line && position.character > range.end.character) return false;
  return true;
}

/**
 * Collect regex matches for a line with ranges and capture values.
 * @param {string} lineText Text to inspect.
 * @param {RegExp} pattern Global regex with an optional first capture.
 * @param {number} lineIndex Line index.
 * @returns {object[]} Match records.
 */
function collectLineMatches(lineText, pattern, lineIndex) {
  const matches = [];
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(lineText)) !== null) {
    const text = match[1] || match[0];
    const start = match.index + (match[0].indexOf(text));
    matches.push({
      text,
      fullText: match[0],
      range: lineRange(lineIndex, start, start + text.length),
      index: start,
      match
    });
    if (match[0] === "") pattern.lastIndex += 1;
  }
  return matches;
}

/**
 * Find the word-like token at a document position.
 * @param {string[]} lines Document lines.
 * @param {object} position LSP position.
 * @param {RegExp} pattern Global token regex.
 * @returns {object|null} Token record or null.
 */
function tokenAtPosition(lines, position, pattern) {
  const lineText = lines[position?.line] || "";
  const matches = collectLineMatches(lineText, pattern, position?.line || 0);
  return matches.find((entry) => positionInRange(position, entry.range)) || null;
}

/**
 * Convert analyzer completion data into plain records for the server.
 * @param {string} label Completion label.
 * @param {string} type Business type name.
 * @param {string} detail Short detail.
 * @param {string} documentation Documentation text.
 * @param {string} insertText Optional insertion text.
 * @returns {object} Completion record.
 */
function completion(label, type, detail, documentation = "", insertText = "") {
  return { label, type, detail, documentation, insertText: insertText || label };
}

module.exports = {
  collectLineMatches,
  completion,
  diagnostic,
  lineRange,
  normalizeKey,
  positionInRange,
  splitLines,
  tokenAtPosition
};