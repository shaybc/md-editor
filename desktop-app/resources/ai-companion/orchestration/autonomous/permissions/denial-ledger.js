/** Structural denial tracking and repeated-request suppression for one run. */

"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const MAX_CONSECUTIVE_DENIALS = 3;
const MAX_TOTAL_DENIALS = 20;

class DenialLedger {
  constructor(request, emit = () => {}) {
    this.request = request;
    this.emit = emit;
    this.entries = [];
    this.consecutive = 0;
    this.tripped = false;
  }

  /** Return a prior equivalent denial when the action must not be prompted again. */
  check(tool, args, descriptor) {
    const fingerprint = actionFingerprint(tool, args, descriptor, this.request.workspaceRoot);
    const entry = this.entries.slice().reverse().find((candidate) => candidate.fingerprint === fingerprint && candidate.active !== false);
    return entry ? { ...entry } : null;
  }

  /** Record a user or policy denial and trip the bounded loop guard when needed. */
  record(tool, args, descriptor, details = {}) {
    const entry = {
      fingerprint: actionFingerprint(tool, args, descriptor, this.request.workspaceRoot),
      tool: String(tool || ""),
      capability: String(descriptor?.capability || ""),
      reason: String(details.reason || "The action was denied."),
      instructions: String(details.instructions || ""),
      source: String(details.source || "user"),
      createdAt: new Date().toISOString(),
      active: true
    };
    this.entries.push(entry);
    this.entries = this.entries.slice(-MAX_TOTAL_DENIALS);
    this.consecutive += 1;
    this.emit({ type: "tool-denied", tool: entry.tool, capability: entry.capability, reason: entry.reason, instructions: entry.instructions, summary: `${entry.tool} was denied.` });
    if (!this.tripped && (this.consecutive >= MAX_CONSECUTIVE_DENIALS || this.entries.length >= MAX_TOTAL_DENIALS)) {
      this.tripped = true;
      this.emit({ type: "denial-guard-tripped", consecutive: this.consecutive, total: this.entries.length, summary: "Repeated denied actions paused automatic authorization." });
    }
    return { ...entry };
  }

  /** Clear the consecutive counter after a successful authorized mutation. */
  recordSuccess() { this.consecutive = 0; }

  /** Explicitly authorize a previously denied fingerprint for a revised user instruction. */
  authorize(fingerprint) { const entry = this.entries.find((candidate) => candidate.fingerprint === fingerprint); if (entry) entry.active = false; return Boolean(entry); }

  snapshot() { return { entries: this.entries.map((entry) => ({ ...entry })), consecutive: this.consecutive, tripped: this.tripped }; }
  restore(snapshot = {}) { this.entries = (Array.isArray(snapshot.entries) ? snapshot.entries : []).slice(-MAX_TOTAL_DENIALS); this.consecutive = Math.max(0, Number(snapshot.consecutive) || 0); this.tripped = snapshot.tripped === true; }
}

function actionFingerprint(tool, args = {}, descriptor = {}, workspaceRoot = "") {
  const resource = descriptor?.resource || {};
  const target = resource.type === "path-glob"
    ? normalizePath(resource.value)
    : normalizeTarget(tool, resource.value || args.path || args.command || args.url || tool || "");
  return crypto.createHash("sha256").update(JSON.stringify({
    workspace: normalizePath(path.resolve(String(workspaceRoot || "."))),
    tool: String(tool || ""), capability: String(descriptor?.capability || ""), resourceType: String(resource.type || ""), target
  })).digest("hex");
}

function normalizePath(value) { return String(value || "").replace(/\\/g, "/").toLowerCase(); }
function normalizeTarget(tool, value) {
  const text = String(value || "").trim().toLowerCase();
  return String(tool || "") === "run_command" ? text.replace(/\s+/g, " ") : normalizePath(text);
}

module.exports = { DenialLedger, MAX_CONSECUTIVE_DENIALS, MAX_TOTAL_DENIALS, actionFingerprint };
