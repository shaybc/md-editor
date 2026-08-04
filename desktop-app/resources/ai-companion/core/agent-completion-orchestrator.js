/**
 * Narrow orchestration seam for verifier-owned Agent semantic completion.
 */

"use strict";

const completionAssessment = require("./completion-assessment");
const { evaluateCompletionPolicy } = require("./agent-completion-policy");
const { composeFinalResponse } = require("./agent-final-response-composer");
const {
  buildBoundedEvidenceSnapshot,
  createVerificationEvidenceTracker,
  fingerprint
} = require("./agent-verification-evidence");

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
}

function mapVerificationStatus(overallStatus) {
  if (overallStatus === "complete") return "satisfied";
  if (overallStatus === "provisional") return "provisional";
  if (overallStatus === "unverified") return "unverified";
  return "unsatisfied";
}

function mapCriterionStatus(status) {
  if (status === "met") return "satisfied";
  if (status === "provisional") return "provisional";
  if (status === "unverified") return "unverified";
  return "unsatisfied";
}

function createBlockers(assessment) {
  return (assessment?.criteria || []).filter((criterion) => criterion?.status !== "met" && criterion?.arbitration).map((criterion) => ({
    type: String(criterion.arbitration.class || "unsatisfied"),
    criterionId: String(criterion.id || ""),
    evidenceRefs: uniqueStrings(criterion.evidenceIds),
    recoverable: criterion.arbitration.class !== "blocked",
    requiredAction: String(criterion.arbitration.guidance || "")
  }));
}

function createUnresolvedIssues(assessment) {
  return (assessment?.criteria || []).filter((criterion) => criterion?.status !== "met").map((criterion) => ({
    criterionId: String(criterion.id || ""),
    description: String(criterion.explanation || criterion.arbitration?.reason || assessment?.unmetSummary || "Criterion remains unsatisfied."),
    reasonCodes: criterion.arbitration?.class ? [String(criterion.arbitration.class)] : []
  }));
}

function normalizeVerificationResult(request, assessed, boundedEvidence) {
  const overflowIds = new Set(boundedEvidence.truncatedCriterionIds || []);
  const unknownCited = boundedEvidence.unknownCitedEvidenceIds || [];
  const criteria = (assessed.assessment?.criteria || []).map((criterion) => {
    const overflow = overflowIds.has(String(criterion.id));
    return {
      id: String(criterion.id || ""),
      status: overflow ? "unsatisfied" : mapCriterionStatus(criterion.status),
      evidenceRefs: overflow ? [] : uniqueStrings(criterion.evidenceIds),
      reasonCodes: overflow ? ["evidence_scope_overflow"] : [],
      explanation: overflow ? "Relevant evidence exceeded the bounded verification scope." : String(criterion.explanation || "")
    };
  });
  let verificationStatus = mapVerificationStatus(assessed.assessment?.overallStatus);
  if (overflowIds.size || unknownCited.length || criteria.some((criterion) => criterion.status === "unsatisfied")) verificationStatus = "unsatisfied";
  return {
    schemaVersion: 1,
    runId: request.runId,
    completionAttemptId: request.completionAttemptId,
    verificationId: request.verificationId,
    proposalDecisionId: request.proposalDecisionId,
    basedOnStateVersion: request.basedOnStateVersion,
    basedOnVerificationContextVersion: request.basedOnVerificationContextVersion,
    contractFingerprint: request.contractFingerprint,
    evidenceVersion: request.evidenceVersion,
    evidenceFingerprint: request.evidenceFingerprint,
    verificationStatus,
    criteria,
    blockers: createBlockers(assessed.assessment),
    unresolvedIssues: createUnresolvedIssues(assessed.assessment),
    reasonCodes: [
      ...(overflowIds.size ? ["evidence_scope_overflow"] : []),
      ...(unknownCited.length ? ["unknown_cited_evidence"] : [])
    ],
    diagnostics: {
      fallbackUsed: Boolean(assessed.assessment?.warning),
      repairCount: (assessed.diagnostics || []).filter((entry) => /repair/i.test(String(entry?.phase || entry?.code || ""))).length
    }
  };
}

