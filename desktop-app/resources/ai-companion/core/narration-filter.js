/**
 * Quality/dedupe gate for agent narration text shown between tool calls.
 *
 * The model is prompted to emit short "what I found / what I'll do next"
 * preambles alongside its tool calls. This module decides which of those
 * preambles are worth showing in the panel: boilerplate openers, near-empty
 * fragments, and repeats of recent narration are dropped so long agent runs
 * do not flood the timeline with zero-value text. Filtering applies to UI
 * emission only — the full content always stays in the model message history.
 */

"use strict";

const MIN_NARRATION_CHARS = 20;
const MAX_NARRATION_CHARS = 600;
const RECENT_NARRATIONS_TO_COMPARE = 3;
// Word-set (Jaccard) overlap above which a narration is considered a rephrase
// of the previous one and dropped.
const NEAR_DUPLICATE_OVERLAP_THRESHOLD = 0.8;
// Openers that carry no information on their own ("Okay, let me..."). Only
// dropped when the whole narration is essentially just the opener.
const BOILERPLATE_ONLY_PATTERN = /^(ok(ay)?|now|next|sure|alright|let me|let's|i('| wi)ll|i am going to|i'm going to)\b[\s\S]{0,15}$/i;

/**
 * Normalize narration text for display: trim, strip leading markdown heading
 * markers, and collapse runs of blank lines.
 *
 * @param {string} value - Raw narration text from the model message content.
 * @returns {string} Cleaned display text (may be empty).
 */
function cleanNarrationText(value) {
  return String(value || "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Build the case/whitespace-insensitive key used for exact-duplicate checks.
 *
 * @param {string} text - Cleaned narration text.
 * @returns {string} Comparison key.
 */
function createComparisonKey(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Split narration into a set of lowercase words for near-duplicate overlap.
 *
 * @param {string} text - Cleaned narration text.
 * @returns {Set<string>} Unique lowercase word tokens.
 */
function createWordSet(text) {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) || []);
}

/**
 * Compute the Jaccard overlap (0..1) between two word sets.
 *
 * @param {Set<string>} left - First word set.
 * @param {Set<string>} right - Second word set.
 * @returns {number} Intersection size over union size; 0 when both are empty.
 */
function computeWordOverlap(left, right) {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) {
    if (right.has(word)) shared += 1;
  }
  return shared / (left.size + right.size - shared);
}

/**
 * Truncate over-long narration so a runaway preamble cannot flood the panel.
 *
 * @param {string} text - Cleaned narration text.
 * @returns {string} Text capped at MAX_NARRATION_CHARS with an ellipsis.
 */
function capNarrationLength(text) {
  return text.length > MAX_NARRATION_CHARS ? `${text.slice(0, MAX_NARRATION_CHARS)}…` : text;
}

/**
 * Create a per-task-run narration filter.
 *
 * @returns {{ accept: (value: string) => string | null }} Filter whose
 *   `accept` returns display-ready narration text, or null when the text is
 *   boilerplate, too short, or repeats recently accepted narration.
 *   Stateful across calls (remembers recent narrations); no other side effects.
 */
function createNarrationFilter() {
  const recentKeys = [];
  let previousWordSet = null;

  function accept(value) {
    const text = capNarrationLength(cleanNarrationText(value));
    if (text.length < MIN_NARRATION_CHARS) return null;
    if (BOILERPLATE_ONLY_PATTERN.test(text)) return null;
    const key = createComparisonKey(text);
    if (recentKeys.includes(key)) return null;
    const wordSet = createWordSet(text);
    if (previousWordSet && computeWordOverlap(wordSet, previousWordSet) > NEAR_DUPLICATE_OVERLAP_THRESHOLD) return null;
    recentKeys.push(key);
    if (recentKeys.length > RECENT_NARRATIONS_TO_COMPARE) recentKeys.shift();
    previousWordSet = wordSet;
    return text;
  }

  return { accept };
}

module.exports = {
  createNarrationFilter
};
