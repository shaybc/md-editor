/**
 * File-backed policy provider. The interface is intentionally small so an MDM
 * or remote control-plane provider can replace it later.
 */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { validatePolicy } = require("./policy-schema");

function getManagedPolicyPath(platform = process.platform, environment = process.env) {
  if (platform === "win32") return path.join(environment.PROGRAMDATA || "C:\\ProgramData", "MD-Editor", "ai-security-policy.json");
  if (platform === "darwin") return "/Library/Application Support/MD-Editor/ai-security-policy.json";
  return "/etc/md-editor/ai-security-policy.json";
}

async function readPolicyFile(filePath, sourceName, options = {}) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const policy = JSON.parse(content);
    const validation = validatePolicy(policy);
    if (!validation.valid) {
      return { found: true, valid: false, source: sourceName, path: filePath, error: validation.errors.join(" ") };
    }
    return { found: true, valid: true, source: sourceName, path: filePath, policy };
  } catch (error) {
    if (error?.code === "ENOENT" && options.optional !== false) {
      return { found: false, valid: true, source: sourceName, path: filePath, policy: null };
    }
    return { found: true, valid: false, source: sourceName, path: filePath, error: error?.message || String(error) };
  }
}

class FileAiSecurityPolicyProvider {
  constructor(options = {}) {
    this.filePath = options.filePath || getManagedPolicyPath(options.platform, options.environment);
    this.listeners = new Set();
    this.lastSource = null;
  }

  async load() {
    this.lastSource = await readPolicyFile(this.filePath, "machine-managed");
    return this.lastSource;
  }

  async refresh() {
    const previous = JSON.stringify(this.lastSource);
    const current = await this.load();
    if (JSON.stringify(current) !== previous) {
      for (const listener of this.listeners) listener(current);
    }
    return current;
  }

  describeSource() {
    return { type: "file", path: this.filePath, name: "machine-managed" };
  }

  onDidChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

module.exports = {
  FileAiSecurityPolicyProvider,
  getManagedPolicyPath,
  readPolicyFile
};
