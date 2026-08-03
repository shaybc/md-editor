/**
 * Deterministic normalization and assessment insertion for Plan responses.
 */

"use strict";

const OPEN_TAG = "<proposed_plan>";
const CLOSE_TAG = "</proposed_plan>";

function normalizeProposedPlanBlock(content) {
  const text = String(content || "").trim();
  const lower = text.toLowerCase();
  const openingIndex = lower.indexOf(OPEN_TAG);
  const closingIndex = lower.lastIndexOf(CLOSE_TAG);
  let body;
  if (openingIndex >= 0) {
    const bodyStart = openingIndex + OPEN_TAG.length;
    body = closingIndex >= bodyStart ? text.slice(bodyStart, closingIndex) : text.slice(bodyStart);
  } else if (closingIndex >= 0) {
    body = text.slice(0, closingIndex);
  } else {
    body = text;
  }
  body = body.replace(/<\/?proposed_plan>/gi, "").trim();
  return `${OPEN_TAG}\n${body}\n${CLOSE_TAG}`;
}

function insertPlanAssessmentSection(normalizedBlock, section) {
  const block = normalizeProposedPlanBlock(normalizedBlock);
  const index = block.toLowerCase().lastIndexOf(CLOSE_TAG);
  const before = block.slice(0, index).trimEnd();
  return `${before}\n\n${String(section || "").trim()}\n${CLOSE_TAG}`;
}

function extractProposedPlanBody(content) {
  const block = normalizeProposedPlanBlock(content);
  return block.slice(OPEN_TAG.length, -CLOSE_TAG.length).trim();
}

module.exports = {
  extractProposedPlanBody,
  insertPlanAssessmentSection,
  normalizeProposedPlanBlock
};
