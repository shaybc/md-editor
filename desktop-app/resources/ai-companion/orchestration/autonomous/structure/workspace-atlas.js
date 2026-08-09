/** Incremental structural map of important workspace files and declarations. */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const workspaceTools = require("../../../tools/workspace-tools");
const { StructureCache } = require("./structure-cache");
const { extractSourceStructure } = require("./source-structure-providers");

const execFileAsync = promisify(execFile);
const MAX_FILES = 5000;
const MAX_SOURCE_BYTES = 1024 * 1024;

class WorkspaceAtlas {
  constructor(request, options = {}) {
    this.request = request;
    this.emit = typeof options.emit === "function" ? options.emit : () => {};
    this.artifacts = options.artifacts;
    this.cache = new StructureCache(request);
    this.loaded = false;
  }

  /** Build a token-bounded ranked structural view of the current workspace. */
  async build(input = {}) {
    const startedAt = Date.now();
    if (!this.loaded) { await this.cache.load(); this.loaded = true; }
    const root = path.resolve(String(this.request.workspaceRoot || "."));
    const files = await enumerateFiles(root, this.request.signal);
    const structures = [];
    let cacheHits = 0;
    for (const relativePath of files) {
      if (this.request.signal?.aborted) throw new Error("Workspace structure generation was cancelled.");
      const absolutePath = workspaceTools.resolveWorkspacePath(root, relativePath).resolvedPath;
      let stat;
      try { stat = await fs.stat(absolutePath); } catch (_error) { continue; }
      if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) continue;
      let content;
      try { content = await fs.readFile(absolutePath, "utf8"); } catch (_error) { continue; }
      if (content.includes("\0")) continue;
      const contentDigest = crypto.createHash("sha256").update(content).digest("hex");
      let structure = this.cache.get(relativePath, stat, contentDigest);
      if (structure) cacheHits += 1;
      else {
        structure = extractSourceStructure(relativePath, content);
        if (!structure) continue;
        this.cache.set(relativePath, stat, contentDigest, structure);
      }
      structures.push({ path: relativePath, ...structure });
    }
    this.cache.retain(files);
    await this.cache.save();
    const ranked = rankStructures(structures, input.focusPaths, input.focusSymbols);
    const budget = Math.max(256, Math.min(Number(input.maxTokens) || 1024, 16384));
    const rendered = renderStructures(ranked, budget);
    let artifact = null;
    if (rendered.text.length > 24000 && this.artifacts) artifact = await this.artifacts.store(rendered.text, { tool: "workspace_structure" });
    const result = {
      rendered: artifact ? `${rendered.text.slice(0, 12000)}\n\n${this.artifacts.reference(artifact)}` : rendered.text,
      tokenCount: rendered.tokens,
      fileCount: rendered.files,
      totalFileCount: files.length,
      parsedFileCount: structures.length,
      cacheHit: structures.length > 0 && cacheHits === structures.length,
      cachedFileCount: cacheHits,
      buildTimeMs: Date.now() - startedAt,
      artifact: artifact ? { id: artifact.id, bytes: artifact.bytes, digest: artifact.digest } : null
    };
    this.emit({ type: "workspace-structure-built", fileCount: result.fileCount, totalFileCount: result.totalFileCount, tokenCount: result.tokenCount, cacheHit: result.cacheHit, buildTimeMs: result.buildTimeMs, rendered: result.rendered.slice(0, 8000), artifactId: result.artifact?.id, summary: `Built a structural workspace view with ${result.fileCount} ranked files.` });
    return result;
  }

  async invalidate() { if (!this.loaded) { await this.cache.load(); this.loaded = true; } await this.cache.invalidate(); return { invalidated: true }; }
  stats() { return this.cache.stats(); }
}

async function enumerateFiles(root, signal) {
  try {
    const result = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 * 1024, signal });
    return Array.from(new Set(String(result.stdout || "").split(/\r?\n/).map((entry) => entry.trim().replace(/\\/g, "/")).filter(Boolean))).slice(0, MAX_FILES);
  } catch (error) {
    if (signal?.aborted) throw error;
    return workspaceTools.listFiles(root, { maxFiles: MAX_FILES, signal });
  }
}

function rankStructures(structures, focusPaths = [], focusSymbols = []) {
  const owners = new Map();
  for (const file of structures) for (const definition of file.definitions) {
    if (!owners.has(definition.name)) owners.set(definition.name, []);
    owners.get(definition.name).push(file.path);
  }
  const edges = new Map(structures.map((file) => [file.path, new Map()]));
  for (const file of structures) for (const reference of file.references) for (const target of owners.get(reference) || []) {
    if (target === file.path) continue;
    const weight = 1 / Math.max(1, (owners.get(reference) || []).length);
    edges.get(file.path).set(target, (edges.get(file.path).get(target) || 0) + weight);
  }
  let scores = new Map(structures.map((file) => [file.path, 1 / Math.max(1, structures.length)]));
  for (let iteration = 0; iteration < 20; iteration++) {
    const next = new Map(structures.map((file) => [file.path, 0.15 / Math.max(1, structures.length)]));
    for (const [source, targets] of edges) {
      const total = Array.from(targets.values()).reduce((sum, value) => sum + value, 0);
      if (!total) continue;
      for (const [target, weight] of targets) next.set(target, next.get(target) + 0.85 * scores.get(source) * weight / total);
    }
    scores = next;
  }
  const normalizedPaths = (Array.isArray(focusPaths) ? focusPaths : []).map((entry) => String(entry || "").replace(/\\/g, "/").toLowerCase()).filter(Boolean);
  const symbols = new Set((Array.isArray(focusSymbols) ? focusSymbols : []).map(String));
  return structures.map((file) => {
    let score = scores.get(file.path) || 0;
    if (normalizedPaths.some((focus) => file.path.toLowerCase().startsWith(focus) || file.path.toLowerCase().includes(focus))) score += 2;
    if (file.definitions.some((entry) => symbols.has(entry.name))) score += 3;
    return { ...file, score };
  }).sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
}

function renderStructures(ranked, maximumTokens) {
  const lines = ["Workspace structure (ranked declarations; read files for implementation details):"];
  let tokens = estimateTokens(lines[0]);
  let files = 0;
  for (const file of ranked) {
    const definitions = file.definitions.slice(0, 30).map((entry) => `  L${entry.line}: ${entry.signature || entry.name}`);
    if (!definitions.length) continue;
    const block = [`\n${file.path}`, ...definitions];
    const blockTokens = estimateTokens(block.join("\n"));
    if (tokens + blockTokens > maximumTokens) break;
    lines.push(...block); tokens += blockTokens; files += 1;
  }
  return { text: lines.join("\n"), tokens, files };
}

function estimateTokens(value) { return Math.max(1, Math.ceil(String(value || "").length / 4)); }

module.exports = { WorkspaceAtlas, enumerateFiles, rankStructures };
