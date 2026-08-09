/** Runtime-owned allowlist for extension-addressable MD-Editor actions. */

"use strict";

class ApplicationActionRegistry {
  constructor(entries = []) {
    this.entries = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) this.register(entry);
  }

  /** Register one host-supplied action handler; extension files cannot call this method. */
  register(entry) {
    const id = String(entry?.id || "").trim();
    if (!id || typeof entry?.execute !== "function") throw new Error("Application action registrations require id and execute.");
    if (this.entries.has(id)) throw new Error(`Application action '${id}' is already registered.`);
    this.entries.set(id, Object.freeze({ id, execute: entry.execute, mutating: entry.mutating === true, allowedModes: normalizeModes(entry.allowedModes), requiredCapability: String(entry.requiredCapability || "") }));
    return this;
  }

  /** Return safe metadata without exposing the callback. */
  describe(id) {
    const entry = this.entries.get(String(id || ""));
    return entry ? { id: entry.id, mutating: entry.mutating, allowedModes: entry.allowedModes.slice(), requiredCapability: entry.requiredCapability } : null;
  }

  /** Invoke one registered host action after mode checks. */
  async invoke(id, args, context) {
    const entry = this.entries.get(String(id || ""));
    if (!entry) throw unavailable(`Application action '${id}' is not registered by MD-Editor.`);
    if (!entry.allowedModes.includes(context.policy.mode)) throw unavailable(`Application action '${id}' is unavailable in ${context.policy.mode} mode.`);
    return entry.execute(args || {}, context);
  }
}

function normalizeModes(value) { const modes = Array.isArray(value) ? value.filter((mode) => ["chat", "plan", "agent"].includes(mode)) : []; return modes.length ? modes : ["chat", "plan", "agent"]; }
function unavailable(message) { const error = new Error(message); error.code = "EXTENSION_APPLICATION_ACTION_UNAVAILABLE"; error.doNotRetry = true; return error; }

module.exports = { ApplicationActionRegistry };
