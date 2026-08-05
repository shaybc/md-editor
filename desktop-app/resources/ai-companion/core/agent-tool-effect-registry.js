/**
 * Canonical tool-effect registry: the single source of truth mapping every exposed
 * AI Companion tool to its effect category, canonical capability, resource identity,
 * and whether the call is effectful (a mutation).
 *
 * This registry is SEPARATE from approval policy. "Effectful" and "requires approval"
 * are different concepts: a tool can be effectful without needing approval, and vice
 * versa. The two share one capability vocabulary -- for approval-covered tools the
 * capability here reuses the exact ID from approval-capability-registry.js (aligned by
 * test) so the vocabulary cannot drift.
 *
 * Control-scoped mutation blocking (M2) resolves a proposed mutation's capability and
 * resource through this module and matches them against a decision's controlled scope.
 *
 * Pure module: no IO, no provider calls, no side effects.
 */

"use strict";

const approvalCapabilities = require("./approval-capability-registry");
const { toCanonicalName } = require("./tool-scope-registry");

/** The five effect categories a tool may fall into. */
const EFFECT_CATEGORIES = Object.freeze(["read", "ui-state", "workspace-write", "external-write", "execution"]);

/** Effect categories whose calls are mutations for control-scoped blocking. */
const EFFECTFUL_CATEGORIES = Object.freeze(new Set(["workspace-write", "external-write", "execution"]));

/** Tool families whose successful results can establish specific criterion outcomes. */
const EVIDENCE_TOOL_FAMILIES = Object.freeze({
  "git-change-content": Object.freeze(["git_changes_digest", "git_diff"]),
  "file-write": Object.freeze(["apply_edit", "write_file", "create_document_tab", "insert_at_cursor", "replace_selection", "replace_document_range", "extract_selection_to_note"]),
  "file-read": Object.freeze(["read_file", "read_open_tabs", "read_active_document"]),
  "test-result": Object.freeze(["run_tests"]),
  "build-result": Object.freeze(["compile_project"])
});

/**
 * Tools whose resource is a workspace path, resolved from path-like arguments. Reuses
 * the approval registry's file-write set and adds the read tools that also target a path.
 */
const PATH_RESOURCE_TOOLS = Object.freeze(new Set([...approvalCapabilities.FILE_WRITE_TOOLS, "read_file", "git_diff"]));

/** Tools whose resource is a Git branch reference. */
const BRANCH_RESOURCE_TOOLS = Object.freeze(new Set(["git_branch_create", "git_branch_switch"]));

/** Tools whose resource is a saved-plan identity. */
const PLAN_RESOURCE_TOOLS = Object.freeze(new Set(["plan_create", "plan_read", "plan_update", "plan_update_status", "plan_rebuild_index"]));

/** Tools whose resource is an API Client asset identity (request/environment/mock). */
const API_RESOURCE_TOOLS = Object.freeze(new Set(["request_create", "request_update", "request_send", "request_history_get", "environment_get", "environment_update", "environment_resolve", "mock_create", "mock_update", "mock_call", "response_analyze"]));

/** Arguments that produce a persistent or user-visible effect. */
const PRODUCED_EFFECT_ARGUMENT_PATHS = Object.freeze({
  write_file: ["path", "content"],
  apply_edit: ["path", "replacement"],
  open_file_in_tab: ["path"],
  create_document_tab: ["path", "content", "title"],
  insert_at_cursor: ["path", "expectedPath", "text"],
  replace_selection: ["path", "expectedPath", "replacement"],
  replace_document_range: ["path", "replacement"],
  extract_selection_to_note: ["path", "title"],
  git_stage: ["files"],
  git_unstage: ["files"]
});

/**
 * Tool -> { effect, capability }. Capability IDs for approval-covered tools reuse the
 * exact approval-registry IDs; the remainder use canonical capabilities introduced here.
 * Every tool returned by getAgentToolDefinitions() must appear here (enforced by test).
 */
