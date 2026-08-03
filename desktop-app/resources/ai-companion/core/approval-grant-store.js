/**
 * Persists user-owned workspace approval grants outside repositories.
 */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const GRANT_SCHEMA_VERSION = 2;
const writeQueues = new Map();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function canonicalWorkspaceRoot(workspaceRoot) {
  const resolved = path.resolve(String(workspaceRoot || ""));
  try {
    return await fs.realpath(resolved);
  } catch (_error) {
    return resolved;
  }
}

function getProfileRoot(profileRoot) {
  return path.resolve(String(profileRoot || path.join(os.homedir(), ".md-editor")));
}

async function getWorkspaceGrantPath(profileRoot, workspaceRoot) {
  const canonicalRoot = await canonicalWorkspaceRoot(workspaceRoot);
  const workspaceIdentity = process.platform === "win32" ? canonicalRoot.toLowerCase() : canonicalRoot;
  const workspaceId = crypto.createHash("sha256").update(workspaceIdentity).digest("hex");
  return {
    canonicalRoot,
    workspaceId,
    filePath: path.join(getProfileRoot(profileRoot), "ai-security", "approval-grants", "workspaces", `${workspaceId}.json`)
  };
}

function normalizeRule(rule = {}) {
  const matcher = rule.matcher && typeof rule.matcher === "object" ? rule.matcher : {};
  return {
    id: String(rule.id || crypto.randomUUID()),
    capability: String(rule.capability || "").trim(),
    matcher: { type: matcher.type === "path-glob" ? "path-glob" : "exact", value: String(matcher.value || "").trim() },
    lifetime: rule.lifetime === "task" ? "task" : "workspace",
    enabled: rule.enabled !== false,
    createdAt: String(rule.createdAt || new Date().toISOString()),
    lastUsedAt: String(rule.lastUsedAt || "")
  };
}

function normalizeDocument(value = {}, canonicalRoot = "") {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    version: GRANT_SCHEMA_VERSION,
    workspaceRoot: canonicalRoot || String(source.workspaceRoot || ""),
    rules: (Array.isArray(source.rules) ? source.rules : []).map(normalizeRule).filter((rule) => rule.capability && rule.matcher.value)
  };
}

function validateDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Approval grants must be a JSON object.");
  if (Number(value.version) !== GRANT_SCHEMA_VERSION) throw new Error(`Approval grants must use version ${GRANT_SCHEMA_VERSION}.`);
  if (!Array.isArray(value.rules)) throw new Error("Approval grants must contain a rules array.");
  const ids = new Set();
  for (const [index, rule] of value.rules.entries()) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) throw new Error(`Approval rule ${index + 1} must be an object.`);
    if (!String(rule.capability || "").trim()) throw new Error(`Approval rule ${index + 1} requires a capability.`);
    if (!rule.matcher || !["exact", "path-glob"].includes(rule.matcher.type) || !String(rule.matcher.value || "").trim()) throw new Error(`Approval rule ${index + 1} requires an exact or path-glob matcher.`);
    if (rule.lifetime !== "workspace") throw new Error(`Approval rule ${index + 1} must use workspace lifetime in profile storage.`);
    if (rule.id && ids.has(String(rule.id))) throw new Error(`Approval rule ${index + 1} duplicates an existing id.`);
    if (rule.id) ids.add(String(rule.id));
  }
}

async function readDocument(location) {
  try {
    return normalizeDocument(JSON.parse(await fs.readFile(location.filePath, "utf8") || "{}"), location.canonicalRoot);
  } catch (error) {
    if (error?.code === "ENOENT") return normalizeDocument({}, location.canonicalRoot);
    throw error;
  }
}

function queueWrite(filePath, operation) {
  const previous = writeQueues.get(filePath) || Promise.resolve();
  const next = previous.then(operation, operation).finally(() => {
    if (writeQueues.get(filePath) === next) writeQueues.delete(filePath);
  });
  writeQueues.set(filePath, next);
  return next;
}

async function writeDocument(location, document) {
  await fs.mkdir(path.dirname(location.filePath), { recursive: true });
  const temporaryPath = `${location.filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, location.filePath);
}

class ApprovalGrantStore {
  constructor(profileRoot, workspaceRoot) {
    this.profileRoot = profileRoot;
    this.workspaceRoot = workspaceRoot;
  }

  /** List workspace grants and their profile-owned storage location. */
  async list() {
    const location = await getWorkspaceGrantPath(this.profileRoot, this.workspaceRoot);
    const document = await readDocument(location);
    return { ...clone(document), path: location.filePath, workspaceId: location.workspaceId };
  }

  /** Persist a validated workspace grant using an atomic queued update. */
  async add(rule) {
    const location = await getWorkspaceGrantPath(this.profileRoot, this.workspaceRoot);
    return queueWrite(location.filePath, async () => {
      const document = await readDocument(location);
      const normalized = normalizeRule({ ...rule, lifetime: "workspace" });
      const duplicate = document.rules.find((item) => item.capability === normalized.capability && item.matcher.type === normalized.matcher.type && item.matcher.value === normalized.matcher.value);
      if (duplicate) {
        duplicate.enabled = true;
        duplicate.lastUsedAt = new Date().toISOString();
        await writeDocument(location, document);
        return duplicate;
      }
      document.rules.push(normalized);
      await writeDocument(location, document);
      return normalized;
    });
  }

  /** Revoke one persisted workspace grant by identifier. */
  async revoke(ruleId) {
    const location = await getWorkspaceGrantPath(this.profileRoot, this.workspaceRoot);
    return queueWrite(location.filePath, async () => {
      const document = await readDocument(location);
      const originalLength = document.rules.length;
      document.rules = document.rules.filter((rule) => rule.id !== String(ruleId || ""));
      if (document.rules.length !== originalLength) await writeDocument(location, document);
      return { revoked: document.rules.length !== originalLength, rules: clone(document.rules) };
    });
  }

  /** Record use of a persisted rule without changing its permission scope. */
  async touch(ruleId) {
    const location = await getWorkspaceGrantPath(this.profileRoot, this.workspaceRoot);
    return queueWrite(location.filePath, async () => {
      const document = await readDocument(location);
      const rule = document.rules.find((item) => item.id === String(ruleId || ""));
      if (!rule) return null;
      rule.lastUsedAt = new Date().toISOString();
      await writeDocument(location, document);
      return clone(rule);
    });
  }

  /** Replace the persisted document after guided or advanced settings validation. */
  async replace(value) {
    validateDocument(value);
    const location = await getWorkspaceGrantPath(this.profileRoot, this.workspaceRoot);
    return queueWrite(location.filePath, async () => {
      const document = normalizeDocument(value, location.canonicalRoot);
      await writeDocument(location, document);
      return { ...clone(document), path: location.filePath, workspaceId: location.workspaceId };
    });
  }

  /** Import explicitly reviewed legacy write patterns into this workspace. */
  async importLegacy(policy = {}) {
    const patterns = Array.isArray(policy?.allow?.write) ? policy.allow.write : [];
    const imported = [];
    for (const pattern of patterns) imported.push(await this.add({ capability: "workspace.file.write", matcher: { type: "path-glob", value: pattern } }));
    return { imported: imported.length, rules: imported };
  }
}

module.exports = {
  ApprovalGrantStore,
  GRANT_SCHEMA_VERSION,
  canonicalWorkspaceRoot,
  getWorkspaceGrantPath,
  normalizeDocument,
  normalizeRule,
  validateDocument
};
