/**
 * Formats observable Agent-mode tool work into UI activity events.
 */

"use strict";

const path = require("node:path");
const { createCompletionEvidenceLedger } = require("./completion-evidence-ledger");

const MAX_RAW_DETAIL_CHARS = 3000;
const MAX_RAW_STRING_CHARS = 800;
const MAX_RAW_ARRAY_ITEMS = 25;
const MAX_DESCRIPTION_TEXT = 44;
const MUTATING_TOOLS = new Set(["apply_edit", "write_file", "create_document_tab"]);

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function getFileName(filePath) {
  return normalizePath(filePath).split("/").filter(Boolean).pop() || "file";
}

function truncateText(value, maxLength = MAX_RAW_DETAIL_CHARS) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...[truncated]` : text;
}

function summarizeRawObject(value) {
  if (!value || typeof value !== "object") return value;
  const summary = {};
  ["path", "name", "file", "fullPath", "line", "command", "pattern", "count", "matches", "changed", "ok"].forEach((key) => {
    if (value[key] !== undefined) summary[key] = value[key];
  });
  if (!Object.keys(summary).length) {
    const firstKey = Object.keys(value)[0];
    if (firstKey) summary[firstKey] = value[firstKey];
  }
  return summary;
}

function sanitizeRawValue(value, depth = 0) {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return truncateText(value, MAX_RAW_STRING_CHARS);
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_RAW_ARRAY_ITEMS).map((item) => sanitizeRawValue(depth > 1 ? summarizeRawObject(item) : item, depth + 1));
    if (value.length > MAX_RAW_ARRAY_ITEMS) items.push(`...${value.length - MAX_RAW_ARRAY_ITEMS} more item(s)`);
    return items;
  }
  if (typeof value === "object") {
    if (depth > 2) {
      const summary = summarizeRawObject(value);
      return Object.fromEntries(Object.entries(summary).map(([key, entry]) => {
        if (entry === null || typeof entry === "number" || typeof entry === "boolean") return [key, entry];
        if (typeof entry === "string") return [key, truncateText(entry, MAX_RAW_STRING_CHARS)];
        if (Array.isArray(entry)) return [key, `${entry.length} item(s)`];
        return [key, "[object]"];
      }));
    }
    const output = {};
    Object.entries(value).slice(0, MAX_RAW_ARRAY_ITEMS).forEach(([key, entry]) => {
      output[key] = sanitizeRawValue(entry, depth + 1);
    });
    return output;
  }
  return truncateText(String(value || ""));
}

function safeJson(value) {
  const sanitized = sanitizeRawValue(value);
  if (sanitized === undefined) return undefined;
  const serialized = JSON.stringify(sanitized);
  if (!serialized || serialized.length <= MAX_RAW_DETAIL_CHARS) return sanitized;
  return { summary: truncateText(serialized) };
}

function isShortInlineText(value) {
  const text = String(value || "").trim();
  return text && text.length <= MAX_DESCRIPTION_TEXT && !/[\r\n]/.test(text);
}

function createCodeSpan(value) {
  return `\`${String(value || "").replace(/`/g, "'")}\``;
}

