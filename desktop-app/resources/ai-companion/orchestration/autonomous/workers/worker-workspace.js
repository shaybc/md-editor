/** Optional Git worktree isolation for delegated workers. */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const simpleGit = require("simple-git");
const { authorizeTool } = require("../approval-gateway");
const { getRunIdentity } = require("../work/run-identity");

/** Create an approved worker worktree or return a documented shared-workspace fallback. */
async function prepareWorkerWorkspace(request, workerId, isolation, taskGrants) {
  if (isolation !== "worktree") return { root: request.workspaceRoot, isolation: "shared" };
  const approval = await authorizeTool(request, "worker_workspace_create", { workerId, approvalReason: "Create an isolated Git worktree for delegated work." }, taskGrants);
  if (!approval.approved) return { root: request.workspaceRoot, isolation: "shared", fallbackReason: "Worktree creation was denied." };
  const git = simpleGit(request.workspaceRoot);
  if (!await git.checkIsRepo()) return { root: request.workspaceRoot, isolation: "shared", fallbackReason: "The workspace is not a Git repository." };
  const base = request.profileRoot || request.workspaceRoot;
  const root = path.join(base, ".md-editor", "companion", "worker-workspaces", getRunIdentity(request), workerId);
  const branch = `md-editor-worker-${workerId}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  try {
    await fs.mkdir(path.dirname(root), { recursive: true });
    await git.raw(["worktree", "add", "-b", branch, root]);
    return { root, isolation: "worktree", branch };
  } catch (error) {
    return { root: request.workspaceRoot, isolation: "shared", fallbackReason: error?.message || String(error) };
  }
}

/** Remove an unchanged worktree and retain changed work for user review. */
async function finishWorkerWorkspace(request, workspace) {
  if (workspace?.isolation !== "worktree") return workspace;
  const status = await simpleGit(workspace.root).status();
  if (!status.isClean()) return { ...workspace, retained: true };
  await simpleGit(request.workspaceRoot).raw(["worktree", "remove", "--force", workspace.root]);
  return { ...workspace, root: "", retained: false };
}

module.exports = { finishWorkerWorkspace, prepareWorkerWorkspace };
