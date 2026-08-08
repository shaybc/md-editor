/** Parses independently authored Markdown capability definitions. */

"use strict";

const YAML = require("yaml");

const FRONTMATTER_PATTERN = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/;

/** Parse YAML frontmatter and Markdown instructions from one definition file. */
function parseMarkdownDefinition(source, options = {}) {
  const text = String(source || "");
  const match = text.match(FRONTMATTER_PATTERN);
  if (!match) throw new Error(`${options.source || "Markdown definition"} requires YAML frontmatter.`);
  const metadata = YAML.parse(match[1]) || {};
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("Definition frontmatter must be an object.");
  const id = normalizeId(metadata.id);
  const name = String(metadata.name || "").trim();
  const description = String(metadata.description || "").trim();
  if (!id || !name || !description) throw new Error("Definition frontmatter requires id, name, and description.");
  return { metadata: { ...metadata, id, name, description }, body: text.slice(match[0].length).trim() };
}

/** Normalize a manifest identifier into its collision-safe canonical form. */
function normalizeId(value) {
  const id = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{1,79}$/.test(id) ? id : "";
}

module.exports = { normalizeId, parseMarkdownDefinition };
