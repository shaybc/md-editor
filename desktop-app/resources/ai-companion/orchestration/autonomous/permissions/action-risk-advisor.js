/** Constrained low-cost advice for ambiguous actions in risk-routed mode. */

"use strict";

const { publicCommandImpact } = require("../../../security/command-impact/command-impact-view");

const RESTRICTED_COMMAND_IMPACTS = new Set(["destructive", "external-impact", "sensitive-read", "unknown"]);

class ActionRiskAdvisor {
  constructor(provider, request, emit = () => {}) {
    this.provider = provider;
    this.request = request;
    this.emit = emit;
  }

  /** Classify one approval descriptor without granting authority beyond policy. */
  async evaluate(descriptor, context = {}) {
    if (descriptor?.capability === "shell.freeform" && (!context.commandAnalysis?.parseable || RESTRICTED_COMMAND_IMPACTS.has(context.commandAnalysis?.impact))) {
      return { decision: "prompt", reason: "Structural command analysis requires user confirmation." };
    }
    if (!this.provider) return { decision: "prompt", reason: "Risk advice is unavailable." };
    try {
      const response = await this.provider.completeMessage([{ role: "user", content: buildPrompt(descriptor, context) }], {
        temperature: 0,
        maxTokens: 120,
        signal: this.request.signal
      });
      const result = parseDecision(response?.content);
      if (!result) return { decision: "prompt", reason: "Risk advice was invalid." };
      if (result.decision === "allow" && descriptor?.capability === "shell.freeform" && context.commandAnalysis?.canAutoRun !== true) {
        return { decision: "prompt", reason: "Model advice cannot override structural command restrictions." };
      }
      return result;
    } catch (error) {
      this.emit({ type: "recovery-warning", reason: "risk-advisor-failed", error: error?.message || String(error), summary: "Risk advice failed closed to interactive approval." });
      return { decision: "prompt", reason: "Risk advice failed; user confirmation is required." };
    }
  }
}

function buildPrompt(descriptor, context = {}) {
  const commandImpact = context.commandAnalysis ? publicCommandImpact(context.commandAnalysis) : undefined;
  return [
    "Classify one proposed tool action for authorization. Return JSON only.",
    "Allowed decisions: allow only for clearly reversible, workspace-local, low-impact actions; otherwise prompt.",
    "Never allow deletion, credential access, external publication, unrestricted commands, protected paths, or uncertain actions.",
    JSON.stringify({ capability: descriptor?.capability, resource: descriptor?.resource, label: descriptor?.label, commandImpact })
  ].join("\n");
}

function parseDecision(content) {
  try {
    const parsed = JSON.parse(String(content || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim());
    if (!['allow', 'prompt'].includes(parsed.decision)) return null;
    return { decision: parsed.decision, automatic: parsed.decision === "allow", reason: String(parsed.reason || "Risk advisor decision.").slice(0, 300) };
  } catch (_error) { return null; }
}

module.exports = { ActionRiskAdvisor, parseDecision };
