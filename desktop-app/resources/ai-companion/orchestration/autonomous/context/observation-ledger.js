/** Run-local registry and release path for completed tool observations. */

"use strict";

const { evaluateObservation, inspectObservation, recentObservationBoundary } = require("./observation-release-policy");

const MAX_RELEASE_BATCH = 20;

class ObservationLedger {
  constructor(artifactVault, emit = () => {}) {
    this.artifactVault = artifactVault;
    this.emit = emit;
    this.entries = [];
    this.byCallId = new Map();
    this.sequence = 0;
    this.releaseQueue = Promise.resolve();
  }

  /** Discover and bind tool-result messages without changing their content. */
  refresh(messages, options = {}) {
    const names = mapToolNames(messages);
    for (const entry of this.entries) {
      entry.message = null;
      entry.index = -1;
    }
    for (let index = 0; index < messages.length; index++) {
      const message = messages[index];
      if (message?.role !== "tool" || !message.tool_call_id) continue;
      this.register(message, { tool: names.get(message.tool_call_id), round: options.currentRound, index });
    }
    const recentBoundary = recentObservationBoundary(messages);
    for (const entry of this.entries) {
      const decision = evaluateObservation(entry, { recentBoundary, currentRound: options.currentRound });
      entry.releasable = decision.releasable;
      entry.releaseReason = decision.reason;
    }
    return this.summary();
  }

  /** Register one completed tool observation and assign its stable run-local ID. */
  register(message, metadata = {}) {
    const callId = String(metadata.callId || message?.tool_call_id || "");
    if (!callId) return null;
    let entry = this.byCallId.get(callId);
    const inspected = inspectObservation(message, { ...metadata, callId });
    const originalRound = entry?.round;
    if (!entry) {
      entry = { id: `observation-${++this.sequence}`, callId, createdAt: new Date().toISOString(), state: inspected.alreadyReleased ? "released" : "active" };
      this.entries.push(entry);
      this.byCallId.set(callId, entry);
    }
    Object.assign(entry, inspected, { message, index: Number.isInteger(metadata.index) ? metadata.index : entry.index });
    if (originalRound) entry.round = originalRound;
    return entry;
  }

  /** Return bounded metadata for model-directed context management. */
  list(messages, options = {}) {
    this.refresh(messages, { currentRound: options.currentRound });
    const maxResults = Math.max(1, Math.min(Number(options.maxResults || 50), 100));
    return {
      observations: this.entries.filter((entry) => entry.message).slice(-maxResults).map(publicEntry),
      summary: this.summary()
    };
  }

  /** Release selected observations through the canonical artifact-backed path. */
  release(ids, messages, options = {}) {
    const operation = this.releaseQueue.then(
      () => this.releaseSelected(ids, messages, options),
      () => this.releaseSelected(ids, messages, options)
    );
    this.releaseQueue = operation.catch(() => {});
    return operation;
  }

  async releaseSelected(ids, messages, options = {}) {
    this.refresh(messages, { currentRound: options.currentRound });
    const selected = Array.from(new Set(Array.isArray(ids) ? ids.map(String) : [])).slice(0, MAX_RELEASE_BATCH);
    const outcomes = [];
    const artifacts = [];
    for (const id of selected) {
      const entry = this.entries.find((candidate) => candidate.id === id);
      if (!entry) { outcomes.push({ id, status: "unknown" }); continue; }
      if (entry.state === "released") { outcomes.push({ id, status: "already-released", artifactId: entry.artifactId }); continue; }
      if (!entry.releasable) { outcomes.push({ id, status: "protected", reason: entry.releaseReason }); continue; }
      const artifact = await this.releaseEntry(entry, options);
      artifacts.push(artifact);
      outcomes.push({ id, status: "released", artifactId: artifact.id });
    }
    if (artifacts.length) this.emitRelease(artifacts, options);
    return { outcomes, released: artifacts.length, summary: this.summary(), artifacts };
  }

  /** Release structurally eligible large observations during automatic thinning. */
  async releaseBefore(messages, options = {}) {
    this.refresh(messages, { currentRound: options.currentRound });
    const artifacts = [];
    for (const entry of this.entries) {
      if (!entry.releasable || entry.characterCount <= Number(options.minimumCharacters || 0)) continue;
      artifacts.push(await this.releaseEntry(entry, { ...options, initiator: "automatic" }));
    }
    if (artifacts.length) this.emitRelease(artifacts, { ...options, initiator: "automatic" });
    return artifacts;
  }

  async releaseEntry(entry, options) {
    const artifact = await this.artifactVault.store(String(entry.message.content || ""), { tool: entry.tool, callId: entry.callId, observationId: entry.id });
    entry.message.content = `[Observation ${entry.id} released from active context. Artifact ${artifact.id}; use artifact_read for bounded retrieval. Preview: ${artifact.preview}]`;
    entry.state = "released";
    entry.releasable = false;
    entry.releaseReason = "already-released";
    entry.releasedAt = new Date().toISOString();
    entry.releasedBy = String(options.initiator || "model");
    entry.artifactId = artifact.id;
    return artifact;
  }

  emitRelease(artifacts, options) {
    this.emit({
      type: "observation-released",
      count: artifacts.length,
      initiator: String(options.initiator || "model"),
      reason: String(options.reason || "context-management"),
      summary: `${artifacts.length} older tool observation${artifacts.length === 1 ? "" : "s"} retained as artifacts.`,
      artifactIds: artifacts.map((artifact) => artifact.id)
    });
  }

  summary() {
    const active = this.entries.filter((entry) => entry.message && entry.state !== "released");
    const releasable = active.filter((entry) => entry.releasable);
    return {
      active: active.length,
      releasable: releasable.length,
      releasableTokens: releasable.reduce((total, entry) => total + entry.estimatedTokens, 0),
      released: this.entries.filter((entry) => entry.state === "released").length
    };
  }

  snapshot() {
    return {
      sequence: this.sequence,
      entries: this.entries.map((entry) => ({
        id: entry.id, callId: entry.callId, tool: entry.tool, round: entry.round, createdAt: entry.createdAt,
        state: entry.state, releasedAt: entry.releasedAt, releasedBy: entry.releasedBy, artifactId: entry.artifactId
      }))
    };
  }

  restore(snapshot = {}) {
    this.sequence = Math.max(0, Number(snapshot.sequence) || 0);
    this.entries = [];
    this.byCallId.clear();
    for (const value of Array.isArray(snapshot.entries) ? snapshot.entries : []) {
      if (!value?.id || !value?.callId) continue;
      const entry = { ...value, message: null, index: -1, releasable: false };
      this.entries.push(entry);
      this.byCallId.set(entry.callId, entry);
    }
  }
}

function mapToolNames(messages) {
  const names = new Map();
  for (const message of messages) for (const call of message?.tool_calls || []) names.set(call.id, call.function?.name || "tool");
  return names;
}

function publicEntry(entry) {
  return {
    id: entry.id, tool: entry.tool, callId: entry.callId, round: entry.round, createdAt: entry.createdAt,
    estimatedTokens: entry.estimatedTokens, byteCount: entry.byteCount, preview: entry.preview, digest: entry.digest,
    state: entry.state, releasable: entry.releasable, reason: entry.releaseReason, artifactId: entry.artifactId
  };
}

module.exports = { MAX_RELEASE_BATCH, ObservationLedger };
