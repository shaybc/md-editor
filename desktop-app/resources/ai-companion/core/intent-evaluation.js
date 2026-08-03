/**
 * Request-local instrumentation for intent experiment calls, usage, events, and rollout records.
 */

"use strict";

const { deriveCriterionClaimType } = require("./intent-claim-type");
const { criterionGoalOverlap } = require("./intent-contract");

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

/** Create one metrics tracker and a provider wrapper for a single companion request. */
function createIntentEvaluationTracker(options = {}) {
  const startedAt = Date.now();
  const calls = [];
  const intentEvents = [];

  function recordUsage(call, usage = {}) {
    call.promptTokens = Math.max(call.promptTokens, finite(usage.promptTokens));
    call.completionTokens = Math.max(call.completionTokens, finite(usage.completionTokens));
    call.totalTokens = Math.max(call.totalTokens, finite(usage.totalTokens), call.promptTokens + call.completionTokens);
  }

  async function invoke(kind, provider, args) {
    const call = { kind, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    calls.push(call);
    const requestOptions = args[1] && typeof args[1] === "object" ? args[1] : {};
    const originalUsage = requestOptions.onUsage;
    const wrappedOptions = {
      ...requestOptions,
      onUsage: (usage) => {
        recordUsage(call, usage);
        originalUsage?.(usage);
      }
    };
    return provider[kind](args[0], wrappedOptions);
  }

  /** Wrap provider completion methods without changing their request or response semantics. */
  function wrapProvider(provider) {
    const wrapped = Object.create(provider);
    wrapped.complete = (...args) => invoke("complete", provider, args);
    wrapped.completeMessage = (...args) => invoke("completeMessage", provider, args);
    return wrapped;
  }

  /** Record only experiment-relevant event facts; raw prompts and provider bodies are excluded. */
  function recordEvent(event = {}) {
    if (event.type === "intent-contract") {
      const criteria = event.contract?.acceptanceCriteria || [];
      const overlaps = criteria.map((criterion) => criterionGoalOverlap(criterion, event.contract?.goal));
      const responseCriteria = criteria.filter((criterion) =>
        deriveCriterionClaimType(criterion, event.contract) === "response-content"
      );
      intentEvents.push({
        type: event.type,
        variant: event.variant || "",
        source: event.source || "",
        verifiability: event.contract?.verifiability || event.meta?.verifiability || "",
        criterionGoalOverlap: overlaps.length ? Math.max(...overlaps) : 0,
        responseContentShare: criteria.length ? responseCriteria.length / criteria.length : 0
      });
    }
    if (event.type === "intent-uninterpreted") intentEvents.push({
      type: event.type,
      reason: String(event.reason || "").slice(0, 120),
      verifiability: "unverified"
    });
    if (event.type === "clarification") intentEvents.push({ type: event.type, clarificationId: event.clarificationId || "" });
    if (event.type === "completion-assessment") intentEvents.push({
      type: event.type,
      overallStatus: event.assessment?.overallStatus || "",
      criteria: (event.assessment?.criteria || []).map((criterion) => ({
        id: criterion.id,
        shape: criterion.shape || "",
        status: criterion.status,
        evidenceQuote: criterion.evidenceQuote || "",
        incoherenceDowngrade: criterion.incoherenceDowngrade === true,
        arbitrationClass: criterion.arbitration?.class || "",
        harnessClaimType: criterion.harnessClaimType || criterion.claimType || ""
      }))
    });
  }

  /** Build the bounded local evaluation record emitted at request completion. */
  function createRecord(details = {}) {
    const contractEvents = intentEvents.filter((event) => event.type === "intent-contract");
    const assessment = [...intentEvents].reverse().find((event) => event.type === "completion-assessment") || null;
    const evidenceLedger = Array.isArray(details.evidenceLedger) ? details.evidenceLedger : [];
    const actualFiles = [...new Set(evidenceLedger
      .filter((entry) => entry?.source === "tool" && entry?.outcome === "succeeded")
      .flatMap((entry) => Array.isArray(entry.files) ? entry.files : [])
      .map(String)
      .filter(Boolean))];
    return {
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      requestId: String(options.requestId || ""),
      chatId: String(options.chatId || ""),
      mode: String(options.mode || ""),
      taskType: String(details.taskType || "answer"),
      experiment: { ...(options.experiment || {}) },
      durationMs: Date.now() - startedAt,
      providerCalls: calls.length,
      promptTokens: calls.reduce((sum, call) => sum + call.promptTokens, 0),
      completionTokens: calls.reduce((sum, call) => sum + call.completionTokens, 0),
      totalTokens: calls.reduce((sum, call) => sum + call.totalTokens, 0),
      contractSources: contractEvents.map((event) => event.source || event.variant).filter(Boolean),
      verifiability: contractEvents.at(-1)?.verifiability || "",
      uninterpretedReason: [...intentEvents].reverse().find((event) => event.type === "intent-uninterpreted")?.reason || "",
      clarificationCount: intentEvents.filter((event) => event.type === "clarification").length,
      revisionCount: contractEvents.filter((event) => ["revised", "amended"].includes(event.variant)).length,
      criterionGoalOverlap: contractEvents.at(-1)?.criterionGoalOverlap || 0,
      responseContentShare: contractEvents.at(-1)?.responseContentShare || 0,
      // Closed-loop steering (populated by the revision loop; 0/false/"" when steering is off).
      revisionIterations: Number(details.revisionIterations) || 0,
      converged: details.converged === true,
      finalReason: String(details.finalReason || ""),
      assessment,
      actualFiles,
      evidence: evidenceLedger.map((entry) => ({ id: entry.id, source: entry.source, tool: entry.tool || "", outcome: entry.outcome }))
    };
  }

  return { createRecord, recordEvent, wrapProvider };
}

module.exports = { createIntentEvaluationTracker };