function getToolPresentation(tool) {
  switch (tool) {
    case "list_files":
      return { icon: "bi-list-ul", title: "Listing workspace files" };
    case "glob":
      return { icon: "bi-folder2-open", title: "Finding files" };
    case "search_grep":
      return { icon: "bi-search", title: "Searching workspace" };
    case "read_file":
      return { icon: "bi-file-earmark-text", title: "Reading file" };
    case "get_workspace_state":
      return { icon: "bi-layout-text-window", title: "Reading workspace state" };
    case "read_active_document":
      return { icon: "bi-file-text", title: "Reading active document" };
    case "read_open_tabs":
      return { icon: "bi-window-stack", title: "Reading open tabs" };
    case "get_document_structure":
      return { icon: "bi-list-nested", title: "Reading document structure" };
    case "search_vault":
      return { icon: "bi-search", title: "Searching editor context" };
    case "get_link_context":
      return { icon: "bi-link-45deg", title: "Reading link context" };
    case "get_recent_activity":
      return { icon: "bi-clock-history", title: "Reading recent activity" };
    case "apply_edit":
      return { icon: "bi-pencil-square", title: "Editing file" };
    case "write_file":
      return { icon: "bi-file-earmark-plus", title: "Writing file" };
    case "run_test":
      return { icon: "bi-check2-square", title: "Running test command" };
    case "run_command":
      return { icon: "bi-terminal", title: "Running command" };
    case "git_panel_status":
      return { icon: "bi-git", title: "Reading Git status" };
    case "git_panel_branch_list":
      return { icon: "bi-diagram-3", title: "Reading Git branches" };
    case "git_panel_compare_file":
      return { icon: "bi-file-diff", title: "Reading Git comparison" };
    case "git_panel_changes_digest":
      return { icon: "bi-card-checklist", title: "Reading Git changes" };
    case "git_panel_pr_notes_context":
      return { icon: "bi-journal-text", title: "Preparing PR notes context" };
    case "git_panel_stage_files":
      return { icon: "bi-plus-square", title: "Staging files" };
    case "git_panel_unstage_files":
      return { icon: "bi-dash-square", title: "Unstaging files" };
    case "git_panel_commit":
      return { icon: "bi-check2-circle", title: "Creating Git commit" };
    case "git_panel_fetch":
      return { icon: "bi-cloud-download", title: "Fetching Git remotes" };
    case "git_panel_pull":
      return { icon: "bi-arrow-down-circle", title: "Pulling Git branch" };
    case "git_panel_push":
      return { icon: "bi-arrow-up-circle", title: "Pushing Git branch" };
    case "git_panel_create_branch":
      return { icon: "bi-diagram-2", title: "Creating Git branch" };
    case "git_panel_switch_branch":
      return { icon: "bi-arrow-left-right", title: "Switching Git branch" };
    case "get_conversion_export_state":
      return { icon: "bi-box-arrow-up", title: "Reading conversion/export state" };
    case "get_code_conversion_status":
      return { icon: "bi-hourglass-split", title: "Reading conversion status" };
    case "read_conversion_report":
      return { icon: "bi-file-earmark-bar-graph", title: "Reading conversion report" };
    case "export_active_document":
      return { icon: "bi-download", title: "Exporting active document" };
    case "export_active_folder_graph":
      return { icon: "bi-diagram-3", title: "Exporting folder graph" };
    case "start_code_conversion":
      return { icon: "bi-filetype-md", title: "Starting code converter" };
    default:
      return { icon: "bi-gear", title: tool || "Agent action" };
  }
}

function getPrimaryText(tool, args, input) {
  if (args.path || args.filePath) return normalizePath(args.path || args.filePath);
  if (Array.isArray(args.files) || Array.isArray(args.paths)) return (args.files || args.paths).map(normalizePath).filter(Boolean).slice(0, 3).join(", ");
  if (args.branch || args.remoteBranch) return String(args.branch || args.remoteBranch || "");
  if (args.message) return String(args.message || "").split(/\r?\n/)[0];
  if (args.pattern) return String(args.pattern || "");
  if (args.command) return String(args.command || "");
  return String(input || tool || "");
}

function getSecondaryText(tool, args) {
  if (tool === "read_file" && (args.startLine || args.endLine)) {
    return `Lines ${args.startLine || 1}-${args.endLine || "end"}`;
  }
  if (tool === "glob" && args.maxFiles) return `Limit ${args.maxFiles} files`;
  if ((tool === "search_grep" || tool === "search_vault") && (args.maxMatches || args.maxResults)) return `Limit ${args.maxMatches || args.maxResults} matches`;
  if (tool === "git_panel_compare_file" && args.scope) return String(args.scope || "");
  if ((tool === "git_panel_stage_files" || tool === "git_panel_unstage_files") && (args.files || args.paths)) return `${(args.files || args.paths || []).length} file(s)`;
  return "";
}

function getActivityLinks(root, tool, args, result) {
  const links = [];
  if (args.path || args.filePath) {
    links.push({ kind: "file", path: normalizePath(args.path || args.filePath), line: Number(args.startLine || 0) || undefined });
  }
  if (tool === "run_command" || tool === "run_test") {
    links.push({ kind: "folder", path: path.resolve(String(root || "")), label: "Workspace" });
  }
  if ((tool === "search_grep" || tool === "search_vault") && Array.isArray(result)) {
    result.slice(0, 8).forEach((match) => {
      if (match?.path) links.push({ kind: "file", path: normalizePath(match.path), line: Number(match.line || 0) || undefined });
    });
  }
  return links;
}

function describeToolChange(tool, args, beforeSnapshot) {
  if (tool === "write_file") {
    return beforeSnapshot?.exists === false ? "Added new file." : "Updated file contents.";
  }
  if (tool === "apply_edit") {
    if (isShortInlineText(args.search) && isShortInlineText(args.replacement)) {
      return `Replaced ${createCodeSpan(args.search)} with ${createCodeSpan(args.replacement)}.`;
    }
    return "Applied search/replace edit.";
  }
  return "Updated file.";
}

function describeAttemptedChange(tool, errorMessage) {
  const action = tool === "write_file"
    ? "Tried to write this file"
    : (tool === "create_document_tab" ? "Tried to create this document" : "Tried to edit this file");
  return `${action}, but it failed: ${String(errorMessage || "Unknown error")}`;
}

