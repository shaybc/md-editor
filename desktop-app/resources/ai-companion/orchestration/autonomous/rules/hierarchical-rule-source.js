/** Hierarchical workspace instruction discovery for paths touched during a run. */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { parseRuleDefinition } = require("./rule-definition-parser");
const { normalizeWorkspacePath } = require("./rule-path-matcher");

class HierarchicalRuleSource {
  constructor(workspaceRoot) {
    this.workspaceRoot = path.resolve(String(workspaceRoot || ""));
  }

  /** Discover existing AGENTS.md files from workspace root to a target directory. */
  async discoverForPath(candidatePath) {
    const relative = normalizeWorkspacePath(this.workspaceRoot, candidatePath);
    const targetDirectory = relative ? path.dirname(path.resolve(this.workspaceRoot, relative)) : this.workspaceRoot;
    const directories = directoriesBetween(this.workspaceRoot, targetDirectory);
    const candidates = [];
    for (let depth = 0; depth < directories.length; depth++) {
      const source = path.join(directories[depth], "AGENTS.md");
      let content;
      try { content = await fs.readFile(source, "utf8"); }
      catch (error) { if (error?.code === "ENOENT") continue; throw error; }
      const relativePath = path.relative(this.workspaceRoot, source).replace(/\\/g, "/");
      let definition;
      try { definition = parseRuleDefinition(content, { source }); }
      catch (error) {
        candidates.push({
          id: `rule:path:${relativePath.toLowerCase()}`,
          source,
          sourceRoot: this.workspaceRoot,
          workspaceRoot: this.workspaceRoot,
          relativePath,
          scope: "path",
          rank: 300 + depth,
          error: error?.message || String(error)
        });
        continue;
      }
      candidates.push({
        id: `rule:path:${relativePath.toLowerCase()}`,
        source,
        sourceRoot: this.workspaceRoot,
        workspaceRoot: this.workspaceRoot,
        relativePath,
        scope: "path",
        rank: 300 + depth,
        definition: { paths: [], exclude: [], imports: definition.imports, conditional: false },
        prefetchedContent: content
      });
    }
    return candidates;
  }
}

function directoriesBetween(root, target) {
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) return [root];
  const result = [root];
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    result.push(current);
  }
  return result;
}

module.exports = { HierarchicalRuleSource, directoriesBetween };
