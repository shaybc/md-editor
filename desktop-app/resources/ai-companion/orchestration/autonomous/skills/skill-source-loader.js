/** Filesystem discovery for profile, workspace, and nested workflow skills. */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { parseMarkdownDefinition } = require("../extensions/markdown-definition");

const SKILL_DIRECTORIES = Object.freeze([
  [".agents", "skills"], [".codex", "skills"], [".md-editor", "skills"]
]);

class SkillSourceLoader {
  constructor(request) {
    this.request = request;
    this.workspaceRoot = path.resolve(String(request.workspaceRoot || "."));
    this.checkedNestedRoots = new Set();
  }

  resetNestedDiscovery() { this.checkedNestedRoots.clear(); }

  resetNestedDiscovery() { this.checkedNestedRoots.clear(); }

  /** Discover profile and workspace definitions without retaining their bodies. */
  async discoverInitial() {
    const roots = [];
    if (this.request.profileRoot) roots.push({ scope: "user", rank: 200, root: path.join(this.request.profileRoot, "companion", "skills") });
    for (const segments of SKILL_DIRECTORIES) roots.push({ scope: "workspace", rank: 300, root: path.join(this.workspaceRoot, ...segments) });
    return (await Promise.all(roots.map((entry) => discoverRoot(entry)))).flat();
  }

  /** Discover nested workspace skill roots associated with accessed files. */
  async discoverForPaths(paths) {
    const roots = [];
    for (const candidate of Array.isArray(paths) ? paths : [paths]) {
      const absolute = path.resolve(this.workspaceRoot, String(candidate || ""));
      const relative = path.relative(this.workspaceRoot, absolute);
      if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) continue;
      let directory = path.dirname(absolute);
      while (directory !== this.workspaceRoot && directory.startsWith(this.workspaceRoot + path.sep)) {
        for (const segments of SKILL_DIRECTORIES) {
          const root = path.join(directory, ...segments);
          if (this.checkedNestedRoots.has(root)) continue;
          this.checkedNestedRoots.add(root);
          roots.push({ scope: "nested", rank: 400 + directory.split(path.sep).length, root });
        }
        directory = path.dirname(directory);
      }
    }
    return (await Promise.all(roots.map((entry) => discoverRoot(entry)))).flat();
  }
}

async function discoverRoot(rootInfo) {
  const files = [];
  await walk(rootInfo.root, files);
  const entries = [];
  for (const filePath of files.sort()) {
    try {
      const parsed = parseMarkdownDefinition(await fs.readFile(filePath, "utf8"), { source: filePath });
      entries.push({
        id: `skill:${rootInfo.scope}:${path.relative(rootInfo.root, filePath).replace(/\\/g, "/").toLowerCase()}`,
        scope: rootInfo.scope,
        rank: rootInfo.rank,
        source: filePath,
        metadata: parsed.metadata,
        load: async () => parseMarkdownDefinition(await fs.readFile(filePath, "utf8"), { source: filePath })
      });
    } catch (error) {
      entries.push({ id: `skill:${rootInfo.scope}:${path.basename(filePath).toLowerCase()}`, scope: rootInfo.scope, rank: rootInfo.rank, source: filePath, error: error?.message || String(error) });
    }
  }
  return entries;
}

async function walk(directory, files) {
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error?.code === "ENOENT") return; throw error; }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(candidate, files);
    else if (entry.isFile() && entry.name.toLowerCase() === "skill.md") files.push(candidate);
  }
}

module.exports = { SKILL_DIRECTORIES, SkillSourceLoader, discoverRoot };
