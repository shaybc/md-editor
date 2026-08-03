/**
 * Harness-owned acceptance-criterion classification and observable-signal detection.
 * Pure module: no IO, provider calls, or side effects.
 */

"use strict";

const OUTCOME_ACTION_PATTERN = /\b(?:check(?:ed|ing)?|read(?:ing)?|fetch(?:ed|ing)?|inspect(?:ed|ing|s)?|verif(?:y|ied|ies|ying)|confirm(?:ed|ing|s)?|updat(?:e|ed|es|ing)|chang(?:e|ed|es|ing)|modif(?:y|ied|ies|ying)|edit(?:ed|ing|s)?|creat(?:e|ed|es|ing)|delet(?:e|ed|es|ing)|add(?:ed|ing|s)?|remov(?:e|ed|es|ing)|appl(?:y|ied|ies|ying)|run(?:ning|s)?|test(?:ed|ing|s)?|build(?:ing|s|t)?|commit(?:ted|ting|s)?)\b/i;
const CHANGE_ACTION_PATTERN = /\b(?:updat(?:e|ed|es|ing)|chang(?:e|ed|ing)|fix(?:ed|es|ing)?|modif(?:y|ied|ies|ying)|edit(?:ed|ing|s)?|creat(?:e|ed|es|ing)|delet(?:e|ed|es|ing)|add(?:ed|ing|s)?|remov(?:e|ed|es|ing)|appl(?:y|ied|ies|ying))\b/i;
const RESPONSE_DELIVERABLE_PATTERN = /\b(?:answer|candidate|explain|explanation|plan|recommendation|report|response|summary)\b/i;
const CHECKABLE_STATE_PATTERN = /\b(?:absent|added|built|changed|confirmed|contains?|created|deleted|diagnosed|exists?|identified|modified|passes?|present|removed|says?|succeeds?|updated|verified)\b/i;
const FILE_REFERENCE_PATTERN = /(?:^|[\s`'"(])([A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)*\.[A-Za-z0-9_-]+)(?=$|[\s`'"),:;])/;

function criterionText(criterion) {
  return String(criterion?.description || criterion || "").trim();
}

function normalizedTarget(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase().trim();
}

/** Return all named workspace targets carried by an intent contract. */
function listNamedTargetValues(contract) {
  return ["files", "symbols", "errors", "uiAreas"]
    .flatMap((group) => Array.isArray(contract?.namedTargets?.[group]) ? contract.namedTargets[group] : [])
    .map((target) => normalizedTarget(target?.value))
    .filter(Boolean);
}

/** Decide whether a criterion explicitly references a named or path-like workspace target. */
function criterionReferencesWorkspaceTarget(criterion, contract) {
  const text = normalizedTarget(criterionText(criterion));
  if (!text) return false;
  if (listNamedTargetValues(contract).some((target) => text.includes(target))) return true;
  return FILE_REFERENCE_PATTERN.test(criterionText(criterion));
}

/** Decide whether a criterion states a concrete state that can be checked. */
function criterionHasCheckableState(criterion, contract) {
  const text = criterionText(criterion);
  return criterionReferencesWorkspaceTarget(criterion, contract)
    || CHECKABLE_STATE_PATTERN.test(text)
    || /\bgit\s+(?:changes?|diff)\b|\btests?\s+pass(?:es|ed)?\b|\bbuild\s+succeeds?\b/i.test(text);
}

/** Decide whether text includes a state-changing action verb. */
function hasChangeAction(value) {
  return CHANGE_ACTION_PATTERN.test(String(value || ""));
}

/**
 * Derive the criterion claim type from task intent and criterion semantics.
 * The extractor/assessor model's label is deliberately not consulted.
 */
function deriveCriterionClaimType(criterion, contract = {}) {
  if (contract.taskType === "planning") return "mixed";
  const text = criterionText(criterion);
  const hasWorkspaceClaim = ["diagnostic", "implementation", "conformance"].includes(contract.taskType)
    || criterionReferencesWorkspaceTarget(criterion, contract)
    || OUTCOME_ACTION_PATTERN.test(text)
    || criterionHasCheckableState(criterion, contract);
  const hasResponseDeliverable = RESPONSE_DELIVERABLE_PATTERN.test(text);
  if (hasWorkspaceClaim && hasResponseDeliverable) return "mixed";
  if (hasWorkspaceClaim) return "workspace-state";
  return contract.taskType === "answer" ? "response-content" : "workspace-state";
}

module.exports = {
  criterionHasCheckableState,
  criterionReferencesWorkspaceTarget,
  deriveCriterionClaimType,
  hasChangeAction
};
