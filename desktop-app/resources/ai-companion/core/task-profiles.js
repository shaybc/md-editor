/**
 * Task-profile registry (M11.2 / M11.6).
 *
 * A task profile is a *small deterministic* specialization for a task type that is
 * recognized deterministically, backed by a narrow existing capability, has a stable
 * workflow, and whose success can be checked deterministically — and where restricting
 * the tool surface materially improves safety or efficiency. Profiles are NOT a library
 * of hardcoded task scripts: open-ended work (fix-bug, implement-feature, investigate-*)
 * has no profile and stays on the general controller.
 *
 * A profile supplies:
 *   - requiredCapability: the capability the task needs.
 *   - allowedTools: the *only* workspace tools the profile exposes (control tools —
 *     request_user_input / report_blocked — are always allowed on top of these).
 *   - taskScopes: the scope subset handed to the tool-scope registry, so the resolved
 *     surface is intersected down before the allow-list is applied.
 *   - a versioned deterministic workflow (step template) used by the readiness gate,
 *     progress controller, verifier, checkpoints, and final composer as one shared
 *     source of truth.
 *
 * Pure module: no IO, no provider calls, no side effects.
 */

"use strict";

const toolScopes = require("./tool-scope-registry");

/** Control tools are always available regardless of a profile's allow-list. */
const CONTROL_TOOLS = Object.freeze(["agent_request_user_input", "agent_report_blocked"]);

/** Monotonic lifecycle of a profile within one run (never narrows back after fallback). */
const PROFILE_STATUS = Object.freeze({
  ACTIVE: "active",
  FALLBACK_ACTIVE: "fallback_active",
  COMPLETED: "completed",
  FAILED: "failed"
});

/** Deterministic conditions that may widen a profile back to the general controller. */
const FALLBACK_REASONS = Object.freeze({
  UNRESOLVED_KEY: "unresolved_preference_key",
  UNSUPPORTED_CAPABILITY: "unsupported_capability",
  CONTRADICTORY_RESULTS: "contradictory_results",
  USER_REQUESTED_INVESTIGATION: "user_requested_investigation",
  WORKFLOW_INVARIANT_FAILED: "workflow_invariant_failed"
});

const FALLBACK_REASON_SET = Object.freeze(new Set(Object.values(FALLBACK_REASONS)));

/** Workflow step lifecycle. Only the reducer advances these (see agent-state). */
const STEP_STATUS = Object.freeze({ PENDING: "pending", ACTIVE: "active", COMPLETED: "completed", FAILED: "failed" });

/**
 * The profile registry. Each key is a taskType the classifier may return with
 * applicability "certain".
 */
const PROFILES = Object.freeze({
  "preferences-update": Object.freeze({
    profileId: "preferences-update",
    profileVersion: 1,
    workflowVersion: 1,
    requiredCapability: "settings.change",
    allowedTools: Object.freeze(["preferences_search", "preferences_get", "preferences_update"]),
    taskScopes: Object.freeze(["settings.read", "settings.write"]),
    // The tool whose accepted observation advances the "update" step, and the reader
    // used for read-back verification of the "verify" step.
    mutationTool: "preferences_update",
    verificationTool: "preferences_get",
    deterministicWorkflow: Object.freeze([
      Object.freeze({ id: "resolve", label: "Resolve requested preference keys" }),
      Object.freeze({ id: "update", label: "Apply the requested values" }),
      Object.freeze({ id: "verify", label: "Read back and verify persisted values" })
    ])
  }),
  "git-status-summary": Object.freeze({
    profileId: "git-status-summary",
    profileVersion: 1,
    workflowVersion: 1,
    requiredCapability: "git.read",
    allowedTools: Object.freeze(["git_status", "git_diff", "git_branches"]),
    taskScopes: Object.freeze(["git.read"]),
    mutationTool: null,
    verificationTool: null,
    deterministicWorkflow: Object.freeze([
      Object.freeze({ id: "read", label: "Read repository status" }),
      Object.freeze({ id: "summarize", label: "Summarize the working-tree state" })
    ])
  })
});

/**
 * Look up a profile by task type.
 * @param {string} taskType
 * @returns {object|null}
 */
function getProfile(taskType) {
  return (taskType && PROFILES[taskType]) || null;
}

/** All registered profile ids. */
function listProfiles() {
  return Object.keys(PROFILES);
}

