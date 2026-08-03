/**
 * Profile-scoped rotating JSONL audit log for AI execution requests.
 */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const writeQueues = new Map();

class CommandAuditLogger {
  constructor(profileRoot, auditPolicy = {}) {
    this.directory = path.join(String(profileRoot || ""), "ai-security", "audit");
    this.filePath = path.join(this.directory, "commands.jsonl");
    this.policy = auditPolicy;
  }

  getLocation() {
    return this.directory;
  }

  async rotateIfNeeded(nextBytes) {
    let size = 0;
    try {
      size = (await fs.stat(this.filePath)).size;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const maxBytes = Number(this.policy.maxFileBytes || 10 * 1024 * 1024);
    if (size + nextBytes <= maxBytes) return;
    const maxFiles = Math.max(1, Number(this.policy.maxFiles || 10));
    if (maxFiles === 1) {
      await fs.rm(this.filePath, { force: true });
      return;
    }
    await fs.rm(`${this.filePath}.${maxFiles - 1}`, { force: true });
    for (let index = maxFiles - 2; index >= 1; index--) {
      await fs.rename(`${this.filePath}.${index}`, `${this.filePath}.${index + 1}`).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      });
    }
    await fs.rename(this.filePath, `${this.filePath}.1`).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }

  captureRequestedValue(value) {
    const text = String(value || "");
    if (this.policy.capture === "hash-only") return { requestedHash: crypto.createHash("sha256").update(text).digest("hex") };
    if (this.policy.capture === "redacted") return { requested: "[redacted]" };
    return { requested: text };
  }

  async record(record) {
    if (this.policy.enabled === false) return;
    const pending = writeQueues.get(this.filePath) || Promise.resolve();
    const next = pending.then(async () => {
      await fs.mkdir(this.directory, { recursive: true });
      const requested = record.requestedCommand ?? record.requestedOperation;
      const normalized = {
        timestamp: new Date().toISOString(),
        ...record,
        ...this.captureRequestedValue(typeof requested === "string" ? requested : JSON.stringify(requested || {}))
      };
      delete normalized.requestedCommand;
      delete normalized.requestedOperation;
      const line = `${JSON.stringify(normalized)}\n`;
      await this.rotateIfNeeded(Buffer.byteLength(line));
      await fs.appendFile(this.filePath, line, "utf8");
    });
    writeQueues.set(this.filePath, next.catch(() => {}));
    return next;
  }
}

module.exports = {
  CommandAuditLogger
};
