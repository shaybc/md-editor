/**
 * Workspace tools used by AI Companion modes.
 */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile, exec } = require("node:child_process");
const { promisify } = require("node:util");
const { digestCommand, normalizeCommand } = require("../security/command-impact/command-impact-inspector");

const apiClientTools = require("./api-client-agent-tools");
const conversionExportTools = require("./conversion-export-tools");
const editorActionTools = require("./editor-action-tools");
const editorReadTools = require("./editor-read-tools");
const graphTools = require("./graph-tools");
const gitPanelTools = require("./git-panel-tools");
const planRepositoryTools = require("./plan-repository-tools");
const structuredExecutionTools = require("./structured-execution-tools");
const {
  createStalePreviewError,
  hashWorkspaceContent,
  prepareWorkspaceEdit
} = require("./workspace-edit-matcher");
const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const DEFAULT_IGNORES = new Set([".git", "node_modules", "dist", "build", "target", ".gradle", ".idea", ".vscode"]);
const DISCOVERY_IGNORES = new Set([...DEFAULT_IGNORES, ".cache", ".downloads", "coverage", "out", "vendor"]);
const DEFAULT_SNAPSHOT_MAX_BYTES = 1024 * 1024;

function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("AI Companion request cancelled.");
}

function isAbortError(error) {
  return error?.name === "AbortError" || /aborted|cancelled/i.test(error?.message || "");
}

function resolveWorkspacePath(root, relativePath = "") {
  const workspaceRoot = path.resolve(String(root || ""));
  if (!workspaceRoot) throw new Error("Workspace root is required.");
  const resolvedPath = path.resolve(workspaceRoot, String(relativePath || ""));
  if (resolvedPath !== workspaceRoot && !resolvedPath.startsWith(workspaceRoot + path.sep)) {
    throw new Error("Path is outside the workspace.");
  }
  return { workspaceRoot, resolvedPath };
}

function toRelativePath(root, absolutePath) {
  return path.relative(root, absolutePath).replace(/\\/g, "/");
}

function escapeRegexCharacter(value) {
  return /[\\^$+?.()|{}[\]]/.test(value) ? `\\${value}` : value;
}

function globPatternToRegExp(pattern) {
  const source = String(pattern || "**/*").replace(/\\/g, "/").replace(/^\/+/, "");
  let expression = "^";
  for (let index = 0; index < source.length; index++) {
    if (source.slice(index, index + 3) === "**/") {
      expression += "(?:.*/)?";
      index += 2;
    } else if (source.slice(index, index + 2) === "**") {
      expression += ".*";
      index += 1;
    } else if (source[index] === "*") {
      expression += "[^/]*";
    } else if (source[index] === "?") {
      expression += "[^/]";
    } else {
      expression += escapeRegexCharacter(source[index]);
    }
  }
  return new RegExp(`${expression}$`, "i");
}
let optionalFastGlob;
let fastGlobResolved = false;

function loadOptionalFastGlob() {
  if (fastGlobResolved) return optionalFastGlob;
  fastGlobResolved = true;
  try {
    optionalFastGlob = require("fast-glob");
  } catch (error) {
    if (error?.code !== "MODULE_NOT_FOUND") throw error;
    optionalFastGlob = null;
  }
  return optionalFastGlob;
}

async function listFiles(root, options = {}) {
  const { workspaceRoot } = resolveWorkspacePath(root);
  const maxFiles = Math.max(1, Math.min(Number(options.maxFiles || 300), 2000));
  const ignoredDirectories = options.discovery === true ? DISCOVERY_IGNORES : DEFAULT_IGNORES;
  const files = [];

  async function walk(directory) {
    throwIfAborted(options.signal);
    if (files.length >= maxFiles) return;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      throwIfAborted(options.signal);
      if (files.length >= maxFiles) return;
      if (ignoredDirectories.has(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolutePath);
      else if (entry.isFile()) files.push(toRelativePath(workspaceRoot, absolutePath));
    }
  }

  await walk(workspaceRoot);
  return files;
}

