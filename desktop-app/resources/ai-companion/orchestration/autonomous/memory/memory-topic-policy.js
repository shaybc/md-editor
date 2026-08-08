/** Validation and normalization rules for user-curated memory topics. */

"use strict";

const crypto = require("node:crypto");

const MEMORY_SCOPES = Object.freeze(["personal", "team"]);
const MEMORY_TYPES = Object.freeze(["preference", "convention", "project-fact", "decision", "procedure", "reference"]);
const MAX_TOPIC_CHARACTERS = 16000;

/** Normalize one curated memory topic without performing IO. */
function normalizeMemoryTopic(value = {}, existing = null) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (source.scope != null && !MEMORY_SCOPES.includes(source.scope)) throw memoryError("MEMORY_SCOPE_INVALID", "Memory scope must be personal or team.");
  if (source.type != null && !MEMORY_TYPES.includes(source.type)) throw memoryError("MEMORY_TYPE_INVALID", `Unsupported memory topic type: ${source.type}`);
  const now = new Date().toISOString();
  const content = String(source.content ?? existing?.content ?? "").trim().slice(0, MAX_TOPIC_CHARACTERS);
  const topic = {
    id: String(existing?.id || source.id || crypto.randomUUID()),
    scope: MEMORY_SCOPES.includes(source.scope) ? source.scope : (existing?.scope || "personal"),
    type: MEMORY_TYPES.includes(source.type) ? source.type : (existing?.type || "reference"),
    title: String(source.title || existing?.title || "Memory topic").trim().slice(0, 160),
    tags: normalizeTags(source.tags ?? existing?.tags),
    summary: String(source.summary || existing?.summary || summarize(content)).trim().slice(0, 600),
    content,
    createdAt: String(existing?.createdAt || source.createdAt || now),
    updatedAt: now,
    confirmedAt: now
  };
  topic.digest = crypto.createHash("sha256").update(JSON.stringify({ ...topic, digest: undefined })).digest("hex");
  return topic;
}

/** Reject content that resembles credentials or private authentication material. */
function assertMemoryContentSafe(topic) {
  if (!topic.content) throw memoryError("MEMORY_CONTENT_REQUIRED", "Memory content is required.");
  if (!topic.title) throw memoryError("MEMORY_TITLE_REQUIRED", "Memory title is required.");
  const candidate = `${topic.title}\n${topic.summary}\n${topic.content}`;
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|password)\b\s*[:=]\s*["']?[^\s"']{8,}/i,
    /\b(?:ghp|github_pat|sk)-[A-Za-z0-9_-]{16,}\b/,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i
  ];
  if (patterns.some((pattern) => pattern.test(candidate))) {
    throw memoryError("MEMORY_SENSITIVE_CONTENT", "Credentials and authentication secrets cannot be stored in curated memory.");
  }
}

function normalizeTags(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return Array.from(new Set(values.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))).slice(0, 20);
}

function summarize(content) {
  return String(content || "").replace(/\s+/g, " ").trim().slice(0, 280);
}

function memoryError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.retryable = false;
  error.doNotRetry = true;
  return error;
}

module.exports = { MAX_TOPIC_CHARACTERS, MEMORY_SCOPES, MEMORY_TYPES, assertMemoryContentSafe, normalizeMemoryTopic };
