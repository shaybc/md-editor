/**
 * Durable AI Companion checkpoint envelopes, identity, integrity, and continuation policy.
 */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const CHECKPOINT_VERSION = 1;
const CHECKPOINT_MAX_BYTES = 512 * 1024;
const CHECKPOINT_PHASES = new Set([
  "decision_ready",
  "model_pending",
  "interaction_pending",
  "action_prepared",
  "action_dispatching",
  "action_observed",
  "verification_pending",
  "finalizing",
  "terminal"
]);
const CONTROLLER_POLICY_VERSION = "agent-controller-v6:completion-v1:progress-v1:recovery-v1";

function cloneSerializable(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Canonically stringify a JSON value so fingerprints are stable across property order. */
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

/** Return a SHA-256 fingerprint for a JSON-compatible value. */
function fingerprint(value) {
  const serialized = typeof value === "string" ? value : stableStringify(value);
  return crypto.createHash("sha256").update(serialized, "utf8").digest("hex");
}

function normalizeCanonicalPath(value) {
  const resolved = path.resolve(String(value || ""));
  return process.platform === "win32" ? resolved.replace(/\\/g, "/").toLowerCase() : resolved;
}

/** Identify a workspace by its canonical root rather than its mutable contents. */
async function createWorkspaceIdentity(workspaceRoot) {
  const canonicalRoot = await fs.realpath(workspaceRoot).catch(() => path.resolve(workspaceRoot));
  return {
    canonicalRoot,
    workspaceIdentityFingerprint: fingerprint(normalizeCanonicalPath(canonicalRoot))
  };
}

function checkpointDigest(checkpoint) {
  const source = cloneSerializable(checkpoint || {});
  delete source.integrity;
  return fingerprint(source);
}

/** Build a sealed checkpoint after the caller has prepared durable artifact metadata. */
function createCheckpointEnvelope(input = {}) {
  const checkpoint = {
    checkpointVersion: CHECKPOINT_VERSION,
    checkpointKind: input.checkpointKind === "terminal" ? "terminal" : "recoverable",
    checkpointId: String(input.checkpointId || crypto.randomUUID()),
    previousCheckpointId: String(input.previousCheckpointId || ""),
    capturedAt: String(input.capturedAt || new Date().toISOString()),
    identity: cloneSerializable(input.identity || {}),
    cursor: cloneSerializable(input.cursor || {}),
    phase: String(input.phase || "decision_ready"),
    continuation: cloneSerializable(input.continuation || {}),
    compatibility: cloneSerializable(input.compatibility || {}),
    workspaceObservationManifest: cloneSerializable(input.workspaceObservationManifest || []),
    artifactManifest: cloneSerializable(input.artifactManifest || { refs: [], unavailableRefs: [], fingerprint: fingerprint([]) }),
    state: cloneSerializable(input.state || {}),
    diagnostics: cloneSerializable(input.diagnostics || {})
  };
  checkpoint.integrity = { algorithm: "sha256", digest: checkpointDigest(checkpoint) };
  return checkpoint;
}

function compareExpected(errors, actual, expected, code) {
  if (expected !== undefined && String(actual ?? "") !== String(expected ?? "")) errors.push(code);
}

/** Validate checkpoint structure, integrity, identity, cursor, and state coherence. */
function validateCheckpointEnvelope(checkpoint, expected = {}) {
  const errors = [];
  if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint)) return { valid: false, errors: ["invalid-checkpoint"] };
  const serialized = JSON.stringify(checkpoint);
  if (Buffer.byteLength(serialized, "utf8") > CHECKPOINT_MAX_BYTES) errors.push("checkpoint-too-large");
  if (checkpoint.checkpointVersion !== CHECKPOINT_VERSION) errors.push("unsupported-checkpoint-version");
  if (!["recoverable", "terminal"].includes(checkpoint.checkpointKind)) errors.push("invalid-checkpoint-kind");
  if (!checkpoint.checkpointId) errors.push("missing-checkpoint-id");
  if (!checkpoint.capturedAt || Number.isNaN(Date.parse(checkpoint.capturedAt))) errors.push("invalid-captured-at");
  if (!CHECKPOINT_PHASES.has(checkpoint.phase)) errors.push("invalid-checkpoint-phase");
  if (checkpoint.checkpointKind === "terminal" && checkpoint.phase !== "terminal") errors.push("terminal-phase-mismatch");
  if (checkpoint.integrity?.algorithm !== "sha256" || checkpoint.integrity?.digest !== checkpointDigest(checkpoint)) errors.push("integrity-mismatch");

  const identity = checkpoint.identity || {};
  if (identity.mode !== "agent") errors.push("invalid-mode");
  for (const field of ["workspaceIdentityFingerprint", "chatId", "taskId", "runId"]) {
    if (!identity[field]) errors.push(`missing-${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  }
  if (!(Number(identity.executionGeneration) > 0)) errors.push("invalid-execution-generation");
  compareExpected(errors, identity.workspaceIdentityFingerprint, expected.workspaceIdentityFingerprint, "workspace-identity-mismatch");
  compareExpected(errors, identity.chatId, expected.chatId, "chat-id-mismatch");
  compareExpected(errors, identity.taskId, expected.taskId, "task-id-mismatch");
  compareExpected(errors, identity.runId, expected.runId, "run-id-mismatch");
  compareExpected(errors, identity.executionGeneration, expected.executionGeneration, "execution-generation-mismatch");

  const cursor = checkpoint.cursor || {};
  const state = checkpoint.state;
  if (!Number.isInteger(cursor.checkpointRevision) || cursor.checkpointRevision <= 0) errors.push("invalid-checkpoint-revision");
  if (!state || typeof state !== "object" || state.schemaVersion !== 6) errors.push("unsupported-agent-state");
  if (state) {
    if (Number(cursor.stateVersion) !== Number(state.stateVersion)) errors.push("state-version-mismatch");
    if (Number(cursor.lastAcceptedSequence) !== Number(state.lastAcceptedSequence)) errors.push("sequence-mismatch");
    if (identity.runId !== state.run?.runId) errors.push("state-run-mismatch");
    if (Number(identity.executionGeneration) !== Number(state.run?.executionGeneration)) errors.push("state-generation-mismatch");
    const terminal = ["completed", "failed", "cancelled"].includes(state.lifecycle?.status);
    if (checkpoint.checkpointKind === "terminal" && !terminal) errors.push("terminal-state-mismatch");
    if (checkpoint.checkpointKind === "recoverable" && state.lifecycle?.status !== "running") errors.push("recoverable-state-mismatch");
  }
  const artifactManifest = checkpoint.artifactManifest || {};
  if (!Array.isArray(artifactManifest.refs) || !Array.isArray(artifactManifest.unavailableRefs)) errors.push("invalid-artifact-manifest");
  if (artifactManifest.fingerprint !== fingerprint(artifactManifest.refs || [])) errors.push("artifact-manifest-mismatch");
  return { valid: errors.length === 0, errors };
}

function compatibilityStatus(saved, current, field, unsupported = false) {
  if (!saved?.[field] || !current?.[field]) return unsupported ? "unsupported" : "changed";
  return saved[field] === current[field] ? "current" : (unsupported ? "unsupported" : "changed");
}

/** Separate structural eligibility from the safe strategy for continuing valid state. */
function evaluateCheckpointContinuation(checkpoint, currentCompatibility = {}, requiredObservations = []) {
  const compatibility = {
    tools: compatibilityStatus(checkpoint.compatibility, currentCompatibility, "toolRegistryFingerprint"),
    securityPolicy: compatibilityStatus(checkpoint.compatibility, currentCompatibility, "securityPolicyFingerprint"),
    approvalPolicy: compatibilityStatus(checkpoint.compatibility, currentCompatibility, "approvalPolicyFingerprint"),
    controllerPolicy: checkpoint.compatibility?.controllerPolicyVersion === CONTROLLER_POLICY_VERSION
      && currentCompatibility.controllerPolicyVersion === CONTROLLER_POLICY_VERSION ? "current" : "unsupported"
  };
  const systemPromptChanged = checkpoint.compatibility?.systemPromptFingerprint !== currentCompatibility.systemPromptFingerprint;
  const changedPolicy = Object.values(compatibility).some((value) => value !== "current") || systemPromptChanged;
  const phase = checkpoint.phase;
  let continuation = "resume";
  const reasonCodes = [];
  if (checkpoint.checkpointKind === "terminal" || phase === "terminal") continuation = "repair_terminal_projection";
  else if (compatibility.controllerPolicy === "unsupported") continuation = "blocked";
  else if (["action_prepared", "action_dispatching"].includes(phase)) continuation = "reconcile";
  else if (phase === "interaction_pending") continuation = "user_confirmation";
  else if (changedPolicy || phase === "model_pending") continuation = "restart_decision";
  if (changedPolicy) reasonCodes.push("compatibility-changed");
  if (systemPromptChanged) reasonCodes.push("system-prompt-changed");
  if ((checkpoint.artifactManifest?.unavailableRefs || []).length) {
    reasonCodes.push("artifacts-unavailable");
    if (continuation === "resume") continuation = "restart_decision";
  }
  return {
    eligible: true,
    eligibilityReasonCodes: [],
    continuation,
    compatibility,
    requiredObservations: cloneSerializable(requiredObservations),
    reasonCodes
  };
}

module.exports = {
  CHECKPOINT_MAX_BYTES,
  CHECKPOINT_PHASES,
  CHECKPOINT_VERSION,
  CONTROLLER_POLICY_VERSION,
  createCheckpointEnvelope,
  createWorkspaceIdentity,
  evaluateCheckpointContinuation,
  fingerprint,
  stableStringify,
  validateCheckpointEnvelope
};