function createRejectedSteeringAssessment(assessment, result, gate) {
  if (assessment?.overallStatus === "incomplete") return assessment;
  const unsatisfiedIds = new Set((result?.criteria || [])
    .filter((criterion) => criterion.status !== "satisfied")
    .map((criterion) => criterion.id));
  if (!unsatisfiedIds.size && assessment?.criteria?.[0]?.id) unsatisfiedIds.add(assessment.criteria[0].id);
  const blockerClass = gate.reasonCodes.includes("unresolved_blocker") ? "ambiguity" : "unsatisfied";
  return {
    ...assessment,
    overallStatus: "incomplete",
    criteria: (assessment?.criteria || []).map((criterion) => unsatisfiedIds.has(criterion.id)
      ? {
          ...criterion,
          status: "unmet",
          arbitration: {
            class: blockerClass,
            reason: gate.reasonCodes.join(", "),
            guidance: blockerClass === "ambiguity"
              ? "Clarify the blocking ambiguity before proposing completion again."
              : "Gather admissible evidence and propose completion again."
          }
        }
      : criterion),
    unmetSummary: gate.reasonCodes.join(", ")
  };
}

function contentLimitedEvent(type, details = {}) {
  return {
    type,
    completionAttemptId: String(details.completionAttemptId || ""),
    verificationId: String(details.verificationId || ""),
    proposalDecisionId: String(details.proposalDecisionId || ""),
    status: String(details.status || ""),
    reasonCodes: uniqueStrings(details.reasonCodes).slice(0, 20),
    requestCount: Math.max(0, Number(details.requestCount) || 0),
    evidenceCount: Math.max(0, Number(details.evidenceCount) || 0),
    durationMs: Math.max(0, Number(details.durationMs) || 0),
    promptTokens: Math.max(0, Number(details.promptTokens) || 0),
    completionTokens: Math.max(0, Number(details.completionTokens) || 0),
    totalTokens: Math.max(0, Number(details.totalTokens) || 0)
  };
}

function canRetryStaleVerification(stateSession, attemptStateVersion) {
  const state = stateSession.getState();
  if (state.lifecycle?.status !== "running" || state.activeActions?.length || state.pendingInteractions?.length) return false;
  const transitions = stateSession.getTransitionsSince(attemptStateVersion)
    .filter((entry) => entry.type !== "verification_result_rejected");
  return transitions.length > 0 && transitions.every((entry) => ["action_finished", "observation_recorded"].includes(entry.type));
}

/**
 * Create one request-scoped completion coordinator.
 * @param {object} options Runtime dependencies and side-effect boundaries.
 * @returns {{runCompletionAttempt: Function}} Agent completion API.
 */
