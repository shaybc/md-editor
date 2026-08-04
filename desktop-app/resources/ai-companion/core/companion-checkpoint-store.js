/**
 * Atomic profile-scoped persistence for AI Companion checkpoints and raw artifacts.
 */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  createCheckpointEnvelope,
  fingerprint,
  validateCheckpointEnvelope
} = require("./companion-checkpoint-schema");

const ARTIFACT_MAX_BYTES = 2 * 1024 * 1024;
const TASK_ARTIFACT_MAX_BYTES = 32 * 1024 * 1024;
const writeQueues = new Map();

function safeId(value, label) {
  const id = String(value || "");
  if (!id || !/^[A-Za-z0-9._-]+$/.test(id) || id === "." || id === "..") throw new Error(`Invalid ${label}.`);
  return id;
}

function dateParts(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) throw new Error("Invalid chat creation time.");
  return {
    year: String(date.getFullYear()).padStart(4, "0"),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    day: String(date.getDate()).padStart(2, "0")
  };
}

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch (_error) { return false; }
}

async function removeIfPresent(filePath) {
  await fs.rm(filePath, { force: true }).catch(() => {});
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

/** Derive a recovery directory that cannot escape the application profile. */
function resolveCheckpointLocation(options = {}) {
  const profileRoot = path.resolve(String(options.profileRoot || ""));
  if (!options.profileRoot) throw new Error("Checkpoint profile root is required.");
  const chatId = safeId(options.chatId, "chat id");
  const taskId = safeId(options.taskId, "task id");
  const date = dateParts(options.chatCreatedAt);
  const chatsRoot = path.join(profileRoot, "companion", "chats");
  const chatDirectory = path.join(chatsRoot, date.year, date.month, date.day, chatId);
  const recoveryDirectory = path.join(chatDirectory, `${taskId}.recovery`);
  const relative = path.relative(chatsRoot, recoveryDirectory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Checkpoint path escaped the companion profile.");
  return {
    recoveryDirectory,
    artifactDirectory: path.join(recoveryDirectory, "artifacts"),
    checkpointPath: path.join(recoveryDirectory, "checkpoint.json"),
    backupPath: path.join(recoveryDirectory, "checkpoint.bak.json")
  };
}

async function writeArtifactRecords(location, records = []) {
  await fs.mkdir(location.artifactDirectory, { recursive: true });
  const refs = [];
  const unavailableRefs = [];
  let totalBytes = 0;
  for (const record of records) {
    const reference = record?.reference || {};
    const serialized = String(record?.serialized || "");
    const bytes = Buffer.byteLength(serialized, "utf8");
    const valid = reference.id === `artifact:${reference.digest}` && fingerprint(serialized) === reference.digest;
    const available = valid && bytes <= ARTIFACT_MAX_BYTES && totalBytes + bytes <= TASK_ARTIFACT_MAX_BYTES;
    const manifestReference = {
      ...reference,
      available,
      authoritative: available,
      excerpt: available ? "" : serialized.slice(0, 4096)
    };
    refs.push(manifestReference);
    if (!available) {
      unavailableRefs.push(reference.id || "unknown-artifact");
      continue;
    }
    totalBytes += bytes;
    const artifactPath = path.join(location.artifactDirectory, `${safeId(reference.digest, "artifact digest")}.json`);
    if (await exists(artifactPath)) {
      if (fingerprint(await fs.readFile(artifactPath, "utf8")) !== reference.digest) throw new Error(`Stored artifact digest mismatch for ${reference.id}.`);
      continue;
    }
    const temporaryPath = `${artifactPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporaryPath, serialized, "utf8");
    if (fingerprint(await fs.readFile(temporaryPath, "utf8")) !== reference.digest) throw new Error(`Artifact write validation failed for ${reference.id}.`);
    await fs.rename(temporaryPath, artifactPath);
  }
  refs.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return { refs, unavailableRefs, fingerprint: fingerprint(refs), totalBytes };
}

async function loadArtifactRecords(location, manifest = {}) {
  const records = [];
  const unavailableRefs = new Set(manifest.unavailableRefs || []);
  for (const reference of manifest.refs || []) {
    if (reference.available !== true || unavailableRefs.has(reference.id)) continue;
    const artifactPath = path.join(location.artifactDirectory, `${safeId(reference.digest, "artifact digest")}.json`);
    try {
      const serialized = await fs.readFile(artifactPath, "utf8");
      if (fingerprint(serialized) !== reference.digest) throw new Error("digest mismatch");
      records.push({ reference, serialized });
    } catch (_error) {
      unavailableRefs.add(reference.id);
    }
  }
  return { records, unavailableRefs: [...unavailableRefs] };
}

async function loadCandidate(filePath, expected) {
  try {
    const checkpoint = await readJson(filePath);
    const validation = validateCheckpointEnvelope(checkpoint, expected);
    return validation.valid ? { checkpoint, validation } : { checkpoint: null, validation };
  } catch (error) {
    return { checkpoint: null, validation: { valid: false, errors: [error?.code === "ENOENT" ? "checkpoint-missing" : "checkpoint-unreadable"] } };
  }
}

/** Create a single-task store with serialized commits and retained previous checkpoint. */
function createCompanionCheckpointStore(options = {}) {
  const location = resolveCheckpointLocation(options);
  const queueKey = location.recoveryDirectory;

  async function load(expected = {}) {
    const current = await loadCandidate(location.checkpointPath, expected);
    const selected = current.checkpoint ? { ...current, source: "current" } : { ...(await loadCandidate(location.backupPath, expected)), source: "backup" };
    if (!selected.checkpoint) return { checkpoint: null, source: selected.source, validation: selected.validation, artifactRecords: [], unavailableRefs: [] };
    const artifacts = await loadArtifactRecords(location, selected.checkpoint.artifactManifest);
    return { ...selected, artifactRecords: artifacts.records, unavailableRefs: artifacts.unavailableRefs };
  }

  async function commit(input = {}) {
    const prior = writeQueues.get(queueKey) || Promise.resolve();
    const operation = prior.catch(() => {}).then(async () => {
      await fs.mkdir(location.recoveryDirectory, { recursive: true });
      const current = await loadCandidate(location.checkpointPath, {});
      const backup = current.checkpoint ? { checkpoint: null } : await loadCandidate(location.backupPath, {});
      const existing = current.checkpoint ? current : backup;
      const previous = existing.checkpoint;
      const nextRevision = Math.max(Number(previous?.cursor?.checkpointRevision) || 0, Number(input.checkpointRevision) || 0) + 1;
      if (Number(input.state?.stateVersion) < Number(previous?.state?.stateVersion || 0)) throw new Error("Checkpoint state version regression.");
      const artifactManifest = await writeArtifactRecords(location, input.artifactRecords || []);
      const checkpoint = createCheckpointEnvelope({
        ...input,
        previousCheckpointId: previous?.checkpointId || "",
        artifactManifest,
        cursor: {
          checkpointRevision: nextRevision,
          stateVersion: Number(input.state?.stateVersion) || 0,
          lastAcceptedSequence: Number(input.state?.lastAcceptedSequence) || 0
        }
      });
      const validation = validateCheckpointEnvelope(checkpoint, input.expectedIdentity || {});
      if (!validation.valid) throw new Error(`Invalid checkpoint: ${validation.errors.join(", ")}`);
      const temporaryPath = path.join(location.recoveryDirectory, `checkpoint.${process.pid}.${Date.now()}.tmp`);
      await fs.writeFile(temporaryPath, JSON.stringify(checkpoint, null, 2), "utf8");
      const temporaryValidation = validateCheckpointEnvelope(await readJson(temporaryPath), input.expectedIdentity || {});
      if (!temporaryValidation.valid) throw new Error(`Checkpoint write validation failed: ${temporaryValidation.errors.join(", ")}`);
      if (current.checkpoint) {
        await removeIfPresent(location.backupPath);
        await fs.rename(location.checkpointPath, location.backupPath);
      } else if (await exists(location.checkpointPath)) {
        await removeIfPresent(location.checkpointPath);
      }
      if (!current.checkpoint && backup.checkpoint && !(await exists(location.backupPath))) {
        throw new Error("Previous valid checkpoint backup disappeared before promotion.");
      }
      try {
        await fs.rename(temporaryPath, location.checkpointPath);
      } catch (error) {
        if (await exists(location.backupPath)) await fs.copyFile(location.backupPath, location.checkpointPath).catch(() => {});
        throw error;
      }
      const promoted = await loadCandidate(location.checkpointPath, input.expectedIdentity || {});
      if (!promoted.checkpoint) throw new Error(`Promoted checkpoint failed validation: ${promoted.validation.errors.join(", ")}`);
      return { checkpoint: promoted.checkpoint, artifactManifest, source: "current" };
    });
    writeQueues.set(queueKey, operation);
    try { return await operation; } finally { if (writeQueues.get(queueKey) === operation) writeQueues.delete(queueKey); }
  }

  return {
    commit,
    load,
    location: { ...location },
    remove: () => fs.rm(location.recoveryDirectory, { recursive: true, force: true })
  };
}

module.exports = {
  ARTIFACT_MAX_BYTES,
  TASK_ARTIFACT_MAX_BYTES,
  createCompanionCheckpointStore,
  resolveCheckpointLocation
};
