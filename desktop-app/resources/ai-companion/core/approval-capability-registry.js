/**
 * Describes approval capabilities, protected resource identities, and safe grant choices.
 */

"use strict";

const path = require("node:path");

const LIFETIME_RANK = Object.freeze({ action: 0, task: 1, workspace: 2 });
const FILE_WRITE_TOOLS = new Set(["apply_edit", "write_file", "create_document_tab", "insert_at_cursor", "replace_selection", "replace_document_range", "extract_selection_to_note"]);
const PATH_RESOURCE_TOOLS = new Set([...FILE_WRITE_TOOLS, "delete_file", "move_path"]);
const CAPABILITIES = Object.freeze({
  delete_file: { id: "workspace.file.delete", risk: "high", label: "Delete workspace files", maxLifetime: "action" },
  move_path: { id: "workspace.path.move", risk: "high", label: "Move workspace paths", maxLifetime: "action" },
  git_stage: { id: "git.index.change", risk: "medium", label: "Change Git index", maxLifetime: "workspace" },
  git_unstage: { id: "git.index.change", risk: "medium", label: "Change Git index", maxLifetime: "workspace" },
  git_commit: { id: "git.commit.create", risk: "medium", label: "Create Git commits", maxLifetime: "workspace" },
  git_branch_create: { id: "git.branch.local", risk: "medium", label: "Change local branches", maxLifetime: "workspace" },
  git_branch_switch: { id: "git.branch.local", risk: "medium", label: "Change local branches", maxLifetime: "workspace" },
  git_fetch: { id: "git.remote.change", risk: "high", label: "Fetch from Git remotes", maxLifetime: "action" },
  git_pull: { id: "git.remote.change", risk: "high", label: "Pull from Git remotes", maxLifetime: "action" },
  git_push: { id: "git.remote.change", risk: "high", label: "Push to Git remotes", maxLifetime: "action" },
  export_active_document: { id: "export.document", risk: "low", label: "Export documents", maxLifetime: "workspace" },
  export_active_folder_graph: { id: "export.graph", risk: "low", label: "Export folder graphs", maxLifetime: "workspace" },
  start_code_conversion: { id: "conversion.start", risk: "medium", label: "Start code conversion", maxLifetime: "workspace" },
  preferences_update: { id: "settings.change", risk: "high", label: "Change settings", maxLifetime: "action" },
  preferences_reset: { id: "settings.change", risk: "high", label: "Change settings", maxLifetime: "action" },
  preferences_import: { id: "settings.security.change", risk: "high", label: "Import settings", maxLifetime: "action" },
  mcp_server_connect: { id: "external.server.connect", risk: "high", label: "Connect external capability servers", maxLifetime: "workspace" },
  mcp_tool_invoke: { id: "external.tool.invoke", risk: "high", label: "Invoke external capabilities", maxLifetime: "task" },
  extension_hook_run: { id: "extension.hook.execute", risk: "high", label: "Run extension hooks", maxLifetime: "task" },
  worker_workspace_create: { id: "worker.workspace.create", risk: "high", label: "Create delegated Git worktrees", maxLifetime: "action" },
  run_command: { id: "shell.freeform", risk: "high", label: "Run free-form shell commands", maxLifetime: "action" }
});

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").trim();
}

function getConfiguredMaximum(policy, capability, fallback) {
  const configured = policy?.approvals?.maximumGrantLifetime?.[capability]
    || policy?.approvals?.maximumGrantLifetime?.default;
  return Object.hasOwn(LIFETIME_RANK, configured) ? configured : fallback;
}

function isCapabilityAllowed(policy, capability) {
  const allowed = policy?.approvals?.allowedCapabilities;
  return !Array.isArray(allowed) || allowed.includes("*") || allowed.includes(capability);
}

function createOption(id, label, lifetime, matcher, extra = {}) {
  return { id, label, lifetime, matcher, disabled: false, ...extra };
}

function applyEligibility(option, maximum, reason = "Enterprise or product policy permits one-time approval only.") {
  return LIFETIME_RANK[option.lifetime] <= LIFETIME_RANK[maximum]
    ? option
    : { ...option, disabled: true, disabledReason: reason };
}

