/** Validates complete authored extension drafts before filesystem publication. */

"use strict";

const { AgentDefinitionPolicy } = require("../agents/agent-definition-policy");
const { SkillDefinitionPolicy } = require("../skills/skill-definition-policy");
const { normalizeHookDefinition } = require("../hooks/hook-definition-policy");
const { normalizeServerConfiguration } = require("../mcp/server-configuration");
const { normalizeExtensionManifest } = require("./manifest-schema");
const { normalizeId } = require("./markdown-definition");

const GROUPS = Object.freeze({ skills: "skill", agents: "agent", hooks: "hook", mcpServers: "mcp-server" });

function validateAuthoredExtension(draft) {
  const errors = [];
  const warnings = [];
  let manifest;
  try { manifest = normalizeExtensionManifest({ ...(draft?.manifest || {}), schemaVersion: 1, contributions: { skills: [], agents: [], hooks: [], mcpServers: [] } }); }
  catch (error) { errors.push(error.message); }
  const normalized = { manifest, skills: [], agents: [], hooks: [], mcpServers: [] };
  for (const [group, kind] of Object.entries(GROUPS)) {
    const ids = new Set();
    for (const [index, entry] of (Array.isArray(draft?.[group]) ? draft[group] : []).entries()) {
      try {
        const value = normalizeContribution(kind, entry);
        if (ids.has(value.id)) throw new Error(`Duplicate ${kind} id '${value.id}'.`);
        ids.add(value.id);
        normalized[group].push(value);
        if (containsSecretLikeKey(value.metadata || value.definition)) warnings.push(`${kind} '${value.id}' contains a secret-like property. Store credentials outside extension files.`);
      } catch (error) { errors.push(`${group}[${index}]: ${error.message}`); }
    }
  }
  return { valid: errors.length === 0, errors, warnings, normalized };
}

function normalizeContribution(kind, entry) {
  if (kind === "skill" || kind === "agent") {
    const metadata = { ...(entry?.metadata || {}) };
    metadata.id = normalizeId(metadata.id);
    metadata.name = String(metadata.name || "").trim();
    metadata.description = String(metadata.description || "").trim();
    const result = kind === "skill" ? SkillDefinitionPolicy.validate(metadata) : AgentDefinitionPolicy.validate(metadata);
    if (!result.valid) throw new Error(result.errors.join(" "));
    return { id: metadata.id, metadata, body: String(entry?.body || "").trim(), path: safeContributionPath(entry?.path, kind, metadata.id, ".md") };
  }
  const definition = { ...(entry?.definition || entry || {}) };
  const normalized = kind === "hook" ? normalizeHookDefinition(definition) : normalizeServerConfiguration(definition);
  const id = normalizeId(definition.id || normalized.localId || normalized.id);
  if (!id) throw new Error(`${kind} requires a valid id.`);
  return { id, definition: { ...definition, id }, path: safeContributionPath(entry?.path, kind, id, ".json") };
}

function safeContributionPath(candidate, kind, id, extension) {
  const folder = kind === "mcp-server" ? "external-servers" : `${kind}s`;
  const fallback = `${folder}/${id}${extension}`;
  const value = String(candidate || fallback).replace(/\\/g, "/");
  if (value.startsWith("/") || value.includes("../") || !value.startsWith(`${folder}/`) || !value.endsWith(extension)) throw new Error(`Invalid contribution path '${value}'.`);
  return value;
}

function containsSecretLikeKey(value) {
  if (!value || typeof value !== "object") return false;
  return Object.keys(value).some((key) => /password|secret|api.?key|token/i.test(key));
}

module.exports = { validateAuthoredExtension };
