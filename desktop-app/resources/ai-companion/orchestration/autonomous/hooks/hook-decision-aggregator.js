/** Deterministic aggregation of lifecycle action decisions. */

"use strict";

/** Combine action results without permitting a later result to weaken denial. */
function combineHookDecisions(results = []) {
  const decision = { additionalContext: [] };
  const notifications = [];
  const watchPaths = [];
  for (const result of results.filter(Boolean)) {
    if (result.additionalContext) decision.additionalContext.push(...asStrings(result.additionalContext, 12000));
    if (result.notification) notifications.push(normalizeNotification(result.notification));
    if (Array.isArray(result.notifications)) notifications.push(...result.notifications.map(normalizeNotification));
    if (result.watchPaths) watchPaths.push(...asStrings(result.watchPaths, 1000));
    if (result.updatedPrompt != null) decision.updatedPrompt = String(result.updatedPrompt).slice(0, 50000);
    if (result.updatedInput && typeof result.updatedInput === "object") decision.updatedInput = { ...(decision.updatedInput || {}), ...result.updatedInput };
    if (result.updatedOutput !== undefined) decision.updatedOutput = result.updatedOutput;
    if (result.retry === true) decision.retry = true;
    if (result.suppressOutput === true) decision.suppressOutput = true;
    if (result.permissionDecision === "deny" || result.decision === "deny") decision.permissionDecision = "deny";
    else if (!decision.permissionDecision && (result.permissionDecision === "allow" || result.decision === "allow")) decision.permissionDecision = "allow";
    if ((result.permissionDecision === "allow" || result.decision === "allow") && result.permissionTrusted === true) decision.permissionTrusted = true;
    if (result.continue === false || result.stop === true) {
      decision.continue = false;
      decision.stopReason = String(result.stopReason || result.reason || "A lifecycle hook stopped this operation.").slice(0, 4000);
    }
  }
  decision.additionalContext = decision.additionalContext.slice(0, 20);
  if (notifications.length) decision.notifications = notifications.slice(0, 20);
  if (watchPaths.length) decision.watchPaths = Array.from(new Set(watchPaths)).slice(0, 100);
  return decision;
}

function asStrings(value, limit) { return (Array.isArray(value) ? value : [value]).map((item) => String(item || "").slice(0, limit)).filter(Boolean); }
function normalizeNotification(value) { const source = typeof value === "string" ? { message: value } : (value || {}); return { level: ["info", "warning", "error"].includes(source.level) ? source.level : "info", message: String(source.message || "").slice(0, 4000) }; }

module.exports = { combineHookDecisions };