/**
 * Resolve the concrete tool-name set a profile exposes for a request. The mode/user
 * allow-list surface (via the scope registry, narrowed by the profile's taskScopes) is
 * intersected with the profile's explicit allowedTools; control tools are always added.
 *
 * @param {object} profile - A profile from the registry.
 * @param {object} context - { mode, enabledScopes }
 * @returns {{ toolNames: string[], controlTools: string[] }}
 */
function resolveProfileToolNames(profile, context = {}) {
  if (!profile) return { toolNames: [...CONTROL_TOOLS], controlTools: [...CONTROL_TOOLS] };
  const resolved = new Set(toolScopes.resolveToolset({
    mode: context.mode || "agent",
    enabledScopes: context.enabledScopes,
    taskScopes: profile.taskScopes
  }).toolNames);
  const allowed = profile.allowedTools.filter((name) => resolved.has(name));
  return { toolNames: [...allowed, ...CONTROL_TOOLS], controlTools: [...CONTROL_TOOLS] };
}

/**
 * Whether the profile's required capability is actually reachable for the request
 * (i.e. its mutation/primary tool survives scope resolution). Used to distinguish a
 * "certain" classification from one that must be `rejected` for lack of capability.
 *
 * @param {object} profile
 * @param {object} context - { mode, enabledScopes }
 * @returns {boolean}
 */
function isCapabilityAvailable(profile, context = {}) {
  if (!profile) return false;
  const { toolNames } = resolveProfileToolNames(profile, context);
  const primary = profile.mutationTool || profile.allowedTools[0];
  return primary ? toolNames.includes(primary) : toolNames.length > CONTROL_TOOLS.length;
}

/**
 * Create the authoritative workflow-step state for a profile. This object is the single
 * source of truth for the readiness gate, progress controller, verifier, checkpoints,
 * and composer. Only the reducer may advance its steps.
 *
 * @param {object} profile
 * @returns {object|null}
 */
function createWorkflowState(profile) {
  if (!profile) return null;
  const steps = profile.deterministicWorkflow.map((step, index) => ({
    id: step.id,
    label: step.label,
    status: index === 0 ? STEP_STATUS.ACTIVE : STEP_STATUS.PENDING
  }));
  return {
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    workflowVersion: profile.workflowVersion,
    steps,
    activeStepId: steps.length ? steps[0].id : null,
    profileStatus: PROFILE_STATUS.ACTIVE,
    fallbackCount: 0
  };
}

/**
 * Whether a recovered workflow state is compatible with the current profile definition.
 * An incompatible profile/workflow version must not resume blindly (M11.6 recovery).
 *
 * @param {object} savedState - A previously persisted workflow state.
 * @param {object} profile - The current profile definition.
 * @returns {boolean}
 */
function isWorkflowStateCompatible(savedState, profile) {
  if (!savedState || !profile) return false;
  return savedState.profileId === profile.profileId
    && savedState.profileVersion === profile.profileVersion
    && savedState.workflowVersion === profile.workflowVersion;
}

/**
 * Build a bounded, auditable fallback event. Fallback is a runtime transition on a
 * defined reason only — never because the model asked for more context.
 *
 * @param {object} params - { fromProfile, reasonCode, allowedAdditionalScopes, boundedActions }
 * @returns {object|null} The event, or null for an unrecognized reason.
 */
function buildFallbackEvent(params = {}) {
  if (!FALLBACK_REASON_SET.has(params.reasonCode)) return null;
  const bounded = Number(params.boundedActions);
  return {
    eventType: "task_profile_fallback_requested",
    fromProfile: String(params.fromProfile || ""),
    reasonCode: params.reasonCode,
    allowedAdditionalScopes: Array.isArray(params.allowedAdditionalScopes)
      ? params.allowedAdditionalScopes.filter(Boolean)
      : ["workspace.search", "workspace.read"],
    boundedActions: Number.isFinite(bounded) && bounded > 0 ? Math.floor(bounded) : 3
  };
}

module.exports = {
  CONTROL_TOOLS,
  PROFILE_STATUS,
  FALLBACK_REASONS,
  STEP_STATUS,
  PROFILES,
  getProfile,
  listProfiles,
  resolveProfileToolNames,
  isCapabilityAvailable,
  createWorkflowState,
  isWorkflowStateCompatible,
  buildFallbackEvent
};