function createComparePayload(tool, args, beforeSnapshot, afterSnapshot) {
  const filePath = normalizePath(args.path);
  if (!filePath || !beforeSnapshot || !afterSnapshot) return null;
  if (beforeSnapshot.unavailable || afterSnapshot.unavailable) return null;
  return {
    path: filePath,
    name: getFileName(filePath),
    beforeName: `Before agent edit: ${getFileName(filePath)}`,
    afterName: `After agent edit: ${getFileName(filePath)}`,
    beforeContent: beforeSnapshot.exists === false ? "" : String(beforeSnapshot.content || ""),
    afterContent: String(afterSnapshot.content || "")
  };
}

/**
 * Create request-scoped activity, mutation, and completion-evidence tracking.
 * @param {string} root Workspace root for snapshots and file comparisons.
 * @param {object} tools Canonical workspace tool implementation.
 * @param {{observeToolEvidence?: Function}} [options] Optional fail-open evidence observer.
 * @returns {object} Activity-run recording API.
 */
function createActivityRun(root, tools, options = {}) {
  const startedAt = Date.now();
  const beforeSnapshots = new Map();
  const changedFiles = new Map();
  const attemptedChanges = new Map();
  const blockedChanges = new Map();
  const completionEvidence = createCompletionEvidenceLedger();
  const observedEvidenceIds = new Set();
  let completionAssessment = null;

  function rememberAttemptedChange(tool, args, errorMessage) {
    const filePath = normalizePath(args.path);
    if (!MUTATING_TOOLS.has(tool) || !filePath) return null;
    const existing = attemptedChanges.get(filePath);
    const descriptions = new Set(existing?.descriptions || []);
    descriptions.add(describeAttemptedChange(tool, errorMessage));
    const attempted = {
      path: filePath,
      name: getFileName(filePath),
      icon: tool === "write_file" ? "bi-file-earmark-plus" : "bi-pencil-square",
      descriptions: Array.from(descriptions)
    };
    attemptedChanges.set(filePath, attempted);
    return attempted;
  }

  /**
   * Group a proposal rejected before underlying mutation dispatch.
   * @param {string} tool - Proposed mutation tool.
   * @param {object} args - Proposed tool arguments.
   * @param {object} failure - Structured pre-execution failure.
   * @returns {object} Updated blocker group.
   */
  function recordBlockedChange(tool, args, failure = {}) {
    const details = failure.error && typeof failure.error === "object" ? failure.error : failure;
    const code = String(details.code || failure.code || "mutation-blocked");
    const decisionId = String(details.decisionId || "");
    const capability = String(details.capability || "");
    const key = [code, decisionId, capability].join(":");
    const group = blockedChanges.get(key) || { code, decisionId, capability, count: 0, items: [] };
    group.count += 1;
    group.items.push({
      tool: String(tool || ""),
      path: normalizePath(details.resource || args?.path || ""),
      reason: String(details.message || failure.message || failure.error || code)
    });
    blockedChanges.set(key, group);
    return group;
  }

  async function captureBefore(tool, args, signal) {
    const filePath = normalizePath(args.path);
    if (!MUTATING_TOOLS.has(tool) || !filePath || beforeSnapshots.has(filePath)) return beforeSnapshots.get(filePath) || null;
    const snapshot = await tools.readTextFileSnapshot(root, filePath, { signal }).catch((error) => ({
      path: filePath,
      exists: false,
      unavailable: true,
      unavailableReason: error?.message || String(error)
    }));
    beforeSnapshots.set(filePath, snapshot);
    return snapshot;
  }

  async function completeMutation(tool, args, signal) {
    const filePath = normalizePath(args.path);
    if (!MUTATING_TOOLS.has(tool) || !filePath) return null;
    const beforeSnapshot = beforeSnapshots.get(filePath) || await captureBefore(tool, args, signal);
    const afterSnapshot = await tools.readTextFileSnapshot(root, filePath, { signal }).catch((error) => ({
      path: filePath,
      exists: true,
      unavailable: true,
      unavailableReason: error?.message || String(error)
    }));
    const description = describeToolChange(tool, args, beforeSnapshot);
    const compare = createComparePayload(tool, args, beforeSnapshot, afterSnapshot);
    const existing = changedFiles.get(filePath);
    const descriptions = new Set(existing?.descriptions || []);
    descriptions.add(description);
    changedFiles.set(filePath, {
      path: filePath,
      name: getFileName(filePath),
      icon: tool === "write_file" && beforeSnapshot?.exists === false ? "bi-file-earmark-plus" : "bi-file-earmark-code",
      descriptions: Array.from(descriptions),
      compare: compare || existing?.compare || null
    });
    attemptedChanges.delete(filePath);
    return { description, compare };
  }

  function createStartedActivity(id, tool, args, input) {
    const presentation = getToolPresentation(tool);
    return {
      id,
      tool,
      status: "running",
      icon: presentation.icon,
      title: presentation.title,
      primaryText: getPrimaryText(tool, args, input),
      secondaryText: getSecondaryText(tool, args),
      startedAt: Date.now(),
      links: getActivityLinks(root, tool, args),
      raw: { args: safeJson(args) }
    };
  }

  function createFinishedActivity(startedActivity, args, result, summary, mutationDetails) {
    return {
      ...startedActivity,
      status: "completed",
      endedAt: Date.now(),
      durationMs: Date.now() - Number(startedActivity.startedAt || Date.now()),
      resultSummary: summary || "",
      links: getActivityLinks(root, startedActivity.tool, args, result),
      compare: mutationDetails?.compare || null,
      changeDescription: mutationDetails?.description || "",
      raw: {
        args: safeJson(args),
        result: safeJson(result)
      }
    };
  }

  function createFailedActivity(startedActivity, args, errorMessage, failure = null) {
    const isBlocked = failure?.preExecution === true || failure?.error?.preExecution === true || failure?.executed === false;
    const blocked = isBlocked ? recordBlockedChange(startedActivity.tool, args, failure) : null;
    const attempted = isBlocked ? null : rememberAttemptedChange(startedActivity.tool, args, errorMessage);
    return {
      ...startedActivity,
      status: "failed",
      endedAt: Date.now(),
      durationMs: Date.now() - Number(startedActivity.startedAt || Date.now()),
      resultSummary: errorMessage,
      attemptedChange: attempted ? {
        path: attempted.path,
        name: attempted.name,
        icon: attempted.icon,
        description: attempted.descriptions.join(" ")
      } : null,
      blockedChange: blocked ? {
        code: blocked.code,
        decisionId: blocked.decisionId,
        capability: blocked.capability,
        count: blocked.count
      } : null,
      raw: {
        args: safeJson(args),
        error: errorMessage
      }
    };
  }

  function createSummary(finalContent = "") {
    const files = Array.from(changedFiles.values()).map((file) => ({
      path: file.path,
      name: file.name,
      icon: file.icon,
      description: file.descriptions.join(" "),
      compare: file.compare || null
    }));
    const attempted = Array.from(attemptedChanges.values()).map((file) => ({
      path: file.path,
      name: file.name,
      icon: file.icon,
      description: file.descriptions.join(" ")
    }));
    const blocked = Array.from(blockedChanges.values()).map((group) => ({
      code: group.code,
      decisionId: group.decisionId,
      capability: group.capability,
      count: group.count,
      items: group.items.map((item) => ({ ...item }))
    }));
    const finalResponse = String(finalContent || "").trim();
    return {
      type: "agent-summary",
      elapsedMs: Date.now() - startedAt,
      outcome: files.length
        ? "Completed the requested workspace changes."
        : attempted.length
          ? "The agent inspected the workspace and attempted changes, but no file edits were applied."
          : blocked.length
            ? `No changes were applied; ${blocked.reduce((total, group) => total + group.count, 0)} proposed mutation(s) were blocked.`
          : (finalResponse.split(/\n+/)[0] || "Completed the agent run."),
      finalResponse,
      changedFiles: files,
      attemptedChanges: attempted,
      blockedChanges: blocked,
      notes: [],
      validation: [],
      evidenceLedger: completionEvidence.listEvidence(),
      completionAssessment
    };
  }

  function recordToolEvidence(details) {
    const entry = completionEvidence.recordToolEvidence(details);
    if (entry?.id && !observedEvidenceIds.has(entry.id) && typeof options.observeToolEvidence === "function") {
      observedEvidenceIds.add(entry.id);
      try {
        options.observeToolEvidence({ ...details, evidenceEntry: entry });
      } catch (_error) {
        // Observation is deliberately fail-open and cannot change the existing activity flow.
      }
    }
    return entry;
  }

  function recordCandidateEvidence(candidate) {
    return completionEvidence.recordCandidateEvidence(candidate);
  }

  function listEvidence() {
    return completionEvidence.listEvidence();
  }

  function setCompletionAssessment(assessment) {
    completionAssessment = assessment ? { ...assessment } : null;
  }

  return {
    captureBefore,
    completeMutation,
    createStartedActivity,
    createFinishedActivity,
    createFailedActivity,
    recordBlockedChange,
    createSummary,
    recordToolEvidence,
    recordCandidateEvidence,
    listEvidence,
    setCompletionAssessment
  };
}

module.exports = {
  createActivityRun
};
