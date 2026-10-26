/** Canonical terminal outcomes for autonomous runs and delegated workers. */

"use strict";

const TERMINAL_STATUSES = Object.freeze({
  COMPLETED: "completed",
  SUCCESS: "success",
  BLOCKED: "blocked",
  FAILURE: "failure",
  CANCELLED: "cancelled",
  ABORTED: "aborted"
});

const VALID_STATUSES = new Set(Object.values(TERMINAL_STATUSES));

/** Create one terminal result without treating a natural model stop as verified success. */
function createTerminalOutcome(status, content, details = {}) {
  const normalizedStatus = VALID_STATUSES.has(status) ? status : TERMINAL_STATUSES.COMPLETED;
  return {
    status: normalizedStatus,
    content: String(content || "").trim(),
    reason: String(details.reason || normalizedStatus),
    code: String(details.code || ""),
    verified: details.verified === true,
    blocker: details.blocker && typeof details.blocker === "object" ? { ...details.blocker } : null
  };
}

/** Return true only for outcomes backed by an explicit completion check. */
function isVerifiedSuccess(outcome) {
  return outcome?.status === TERMINAL_STATUSES.SUCCESS && outcome?.verified === true;
}

/** Return blocker evidence only when a mutation was attempted but none completed. */
function findUnresolvedMutationBlocker(summary = {}) {
  const changed = Array.isArray(summary.changedFiles) ? summary.changedFiles : [];
  if (changed.length) return null;
  const attempted = Array.isArray(summary.attemptedChanges) ? summary.attemptedChanges : [];
  const blockedGroups = Array.isArray(summary.blockedChanges) ? summary.blockedChanges : [];
  const blocked = blockedGroups.flatMap((group) => Array.isArray(group?.items) ? group.items : []);
  const evidence = attempted[0] || blocked[0];
  if (!evidence) return null;
  return {
    category: "UNRESOLVED_MUTATION",
    target: String(evidence.path || ""),
    error: String(evidence.reason || "The requested mutation did not complete."),
    attemptedCount: attempted.length,
    blockedCount: blocked.length
  };
}

module.exports = { TERMINAL_STATUSES, createTerminalOutcome, findUnresolvedMutationBlocker, isVerifiedSuccess };