async function globFiles(root, pattern, options = {}) {
  throwIfAborted(options.signal);
  const { workspaceRoot } = resolveWorkspacePath(root);
  const maxFiles = Math.max(1, Math.min(Number(options.maxFiles || 300), 2000));
  const normalizedPattern = String(pattern || "**/*").replace(/\\/g, "/").replace(/^\/+/, "");
  const fastGlob = loadOptionalFastGlob();
  if (!fastGlob) return globFilesFallback(workspaceRoot, normalizedPattern, { ...options, maxFiles });
  const files = await fastGlob(normalizedPattern, {
    cwd: workspaceRoot,
    onlyFiles: true,
    dot: true,
    caseSensitiveMatch: false,
    unique: true,
    suppressErrors: true,
    ignore: Array.from(DEFAULT_IGNORES, (directory) => `**/${directory}/**`),
    signal: options.signal
  });
  throwIfAborted(options.signal);
  return files.slice(0, maxFiles).map((file) => file.replace(/\\/g, "/"));
}

async function globFilesFallback(workspaceRoot, pattern, options = {}) {
  const maxFiles = Math.max(1, Math.min(Number(options.maxFiles || 300), 2000));
  const expression = globPatternToRegExp(pattern);
  const matches = [];

  async function walk(directory) {
    throwIfAborted(options.signal);
    if (matches.length >= maxFiles) return;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      throwIfAborted(options.signal);
      if (matches.length >= maxFiles) return;
      if (DEFAULT_IGNORES.has(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        const relativePath = toRelativePath(workspaceRoot, absolutePath);
        if (expression.test(relativePath)) matches.push(relativePath);
      }
    }
  }

  await walk(workspaceRoot);
  return matches;
}

async function readFile(root, filePath, options = {}) {
  throwIfAborted(options.signal);
  const { workspaceRoot, resolvedPath } = resolveWorkspacePath(root, filePath);
  const content = await fs.readFile(resolvedPath, "utf8");
  throwIfAborted(options.signal);
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const startLine = Math.max(1, Number(options.startLine || 1) || 1);
  const endLine = Math.min(lines.length, Number(options.endLine || lines.length) || lines.length);
  const selected = lines.slice(startLine - 1, endLine);
  return {
    path: toRelativePath(workspaceRoot, resolvedPath),
    startLine,
    endLine,
    content: selected.map((line, index) => `${startLine + index}: ${line}`).join("\n")
  };
}

async function readTextFileSnapshot(root, filePath, options = {}) {
  throwIfAborted(options.signal);
  const { workspaceRoot, resolvedPath } = resolveWorkspacePath(root, filePath);
  const relativePath = toRelativePath(workspaceRoot, resolvedPath);
  const maxBytes = Math.max(1, Number(options.maxBytes || DEFAULT_SNAPSHOT_MAX_BYTES));
  let stat;
  try {
    stat = await fs.stat(resolvedPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { path: relativePath, exists: false, content: "" };
    }
    throw error;
  }
  if (!stat.isFile()) {
    return { path: relativePath, exists: true, unavailable: true, unavailableReason: "Path is not a file." };
  }
  if (stat.size > maxBytes) {
    return { path: relativePath, exists: true, unavailable: true, unavailableReason: `File is larger than ${maxBytes} bytes.` };
  }
  const buffer = await fs.readFile(resolvedPath);
  throwIfAborted(options.signal);
  if (buffer.includes(0)) {
    return { path: relativePath, exists: true, unavailable: true, unavailableReason: "File appears to be binary." };
  }
  return { path: relativePath, exists: true, content: buffer.toString("utf8") };
}

async function grepWithRipgrep(root, pattern, options = {}) {
  throwIfAborted(options.signal);
  const { workspaceRoot } = resolveWorkspacePath(root);
  const maxMatches = Math.max(1, Math.min(Number(options.maxMatches || 80), 500));
  const args = ["--line-number", "--column", "--no-heading", "--hidden", "--glob", "!.git/**", "--glob", "!node_modules/**", String(pattern || ""), "."];
  const result = await execFileAsync("rg", args, { cwd: workspaceRoot, windowsHide: true, maxBuffer: 1024 * 1024 * 8, signal: options.signal }).catch((error) => {
    if (error.code === 1) return { stdout: "" };
    throw error;
  });
  throwIfAborted(options.signal);
  return String(result.stdout || "").split(/\r?\n/).filter(Boolean).slice(0, maxMatches).map((line) => {
    const match = line.match(/^(.+?):(\d+):(\d+):(.*)$/);
    return match ? { path: match[1].replace(/\\/g, "/"), line: Number(match[2]), column: Number(match[3]), text: match[4] } : { path: "", line: 0, column: 0, text: line };
  });
}

