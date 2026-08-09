/** Discovers declarative extension bundles and indexes contribution metadata. */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { getExtensionRoots } = require("./extension-roots");
const { normalizeExtensionManifest } = require("./manifest-schema");
const { parseMarkdownDefinition } = require("./markdown-definition");
const { resolveBundleFile } = require("./safe-path");

async function childDirectories(root) {
  try { return (await fs.readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => path.join(root, entry.name)); }
  catch (error) { if (error?.code === "ENOENT") return []; throw error; }
}

async function indexMarkdown(bundleRoot, paths, kind) {
  const entries = [];
  for (const relativePath of paths) {
    const filePath = await resolveBundleFile(bundleRoot, relativePath);
    const parsed = parseMarkdownDefinition(await fs.readFile(filePath, "utf8"), { source: filePath });
    entries.push({ kind, id: parsed.metadata.id, name: parsed.metadata.name, description: parsed.metadata.description, metadata: parsed.metadata, filePath, bundleRoot });
  }
  return entries;
}

async function indexJson(bundleRoot, paths, kind) {
  const entries = [];
  for (const relativePath of paths) {
    const filePath = await resolveBundleFile(bundleRoot, relativePath);
    const value = JSON.parse(await fs.readFile(filePath, "utf8"));
    for (const [index, item] of (Array.isArray(value) ? value : [value]).entries()) entries.push({ kind, id: String(item.id || `${path.basename(relativePath)}-${index + 1}`), metadata: item, filePath, bundleRoot });
  }
  return entries;
}

async function readBundle(directory, rootInfo) {
  const manifestPath = await resolveBundleFile(directory, "extension.json");
  const manifestText = await fs.readFile(manifestPath, "utf8");
  const manifest = normalizeExtensionManifest(JSON.parse(manifestText), manifestPath);
  const contributions = [
    ...await indexMarkdown(directory, manifest.contributions.skills, "skill"),
    ...await indexMarkdown(directory, manifest.contributions.agents, "agent"),
    ...await indexJson(directory, manifest.contributions.hooks, "hook"),
    ...await indexJson(directory, manifest.contributions.mcpServers, "mcp-server")
  ];
  const fingerprint = crypto.createHash("sha256").update(manifestText);
  for (const filePath of Array.from(new Set(contributions.map((entry) => entry.filePath))).sort()) {
    fingerprint.update(path.relative(directory, filePath).replace(/\\/g, "/"));
    fingerprint.update(await fs.readFile(filePath));
  }
  return { ...manifest, ...rootInfo, root: directory, manifestPath, digest: fingerprint.digest("hex"), contributions };
}

/** Discover all bundles, isolating invalid bundles and duplicate identifiers. */
async function discoverBundles(request) {
  const bundles = [];
  const errors = [];
  for (const rootInfo of getExtensionRoots(request)) {
    for (const directory of await childDirectories(rootInfo.root)) {
      try { bundles.push(await readBundle(directory, rootInfo)); }
      catch (error) { errors.push({ scope: rootInfo.scope, root: directory, error: error?.message || String(error) }); }
    }
  }
  const duplicateIds = new Set(bundles.filter((bundle, index) => bundles.findIndex((candidate) => candidate.id === bundle.id) !== index).map((bundle) => bundle.id));
  for (const id of duplicateIds) errors.push({ id, error: `Duplicate extension id: ${id}` });
  return { bundles: bundles.filter((bundle) => !duplicateIds.has(bundle.id)), errors };
}

module.exports = { discoverBundles, readBundle };