function createAgentCompletionOrchestrator(options = {}) {
  const stateSession = options.stateSession;
  const activityRun = options.activityRun;
  const emit = typeof options.emit === "function" ? options.emit : () => {};
  const evidenceTracker = createVerificationEvidenceTracker(() =>
    typeof activityRun.getEvidenceSnapshot === "function"
      ? activityRun.getEvidenceSnapshot()
      : activityRun.listEvidence());
  let attemptSequence = 0;
  let verificationSequence = 0;

  /** Verify one accepted M4 completion proposal and apply its semantic outcome. */
  async function runCompletionAttempt(input = {}) {
    const decision = input.decision;
    const candidate = String(input.candidate || "").trim();
    const contract = input.contract || {};
    const startedAt = Date.now();
    const proposalState = stateSession.getState().recentDecisions
      .find((entry) => entry.decisionId === decision.decisionId);
    if (proposalState?.status === "accepted") {
      stateSession.applyControllerEvent("decision_executed", { decisionId: decision.decisionId });
    } else if (proposalState?.status !== "executed") {
      return { action: "continue", outcome: "rejected", reasonCodes: ["invalid_completion_proposal"], assessment: null };
    }
    activityRun.recordCandidateEvidence(candidate);
    const completionAttemptId = `completion-${stateSession.getState().run.runId}-${++attemptSequence}`;
    let lastAssessment = null;

    for (let requestCount = 1; requestCount <= 2; requestCount += 1) {
      const beforeStart = stateSession.getState();
      const fullEvidence = evidenceTracker.snapshot();
      const evidenceFingerprint = fingerprint({ ledger: fullEvidence.evidenceFingerprint, candidate: fingerprint(candidate) });
      const boundedEvidence = buildBoundedEvidenceSnapshot({
        entries: fullEvidence.entries,
        contract,
        citedEvidenceIds: decision.payload?.evidenceIds || []
      });
      const verificationId = `verification-${beforeStart.run.runId}-${++verificationSequence}`;
      const contractFingerprint = fingerprint(contract);
      stateSession.applyControllerEvent("completion_attempt_started", {
        completionAttemptId,
        verificationId,
        proposalDecisionId: decision.decisionId,
        basedOnVerificationContextVersion: beforeStart.verificationContextVersion,
        contractFingerprint,
        evidenceVersion: fullEvidence.evidenceVersion,
        evidenceFingerprint,
        evidenceIndex: boundedEvidence.evidenceIndex,
        evidenceSelectionTruncatedCriterionIds: boundedEvidence.truncatedCriterionIds,
        unknownCitedEvidenceIds: boundedEvidence.unknownCitedEvidenceIds
      });
      const attempt = stateSession.getState().verification.activeAttempt;
      const request = {
        schemaVersion: 1,
        runId: beforeStart.run.runId,
        completionAttemptId,
        verificationId,
        proposalDecisionId: decision.decisionId,
        basedOnStateVersion: attempt.basedOnStateVersion,
        basedOnVerificationContextVersion: attempt.basedOnVerificationContextVersion,
        contractFingerprint,
        evidenceVersion: fullEvidence.evidenceVersion,
        evidenceFingerprint,
        candidate: { content: candidate, citedEvidenceIds: boundedEvidence.citedEvidenceIds },
        contract,
        criteria: (contract.acceptanceCriteria || []).map((criterion) => ({
          ...criterion,
          relevantEvidenceIds: boundedEvidence.criterionEvidence.find((entry) => entry.criterionId === String(criterion.id))?.relevantEvidenceIds || []
        })),
        evidenceEntries: boundedEvidence.entries
      };
      emit(contentLimitedEvent("agent-verification", {
        completionAttemptId, verificationId, proposalDecisionId: decision.decisionId,
        status: "started", requestCount, evidenceCount: boundedEvidence.entries.length
      }));

      const verificationUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      const assessed = await completionAssessment.assessAcceptanceCriteria({
        provider: options.provider,
        settings: options.settings,
        prompts: options.prompts,
        contract: { ...contract, acceptanceCriteria: request.criteria },
        candidate,
        evidenceLedger: request.evidenceEntries,
        signal: options.signal,
        onUsage: (usage) => {
          const promptTokens = Number(usage?.promptTokens || usage?.prompt_tokens || 0);
          const completionTokens = Number(usage?.completionTokens || usage?.completion_tokens || 0);
          verificationUsage.promptTokens += promptTokens;
          verificationUsage.completionTokens += completionTokens;
          verificationUsage.totalTokens += Number(usage?.totalTokens || usage?.total_tokens || promptTokens + completionTokens);
          options.onUsage?.(usage);
        },
        onDebug: options.onDebug
      });
      lastAssessment = assessed.assessment;
      const afterEvidence = evidenceTracker.snapshot();
      const currentState = stateSession.getState();
      const currentEvidenceFingerprint = fingerprint({ ledger: afterEvidence.evidenceFingerprint, candidate: fingerprint(candidate) });
      const staleReasons = [];
      if (currentState.verificationContextVersion !== request.basedOnVerificationContextVersion) staleReasons.push("stale_verification_context");
      if (afterEvidence.evidenceVersion !== request.evidenceVersion || currentEvidenceFingerprint !== request.evidenceFingerprint) staleReasons.push("stale_evidence_snapshot");
      if (fingerprint(currentState.intentContract) !== request.contractFingerprint) staleReasons.push("stale_intent_contract");
      if (staleReasons.length) {
        stateSession.applyControllerEvent("verification_result_rejected", { completionAttemptId, verificationId, reasonCodes: staleReasons });
        emit(contentLimitedEvent("agent-verification", {
          completionAttemptId, verificationId, proposalDecisionId: decision.decisionId,
          status: "stale", reasonCodes: staleReasons, requestCount,
          evidenceCount: boundedEvidence.entries.length, durationMs: Date.now() - startedAt,
          ...verificationUsage
        }));
        if (requestCount < 2 && canRetryStaleVerification(stateSession, request.basedOnStateVersion)) continue;
        stateSession.applyControllerEvent("completion_attempt_superseded", { completionAttemptId, reasonCodes: staleReasons });
        return { action: "continue", outcome: "rejected", reasonCodes: staleReasons, assessment: lastAssessment };
      }

      const result = normalizeVerificationResult(request, assessed, boundedEvidence);
      stateSession.applyControllerEvent("verification_result_recorded", { result });
      emit(contentLimitedEvent("agent-verification", {
        completionAttemptId, verificationId, proposalDecisionId: decision.decisionId,
        status: "accepted", reasonCodes: result.reasonCodes, requestCount,
        evidenceCount: boundedEvidence.entries.length, durationMs: Date.now() - startedAt,
        ...verificationUsage
      }));
      activityRun.setCompletionAssessment(assessed.assessment);
      emit({
        type: "completion-assessment",
        assessment: assessed.assessment,
        evidenceLedger: boundedEvidence.entries,
        diagnostics: assessed.diagnostics,
        stateOwned: true,
        completionAttemptId,
        verificationId
      });
      const gate = evaluateCompletionPolicy({ state: stateSession.getState(), result });
      if (gate.accepted) {
        stateSession.applyControllerEvent("completion_accepted", { completionAttemptId, verificationId });
      } else if (gate.outcome === "rejected") {
        stateSession.applyControllerEvent("completion_rejected", { completionAttemptId, verificationId, reasonCodes: gate.reasonCodes });
      } else {
        stateSession.applyControllerEvent("completion_terminated", {
          status: gate.outcome,
          reasonCodes: gate.reasonCodes,
          unresolvedIssues: result.unresolvedIssues
        });
      }
      emit(contentLimitedEvent("agent-completion", {
        completionAttemptId, verificationId, proposalDecisionId: decision.decisionId,
        status: gate.outcome, reasonCodes: gate.reasonCodes, requestCount,
        evidenceCount: boundedEvidence.entries.length, durationMs: Date.now() - startedAt,
        ...verificationUsage
      }));
      if (gate.outcome === "rejected") {
        return {
          action: "continue",
          outcome: "rejected",
          reasonCodes: gate.reasonCodes,
          assessment: createRejectedSteeringAssessment(assessed.assessment, result, gate),
          verificationResult: result
        };
      }
      const response = composeFinalResponse({ state: stateSession.getState(), outcome: gate.outcome, proposalContent: candidate, reasonCodes: gate.reasonCodes });
      if (typeof options.finalizeContent === "function") response.content = String(options.finalizeContent(response.content) || "");
      stateSession.applyControllerEvent("final_response_recorded", { response });
      return { action: "stop", outcome: gate.outcome, content: response.content, reasonCodes: gate.reasonCodes, assessment: assessed.assessment, verificationResult: result };
    }
    return { action: "continue", outcome: "rejected", reasonCodes: ["verification_retry_limit"], assessment: lastAssessment };
  }

  return { runCompletionAttempt };
}

module.exports = {
  createAgentCompletionOrchestrator,
  normalizeVerificationResult
};
