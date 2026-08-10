/** Build one authoritative terminal summary from runtime-observed tool outcomes. */

"use strict";

class RunSummary {
  /** Create a run-scoped mutation ledger and terminal-event publisher. */
  constructor(mode, startedAt = Date.now(), snapshot = {}) {
    this.mode = String(mode || "");
    this.startedAt = Number(startedAt) || Date.now();
    this.changedFiles = cloneEntries(snapshot.changedFiles);
    this.attemptedChanges = cloneEntries(snapshot.attemptedChanges);
    this.blockedChanges = cloneEntries(snapshot.blockedChanges);
    this.published = false;
  }

  /** Record a completed mutation tool from its authoritative result. */
  recordToolCompleted(tool, args = {}, result = {}) {
    if (!["write_file", "apply_edit"].includes(tool)) return;
    const target = String(result.resolvedPath || result.path || args.path || "").trim();
    if (result.denied === true) {
      this.blockedChanges.push({ code: "mutation-denied", count: 1, items: [{ tool, path: target, reason: result.instructions || "The change was denied." }] });
      return;
    }
    const action = String(result.action || (result.changed === true ? "modified" : "unchanged"));
    if (!["created", "modified"].includes(action)) return;
    upsertFile(this.changedFiles, { path: target, action, description: action === "created" ? "Created file." : "Modified file." });
  }

  /** Record an unsuccessful mutation tool without claiming that a file changed. */
  recordToolFailed(tool, args = {}, error) {
    if (!["write_file", "apply_edit"].includes(tool)) return;
    this.attemptedChanges.push({ path: String(error?.resolvedPath || args.path || "").trim(), reason: error?.message || String(error || "The change failed.") });
  }

  /** Return restart-safe mutation evidence for the run chronicle. */
  snapshot() {
    return {
      changedFiles: cloneEntries(this.changedFiles),
      attemptedChanges: cloneEntries(this.attemptedChanges),
      blockedChanges: cloneEntries(this.blockedChanges)
    };
  }

  /** Publish exactly one agent-summary event for an agent-mode terminal outcome. */
  publish(emit, details = {}) {
    if (this.mode !== "agent" || this.published) return false;
    const terminalResponse = getTerminalResponse(details, this.changedFiles);
    this.published = true;
    emit({
      type: "agent-summary",
      status: details.status,
      isError: details.status === "failure" || details.status === "aborted",
      outcome: terminalResponse,
      finalResponse: terminalResponse,
      changedFiles: this.changedFiles.map((entry) => ({ ...entry })),
      attemptedChanges: this.attemptedChanges.map((entry) => ({ ...entry })),
      blockedChanges: this.blockedChanges.map((entry) => ({ ...entry })),
      validation: Array.isArray(details.validation) ? details.validation : [],
      elapsedMs: Math.max(0, Date.now() - this.startedAt),
      completedAt: Date.now()
    });
    return true;
  }
}


/** Format a concise user-facing terminal response while retaining raw diagnostics in runtime events. */
function getTerminalResponse(details, changedFiles) {
  const rawResponse = String(details.finalResponse || details.outcome || "");
  const errorMessage = String(details.error?.message || "");
  const undefinedIdentifier = errorMessage.match(/^([A-Za-z_$][\w$]*) is not defined$/)?.[1];
  if (details.status !== "failure" || !undefinedIdentifier) return rawResponse;
  const changeMessage = changedFiles.length
    ? "Any completed file changes are listed below."
    : "No file was created or changed.";
  return `The task couldn’t continue because of an internal Agent error (\`${undefinedIdentifier}\`). ${changeMessage}`;
}
function upsertFile(files, entry) {
  const existing = files.find((candidate) => candidate.path === entry.path);
  if (existing) Object.assign(existing, entry);
  else files.push(entry);
}

function cloneEntries(entries) { return Array.isArray(entries) ? entries.map((entry) => ({ ...entry })) : []; }
module.exports = { RunSummary };
