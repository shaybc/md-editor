/** Bounded advisory reminders for optional model-directed work tracking. */

"use strict";

const INACTIVITY_TURNS = 10;
const VERIFICATION_COMPLETIONS = 3;
const VERIFICATION_PATTERN = /\b(?:test|testing|verify|verification|validate|validation|audit|check)\b/i;

class WorkTrackingReminder {
  constructor(emit = () => {}) {
    this.emit = emit;
    this.turnsSinceMutation = 0;
    this.turnsSinceReminder = 0;
    this.verificationNudged = false;
    this.pendingVerification = false;
  }

  recordAssistantTurn() {
    this.turnsSinceMutation += 1;
    this.turnsSinceReminder += 1;
  }

  recordWorkMutation(items = []) {
    this.turnsSinceMutation = 0;
    this.turnsSinceReminder = 0;
    const current = Array.isArray(items) ? items : [];
    const completed = current.filter((item) => item?.status === "completed");
    const hasVerification = current.some(isVerificationItem);
    if (hasVerification || completed.length < VERIFICATION_COMPLETIONS) {
      this.verificationNudged = false;
      this.pendingVerification = false;
      return;
    }
    if (!this.verificationNudged) {
      this.verificationNudged = true;
      this.pendingVerification = true;
    }
  }

  consider(items = [], options = {}) {
    const current = Array.isArray(items) ? items : [];
    if (this.pendingVerification) {
      this.pendingVerification = false;
      this.emitReminder("verification", options.round, current);
      return "Work verification reminder: three or more work items are complete, but no verification work item is recorded. Consider creating a focused verification item or launching the test-auditor worker before reporting the overall task complete.";
    }
    if (options.available === false || this.turnsSinceMutation < INACTIVITY_TURNS || this.turnsSinceReminder < INACTIVITY_TURNS) return "";
    this.turnsSinceReminder = 0;
    this.emitReminder("inactivity", options.round, current);
    const activation = options.active === false
      ? " Activate work_create or work_update with capability_search using select:<tool_name> when needed."
      : "";
    return `Work tracking reminder: the work tools have not been updated recently. If this task now benefits from progress tracking, create or update work items; mark active work in_progress, complete items only after verification, and delete obsolete items.${activation}\nCurrent work items:\n${JSON.stringify(current)}`;
  }

  emitReminder(reason, round, items) {
    this.emit({
      type: "work-tracking-reminder",
      reason,
      round: Math.max(0, Number(round) || 0),
      itemCount: items.length,
      summary: reason === "verification" ? "Completed work needs an explicit verification step." : "Work tools have not been updated recently."
    });
  }

  snapshot() {
    return {
      turnsSinceMutation: this.turnsSinceMutation,
      turnsSinceReminder: this.turnsSinceReminder,
      verificationNudged: this.verificationNudged,
      pendingVerification: this.pendingVerification
    };
  }

  restore(snapshot = {}) {
    this.turnsSinceMutation = Math.max(0, Number(snapshot.turnsSinceMutation) || 0);
    this.turnsSinceReminder = Math.max(0, Number(snapshot.turnsSinceReminder) || 0);
    this.verificationNudged = snapshot.verificationNudged === true;
    this.pendingVerification = snapshot.pendingVerification === true;
  }
}

function isVerificationItem(item) {
  return VERIFICATION_PATTERN.test(`${item?.subject || ""} ${item?.description || ""}`);
}

module.exports = { INACTIVITY_TURNS, VERIFICATION_COMPLETIONS, VERIFICATION_PATTERN, WorkTrackingReminder, isVerificationItem };
