/**
 * Restart-safe approval checkpoint creation and validation.
 */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const RESUME_ACTION_VERSION = 1;

function hashContent(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

async function pathExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function getReplayPath(args = {}, compare = null) {
  return String(compare?.path || args.path || "").replace(/\\/g, "/");
}

/**
 * Create the request-bound action persisted with an unanswered approval.
 * @param {string} root Canonical workspace root for the active task.
 * @param {object} details Tool, arguments, approval, and comparison details.
 * @returns {Promise<object>} Versioned action with a file-content precondition when available.
 */
async function createResumeAction(root, details = {}) {
  const args = details.args && typeof details.args === "object" ? JSON.parse(JSON.stringify(details.args)) : {};
  const replayPath = getReplayPath(args, details.compare);
  let precondition = null;
  if (replayPath && typeof details.compare?.beforeContent === "string") {
    const absolutePath = path.resolve(root, replayPath);
    precondition = {
      kind: "file-content",
      path: replayPath,
      existed: await pathExists(absolutePath),
      sha256: hashContent(details.compare.beforeContent)
    };
  }
  return {
    version: RESUME_ACTION_VERSION,
    replayEligible: !!precondition,
    activityId: String(details.activityId || ""),
    tool: String(details.tool || ""),
    args,
    capability: String(details.capability || ""),
    resource: details.resource || null,
    approvalReason: String(details.approvalReason || "").trim(),
    actionAnalysis: details.actionAnalysis || null,
    precondition
  };
}

async function resolveCanonicalRoot(root) {
  return fs.realpath(root).catch(() => path.resolve(root));
}

async function validateFilePrecondition(root, precondition = {}) {
  const canonicalRoot = await resolveCanonicalRoot(root);
  const absolutePath = path.resolve(canonicalRoot, String(precondition.path || ""));
  const relative = path.relative(canonicalRoot, absolutePath);
  if (!precondition.path || relative.startsWith("..") || path.isAbsolute(relative)) {
    return { valid: false, reason: "The saved action resolves outside the current workspace." };
  }
  const exists = await pathExists(absolutePath);
  const canonicalTarget = exists
    ? await fs.realpath(absolutePath)
    : path.join(await fs.realpath(path.dirname(absolutePath)).catch(() => path.dirname(absolutePath)), path.basename(absolutePath));
  const canonicalRelative = path.relative(canonicalRoot, canonicalTarget);
  if (canonicalRelative.startsWith("..") || path.isAbsolute(canonicalRelative)) {
    return { valid: false, reason: "The saved action resolves through a link outside the current workspace." };
  }
  if (exists !== (precondition.existed === true)) {
    return { valid: false, reason: "The target file existence changed after the approval was saved." };
  }
  const content = exists ? await fs.readFile(absolutePath, "utf8") : "";
  if (hashContent(content) !== String(precondition.sha256 || "")) {
    return { valid: false, reason: "The target file content changed after the approval was saved." };
  }
  return { valid: true };
}

/**
 * Validate whether a saved action can be replayed in the current workspace.
 * @param {string} root Current workspace root.
 * @param {object} checkpoint Renderer-supplied restart checkpoint.
 * @returns {Promise<object>} Replay decision and normalized saved action.
 */
async function validateResumeCheckpoint(root, checkpoint = {}) {
  const action = checkpoint?.pendingAction;
  if (!action || action.version !== RESUME_ACTION_VERSION || action.replayEligible !== true) {
    return { canReplay: false, action: action || null, reason: checkpoint?.reason || "The saved approval predates restart-safe checkpoints and must be re-evaluated." };
  }
  if (!action.tool || !action.args || typeof action.args !== "object" || Array.isArray(action.args)) {
    return { canReplay: false, action, reason: "The saved action is incomplete and cannot be replayed." };
  }
  const currentRoot = await resolveCanonicalRoot(root);
  const savedRoot = checkpoint.workspaceRoot ? await resolveCanonicalRoot(checkpoint.workspaceRoot) : currentRoot;
  const normalizeForComparison = (value) => process.platform === "win32" ? path.normalize(value).toLowerCase() : path.normalize(value);
  if (normalizeForComparison(currentRoot) !== normalizeForComparison(savedRoot)) {
    return { canReplay: false, action, reason: "The saved action belongs to a different workspace." };
  }
  if (action.precondition?.kind !== "file-content") {
    return { canReplay: false, action, reason: "This action type requires fresh agent evaluation after restart." };
  }
  const precondition = await validateFilePrecondition(currentRoot, action.precondition);
  return precondition.valid ? { canReplay: true, action } : { canReplay: false, action, reason: precondition.reason };
}

function createResumeContextMessage(checkpoint = {}, validation = {}) {
  const action = validation.action || checkpoint.pendingAction || {};
  const pathValue = action.args?.path || action.precondition?.path || action.resource?.value || "";
  const status = validation.canReplay
    ? "The exact saved action will be revalidated through the normal approval and execution flow before you continue."
    : `The saved action was not executed: ${validation.reason || "it requires re-evaluation"}`;
  return [
    "Restart continuation checkpoint:",
    `Original task: ${String(checkpoint.rootPrompt || "").trim()}`,
    `Pending tool: ${action.tool || "unknown"}`,
    pathValue ? `Pending resource: ${pathValue}` : "",
    action.approvalReason ? `Reason: ${action.approvalReason}` : "",
    status,
    validation.canReplay ? "Continue only after the resulting tool outcome is available." : "Re-evaluate the current workspace before proposing a fresh action. Do not claim the pending work completed. If no valid tool is available, report the task as incomplete."
  ].filter(Boolean).join("\n");
}

module.exports = {
  RESUME_ACTION_VERSION,
  createResumeAction,
  createResumeContextMessage,
  hashContent,
  validateResumeCheckpoint
};
