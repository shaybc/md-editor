/**
 * Agent-facing Git Panel tools backed by the desktop Git bridge.
 */

"use strict";

const path = require("node:path");

const DEFAULT_GIT_STATUS_MAX_FILES = 200;
const MAX_GIT_STATUS_MAX_FILES = 1000;
const GIT_STATUS_RESULT_MAX_BYTES = 10 * 1024;
const GIT_STATUS_ERROR_CODES = new Set([
  "GIT_STATUS_NOT_REPOSITORY",
  "GIT_STATUS_EXECUTION_FAILED",
  "GIT_STATUS_PARSE_FAILED",
  "GIT_STATUS_RESULT_LIMIT"
]);

const GIT_PANEL_READ_TOOL_NAMES = Object.freeze([
  "git_status",
  "git_branches",
  "git_diff",
  "git_changes_digest",
  "git_pr_notes"
]);

const GIT_PANEL_MUTATING_TOOL_NAMES = Object.freeze([
  "git_stage",
  "git_unstage",
  "git_commit",
  "git_fetch",
  "git_pull",
  "git_push",
  "git_branch_create",
  "git_branch_switch"
]);

const GIT_PANEL_TOOL_NAMES = Object.freeze([...GIT_PANEL_READ_TOOL_NAMES, ...GIT_PANEL_MUTATING_TOOL_NAMES]);

function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("AI Companion request cancelled.");
}

