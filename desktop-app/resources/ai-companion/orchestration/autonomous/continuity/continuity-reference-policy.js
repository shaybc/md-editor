/** Historical-reference filtering for autonomous continuity content. */

"use strict";

/**
 * Remove runtime identity claims that must never become durable task knowledge.
 * @param {string} content Candidate continuity or recall text.
 * @returns {string} Historical task content without assistant identity assertions.
 */
function sanitizeContinuityText(content) {
  return String(content || "").split(/\r?\n/).filter((line) => !isRuntimeIdentityLine(line)).join("\n");
}

function isRuntimeIdentityLine(line) {
  const text = String(line || "");
  return [
    /(?:assistant|runtime|provider|model)\s+(?:identity|make|model)/i,
    /(?:make\s*(?:and|\/)\s*model|model\s*(?:and|\/)\s*make)/i,
    /powered\s+by/i,
    /identif(?:y|ied|ication)\b.{0,80}\b(?:assistant|model)/i,
    /\b(?:assistant|model)\b.{0,80}\bidentif(?:y|ied|ication)/i,
    /(?:clarif(?:y|ied)|greeting)\b.{0,40}\bidentity\b/i,
    /(?:greeting|assistant|model)\b.{0,80}\bidentified\s+as\b/i,
    /\bsupported\s+models?\b/i
  ].some((pattern) => pattern.test(text));
}

module.exports = { sanitizeContinuityText };