async function grepFallback(root, pattern, options = {}) {
  const files = await listFiles(root, { maxFiles: options.maxFiles || 1000, signal: options.signal });
  const expression = new RegExp(String(pattern || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const matches = [];
  for (const file of files) {
    throwIfAborted(options.signal);
    if (matches.length >= (options.maxMatches || 80)) break;
    try {
      const content = await fs.readFile(resolveWorkspacePath(root, file).resolvedPath, "utf8");
      throwIfAborted(options.signal);
      content.replace(/\r\n?/g, "\n").split("\n").forEach((line, index) => {
        if (matches.length < (options.maxMatches || 80) && expression.test(line)) {
          matches.push({ path: file, line: index + 1, column: Math.max(1, line.toLowerCase().indexOf(String(pattern || "").toLowerCase()) + 1), text: line });
        }
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      // Binary or unreadable files are skipped by the fallback scanner.
    }
  }
  return matches;
}

async function searchGrep(root, pattern, options = {}) {
  if (!String(pattern || "").trim()) return [];
  try {
    return await grepWithRipgrep(root, pattern, options);
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) throw error;
    return grepFallback(root, pattern, options);
  }
}

async function applyEdit(root, filePath, search, replacement, options = {}) {
  throwIfAborted(options.signal);
  if (options.allowWrites !== true) throw new Error("File writes require user approval in AI Companion settings.");
  const { resolvedPath } = resolveWorkspacePath(root, filePath);
  const current = await fs.readFile(resolvedPath, "utf8");
  throwIfAborted(options.signal);
  const preparedEdit = options.preparedEdit || prepareWorkspaceEdit({
    path: filePath,
    currentContent: current,
    search,
    replacement,
    occurrence: options.occurrence,
    expectedMatches: options.expectedMatches
  });
  if (preparedEdit.path !== String(filePath || "") || preparedEdit.sourceHash !== hashWorkspaceContent(current)) {
    throw createStalePreviewError(filePath);
  }
  await fs.writeFile(resolvedPath, preparedEdit.proposedContent, "utf8");
  return {
    path: filePath,
    changed: current !== preparedEdit.proposedContent,
    matchMode: preparedEdit.matchMode,
    matchCount: preparedEdit.matchCount,
    occurrence: preparedEdit.occurrence
  };
}

async function writeFile(root, filePath, content, options = {}) {
  throwIfAborted(options.signal);
  if (options.allowWrites !== true) throw new Error("File writes require user approval in AI Companion settings.");
  const { resolvedPath } = resolveWorkspacePath(root, filePath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  throwIfAborted(options.signal);
  await fs.writeFile(resolvedPath, String(content || ""), "utf8");
  return { path: filePath, changed: true };
}

async function runCommand(root, command, options = {}) {
  throwIfAborted(options.signal);
  if (options.allowCommands !== true) throw new Error("Command execution is disabled in AI Companion settings.");
  if (options.expectedCommandDigest && digestCommand(normalizeCommand(command)) !== options.expectedCommandDigest) {
    const error = new Error("The command no longer matches its authorized analysis.");
    error.code = "COMMAND_AUTHORIZATION_MISMATCH";
    throw error;
  }
  const { workspaceRoot } = resolveWorkspacePath(root);
  const result = await execAsync(String(command || ""), {
    cwd: workspaceRoot,
    env: options.environment && typeof options.environment === "object" ? { ...process.env, ...options.environment } : process.env,
    timeout: Math.max(1000, Number(options.timeoutMs || 120000)),
    maxBuffer: Math.max(1024, Number(options.outputLimitBytes || 1024 * 1024 * 4)),
    windowsHide: true,
    signal: options.signal
  });
  return { command, stdout: result.stdout || "", stderr: result.stderr || "" };
}

module.exports = {
  ...apiClientTools,
  ...conversionExportTools,
  ...editorActionTools,
  ...editorReadTools,
  ...graphTools,
  ...gitPanelTools,
  ...planRepositoryTools,
  ...structuredExecutionTools,
  applyEdit,
  globFiles,
  findDocumentation: (root, query, options = {}) => require("./workspace-documentation-tools").findDocumentation(root, query, options, { globFiles }),
  listFiles,
  readFile,
  readTextFileSnapshot,
  resolveWorkspacePath,
  runCommand,
  searchGrep,
  writeFile
};
