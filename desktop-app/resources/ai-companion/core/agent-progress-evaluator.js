/**
 * Narrow structured semantic judgments for ambiguous Agent progress and replans.
 */

"use strict";

const MAX_EXCERPT_CHARS = 6000;
const MAX_RESPONSE_TOKENS = 500;

function toolDefinition(name, properties, required) {
  return {
    type: "function",
    function: {
      name,
      description: "Return only the requested bounded Agent progress judgment.",
      parameters: { type: "object", additionalProperties: false, properties, required }
    }
  };
}

const ASSESS_PROGRESS_TOOL = toolDefinition("assess_agent_progress", {
  status: { type: "string", enum: ["meaningful", "no_progress", "inconclusive"] },
  reasonCode: { type: "string" },
  evidenceIds: { type: "array", items: { type: "string" } }
}, ["status", "reasonCode", "evidenceIds"]);

const COMPARE_STRATEGY_TOOL = toolDefinition("compare_agent_strategies", {
  equivalentToStrategyId: { type: ["string", "null"] },
  reasonCode: { type: "string" }
}, ["equivalentToStrategyId", "reasonCode"]);

const VALIDATE_REPLAN_TOOL = toolDefinition("validate_agent_replan", {
  materiallyDifferent: { type: "boolean" },
  reasonCode: { type: "string" }
}, ["materiallyDifferent", "reasonCode"]);

function parseArguments(message, toolName) {
  const call = (message?.toolCalls || []).find((entry) => String(entry?.function?.name || entry?.name || "") === toolName);
  if (!call) throw new Error("missing_progress_evaluator_call");
  const raw = call.function?.arguments ?? call.arguments ?? "{}";
  const value = typeof raw === "object" ? raw : JSON.parse(String(raw));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_progress_evaluator_arguments");
  return value;
}

function bounded(value, maximum = 2000) {
  const text = String(value || "");
  return text.length > maximum ? text.slice(0, maximum) : text;
}

async function requestJudgment(provider, request, options, repairCode = "") {
  const messages = [
    {
      role: "system",
      content: "Judge only the supplied Agent progress question. Do not infer completion, modify acceptance criteria, or add facts. Return the required function call."
    },
    { role: "user", content: JSON.stringify(request) }
  ];
  if (repairCode) messages.push({ role: "system", content: `The prior result was invalid (${repairCode}). Return one valid ${options.tool.function.name} call.` });
  const message = await provider.completeMessage(messages, {
    temperature: 0,
    maxTokens: MAX_RESPONSE_TOKENS,
    signal: options.signal,
    tools: [options.tool],
    toolChoice: { type: "function", function: { name: options.tool.function.name } },
    onUsage: options.onUsage,
    onDebug: options.onDebug
  });
  return parseArguments(message, options.tool.function.name);
}

async function requestWithRepair(provider, request, options, validate, fallback) {
  try {
    const first = await requestJudgment(provider, request, options);
    if (validate(first)) return { value: first, repaired: false, fallback: false };
    const repaired = await requestJudgment(provider, request, options, "schema_validation_failed");
    if (validate(repaired)) return { value: repaired, repaired: true, fallback: false };
  } catch (_error) {
    try {
      const repaired = await requestJudgment(provider, request, options, "provider_or_parse_failure");
      if (validate(repaired)) return { value: repaired, repaired: true, fallback: false };
    } catch (_repairError) {
      // The deterministic fallback below is deliberately non-authoritative.
    }
  }
  return { value: fallback, repaired: false, fallback: true };
}

/** Create the request-scoped semantic evaluator. */
function createAgentProgressEvaluator(options = {}) {
  const provider = options.provider;

  async function evaluateProgress(input = {}) {
    const allowedEvidence = new Set((input.observation?.evidenceRef ? [input.observation.evidenceRef] : []).map(String));
    const request = {
      question: "Did this completed action materially advance the active intent or its expected observation?",
      intent: { id: bounded(input.intent?.id, 160), statement: bounded(input.intent?.statement) },
      expectedObservation: bounded(input.decision?.expectedObservation),
      observation: {
        id: bounded(input.observation?.observationId, 200),
        tool: bounded(input.observation?.tool, 200),
        outcome: bounded(input.observation?.outcome, 40),
        summary: bounded(input.observation?.summary?.text),
        evidenceRef: bounded(input.observation?.evidenceRef, 160),
        artifactExcerpt: bounded(input.artifactExcerpt, MAX_EXCERPT_CHARS)
      }
    };
    const result = await requestWithRepair(provider, request, { ...options, tool: ASSESS_PROGRESS_TOOL }, (value) => {
      return ["meaningful", "no_progress", "inconclusive"].includes(value?.status)
        && typeof value?.reasonCode === "string"
        && Array.isArray(value?.evidenceIds)
        && value.evidenceIds.every((id) => allowedEvidence.has(String(id)));
    }, { status: "inconclusive", reasonCode: "semantic_evaluator_unavailable", evidenceIds: [] });
    return { ...result.value, repaired: result.repaired, fallback: result.fallback };
  }

  async function compareStrategies(input = {}) {
    const recentIds = new Set((input.recentStrategies || []).map((entry) => String(entry.strategyId || "")));
    const request = {
      question: "Is the candidate strategy semantically equivalent to one recent stalled strategy?",
      candidate: input.candidate,
      recentStrategies: (input.recentStrategies || []).slice(-6)
    };
    const result = await requestWithRepair(provider, request, { ...options, tool: COMPARE_STRATEGY_TOOL }, (value) => {
      return typeof value?.reasonCode === "string"
        && (value.equivalentToStrategyId === null || recentIds.has(String(value.equivalentToStrategyId)));
    }, { equivalentToStrategyId: null, reasonCode: "strategy_comparison_unavailable" });
    return { ...result.value, repaired: result.repaired, fallback: result.fallback };
  }

  async function validateReplan(input = {}) {
    const request = {
      question: "Does the proposed strategy materially change how the active intent will be pursued?",
      intent: input.intent,
      abandonedApproach: bounded(input.abandonedApproach),
      revisedApproach: bounded(input.revisedApproach),
      previousStrategy: input.previousStrategy,
      proposedStrategy: input.proposedStrategy
    };
    const result = await requestWithRepair(provider, request, { ...options, tool: VALIDATE_REPLAN_TOOL }, (value) => {
      return typeof value?.materiallyDifferent === "boolean" && typeof value?.reasonCode === "string";
    }, { materiallyDifferent: false, reasonCode: "replan_comparison_unavailable" });
    return { ...result.value, repaired: result.repaired, fallback: result.fallback };
  }

  return { compareStrategies, evaluateProgress, validateReplan };
}

module.exports = {
  createAgentProgressEvaluator,
  _test: { ASSESS_PROGRESS_TOOL, COMPARE_STRATEGY_TOOL, VALIDATE_REPLAN_TOOL, parseArguments }
};