function createFileGrantOptions(resource, maximum, policy) {
  if (!resource.value) return [];
  const directory = path.posix.dirname(resource.value) === "." ? "" : path.posix.dirname(resource.value);
  const extension = path.posix.extname(resource.value);
  const folderPattern = directory ? `${directory}/**` : "**/*";
  const shortDirectory = `/${path.posix.basename(directory) || "workspace"}`;
  const options = [createOption("task-folder", `Allow file edits in ${directory || "this workspace"} for this task`, "task", { type: "path-glob", value: folderPattern }, {
    actionLabel: "Only for this task",
    targetLabel: `${shortDirectory}/*.*`
  })];
  options.push(createOption("workspace-file", `Always allow edits to ${resource.value}`, "workspace", { type: "path-glob", value: resource.value }, {
    actionLabel: "Always allow",
    targetLabel: `${shortDirectory}/${path.posix.basename(resource.value)}`
  }));
  if (extension) options.push(createOption("workspace-extension", `Always allow ${extension} files in ${directory || "this workspace"}`, "workspace", { type: "path-glob", value: directory ? `${directory}/**/*${extension}` : `**/*${extension}` }, {
    actionLabel: "Always allow",
    targetLabel: `${shortDirectory}/*${extension}`
  }));
  options.push(createOption("workspace-folder", `Always allow file edits in ${directory || "this workspace"}`, "workspace", { type: "path-glob", value: folderPattern }, {
    actionLabel: "Always allow",
    targetLabel: `${shortDirectory}/**`
  }));
  options.push(createOption("workspace-all-writes", "Never ask for non-protected file edits in this workspace", "workspace", { type: "path-glob", value: "**/*" }, policy?.approvals?.allowWorkspaceWideFileWrites === false
    ? { actionLabel: "Never ask", targetLabel: "non-protected in this workspace", requiresBroadConfirmation: true, disabled: true, disabledReason: "Workspace-wide file grants are disabled by policy." }
    : { actionLabel: "Never ask", targetLabel: "non-protected in this workspace", requiresBroadConfirmation: true }));
  return options.map((option) => ({
    ...(option.disabled ? option : applyEligibility(option, maximum)),
    tooltipResource: resource.value
  }));
}

function createGenericGrantOptions(descriptor, maximum) {
  const options = [createOption("task-capability", `Allow ${descriptor.label.toLowerCase()} for this task`, "task", descriptor.resource)];
  options.push(createOption("workspace-capability", `Always allow ${descriptor.label.toLowerCase()} in this workspace`, "workspace", descriptor.resource));
  return options.map((option) => applyEligibility(option, maximum));
}

/**
 * Describe the approval capability and request-bound grant choices for a tool call.
 * @param {string} toolName Agent tool name.
 * @param {object} args Parsed tool arguments.
 * @param {object} context Workspace and effective security policy context.
 * @returns {object|null} Capability descriptor, or null when the tool is not approval-capable.
 */
function describe(rawToolName, args = {}, context = {}) {
  const toolName = require("./tool-scope-registry").toCanonicalName(rawToolName);
  let definition = CAPABILITIES[toolName];
  if (FILE_WRITE_TOOLS.has(toolName)) definition = { id: "workspace.file.write", risk: "low", label: "Write workspace files", maxLifetime: "workspace" };
  if (!definition) return null;
  const conversionResource = toolName === "start_code_conversion"
    ? [normalizePath(args.sourceRoot), normalizePath(args.destinationRoot)].filter(Boolean).join(" -> ")
    : "";
  const resourceValue = PATH_RESOURCE_TOOLS.has(toolName)
    ? normalizePath(args.path || args.sourcePath || args.expectedPath)
    : conversionResource || normalizePath(args.serverId || args.hookId || args.branch || args.remoteBranch || toolName);
  const resource = PATH_RESOURCE_TOOLS.has(toolName)
    ? { type: "path-glob", value: resourceValue }
    : { type: "exact", value: resourceValue || toolName };
  const policy = context.effectiveSecurityPolicy || {};
  const maximum = isCapabilityAllowed(policy, definition.id) ? getConfiguredMaximum(policy, definition.id, definition.maxLifetime) : "action";
  const descriptor = { tool: toolName, capability: definition.id, risk: definition.risk, label: definition.label, resource, maximumGrantLifetime: maximum };
  descriptor.boundaryPaths = toolName === "start_code_conversion"
    ? [args.sourceRoot, args.destinationRoot].map((value) => String(value || "").trim()).filter(Boolean)
    : (PATH_RESOURCE_TOOLS.has(toolName)
      ? [args.path || args.sourcePath || args.expectedPath, args.destinationPath].map((value) => String(value || "").trim()).filter(Boolean)
      : []);
  descriptor.grantOptions = FILE_WRITE_TOOLS.has(toolName)
    ? createFileGrantOptions(resource, maximum, policy)
    : createGenericGrantOptions(descriptor, maximum);
  return descriptor;
}

module.exports = {
  CAPABILITIES,
  FILE_WRITE_TOOLS,
  PATH_RESOURCE_TOOLS,
  LIFETIME_RANK,
  describe,
  normalizePath
};
