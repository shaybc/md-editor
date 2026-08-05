/**
 * Classify interrupted Agent tools and reconcile workspace file mutations safely.
 */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const RECOVERY_POLICY_VERSION = 1;
const REPEATABLE_READ_TOOLS = new Set([
  "read_file", "list_files", "glob", "search_text", "get_editor_state", "get_active_document",
  "get_open_documents", "get_selection", "graph_get_state", "graph_list_nodes", "graph_list_edges",
  "git_status", "git_diff", "git_branches", "preferences_get", "preferences_list",
  "plan_list", "plan_read", "inspect_api_collection"
]);
const RECONCILABLE_MUTATION_TOOLS = new Set([
  "apply_edit", "write_file", "delete_file", "move_path", "create_document_tab", "insert_at_cursor",
  "replace_selection", "replace_document_range", "extract_selection_to_note"
]);
const INDETERMINATE_EXTERNAL_TOOLS = new Set([
  "run_command", "run_java_build", "restore_dependencies", "manage_dependencies", "git_stage",
  "git_unstage", "git_commit", "git_fetch", "git_pull", "git_push",
  "git_branch_create", "git_branch_switch", "export_active_document", "export_active_folder_graph",
  "start_code_conversion", "preferences_update", "preferences_reset", "preferences_import"
]);

function hash(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ""), "utf8");
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** Return the deterministic recovery class for a tool implementation. */
function classifyToolRecovery(tool) {
  const name = String(tool || "");
  if (REPEATABLE_READ_TOOLS.has(name)) return "repeatable_read";
  if (RECONCILABLE_MUTATION_TOOLS.has(name)) return "reconcilable_mutation";
  if (INDETERMINATE_EXTERNAL_TOOLS.has(name)) return "indeterminate_external";
  return "nonresumable";
}

async function resolveInsideWorkspace(root, requestedPath) {
  const canonicalRoot = await fs.realpath(root).catch(() => path.resolve(root));
  const absolutePath = path.resolve(canonicalRoot, String(requestedPath || ""));
  const lexicalRelative = path.relative(canonicalRoot, absolutePath);
  if (!requestedPath || lexicalRelative.startsWith("..") || path.isAbsolute(lexicalRelative)) return { valid: false, reason: "path-outside-workspace" };
  let candidate = absolutePath;
  while (candidate && candidate !== path.dirname(candidate)) {
    try {
      const realPath = await fs.realpath(candidate);
      const relative = path.relative(canonicalRoot, realPath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) return { valid: false, reason: "symlink-outside-workspace" };
      return { valid: true, canonicalRoot, absolutePath, realPath };
    } catch (error) {
      if (error?.code !== "ENOENT") return { valid: false, reason: "path-resolution-failed" };
      candidate = path.dirname(candidate);
    }
  }
  return { valid: false, reason: "path-resolution-failed" };
}

/** Observe a file target using the current filesystem and symlink boundaries. */
async function observeWorkspacePath(root, requestedPath) {
  const resolved = await resolveInsideWorkspace(root, requestedPath);
  if (!resolved.valid) return { path: String(requestedPath || ""), valid: false, reason: resolved.reason };
  try {
    const stat = await fs.lstat(resolved.absolutePath);
    if (stat.isSymbolicLink()) return { path: String(requestedPath), valid: false, reason: "target-is-symlink" };
    const content = stat.isFile() ? await fs.readFile(resolved.absolutePath) : null;
    return {
      path: String(requestedPath), valid: true, exists: true,
      type: stat.isFile() ? "file" : (stat.isDirectory() ? "directory" : "other"),
      realPath: await fs.realpath(resolved.absolutePath),
      contentFingerprint: content ? hash(content) : ""
    };
  } catch (error) {
    if (error?.code !== "ENOENT") return { path: String(requestedPath), valid: false, reason: "observation-failed" };
    return { path: String(requestedPath), valid: true, exists: false, type: "missing", realPath: resolved.absolutePath,
      nearestParentRealPath: resolved.realPath, contentFingerprint: hash("") };
  }
}

/** Compare current observation with a prepared action's pre/postcondition fingerprints. */
async function reconcilePreparedAction(root, action = {}) {
  const recoveryClass = classifyToolRecovery(action.tool);
  if (recoveryClass === "repeatable_read") return { outcome: "restart_decision", recoveryClass, reasonCode: "repeatable-read-interrupted" };
  if (recoveryClass === "indeterminate_external") return { outcome: "indeterminate", recoveryClass, reasonCode: "external-effect-indeterminate" };
  if (recoveryClass !== "reconcilable_mutation") return { outcome: "blocked", recoveryClass, reasonCode: "tool-not-resumable" };
  const targetPath = action.workspacePath || action.path || action.resource;
  const observation = await observeWorkspacePath(root, targetPath);
  if (!observation.valid) return { outcome: "blocked", recoveryClass, observation, reasonCode: observation.reason };
  if (action.expectedPostcondition && observation.contentFingerprint === action.expectedPostcondition) {
    return { outcome: "reconciled", recoveryClass, observation, reasonCode: "postcondition-proven" };
  }
  if (action.preconditionFingerprint && observation.contentFingerprint === action.preconditionFingerprint) {
    return { outcome: "restart_decision", recoveryClass, observation, reasonCode: "precondition-still-current" };
  }
  return { outcome: "indeterminate", recoveryClass, observation, reasonCode: "workspace-state-conflict" };
}

module.exports = {
  RECOVERY_POLICY_VERSION,
  classifyToolRecovery,
  observeWorkspacePath,
  reconcilePreparedAction
};
