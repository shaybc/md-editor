/** Authoritative distinction between runtime location and user-authorized workspace. */

"use strict";

const path = require("node:path");

const WORKSPACE_SCOPED_TOOLS = new Set(["list_files", "glob_files", "find_documentation", "search_text", "workspace_structure"]);

/** Describe workspace authority without promoting the process directory to a workspace. */
function describeWorkspaceContext(request = {}) {
  const rootText = String(request.workspaceRoot || "").trim();
  const workspaceRoot = rootText ? path.resolve(rootText) : "";
  const runtimeText = String(request.workingDirectory || request.cwd || workspaceRoot || process.cwd());
  return {
    workspaceAvailable: Boolean(workspaceRoot),
    workspaceRoot,
    runtimeCwd: path.resolve(runtimeText),
    pathAuthority: workspaceRoot ? "opened-workspace-and-user-provided-paths" : "user-provided-paths-only"
  };
}

/** Reject a workspace-scoped tool with one canonical recovery action. */
function requireWorkspaceForTool(request, tool) {
  if (!WORKSPACE_SCOPED_TOOLS.has(String(tool || ""))) return;
  if (describeWorkspaceContext(request).workspaceAvailable) return;
  const error = new Error(`Tool '${tool}' requires an opened workspace. Ask the user to open a folder or provide an authorized absolute location using request_user_choice.`);
  error.code = "WORKSPACE_REQUIRED";
  error.retryable = false;
  error.doNotRetry = true;
  error.recoveryTool = "request_user_choice";
  throw error;
}

module.exports = { WORKSPACE_SCOPED_TOOLS, describeWorkspaceContext, requireWorkspaceForTool };
