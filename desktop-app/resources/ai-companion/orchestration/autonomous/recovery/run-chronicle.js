/** Append-only autonomous run journal with atomic recoverable snapshots. */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { getRunIdentity } = require("../work/run-identity");

const SCHEMA_VERSION = 3;

class RunChronicle {
  constructor(request, emit = () => {}) {
    this.request = request;
    this.emit = emit;
    this.sequence = 0;
    this.queue = Promise.resolve();
    this.runId = getRunIdentity(request);
    this.directory = request.profileRoot
      ? path.join(request.profileRoot, ".md-editor", "companion", "autonomous-runs", this.runId)
      : "";
  }

  /** Append one integrity-tagged lifecycle entry in sequence order. */
  append(type, payload = {}) {
    return this.serialize(async () => {
      const record = {
        schemaVersion: SCHEMA_VERSION,
        sequence: ++this.sequence,
        timestamp: new Date().toISOString(),
        type: String(type || "event"),
        payload
      };
      record.digest = digest(record);
      if (this.directory) {
        await fs.mkdir(this.directory, { recursive: true });
        await fs.appendFile(path.join(this.directory, "chronicle.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
      }
      return record;
    });
  }

  /** Save an atomic recovery snapshot and retain the prior complete snapshot. */
  saveSnapshot(state) {
    return this.serialize(async () => {
      this.sequence += 1;
      const snapshot = this.envelope(state);
      if (this.directory) {
        await fs.mkdir(this.directory, { recursive: true });
        const current = path.join(this.directory, "current.json");
        const previous = path.join(this.directory, "previous.json");
        const temporary = path.join(this.directory, `current.${process.pid}.${Date.now()}.tmp`);
        await fs.writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
        try {
          await fs.rm(previous, { force: true });
          await fs.rename(current, previous);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
        await fs.rename(temporary, current);
        await fs.appendFile(path.join(this.directory, "chronicle.jsonl"), `${JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          sequence: this.sequence,
          timestamp: snapshot.savedAt,
          type: "recovery-snapshot",
          payload: snapshot,
          digest: digest(snapshot)
        })}\n`, "utf8");
      }
      this.emit({ type: "chronicle-saved", status: snapshot.status, sequence: this.sequence, savedAt: snapshot.savedAt });
      return snapshot;
    });
  }

  /** Load the newest valid recovery state, including version-2 migration. */
  async loadRecovery(options = {}) {
    if (!this.request.resumeRun && !options.applicationRestart) return null;
    if (this.directory) {
      const current = await readJsonOptional(path.join(this.directory, "current.json"));
      if (validateSnapshot(current, this.runId)) {
        this.sequence = Math.max(this.sequence, Number(current.sequence) || 0);
        return current;
      }
      const journalSnapshot = await readLastJournalSnapshot(path.join(this.directory, "chronicle.jsonl"), this.runId);
      if (journalSnapshot) {
        this.sequence = Math.max(this.sequence, Number(journalSnapshot.sequence) || 0);
        return journalSnapshot;
      }
      const previous = await readJsonOptional(path.join(this.directory, "previous.json"));
      if (validateSnapshot(previous, this.runId)) {
        this.sequence = Math.max(this.sequence, Number(previous.sequence) || 0);
        return previous;
      }
    }
    return this.loadVersionTwo();
  }

  /** Return a versioned snapshot envelope with compatibility identity. */
  envelope(state) {
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      sequence: this.sequence,
      savedAt: new Date().toISOString(),
      identity: {
        architecture: "autonomous",
        runId: this.runId,
        action: String(this.request.action || "agent"),
        workspaceRoot: canonicalWorkspace(this.request.workspaceRoot)
      },
      provider: String(this.request.settings?.provider || ""),
      model: String(this.request.settings?.model || ""),
      modelLimits: this.request.modelLimits || null,
      ...state
    };
    snapshot.integrity = digest({ ...snapshot, integrity: undefined });
    return snapshot;
  }

  serialize(operation) {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => {});
    return result;
  }

  async loadVersionTwo() {
    if (!this.request.profileRoot) return null;
    const legacyPath = path.join(this.request.profileRoot, ".md-editor", "companion", "autonomous-checkpoints", `${this.runId}.json`);
    const value = await readJsonOptional(legacyPath);
    if (value?.schemaVersion !== 2) return null;
    return this.envelope({
      ...value,
      schemaVersion: SCHEMA_VERSION,
      migratedFrom: 2,
      recoverySummary: "Recovered from an earlier autonomous checkpoint format."
    });
  }
}

function validateSnapshot(snapshot, runId) {
  if (!snapshot || snapshot.schemaVersion !== SCHEMA_VERSION || snapshot.identity?.runId !== runId) return false;
  const expected = digest({ ...snapshot, integrity: undefined });
  return snapshot.integrity === expected;
}

async function readLastJournalSnapshot(filePath, runId) {
  try {
    const lines = (await fs.readFile(filePath, "utf8")).split(/\r?\n/).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index--) {
      try {
        const record = JSON.parse(lines[index]);
        if (record.type === "recovery-snapshot" && validateSnapshot(record.payload, runId)) return record.payload;
      } catch (_error) { /* Ignore torn or malformed journal tails. */ }
    }
    return null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readJsonOptional(filePath) {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")); }
  catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function canonicalWorkspace(value) { return path.resolve(String(value || ".")).toLowerCase(); }

module.exports = { RunChronicle, SCHEMA_VERSION, canonicalWorkspace, validateSnapshot };
