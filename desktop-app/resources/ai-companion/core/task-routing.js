/**
 * Task routing (M11.2).
 *
 * Ties the deterministic classifier to the profile registry and the runtime flag. This
 * is the seam the controller engages (M11.4a): given a request, decide whether a narrow
 * task profile applies and, if so, produce the restricted tool surface and the initial
 * workflow state. A profile is only activated when the classification is `certain` and
 * `taskProfileRoutingEnabled` is set; anything else keeps the general controller.
 *
 * Pure: no IO, no provider calls, no side effects.
 */

"use strict";

const { classifyTask, APPLICABILITY } = require("./task-classifier");
const { getProfile, resolveProfileToolNames, createWorkflowState } = require("./task-profiles");

/**
 * Resolve the task profile (if any) for a request.
 *
 * @param {object} request
 * @param {string} request.prompt
 * @param {string} [request.mode]
 * @param {object} [request.settings] - normalized settings (reads taskProfileRoutingEnabled)
 * @param {object} [request.enabledScopes] - per-tool allow-list
 * @param {object[]} [request.resolvedDescriptors]
 * @param {boolean} [request.authorized]
 * @returns {{
 *   engaged: boolean,
 *   classification: object,
 *   profile: object|null,
 *   toolNames: string[]|null,
 *   workflowState: object|null,
 *   reason: string
 * }}
 */
function resolveTaskProfile(request = {}) {
  const classification = classifyTask({
    prompt: request.prompt,
    mode: request.mode,
    context: { enabledScopes: request.enabledScopes },
    resolvedDescriptors: request.resolvedDescriptors,
    attachments: request.attachments,
    interactionType: request.interactionType,
    authorized: request.authorized
  });

  const flagOn = request.settings?.taskProfileRoutingEnabled === true;
  const base = { engaged: false, classification, profile: null, toolNames: null, workflowState: null, reason: "" };

  if (!flagOn) return { ...base, reason: "flag-off" };
  if (classification.applicability !== APPLICABILITY.CERTAIN) {
    return { ...base, reason: `not-certain:${classification.applicability}` };
  }

  const profile = getProfile(classification.taskType);
  if (!profile) return { ...base, reason: "no-profile" };

  const { toolNames } = resolveProfileToolNames(profile, {
    mode: request.mode || "agent",
    enabledScopes: request.enabledScopes
  });

  return {
    engaged: true,
    classification,
    profile,
    toolNames,
    workflowState: createWorkflowState(profile),
    reason: "engaged"
  };
}

module.exports = {
  resolveTaskProfile
};
