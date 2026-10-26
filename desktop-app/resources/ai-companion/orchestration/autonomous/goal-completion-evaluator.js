/** Optional bounded semantic completion check for explicitly configured goals. */

"use strict";

const MAX_EVALUATIONS = 3;

class GoalCompletionEvaluator {
  /** Create an evaluator only when the run supplies an explicit completion goal. */
  constructor(request = {}, emit = () => {}, snapshot = {}) {
    this.goal = String(request.completionGoal || request.goal || "").trim();
    this.enabled = Boolean(this.goal) || request.settings?.agentGoalEvaluationEnabled === true;
    this.emit = emit;
    this.attempts = Math.max(0, Math.min(Number(snapshot.attempts) || 0, MAX_EVALUATIONS));
  }

  /** Evaluate a candidate final response against observed run evidence. */
  async evaluate(input = {}) {
    if (!this.enabled) return { status: "unverified" };
    if (this.attempts >= MAX_EVALUATIONS) return { status: "unverified", reason: "completion-evaluation-limit" };
    this.attempts += 1;
    const provider = input.provider;
    if (!provider?.completeMessage) return { status: "unverified", reason: "completion-evaluator-unavailable" };
    try {
      const response = await provider.completeMessage([
        {
          role: "system",
          content: [
            "Evaluate whether the explicit goal is complete using only the supplied candidate response and observed evidence.",
            "Return strict JSON with keys: status, confidence, reason, next_instruction.",
            "status must be complete, incomplete, or blocked. Do not infer tool success from textual claims."
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            goal: this.goal || input.prompt || "",
            candidateResponse: String(input.content || "").slice(0, 12000),
            evidence: input.evidence || {}
          })
        }
      ], { temperature: 0, maxTokens: 500, signal: input.signal });
      const decision = parseDecision(response?.content);
      if (!decision) return { status: "unverified", reason: "completion-evaluator-invalid" };
      this.emit({ type: "completion-evaluated", attempt: this.attempts, ...decision, summary: decision.reason });
      if (decision.status === "complete" && decision.confidence >= 0.7) return { status: "success", verified: true, reason: decision.reason };
      if (decision.status === "blocked") return { status: "blocked", reason: decision.reason };
      if (this.attempts >= MAX_EVALUATIONS) return { status: "unverified", reason: decision.reason || "completion-evaluation-limit" };
      return { status: "incomplete", retry: true, reason: decision.reason, nextInstruction: decision.nextInstruction || "Continue working toward the explicit goal and verify the result." };
    } catch (error) {
      this.emit({ type: "completion-evaluation-failed", error: error?.message || String(error), summary: "The optional completion evaluation failed; the run remains unverified." });
      return { status: "unverified", reason: "completion-evaluator-failed" };
    }
  }

  /** Return restart-safe bounded evaluation state. */
  snapshot() { return { attempts: this.attempts }; }
}

function parseDecision(content) {
  const text = String(content || "").trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
  let value;
  try { value = JSON.parse(text); } catch (_error) { return null; }
  const status = String(value?.status || "").toLowerCase();
  if (!["complete", "incomplete", "blocked"].includes(status)) return null;
  return {
    status,
    confidence: Math.max(0, Math.min(Number(value.confidence) || 0, 1)),
    reason: String(value.reason || "").slice(0, 2000),
    nextInstruction: String(value.next_instruction || "").slice(0, 4000)
  };
}

module.exports = { GoalCompletionEvaluator, MAX_EVALUATIONS, parseDecision };
