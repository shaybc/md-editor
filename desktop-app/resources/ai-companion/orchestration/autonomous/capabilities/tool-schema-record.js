/** Immutable metadata record for one model-callable tool schema. */

"use strict";

const crypto = require("node:crypto");

/** Normalize one registration while keeping runtime metadata outside provider JSON. */
function createToolSchemaRecord(value = {}) {
  const definition = normalizeDefinition(value.definition || value);
  const name = definition.function.name;
  const source = String(value.source || "core");
  const description = String(value.description || definition.function.description || "").trim();
  const searchHint = String(value.searchHint || "").trim();
  const displayName = String(value.displayName || name.replace(/_/g, " ")).trim();
  const rulePaths = normalizeRulePaths(value.rulePaths);
  return Object.freeze({
    name, definition, source,
    domain: String(value.domain || source),
    displayName,
    summary: String(value.summary || description).trim(),
    description, searchHint,
    requiredMode: String(value.requiredMode || ""),
    requiredCapability: String(value.requiredCapability || ""),
    permissionScope: String(value.permissionScope || ""),
    executionOwner: String(value.executionOwner || source),
    allowedModes: Object.freeze((Array.isArray(value.allowedModes) ? value.allowedModes : []).map(String)),
    adapter: value.adapter && typeof value.adapter === "object" ? Object.freeze({ ...value.adapter }) : null,
    extensionId: String(value.extensionId || ""),
    extensionDigest: String(value.extensionDigest || ""),
    timeoutMs: Number(value.timeoutMs) || 30000,
    maxOutputBytes: Number(value.maxOutputBytes) || 262144,
    execute: typeof value.execute === "function" ? value.execute : null,
    alwaysLoad: value.alwaysLoad === true,
    external: value.external === true,
    serverId: String(value.serverId || ""),
    remoteName: String(value.remoteName || ""),
    rulePaths,
    fingerprint: fingerprint({ name, definition, source, description, searchHint, requiredMode: value.requiredMode, requiredCapability: value.requiredCapability, permissionScope: value.permissionScope, executionOwner: value.executionOwner, allowedModes: value.allowedModes, adapter: value.adapter, extensionId: value.extensionId, extensionDigest: value.extensionDigest, rulePaths })
  });
}

function normalizeRulePaths(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.freeze({
    arguments: Object.freeze((Array.isArray(source.arguments) ? source.arguments : []).map(String)),
    results: Object.freeze((Array.isArray(source.results) ? source.results : []).map(String))
  });
}

function normalizeDefinition(value) {
  const name = String(value?.function?.name || "").trim();
  if (!name) throw new Error("Tool schema registration requires a function name.");
  return {
    type: "function",
    function: {
      name,
      description: String(value.function.description || ""),
      parameters: value.function.parameters && typeof value.function.parameters === "object"
        ? value.function.parameters
        : { type: "object", properties: {}, additionalProperties: false }
    }
  };
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

module.exports = { createToolSchemaRecord };
