/** Validates declarative extension manifests without executing bundle code. */

"use strict";

const { normalizeId } = require("./markdown-definition");

const MANIFEST_SCHEMA_VERSION = 1;
const CONTRIBUTION_KEYS = Object.freeze(["skills", "agents", "hooks", "mcpServers"]);

/** Validate and normalize a declarative extension manifest. */
function normalizeExtensionManifest(value, source = "extension.json") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${source} must contain an object.`);
  if (Number(value.schemaVersion) !== MANIFEST_SCHEMA_VERSION) throw new Error(`${source} has an unsupported schemaVersion.`);
  const id = normalizeId(value.id);
  const name = String(value.name || "").trim();
  const version = String(value.version || "").trim();
  const description = String(value.description || "").trim();
  if (!id || !name || !version || !description) throw new Error(`${source} requires id, name, version, and description.`);
  const contributions = {};
  for (const key of CONTRIBUTION_KEYS) contributions[key] = normalizeStringArray(value.contributions?.[key]);
  return { schemaVersion: MANIFEST_SCHEMA_VERSION, id, name, version, description, contributions };
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
}

module.exports = { CONTRIBUTION_KEYS, MANIFEST_SCHEMA_VERSION, normalizeExtensionManifest };
