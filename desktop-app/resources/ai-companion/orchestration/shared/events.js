/** Canonical autonomous runtime events. */

"use strict";

const EVENT_TYPES = Object.freeze({
  RUN_STARTED: "run-started", ASSISTANT_DELTA: "assistant-delta", ASSISTANT_FINAL: "assistant-final",
  TOOL_STARTED: "tool-started", TOOL_COMPLETED: "tool-completed", TOOL_FAILED: "tool-failed",
  PLAN_SAVED: "plan-saved", PLAN_UPDATED: "plan-updated",
  MEMORY_PROPOSED: "memory-proposed", MEMORY_CONFIRMED: "memory-confirmed",
  MEMORY_REJECTED: "memory-rejected", MEMORY_FORGOTTEN: "memory-forgotten",
  PERMISSION_MODE_CHANGED: "permission-mode-changed", TOOL_DENIED: "tool-denied",
  DENIAL_GUARD_TRIPPED: "denial-guard-tripped", ROUTE_SELECTED: "route-selected", ROUTE_PURPOSE_SELECTED: "route-purpose-selected",
  ROUTE_FALLBACK: "route-fallback", ROUTE_UNAVAILABLE: "route-unavailable",
  WORK_CREATED: "work-created", WORK_UPDATED: "work-updated", WORK_DELETED: "work-deleted",
  WORKER_QUEUED: "worker-queued", WORKER_STARTED: "worker-started", WORKER_MESSAGE: "worker-message",
  WORKER_COMPLETED: "worker-completed", WORKER_FAILED: "worker-failed", WORKER_STOPPED: "worker-stopped",
  CONTEXT_THINNED: "context-thinned", CONTINUITY_UPDATED: "continuity-updated", CHRONICLE_SAVED: "chronicle-saved",
  OBSERVATION_RELEASED: "observation-released", OBSERVATION_RELEASE_REMINDER: "observation-release-reminder",
  TOOL_CATALOG_UPDATED: "tool-catalog-updated", TOOL_SCHEMA_ACTIVATED: "tool-schema-activated",
  TOOL_SCHEMA_RESTORED: "tool-schema-restored", TOOL_SCHEMA_UNAVAILABLE: "tool-schema-unavailable",
  RULES_DISCOVERED: "rules-discovered", RULE_ACTIVATED: "rule-activated",
  RULE_UNAVAILABLE: "rule-unavailable", RULES_REFRESHED: "rules-refreshed",
  SKILLS_DISCOVERED: "skills-discovered", SKILL_INVOCATION_STARTED: "skill-invocation-started",
  SKILL_INVOCATION_COMPLETED: "skill-invocation-completed", SKILL_UNAVAILABLE: "skill-unavailable", SKILLS_CHANGED: "skills-changed",
  SKILL_INVOCATION_FAILED: "skill-invocation-failed", SLASH_WORKFLOW_EXPANDED: "slash-workflow-expanded",
  EXTENSION_TOOL_ACTIVATED: "extension-tool-activated", EXTENSION_TOOL_STARTED: "extension-tool-started", EXTENSION_TOOL_COMPLETED: "extension-tool-completed", EXTENSION_TOOL_FAILED: "extension-tool-failed", EXTENSION_COMMAND_EXPANDED: "extension-command-expanded", EXTENSION_CAPABILITY_UNAVAILABLE: "extension-capability-unavailable",
  SCHEDULE_CREATED: "schedule-created", SCHEDULE_CANCELLED: "schedule-cancelled", SCHEDULE_FIRED: "schedule-fired",
  SCHEDULE_COMPLETED: "schedule-completed", SCHEDULE_FAILED: "schedule-failed",
  USER_INPUT_REQUESTED: "user-input-requested", USER_INPUT_RESOLVED: "user-input-resolved", USER_INPUT_DECLINED: "user-input-declined",
  INTERNET_SEARCH_COMPLETED: "internet-search-completed", PAGE_RETRIEVED: "page-retrieved",
  NOTEBOOK_INSPECTED: "notebook-inspected", NOTEBOOK_UPDATED: "notebook-updated",
  WORKSPACE_STRUCTURE_BUILT: "workspace-structure-built", SCHEDULE_RESTORED: "schedule-restored", SCHEDULE_MISSED: "schedule-missed",
  HOOK_STARTED: "hook-started", HOOK_PROGRESS: "hook-progress", HOOK_COMPLETED: "hook-completed",
  HOOK_SKIPPED: "hook-skipped", HOOK_BLOCKED: "hook-blocked", HOOK_FAILED: "hook-failed", HOOK_NOTIFICATION: "hook-notification",
  HOOK_QUEUED: "hook-queued", HOOK_WAITING_APPROVAL: "hook-waiting-approval", HOOK_INPUT_REWRITTEN: "hook-input-rewritten",
  RUN_RESTORED: "run-restored", RECOVERY_WARNING: "recovery-warning",
  COMPACTION: "compaction", RUN_COMPLETED: "run-completed", RUN_CANCELLED: "run-cancelled", RUN_FAILED: "run-failed"
});

/** Ensure the authoritative final response is published at most once. */
function createRunEmitter(emit) {
  let finalPublished = false;
  return {
    emit,
    final(content, extra = {}) {
      if (finalPublished) return false;
      finalPublished = true;
      emit({ type: EVENT_TYPES.ASSISTANT_FINAL, content: String(content || ""), ...extra });
      return true;
    },
    hasFinal() { return finalPublished; }
  };
}

module.exports = { EVENT_TYPES, createRunEmitter };