function loadGitBridge() {
  const candidates = [
    path.resolve(__dirname, "../../bridges/git-bridge/git-bridge.cjs")
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  throw new Error("Unable to load the md-editor Git bridge.");
}

function resolveRepositoryPath(root) {
  const repositoryPath = path.resolve(String(root || ""));
  if (!repositoryPath) throw new Error("Workspace root is required for Git Panel tools.");
  return repositoryPath;
}

function normalizeGitPath(value) {
  const text = String(value || "").replace(/\\/g, "/").trim();
  if (!text) return "";
  if (/^[a-zA-Z]:\//.test(text) || text.startsWith("/") || text.includes("../")) {
    throw new Error("Git file paths must be repository-relative.");
  }
  return text.replace(/^\.?\//, "");
}

function normalizeFiles(values) {
  const source = Array.isArray(values) ? values : [];
  return source.map(normalizeGitPath).filter(Boolean);
}

function normalizeGitStatusMaxFiles(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count <= 0) return DEFAULT_GIT_STATUS_MAX_FILES;
  return Math.min(count, MAX_GIT_STATUS_MAX_FILES);
}

function createGitStatusFailure(error, fallbackCode = "GIT_STATUS_EXECUTION_FAILED") {
  const code = GIT_STATUS_ERROR_CODES.has(error?.code) ? error.code : fallbackCode;
  const stage = String(error?.stage || (code === "GIT_STATUS_PARSE_FAILED" ? "parse" : (code === "GIT_STATUS_RESULT_LIMIT" ? "limit" : "execute")));
  const message = code === "GIT_STATUS_NOT_REPOSITORY"
    ? "The opened folder is not a Git repository."
    : (code === "GIT_STATUS_PARSE_FAILED"
      ? "Git status output could not be parsed."
      : (code === "GIT_STATUS_RESULT_LIMIT" ? "Git status exceeded the result limit." : "Git status could not be read."));
  return {
    status: "failed",
    error: { code, stage, retryable: false, message }
  };
}

function createStatusWindow(status, files) {
  return {
    branch: String(status?.branch || ""),
    tracking: String(status?.tracking || ""),
    ahead: Number(status?.ahead || 0),
    behind: Number(status?.behind || 0),
    staged: files.filter((file) => file.index && file.index !== " " && file.index !== "?"),
    unstaged: files.filter((file) => file.workingDir && file.workingDir !== " "),
    files
  };
}

function compareStatusFiles(left, right) {
  const leftPath = String(left?.path || "").replace(/\\/g, "/");
  const rightPath = String(right?.path || "").replace(/\\/g, "/");
  if (leftPath < rightPath) return -1;
  if (leftPath > rightPath) return 1;
  return 0;
}

/**
 * Bound model-facing status details while preserving complete aggregate counts.
 * @param {object} result - Complete desktop Git bridge status result.
 * @param {number} maxFiles - Requested maximum file-detail count.
 * @param {number} maxBytes - Final pretty-serialized result budget in bytes.
 * @returns {object} Bounded status result or a non-retryable result-limit failure.
 */
function createBoundedGitStatusResult(result, maxFiles = DEFAULT_GIT_STATUS_MAX_FILES, maxBytes = GIT_STATUS_RESULT_MAX_BYTES) {
  if (result?.status === "failed") return result;
  const completeStatus = result?.status || {};
  const completeFiles = Array.isArray(completeStatus.files) ? completeStatus.files : [];
  const sortedFiles = completeFiles.slice().sort(compareStatusFiles);
  const requestedCount = Math.min(normalizeGitStatusMaxFiles(maxFiles), sortedFiles.length);
  const counts = {
    files: completeFiles.length,
    staged: completeFiles.filter((file) => file.index && file.index !== " " && file.index !== "?").length,
    unstaged: completeFiles.filter((file) => file.workingDir && file.workingDir !== " ").length
  };

  const createResult = (count) => ({
    ...result,
    status: createStatusWindow(completeStatus, sortedFiles.slice(0, count)),
    counts,
    truncated: count < completeFiles.length,
    returnedFiles: count
  });

  let lower = 0;
  let upper = requestedCount;
  let boundedResult = null;
  while (lower <= upper) {
    const count = Math.floor((lower + upper) / 2);
    const candidate = createResult(count);
    if (Buffer.byteLength(JSON.stringify(candidate, null, 2), "utf8") <= maxBytes) {
      boundedResult = candidate;
      lower = count + 1;
    } else {
      upper = count - 1;
    }
  }
  return boundedResult || createGitStatusFailure({ code: "GIT_STATUS_RESULT_LIMIT", stage: "limit" });
}

function assertMutationAllowed(options = {}) {
  if (options.allowGitMutation !== true) {
    throw new Error("Git mutations require user approval.");
  }
}

async function runGitRequest(root, request, options = {}) {
  throwIfAborted(options.signal);
  const bridge = loadGitBridge();
  const response = await bridge.runRequest({
    ...request,
    folderPath: resolveRepositoryPath(root)
  });
  throwIfAborted(options.signal);
  if (response?.ok === false) throw new Error(response.error || "Git Panel action failed.");
  return response || {};
}

function createPrNotesScaffold(digest = {}) {
  const scope = digest.commitScope === "staged" ? "staged changes" : "all local changes";
  return [
    "# PR Notes",
    "",
    "## Summary",
    `- Summarize the user-facing impact from ${scope}.`,
    "",
    "## Changes",
    "- Group notable behavior, documentation, and tooling changes.",
    "",
    "## Validation",
    "- Mention tests or checks only when the git context or conversation provides evidence.",
    "",
    "## Risks",
    "- Call out migrations, compatibility risks, or follow-up work only when supported by the inspected changes."
  ].join("\n");
}

function getFilesArgument(args = {}) {
  return normalizeFiles(args.files || args.paths);
}

function getGitPanelToolInputSummary(toolName, args = {}) {
  if (args.path || args.filePath) return normalizeGitPath(args.path || args.filePath);
  if (Array.isArray(args.files) || Array.isArray(args.paths)) return getFilesArgument(args).join(", ");
  if (args.branch || args.remoteBranch) return String(args.branch || args.remoteBranch || "").trim();
  if (args.message) return String(args.message || "").split(/\r?\n/)[0].trim();
  return toolName;
}

function getGitPanelApprovalPreview(toolName, args = {}) {
  const files = getFilesArgument(args);
  const lines = [`Action: ${toolName.replace(/^git_/, "").replace(/_/g, " ")}`];
  if (files.length) lines.push(`Files: ${files.join(", ")}`);
  if (args.branch) lines.push(`Branch: ${String(args.branch || "").trim()}`);
  if (args.remoteBranch) lines.push(`Remote branch: ${String(args.remoteBranch || "").trim()}`);
  if (args.message) lines.push("", "Message:", String(args.message || ""));
  return lines.join("\n");
}

function isGitPanelTool(toolName) {
  return GIT_PANEL_TOOL_NAMES.includes(String(toolName || ""));
}

function isGitPanelMutatingTool(toolName) {
  return GIT_PANEL_MUTATING_TOOL_NAMES.includes(String(toolName || ""));
}

async function runGitPanelTool(root, toolName, args = {}, options = {}) {
  switch (toolName) {
    case "git_status": {
      try {
        const result = await runGitRequest(root, { action: "status" }, options);
        return createBoundedGitStatusResult(result, args.maxFiles);
      } catch (error) {
        if (options.signal?.aborted) throw error;
        return createGitStatusFailure(error);
      }
    }
    case "git_branches":
      return runGitRequest(root, { action: "branchList" }, options);
    case "git_diff":
      return runGitRequest(root, {
        action: "compareFile",
        filePath: normalizeGitPath(args.filePath || args.path),
        originalPath: normalizeGitPath(args.originalPath),
        scope: String(args.scope || "unstaged")
      }, options);
    case "git_changes_digest":
      return runGitRequest(root, { action: "changesDigest" }, options);
    case "git_pr_notes": {
      const result = await runGitRequest(root, { action: "changesDigest" }, options);
      return {
        action: "git_pr_notes",
        isRepo: result.isRepo,
        digest: result.digest,
        scaffold: createPrNotesScaffold(result.digest),
        instruction: "Use this digest as evidence and write the final PR notes in the assistant response."
      };
    }
    case "git_stage":
      assertMutationAllowed(options);
      return runGitRequest(root, { action: "stage", files: getFilesArgument(args) }, options);
    case "git_unstage":
      assertMutationAllowed(options);
      return runGitRequest(root, { action: "unstage", files: getFilesArgument(args) }, options);
    case "git_commit":
      assertMutationAllowed(options);
      return runGitRequest(root, { action: "commit", message: String(args.message || "") }, options);
    case "git_fetch":
      assertMutationAllowed(options);
      return runGitRequest(root, { action: "fetch" }, options);
    case "git_pull":
      assertMutationAllowed(options);
      return runGitRequest(root, { action: "pull" }, options);
    case "git_push":
      assertMutationAllowed(options);
      return runGitRequest(root, { action: "push" }, options);
    case "git_branch_create":
      assertMutationAllowed(options);
      return runGitRequest(root, { action: "branchCreate", branch: String(args.branch || "") }, options);
    case "git_branch_switch":
      assertMutationAllowed(options);
      return runGitRequest(root, { action: "switchBranch", branch: String(args.branch || ""), remoteBranch: String(args.remoteBranch || "") }, options);
    default:
      throw new Error(`Unsupported Git Panel tool: ${toolName}`);
  }
}

module.exports = {
  DEFAULT_GIT_STATUS_MAX_FILES,
  GIT_STATUS_RESULT_MAX_BYTES,
  GIT_PANEL_MUTATING_TOOL_NAMES,
  GIT_PANEL_READ_TOOL_NAMES,
  GIT_PANEL_TOOL_NAMES,
  createBoundedGitStatusResult,
  createGitStatusFailure,
  getGitPanelApprovalPreview,
  getGitPanelToolInputSummary,
  isGitPanelMutatingTool,
  isGitPanelTool,
  runGitPanelTool
};
