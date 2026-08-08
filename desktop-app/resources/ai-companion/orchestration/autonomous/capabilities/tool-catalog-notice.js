/** Bounded model-facing announcements for deferred tool availability. */

"use strict";

const crypto = require("node:crypto");
const MAX_NOTICE_CHARACTERS = 12000;

class ToolCatalogNotice {
  constructor() {
    this.lastFingerprint = "";
    this.lastRevision = 0;
  }

  /** Build a notice only when the permitted deferred inventory changes. */
  consume(records, options = {}) {
    const fingerprint = digest(records.map((record) => record.name + ":" + record.fingerprint).join("|"));
    if (!options.force && fingerprint === this.lastFingerprint) return "";
    this.lastFingerprint = fingerprint;
    this.lastRevision = Number(options.revision) || this.lastRevision;
    if (!records.length) return "No secondary tool schemas are currently available.";
    const groups = new Map();
    for (const record of records) {
      const group = record.external ? "external:" + (record.serverId || "server") : record.domain;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(record.name);
    }
    const lines = ["Secondary tool schemas are available on demand. Before calling one, activate it with capability_search. Available names:"];
    for (const [group, names] of groups) lines.push("- " + group + ": " + names.sort().join(", "));
    const full = lines.join("\n");
    if (full.length <= MAX_NOTICE_CHARACTERS) return full;
    const counts = Array.from(groups, ([group, names]) => "- " + group + ": " + names.length + " tools");
    return ["The secondary tool catalog is large. Use capability_search by exact name, domain, or task keywords.", ...counts].join("\n").slice(0, MAX_NOTICE_CHARACTERS);
  }

  snapshot() { return { lastFingerprint: this.lastFingerprint, lastRevision: this.lastRevision }; }
  restore(snapshot = {}) {
    this.lastFingerprint = String(snapshot.lastFingerprint || "");
    this.lastRevision = Math.max(0, Number(snapshot.lastRevision) || 0);
  }
}

function digest(value) { return crypto.createHash("sha256").update(String(value || "")).digest("hex"); }

module.exports = { MAX_NOTICE_CHARACTERS, ToolCatalogNotice };
