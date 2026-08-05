/**
 * Plan state projection and single-writer reducer (M8.2).
 *
 * This is the Plan-specific view that plugs into the shared authoritative state
 * envelope in later sub-milestones. It is a pure reducer: every accepted event
 * returns a NEW projection and increments `stateVersion`. Input is never
 * mutated, so there remains exactly one mutation path (call the reducer).
 *
 * The model can propose an artifact and propose completion, but those are just
 * recorded proposals here — only a verification result accepted through the
 * reducer, plus the completion gate (later sub-milestones), can move the status
 * to `succeeded`.
 */

"use strict";

const PLAN_STATUSES = Object.freeze([
  "drafting",
  "inspecting",
  "awaiting_clarification",
  "verifying",
  "rejected",
  "succeeded",
  "blocked",
  "budget_exhausted",
  "failed",
  "cancelled"
]);

const TERMINAL_STATUSES = Object.freeze(new Set([
  "succeeded", "blocked", "budget_exhausted", "failed", "cancelled"
]));

const PLAN_EVENT_TYPES = Object.freeze({
  REQUIREMENTS_DERIVED: "requirements_derived",
  CLARIFICATION_RECORDED: "clarification_recorded",
  OBSERVATION_RECORDED: "observation_recorded",
  STRATEGY_REVISED: "strategy_revised",
  PLAN_PROPOSED: "plan_proposed",
  VERIFICATION_APPLIED: "verification_applied",
  COMPLETION_TERMINATED: "completion_terminated"
});

