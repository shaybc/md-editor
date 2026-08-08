/** Lazy discovery for path-scoped instructions, skills, agents, and injected extensions. */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

async function exists(filePath) { try { await fs.access(filePath); return true; } catch (_error) { return false; } }
async function markdownFiles(directory) {
  try {
    return (await fs.readdir(directory, { withFileTypes: true })).filter((entry) => entry.isFile() && /\.md$/i.test(entry.name)).map((entry) => path.join(directory, entry.name));
  } catch (_error) { return []; }
}

/** Discover extension metadata without reading extension contents. */
async function discoverExtensions(request) {
  const root = path.resolve(String(request.workspaceRoot || ""));
  const candidates = [path.join(root, "AGENTS.md")];
  const agentFiles = await markdownFiles(path.join(root, ".agents"));
  const skillFiles = [];
  for (const directory of [path.join(root, ".agents", "skills"), path.join(root, ".codex", "skills")]) {
    try {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) if (entry.isDirectory()) skillFiles.push(path.join(directory, entry.name, "SKILL.md"));
    } catch (_error) { /* Optional extension root. */ }
  }
  const local = [];
  for (const filePath of [...candidates, ...agentFiles, ...skillFiles]) {
    if (await exists(filePath)) local.push({ id: path.relative(root, filePath).replace(/\\/g, "/"), kind: /SKILL\.md$/i.test(filePath) ? "skill" : (/\.agents[\\/]/i.test(filePath) ? "agent" : "rule"), path: filePath });
  }
  const injected = ["plugins", "hooks", "mcpServers", "deferredTools"].flatMap((kind) => (Array.isArray(request[kind]) ? request[kind] : []).map((entry, index) => ({ id: String(entry.id || entry.name || `${kind}-${index + 1}`), kind, metadata: entry })));
  return [...local, ...injected];
}

async function loadExtension(entries, id) {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown extension: ${id}`);
  if (!entry.path) return entry.metadata;
  return { id: entry.id, kind: entry.kind, content: await fs.readFile(entry.path, "utf8") };
}

module.exports = { discoverExtensions, loadExtension };
