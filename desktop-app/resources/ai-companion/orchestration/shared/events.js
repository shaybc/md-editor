/** Canonical autonomous runtime events. */

"use strict";

const EVENT_TYPES = Object.freeze({
  RUN_STARTED: "run-started", ASSISTANT_DELTA: "assistant-delta", ASSISTANT_FINAL: "assistant-final",
  TOOL_STARTED: "tool-started", TOOL_COMPLETED: "tool-completed", TOOL_FAILED: "tool-failed",
  PLAN_SAVED: "plan-saved", PLAN_UPDATED: "plan-updated",
  WORK_CREATED: "work-created", WORK_UPDATED: "work-updated", WORK_DELETED: "work-deleted",
  WORKER_QUEUED: "worker-queued", WORKER_STARTED: "worker-started", WORKER_MESSAGE: "worker-message",
  WORKER_COMPLETED: "worker-completed", WORKER_FAILED: "worker-failed", WORKER_STOPPED: "worker-stopped",
  CONTEXT_THINNED: "context-thinned", CONTINUITY_UPDATED: "continuity-updated", CHRONICLE_SAVED: "chronicle-saved",
  OBSERVATION_RELEASED: "observation-released", OBSERVATION_RELEASE_REMINDER: "observation-release-reminder",
  TOOL_CATALOG_UPDATED: "tool-catalog-updated", TOOL_SCHEMA_ACTIVATED: "tool-schema-activated",
  TOOL_SCHEMA_RESTORED: "tool-schema-restored", TOOL_SCHEMA_UNAVAILABLE: "tool-schema-unavailable",
  RULES_DISCOVERED: "rules-discovered", RULE_ACTIVATED: "rule-activated",
  RULE_UNAVAILABLE: "rule-unavailable", RULES_REFRESHED: "rules-refreshed",
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
