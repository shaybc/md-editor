/** Parsing and validation for independently authored scoped rule files. */

"use strict";

const path = require("node:path");
const YAML = require("yaml");

const FRONTMATTER_PATTERN = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/;
const MAX_RULE_CHARACTERS = 131072;

/**
 * Parse one Markdown rule definition without interpreting its instructions.
 * @param {string} source Complete or preview rule text.
 * @param {{source?: string, allowTruncatedBody?: boolean}} options Parsing context.
 * @returns {{body: string, paths: string[], exclude: string[], imports: string[], conditional: boolean}}
 */
function parseRuleDefinition(source, options = {}) {
  const text = String(source || "");
  if (!options.allowTruncatedBody && text.length > MAX_RULE_CHARACTERS) {
    throw new Error("Rule file exceeds the 131072 character limit.");
  }
  const match = text.match(FRONTMATTER_PATTERN);
  if (!match) return { body: text.trim(), paths: [], exclude: [], imports: [], conditional: false };
  let metadata;
  try {
    metadata = YAML.parse(match[1]) || {};
  } catch (error) {
    throw new Error(`Invalid rule frontmatter in ${options.source || "rule file"}: ${error?.message || String(error)}`);
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Rule frontmatter must be an object.");
  }
  const paths = normalizePatterns(metadata.paths, "paths");
  const exclude = normalizePatterns(metadata.exclude, "exclude");
  const imports = normalizeImports(metadata.imports);
  return {
    body: text.slice(match[0].length).trim(),
    paths,
    exclude,
    imports,
    conditional: paths.length > 0
  };
}

function normalizePatterns(value, field) {
  const entries = value == null ? [] : (Array.isArray(value) ? value : [value]);
  return entries.map((entry) => {
    let pattern = String(entry || "").trim().replace(/\\/g, "/");
    if (!pattern) throw new Error(`Rule ${field} entries cannot be empty.`);
    if (pattern.startsWith("!") || path.posix.isAbsolute(pattern) || /^[a-zA-Z]:\//.test(pattern)) {
      throw new Error(`Rule ${field} entries must be relative, non-negated glob patterns.`);
    }
    pattern = pattern.replace(/^\.\//, "");
    if (pattern.split("/").includes("..")) throw new Error(`Rule ${field} entries cannot escape their matching root.`);
    return pattern;
  });
}

function normalizeImports(value) {
  const entries = value == null ? [] : (Array.isArray(value) ? value : [value]);
  return entries.map((entry) => {
    const imported = String(entry || "").trim().replace(/\\/g, "/");
    if (!imported || path.posix.isAbsolute(imported) || /^[a-zA-Z]:\//.test(imported) || imported.split("/").includes("..")) {
      throw new Error("Rule imports must be non-empty relative paths within the owning rule directory.");
    }
    return imported.replace(/^\.\//, "");
  });
}

module.exports = { MAX_RULE_CHARACTERS, parseRuleDefinition };
