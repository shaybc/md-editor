/** Discovers executable workspace agent definitions without retaining instruction bodies. */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { parseMarkdownDefinition } = require("../extensions/markdown-definition");

const FRONTMATTER_LIMIT_BYTES = 65536;

class WorkspaceAgentSource {
  constructor(request) { this.request = request; }

  /** Return validated metadata candidates and isolated file errors from `.agents`. */
  async discover() {
    const workspaceRoot = path.resolve(String(this.request.workspaceRoot || ""));
    const directory = path.join(workspaceRoot, ".agents");
    const entries = [];
    const errors = [];
    for (const filePath of await markdownFiles(directory)) {
      try {
        const parsed = parseMarkdownDefinition(await readFrontmatter(filePath), { source: filePath });
        const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
        entries.push({
          logicalId: parsed.metadata.id,
          name: parsed.metadata.name,
          description: parsed.metadata.description,
          metadata: parsed.metadata,
          metadataFingerprint: fingerprint(parsed.metadata),
          source: "workspace-agent",
          sourcePriority: 300,
          sourceIdentity: relativePath,
          aliases: [relativePath],
          activate: () => activateWorkspaceAgent(filePath, relativePath)
        });
      } catch (error) {
        errors.push({ source: "workspace-agent", path: filePath, error: error?.message || String(error) });
      }
    }
    return { entries, errors };
  }
}

async function markdownFiles(directory) {
  try {
    return (await fs.readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
      .map((entry) => path.join(directory, entry.name));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function readFrontmatter(filePath) {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(FRONTMATTER_LIMIT_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

async function activateWorkspaceAgent(filePath, sourceIdentity) {
  const parsed = parseMarkdownDefinition(await fs.readFile(filePath, "utf8"), { source: filePath });
  return { metadata: parsed.metadata, body: parsed.body, sourceIdentity };
}

function fingerprint(value) { return crypto.createHash("sha256").update(JSON.stringify(value || null)).digest("hex"); }

module.exports = { WorkspaceAgentSource };
