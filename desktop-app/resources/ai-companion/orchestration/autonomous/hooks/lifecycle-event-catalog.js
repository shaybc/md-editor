/** Canonical lifecycle events and their default failure behavior. */

"use strict";

const EVENT_POLICIES = Object.freeze({
  "run-start": { phase: "before", onError: "block" },
  "run-restored": { phase: "after", onError: "continue" },
  "user-prompt": { phase: "before", onError: "block" },
  "before-model": { phase: "before", onError: "block" },
  "after-model": { phase: "after", onError: "continue" },
  "before-tool": { phase: "before", onError: "block" },
  "after-tool": { phase: "after", onError: "continue" },
  "tool-failure": { phase: "after", onError: "continue" },
  "tool-denied": { phase: "after", onError: "continue" },
  "permission-request": { phase: "before", onError: "continue" },
  "permission-resolved": { phase: "after", onError: "continue" },
  "permission-denied": { phase: "after", onError: "continue" },
  "user-input-request": { phase: "before", onError: "continue" },
  "user-input-resolved": { phase: "after", onError: "continue" },
  "user-input-declined": { phase: "after", onError: "continue" },
  "before-compaction": { phase: "before", onError: "block" },
  "after-compaction": { phase: "after", onError: "continue" },
  "work-created": { phase: "after", onError: "continue" },
  "work-updated": { phase: "after", onError: "continue" },
  "work-completing": { phase: "before", onError: "block" },
  "work-completed": { phase: "after", onError: "continue" },
  "worker-queued": { phase: "after", onError: "continue" },
  "worker-started": { phase: "before", onError: "continue" },
  "worker-workspace-changed": { phase: "after", onError: "continue" },
  "worker-completed": { phase: "after", onError: "continue" },
  "worker-failed": { phase: "after", onError: "continue" },
  "worker-stopped": { phase: "after", onError: "continue" },
  "schedule-fired": { phase: "after", onError: "continue" },
  "schedule-completed": { phase: "after", onError: "continue" },
  "schedule-failed": { phase: "after", onError: "continue" },
  "instructions-loaded": { phase: "after", onError: "continue" },
  "configuration-changed": { phase: "after", onError: "continue" },
  "file-changed": { phase: "after", onError: "continue" },
  "workspace-changed": { phase: "after", onError: "continue" },
  "before-final": { phase: "before", onError: "continue" },
  "run-finish": { phase: "after", onError: "continue" },
  "run-cancelled": { phase: "after", onError: "continue" },
  "run-failed": { phase: "after", onError: "continue" }
});

const EVENT_ALIASES = Object.freeze({
  "run-opening": "run-start",
  "run-recovered": "run-restored",
  "prompt-submitted": "user-prompt",
  "tool-failed": "tool-failure",
  "permission-requested": "permission-request",
  "permission-response": "permission-resolved",
  "context-renewing": "before-compaction",
  "context-renewed": "after-compaction",
  "task-completing": "work-completing",
  "task-completed": "work-completed",
  "run-completed": "run-finish"
});

/** Normalize a public event name to the runtime event catalog. */
function normalizeLifecycleEvent(value) {
  const name = String(value || "").trim();
  return EVENT_ALIASES[name] || name;
}

/** Return the event policy or null when the event is unsupported. */
function lifecycleEventPolicy(value) { return EVENT_POLICIES[normalizeLifecycleEvent(value)] || null; }

module.exports = { EVENT_ALIASES, EVENT_POLICIES, lifecycleEventPolicy, normalizeLifecycleEvent };