const TOOL_EFFECTS = Object.freeze({
  // --- read: workspace inspection --------------------------------------------------
  get_workspace_state: { effect: "read", capability: "read.workspace" },
  search_vault: { effect: "read", capability: "read.workspace" },
  get_recent_activity: { effect: "read", capability: "read.workspace" },
  list_files: { effect: "read", capability: "read.workspace" },
  glob: { effect: "read", capability: "read.workspace" },
  search_text: { effect: "read", capability: "read.workspace" },
  read_file: { effect: "read", capability: "read.workspace" },
  read_conversion_report: { effect: "read", capability: "read.workspace" },

  // --- read: live editor -----------------------------------------------------------
  read_active_document: { effect: "read", capability: "read.editor" },
  read_open_tabs: { effect: "read", capability: "read.editor" },
  get_document_structure: { effect: "read", capability: "read.editor" },
  get_link_context: { effect: "read", capability: "read.editor" },

  // --- read: graph -----------------------------------------------------------------
  graph_get_state: { effect: "read", capability: "read.graph" },
  graph_search_nodes: { effect: "read", capability: "read.graph" },
  graph_get_node_context: { effect: "read", capability: "read.graph" },
  graph_find_paths: { effect: "read", capability: "read.graph" },

  // --- read: git -------------------------------------------------------------------
  git_status: { effect: "read", capability: "read.git" },
  git_branches: { effect: "read", capability: "read.git" },
  git_diff: { effect: "read", capability: "read.git" },
  git_changes_digest: { effect: "read", capability: "read.git" },
  git_pr_notes: { effect: "read", capability: "read.git" },

  // --- read: settings --------------------------------------------------------------
  preferences_get: { effect: "read", capability: "read.settings" },
  preferences_search: { effect: "read", capability: "read.settings" },
  preferences_export: { effect: "read", capability: "read.settings" },

  // --- read: API Client (inspection / pure transforms) -----------------------------
  api_asset_search: { effect: "read", capability: "read.apiclient" },
  api_asset_get: { effect: "read", capability: "read.apiclient" },
  request_history_get: { effect: "read", capability: "read.apiclient" },
  response_analyze: { effect: "read", capability: "read.apiclient" },
  environment_get: { effect: "read", capability: "read.apiclient" },
  environment_resolve: { effect: "read", capability: "read.apiclient" },
  secret_redact: { effect: "read", capability: "read.apiclient" },
  // mock_call invokes a local mock and returns data; it performs no persistent or
  // external write, so it is classified read. Revisit if mocks gain side effects.
  mock_call: { effect: "read", capability: "read.apiclient" },

  // --- read: conversion/export state ----------------------------------------------
  get_conversion_export_state: { effect: "read", capability: "read.conversion" },
  get_code_conversion_status: { effect: "read", capability: "read.conversion" },

  // --- read: plan repository -------------------------------------------------------
  plan_list: { effect: "read", capability: "read.plan" },
  plan_read: { effect: "read", capability: "read.plan" },

  // --- ui-state: transient in-app view (no persistent/external change) --------------
  graph_apply_filter: { effect: "ui-state", capability: "graph.state" },
  graph_focus_nodes: { effect: "ui-state", capability: "graph.state" },
  graph_show_local: { effect: "ui-state", capability: "graph.state" },
  graph_clear_focus: { effect: "ui-state", capability: "graph.state" },
  open_file_in_tab: { effect: "ui-state", capability: "editor.view" },

  // --- workspace-write: persistent project-file / local-repo changes ----------------
  apply_edit: { effect: "workspace-write", capability: "workspace.file.write" },
  write_file: { effect: "workspace-write", capability: "workspace.file.write" },
  create_document_tab: { effect: "workspace-write", capability: "workspace.file.write" },
  insert_at_cursor: { effect: "workspace-write", capability: "workspace.file.write" },
  replace_selection: { effect: "workspace-write", capability: "workspace.file.write" },
  replace_document_range: { effect: "workspace-write", capability: "workspace.file.write" },
  extract_selection_to_note: { effect: "workspace-write", capability: "workspace.file.write" },
  git_stage: { effect: "workspace-write", capability: "git.index.change" },
  git_unstage: { effect: "workspace-write", capability: "git.index.change" },
  git_commit: { effect: "workspace-write", capability: "git.commit.create" },
  git_branch_create: { effect: "workspace-write", capability: "git.branch.local" },
  git_branch_switch: { effect: "workspace-write", capability: "git.branch.local" },
  export_active_document: { effect: "workspace-write", capability: "export.document" },
  export_active_folder_graph: { effect: "workspace-write", capability: "export.graph" },
  plan_create: { effect: "workspace-write", capability: "plan.write" },
  plan_update: { effect: "workspace-write", capability: "plan.write" },
  plan_update_status: { effect: "workspace-write", capability: "plan.write" },
  plan_rebuild_index: { effect: "workspace-write", capability: "plan.write" },
  request_create: { effect: "workspace-write", capability: "apiclient.mutate" },
  request_update: { effect: "workspace-write", capability: "apiclient.mutate" },
  environment_update: { effect: "workspace-write", capability: "apiclient.mutate" },
  mock_create: { effect: "workspace-write", capability: "apiclient.mutate" },
  mock_update: { effect: "workspace-write", capability: "apiclient.mutate" },

  // --- external-write: state outside the project workspace (network / remote / prefs)
  // Persisted app settings live outside the project tree and Git remote operations and
  // API sends leave the machine, so all three are grouped as external-write.
  git_fetch: { effect: "external-write", capability: "git.remote.change" },
  git_pull: { effect: "external-write", capability: "git.remote.change" },
  git_push: { effect: "external-write", capability: "git.remote.change" },
  request_send: { effect: "external-write", capability: "apiclient.send" },
  preferences_update: { effect: "external-write", capability: "settings.change" },
  preferences_reset: { effect: "external-write", capability: "settings.change" },
  preferences_import: { effect: "external-write", capability: "settings.security.change" },

  // --- execution: runs a process ---------------------------------------------------
  run_command: { effect: "execution", capability: "shell.freeform" },
  compile_project: { effect: "execution", capability: "execution.compile" },
  run_tests: { effect: "execution", capability: "execution.test" },
  restore_dependencies: { effect: "execution", capability: "deps.restore" },
  manage_dependencies: { effect: "execution", capability: "package.manage" },
  start_code_conversion: { effect: "execution", capability: "conversion.start" }
});

