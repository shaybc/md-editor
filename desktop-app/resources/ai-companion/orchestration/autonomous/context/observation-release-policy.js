/** Structural release rules for completed tool observations. */

"use strict";

const crypto = require("node:crypto");
const { estimateTokens } = require("./token-budget");

const RECENT_TURN_GROUPS = 5;
const PROTECTED_OUTCOME = /\b(error|failed|failure|denied|rejected|cancelled|unknown outcome|approval)\b/i;
const RELEASED_MARKER = /^\[Observation observation-\d+ released from active context\./;

function inspectObservation(message, metadata = {}) {
  const content = String(message?.content || "");
  return {
    tool: String(metadata.tool || "tool"),
    callId: String(metadata.callId || message?.tool_call_id || ""),
    round: Math.max(0, Number(metadata.round) || 0),
    byteCount: Buffer.byteLength(content, "utf8"),
    characterCount: content.length,
    estimatedTokens: estimateTokens(content),
    preview: content.replace(/\s+/g, " ").slice(0, 240),
    digest: crypto.createHash("sha256").update(content).digest("hex"),
    protectedOutcome: PROTECTED_OUTCOME.test(content),
    alreadyReleased: RELEASED_MARKER.test(content) || /^\[Observation stored as artifact-/.test(content)
  };
}

function evaluateObservation(entry, options = {}) {
  if (!entry?.message || entry.message.role !== "tool") return { releasable: false, reason: "not-active" };
  if (entry.state === "released" || entry.alreadyReleased) return { releasable: false, reason: "already-released" };
  if (entry.index >= Number(options.recentBoundary || 0)) return { releasable: false, reason: "recent-turn" };
  if (entry.round && entry.round >= Number(options.currentRound || 0)) return { releasable: false, reason: "current-round" };
  if (entry.protectedOutcome) return { releasable: false, reason: "protected-outcome" };
  return { releasable: true, reason: "completed-historical-observation" };
}

function recentObservationBoundary(messages, turnCount = RECENT_TURN_GROUPS) {
  let seen = 0;
  for (let index = messages.length - 1; index >= 1; index--) {
    if (messages[index]?.role !== "assistant") continue;
    seen += 1;
    if (seen < turnCount) continue;
    const resultIds = new Set(messages.slice(index).filter((message) => message.role === "tool").map((message) => message.tool_call_id));
    let boundary = index;
    for (let candidate = index - 1; candidate >= 1; candidate--) {
      if ((messages[candidate]?.tool_calls || []).some((call) => resultIds.has(call.id))) boundary = candidate;
    }
    return boundary;
  }
  return Math.min(1, messages.length);
}

module.exports = { RECENT_TURN_GROUPS, evaluateObservation, inspectObservation, recentObservationBoundary };
