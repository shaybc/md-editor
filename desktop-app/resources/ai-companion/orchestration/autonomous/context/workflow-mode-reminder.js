/** Periodic mode reminders for long multi-turn conversations. */

"use strict";

const USER_TURN_INTERVAL = 5;

class WorkflowModeReminder {
  constructor(emit = () => {}) {
    this.emit = emit;
    this.lastInterval = 0;
  }

  consider(messages = [], mode = "chat") {
    if (!["agent", "plan"].includes(mode)) return "";
    const userTurns = messages.filter((message) => message?.role === "user").length;
    const interval = Math.floor(userTurns / USER_TURN_INTERVAL);
    if (!interval || userTurns % USER_TURN_INTERVAL !== 0 || interval <= this.lastInterval) return "";
    this.lastInterval = interval;
    const full = interval % 2 === 1;
    this.emit({ type: "workflow-mode-reminder", mode, userTurns, full, summary: `${mode} mode guidance was refreshed.` });
    if (mode === "plan") {
      return full
        ? "Plan mode reminder: remain read-only, ground decisions in the workspace, and persist the complete durable plan before presenting it as saved."
        : "Plan mode remains read-only; persist the complete plan before completion.";
    }
    return full
      ? "Agent mode reminder: continue autonomously within scope, keep complex work items current when useful, and verify changes before reporting completion."
      : "Agent mode remains active; keep tracked work current and verify before completion.";
  }

  snapshot() { return { lastInterval: this.lastInterval }; }
  restore(snapshot = {}) { this.lastInterval = Math.max(0, Number(snapshot.lastInterval) || 0); }
}

module.exports = { USER_TURN_INTERVAL, WorkflowModeReminder };