/**
 * Look up the effect entry for a tool.
 *
 * @param {string} toolName - Agent tool name.
 * @returns {{ effect: string, capability: string } | null} The entry, or null if unknown.
 */
function getToolEffect(toolName) {
  const canonical = toCanonicalName(toolName);
  return Object.hasOwn(TOOL_EFFECTS, canonical) ? TOOL_EFFECTS[canonical] : null;
}

/**
 * Whether a tool call is a mutation for control-scoped blocking (workspace-write,
 * external-write, or execution). Unknown tools are treated as effectful, conservatively.
 *
 * @param {string} toolName - Agent tool name.
 * @returns {boolean} True when the tool mutates state.
 */
function isEffectfulTool(toolName) {
  const entry = getToolEffect(toolName);
  return entry ? EFFECTFUL_CATEGORIES.has(entry.effect) : true;
}

/**
 * Resolve the canonical resource identity a tool call targets: a normalized workspace
 * path, a branch/plan/API identity, or an empty string when the tool has no discrete
 * resource. Used to match a proposed mutation against a decision's controlledTargets.
 *
 * @param {string} toolName - Agent tool name.
 * @param {object} [args] - Parsed tool arguments.
 * @returns {string} The normalized resource identity (may be empty).
 */
function resolveToolResource(rawToolName, args = {}) {
  const toolName = toCanonicalName(rawToolName);
  if (PATH_RESOURCE_TOOLS.has(toolName)) {
    return approvalCapabilities.normalizePath(args.path || args.sourcePath || args.expectedPath || args.file);
  }
  if (BRANCH_RESOURCE_TOOLS.has(toolName)) {
    return approvalCapabilities.normalizePath(args.branch || args.remoteBranch);
  }
  if (toolName === "start_code_conversion") {
    return [args.sourceRoot, args.destinationRoot].map((value) => approvalCapabilities.normalizePath(value)).filter(Boolean).join(" -> ");
  }
  if (PLAN_RESOURCE_TOOLS.has(toolName)) {
    return String(args.planId || args.id || "").trim();
  }
  if (API_RESOURCE_TOOLS.has(toolName)) {
    return String(args.requestId || args.environmentId || args.mockId || args.id || args.name || "").trim();
  }
  return "";
}

/**
 * Fully describe a tool call's effect for the control-scope matcher.
 *
 * @param {string} toolName - Agent tool name.
 * @param {object} [args] - Parsed tool arguments.
 * @returns {{ tool: string, effect: string, capability: string, effectful: boolean, resource: string } | null}
 *   The description, or null when the tool is not in the registry.
 */