function freezeDeep(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * @param {object} params
 * @param {string} params.prompt - Verbatim user prompt (preserved authoritative).
 * @param {string} [params.runId]
 * @returns {object} Initial Plan projection at stateVersion 0.
 */
function createInitialPlanProjection(params = {}) {
  return {
    mode: "plan",
    stateVersion: 0,
    prompt: String(params.prompt || ""),
    runId: params.runId ? String(params.runId) : null,
    plan: {
      status: "drafting",
      artifact: null,
      latestProposalDecisionId: null,
      latestVerificationId: null,
      requirements: [],
      requirementsProvenance: null,
      requirementsProvisional: false,
      requirementCoverage: [],
      clarifications: [],
      observations: [],
      strategyRevisions: [],
      assumptions: [],
      unresolvedQuestions: [],
      risks: [],
      evidenceRefs: [],
      savedPlanRef: null,
      terminalReasonCodes: []
    }
  };
}

function withNextVersion(projection, mutate) {
  const next = freezeDeep(projection);
  next.stateVersion = projection.stateVersion + 1;
  mutate(next);
  return next;
}

function reject(projection, reasonCode) {
  return { accepted: false, reasonCodes: [reasonCode], projection };
}

/**
 * Apply one Plan event through the single mutation path.
 *
 * @param {object} projection - Current Plan projection.
 * @param {object} event - { type, ... }
 * @returns {{ accepted: boolean, reasonCodes: string[], projection: object }}
 */
function applyPlanEvent(projection, event) {
  if (!projection || typeof projection !== "object") return reject(projection, "invalid_projection");
  if (!event || typeof event !== "object" || typeof event.type !== "string") return reject(projection, "invalid_event");
  if (TERMINAL_STATUSES.has(projection.plan.status)) return reject(projection, "terminal_state");

  switch (event.type) {
    case PLAN_EVENT_TYPES.REQUIREMENTS_DERIVED: {
      if (!Array.isArray(event.requirements) || event.requirements.length === 0) {
        return reject(projection, "empty_requirements");
      }
      return {
        accepted: true,
        reasonCodes: [],
        projection: withNextVersion(projection, (next) => {
          next.plan.requirements = freezeDeep(event.requirements);
          next.plan.requirementsProvenance = event.provenance || "fallback";
          next.plan.requirementsProvisional = event.provisional === true;
          next.plan.requirementCoverage = event.requirements.map((r) => ({ id: r.id, covered: false }));
          if (next.plan.status === "drafting") next.plan.status = "inspecting";
        })
      };
    }

    case PLAN_EVENT_TYPES.CLARIFICATION_RECORDED: {
      // User answers are preserved verbatim with source "user".
      if (typeof event.text !== "string" || !event.text.trim()) return reject(projection, "empty_clarification");
      return {
        accepted: true,
        reasonCodes: [],
        projection: withNextVersion(projection, (next) => {
          next.plan.clarifications.push({ text: event.text, source: "user", questionId: event.questionId || null });
          next.plan.status = "inspecting";
        })
      };
    }

    case PLAN_EVENT_TYPES.OBSERVATION_RECORDED: {
      if (!event.observation || typeof event.observation !== "object") return reject(projection, "invalid_observation");
      return {
        accepted: true,
        reasonCodes: [],
        projection: withNextVersion(projection, (next) => {
          next.plan.observations.push(freezeDeep(event.observation));
          if (Array.isArray(event.evidenceRefs)) {
            for (const ref of event.evidenceRefs) if (ref) next.plan.evidenceRefs.push(String(ref));
          }
          next.plan.status = "inspecting";
        })
      };
    }

    case PLAN_EVENT_TYPES.STRATEGY_REVISED: {
      return {
        accepted: true,
        reasonCodes: [],
        projection: withNextVersion(projection, (next) => {
          next.plan.strategyRevisions.push({
            abandonedApproach: String(event.abandonedApproach || ""),
            revisedApproach: String(event.revisedApproach || "")
          });
          next.plan.status = "inspecting";
        })
      };
    }

    case PLAN_EVENT_TYPES.PLAN_PROPOSED: {
      if (!event.artifact || typeof event.artifact !== "object") return reject(projection, "invalid_artifact");
      if (!event.decisionId) return reject(projection, "missing_decision_id");
      return {
        accepted: true,
        reasonCodes: [],
        projection: withNextVersion(projection, (next) => {
          next.plan.artifact = freezeDeep(event.artifact);
          next.plan.latestProposalDecisionId = String(event.decisionId);
          next.plan.status = "verifying";
        })
      };
    }

    case PLAN_EVENT_TYPES.VERIFICATION_APPLIED: {
      // The reducer records a verifier RESULT; the verifier cannot mutate state
      // itself. Freshness (proposal decision id match) is enforced here.
      if (!event.verificationId) return reject(projection, "missing_verification_id");
      if (event.proposalDecisionId && event.proposalDecisionId !== projection.plan.latestProposalDecisionId) {
        return reject(projection, "stale_verification");
      }
      const status = String(event.status || "");
      if (!["satisfied", "unsatisfied", "provisional", "unverified", "blocked"].includes(status)) {
        return reject(projection, "invalid_verification_status");
      }
      return {
        accepted: true,
        reasonCodes: [],
        projection: withNextVersion(projection, (next) => {
          next.plan.latestVerificationId = String(event.verificationId);
          if (Array.isArray(event.requirementCoverage)) next.plan.requirementCoverage = freezeDeep(event.requirementCoverage);
          // Status stays runtime-owned: a satisfied result makes the plan
          // eligible for the completion gate but does not itself succeed.
          next.plan.status = status === "unsatisfied" ? "rejected" : "verifying";
        })
      };
    }

    case PLAN_EVENT_TYPES.COMPLETION_TERMINATED: {
      const status = String(event.status || "");
      if (!TERMINAL_STATUSES.has(status)) return reject(projection, "invalid_terminal_status");
      // Succeeding requires a fresh satisfied verification and non-provisional,
      // confirmed requirements; the gate (M8.5) enforces this, but the reducer
      // refuses an unsupported success as defense in depth.
      if (status === "succeeded") {
        if (!projection.plan.latestVerificationId) return reject(projection, "success_without_verification");
        if (projection.plan.requirementsProvisional && event.userConfirmed !== true) {
          return reject(projection, "success_on_provisional_requirements");
        }
      }
      return {
        accepted: true,
        reasonCodes: [],
        projection: withNextVersion(projection, (next) => {
          next.plan.status = status;
          next.plan.terminalReasonCodes = [...new Set((event.reasonCodes || []).map(String).filter(Boolean))];
          if (event.savedPlanRef) next.plan.savedPlanRef = String(event.savedPlanRef);
        })
      };
    }

    default:
      return reject(projection, "unknown_event_type");
  }
}

module.exports = {
  PLAN_STATUSES,
  TERMINAL_STATUSES,
  PLAN_EVENT_TYPES,
  createInitialPlanProjection,
  applyPlanEvent
};
