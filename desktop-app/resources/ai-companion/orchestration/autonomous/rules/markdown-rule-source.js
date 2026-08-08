/** Recursive metadata discovery for profile and workspace Markdown rules. */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { parseRuleDefinition } = require("./rule-definition-parser");

const DISCOVERY_PREVIEW_BYTES = 65536;

class MarkdownRuleSource {
  constructor(options) {
    this.scope = String(options.scope);
    this.root = path.resolve(String(options.root || ""));
    this.workspaceRoot = path.resolve(String(options.workspaceRoot || ""));
    this.rank = Number(options.rank || 0);
  }

  /** Discover bounded metadata without retaining conditional rule bodies. */
  async discover() {
    if (!this.root) return [];
    const files = [];
    await walk(this.root, this.root, files);
    const candidates = [];
    for (const filePath of files.sort()) {
      const relativePath = path.relative(this.root, filePath).replace(/\\/g, "/");
      const candidate = {
        id: `rule:${this.scope}:${relativePath.toLowerCase()}`,
        source: filePath,
        sourceRoot: this.root,
        workspaceRoot: this.workspaceRoot,
        relativePath,
        scope: this.scope,
        rank: this.rank
      };
      try {
        const preview = await readPreview(filePath);
        const definition = parseRuleDefinition(preview, { source: filePath, allowTruncatedBody: true });
        candidate.definition = { paths: definition.paths, exclude: definition.exclude, imports: definition.imports, conditional: definition.conditional };
      } catch (error) {
        candidate.error = error?.message || String(error);
      }
      candidates.push(candidate);
    }
    return candidates;
  }
}

async function walk(root, directory, files) {
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error?.code === "ENOENT") return; throw error; }
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await walk(root, candidate, files);
    else if (entry.isFile() && /\.md$/i.test(entry.name) && isContained(root, candidate)) files.push(candidate);
  }
}

async function readPreview(filePath) {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(DISCOVERY_PREVIEW_BYTES);
    const result = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, result.bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function isContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

module.exports = { DISCOVERY_PREVIEW_BYTES, MarkdownRuleSource };