function describeToolEffect(toolName, args = {}) {
  const entry = getToolEffect(toolName);
  if (!entry) return null;
  return {
    tool: toolName,
    effect: entry.effect,
    capability: entry.capability,
    effectful: EFFECTFUL_CATEGORIES.has(entry.effect),
    resource: resolveToolResource(toolName, args)
  };
}

/**
 * Return concrete argument values that define an action's produced effect. Search and
 * precondition inputs are deliberately excluded so old references can be located while
 * being replaced.
 * @param {string} toolName - Agent tool name.
 * @param {object} [args] - Parsed tool arguments.
 * @returns {{path:string,value:string}[]} Bounded scalar values and argument paths.
 */
function getProducedEffectValues(toolName, args = {}) {
  const values = [];
  for (const argumentPath of PRODUCED_EFFECT_ARGUMENT_PATHS[toolName] || []) {
    const value = args?.[argumentPath];
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach((entry, index) => values.push({ path: `${argumentPath}[${index}]`, value: String(entry || "") }));
    } else if (value !== undefined && value !== null) {
      values.push({ path: argumentPath, value: String(value) });
    }
  }
  return values;
}

/**
 * List every tool name the registry covers. Used by the drift-guard test.
 *
 * @returns {string[]} Covered tool names.
 */
function listCoveredTools() {
  return Object.keys(TOOL_EFFECTS);
}

function normalizeClaimPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").toLowerCase().trim();
}

/** Return file targets explicitly named by a criterion. */
function getCriterionFileTargets(criterion, contract = {}) {
  const text = normalizeClaimPath(criterion?.description || criterion);
  const contractTargets = (contract?.namedTargets?.files || [])
    .map((target) => normalizeClaimPath(target?.value))
    .filter((target) => target && text.includes(target));
  const inlineTargets = [...String(criterion?.description || criterion || "").matchAll(/(?:^|[\s`'"(])([A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)*\.[A-Za-z0-9_-]+)(?=$|[\s`'"),:;])/g)]
    .map((match) => normalizeClaimPath(match[1]));
  return [...new Set([...contractTargets, ...inlineTargets])];
}

/** Derive the evidence tool families required to establish a criterion's outcome. */
function getCriterionEvidenceFamilies(criterion, contract = {}) {
  const text = String(criterion?.description || criterion || "");
  const families = [];
  const fileTargets = getCriterionFileTargets(criterion, contract);
  if (/\bgit\s+(?:changes?|diff)\b|\b(?:changes?|diff)\s+(?:in|to)\s+(?:git|the\s+repository)\b/i.test(text)) families.push("git-change-content");
  if (/\btests?\s+(?:pass(?:es|ed)?|succeed(?:s|ed)?)\b|\b(?:run|ran|running)\s+(?:the\s+)?tests?\b/i.test(text)) families.push("test-result");
  if (/\bbuild\s+(?:passes?|succeeds?|succeeded|completed)\b|\b(?:build|built|compile|compiled)\s+(?:the\s+)?(?:project|application|app)\b/i.test(text)) families.push("build-result");
  if (fileTargets.length && /\b(?:add(?:ed)?|appl(?:y|ied)|chang(?:e|ed)|creat(?:e|ed)|delet(?:e|ed)|edit(?:ed)?|modif(?:y|ied)|remov(?:e|ed)|updat(?:e|ed)|writ(?:e|ten))\b/i.test(text)) families.push("file-write");
  if (fileTargets.length && /\b(?:contain(?:s|ed)?|inspect(?:ed)?|read|says?|show(?:s|ed)?)\b/i.test(text)) families.push("file-read");
  return [...new Set(families)];
}

/** Decide whether a tool belongs to one named evidence family. */
function isToolInEvidenceFamily(toolName, family) {
  return EVIDENCE_TOOL_FAMILIES[family]?.includes(toolName) === true;
}

module.exports = {
  EFFECT_CATEGORIES,
  EFFECTFUL_CATEGORIES,
  EVIDENCE_TOOL_FAMILIES,
  TOOL_EFFECTS,
  getToolEffect,
  isEffectfulTool,
  resolveToolResource,
  describeToolEffect,
  PRODUCED_EFFECT_ARGUMENT_PATHS,
  getProducedEffectValues,
  getCriterionEvidenceFamilies,
  getCriterionFileTargets,
  isToolInEvidenceFamily,
  listCoveredTools
};
