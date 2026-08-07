/**
 * Iterative agent tool loop for workspace-aware AI Companion modes.
 * Emits panel events per round: context, reasoning, narration, tool activity.
 */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { observeWorkspacePath } = require("./agent-action-recovery-policy");
const { fingerprint } = require("./companion-checkpoint-schema");
const tools = require("../tools/workspace-tools");
const { canonicalizeEditSearch } = require("../tools/workspace-edit-matcher");
const correctionConsistency = require("./intent-correction-consistency");
const toolEffectRegistry = require("./agent-tool-effect-registry");
const toolScopeRegistry = require("./tool-scope-registry");
const { resolveTaskProfile } = require("./task-routing");
const { parseExplicitPreferenceTargets, deriveTaskObservation } = require("./task-preference-bridge");
const { createTaskState } = require("./task-observation-projection");
const { evaluateCompletionEvidence, buildEvidenceSteeringMessage } = require("./completion-evidence-gate");
const { DEFAULT_AI_COMPANION_PROMPTS } = require("../config/prompts");
const { createActivityRun } = require("./agent-activity");
const { analyzeApprovalAction } = require("./approval-action-analysis");
const { createApprovalFileCompare } = require("./approval-file-compare");
const { createResumeAction, createResumeContextMessage, validateResumeCheckpoint } = require("./interrupted-task-resume");
const { validateApprovalIntent } = require("./approval-intent-validation");
const approvalCapabilities = require("./approval-capability-registry");
const { ApprovalGrantStore } = require("./approval-grant-store");
const approvalPolicy = require("./agent-approval-policy");
const { classifyCommand } = require("../security/command-suggestion");
const { createNarrationFilter } = require("./narration-filter");
const { createProviderDebugEmitter } = require("./provider-debug");
const intentContract = require("./intent-contract");
const intentAnalysis = require("./intent-analysis");
const intentClarification = require("./intent-clarification");
const { evaluateMutationControl } = require("./intent-mutation-control");
const {
  applyApprovalAmendment,
  applyScopedBlock,
  getUnappliedApprovalAmendments,
  recoverUnappliedApprovalAmendments
} = require("./intent-amendment");
const intentConflict = require("./intent-conflict");
const completionAssessment = require("./completion-assessment");
const completionEvidence = require("./completion-evidence-ledger");
const completionResponseRewrite = require("./completion-response-rewrite");
const completionSteering = require("./completion-steering");
const { createAgentCompletionOrchestrator } = require("./agent-completion-orchestrator");
const { composeFinalResponse } = require("./agent-final-response-composer");
const { createAgentProgressEvaluator } = require("./agent-progress-evaluator");
const { resolveModePolicy } = require("./companion-mode-policy");
const { classifyDeterministicProgress } = require("./agent-progress-policy");
const { compareApproachText, createActionSignature, createStrategyDescriptor } = require("./agent-strategy-signature");
const planFinalization = require("./plan-finalization");
const { createIntentEvaluationTracker } = require("./intent-evaluation");
const intentExperiment = require("../../js/ai-companion/intent-experiment");

const MAX_TOOL_RESULT_CHARS = 12000;
const MAX_PREFERENCE_TOOL_RESULT_CHARS = 96 * 1024;
const TOOL_FAILURE_EVIDENCE_INSTRUCTION = [
  "Failed tool results are not evidence for a value, absence, count, or conclusion.",
  "Do not guess, extrapolate, or invent keys from data a tool did not return.",
  "For partial results, use only the returned entries and do not treat omitted entries as evidence.",
  "Follow pagination, narrow the request, or report that the information could not be verified.",
  "Do not repeat an unchanged operation marked non-retryable; retry size failures at most once with a smaller page, shallower depth, or narrower path."
].join(" ");
const DEFAULT_LIST_FILES_TOOL_MAX_FILES = 160;
const MAX_APPROVAL_PREVIEW_CHARS = 1600;
const MAX_ACTIVE_FILE_CHARS = 20000;
const MAX_ATTACHMENT_FILE_CHARS = 12000;
const MAX_ATTACHMENT_TOTAL_CHARS = 32000;
const MAX_CONVERSATION_HISTORY_MESSAGES = 24;
const MAX_CONVERSATION_HISTORY_MESSAGE_CHARS = 4000;
const TASK_LIMIT_TOOL_NAME = "task_limit";
const APPROVAL_REASON_PROPERTY = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 160,
  pattern: "^[^\\r\\n]+$",
  description: "One short sentence stating why this exact action is needed and its user-visible outcome. Do not mention tools, commands, permissions, restrictions, or alternatives."
});
const PREFERENCE_MUTATION_TOOL_NAMES = new Set(["preferences_update", "preferences_reset", "preferences_import"]);
const CHAT_TITLE_RESPONSE_PROMPT = [
  "Conversation title: in your first assistant message only, include <chat_title>Three to five words</chat_title> before any other content.",
  "Use 3-5 words, no quotes, naming the user's current request.",
  "If you need tool calls, include the title in the same assistant message content alongside those tool calls."
].join(" ");
// Appended to the system prompt for modes that surface narration (chat/agent).
// Asks the model for short, conclusion-first preambles alongside tool calls;
// the narration filter drops whatever still comes out repetitive or empty.
const NARRATION_PROMPT_RULES = [
  "Narration: before each tool call, write 1-3 plain sentences in the message content stating what you just learned, what you will do next, and why.",
  "State conclusions, not process — \"I found the cause: X, so I'll patch Y\", never filler like \"Let me look around\".",
  "When several similar calls follow one announcement, narrate once for the whole batch, not per call.",
  "Never repeat or rephrase earlier narration; if there is nothing new to report, emit no narration text.",
  "Before an action that needs user approval, use the narration to explain why the action is needed."
].join(" ");
const TOKEN_LIMIT_WINDOW_MS = 60000;
const DEFAULT_MAX_TOKENS_PER_CHAT_MINUTE = 0;
const DEFAULT_MAX_TASKS_PER_CHAT = 30;
const COMPACTED_TOOL_RESULT_CHARS = 1200;
const EMPTY_FILE_SEARCH_TOOLS = new Set(["glob", "list_files", "search_text", "search_vault", "read_open_tabs"]);
let agentDecisionController = null;

function loadAgentDecisionController() {
  if (!agentDecisionController) agentDecisionController = require("./agent-decision-controller");
  return agentDecisionController;
}

function truncateText(value, maxLength = MAX_TOOL_RESULT_CHARS) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n...[truncated]` : text;
}

function parseToolArguments(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  return JSON.parse(String(value));
}

function stringifyToolResult(value, maxLength = MAX_TOOL_RESULT_CHARS, space = 2) {
  const text = JSON.stringify(value, null, space);
  if (typeof text !== "string") return "";
  if (text.length <= maxLength) return text;
  return JSON.stringify({
    truncated: true,
    content: truncateText(text, maxLength - 200)
  }, null, 2);
}

function promptMentionsLikelyFile(value) {
  return /(?:^|[\\/\s"'`])[^\s"'`<>:]+\.[A-Za-z0-9]{1,8}\b/.test(String(value || ""));
}

function getToolResultItems(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.results)) return result.results;
  if (Array.isArray(result?.tabs)) return result.tabs;
  if (Array.isArray(result?.items)) return result.items;
  return null;
}

function isEmptyFileSearchResult(name, result) {
  if (!EMPTY_FILE_SEARCH_TOOLS.has(name)) return false;
  const items = getToolResultItems(result);
  return Array.isArray(items) && items.length === 0;
}

function createEmptyFileSearchGuidance(name, args = {}) {
  const target = args?.pattern || args?.query || "the requested file";
  return [
    `${name} returned no matches for ${JSON.stringify(target)}.`,
    "Treat this as an empty result, not as file content.",
    "Do not answer from conversation history as if the file was inspected.",
    "Next, inspect open tabs with read_open_tabs if you have not already, then try a broader filename glob such as **/<fileName>, then search_text for the class or filename before answering."
  ].join(" ");
}

function createToolResultContent(name, args, result) {
  if (!isEmptyFileSearchResult(name, result)) return result;
  return {
    empty: true,
    tool: name,
    input: args || {},
    result,
    guidance: createEmptyFileSearchGuidance(name, args)
  };
}

function getGlobFallbackPattern(pattern) {
  const text = String(pattern || "").replace(/\\/g, "/");
  const parts = text.split("/").filter(Boolean);
  const fileName = parts[parts.length - 1] || "";
  if (!fileName || !fileName.includes(".")) return "";
  if (fileName.includes("*")) return "";
  const fallback = `**/${fileName}`;
  return text === fallback ? "" : fallback;
}

function createLocalToolCall(name, args, round, suffix = "fallback") {
  const id = `call_${name}_${round}_${suffix}`;
  return {
    id,
    harnessGenerated: true,
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(args || {})
    },
    raw: {
      id,
      type: "function",
      function: {
        name,
        arguments: JSON.stringify(args || {})
      }
    }
  };
}

function createFileSearchFallbackToolCall(name, args, result, round) {
  if (name !== "glob" || !isEmptyFileSearchResult(name, result)) return null;
  const pattern = getGlobFallbackPattern(args?.pattern);
  if (!pattern) return null;
  return createLocalToolCall("glob", { pattern, maxFiles: args?.maxFiles || 20 }, round, "filename");
}

function summarizeToolResult(name, result) {
  if (Array.isArray(result)) return `${result.length} item(s)`;
  if (result?.executed === false) return result.code === "FREE_FORM_COMMAND_NOT_PERMITTED"
    ? "Not executed — blocked by policy"
    : `Not executed — ${result.message || result.code || "blocked by policy"}`;
  if (name === "read_file") return `${result.startLine}-${result.endLine}`;
  if (name === "get_workspace_state") return "workspace state";
  if (name === "read_active_document") return "active document";
  if (name === "read_open_tabs") return `${result?.tabs?.length || 0} tab(s)`;
  if (name === "get_document_structure") return `${result?.structure?.headings?.length || 0} heading(s)`;
  if (name === "search_vault") return `${Array.isArray(result) ? result.length : 0} result(s)`;
  if (name === "get_link_context") return `${result?.outgoingLinks?.length || 0} link(s)`;
  if (name === "get_recent_activity") return `${result?.items?.length || 0} item(s)`;
  if (name === "graph_get_state") return `${result?.graphTabs?.length || 0} graph tab(s)`;
  if (name === "graph_search_nodes") return `${result?.results?.length || 0} node(s)`;
  if (name === "graph_get_node_context") return result?.node?.label || result?.node?.nodeId || "node context";
  if (name === "graph_find_paths") return `${result?.paths?.length || 0} path(s)`;
  if (tools.isGraphActionTool?.(name)) return "graph action complete";
  if (name === "git_status") {
    if (result?.status === "failed") return result?.error?.message || "Git status failed";
    return result?.isRepo === false ? "not a git repository" : `${result?.counts?.files ?? result?.status?.files?.length ?? 0} changed file(s)`;
  }
  if (name === "git_branches") return `${result?.branches?.length || 0} branch(es)`;
  if (name === "git_diff") return "comparison ready";
  if (name === "git_changes_digest") return result?.digest?.clean ? "working tree clean" : "changes digest ready";
  if (name === "git_pr_notes") return "PR notes context ready";
  if (tools.isGitPanelMutatingTool?.(name)) return result?.status ? `${result.status.files?.length || 0} changed file(s)` : "git action complete";
  if (name === "preferences_get") {
    const suffix = result?.status === "partial" ? `, ${result?.errors?.length || 0} unavailable` : "";
    return `${result?.entries?.length ?? result?.preferences?.length ?? 0} preference(s)${suffix}`;
  }
  if (name === "preferences_search") {
    const suffix = result?.status === "partial" ? `, ${result?.errors?.length || 0} unavailable` : "";
    return `${result?.entries?.length ?? result?.results?.length ?? 0} preference(s)${suffix}`;
  }
  if (name === "preferences_export") {
    if (result?.status === "failed") return "settings export failed";
    return result?.status === "partial"
      ? `partial settings export page (${result?.errors?.length || 0} unavailable)`
      : `settings export page (${result?.entries?.length || 0} entries)`;
  }
  if (name === "preferences_update" || name === "preferences_reset" || name === "preferences_import") return result?.changed ? `${result?.changes?.filter?.((change) => change.changed !== false).length || 0} setting change(s)` : "no settings changes";
  if (name === "get_conversion_export_state") return "conversion/export state";
  if (name === "get_code_conversion_status") return result?.running ? "conversion running" : (result?.state || "conversion status");
  if (name === "read_conversion_report") return result?.found ? "conversion report" : "report not found";
  if (tools.isConversionExportActionTool?.(name)) return result?.state || result?.format || "conversion/export action complete";
  if (result?.changed) return "changed";
  if (result?.stdout || result?.stderr) return `stdout ${String(result.stdout || "").length} chars, stderr ${String(result.stderr || "").length} chars`;
  return "done";
}

/**
 * Extract a citable content excerpt from a content-bearing tool result. The completion
 * verifier quotes from the evidence summary, so a comparison/read/search must surface real
 * content (a diff, a doc excerpt, matched lines) -- not the short UI label. Returns "" for
 * tools whose result has no citable content.
 */
function extractEvidenceContent(name, result) {
  if (!result || typeof result !== "object") return "";
  const firstString = (...keys) => {
    for (const key of keys) {
      const value = result[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  };
  const boundedJson = (value) => {
    if (value == null) return "";
    try {
      const json = JSON.stringify(value);
      if (!json || ["{}", "[]", "null", '""'].includes(json)) return "";
      return json.slice(0, 1000);
    } catch (_error) { return ""; }
  };
  if (name === "read_file" || name === "read_active_document") {
    return firstString("content", "text", "body", "excerpt") || boundedJson(result.lines);
  }
  if (name === "git_diff") {
    return firstString("diff", "patch", "unified", "comparison", "content")
      || boundedJson(result.hunks || result.changes || result.left || result);
  }
  if (name === "git_changes_digest") {
    return firstString("text", "summary") || boundedJson(result.digest || result.files || result);
  }
  if (name === "search_text" || name === "search_workspace" || name === "search_vault") {
    return boundedJson(result.matches || result.results || result);
  }
  return "";
}

/**
 * Evidence summary for the completion ledger. Prefers real content for content-bearing
 * tools (so comparisons can be verified on their substance) and otherwise falls back to the
 * short UI summary. Distinct from summarizeToolResult, which stays terse for the UI.
 */
function summarizeToolEvidence(name, result) {
  return extractEvidenceContent(name, result) || summarizeToolResult(name, result);
}

function getApiClientToolDefinitions() {
  const stringProperty = (description) => ({ type: "string", description });
  const requestProperties = {
    name: stringProperty("Saved request name."),
    method: stringProperty("HTTP method."),
    url: stringProperty("HTTP or HTTPS URL, with optional {{variables}}."),
    paramsText: stringProperty("One query parameter per line."),
    headersText: stringProperty("One request header per line."),
    bodyMode: stringProperty("none, raw, or form-data."),
    bodyText: stringProperty("Raw request body."),
    formDataText: stringProperty("One form field per line.")
  };
  return [
    { type: "function", function: { name: "api_asset_search", description: "Search API Client saved requests, folders, environments, mocks, and local OpenAPI/Swagger spec files.", parameters: { type: "object", properties: { query: stringProperty("Search text."), type: stringProperty("Optional asset type filter."), maxResults: { type: "number", description: "Maximum assets to return." } } } } },
    { type: "function", function: { name: "api_asset_get", description: "Fetch one API asset by id returned from api_asset_search.", parameters: { type: "object", required: ["id"], properties: { id: stringProperty("Asset id such as request:..., environment:..., spec:..., or mock:..."), maxChars: { type: "number", description: "Maximum spec characters to return." } } } } },
    { type: "function", function: { name: "request_create", description: "Create a saved API Client request.", parameters: { type: "object", properties: { parentId: stringProperty("Optional saved folder id or folder: asset id returned from api_asset_search."), request: { type: "object", properties: requestProperties }, ...requestProperties } } } },
    { type: "function", function: { name: "request_update", description: "Update a saved API Client request by id with a targeted patch.", parameters: { type: "object", required: ["requestId"], properties: { requestId: stringProperty("Saved request id."), patch: { type: "object", properties: requestProperties } } } } },
    { type: "function", function: { name: "request_send", description: "Send a saved or inline API Client request using resolved environment variables.", parameters: { type: "object", properties: { requestId: stringProperty("Optional saved request id."), environmentId: stringProperty("Optional environment id."), request: { type: "object", properties: requestProperties } } } } },
    { type: "function", function: { name: "request_history_get", description: "Read compact redacted recent API Client request history.", parameters: { type: "object", properties: { maxEntries: { type: "number", description: "Maximum history entries." } } } } },
    { type: "function", function: { name: "response_analyze", description: "Analyze an API response or latest history response for likely cause and next action.", parameters: { type: "object", properties: { response: { type: "object", description: "Response object with statusCode, headers, and body." } } } } },
    { type: "function", function: { name: "environment_get", description: "Read API Client environments with secret values masked.", parameters: { type: "object", properties: { environmentId: stringProperty("Optional environment id."), includeValues: { type: "boolean", description: "Return safe non-secret values when available." } } } } },
    { type: "function", function: { name: "environment_update", description: "Replace globals or one environment variable list.", parameters: { type: "object", required: ["variables"], properties: { scope: stringProperty("Use globals to update global variables."), environmentId: stringProperty("Environment id when updating environment variables."), variables: { type: "array", items: { type: "object" } } } } } },
    { type: "function", function: { name: "environment_resolve", description: "Resolve {{variables}} in text or request fields and return redacted output plus missing variables.", parameters: { type: "object", properties: { environmentId: stringProperty("Optional environment id."), text: stringProperty("Text containing variables."), request: { type: "object", properties: requestProperties } } } } },
    { type: "function", function: { name: "secret_redact", description: "Redact API keys, tokens, credentials, and PII from text or structured content.", parameters: { type: "object", properties: { text: stringProperty("Text to redact."), value: { type: "object", description: "Structured value to redact." } } } } },
    { type: "function", function: { name: "mock_create", description: "Create a lightweight saved mock route.", parameters: { type: "object", properties: { name: stringProperty("Mock name."), method: stringProperty("HTTP method."), path: stringProperty("Mock path."), statusCode: { type: "number", description: "HTTP status code." }, headers: { type: "object", description: "Response headers." }, body: stringProperty("Response body.") } } } },
    { type: "function", function: { name: "mock_update", description: "Update a lightweight saved mock route.", parameters: { type: "object", required: ["mockId"], properties: { mockId: stringProperty("Mock id."), patch: { type: "object", description: "Fields to update." } } } } },
    { type: "function", function: { name: "mock_call", description: "Call a lightweight saved mock route by id or method/path.", parameters: { type: "object", properties: { mockId: stringProperty("Mock id."), method: stringProperty("HTTP method."), path: stringProperty("Mock path.") } } } }
  ];
}
function getPlanRepositoryToolDefinitions() {
  const stringProperty = (description) => ({ type: "string", description });
  const planLocatorProperties = {
    id: stringProperty("Saved plan id."),
    path: stringProperty("Profile-relative saved plan path.")
  };
  return [
    { type: "function", function: { name: "plan_create", description: "Create a saved implementation plan Markdown file in the AI Companion profile plan repository.", parameters: { type: "object", properties: { title: stringProperty("Plan title."), body: stringProperty("Markdown plan body."), content: stringProperty("Markdown plan body."), status: stringProperty("planned, implementing, or implemented."), archived: { type: "boolean", description: "Whether the plan is archived." }, workspaceRoot: stringProperty("Workspace root this plan belongs to."), sourceChatId: stringProperty("Optional source chat id."), sourceTaskId: stringProperty("Optional source task id."), milestones: { type: "array", items: { type: "object" } } } } } },
    { type: "function", function: { name: "plan_list", description: "List saved implementation plans from the AI Companion profile plan repository.", parameters: { type: "object", properties: { status: stringProperty("Optional plan status filter."), query: stringProperty("Optional title, path, or body search text."), workspaceRoot: stringProperty("Optional workspace root filter."), maxResults: { type: "number", description: "Maximum plans to return." } } } } },
    { type: "function", function: { name: "plan_read", description: "Read one saved implementation plan by id or profile-relative path.", parameters: { type: "object", properties: planLocatorProperties } } },
    { type: "function", function: { name: "plan_update", description: "Update one saved implementation plan body, frontmatter, and/or status while preserving its id and file path.", parameters: { type: "object", properties: { ...planLocatorProperties, title: stringProperty("Updated plan title."), body: stringProperty("Updated Markdown plan body."), content: stringProperty("Updated Markdown plan body."), patch: { type: "object", description: "Frontmatter fields to update." }, milestones: { type: "array", items: { type: "object" } }, status: stringProperty("Optional: planned, implementing, implemented, or legacy archived."), archived: { type: "boolean", description: "Optional: archive or unarchive the plan without changing implementation status." } } } } },
    { type: "function", function: { name: "plan_update_status", description: "Update one saved implementation plan status.", parameters: { type: "object", properties: { ...planLocatorProperties, status: stringProperty("planned, implementing, implemented, or legacy archived."), archived: { type: "boolean", description: "Archive or unarchive the plan without changing implementation status." } } } } },
    { type: "function", function: { name: "plan_rebuild_index", description: "Rebuild the saved implementation plans index by scanning plan Markdown files.", parameters: { type: "object", properties: {} } } }
  ];
}
function getEditorReadToolDefinitions() {
  const stringProperty = (description) => ({ type: "string", description });
  return [
    { type: "function", function: { name: "get_workspace_state", description: "Read current md-editor workspace state: active tab, counts, mode, and optional open-tab summaries.", parameters: { type: "object", properties: { includeTabs: { type: "boolean", description: "Include compact open-tab summaries." } } } } },
    { type: "function", function: { name: "read_active_document", description: "Read the live active editor document, including unsaved content from the editor buffer.", parameters: { type: "object", properties: { includeContent: { type: "boolean", description: "Include active document content. Defaults to true." }, includeSelection: { type: "boolean", description: "Include current selection metadata. Defaults to true." }, maxChars: { type: "number", description: "Maximum content characters to return." } } } } },
    { type: "function", function: { name: "read_open_tabs", description: "Read metadata and optional live content for open md-editor tabs.", parameters: { type: "object", properties: { includeContent: { type: "boolean", description: "Include editable tab content." }, maxTabs: { type: "number", description: "Maximum tabs to return." }, maxCharsPerTab: { type: "number", description: "Maximum content characters per tab." } } } } },
    { type: "function", function: { name: "get_document_structure", description: "Parse headings, links, tags, tasks, code blocks, frontmatter presence, and counts for the active document or an open tab.", parameters: { type: "object", properties: { source: stringProperty("active or tab. Defaults to active."), tabId: stringProperty("Open tab id when source is tab."), maxItems: { type: "number", description: "Maximum items per structure category." } } } } },
    { type: "function", function: { name: "search_vault", description: "Search live open tabs or saved workspace files.", parameters: { type: "object", required: ["query"], properties: { query: stringProperty("Search text."), scope: stringProperty("open-tabs for live buffers or workspace for disk-backed search. Defaults to open-tabs."), maxResults: { type: "number", description: "Maximum matches to return." } } } } },
    { type: "function", function: { name: "get_link_context", description: "Read outgoing links, likely backlinks, unresolved links, and matching graph metadata for a document.", parameters: { type: "object", properties: { source: stringProperty("active or tab. Defaults to active."), tabId: stringProperty("Open tab id when source is tab."), path: stringProperty("Optional document path to match."), maxResults: { type: "number", description: "Maximum links or backlinks to return." } } } } },
    { type: "function", function: { name: "get_recent_activity", description: "Read recent context available in the current editor session.", parameters: { type: "object", properties: { maxItems: { type: "number", description: "Maximum recent items to return." } } } } }
  ];
}
function getPreferenceReadToolDefinitions() {
  const stringProperty = (description) => ({ type: "string", description });
  const boundedReadProperties = {
    path: { type: "array", items: { type: "string" }, description: "Optional hierarchical preference path. Object paths return bounded immediate children." },
    category: stringProperty("Optional settings category such as editor, graph, ai-companion, themes, or confirmations."),
    valueType: { type: "string", enum: ["boolean", "string", "number", "array", "object", "null"], description: "Optional generic value-type filter." },
    maxEntries: { type: "number", description: "Maximum entries for this page. Defaults to 25; maximum 100." },
    maxDepth: { type: "number", description: "Maximum hierarchy depth to inspect. Defaults to 1; maximum 4." },
    cursor: stringProperty("Opaque continuation cursor returned by the preceding call with unchanged filters."),
    includeDefaults: { type: "boolean", description: "Include default leaf values. Defaults to true." },
    redactSecrets: { type: "boolean", description: "Secret-like values are always redacted. This compatibility option defaults to true." }
  };
  return [
    { type: "function", function: { name: "preferences_get", description: "Read one bounded page of preference leaves or immediate object children. Follow page.nextCursor for more data; failed or partial results do not establish omitted values.", parameters: { type: "object", properties: { keys: { type: "array", items: { type: "string" }, description: "Backward-compatible exact top-level or one-level nested keys." }, ...boundedReadProperties } } } },
    { type: "function", function: { name: "preferences_search", description: "Search bounded preference descriptor pages by path, label, category, or generic value type. Follow page.nextCursor without changing filters.", parameters: { type: "object", required: ["query"], properties: { query: stringProperty("Search text."), maxResults: { type: "number", description: "Backward-compatible alias for maxEntries." }, ...boundedReadProperties } } } },
    { type: "function", function: { name: "preferences_export", description: "Read a bounded settings-export manifest page for review. Follow page.nextCursor; the application UI's complete export is separate.", parameters: { type: "object", properties: boundedReadProperties } } }
  ];
}

function getPreferenceMutationToolDefinitions() {
  const stringProperty = (description) => ({ type: "string", description });
  return [
    { type: "function", function: { name: "preferences_update", description: "Update one or more known md-editor preference keys after explicit user approval. Each key MUST be the full dotted path, not a bare name: nested settings use \"<group>.<key>\" (e.g. \"aiCompanionSettings.chatStatefulControllerEnabled\"), not \"chatStatefulControllerEnabled\". If unsure of the exact path, call preferences_search first. A key that does not resolve is not applied; the result returns an `unresolved` list with a suggested full path — re-call with that path to apply.", parameters: { type: "object", required: ["changes"], properties: { changes: { type: "array", items: { type: "object", properties: { key: stringProperty("Full preference path, e.g. \"aiCompanionSettings.chatVerifierCompletionEnabled\" (top-level or one-level nested; not a bare child name)."), value: { description: "New JSON value for the preference." } } } } } } } },
    { type: "function", function: { name: "preferences_reset", description: "Reset one or more known md-editor preference keys to defaults after explicit user approval.", parameters: { type: "object", required: ["keys"], properties: { keys: { type: "array", items: { type: "string" }, description: "Known preference keys to reset." } } } } },
    { type: "function", function: { name: "preferences_import", description: "Preview or apply pasted md-editor settings JSON. Applying requires explicit user approval.", parameters: { type: "object", required: ["text"], properties: { text: stringProperty("JSON text from a previous md-editor settings export."), apply: { type: "boolean", description: "When true, apply the import after approval. Otherwise preview only." } } } } }
  ];
}
function getConversionExportReadToolDefinitions() {
  const stringProperty = (description) => ({ type: "string", description });
  return [
    { type: "function", function: { name: "get_conversion_export_state", description: "Read current md-editor conversion and export availability, active document export state, active folder graph export state, and code converter settings/status.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "get_code_conversion_status", description: "Read the live code converter task state, progress, source root, destination root, and latest status text.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "read_conversion_report", description: "Read .md-editor/missing_dependencies_report.json and optionally the Markdown report from a workspace-relative generated Markdown destination.", parameters: { type: "object", properties: { destinationRoot: stringProperty("Workspace-relative generated Markdown destination. Defaults to the workspace root."), path: stringProperty("Alias for destinationRoot."), includeMarkdown: { type: "boolean", description: "Include missing_dependencies_report.md text." }, maxChars: { type: "number", description: "Maximum report text characters to return." } } } } }
  ];
}

function getConversionExportActionToolDefinitions() {
  const stringProperty = (description) => ({ type: "string", description });
  return [
    { type: "function", function: { name: "export_active_document", description: "Export the active editable document using md-editor's existing Markdown, HTML, or PDF export flow after approval.", parameters: { type: "object", required: ["format"], properties: { format: stringProperty("markdown, html, or pdf."), fileName: stringProperty("Optional suggested file name for Markdown export.") } } } },
    { type: "function", function: { name: "export_active_folder_graph", description: "Export the active folder to a portable graph archive using md-editor's existing graph export flow after approval.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "start_code_conversion", description: "Start the existing code-to-Markdown converter with current dialog values or provided overrides after approval.", parameters: { type: "object", properties: { converterType: stringProperty("builtin or java."), sourceRoot: stringProperty("Source code root path."), destinationRoot: stringProperty("Destination Markdown root path."), includeMethods: { type: "boolean", description: "Include methods and functions." }, includeAccessors: { type: "boolean", description: "Include setters and getters." }, includeSignatures: { type: "boolean", description: "Include full signatures." }, includeReturnCodes: { type: "boolean", description: "Include return codes and values." }, includeExceptions: { type: "boolean", description: "Include exceptions and thrown errors." }, includePackage: { type: "boolean", description: "Include package or module names." }, includeExternalDependencies: { type: "boolean", description: "Include external dependencies for Java conversion." }, resolveMavenDependencies: { type: "boolean", description: "Resolve Maven dependencies for Java conversion." }, includeComments: { type: "boolean", description: "Include comments and docstrings for built-in conversion." } } } } }
  ];
}
function getGraphReadToolDefinitions() {
  const stringProperty = (description) => ({ type: "string", description });
  const nodeLocatorProperties = {
    nodeId: stringProperty("Exact graph node id."),
    path: stringProperty("Optional node file path."),
    query: stringProperty("Optional node search text.")
  };
  return [
    { type: "function", function: { name: "graph_get_state", description: "Read graph tabs, active graph state, view config, counts, filters, groups, and zoom metadata.", parameters: { type: "object", properties: { tabId: stringProperty("Optional graph tab id. Defaults to active graph tab.") } } } },
    { type: "function", function: { name: "graph_search_nodes", description: "Search graph nodes by label, id, path, file name, tag, or type.", parameters: { type: "object", properties: { query: stringProperty("Search text."), tabId: stringProperty("Optional graph tab id."), type: stringProperty("Optional node type filter."), maxResults: { type: "number", description: "Maximum nodes to return." } } } } },
    { type: "function", function: { name: "graph_get_node_context", description: "Read incoming links, outgoing links, connected tags, and local graph context for one graph node.", parameters: { type: "object", properties: { ...nodeLocatorProperties, tabId: stringProperty("Optional graph tab id."), depth: { type: "number", description: "Local graph depth. Defaults to 1." } } } } },
    { type: "function", function: { name: "graph_find_paths", description: "Find short directed paths between two graph nodes.", parameters: { type: "object", required: ["from", "to"], properties: { from: stringProperty("Start node id, path, or search text."), to: stringProperty("Target node id, path, or search text."), tabId: stringProperty("Optional graph tab id."), maxDepth: { type: "number", description: "Maximum path depth. Defaults to 4." }, maxPaths: { type: "number", description: "Maximum paths to return. Defaults to 10." } } } } }
  ];
}
function getGraphActionToolDefinitions() {
  const stringProperty = (description) => ({ type: "string", description });
  return [
    { type: "function", function: { name: "graph_apply_filter", description: "Apply safe filters to the visible graph without editing files or graph documents.", parameters: { type: "object", properties: { tabId: stringProperty("Optional graph tab id."), searchQuery: stringProperty("Graph search query."), selectedTagId: stringProperty("Selected tag id or tag name."), showTags: { type: "boolean", description: "Show tag nodes." }, showOrphans: { type: "boolean", description: "Show orphan nodes." }, showLabels: { type: "boolean", description: "Show graph labels." }, showExternalJars: { type: "boolean", description: "Show external JAR nodes." }, showMissingDependencies: { type: "boolean", description: "Show missing dependency nodes." } } } } },
    { type: "function", function: { name: "graph_focus_nodes", description: "Highlight and pan/zoom the visible graph to matching nodes.", parameters: { type: "object", properties: { tabId: stringProperty("Optional graph tab id."), query: stringProperty("Find text for graph nodes."), nodeIds: { type: "array", items: { type: "string" }, description: "Exact graph node ids to focus." }, mode: stringProperty("find or nodes. Defaults to find when query is provided.") } } } },
    { type: "function", function: { name: "graph_show_local", description: "Switch the graph to an existing local graph mode around a resolved node.", parameters: { type: "object", properties: { tabId: stringProperty("Optional graph tab id."), nodeId: stringProperty("Exact graph node id."), path: stringProperty("Optional node file path."), query: stringProperty("Optional node search text."), depth: { type: "number", description: "Depth hint. 1 maps to local, greater depths map to full-local unless direction is network." }, direction: stringProperty("outgoing or network. Defaults to outgoing.") } } } },
    { type: "function", function: { name: "graph_clear_focus", description: "Clear graph find highlighting and local/focus filters without resetting display preferences.", parameters: { type: "object", properties: { tabId: stringProperty("Optional graph tab id.") } } } }
  ];
}
function getEditorActionToolDefinitions() {
  const stringProperty = (description) => ({ type: "string", description });
  return [
    { type: "function", function: { name: "open_file_in_tab", description: "Open a workspace file in an md-editor tab and optionally focus a line.", parameters: { type: "object", required: ["path"], properties: { path: stringProperty("Workspace-relative file path to open."), line: { type: "number", description: "Optional 1-based line number to focus." } } } } },
    { type: "function", function: { name: "create_document_tab", description: "Create a saved workspace document tab with content and save it to disk.", parameters: { type: "object", required: ["path", "content"], properties: { path: stringProperty("Workspace-relative target file path."), content: stringProperty("Document content to write."), title: stringProperty("Optional tab title."), overwrite: { type: "boolean", description: "Allow replacing an existing target file after approval." } } } } },
    { type: "function", function: { name: "insert_at_cursor", description: "Insert text at the active editor cursor and save the file-backed tab.", parameters: { type: "object", required: ["text"], properties: { text: stringProperty("Text to insert."), expectedPath: stringProperty("Optional active document path guard."), path: stringProperty("Optional alias for expectedPath used for approval policies.") } } } },
    { type: "function", function: { name: "replace_selection", description: "Replace the active editor selection and save the file-backed tab.", parameters: { type: "object", required: ["replacement"], properties: { replacement: stringProperty("Replacement text."), expectedPath: stringProperty("Optional active document path guard."), path: stringProperty("Optional alias for expectedPath used for approval policies.") } } } },
    { type: "function", function: { name: "replace_document_range", description: "Replace a character range in an open file-backed document tab and save it.", parameters: { type: "object", required: ["start", "end", "replacement"], properties: { path: stringProperty("Optional workspace-relative open document path."), tabId: stringProperty("Optional open tab id."), start: { type: "number", description: "Zero-based range start offset." }, end: { type: "number", description: "Zero-based range end offset." }, replacement: stringProperty("Replacement text."), expectedText: stringProperty("Optional stale-edit guard for the current range text.") } } } },
    { type: "function", function: { name: "extract_selection_to_note", description: "Create a saved note from the active selection and optionally replace the selection with a wiki link.", parameters: { type: "object", required: ["path"], properties: { path: stringProperty("Workspace-relative target note path."), title: stringProperty("Optional note title/link text."), replaceWithLink: { type: "boolean", description: "Replace selected source text with a wiki link to the new note." } } } } }
  ];
}
function getGitPanelReadToolDefinitions() {
  const stringProperty = (description) => ({ type: "string", description });
  return [
    { type: "function", function: { name: "git_status", description: "Read Git status for the current md-editor workspace repository. Aggregate counts are complete; file details may be truncated. Use file-specific Git or workspace tools for additional detail.", parameters: { type: "object", properties: { maxFiles: { type: "integer", minimum: 1, maximum: 1000, description: "Maximum file-detail records to return. Defaults to 200." } } } } },
    { type: "function", function: { name: "git_branches", description: "Read local branches, remote branches, and tags from the Git panel repository.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "git_diff", description: "Read a staged or unstaged Git comparison descriptor for one repository-relative file.", parameters: { type: "object", required: ["path"], properties: { path: stringProperty("Repository-relative file path."), originalPath: stringProperty("Original path for renamed files."), scope: stringProperty("staged or unstaged. Defaults to unstaged.") } } } },
    { type: "function", function: { name: "git_changes_digest", description: "Read the capped Git changes digest used by the Git panel AI summary.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "git_pr_notes", description: "Read Git changes context and a PR notes scaffold; write the final PR notes in the assistant response.", parameters: { type: "object", properties: {} } } }
  ];
}

function getGitPanelMutatingToolDefinitions() {
  const stringProperty = (description) => ({ type: "string", description });
  return [
    { type: "function", function: { name: "git_stage", description: "Stage repository-relative files through the Git panel tool bridge after approval.", parameters: { type: "object", required: ["files"], properties: { files: { type: "array", items: { type: "string" }, description: "Repository-relative files to stage." } } } } },
    { type: "function", function: { name: "git_unstage", description: "Unstage repository-relative files through the Git panel tool bridge after approval.", parameters: { type: "object", required: ["files"], properties: { files: { type: "array", items: { type: "string" }, description: "Repository-relative files to unstage." } } } } },
    { type: "function", function: { name: "git_commit", description: "Create a Git commit from staged files after approval.", parameters: { type: "object", required: ["message"], properties: { message: stringProperty("Commit message.") } } } },
    { type: "function", function: { name: "git_fetch", description: "Fetch repository remotes after approval.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "git_pull", description: "Pull the current branch after approval.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "git_push", description: "Push the current branch after approval.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "git_branch_create", description: "Create and switch to a new local branch after approval.", parameters: { type: "object", required: ["branch"], properties: { branch: stringProperty("New branch name.") } } } },
    { type: "function", function: { name: "git_branch_switch", description: "Switch to a local branch, or track a remote branch, after approval.", parameters: { type: "object", properties: { branch: stringProperty("Local branch name."), remoteBranch: stringProperty("Remote branch name such as origin/feature.") } } } }
  ];
}

function toolRequiresApprovalReason(name) {
  return name === "apply_edit"
    || name === "write_file"
    || name === "run_command"
    || PREFERENCE_MUTATION_TOOL_NAMES.has(name)
    || (tools.isEditorActionTool?.(name) && name !== "open_file_in_tab")
    || tools.isGitPanelMutatingTool?.(name)
    || tools.isConversionExportActionTool?.(name);
}

function createToolErrorContent(error) {
  const result = { error: error?.message || String(error) };
  if (error?.code) result.code = error.code;
  if (error?.retryable === false) result.retryable = false;
  if (error?.doNotRetry === true) result.doNotRetry = true;
  if (error?.decisionId) result.decisionId = error.decisionId;
  if (error?.capability) result.capability = error.capability;
  if (error?.resource) result.resource = error.resource;
  if (error?.preExecution === true) result.preExecution = true;
  if (error?.executed === false) result.executed = false;
  if (error?.path) result.path = error.path;
  if (Number.isInteger(error?.matchCount)) result.matchCount = error.matchCount;
  if (Array.isArray(error?.candidates)) result.candidates = error.candidates.slice(0, 10);
  if (error?.amendmentId) result.amendmentId = error.amendmentId;
  if (error?.fieldRef) result.fieldRef = error.fieldRef;
  if (error?.supersededReference) result.supersededReference = error.supersededReference;
  if (error?.replacementReference) result.replacementReference = error.replacementReference;
  if (Array.isArray(error?.argumentPaths)) result.argumentPaths = error.argumentPaths.slice(0, 20);
  return result;
}

function createStructuredToolFailure(error) {
  const details = createToolErrorContent(error);
  const code = details.code || "tool-execution-failed";
  const retryable = details.retryable !== false;
  const doNotRetry = details.doNotRetry === true;
  return {
    status: "failed",
    code,
    retryable,
    doNotRetry,
    executed: details.executed !== false,
    preExecution: details.preExecution === true,
    error: {
      message: details.error,
      code,
      retryable,
      doNotRetry,
      decisionId: details.decisionId || "",
      capability: details.capability || "",
      resource: details.resource || "",
      preExecution: details.preExecution === true,
      path: details.path || "",
      matchCount: Number.isInteger(details.matchCount) ? details.matchCount : undefined,
      candidates: Array.isArray(details.candidates) ? details.candidates : undefined,
      amendmentId: details.amendmentId || "",
      fieldRef: details.fieldRef || "",
      supersededReference: details.supersededReference || "",
      replacementReference: details.replacementReference || "",
      argumentPaths: Array.isArray(details.argumentPaths) ? details.argumentPaths : undefined
    }
  };
}

function createStaleIntentReferenceError(match) {
  const error = new Error(`This proposal still produces superseded reference ${match.supersededReference}. Regenerate it using ${match.replacement}.`);
  error.code = "stale-intent-reference";
  error.retryable = false;
  error.doNotRetry = true;
  error.executed = false;
  error.preExecution = true;
  error.amendmentId = match.amendmentId;
  error.fieldRef = match.fieldRef;
  error.supersededReference = match.supersededReference;
  error.replacementReference = match.replacement;
  error.argumentPaths = match.argumentPaths;
  return error;
}

function createNonRetryableToolSignature(name, args = {}, contract = null) {
  const staleReference = correctionConsistency.findStaleEffectReferences(name, args, contract)[0];
  if (staleReference) {
    const effect = toolEffectRegistry.describeToolEffect(name, args);
    return `stale-intent:${JSON.stringify([
      staleReference.amendmentId,
      effect?.capability || name,
      effect?.resource || String(args.path || ""),
      staleReference.supersededReference
    ])}`;
  }
  if (name !== "apply_edit") return `${name}:${JSON.stringify(args)}`;
  const normalizedPath = String(args.path || "").replace(/\\/g, "/").replace(/^\.\/+/, "");
  return `${name}:${JSON.stringify([
    normalizedPath,
    canonicalizeEditSearch(args.search),
    Number.isInteger(args.occurrence) ? args.occurrence : "",
    Number.isInteger(args.expectedMatches) ? args.expectedMatches : ""
  ])}`;
}

function createIntentMutationBlockSignature(control) {
  if (!control?.blocked) return "";
  const decisionId = String(control.decision?.id || "unknown-decision");
  const capability = String(control.description?.capability || "unknown-capability");
  const resource = String(control.description?.resource || "unknown-resource");
  return [decisionId, capability, resource].join(":");
}

/**
 * Group blocked mutation attempts across equivalent tools and resources.
 * @param {object} control - Evaluated intent mutation control.
 * @returns {string} Decision and capability key.
 */
function createIntentDecisionBlockSignature(control) {
  if (!control?.blocked) return "";
  return [
    String(control.decision?.id || "unknown-decision"),
    String(control.description?.capability || "unknown-capability")
  ].join(":");
}

/**
 * Build a structured pre-execution intent block without throwing or dispatching a tool.
 * @param {object} control - Evaluated intent mutation control.
 * @param {object} extra - Additional terminal/suppression metadata.
 * @returns {object} Structured failed tool result.
 */
function createIntentBlockFailure(control, extra = {}) {
  const decisionId = String(control?.decision?.id || "unknown-decision");
  const capability = String(control?.description?.capability || "");
  const resource = String(control?.description?.resource || "");
  const message = `This action is blocked by unresolved decision ${decisionId}. Resolve the decision before proposing another mutation.`;
  return {
    status: "failed",
    code: "intent-mutation-blocked",
    retryable: false,
    doNotRetry: true,
    preExecution: true,
    executed: false,
    ...extra,
    error: {
      code: "intent-mutation-blocked",
      message,
      retryable: false,
      doNotRetry: true,
      preExecution: true,
      decisionId,
      capability,
      resource
    }
  };
}

/**
 * Mark remaining model proposals as not executed after a terminal decision block.
 * @param {object[]} toolCalls - Current model-authored tool calls.
 * @param {number} startIndex - First stale call index.
 * @param {object[]} messages - Provider history.
 * @param {Function} emit - Event emitter.
 * @param {object} activityRun - Activity recorder.
 * @param {object} control - Decision that terminated mutation work.
 */
function appendDecisionBlockedToolOutcomes(toolCalls, startIndex, messages, emit, activityRun, control) {
  for (const toolCall of toolCalls.slice(startIndex)) {
    const name = toolCall.function?.name || toolCall.name || "";
    let args = {};
    try {
      args = parseToolArguments(toolCall.function?.arguments || toolCall.arguments || "{}");
    } catch (_error) {
      args = {};
    }
    const result = createIntentBlockFailure(control, {
      code: "intent-decision-terminal-skip",
      repeatedWithoutExecution: true,
      terminalDecisionBlock: true
    });
    result.error.code = "intent-decision-terminal-skip";
    result.error.message = "This proposal was not executed because the same unresolved decision already blocked mutation work.";
    activityRun?.recordBlockedChange?.(name, args, result);
    activityRun?.recordToolEvidence?.({ toolCallId: toolCall.id, tool: name, args, result, summary: result.error.message });
    emit({ type: "tool-error", tool: name, input: getToolInputSummary(toolCall), error: result.error.message, structuredResult: result, activityId: toolCall.id });
    messages.push(createToolOutcomeHistoryMessage(toolCall, name, args, createToolResultContent(name, args, result), "failed"));
  }
}

function appendStaleApprovalToolOutcomes(toolCalls, startIndex, messages, emit, activityRun, amendmentId) {
  for (const toolCall of toolCalls.slice(startIndex)) {
    const name = toolCall.function?.name || toolCall.name || "";
    let args = {};
    try {
      args = parseToolArguments(toolCall.function?.arguments || toolCall.arguments || "{}");
    } catch (_error) {
      args = {};
    }
    const result = {
      status: "failed",
      executed: false,
      preExecution: true,
      error: {
        code: "approval-instruction-stale-proposal",
        message: "This proposal was not executed because the user changed the authoritative intent during approval.",
        retryable: false,
        amendmentId,
        preExecution: true
      }
    };
    const input = getToolInputSummary(toolCall);
    activityRun?.recordBlockedChange?.(name, args, result);
    activityRun?.recordToolEvidence?.({ toolCallId: toolCall.id, tool: name, args, result, summary: result.error.message });
    emit({ type: "tool-error", tool: name, input, error: result.error.message, structuredResult: result, activityId: toolCall.id });
    messages.push(createToolOutcomeHistoryMessage(toolCall, name, args, createToolResultContent(name, args, result), "failed"));
  }
}

function addApprovalReasonRequirement(definition) {
  const name = definition?.function?.name;
  const parameters = definition?.function?.parameters;
  if (!toolRequiresApprovalReason(name) || !parameters) return definition;
  return {
    ...definition,
    function: {
      ...definition.function,
      parameters: {
        ...parameters,
        required: Array.from(new Set([...(parameters.required || []), "approvalReason"])),
        properties: { ...(parameters.properties || {}), approvalReason: APPROVAL_REASON_PROPERTY }
      }
    }
  };
}

function getAgentToolDefinitions(mode, options = {}) {
  const definitions = [
    ...getEditorReadToolDefinitions(),
    ...getGraphReadToolDefinitions(),
    {
      type: "function",
      function: {
        name: "list_files",
        description: "List workspace files using project ignores. Use this before broad exploration.",
        parameters: {
          type: "object",
          properties: {
            maxFiles: { type: "number", description: "Maximum number of files to return." }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "glob",
        description: "Find workspace files by glob pattern, such as **/*.js or src/**/*.java.",
        parameters: {
          type: "object",
          required: ["pattern"],
          properties: {
            pattern: { type: "string", description: "Glob pattern to match workspace-relative file paths." },
            maxFiles: { type: "number", description: "Maximum number of files to return." }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_text",
        description: "Search workspace file contents with ripgrep when available, falling back to a JS scanner.",
        parameters: {
          type: "object",
          required: ["pattern"],
          properties: {
            pattern: { type: "string", description: "Literal search text or pattern to locate." },
            maxMatches: { type: "number", description: "Maximum matches to return." }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Read a workspace file slice by path. Omit path to read the active editor document. Bounded by maxLines (defaults to a cap); page by advancing startLine.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Workspace-relative file path. Omit to read the active document." },
            startLine: { type: "number", description: "Optional 1-based start line." },
            maxLines: { type: "number", description: "Maximum lines to return from startLine (bounded by default)." }
          }
        }
      }
    }
  ];

  // Fix 3 (flag-gated): read-only git inspection is safe and essential for
  // planning tasks about the repository (status/diff are read-only). Non-plan
  // modes always get git reads. Plan gets them only when planGitReadToolsEnabled
  // is set. Mutating git tools stay agent-only, enforced in executeAgentTool.
  const includePlanGitReads = mode === "plan" && options.planGitReadToolsEnabled === true;
  if (mode !== "plan" || includePlanGitReads) definitions.push(...getGitPanelReadToolDefinitions());
  if (mode !== "plan") definitions.push(...getPreferenceReadToolDefinitions());
  if (mode !== "plan") definitions.push(...getGraphActionToolDefinitions());

  if (mode === "agent") {
    definitions.push(...getApiClientToolDefinitions(), ...getPlanRepositoryToolDefinitions(), ...getEditorActionToolDefinitions(), ...getGitPanelMutatingToolDefinitions(), ...getPreferenceMutationToolDefinitions(), ...getConversionExportReadToolDefinitions(), ...getConversionExportActionToolDefinitions());
    definitions.push(
      {
        type: "function",
        function: {
          name: "apply_edit",
          description: "Apply one search/replace occurrence to a workspace file. Matching handles CRLF/LF differences and ignores leading indentation and trailing spaces while keeping case and internal whitespace strict. The search must be unique unless occurrence and expectedMatches explicitly select one of the returned candidate ranges.",
          parameters: {
            type: "object",
            required: ["path", "search", "replacement"],
            properties: {
              path: { type: "string", description: "Workspace-relative file path." },
              search: { type: "string", description: "Text to replace. Use a specific range when multiple matches are possible." },
              replacement: { type: "string", description: "Replacement text." },
              occurrence: { type: "integer", minimum: 1, description: "Optional one-based match occurrence. Requires expectedMatches." },
              expectedMatches: { type: "integer", minimum: 1, description: "Required with occurrence; the edit fails if the current match count differs." }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "write_file",
          description: "Write a full file under the workspace.",
          parameters: {
            type: "object",
            required: ["path", "content"],
            properties: {
              path: { type: "string", description: "Workspace-relative file path." },
              content: { type: "string", description: "Full file content to write." }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "run_command",
          description: "Request a free-form shell command. Enterprise policy normally denies and audits it; use a typed execution tool when one is available.",
          parameters: {
            type: "object",
            required: ["command"],
            properties: {
              command: { type: "string", description: "Command to run from the workspace root." }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "compile_project",
          description: "Compile a detected Javac, Maven, or Gradle Java project using policy-controlled arguments.",
          parameters: {
            type: "object",
            required: ["targetPath", "buildMode", "includeTestSources"],
            properties: {
              targetPath: { type: "string", description: "Workspace-relative project, module, directory, or file path." },
              buildMode: { type: "string", enum: ["incremental", "clean"] },
              includeTestSources: { type: "boolean" }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "run_tests",
          description: "Run JUnit, Node, or Playwright tests through a constrained provider.",
          parameters: {
            type: "object",
            required: ["targetPath", "runner", "scope", "selector"],
            properties: {
              targetPath: { type: "string" },
              runner: { type: "string", enum: ["auto", "junit", "node", "playwright"] },
              scope: { type: "string", enum: ["project", "module", "file", "class", "method"] },
              selector: { type: "string", description: "Typed test selector; empty for project scope." }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "restore_dependencies",
          description: "Restore dependencies declared by the project after policy evaluation.",
          parameters: {
            type: "object",
            required: ["targetPath", "ecosystem", "refresh"],
            properties: {
              targetPath: { type: "string" },
              ecosystem: { type: "string", enum: ["npm", "yarn", "pnpm", "maven", "gradle"] },
              refresh: { type: "boolean" }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "manage_dependencies",
          description: "Manage dependencies: install, update, remove, or download one policy-whitelisted package, or action \"restore\" to restore all project dependencies.",
          parameters: {
            type: "object",
            required: ["targetPath", "ecosystem", "action", "packageId", "version", "development"],
            properties: {
              targetPath: { type: "string" },
              ecosystem: { type: "string", enum: ["npm", "yarn", "pnpm"] },
              action: { type: "string", enum: ["install", "update", "remove", "download", "restore"] },
              packageId: { type: "string" },
              version: { type: "string" },
              development: { type: "boolean" }
            },
            additionalProperties: false
          }
        }
      }
    );
  }

  // Scope filter (opt-in): when the caller supplies the user allow-list, prune the
  // definitions to the small per-request set (core readers + edit + enabled domain
  // scopes) and drop tools removed from the roster. Callers that omit
  // `enabledScopes` (e.g. tests, drift guard) get the full legacy set unchanged.
  let scopedDefinitions = definitions;
  if (options.enabledScopes) {
    const keep = new Set(toolScopeRegistry.filterToolNames(
      definitions.map((definition) => definition?.function?.name).filter(Boolean),
      { mode, enabledScopes: options.enabledScopes, taskScopes: options.taskScopes }
    ));
    scopedDefinitions = definitions.filter((definition) => keep.has(definition?.function?.name));
  }
  // Task-profile narrowing (M11.2): when a certain task profile is active, expose only
  // its explicit workspace tools — tighter than scope granularity. The caller resolves
  // the allow-list (task-profiles.resolveProfileToolNames) and passes it in; control
  // tools are added by the decision controller, not here.
  if (Array.isArray(options.taskProfileToolNames)) {
    const allow = new Set(options.taskProfileToolNames);
    scopedDefinitions = scopedDefinitions.filter((definition) => allow.has(definition?.function?.name));
  }
  // Tool names are canonical end-to-end, so no relabeling is needed here.
  return scopedDefinitions.map(addApprovalReasonRequirement);
}

function getApprovalPreview(name, args) {
  if (name === "apply_edit") {
    return truncateText([
      `File: ${args.path || ""}`,
      "Search:",
      args.search || "",
      "Replacement:",
      args.replacement || ""
    ].join("\n"), MAX_APPROVAL_PREVIEW_CHARS);
  }
  if (name === "write_file") {
    return truncateText([`File: ${args.path || ""}`, "Content:", args.content || ""].join("\n"), MAX_APPROVAL_PREVIEW_CHARS);
  }
  if (tools.isEditorActionTool?.(name)) {
    return truncateText([
      `Target: ${tools.getEditorActionApprovalPath?.(name, args) || args.path || args.expectedPath || name}`,
      "Arguments:",
      JSON.stringify(args, null, 2)
    ].join("\n"), MAX_APPROVAL_PREVIEW_CHARS);
  }
  if (tools.isGitPanelMutatingTool?.(name)) {
    return truncateText(tools.getGitPanelApprovalPreview?.(name, args) || name, MAX_APPROVAL_PREVIEW_CHARS);
  }
  if (name === "run_command" || name === "run_test") {
    return truncateText(["Command:", args.command || ""].join("\n"), MAX_APPROVAL_PREVIEW_CHARS);
  }
  if (tools.isConversionExportActionTool?.(name)) return tools.getConversionExportApprovalPreview?.(name, args) || "";
  return "";
}

function isEditorActionWriteTool(name) {
  return tools.isEditorActionTool?.(name) && name !== "open_file_in_tab";
}

function getApprovalRequirement(settings, name) {
  if (tools.isGitPanelMutatingTool?.(name)) return "git";
  if (tools.isConversionExportActionTool?.(name)) return "conversion-export";
  if (PREFERENCE_MUTATION_TOOL_NAMES.has(name)) return "settings";
  if (name === "apply_edit" || name === "write_file" || isEditorActionWriteTool(name)) {
    return "write";
  }
  if (name === "run_command" || name === "run_test") {
    return settings.agentAutoRunCommands === true ? "none" : "command";
  }
  return "none";
}

function getApprovalSummary(name) {
  if (name === "apply_edit") return "Approve search/replace edit";
  if (name === "write_file") return "Approve file write";
  if (name === "create_document_tab") return "Create and save document";
  if (isEditorActionWriteTool(name)) return "Approve editor action";
  if (tools.isGitPanelMutatingTool?.(name)) return "Approve Git action";
  if (tools.isConversionExportActionTool?.(name)) return "Approve conversion/export action";
  if (name === "run_test") return "Approve test command";
  if (name === "run_command") return "Approve shell command";
  return "Approve agent action";
}

function normalizeApprovalDecision(value) {
  if (value === true) return { decision: "approve", approved: true, instructions: "" };
  if (value === false) return { decision: "reject", approved: false, instructions: "" };
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (source.approved === true) return { decision: "approve", approved: true, instructions: "", grantOptionId: String(source.grantOptionId || "") };
  const decision = ["approve", "reject", "instruct"].includes(source.decision) ? source.decision : "reject";
  return {
    decision,
    approved: decision === "approve",
    instructions: String(source.instructions || source.prompt || "").trim(),
    grantOptionId: String(source.grantOptionId || "")
  };
}

function emitAutoApproval(name, args, approval, options = {}) {
  if (!approval?.autoApproved || typeof options.emit !== "function") return;
  options.emit({
    type: "approval",
    decisionId: String(options.controllerDecision?.decisionId || ""),
    tool: name,
    input: options.approvalInput || args.path || args.command || name,
    approvalReason: String(args.approvalReason || "").trim(),
    capability: approval.descriptor?.capability || "",
    resource: approval.descriptor?.resource || null,
    summary: `${getApprovalSummary(name)} auto-approved`,
    preview: getApprovalPreview(name, args),
    autoApproved: true,
    policyScope: approval.policy?.scope || "",
    policyPattern: approval.policy?.pattern || "",
    policyRuleId: approval.policy?.ruleId || "",
    compare: approval.compare || null,
    actionAnalysis: approval.actionAnalysis || null
  });
}

async function recordApprovalAudit(options, record) {
  try {
    await options.securityContext?.auditLogger?.record({
      timestamp: new Date().toISOString(),
      taskId: options.requestId || "",
      requestId: options.requestId || "",
      workspace: options.workspaceRoot || "",
      ...record
    });
  } catch (_error) {
    // Approval auditing is best-effort; the execution security audit retains its own fail-closed behavior.
  }
}

async function isGrantResourceInsideWorkspace(root, descriptor) {
  const rootRealPath = await fs.realpath(root).catch(() => path.resolve(root));
  const boundaryPaths = Array.isArray(descriptor?.boundaryPaths) ? descriptor.boundaryPaths : [];
  const resources = boundaryPaths.length
    ? boundaryPaths
    : (descriptor?.resource?.type === "path-glob" ? [descriptor.resource.value || ""] : []);
  for (const resource of resources) {
    const requestedPath = path.resolve(rootRealPath, resource);
    const lexicalRelative = path.relative(rootRealPath, requestedPath);
    if (lexicalRelative.startsWith("..") || path.isAbsolute(lexicalRelative)) return false;
    let existingPath = requestedPath;
    let inside = false;
    while (existingPath && existingPath !== path.dirname(existingPath)) {
      try {
        const realPath = await fs.realpath(existingPath);
        const realRelative = path.relative(rootRealPath, realPath);
        inside = !realRelative.startsWith("..") && !path.isAbsolute(realRelative);
        break;
      } catch (error) {
        if (error?.code !== "ENOENT") return false;
        existingPath = path.dirname(existingPath);
      }
    }
    if (!inside) return false;
  }
  return true;
}

async function loadApprovalContext(root, name, args, options) {
  const descriptor = approvalCapabilities.describe(name, args, { effectiveSecurityPolicy: options.securityContext?.policy });
  if (!descriptor) return { descriptor: null, store: null, workspaceRules: [], decision: { allowed: false } };
  const verifiability = String(options.intentContract?.verifiability || "verified");
  if (verifiability === "unverified") {
    descriptor.maximumGrantLifetime = "action";
    descriptor.grantOptions = [];
  } else if (verifiability === "provisional") {
    descriptor.maximumGrantLifetime = "task";
    descriptor.grantOptions = [];
  }
  if (!(await isGrantResourceInsideWorkspace(root, descriptor))) {
    descriptor.grantOptions = (descriptor.grantOptions || []).map((option) => ({ ...option, disabled: true, disabledReason: "The resource resolves outside the canonical workspace." }));
    return { descriptor, store: null, workspaceRules: [], decision: { allowed: false, protected: true, boundaryViolation: true } };
  }
  const store = options.profileRoot ? new ApprovalGrantStore(options.profileRoot, root) : null;
  const workspaceRules = verifiability === "verified" && store ? (await store.list()).rules : [];
  const taskGrants = verifiability === "provisional"
    ? options.provisionalApprovalGrants
    : (verifiability === "verified" ? options.taskApprovalGrants : []);
  const decision = approvalPolicy.resolveCapabilityApprovalDecision({
    descriptor,
    taskGrants,
    workspaceGrants: workspaceRules,
    effectiveSecurityPolicy: options.securityContext?.policy
  });
  if (decision.protected) {
    descriptor.grantOptions = (descriptor.grantOptions || []).map((option) => ({ ...option, disabled: true, disabledReason: "Protected resources always require a fresh approval." }));
  }
  return { descriptor, store, workspaceRules, decision };
}

async function ensureToolApproval(root, settings, name, args, options = {}) {
  const authorizeApprovedExecution = async (approval) => {
    if (typeof options.authorizeDecisionExecution === "function") {
      await options.authorizeDecisionExecution({ tool: name, args, approval });
    }
    return approval;
  };
  const verifiability = String(options.intentContract?.verifiability || "verified");
  const configuredRequirement = getApprovalRequirement(settings, name);
  if (configuredRequirement === "none" && verifiability === "verified") return authorizeApprovedExecution(true);
  const requirement = configuredRequirement === "none" ? "action" : configuredRequirement;
  const compare = name === "apply_edit"
    ? await createApprovalFileCompare(root, name, args, { signal: options.signal })
    : await createApprovalFileCompare(root, name, args, { signal: options.signal }).catch(() => null);
  const actionAnalysis = await analyzeApprovalAction(root, name, args, { compare, signal: options.signal });
  if (!actionAnalysis.canApprove) {
    const descriptor = approvalCapabilities.describe(name, args, { effectiveSecurityPolicy: options.securityContext?.policy });
    await recordApprovalAudit({ ...options, workspaceRoot: root }, { tool: name, capability: descriptor?.capability, decision: "blocked", code: actionAnalysis.blockingCode, resource: actionAnalysis.resourcePath });
    const error = new Error(actionAnalysis.blockingMessage);
    error.code = actionAnalysis.blockingCode;
    error.retryable = false;
    error.doNotRetry = true;
    error.actionAnalysis = actionAnalysis;
    error.preExecution = true;
    throw error;
  }
  const approvalContext = await loadApprovalContext(root, name, args, { ...options, workspaceRoot: root });
  if (approvalContext.decision.allowed) {
    if (approvalContext.decision.scope === "workspace") await approvalContext.store?.touch?.(approvalContext.decision.ruleId);
    if (approvalContext.decision.scope === "task" && approvalContext.decision.rule) approvalContext.decision.rule.lastUsedAt = new Date().toISOString();
    await recordApprovalAudit({ ...options, workspaceRoot: root }, { tool: name, capability: approvalContext.descriptor?.capability, decision: "auto-approved", ruleId: approvalContext.decision.ruleId, scope: approvalContext.decision.scope });
    return authorizeApprovedExecution({ approved: true, autoApproved: true, policy: approvalContext.decision, descriptor: approvalContext.descriptor, compare, actionAnalysis, preparedEdit: compare?.preparedEdit || null });
  }
  if (typeof options.requestApproval !== "function") {
    throw new Error(requirement === "write"
      ? "File write approval is required, but no approval channel is available."
      : (requirement === "git"
        ? "Git action approval is required, but no approval channel is available."
        : (requirement === "conversion-export"
          ? "Conversion/export approval is required, but no approval channel is available."
          : "Command execution approval is required, but no approval channel is available.")));
  }
  const resumeAction = await createResumeAction(root, {
    activityId: options.activityId,
    tool: name,
    args,
    capability: approvalContext.descriptor?.capability || "",
    resource: approvalContext.descriptor?.resource || null,
    approvalReason: String(args.approvalReason || "").trim(),
    compare,
    actionAnalysis
  });
  const decision = normalizeApprovalDecision(await options.requestApproval({
    decisionId: String(options.controllerDecision?.decisionId || ""),
    tool: name,
    input: args.path || args.command || name,
    approvalReason: String(args.approvalReason || "").trim(),
    capability: approvalContext.descriptor?.capability || "",
    resource: approvalContext.descriptor?.resource || null,
    maximumGrantLifetime: approvalContext.descriptor?.maximumGrantLifetime || "action",
    grantOptions: approvalContext.descriptor?.grantOptions || [],
    summary: options.approvalSummary || getApprovalSummary(name),
    preview: options.approvalPreview || getApprovalPreview(name, args),
    compare,
    actionAnalysis,
    resumeAction
  }));
  if (decision.approved) {
    let grantedRule = null;
    if (verifiability === "provisional") {
      const resource = approvalContext.descriptor?.resource;
      if (approvalContext.descriptor?.capability && resource?.value) {
        const rule = {
          capability: approvalContext.descriptor.capability,
          matcher: { type: resource.type, value: resource.value },
          lifetime: "task",
          enabled: true,
          createdAt: new Date().toISOString(),
          lastUsedAt: ""
        };
        options.provisionalApprovalGrants ||= [];
        if (!options.provisionalApprovalGrants.some((candidate) => approvalPolicy.matchesGrantRule(candidate, approvalContext.descriptor))) {
          options.provisionalApprovalGrants.push(rule);
        }
        grantedRule = rule;
      }
    } else if (verifiability === "verified" && decision.grantOptionId) {
      const option = approvalPolicy.validateGrantOption(approvalContext.descriptor, decision.grantOptionId, options.securityContext?.policy);
      if (!option) throw new Error("The selected approval grant is no longer available under the effective security policy.");
      const rule = approvalPolicy.createGrantRule(approvalContext.descriptor, option);
      if (option.lifetime === "task") {
        options.taskApprovalGrants.push(rule);
        grantedRule = rule;
      } else {
        if (!approvalContext.store) throw new Error("Workspace approval grants require a profile storage location.");
        try {
          grantedRule = await approvalContext.store.add(rule);
        } catch (error) {
          await recordApprovalAudit({ ...options, workspaceRoot: root }, { tool: name, capability: approvalContext.descriptor.capability, decision: "grant-persistence-error", scope: option.lifetime, error: error?.message || String(error) });
          throw error;
        }
      }
      await recordApprovalAudit({ ...options, workspaceRoot: root }, { tool: name, capability: approvalContext.descriptor.capability, decision: "grant-created", scope: option.lifetime, ruleId: grantedRule.id, matcher: grantedRule.matcher });
    } else {
      await recordApprovalAudit({ ...options, workspaceRoot: root }, { tool: name, capability: approvalContext.descriptor?.capability, decision: "approved-once" });
    }
    return authorizeApprovedExecution({ approved: true, descriptor: approvalContext.descriptor, grantedRule, compare, actionAnalysis, preparedEdit: compare?.preparedEdit || null });
  }
  await recordApprovalAudit({ ...options, workspaceRoot: root }, { tool: name, capability: approvalContext.descriptor?.capability, decision: decision.decision === "instruct" ? "instructions" : "rejected" });
  const actionLabel = requirement === "write" ? "file write" : (requirement === "git" ? "git action" : "command");
  const message = decision.decision === "instruct" && decision.instructions
    ? `User rejected the ${actionLabel} and instructed: ${decision.instructions}`
    : `User rejected the ${actionLabel}.`;
  const error = new Error(message);
  error.code = decision.decision === "instruct" && decision.instructions ? "approval-instruction-rejected" : "approval-rejected";
  error.retryable = false;
  error.doNotRetry = true;
  error.preExecution = true;
  error.userInstructions = decision.instructions;
  throw error;
}

function getPreferenceInputSummary(name, args = {}) {
  if (name === "preferences_update") return (args.changes || []).map((change) => change?.key).filter(Boolean).join(", ") || name;
  if (name === "preferences_reset") return (args.keys || []).join(", ") || name;
  if (name === "preferences_import") return args.apply === true ? "apply pasted settings" : "preview pasted settings";
  if (Array.isArray(args.keys) && args.keys.length) return args.keys.join(", ");
  return args.category || args.query || name;
}

function formatPreferenceApprovalPreview(result = {}) {
  const changes = Array.isArray(result.changes) ? result.changes : [];
  if (!changes.length) return "No settings changes.";
  return truncateText(changes.map((change) => [
    `Key: ${change.key || ""}`,
    `Action: ${change.action || "update"}`,
    "Old value:",
    JSON.stringify(change.oldValue, null, 2),
    "New value:",
    JSON.stringify(change.newValue, null, 2)
  ].join("\n")).join("\n\n"), MAX_APPROVAL_PREVIEW_CHARS);
}

async function requestPreferenceAction(name, args = {}, options = {}) {
  if (typeof options.requestAppAction !== "function") throw new Error("Settings tools require the md-editor app action bridge.");
  return options.requestAppAction({
    tool: name,
    args,
    targetPath: getPreferenceInputSummary(name, args),
    preview: { target: getPreferenceInputSummary(name, args) }
  });
}

async function ensurePreferenceApproval(root, settings, name, args, previewResult, options = {}) {
  if (previewResult?.changed === false) {
    if (typeof options.authorizeDecisionExecution === "function") {
      await options.authorizeDecisionExecution({ tool: name, args, approval: null });
    }
    return true;
  }
  return ensureToolApproval(root, settings, name, args, {
    ...options,
    approvalInput: getPreferenceInputSummary(name, args),
    approvalSummary: "Approve settings change",
    approvalPreview: formatPreferenceApprovalPreview(previewResult)
  });
}

async function runPreferenceMutationTool(root, settings, name, args = {}, options = {}) {
  const previewArgs = name === "preferences_import" ? { ...args, apply: false } : { ...args, previewOnly: true };
  const previewResult = await requestPreferenceAction(name, previewArgs, options);
  await ensurePreferenceApproval(root, settings, name, args, previewResult, options);
  if (previewResult?.changed === false) return previewResult;
  const applyArgs = name === "preferences_import" ? { ...args, apply: true } : args;
  return requestPreferenceAction(name, applyArgs, options);
}

function getExecutionSecurityOptions(root, settings, options = {}) {
  const context = options.securityContext || {};
  const policy = context.policy || {
    version: 1,
    shell: { mode: settings.aiSecurityPolicy?.shell?.mode === "sandbox-shell" ? "sandbox-shell" : "deny-and-audit" },
    execution: { allowedExecutables: [], allowedEnvironmentVariables: [], concurrency: 1 },
    packages: { rules: [] },
    packageBinaries: { npx: false, yarnDlx: false, pnpmDlx: false },
    audit: { enabled: false },
    metadata: { source: "product-defaults", hash: "" }
  };
  return {
    policy,
    policyError: context.policyError || "",
    auditLogger: context.auditLogger,
    requestId: options.requestId || "",
    workspaceRoot: root,
    modelProvider: settings.providerMode || "",
    appVersion: options.appVersion || "",
    signal: options.signal
  };
}

function createCommandAuditRecord(root, settings, options, command, classification, decision, extra = {}) {
  const security = getExecutionSecurityOptions(root, settings, options);
  return {
    taskId: security.requestId,
    requestId: security.requestId,
    workspace: root,
    tool: "run_command",
    requestedCommand: command,
    classification,
    policyVersion: security.policy.version,
    policyHash: security.policy.metadata?.hash || "",
    policySource: security.policy.metadata?.source || "",
    decision,
    modelProvider: security.modelProvider,
    appVersion: security.appVersion,
    ...extra
  };
}

async function recordCommandAudit(logger, record) {
  try {
    await logger?.record(record);
    return "";
  } catch (error) {
    return error?.message || String(error);
  }
}

async function runFreeFormCommand(root, settings, args, options) {
  const command = String(args.command || "");
  const security = getExecutionSecurityOptions(root, settings, options);
  const classification = classifyCommand(command);
  if (security.policy.shell.mode !== "sandbox-shell") {
    if (typeof options.authorizeDecisionExecution === "function") {
      await options.authorizeDecisionExecution({ tool: "run_command", args, approval: null });
    }
    const auditError = await recordCommandAudit(security.auditLogger, createCommandAuditRecord(root, settings, options, command, classification.classification, "deny", {
      suggestion: classification.suggestion
    }));
    return {
      code: "FREE_FORM_COMMAND_NOT_PERMITTED",
      executed: false,
      retryable: false,
      doNotRetry: true,
      message: "Free-form shell commands are disabled by the effective AI security policy. Do not retry this command.",
      classification: classification.classification,
      suggestedTool: classification.suggestion,
      policySource: security.policy.metadata?.source || "product-defaults",
      auditError
    };
  }
  const requestAuditError = await recordCommandAudit(security.auditLogger, createCommandAuditRecord(root, settings, options, command, classification.classification, "requested", {
    suggestion: classification.suggestion
  }));
  if (requestAuditError) {
    return {
      code: "AUDIT_LOG_UNAVAILABLE",
      executed: false,
      retryable: false,
      doNotRetry: true,
      message: "The sandbox-shell command was not executed because its audit record could not be written.",
      auditError: requestAuditError,
      policySource: security.policy.metadata?.source || "product-defaults"
    };
  }
  try {
    const approvalSettings = security.policy.shell.approvalBehavior === "always-ask"
      ? { ...settings, agentAutoRunCommands: false }
      : settings;
    emitAutoApproval("run_command", args, await ensureToolApproval(root, approvalSettings, "run_command", args, options), options);
    const result = await tools.runCommand(root, command, {
      allowCommands: true,
      signal: options.signal,
      timeoutMs: security.policy.shell.timeoutMs,
      outputLimitBytes: security.policy.shell.outputLimitBytes
    });
    const auditError = await recordCommandAudit(security.auditLogger, createCommandAuditRecord(root, settings, options, command, classification.classification, "executed-success", { executionResult: result }));
    return { ...result, executed: true, auditError, policySource: security.policy.metadata?.source || "product-defaults" };
  } catch (error) {
    await recordCommandAudit(security.auditLogger, createCommandAuditRecord(root, settings, options, command, classification.classification, "execution-error", { error: error?.message || String(error) }));
    throw error;
  }
}

async function executeAgentTool(root, settings, mode, toolCall, options = {}) {
  const name = toolScopeRegistry.toCanonicalName(toolCall.function?.name || toolCall.name || "");
  const args = parseToolArguments(toolCall.function?.arguments || toolCall.arguments || "{}");
  const intentValidation = validateApprovalIntent(name, args);
  if (!intentValidation.allowed) {
    const error = new Error(intentValidation.message);
    error.code = intentValidation.code;
    error.retryable = false;
    error.doNotRetry = true;
    error.preExecution = true;
    throw error;
  }
  if (mode === "agent" && settings.intentContractsEnabled === true && options.intentContract) {
    const staleReferences = correctionConsistency.findStaleEffectReferences(name, args, options.intentContract);
    if (staleReferences.length) throw createStaleIntentReferenceError(staleReferences[0]);
  }
  // Control-scoped mutation blocking (M2): an open, mutation-controlling decision in the
  // active contract gates the exact mutations it scopes; unknown scope blocks all.
  if (mode === "agent" && settings.intentContractsEnabled === true && options.intentContract) {
    const control = evaluateMutationControl(name, args, options.intentContract);
    if (control.blocked) {
      const error = new Error(`This action is blocked by an unresolved decision (${control.decision.id}: ${control.decision.description || "decision"}). Resolve it before this mutation can proceed.`);
      error.code = "intent-mutation-blocked";
      error.retryable = false;
      error.doNotRetry = true;
      error.decisionId = control.decision.id;
      error.capability = control.description?.capability || "";
      error.resource = control.description?.resource || "";
      error.preExecution = true;
      throw error;
    }
  }
  if (typeof options.authorizeDecisionExecution === "function" && !toolRequiresApprovalReason(name)) {
    await options.authorizeDecisionExecution({ tool: name, args, approval: null });
  }
  switch (name) {
    case "list_files": {
      const maxFiles = args.maxFiles == null ? DEFAULT_LIST_FILES_TOOL_MAX_FILES : args.maxFiles;
      return tools.listFiles(root, { maxFiles, signal: options.signal });
    }
    case "glob":
      return tools.globFiles(root, args.pattern, { maxFiles: args.maxFiles, signal: options.signal });
    case "search_text":
      return tools.searchGrep(root, args.pattern, { maxMatches: args.maxMatches, signal: options.signal });
    case "read_file": {
      // No path -> read the active editor document. maxLines is the count-based
      // bound; endLine is still honored for back-compat.
      if (!args.path) return tools.readActiveDocument(root, args, { editorReadContext: options.editorReadContext, signal: options.signal });
      const endLine = args.endLine != null
        ? args.endLine
        : (args.startLine != null && args.maxLines != null ? args.startLine + args.maxLines - 1 : undefined);
      return tools.readFile(root, args.path, { startLine: args.startLine, endLine, signal: options.signal });
    }
    case "get_workspace_state":
      return tools.getWorkspaceState(root, args, { editorReadContext: options.editorReadContext, signal: options.signal });
    case "read_active_document":
      return tools.readActiveDocument(root, args, { editorReadContext: options.editorReadContext, signal: options.signal });
    case "read_open_tabs":
      return tools.readOpenTabs(root, args, { editorReadContext: options.editorReadContext, signal: options.signal });
    case "get_document_structure":
      return tools.getDocumentStructure(root, args, { editorReadContext: options.editorReadContext, signal: options.signal });
    case "search_vault":
      return tools.searchVault(root, args, { editorReadContext: options.editorReadContext, searchGrep: tools.searchGrep, signal: options.signal });
    case "get_link_context":
      return tools.getLinkContext(root, args, { editorReadContext: options.editorReadContext, signal: options.signal });
    case "get_recent_activity":
      return tools.getRecentActivity(root, args, { editorReadContext: options.editorReadContext, signal: options.signal });
    case "preferences_get":
    case "preferences_search":
    case "preferences_export":
      return requestPreferenceAction(name, args, options);
    case "preferences_update":
    case "preferences_reset":
    case "preferences_import":
      if (mode !== "agent") throw new Error(`${name} is only available in agent mode.`);
      return runPreferenceMutationTool(root, settings, name, args, options);
    case "get_conversion_export_state":
    case "get_code_conversion_status":
      if (mode !== "agent") throw new Error(`${name} is only available in agent mode.`);
      return tools.requestConversionExportAction(root, name, args, { requestAppAction: options.requestAppAction, signal: options.signal });
    case "read_conversion_report":
      if (mode !== "agent") throw new Error(`${name} is only available in agent mode.`);
      return tools.readConversionReport(root, args, { signal: options.signal });
    case "export_active_document":
    case "export_active_folder_graph":
    case "start_code_conversion":
      if (mode !== "agent") throw new Error(`${name} is only available in agent mode.`);
      emitAutoApproval(name, args, await ensureToolApproval(root, settings, name, args, options), options);
      return tools.requestConversionExportAction(root, name, args, { requestAppAction: options.requestAppAction, signal: options.signal });
    case "graph_get_state":
      return tools.graphGetState(root, args, { editorReadContext: options.editorReadContext, signal: options.signal });
    case "graph_search_nodes":
      return tools.graphSearchNodes(root, args, { editorReadContext: options.editorReadContext, signal: options.signal });
    case "graph_get_node_context":
      return tools.graphGetNodeContext(root, args, { editorReadContext: options.editorReadContext, signal: options.signal });
    case "graph_find_paths":
      return tools.graphFindPaths(root, args, { editorReadContext: options.editorReadContext, signal: options.signal });
    case "graph_apply_filter":
    case "graph_focus_nodes":
    case "graph_show_local":
    case "graph_clear_focus":
      if (mode === "plan") throw new Error(`${name} is not available in plan mode.`);
      return tools.requestGraphAction(root, name, args, { requestAppAction: options.requestAppAction, signal: options.signal });
    case "git_status":
    case "git_branches":
    case "git_diff":
    case "git_changes_digest":
    case "git_pr_notes":
      return tools.runGitPanelTool(root, name, args, { signal: options.signal });
    case "git_stage":
    case "git_unstage":
    case "git_commit":
    case "git_fetch":
    case "git_pull":
    case "git_push":
    case "git_branch_create":
    case "git_branch_switch":
      if (mode !== "agent") throw new Error(`${name} is only available in agent mode.`);
      emitAutoApproval(name, args, await ensureToolApproval(root, settings, name, args, options), options);
      return tools.runGitPanelTool(root, name, args, { allowGitMutation: true, signal: options.signal });
    case "open_file_in_tab":
    case "create_document_tab":
    case "insert_at_cursor":
    case "replace_selection":
    case "replace_document_range":
    case "extract_selection_to_note":
      if (mode !== "agent") throw new Error(`${name} is only available in agent mode.`);
      emitAutoApproval(name, args, await ensureToolApproval(root, settings, name, args, options), options);
      return tools.requestEditorAction(root, name, args, { requestAppAction: options.requestAppAction, signal: options.signal });
    case "plan_create":
      if (mode !== "agent") throw new Error("plan_create is only available in agent mode.");
      return tools.planCreate(root, args, { signal: options.signal });
    case "plan_list":
      if (mode !== "agent") throw new Error("plan_list is only available in agent mode.");
      return tools.planList(root, args, { signal: options.signal });
    case "plan_read":
      if (mode !== "agent") throw new Error("plan_read is only available in agent mode.");
      return tools.planRead(root, args, { signal: options.signal });
    case "plan_update": {
      if (mode !== "agent") throw new Error("plan_update is only available in agent mode.");
      const updated = await tools.planUpdate(root, args, { signal: options.signal });
      // Folds the former plan_update_status tool: a status/archived change on the
      // same call is applied through the status handler.
      if (args.status != null || args.archived != null) {
        return tools.planUpdateStatus(root, args, { signal: options.signal });
      }
      return updated;
    }
    case "plan_update_status":
      if (mode !== "agent") throw new Error("plan_update_status is only available in agent mode.");
      return tools.planUpdateStatus(root, args, { signal: options.signal });
    case "plan_rebuild_index":
      if (mode !== "agent") throw new Error("plan_rebuild_index is only available in agent mode.");
      return tools.planRebuildIndex(root, args, { signal: options.signal });
    case "apply_edit":
      if (mode !== "agent") throw new Error("apply_edit is only available in agent mode.");
      {
        const approval = await ensureToolApproval(root, settings, name, args, options);
        emitAutoApproval(name, args, approval, options);
        return tools.applyEdit(root, args.path, args.search, args.replacement, {
          allowWrites: true,
          signal: options.signal,
          occurrence: args.occurrence,
          expectedMatches: args.expectedMatches,
          preparedEdit: approval.preparedEdit
        });
      }
    case "write_file":
      if (mode !== "agent") throw new Error("write_file is only available in agent mode.");
      emitAutoApproval(name, args, await ensureToolApproval(root, settings, name, args, options), options);
      return tools.writeFile(root, args.path, args.content, { allowWrites: true, signal: options.signal });
    case "run_command":
      if (mode !== "agent") throw new Error("run_command is only available in agent mode.");
      return runFreeFormCommand(root, settings, args, options);
    case "compile_project":
      if (mode !== "agent") throw new Error("compile_project is only available in agent mode.");
      return tools.compileProject(root, args, getExecutionSecurityOptions(root, settings, options));
    case "run_tests":
      if (mode !== "agent") throw new Error("run_tests is only available in agent mode.");
      return tools.runTests(root, args, getExecutionSecurityOptions(root, settings, options));
    case "restore_dependencies":
      if (mode !== "agent") throw new Error("restore_dependencies is only available in agent mode.");
      return tools.restoreDependencies(root, args, getExecutionSecurityOptions(root, settings, options));
    case "manage_dependencies":
      if (mode !== "agent") throw new Error("manage_dependencies is only available in agent mode.");
      // Folds the former restore_dependencies tool: action "restore" runs a restore.
      if (args.action === "restore") return tools.restoreDependencies(root, args, getExecutionSecurityOptions(root, settings, options));
      return tools.managePackage(root, args, getExecutionSecurityOptions(root, settings, options));
    case "api_asset_search":
      return tools.apiAssetSearch(root, args, { signal: options.signal });
    case "api_asset_get":
      return tools.apiAssetGet(root, args, { signal: options.signal });
    case "request_create":
      return tools.requestCreate(root, args, { signal: options.signal });
    case "request_update":
      return tools.requestUpdate(root, args, { signal: options.signal });
    case "request_send":
      return tools.requestSend(root, args, { signal: options.signal });
    case "request_history_get":
      return tools.requestHistoryGet(root, args, { signal: options.signal });
    case "response_analyze":
      return tools.responseAnalyze(root, args, { signal: options.signal });
    case "environment_get":
      return tools.environmentGet(root, args, { signal: options.signal });
    case "environment_update":
      return tools.environmentUpdate(root, args, { signal: options.signal });
    case "environment_resolve":
      return tools.environmentResolve(root, args, { signal: options.signal });
    case "secret_redact":
      return tools.secretRedact(root, args, { signal: options.signal });
    case "mock_create":
      return tools.mockCreate(root, args, { signal: options.signal });
    case "mock_update":
      return tools.mockUpdate(root, args, { signal: options.signal });
    case "mock_call":
      return tools.mockCall(root, args, { signal: options.signal });
    default:
      throw new Error(`Unsupported AI Companion tool: ${name}`);
  }
}

function getToolInputSummary(toolCall) {
  const name = toolCall.function?.name || toolCall.name || "";
  try {
    const args = parseToolArguments(toolCall.function?.arguments || toolCall.arguments || "{}");
    if (tools.isGitPanelTool?.(name)) return tools.getGitPanelToolInputSummary?.(name, args) || name;
    if (tools.isGraphTool?.(name)) return args.tabId || args.nodeId || args.path || args.query || args.from || args.to || name;
    if (name.startsWith("preferences_")) return getPreferenceInputSummary(name, args);
    if (tools.isConversionExportTool?.(name)) return tools.getConversionExportToolInputSummary?.(name, args) || name;
    return args.path || args.targetPath || args.packageId || args.expectedPath || args.pattern || args.query || args.command || args.source || name;
  } catch (_error) {
    return name;
  }
}

function createAssistantToolMessage(message, toolCalls) {
  const assistantMessage = {
    role: "assistant",
    content: message.content || ""
  };
  const providerToolCalls = toolCalls.filter((call) => call?.harnessGenerated !== true);
  if (providerToolCalls.length) assistantMessage.tool_calls = providerToolCalls.map((call) => call.raw || call);
  return assistantMessage;
}

/**
 * Represent a harness-executed action without claiming the provider authored a function
 * call. The stable observation id remains available to intent evidence tracking.
 */
function createHarnessObservationMessage(toolCall, name, args, outcome, status = "completed") {
  const preferenceResult = name.startsWith("preferences_");
  const observation = stringifyToolResult({
    type: "harness-tool-observation",
    observationId: toolCall.id,
    tool: name,
    arguments: args || {},
    status,
    outcome
  }, preferenceResult ? MAX_PREFERENCE_TOOL_RESULT_CHARS : MAX_TOOL_RESULT_CHARS, preferenceResult ? 0 : 2);
  return {
    role: "user",
    content: `Harness-executed tool observation (authoritative environment context; not user-authored or model-authored):\n${observation}`
  };
}

function createToolOutcomeHistoryMessage(toolCall, name, args, outcome, status = "completed") {
  if (toolCall?.harnessGenerated === true) {
    return createHarnessObservationMessage(toolCall, name, args, outcome, status);
  }
  const preferenceResult = name.startsWith("preferences_");
  return {
    role: "tool",
    tool_call_id: toolCall.id,
    content: stringifyToolResult(outcome, preferenceResult ? MAX_PREFERENCE_TOOL_RESULT_CHARS : MAX_TOOL_RESULT_CHARS, preferenceResult ? 0 : 2)
  };
}

function sanitizeChatTitle(value) {
  const singleLine = String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'`*_\s:.-]+|["'`*_\s:.-]+$/g, "");
  const words = singleLine.split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
  return words.length > 48 ? `${words.slice(0, 45)}...` : words;
}

function extractChatTitleFromContent(content) {
  const text = String(content || "");
  const match = text.match(/<chat_title>\s*([\s\S]*?)\s*<\/chat_title>/i);
  return {
    chatTitle: sanitizeChatTitle(match?.[1] || ""),
    content: text.replace(/<chat_title>[\s\S]*?<\/chat_title>/gi, "").trim()
  };
}

function consumeChatTitleFromMessage(message, titleState, emit) {
  if (!titleState.requested || titleState.emitted) return message;
  const parsed = extractChatTitleFromContent(message?.content);
  if (parsed.chatTitle) {
    titleState.emitted = true;
    emit({ type: "chat-title", chatTitle: parsed.chatTitle });
  }
  return { ...message, content: parsed.content };
}

function getInitialDiscoveryToolName(_prompt) {
  // Must be a tool that is ALWAYS present in the roster; otherwise forcing it via
  // tool_choice fails on strict providers (e.g. Gemini: "allowed_function_names should
  // be a subset of function_declarations"). `glob` is a core, always-available reader.
  // (Previously returned list_files / read_open_tabs, which the tool consolidation
  // removed — leaving a dead forced tool name.)
  return "glob";
}

function getInitialDiscoveryToolArgs(toolName) {
  if (toolName === "glob") return { pattern: "**/*", maxFiles: DEFAULT_LIST_FILES_TOOL_MAX_FILES };
  return toolName === "read_open_tabs"
    ? { includeContent: false, maxTabs: 25 }
    : { maxFiles: DEFAULT_LIST_FILES_TOOL_MAX_FILES };
}

function createInitialDiscoveryToolCall(round, prompt) {
  const name = getInitialDiscoveryToolName(prompt);
  return createLocalToolCall(name, getInitialDiscoveryToolArgs(name), round, "discovery");
}

function getToolChoiceForRound(usedTools, prompt) {
  if (usedTools) return "auto";
  return { type: "function", function: { name: getInitialDiscoveryToolName(prompt) } };
}

/**
 * Surface the model's pre-tool narration ("what I found, what I'll do next") to the panel.
 *
 * @param {{ accept: (value: string) => string | null } | null} narrationFilter - Per-run
 *   quality/dedupe gate; null for modes that do not surface narration.
 * @param {(event: object) => void} emit - Panel event channel.
 * @param {string} content - Assistant message content emitted alongside tool calls.
 *   Filtering applies to the emitted event only; the raw content stays in message history.
 */
function emitNarration(narrationFilter, emit, content) {
  if (!narrationFilter) return;
  const text = narrationFilter.accept(content);
  if (text) emit({ type: "narration", content: text });
}

/**
 * The `read_file` tool only ever sees what's on disk. If the user has unsaved edits open in
 * the editor — the common case when they ask the agent to "review what I just changed" — a
 * tool-based read would miss exactly the content they're asking about. `activeFile` carries
 * the live editor buffer straight from the renderer so the model starts with ground truth
 * instead of having to be told to re-read a file it can't get fresher data from anyway.
 */
function buildActiveFileMessage(activeFile) {
  if (!activeFile || typeof activeFile.content !== "string" || !activeFile.path) return null;
  return {
    role: "system",
    content: [
      `The user currently has this file open in the editor: ${activeFile.path}`,
      "This is the live buffer and may include unsaved changes not yet written to disk — treat it as more current than anything a read_file call would return for this path.",
      "Tool calls (read_file, apply_edit, write_file) still operate on the file as saved on disk, so base search/replace text on this content, not on a fresh read_file result for the same path.",
      "",
      truncateText(activeFile.content, MAX_ACTIVE_FILE_CHARS)
    ].join("\n")
  };
}

function buildAttachmentContextMessage(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return null;
  const lines = ["The user attached these text files to the current prompt. Use this attached content as direct prompt context; saved chat history only keeps file references."];
  let remainingChars = MAX_ATTACHMENT_TOTAL_CHARS;
  for (const attachment of attachments) {
    if (remainingChars <= 0) break;
    const name = String(attachment?.name || attachment?.path || "file").trim() || "file";
    const path = String(attachment?.path || "").trim();
    const rawContent = String(attachment?.content || "");
    if (!rawContent.trim()) continue;
    const cappedLength = Math.min(MAX_ATTACHMENT_FILE_CHARS, remainingChars);
    const content = truncateText(rawContent, cappedLength);
    remainingChars -= content.length;
    lines.push("", `Attached file: ${name}${path ? ` (${path})` : ""}`, content);
  }
  return lines.length > 1 ? { role: "system", content: lines.join("\n") } : null;
}

function getImageAttachments(attachments) {
  return (Array.isArray(attachments) ? attachments : []).filter((attachment) => {
    const dataUrl = String(attachment?.dataUrl || "");
    return dataUrl && (attachment?.kind === "image" || dataUrl.startsWith("data:image/"));
  });
}

function buildCurrentUserMessage(prompt, attachments) {
  const images = getImageAttachments(attachments);
  if (!images.length) return { role: "user", content: String(prompt || "") };
  const text = String(prompt || "").trim() || "Please use the attached image(s).";
  return {
    role: "user",
    content: [
      { type: "text", text },
      ...images.map((attachment) => ({ type: "image_url", image_url: { url: String(attachment.dataUrl || "") } }))
    ]
  };
}

function getMessageContentEstimateText(content) {
  if (!Array.isArray(content)) return String(content || "");
  return content.map((part) => {
    if (part?.type === "text") return String(part.text || "");
    if (part?.type === "image_url") return "[attached image]";
    return "";
  }).filter(Boolean).join("\n");
}

function normalizeConversationHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map((message) => {
    const role = message?.role === "assistant" ? "assistant" : (message?.role === "user" ? "user" : "");
    const content = truncateText(message?.content, MAX_CONVERSATION_HISTORY_MESSAGE_CHARS).trim();
    return role && content ? { role, content } : null;
  }).filter(Boolean).slice(-MAX_CONVERSATION_HISTORY_MESSAGES);
}

/**
 * Build the system message that separates prior turns from the current prompt.
 *
 * Conversation history — especially interrupted-task progress summaries — can read
 * like unfinished work the model should pick back up, causing it to answer an old
 * question instead of the new one. This boundary states that everything above is
 * background only and the next user message is the task to perform.
 */
function buildHistoryBoundaryMessage() {
  return {
    role: "system",
    content: "The conversation-history messages above are prior turns from this chat, included as background context only. Do not resume or continue any earlier task unless the user explicitly asks you to. The user's next message is the current request; it supersedes the prior conversation history and is the only task to perform."
  };
}

function isTokenLimitFinishReason(reason) {
  return /^(length|max_tokens|token_limit|content_length)$/i.test(String(reason || ""));
}

function isTokenLimitProviderError(error) {
  if (error?.aiStopReason === "max_tokens") return true;
  return /max[_\s-]*tokens?|output limit|token limit|context length|finish(?:ed)? the message/i.test(String(error?.message || error || ""));
}

function getProviderErrorMessage(error) {
  return String(error?.message || error || "").trim();
}

function compactToolResultMessagesForContinuation(messages) {
  if (!Array.isArray(messages)) return 0;
  let compacted = 0;
  for (const message of messages) {
    if (message?.role !== "tool") continue;
    const content = String(message.content || "");
    if (content.length <= COMPACTED_TOOL_RESULT_CHARS) continue;
    message.content = [
      `[AI Companion compacted this prior tool result after a token-limit continuation. Original length: ${content.length} chars.]`,
      content.slice(0, COMPACTED_TOOL_RESULT_CHARS),
      "...[compacted for continuation]"
    ].join("\n");
    compacted += 1;
  }
  return compacted;
}

/**
 * Per-round response cap from settings (agentMaxResponseTokens). Returns undefined when the cap
 * is disabled (0) so the request carries no max_tokens and the provider uses its own maximum.
 */
function getRoundResponseMaxTokens(options = {}) {
  const configured = Number(options.agentMaxResponseTokens);
  if (configured === 0) return undefined;
  if (Number.isFinite(configured) && configured > 0) return configured;
  return Number(options.maxResponseTokens) || 2000;
}

function getFinalAnswerMaxTokens(options = {}) {
  const roundCap = getRoundResponseMaxTokens(options);
  if (typeof roundCap === "undefined") return undefined;
  return Math.max(1800, roundCap);
}

function getIncreasedFinalAnswerMaxTokens(options = {}) {
  const base = getFinalAnswerMaxTokens(options);
  if (typeof base === "undefined") return undefined;
  return Math.max(3600, base * 2);
}

function getTaskLimitLabel(reason, context = {}) {
  // Two very different stops share reason "max_tokens": the client-side per-minute budget
  // (identified by maxTokensPerChatMinute on the context) and the provider truncating one
  // response at its max_tokens cap. Label them distinctly so the approval pill says which.
  if (reason === "max_tokens") return context.maxTokensPerChatMinute ? "token budget reached" : "response limit reached";
  if (reason === "max_actions") return "max actions";
  return "task stop";
}

function describeTaskLimit(context = {}) {
  if (context.reason === "max_tokens" && context.maxTokensPerChatMinute) return `the chat reached the maximum of ${context.maxTokensPerChatMinute} estimated token(s) per minute`;
  if (context.reason === "max_tokens") return "the model reported that it reached its token limit";
  if (context.reason === "max_actions") return `the task reached the maximum of ${context.maxRounds || 0} tool round(s) for this pass`;
  return "the task stopped before it could finish";
}

function createTaskLimitPreview(context = {}) {
  return [
    `Reason: ${describeTaskLimit(context)}.`,
    context.mode ? `Mode: ${context.mode}` : "",
    context.phase ? `Phase: ${context.phase}` : "",
    context.finishReason ? `Provider finish reason: ${context.finishReason}` : "",
    context.providerStatus ? `Provider status: ${context.providerStatus}` : "",
    context.providerMessage ? `Provider message:\n${context.providerMessage}` : "",
    "",
    "Choose Continue to let the task keep working, or Stop to cancel it now."
  ].filter(Boolean).join("\n");
}

function createContinuationMessage(context = {}, decision = {}) {
  return {
    role: "user",
    content: [
      `The user approved continuing after ${describeTaskLimit(context)}.`,
      decision.instructions ? `Additional user instructions: ${decision.instructions}` : "Continue from the current workspace context and avoid repeating completed tool work."
    ].filter(Boolean).join("\n")
  };
}

function createTaskLimitFallbackContent(context = {}) {
  return `Task paused because ${describeTaskLimit(context)}. No continuation approval channel was available, so I stopped without running more actions.`;
}

async function requestTaskContinuation(context = {}, options = {}) {
  const isResponseLimit = context.reason === "max_tokens" && !context.maxTokensPerChatMinute;
  // With the response cap disabled (agentMaxResponseTokens = 0, e.g. via "Always approve"),
  // response-limit stops continue silently instead of interrupting the user.
  if (isResponseLimit && options.autoContinueOnResponseLimit) return { approved: true };
  if (typeof options.requestApproval !== "function") {
    return { approved: false, content: createTaskLimitFallbackContent(context) };
  }
  const decision = normalizeApprovalDecision(await options.requestApproval({
    tool: TASK_LIMIT_TOOL_NAME,
    input: getTaskLimitLabel(context.reason, context),
    summary: `Task reached ${getTaskLimitLabel(context.reason, context)}`,
    preview: createTaskLimitPreview(context),
    approvalKind: "task-limit",
    limitKind: isResponseLimit ? "response-limit" : "token-budget",
    approveLabel: "Continue",
    rejectLabel: "Stop",
    allowAlwaysApprove: isResponseLimit,
    allowInstructions: false
  }));
  if (decision.approved) return decision;
  const error = new Error(`AI Companion request cancelled after ${describeTaskLimit(context)}.`);
  error.cancelled = true;
  throw error;
}

function getFinalAnswerPrompt(options = {}) {
  if (options.finalAnswerPrompt) return String(options.finalAnswerPrompt);
  return String(options.prompts?.toolLoopFinalAnswer || DEFAULT_AI_COMPANION_PROMPTS.toolLoopFinalAnswer);
}

async function streamFinalAnswer(provider, messages, emit, options = {}) {
  messages.push({
    role: "user",
    content: getFinalAnswerPrompt(options)
  });
  let finishReason = "";
  let content = "";
  try {
    content = await provider.complete(messages, {
      temperature: 0.2,
      maxTokens: getFinalAnswerMaxTokens(options),
      signal: options.signal,
      onToken: (token) => {
        if (!token) return;
        emit({ type: "content-delta", content: token });
      },
      onReasoningToken: (token) => emit({ type: "reasoning-delta", content: token }),
      onFinishReason: (reason) => { finishReason = reason || finishReason; },
      onUsage: (usage) => emit({ type: "usage", ...usage, reported: true }),
      onDebug: createProviderDebugEmitter(emit)
    });
  } catch (error) {
    if (!isTokenLimitProviderError(error)) throw error;
    const context = {
      reason: "max_tokens",
      mode: options.mode || "",
      phase: "final answer",
      providerStatus: error?.providerStatus || "",
      providerMessage: getProviderErrorMessage(error)
    };
    const continuation = await requestTaskContinuation(context, options);
    if (!continuation.approved) return continuation.content || createTaskLimitFallbackContent(context);
    compactToolResultMessagesForContinuation(messages);
    messages.push(createContinuationMessage(context, continuation));
    return streamFinalAnswer(provider, messages, emit, {
      ...options,
      finalAnswerPrompt: options.prompts?.toolLoopContinuation || DEFAULT_AI_COMPANION_PROMPTS.toolLoopContinuation
    });
  }
  if (options.requestChatTitle === true) content = extractChatTitleFromContent(content).content;
  if (!isTokenLimitFinishReason(finishReason)) return content;
  const context = { reason: "max_tokens", mode: options.mode || "", phase: "final answer", finishReason };
  const continuation = await requestTaskContinuation(context, options);
  if (!continuation.approved) {
    const fallback = continuation.content || createTaskLimitFallbackContent(context);
    emit({ type: "content-delta", content: `\n\n${fallback}` });
    return [content, fallback].filter(Boolean).join("\n\n");
  }
  messages.push({ role: "assistant", content });
  compactToolResultMessagesForContinuation(messages);
  messages.push(createContinuationMessage(context, continuation));
  const continued = await streamFinalAnswer(provider, messages, emit, {
    ...options,
    finalAnswerPrompt: options.prompts?.toolLoopContinuation || DEFAULT_AI_COMPANION_PROMPTS.toolLoopContinuation
  });
  return [content, continued].filter(Boolean).join("\n");
}

function shouldAssessCompletion(settings, contract) {
  return settings?.intentContractsEnabled === true
    && settings?.intentExperiment?.intentCompletionAssessment === true
    && contract
    && (["provisional", "unverified"].includes(contract.verifiability)
      || ["diagnostic", "implementation", "planning", "conformance"].includes(contract.taskType));
}

async function generateHiddenCandidate(provider, messages, emit, options = {}) {
  const candidateMessages = messages.concat([{
    role: "user",
    content: [
      getFinalAnswerPrompt(options),
      String(options.prompts?.completionFinalAnswer || DEFAULT_AI_COMPANION_PROMPTS.completionFinalAnswer || "")
    ].filter(Boolean).join(" ")
  }]);
  let finishReason = "";
  let content;
  try {
    content = await provider.complete(candidateMessages, {
      temperature: 0.2,
      maxTokens: getFinalAnswerMaxTokens(options),
      signal: options.signal,
      onReasoningToken: (token) => emit({ type: "reasoning-delta", content: token }),
      onFinishReason: (reason) => { finishReason = reason || finishReason; },
      onUsage: (usage) => emit({ type: "usage", ...usage, reported: true }),
      onDebug: createProviderDebugEmitter(emit)
    });
  } catch (error) {
    if (!isTokenLimitProviderError(error)) throw error;
    const context = { reason: "max_tokens", mode: options.mode || "", phase: "completion candidate", providerMessage: getProviderErrorMessage(error) };
    const continuation = await requestTaskContinuation(context, options);
    if (!continuation.approved) return continuation.content || createTaskLimitFallbackContent(context);
    compactToolResultMessagesForContinuation(messages);
    messages.push(createContinuationMessage(context, continuation));
    return generateHiddenCandidate(provider, messages, emit, options);
  }
  if (options.requestChatTitle === true) content = extractChatTitleFromContent(content).content;
  if (!isTokenLimitFinishReason(finishReason)) return String(content || "").trim();
  const context = { reason: "max_tokens", mode: options.mode || "", phase: "completion candidate", finishReason };
  const continuation = await requestTaskContinuation(context, options);
  if (!continuation.approved) return [content, continuation.content || createTaskLimitFallbackContent(context)].filter(Boolean).join("\n\n");
  messages.push({ role: "assistant", content });
  compactToolResultMessagesForContinuation(messages);
  messages.push(createContinuationMessage(context, continuation));
  const continued = await generateHiddenCandidate(provider, messages, emit, options);
  return [content, continued].filter(Boolean).join("\n");
}

function ambiguityHasValidResolution(ambiguity, evidenceLedger) {
  if (ambiguity?.status !== "resolved") return false;
  const resolution = ambiguity.resolution || {};
  if (resolution.source === "user") return !!String(resolution.answer || "").trim();
  if (resolution.source !== "evidence" || !Array.isArray(resolution.evidenceIds) || !resolution.evidenceIds.length) return false;
  const byId = new Map((evidenceLedger || []).map((entry) => [entry.id, entry]));
  return resolution.evidenceIds.every((id) => completionEvidence.isEvidenceAdmissible(byId.get(id)));
}

function unresolvedPlanAmbiguities(contract, evidenceLedger) {
  return (contract?.ambiguities || []).filter((ambiguity) => (
    ambiguity?.blocking === true && !ambiguityHasValidResolution(ambiguity, evidenceLedger)
  ));
}

async function runPlanFinalizationGate(provider, settings, loopOptions, messages, emit, activityRun) {
  if (loopOptions.mode !== "plan" || loopOptions.planFinalizationGateConsumed === true) {
    return { rerunPlanning: false, unresolved: unresolvedPlanAmbiguities(loopOptions.intentContract, activityRun?.listEvidence?.() || []) };
  }
  const unresolved = unresolvedPlanAmbiguities(loopOptions.intentContract, activityRun?.listEvidence?.() || []);
  if (!unresolved.length) return { rerunPlanning: false, unresolved: [] };
  loopOptions.planFinalizationGateConsumed = true;
  if (settings.intentExperiment?.intentClarification !== true || settings.intentClarificationMode === "off" || typeof loopOptions.requestClarification !== "function") {
    return { rerunPlanning: false, unresolved };
  }
  const batch = await intentClarification.runClarificationBatch({
    contract: loopOptions.intentContract,
    requestClarification: loopOptions.requestClarification,
    mode: "plan",
    phase: "plan-finalization",
    settings: { ...settings, intentClarificationMode: "ask" },
    signal: loopOptions.signal
  });
  if (!batch.changed) return { rerunPlanning: false, unresolved };
  let updated = batch.contract;
  if (batch.clarifications.length) {
    const refreshed = await intentAnalysis.refreshContractFromUserContext({
      provider,
      settings,
      prompts: loopOptions.prompts,
      contract: loopOptions.intentContract,
      userContext: batch.clarifications.map((entry) => `${entry.question}\nAnswer: ${entry.answer}`).join("\n\n"),
      signal: loopOptions.signal
    });
    if (refreshed.contract && refreshed.validation.valid) {
      updated = intentClarification.applyClarifications(refreshed.contract, batch.clarifications, []);
    }
  }
  applyContractUpdate(loopOptions, messages, settings, emit, updated, "plan-finalization-clarification", "refreshed");
  return { rerunPlanning: true, unresolved: unresolvedPlanAmbiguities(updated, activityRun?.listEvidence?.() || []) };
}

function addPlanAmbiguityContext(messages, ambiguities, loopOptions) {
  if (!ambiguities.length || loopOptions.planAmbiguityContextAdded) return;
  loopOptions.planAmbiguityContextAdded = true;
  messages.push({
    role: "system",
    content: [
      "The Plan finalization clarification gate is complete. The proposed plan must explicitly record these unresolved blocking ambiguities and must not silently choose answers:",
      ...ambiguities.map((ambiguity) => `- ${ambiguity.id}: ${ambiguity.question}`)
    ].join("\n")
  });
}

async function finalizeAssessedCandidate(provider, settings, mode, candidate, loopOptions, activityRun, emit) {
  const normalizedCandidate = mode === "plan"
    ? planFinalization.normalizeProposedPlanBlock(candidate)
    : String(candidate || "").trim();
  activityRun.recordCandidateEvidence(normalizedCandidate);
  const evidenceLedger = activityRun.listEvidence();
  const assessed = await completionAssessment.assessAcceptanceCriteria({
    provider,
    settings,
    prompts: loopOptions.prompts,
    contract: loopOptions.intentContract,
    candidate: normalizedCandidate,
    evidenceLedger,
    signal: loopOptions.signal,
    onUsage: (usage) => emit({ type: "usage", ...usage, reported: true }),
    onDebug: createProviderDebugEmitter(emit)
  });
  let finalCandidate = normalizedCandidate;
  let rewriteDiagnostics = [];
  if (assessed.assessment.overallStatus === "incomplete") {
    const rewritten = await completionResponseRewrite.rewriteIncompleteCandidate({
      provider,
      settings,
      mode,
      candidate: normalizedCandidate,
      assessment: assessed.assessment,
      evidenceLedger,
      contract: loopOptions.intentContract,
      signal: loopOptions.signal,
      onUsage: (usage) => emit({ type: "usage", ...usage, reported: true }),
      onDebug: createProviderDebugEmitter(emit)
    });
    rewriteDiagnostics = rewritten.diagnostics;
    finalCandidate = rewritten.valid
      ? (mode === "plan" ? planFinalization.normalizeProposedPlanBlock(rewritten.content) : rewritten.content)
      : "";
  }
  const section = completionAssessment.renderAssessmentSection(loopOptions.intentContract, assessed.assessment);
  const finalContent = mode === "plan"
    ? planFinalization.insertPlanAssessmentSection(finalCandidate, section)
    : [finalCandidate, section].filter(Boolean).join("\n\n");
  activityRun.setCompletionAssessment(assessed.assessment);
  emit({
    type: "completion-assessment",
    assessment: assessed.assessment,
    evidenceLedger,
    diagnostics: assessed.diagnostics,
    rewriteDiagnostics
  });
  return { content: finalContent, assessment: assessed.assessment };
}

/**
 * Steering "revise-contract" route (Phase 2): auto-ask one clarification mid-run and fold the
 * answer into the contract, so the next steered pass targets a corrected contract. Ambiguity
 * uses the contract's blocking ambiguities; spec-gap asks directly about the inferred unmet
 * criteria. Returns true when the contract was updated; false when clarification is
 * unavailable or produced no change (the caller then falls back to feedback-only steering).
 */
async function runSteeringClarification(provider, settings, loopOptions, messages, emit, decision, assessment) {
  if (settings.intentExperiment?.intentClarification !== true
    || settings.intentClarificationMode === "off"
    || typeof loopOptions.requestClarification !== "function") {
    return false;
  }
  let userContext = "";
  if (decision.reason === "ambiguity") {
    const batch = await intentClarification.runClarificationBatch({
      contract: loopOptions.intentContract,
      requestClarification: loopOptions.requestClarification,
      mode: loopOptions.mode || "agent",
      phase: "completion-steering",
      settings: { ...settings, intentClarificationMode: "ask" },
      signal: loopOptions.signal
    });
    if (!batch.changed || !batch.clarifications.length) return false;
    userContext = batch.clarifications.map((entry) => `${entry.question}\nAnswer: ${entry.answer}`).join("\n\n");
  } else {
    const criteriaById = new Map((loopOptions.intentContract.acceptanceCriteria || []).map((criterion) => [criterion.id, criterion]));
    const inferred = (assessment.criteria || [])
      .filter((verdict) => verdict.status === "unmet")
      .map((verdict) => criteriaById.get(verdict.id))
      .filter((criterion) => criterion && criterion.provenance === "inferred");
    if (!inferred.length) return false;
    const wording = inferred.map((criterion) => `"${criterion.statement || criterion.description}"`).join("; ");
    const answer = String(await loopOptions.requestClarification({
      ambiguityId: "steering-spec-gap",
      question: `I inferred this requirement, which is not yet satisfied: ${wording}. Is it actually required, or should the goal be adjusted? Please clarify what you want.`,
      reason: "This acceptance criterion was inferred by the assistant, not stated in your request.",
      answerType: "free_text",
      choices: []
    }) || "").trim();
    if (!answer) return false;
    userContext = `Clarification about an inferred requirement (${wording}):\nAnswer: ${answer}`;
  }
  const refreshed = await intentAnalysis.refreshContractFromUserContext({
    provider,
    settings,
    prompts: loopOptions.prompts,
    contract: loopOptions.intentContract,
    userContext,
    signal: loopOptions.signal
  });
  if (refreshed.contract && refreshed.validation.valid) {
    applyContractUpdate(loopOptions, messages, settings, emit, refreshed.contract, "completion-steering-clarification", "refreshed");
    return true;
  }
  return false;
}

function clampLoopInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function getMaxToolRounds(mode, settings = {}) {
  // gitSummary answers mostly from the provided digest; tools are follow-up only.
  if (mode === "gitSummary") return 4;
  return clampLoopInteger(settings.maxTasksPerChat, DEFAULT_MAX_TASKS_PER_CHAT, 1, 200);
}

function getMaxTokensPerChatMinute(settings = {}) {
  return clampLoopInteger(settings.maxTokensPerChatMinute, DEFAULT_MAX_TOKENS_PER_CHAT_MINUTE, 0, 1000000);
}

function createTokenMinuteBudget(settings = {}) {
  return {
    maxTokens: getMaxTokensPerChatMinute(settings),
    windowStartedAt: Date.now(),
    usedTokens: 0
  };
}

async function reserveTokenMinuteBudget(tokenBudget, estimatedTokens, mode, loopOptions, messages) {
  if (!tokenBudget?.maxTokens || mode === "gitSummary") return { approved: true };
  const now = Date.now();
  if (now - tokenBudget.windowStartedAt >= TOKEN_LIMIT_WINDOW_MS) {
    tokenBudget.windowStartedAt = now;
    tokenBudget.usedTokens = 0;
  }
  const tokenCount = Math.max(0, Number(estimatedTokens) || 0);
  if (tokenBudget.usedTokens + tokenCount <= tokenBudget.maxTokens) {
    tokenBudget.usedTokens += tokenCount;
    return { approved: true };
  }
  const context = { reason: "max_tokens", mode, phase: "chat token budget", maxTokensPerChatMinute: tokenBudget.maxTokens };
  const continuation = await requestTaskContinuation(context, loopOptions);
  if (!continuation.approved) return { approved: false, content: continuation.content || createTaskLimitFallbackContent(context) };
  messages.push(createContinuationMessage(context, continuation));
  tokenBudget.windowStartedAt = Date.now();
  tokenBudget.usedTokens = tokenCount;
  return { approved: true };
}

/**
 * Revalidate and run one persisted approval action before returning control to the model.
 * The canonical executor remains responsible for intent, policy, grants, and approval.
 */
async function replayResumeCheckpoint(root, settings, mode, messages, activityRun, emit, loopOptions) {
  if (!loopOptions.resumeCheckpoint) return { usedTools: false };
  let validation = await validateResumeCheckpoint(root, loopOptions.resumeCheckpoint);
  if (validation.canReplay) {
    const descriptor = approvalCapabilities.describe(validation.action.tool, validation.action.args, { effectiveSecurityPolicy: loopOptions.securityContext?.policy });
    const capabilityMatches = !validation.action.capability || descriptor?.capability === validation.action.capability;
    const resourceMatches = !validation.action.resource || JSON.stringify(descriptor?.resource || null) === JSON.stringify(validation.action.resource);
    if (!descriptor || !capabilityMatches || !resourceMatches) {
      validation = { ...validation, canReplay: false, reason: "The saved action no longer matches its approval capability or resource." };
    }
  }
  messages.push({ role: "system", content: createResumeContextMessage(loopOptions.resumeCheckpoint, validation) });
  if (!validation.canReplay) return { usedTools: false };

  const action = validation.action;
  const toolCall = createLocalToolCall(action.tool, action.args, 0, "resume");
  const name = action.tool;
  const args = action.args;
  const input = getToolInputSummary(toolCall);
  const activityId = action.activityId || toolCall.id;
  const startedActivity = activityRun?.createStartedActivity(activityId, name, args, input) || null;
  messages.push(createAssistantToolMessage({ content: "Retrying the exact action saved before the restart." }, [toolCall]));
  emit({ type: "tool", tool: name, input, summary: "running", activity: startedActivity });
  try {
    await activityRun?.captureBefore(name, args, loopOptions.signal);
    const result = await executeAgentTool(root, settings, mode, toolCall, { ...loopOptions, emit, activityId });
    recordToolReliability(loopOptions, result);
    const summary = summarizeToolResult(name, result);
    const mutationDetails = await activityRun?.completeMutation(name, args, loopOptions.signal);
    const finishedActivity = startedActivity ? activityRun.createFinishedActivity(startedActivity, args, result, summary, mutationDetails) : null;
    activityRun?.recordToolEvidence?.({ toolCallId: activityId, tool: name, args, result, summary: summarizeToolEvidence(name, result), mutationDetails });
    emit({
      type: "tool",
      tool: name,
      input,
      summary,
      activity: finishedActivity
    });
    messages.push(createToolOutcomeHistoryMessage(toolCall, name, args, createToolResultContent(name, args, result)));
  } catch (error) {
    recordToolReliability(loopOptions, null, error);
    const errorMessage = error?.message || String(error);
    const structuredFailure = createStructuredToolFailure(error);
    activityRun?.recordToolEvidence?.({ toolCallId: activityId, tool: name, args, error, summary: errorMessage });
    emit({
      type: "tool-error",
      tool: name,
      input,
      error: errorMessage,
      activity: startedActivity ? activityRun?.createFailedActivity(startedActivity, args, errorMessage, structuredFailure) : null
    });
    messages.push(createToolOutcomeHistoryMessage(toolCall, name, args, createToolErrorContent(error), "failed"));
  }
  return { usedTools: true };
}

/** Modes that participate in the intent-contract phase. */
const INTENT_CONTRACT_MODES = new Set(["chat", "agent", "plan"]);

/**
 * Replace the single authoritative contract system message in place, or insert one just
 * before the current user message when none exists yet. Used after a refresh/amendment.
 *
 * @param {object[]} messages - The running message array.
 * @param {object} contractMessage - The new contract system message.
 */
function replaceContractMessage(messages, contractMessage) {
  const index = messages.findIndex((message) => message.role === "system" && typeof message.content === "string" && message.content.includes("Authoritative task contract"));
  if (index >= 0) messages[index] = contractMessage;
  else messages.splice(Math.max(1, messages.length - 1), 0, contractMessage);
}

/**
 * Apply a contract change to the running loop: swap the shared contract, replace the
 * injected message, and emit a revised/amended event.
 *
 * @param {object} loopOptions - Loop options holding intentContract.
 * @param {object[]} messages - The running message array.
 * @param {object} settings - Normalized settings (injection budget).
 * @param {(event: object) => void} emit - Panel event channel.
 * @param {object} contract - The updated contract.
 * @param {string} source - Event source label (conflict|harness-auto).
 */
function applyContractUpdate(loopOptions, messages, settings, emit, contract, source, variant = "revised", extra = {}) {
  loopOptions.intentContract = contract;
  loopOptions.intentMutationBlockResults?.clear();
  loopOptions.intentDecisionBlockAttempts?.clear();
  if (loopOptions.intentContractMeta) {
    loopOptions.intentContractMeta = {
      ...loopOptions.intentContractMeta,
      verifiability: contract.verifiability,
      revision: (Number(loopOptions.intentContractMeta.revision) || 0) + 1,
      updatedAt: new Date().toISOString()
    };
  }
  replaceContractMessage(messages, intentContract.buildContractInjectionMessage(contract, { maxChars: settings.intentInjectedMaxChars }));
  emit({ type: "intent-contract", variant, source, contract, meta: loopOptions.intentContractMeta || null, ...extra });
}

/**
 * Handle a model-reported report_intent_conflict call: validate, route by
 * provenance/authority, and apply one bounded revision (or record a controlling
 * decision when the budget is spent or the field is semantic). Returns a tool result.
 *
 * @returns {object} A structured tool result describing the outcome.
 */
async function handleIntentConflictReport(args, provider, loopOptions, messages, settings, emit) {
  const contract = loopOptions.intentContract;
  const tracker = loopOptions.searchTracker;
  if (!contract || !tracker) return { status: "ignored", note: "Intent contract is not active." };
  const validation = intentConflict.validateConflictReport(args, { contract, tracker });
  if (!validation.valid) return { status: "rejected", errors: validation.errors };
  const route = intentConflict.routeConflict(validation.resolved, settings);
  if (route.action === "reject") return { status: "rejected", reason: route.reason };
  const budget = loopOptions.conflictBudget || (loopOptions.conflictBudget = { used: 0 });
  if (route.action === "revise" && budget.used < 1) {
    budget.used += 1;
    applyContractUpdate(loopOptions, messages, settings, emit, intentConflict.reviseContractForConflict(contract, { resolved: validation.resolved, conflictType: args.conflictType, trigger: "model-reported" }), "conflict");
    return { status: "revised", fieldRef: args.fieldRef, conflictType: args.conflictType };
  }
  if (route.action === "ask" && typeof loopOptions.requestClarification === "function") {
    const answer = String(await loopOptions.requestClarification({
      ambiguityId: `conflict-${args.fieldRef}`,
      question: `Workspace evidence conflicts with ${args.fieldRef}. How should the task contract be corrected?`,
      reason: args.explanation || `Evidence suggests ${args.conflictType}.`,
      answerType: "free_text",
      choices: []
    }) || "").trim();
    if (answer) {
      const refreshed = await intentAnalysis.refreshContractFromUserContext({
        provider,
        settings,
        prompts: loopOptions.prompts,
        contract,
        userContext: `Conflict: ${args.fieldRef} (${args.conflictType}).\nEvidence note: ${args.explanation || ""}\nUser correction: ${answer}`,
        signal: loopOptions.signal
      });
      if (refreshed.contract && refreshed.validation.valid) {
        applyContractUpdate(loopOptions, messages, settings, emit, refreshed.contract, "conflict-clarification");
        return { status: "clarified", fieldRef: args.fieldRef, conflictType: args.conflictType };
      }
    }
  }
  // Semantic conflict, or budget exhausted: record a controlling decision -- never silent.
  applyContractUpdate(loopOptions, messages, settings, emit, intentConflict.recordConflictAsDecision(contract, { resolved: validation.resolved, conflictType: args.conflictType, explanation: args.explanation }), "conflict");
  return { status: "recorded", fieldRef: args.fieldRef, conflictType: args.conflictType };
}

/**
 * Record a completed search tool result into the tracker and run harness-auto absence
 * detection, applying one bounded revision when a target is conclusively absent.
 */
function recordSearchAndDetectAbsence(name, args, result, toolCallId, loopOptions, messages, settings, emit, flags = {}) {
  const tracker = loopOptions.searchTracker;
  const contract = loopOptions.intentContract;
  if (!tracker || !contract || !intentConflict.SEARCH_TOOLS.has(name)) return;
  if (name === "read_open_tabs") {
    const tabs = Array.isArray(result?.tabs) ? result.tabs : (Array.isArray(result) ? result : []);
    for (const tab of tabs) {
      const tabPath = tab && (tab.path || tab.value || (typeof tab === "string" ? tab : ""));
      if (tabPath) tracker.add({ toolCallId: `${toolCallId}:${tabPath}`, tool: "read_open_tabs", query: String(tabPath) });
    }
  } else {
    tracker.add({ toolCallId, ...intentConflict.normalizeSearchRecord(name, args, result, flags) });
  }
  const confirmed = intentConflict.detectConfirmedTargets(loopOptions.intentContract, tracker);
  if (confirmed.length) {
    applyContractUpdate(loopOptions, messages, settings, emit, intentConflict.confirmTargets(loopOptions.intentContract, confirmed), "harness-confirmation");
  }
  const budget = loopOptions.conflictBudget || (loopOptions.conflictBudget = { used: 0 });
  if (budget.used >= 1) return;
  const absent = intentConflict.detectAbsentTargets(loopOptions.intentContract, tracker);
  if (!absent.length) return;
  const resolved = intentConflict.resolveFieldRef(loopOptions.intentContract, `target:${absent[0].id}`);
  if (!resolved) return;
  budget.used += 1;
  applyContractUpdate(loopOptions, messages, settings, emit, intentConflict.reviseContractForConflict(loopOptions.intentContract, { resolved, conflictType: "target-absent", trigger: "harness-auto" }), "harness-auto");
}

/**
 * Run the read-only discovery seed directly (no provider round), returning a harness
 * observation so the workspace loop starts with discovery already in hand.
 *
 * @param {string} root - Workspace root.
 * @param {object} settings - Normalized settings.
 * @param {string} mode - Request mode.
 * @param {string} prompt - Raw user prompt (selects list_files vs read_open_tabs).
 * @param {object} options - Loop options; must carry emit, editorReadContext, signal.
 * @returns {Promise<{ toolName: string, evidence: object|null, syntheticMessages: object[] }>}
 *   The observation and evidence record; both are absent when discovery fails.
 */
async function runInitialDiscoverySeed(root, settings, mode, prompt, options = {}) {
  const name = getInitialDiscoveryToolName(prompt);
  const args = getInitialDiscoveryToolArgs(name);
  const callId = `seed_${options.requestId || "req"}_${name}`;
  const toolCall = { id: callId, harnessGenerated: true, function: { name, arguments: JSON.stringify(args) } };
  const input = getToolInputSummary(toolCall);
  options.emit?.({ type: "tool", tool: name, input, summary: "running", activityId: callId });
  try {
    const result = await executeAgentTool(root, settings, mode, toolCall, { ...options });
    recordToolReliability(options, result);
    options.emit?.({ type: "tool", tool: name, input, summary: summarizeToolResult(name, result), activityId: callId });
    return {
      toolName: name,
      evidence: { toolCallId: callId, name, args, result },
      syntheticMessages: [
        createHarnessObservationMessage(toolCall, name, args, createToolResultContent(name, args, result))
      ]
    };
  } catch (error) {
    recordToolReliability(options, null, error);
    options.emit?.({ type: "tool-error", tool: name, input, error: error?.message || String(error), activityId: callId });
    return {
      toolName: name,
      evidence: { toolCallId: callId, name, args, error, summary: error?.message || String(error) },
      syntheticMessages: []
    };
  }
}

/**
 * Run the intent phase: produce an authoritative contract (fast path, extraction, or
 * fallback) while the discovery seed runs concurrently, then return the contract system
 * message and the seed's synthetic messages for the caller to splice into history.
 *
 * Concurrency: extraction and the seed use independent child abort controllers; the
 * parent signal aborts both; an extraction deadline aborts and discards a slow
 * extraction so a late result cannot overwrite the fallback; seed failure does not
 * cancel extraction and vice versa.
 *
 * @param {object} provider - Provider exposing completeMessage.
 * @param {object} settings - Normalized settings.
 * @param {string} root - Workspace root.
 * @param {string} prompt - Raw user prompt.
 * @param {string} mode - Request mode.
 * @param {(event: object) => void} emit - Panel event channel.
 * @param {object} loopOptions - Loop options (prompts, activeFile, attachments, signal).
 * @returns {Promise<{ contractMessage: object, seedMessages: object[], seedEvidence: object[], usedTools: boolean }>}
 */
async function runIntentPhase(provider, settings, root, prompt, mode, emit, loopOptions) {
  const parentSignal = loopOptions.signal;
  const seedController = new AbortController();
  const extractionController = new AbortController();
  const onParentAbort = () => { seedController.abort(); extractionController.abort(); };
  if (parentSignal) {
    if (parentSignal.aborted) onParentAbort();
    else parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }

  const seedPromise = runInitialDiscoverySeed(root, settings, mode, prompt, { ...loopOptions, emit, signal: seedController.signal });

  const currentMeta = intentContract.createContractMeta({
    mode,
    workspaceRoot: root,
    prompt,
    chatId: loopOptions.chatId,
    turnIndex: loopOptions.turnIndex,
    executionKind: loopOptions.executionKind,
    executionGeneration: loopOptions.executionGeneration,
    validationState: "valid",
    revision: 0
  });
  const priorContract = intentContract.canCarryPriorContract(loopOptions.priorIntentContractMeta, currentMeta)
    && intentContract.validateIntentContract(loopOptions.priorIntentContract, { enforceCriterionQuality: false }).valid
    ? loopOptions.priorIntentContract
    : null;
  const hasAttachments = Array.isArray(loopOptions.attachments) && loopOptions.attachments.length > 0;
  let contractPromise;
  if (!loopOptions.resumeIntentContext
    && loopOptions.savedIntentContract
    && intentContract.validateIntentContract(loopOptions.savedIntentContract, { enforceCriterionQuality: false }).valid
    && intentContract.canReuseContract(loopOptions.savedIntentContractMeta, currentMeta)) {
    const pendingAmendments = getUnappliedApprovalAmendments(loopOptions.savedIntentContract);
    contractPromise = pendingAmendments.length
      ? recoverUnappliedApprovalAmendments({
          provider,
          settings,
          prompts: loopOptions.prompts,
          contract: loopOptions.savedIntentContract,
          signal: extractionController.signal
        }).then((recovery) => ({
          contract: recovery.contract,
          source: recovery.applied ? "persisted-amendment-recovered" : "persisted-amendment-blocked",
          recoveryState: recovery.state,
          recoveryDiagnostics: recovery.diagnostics
        }))
      : Promise.resolve({ contract: loopOptions.savedIntentContract, source: "persisted-reuse", recoveryState: "clean" });
  } else if (loopOptions.executionKind !== "edited-rerun"
    && mode === "chat"
    && !priorContract
    && !loopOptions.resumeIntentContext
    && intentAnalysis.shouldUseChatFastPath(prompt, settings, { hasAttachments })) {
    contractPromise = Promise.resolve({
      contract: intentContract.createFastPathContract(prompt, { activeFilePath: loopOptions.activeFile?.path }),
      source: "fast-path"
    });
  } else {
    contractPromise = intentAnalysis.extractContractWithDeadline({
      provider, settings, prompts: loopOptions.prompts, prompt, mode,
      activeFile: loopOptions.activeFile,
      attachments: loopOptions.attachments,
      priorContract,
      priorTurns: loopOptions.conversationHistory,
      resumeIntentContext: loopOptions.resumeIntentContext,
      requestId: loopOptions.requestId,
      revision: 0,
      controller: extractionController
    });
  }

  const [seedSettled, contractSettled] = await Promise.allSettled([seedPromise, contractPromise]);
  if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);

  const resolved = contractSettled.status === "fulfilled"
    ? contractSettled.value
    : { contract: intentContract.createRawFallbackContract(prompt, { reason: "extraction-error" }), source: "raw-prompt-fallback" };
  let contract = resolved.contract;
  const isFallback = resolved.source === "raw-prompt-fallback";
  const metaFor = (validationState, revision) => intentContract.createContractMeta({
    mode, workspaceRoot: root, prompt,
    chatId: loopOptions.chatId, turnIndex: loopOptions.turnIndex,
    executionKind: loopOptions.executionKind,
    executionGeneration: loopOptions.executionGeneration,
    validationState, revision
  });
  let finalMeta = { ...metaFor(isFallback ? "fallback" : "valid", 0), verifiability: contract.verifiability };
  if (resolved.diagnostics) {
    finalMeta = { ...finalMeta, extractionDiagnostics: resolved.diagnostics };
  }
  emit({
    type: "intent-contract",
    variant: isFallback ? "fallback" : "initial",
    source: resolved.source,
    contract,
    meta: finalMeta,
    ...(resolved.diagnostics ? { diagnostics: resolved.diagnostics } : {}),
    ...(resolved.recoveryState ? { recoveryState: resolved.recoveryState, diagnostics: resolved.recoveryDiagnostics || [] } : {})
  });
  if (contract.verifiability === "unverified") {
    emit({
      type: "intent-uninterpreted",
      reason: contract.fallbackReason || "extraction-unavailable",
      verifiability: "unverified",
      diagnostics: resolved.diagnostics || null
    });
  }

  let supplementalSeedMessages = [];
  let supplementalSeedEvidence = null;
  // Pre-work clarification (chat/agent). Answers are refreshed through an isolated
  // capture_intent_contract call; assumptions are still recorded without another call.
  if (!isFallback && resolved.recoveryState !== "blocked" && loopOptions.intentExperiment?.intentClarification === true && (mode === "chat" || mode === "agent") && typeof loopOptions.requestClarification === "function") {
    const targetsBeforeClarification = JSON.stringify(contract.namedTargets || {});
    const batch = await intentClarification.runClarificationBatch({
      contract, requestClarification: loopOptions.requestClarification, mode, settings, signal: loopOptions.signal
    });
    if (batch.changed) {
      if (batch.clarifications.length) {
        const refreshed = await intentAnalysis.refreshContractFromUserContext({
          provider,
          settings,
          prompts: loopOptions.prompts,
          contract,
          userContext: batch.clarifications.map((entry) => `${entry.question}\nAnswer: ${entry.answer}`).join("\n\n"),
          signal: loopOptions.signal
        });
        if (refreshed.contract && refreshed.validation.valid) {
          contract = intentClarification.applyClarifications(refreshed.contract, batch.clarifications, []);
        } else {
          contract = {
            ...batch.contract,
            unresolvedDecisions: [...(batch.contract.unresolvedDecisions || []), {
              id: `D-clarification-refresh-${(batch.contract.unresolvedDecisions || []).length + 1}`,
              description: "Clarification was received but the structured contract refresh failed.",
              blocking: true,
              controlsMutation: true,
              controlledCapabilities: [],
              controlledTargets: []
            }]
          };
        }
      } else {
        contract = batch.contract;
      }
      finalMeta = metaFor("valid", 1);
      emit({ type: "intent-contract", variant: "refreshed", source: resolved.source, contract, meta: finalMeta });
      if (JSON.stringify(contract.namedTargets || {}) !== targetsBeforeClarification) {
        const targetedSeed = await runInitialDiscoverySeed(root, settings, mode, prompt, { ...loopOptions, emit, signal: seedController.signal });
        supplementalSeedMessages = targetedSeed?.syntheticMessages || [];
        supplementalSeedEvidence = targetedSeed?.evidence || null;
      }
    }
  }

  const seedMessages = [
    ...(seedSettled.status === "fulfilled" && seedSettled.value ? seedSettled.value.syntheticMessages : []),
    ...supplementalSeedMessages
  ];
  const seedEvidence = [
    seedSettled.status === "fulfilled" ? seedSettled.value?.evidence : null,
    supplementalSeedEvidence
  ].filter(Boolean);
  return {
    contract,
    meta: finalMeta,
    contractMessage: intentContract.buildContractInjectionMessage(contract, { maxChars: settings.intentInjectedMaxChars }),
    seedMessages,
    seedEvidence,
    usedTools: seedMessages.length > 0,
    recoveryState: resolved.recoveryState || "clean",
    recoveryDiagnostics: resolved.recoveryDiagnostics || []
  };
}

function recordToolReliability(options, result, error = null) {
  const reliability = options.toolReliability;
  if (!reliability) return;
  const code = String(error?.code || result?.code || result?.error?.code || "");
  if (/^APPLY_EDIT_/.test(code) && (error?.preExecution === true || result?.preExecution === true || result?.executed === false)) return;
  if (code === "stale-intent-reference" && (error?.preExecution === true || result?.preExecution === true || result?.executed === false)) return;
  reliability.executed += 1;
  if (error || result?.status === "failed") reliability.failed += 1;
  else if (result?.status === "partial") reliability.partial += 1;
}

function appendToolReliabilityNote(content, reliability) {
  const text = String(content || "").trim();
  if (!reliability?.executed || reliability.failed / reliability.executed <= 0.4) return text;
  const percent = Math.round((reliability.failed / reliability.executed) * 100);
  const notes = [`Tool execution note: ${reliability.failed} of ${reliability.executed} tool calls failed (${percent}%).`];
  if (reliability.partial > 0) notes.push(`${reliability.partial} additional tool call${reliability.partial === 1 ? "" : "s"} returned partial results.`);
  return [text, notes.join(" ")].filter(Boolean).join("\n\n");
}

function getControllerDecision(session, decisionId) {
  return session?.getState?.().recentDecisions?.find((decision) => decision.decisionId === decisionId) || null;
}

function transitionControllerDecision(session, type, payload, emit) {
  session.applyControllerEvent(type, payload);
  const decisionId = String(payload?.decisionId || payload?.decision?.decisionId || "");
  const decision = getControllerDecision(session, decisionId);
  if (decision) emit(agentDecisionController.createDecisionEvent(decision));
  return decision;
}

function createSupersededDecisionError(decisionId) {
  const error = new Error("The accepted Agent decision became stale before execution. No action was executed.");
  error.code = "agent-decision-superseded";
  error.decisionId = decisionId;
  error.preExecution = true;
  error.executed = false;
  error.retryable = true;
  return error;
}

function expectedActionPostcondition(name, args) {
  if (["write_file", "create_document_tab"].includes(name) && typeof args?.content === "string") return fingerprint(args.content);
  if (name === "delete_file") return fingerprint("");
  return "";
}

async function prepareDurableActionDispatch(root, session, context = {}) {
  if (!context.activityId || session?.isCheckpointEnabled?.() !== true) return;
  const workspacePath = String(context.args?.path || context.args?.sourcePath || context.args?.expectedPath || "");
  const observation = workspacePath ? await observeWorkspacePath(root, workspacePath) : null;
  const payload = {
    actionId: context.activityId,
    executionAttemptId: `${context.activityId}:attempt:${session.getState().recovery?.resumeAttempt || 0}`,
    dispatchNonce: crypto.randomUUID(),
    workspacePath,
    preconditionFingerprint: observation?.valid ? observation.contentFingerprint : "",
    expectedPostcondition: expectedActionPostcondition(context.name, context.args)
  };
  session.applyControllerEvent("action_dispatch_prepared", payload);
  await session.checkpoint("action_prepared", { actionId: context.activityId, decisionId: context.decisionId, nextRuntimeStep: "dispatch_tool" });
  session.applyControllerEvent("action_dispatching", payload);
  await session.checkpoint("action_dispatching", { actionId: context.activityId, decisionId: context.decisionId, nextRuntimeStep: "await_tool_outcome" });
}

function createControllerExecutionAuthorizer(session, decision, emit, runtime, signal, checkpointOptions = {}) {
  let authorized = false;
  return async () => {
    if (authorized) return;
    runtime.throwIfAborted(signal);
    const invalidating = agentDecisionController.findInvalidatingTransitions(
      decision,
      session.getTransitionsSince(decision.basedOnStateVersion)
    );
    if (invalidating.length) {
      transitionControllerDecision(session, "decision_superseded", {
        decisionId: decision.decisionId,
        runtimeReasonCodes: ["stale_state_version"]
      }, emit);
      throw createSupersededDecisionError(decision.decisionId);
    }
    transitionControllerDecision(session, "decision_execution_authorized", { decisionId: decision.decisionId }, emit);
    const authorizedAtStateVersion = session.getState().stateVersion;
    runtime.throwIfAborted(signal);
    if (session.getState().stateVersion !== authorizedAtStateVersion) {
      transitionControllerDecision(session, "decision_superseded", {
        decisionId: decision.decisionId,
        runtimeReasonCodes: ["stale_state_version"]
      }, emit);
      throw createSupersededDecisionError(decision.decisionId);
    }
    transitionControllerDecision(session, "decision_executed", { decisionId: decision.decisionId }, emit);
    await prepareDurableActionDispatch(checkpointOptions.root, session, checkpointOptions.getActionContext?.() || {});
    authorized = true;
  };
}

function markControllerDecisionRejected(session, decision, codes, emit) {
  const current = getControllerDecision(session, decision?.decisionId);
  if (!current || !new Set(["proposed", "accepted"]).has(current.status)) return current;
  return transitionControllerDecision(session, "decision_rejected", {
    decisionId: decision.decisionId,
    runtimeReasonCodes: codes
  }, emit);
}

function progressEvent(assessment, state, controlAction, extra = {}) {
  return {
    type: "agent-progress",
    assessmentId: assessment?.assessmentId || "",
    decisionId: assessment?.decisionId || "",
    observationId: assessment?.observationId || "",
    intentId: assessment?.intentId || "",
    status: assessment?.status || "",
    source: assessment?.source || "",
    reasonCode: assessment?.reasonCode || "",
    actionSignature: assessment?.actionSignature || "",
    strategySignature: assessment?.strategySignature || "",
    progressEpoch: Number(state?.progress?.progressEpoch) || 0,
    strategyRevision: Number(state?.progress?.strategyRevision) || 0,
    stallScore: Number(state?.progress?.stallScore) || 0,
    consecutiveInconclusive: Number(state?.progress?.consecutiveInconclusive) || 0,
    replanAttemptCount: Number(state?.progress?.replanAttemptCount) || 0,
    controlAction: String(controlAction || "continue"),
    ...extra
  };
}

async function describeProgressCandidate(decision, sanitizedToolCall, state, evaluator) {
  if (!decision || decision.type !== "tool_call" || !sanitizedToolCall) return null;
  const name = String(sanitizedToolCall.function?.name || sanitizedToolCall.name || "");
  let args = {};
  try { args = parseToolArguments(sanitizedToolCall.function?.arguments || sanitizedToolCall.arguments || "{}"); } catch (_error) { args = {}; }
  const actionSignature = createActionSignature(name, args);
  let strategy = createStrategyDescriptor({ toolName: name, args, intentId: decision.intentId });
  const recent = (state?.progress?.recentStrategies || []).filter((entry) =>
    entry.progressEpoch === state.progress.progressEpoch
    && entry.strategyClass === strategy.strategyClass
    && entry.targetScope === strategy.targetScope
    && entry.strategySignature !== strategy.strategySignature).slice(-6);
  if (evaluator && recent.length) {
    const compared = await evaluator.compareStrategies({ candidate: strategy, recentStrategies: recent });
    const equivalent = recent.find((entry) => entry.strategyId === compared.equivalentToStrategyId);
    if (equivalent) strategy = { ...strategy, strategySignature: equivalent.strategySignature, equivalentToStrategyId: equivalent.strategyId };
  }
  return { args, actionSignature, ...strategy };
}

function candidateProgressValidationCodes(state, candidate) {
  if (state?.progress?.mode === "off" || !candidate) return [];
  const codes = [];
  if (state.progress.blockedActionSignatures.includes(candidate.actionSignature)) codes.push("repeated_blocked_action");
  if (state.progress.blockedStrategySignatures.includes(candidate.strategySignature)) codes.push("repeated_blocked_strategy");
  const unproductive = (state.progress.recentAssessments || []).filter((entry) => entry.status !== "meaningful");
  if (unproductive.filter((entry) => entry.strategySignature === candidate.strategySignature).length >= 2) codes.push("repeated_stalled_strategy");
  const last = unproductive.slice(-3);
  if (last.length === 3
    && last[0].actionSignature === last[2].actionSignature
    && last[1].actionSignature === candidate.actionSignature
    && last[0].actionSignature !== last[1].actionSignature) codes.push("action_oscillation");
  if (last.length === 3
    && last[0].strategySignature === last[2].strategySignature
    && last[1].strategySignature === candidate.strategySignature
    && last[0].strategySignature !== last[1].strategySignature) codes.push("strategy_oscillation");
  return [...new Set(codes)];
}

async function validateAmbiguousReplan(decision, state, candidate, evaluator) {
  if (state?.progress?.mode !== "enforce" || state.progress.replanRequired !== true || !decision?.replan || !candidate) return [];
  const deterministic = compareApproachText(decision.replan.abandonedApproach, decision.replan.revisedApproach);
  if (!deterministic.ambiguous) return deterministic.different ? [] : [deterministic.reasonCode];
  if (!evaluator) return ["replan_comparison_unavailable"];
  const previousStrategy = (state.progress.recentStrategies || []).at(-1) || null;
  const result = await evaluator.validateReplan({
    intent: { id: decision.intentId },
    abandonedApproach: decision.replan.abandonedApproach,
    revisedApproach: decision.replan.revisedApproach,
    previousStrategy,
    proposedStrategy: candidate
  });
  return result.materiallyDifferent ? [] : [result.reasonCode || "replan_not_materially_different"];
}

async function assessControllerProgress(options = {}) {
  const session = options.session;
  let state = session.getState();
  if (state.progress?.mode === "off") return { action: "continue" };
  const decision = state.recentDecisions.find((entry) => entry.decisionId === options.decisionId);
  if (!decision || decision.type !== "tool_call" || !decision.observationIds?.length) return { action: "continue" };
  const observationId = decision.observationIds.at(-1);
  const observation = state.recentObservations.find((entry) => entry.observationId === observationId);
  if (!observation || observation.executionStatus === "cancelled") return { action: "continue" };
  const binding = {
    basedOnStateVersion: state.stateVersion,
    progressEpoch: state.progress.progressEpoch,
    strategyRevision: state.progress.strategyRevision
  };
  const deterministic = classifyDeterministicProgress({
    state,
    decision,
    observation,
    actionSignature: decision.actionSignature,
    strategySignature: decision.strategySignature
  });
  let judgment = deterministic;
  let source = "deterministic";
  if (!judgment) {
    source = "semantic-evaluator";
    const excerpt = session.readArtifactExcerpt?.(observation.artifactRef, 6000);
    judgment = options.evaluator
      ? await options.evaluator.evaluateProgress({
          intent: { id: decision.intentId, statement: state.criteria.find((entry) => entry.id === decision.intentId)?.statement || state.originalPrompt },
          decision,
          observation,
          artifactExcerpt: excerpt?.text || ""
        })
      : { status: "inconclusive", reasonCode: "semantic_evaluator_disabled", evidenceIds: [] };
  }
  const current = session.getState();
  if (current.stateVersion !== binding.basedOnStateVersion
    || current.progress.progressEpoch !== binding.progressEpoch
    || current.progress.strategyRevision !== binding.strategyRevision) {
    options.emit(progressEvent(null, current, "stale", { reasonCode: "stale_progress_binding" }));
    return { action: "continue" };
  }
  const assessment = {
    assessmentId: `${options.requestId || "agent"}:progress:${current.progress.recentAssessments.length + 1}`,
    status: judgment.status,
    source,
    decisionId: decision.decisionId,
    observationId: observation.observationId,
    intentId: decision.intentId,
    ...binding,
    reasonCode: String(judgment.reasonCode || "progress_unclassified"),
    evidenceIds: Array.isArray(judgment.evidenceIds) ? judgment.evidenceIds : [],
    actionSignature: decision.actionSignature,
    strategySignature: decision.strategySignature,
    strategyId: `${options.requestId || "agent"}:strategy:${current.progress.recentStrategies.length + 1}`,
    strategyClass: decision.strategyClass,
    targetScope: decision.targetScope,
    conceptTokens: decision.conceptTokens
  };
  session.applyControllerEvent("progress_recorded", { assessment });
  state = session.getState();
  const controlAction = state.progress.lastControlAction;
  options.emit(progressEvent(assessment, state, controlAction, { shadow: state.progress.mode === "shadow" }));
  if (state.progress.mode !== "enforce" || controlAction === "continue") return { action: "continue" };
  if (controlAction === "require_replan") {
    session.applyControllerEvent("replan_required", { assessmentId: assessment.assessmentId });
    return { action: "require_replan" };
  }
  session.applyControllerEvent("progress_budget_exhausted", { assessmentId: assessment.assessmentId });
  return { action: "terminate" };
}

async function runAgentToolLoop(provider, settings, root, prompt, mode, emit, runtime, options = {}) {
  const resolvedExperiment = intentExperiment.resolveIntentExperiment(settings?.intentExperiment, settings?.intentContractsEnabled === true, { rejectInvalid: true });
  settings = { ...settings, intentExperiment: resolvedExperiment };
  const evaluationTracker = createIntentEvaluationTracker({ requestId: options.requestId, chatId: options.chatId, mode, experiment: resolvedExperiment });
  provider = evaluationTracker.wrapProvider(provider);
  const downstreamEmit = emit;
  emit = (event) => {
    evaluationTracker.recordEvent(event);
    downstreamEmit(event);
  };
  const agentMaxResponseTokens = Number.isFinite(Number(settings?.agentMaxResponseTokens))
    ? Math.max(0, Math.floor(Number(settings.agentMaxResponseTokens)))
    : undefined;
  const loopOptions = {
    ...options,
    taskApprovalGrants: [],
    provisionalApprovalGrants: [],
    mode,
    agentMaxResponseTokens,
    autoContinueOnResponseLimit: agentMaxResponseTokens === 0,
    toolReliability: { executed: 0, failed: 0, partial: 0 },
    nonRetryableToolResults: new Map(),
    intentMutationBlockResults: new Map(),
    intentDecisionBlockAttempts: new Map()
  };
  loopOptions.intentExperiment = resolvedExperiment;
  const activityRun = (mode === "agent" || mode === "chat" || mode === "plan") ? createActivityRun(root, tools, {
    observeToolEvidence: mode === "agent" ? loopOptions.observeToolEvidence : null
  }) : null;
  const shouldEmitActivitySummary = mode === "agent";
  let evaluationEmitted = false;
  // Closed-loop steering state (Phase 1): bounded revisions driven by the completion verdict.
  const steeringEnabled = settings?.intentCompletionSteeringEnabled !== false;
  const maxRevisions = clampLoopInteger(settings?.intentMaxCompletionRevisions, 3, 0, 10);
  let revisionIterations = 0;
  let priorUnmetIds = new Set();
  let steeringFinalReason = "";
  let steeringConverged = false;
  // Controller eligibility is resolved through the shared mode-policy seam (M8.1)
  // instead of hard-coded `mode === "agent"` checks. For Agent this is logically
  // identical to the previous inline expressions; the runtime-only state-session
  // guard stays inline so the composition is unchanged.
  const modePolicy = resolveModePolicy(mode, settings);
  const verifierCompletionEnabled = modePolicy.verifierCompletionEligible
    && Boolean(loopOptions.agentStateSession);
  const finishRun = async (content, semanticOutcome = {}) => {
    if (loopOptions.agentStateSession?.isCheckpointEnabled?.() === true) {
      await loopOptions.agentStateSession.checkpoint("finalizing", { nextRuntimeStep: "compose_final_response" });
    }
    let finalContent = appendToolReliabilityNote(content, loopOptions.toolReliability);
    let semanticCompletion = null;
    if (verifierCompletionEnabled) {
      let state = loopOptions.agentStateSession.getState();
      if (!["succeeded", "blocked", "provisional", "unverified", "budget_exhausted", "failed", "cancelled"].includes(state.completion?.status)) {
        const status = ["blocked", "provisional", "unverified", "budget_exhausted", "failed", "cancelled"].includes(semanticOutcome.status)
          ? semanticOutcome.status
          : "failed";
        loopOptions.agentStateSession.applyControllerEvent("completion_terminated", {
          status,
          reasonCodes: semanticOutcome.reasonCodes?.length ? semanticOutcome.reasonCodes : ["untyped_agent_exit"],
          unresolvedIssues: semanticOutcome.unresolvedIssues || []
        });
        state = loopOptions.agentStateSession.getState();
      }
      if (!state.completion?.finalResponse) {
        const response = composeFinalResponse({
          state,
          outcome: state.completion.status,
          proposalContent: content,
          reasonCodes: state.completion.reasonCodes
        });
        response.content = appendToolReliabilityNote(response.content, loopOptions.toolReliability);
        loopOptions.agentStateSession.applyControllerEvent("final_response_recorded", { response });
        if (loopOptions.agentStateSession.isCheckpointEnabled?.() === true) {
          await loopOptions.agentStateSession.checkpoint("finalizing", { nextRuntimeStep: "publish_final_response" });
        }
        state = loopOptions.agentStateSession.getState();
      }
      finalContent = state.completion.finalResponse.content;
      semanticCompletion = state.completion;
      steeringConverged = state.completion.status === "succeeded";
      if (!steeringFinalReason) steeringFinalReason = state.completion.status;
    }
    if (!evaluationEmitted && INTENT_CONTRACT_MODES.has(mode)) {
      evaluationEmitted = true;
      emit({
        type: "intent-evaluation",
        record: evaluationTracker.createRecord({
          taskType: loopOptions.intentContract?.taskType || "answer",
          evidenceLedger: activityRun?.listEvidence?.() || [],
          revisionIterations,
          converged: steeringConverged,
          finalReason: steeringFinalReason
        })
      });
    }
    if (loopOptions.agentStateSession?.isCheckpointEnabled?.() === true) {
      await loopOptions.agentStateSession.checkpoint("finalizing", { nextRuntimeStep: "return_final_response" });
    }
    if (shouldEmitActivitySummary && activityRun) emit(activityRun.createSummary(finalContent, semanticCompletion));
    return finalContent;
  };
  const hasToolDefinitionsOverride = Array.isArray(loopOptions.toolDefinitionsOverride);
  let toolDefinitions = hasToolDefinitionsOverride
    ? [...loopOptions.toolDefinitionsOverride]
    : getAgentToolDefinitions(mode, {
      planGitReadToolsEnabled: settings.planGitReadToolsEnabled === true,
      enabledScopes: settings.toolScopes
    });
  // The read-only conflict-reporting tool is exposed in the workspace loop when the
  // intent phase is active, so the model can flag semantic contradictions it finds.
  if (!hasToolDefinitionsOverride && resolvedExperiment.intentRevision === true && INTENT_CONTRACT_MODES.has(mode)) toolDefinitions.push(intentConflict.REPORT_INTENT_CONFLICT_TOOL);
  const controllerEnabled = modePolicy.controllerEligible;
  if (controllerEnabled && !loopOptions.agentStateSession) throw new Error("Agent decision controller requires an authoritative state session.");
  if (controllerEnabled) loadAgentDecisionController();

  // M11 task-profile engagement (flag-gated, controller + agent only). When a certain
  // profile is resolved, restrict the tool surface to the profile's allow-list and seed
  // the reducer's task-profile slice. Requested keys/values are parsed from the prompt
  // only when explicit; otherwise the slice still tracks the workflow and restricts
  // tools while readiness stays incomplete (the gate never forces an action).
  let taskProfileEngagement = null;
  if (controllerEnabled && mode === "agent" && !hasToolDefinitionsOverride && settings.taskProfileRoutingEnabled === true) {
    const routed = resolveTaskProfile({ prompt, mode, settings, enabledScopes: settings.toolScopes });
    if (routed.engaged && routed.profile.profileId === "preferences-update") {
      const targets = parseExplicitPreferenceTargets(prompt);
      const allow = new Set(routed.toolNames);
      toolDefinitions = toolDefinitions.filter((definition) => allow.has(definition?.function?.name));
      const capableToolAvailable = routed.toolNames.includes(routed.profile.mutationTool);
      loopOptions.agentStateSession.applyControllerEvent("task_profile_seeded", {
        profileId: routed.profile.profileId,
        profileVersion: routed.profile.profileVersion,
        workflowVersion: routed.profile.workflowVersion,
        requiredActionTool: routed.profile.mutationTool,
        capableToolAvailable,
        requestedKeys: targets.requestedKeys,
        desiredValues: targets.desiredValues,
        taskState: createTaskState({ requestedKeys: targets.requestedKeys, desiredValues: targets.desiredValues, requiredActionTool: routed.profile.mutationTool }),
        workflowState: routed.workflowState
      });
      taskProfileEngagement = { profile: routed.profile, requestedKeys: targets.requestedKeys, desiredValues: targets.desiredValues };
      emit({ type: "task-profile", stage: "engaged", profileId: routed.profile.profileId, toolCount: toolDefinitions.length });
    }
  }
  // Emit the reducer observation for an accepted preferences result while a task profile
  // is engaged. No-op otherwise. Degrades safely: an unrecognized result shape yields an
  // observation that resolves nothing, so readiness simply stays incomplete.
  const emitTaskProfileObservation = (toolName, toolResult) => {
    if (!taskProfileEngagement) return;
    const observation = deriveTaskObservation(toolName, toolResult, {
      requestedKeys: taskProfileEngagement.requestedKeys,
      desiredValues: taskProfileEngagement.desiredValues
    });
    if (observation) loopOptions.agentStateSession.applyControllerEvent("task_profile_updated", { observation });
  };

  const progressEvaluationEnabled = modePolicy.progressEvaluationEligible;
  const progressEvaluator = progressEvaluationEnabled
    ? createAgentProgressEvaluator({
        provider,
        signal: loopOptions.signal,
        onUsage: (usage) => emit({ type: "usage", ...usage, reported: true, phase: "agent-progress" }),
        onDebug: createProviderDebugEmitter(emit)
      })
    : null;
  const completionOrchestrator = verifierCompletionEnabled
    ? createAgentCompletionOrchestrator({
        provider,
        settings,
        prompts: loopOptions.prompts,
        signal: loopOptions.signal,
        stateSession: loopOptions.agentStateSession,
        activityRun,
        emit,
        onUsage: (usage) => emit({ type: "usage", ...usage, reported: true }),
        onDebug: createProviderDebugEmitter(emit),
        finalizeContent: (content) => appendToolReliabilityNote(content, loopOptions.toolReliability)
      })
    : null;
  const controllerToolDefinitions = controllerEnabled
    ? agentDecisionController.createControllerToolDefinitions(toolDefinitions)
    : toolDefinitions;
  // Modes that carry their own grounding context (like gitSummary's changes
  // digest) skip the forced workspace-discovery tool call: tools stay
  // available, but a direct answer on the first round is a valid outcome.
  const requireInitialDiscovery = controllerEnabled
    ? false
    : (typeof loopOptions.requireInitialDiscoveryOverride === "boolean"
    ? loopOptions.requireInitialDiscoveryOverride
    : mode !== "gitSummary");
  // Narration is a chat/agent/plan feature: gitSummary answers from a digest and
  // rarely chains tools, so it gets no filter and emits no narration events.
  const narrationFilter = loopOptions.narrationEnabled === false
    ? null
    : ((mode === "agent" || mode === "chat" || mode === "plan") ? createNarrationFilter() : null);
  const baseSystemPrompt = [
    String(loopOptions.systemPrompt || "") || (mode === "agent" ? DEFAULT_AI_COMPANION_PROMPTS.agentSystem : DEFAULT_AI_COMPANION_PROMPTS.chatSystem),
    loopOptions.requestChatTitle === true ? CHAT_TITLE_RESPONSE_PROMPT : "",
    narrationFilter ? NARRATION_PROMPT_RULES : "",
    TOOL_FAILURE_EVIDENCE_INSTRUCTION
  ].filter(Boolean).join(" ");
  const messages = [
    {
      role: "system",
      content: baseSystemPrompt
    }
  ];
  const activeFileMessage = buildActiveFileMessage(loopOptions.activeFile);
  if (activeFileMessage) messages.push(activeFileMessage);
  const attachmentMessage = buildAttachmentContextMessage(loopOptions.attachments);
  if (attachmentMessage) messages.push(attachmentMessage);
  for (const contextMessage of Array.isArray(loopOptions.additionalSystemMessages) ? loopOptions.additionalSystemMessages : []) {
    if (contextMessage?.role === "system" && String(contextMessage.content || "").trim()) {
      messages.push({ role: "system", content: String(contextMessage.content) });
    }
  }
  const historyMessages = normalizeConversationHistory(loopOptions.conversationHistory);
  if (historyMessages.length) {
    messages.push(...historyMessages);
    // Without this boundary the current prompt competes with prior-task context;
    // see the interrupted-task drift described in buildHistoryBoundaryMessage.
    messages.push(buildHistoryBoundaryMessage());
  }
  messages.push(buildCurrentUserMessage(prompt, loopOptions.attachments));
  const maxRounds = getMaxToolRounds(mode, settings);
  const tokenBudget = createTokenMinuteBudget(settings);
  const intentPhaseEnabled = loopOptions.skipIntentPhase !== true
    && resolvedExperiment.intentExtraction === true
    && INTENT_CONTRACT_MODES.has(mode);
  let usedTools = false;
  let evidenceGateRetries = 0;
  // Intent phase (M1/M2). It runs before resume replay so a persisted mutation is always
  // checked against a ready, request-matching contract. The disabled arm keeps the prior
  // resume-first ordering and behavior.
  // The contract message is injected just before the current user message; the discovery
  // seed's synthetic messages are appended after it so the loop starts with grounding.
  if (intentPhaseEnabled) {
    const intentPhase = await runIntentPhase(provider, settings, root, prompt, mode, emit, loopOptions);
    loopOptions.intentContract = intentPhase.contract;
    loopOptions.intentContractMeta = intentPhase.meta;
    loopOptions.searchTracker = intentConflict.createSearchTracker();
    loopOptions.conflictBudget = { used: 0 };
    loopOptions.intentRecoveryState = intentPhase.recoveryState;
    if (intentPhase.contractMessage) messages.splice(Math.max(1, messages.length - 1), 0, intentPhase.contractMessage);
    if (intentPhase.seedMessages.length) messages.push(...intentPhase.seedMessages);
    for (const evidence of intentPhase.seedEvidence || []) {
      activityRun?.recordToolEvidence?.({
        toolCallId: evidence.toolCallId,
        tool: evidence.name,
        result: evidence.result,
        error: evidence.error,
        summary: evidence.summary || summarizeToolEvidence(evidence.name, evidence.result)
      });
      if (resolvedExperiment.intentRevision === true) {
        recordSearchAndDetectAbsence(
          evidence.name,
          evidence.args,
          evidence.result,
          evidence.toolCallId,
          loopOptions,
          messages,
          settings,
          emit,
          evidence.error ? { failed: true, notFound: evidence.name === "read_file" && intentConflict.isNotFoundError(evidence.error) } : {}
        );
      }
    }
    if (intentPhase.usedTools) usedTools = true;
    if (intentPhase.recoveryState === "blocked") {
      const blockerCandidate = "The interrupted task could not resume because its pending approval instruction could not be validated after one bounded repair attempt. The instruction remains preserved, and no mutation was executed.";
      const content = !verifierCompletionEnabled && shouldAssessCompletion(settings, loopOptions.intentContract)
        ? (await finalizeAssessedCandidate(provider, settings, mode, blockerCandidate, loopOptions, activityRun, emit)).content
        : blockerCandidate;
      return finishRun(content, { status: "blocked", reasonCodes: ["approval_recovery_blocked"] });
    }
  }
  if (verifierCompletionEnabled && !loopOptions.intentContract) {
    return finishRun("The Agent task cannot be verified because no intent contract is available.", {
      status: "failed",
      reasonCodes: ["missing_intent_contract"]
    });
  }
  const resumedAction = await replayResumeCheckpoint(root, settings, mode, messages, activityRun, emit, loopOptions);
  if (resumedAction.usedTools) usedTools = true;
  const titleState = { requested: loopOptions.requestChatTitle === true, emitted: false };
  const onDebug = createProviderDebugEmitter(emit);
  let controllerDecisionSequence = 0;
  let controllerRepairDecision = null;
  let blockedProgressProposalCount = 0;

  taskPass: while (true) {
    for (let round = 0; round < maxRounds; round++) {
      runtime.throwIfAborted(loopOptions.signal);
      let contextBundle = null;
      if (mode === "agent" && typeof loopOptions.observeDecisionContext === "function") {
        try {
          contextBundle = loopOptions.observeDecisionContext({ messages, round });
        } catch (error) {
          if (controllerEnabled) throw error;
          // M3 shadow context cannot affect the legacy provider call.
        }
      }
      const providerMessages = controllerEnabled
        ? [
            ...(contextBundle?.messages || []),
            agentDecisionController.createControllerInstructionMessage(loopOptions.agentStateSession.getState()),
            ...(controllerRepairDecision
              ? [agentDecisionController.createRepairMessage(controllerRepairDecision, loopOptions.agentStateSession.getState().stateVersion)]
              : [])
          ]
        : messages;
      if (controllerEnabled && !contextBundle) throw new Error("Agent controller could not build authoritative decision context.");
      const providerToolDefinitions = controllerEnabled ? controllerToolDefinitions : toolDefinitions;
      // Fallback context estimate: message contents plus the tool-definition JSON the request
      // carries, plus ~4 tokens of per-message chat framing overhead. Providers that report
      // real `usage` override this in the UI (see the `usage` event emitted below).
      const estimatedTokens = runtime.estimateTokens(providerMessages.map((entry) => getMessageContentEstimateText(entry.content)).join("\n"))
        + runtime.estimateTokens(JSON.stringify(providerToolDefinitions))
        + providerMessages.length * 4;
      emit({ type: "context", estimatedTokens });
      const tokenBudgetReservation = await reserveTokenMinuteBudget(tokenBudget, estimatedTokens, mode, loopOptions, providerMessages);
      if (!tokenBudgetReservation.approved) {
        const content = tokenBudgetReservation.content || createTaskLimitFallbackContent({ reason: "max_tokens", mode, phase: "chat token budget" });
        return finishRun(content, { status: "budget_exhausted", reasonCodes: ["token_budget_exhausted"] });
      }
      let message;
      try {
        if (controllerEnabled) {
          await loopOptions.agentStateSession.checkpoint("model_pending", { nextRuntimeStep: "request_typed_decision", round });
        }
        message = await provider.completeMessage(providerMessages, {
          temperature: 0.2,
          maxTokens: getRoundResponseMaxTokens(loopOptions),
          signal: loopOptions.signal,
          tools: providerToolDefinitions,
          toolChoice: providerToolDefinitions.length
            ? (controllerEnabled ? "required" : (requireInitialDiscovery ? getToolChoiceForRound(usedTools, prompt) : "auto"))
            : undefined,
          onUsage: (usage) => emit({ type: "usage", ...usage, reported: true }),
          onDebug
        });
      } catch (error) {
        if (!isTokenLimitProviderError(error)) throw error;
        const context = {
          reason: "max_tokens",
          mode,
          phase: "tool planning",
          providerStatus: error?.providerStatus || "",
          providerMessage: getProviderErrorMessage(error)
        };
        const continuation = await requestTaskContinuation(context, loopOptions);
        if (!continuation.approved) {
          const content = continuation.content || createTaskLimitFallbackContent(context);
          return finishRun(content, { status: "budget_exhausted", reasonCodes: ["max_tokens"] });
        }
        compactToolResultMessagesForContinuation(messages);
        messages.push(createContinuationMessage(context, continuation));
        continue taskPass;
      }
      // completeMessage is non-streaming, so any thinking for this round arrives whole on the
      // message. Surface it before tool calls run so the panel shows the model's reasoning that
      // led to those calls, not just the reasoning behind the final streamed answer.
      if (message.reasoning) emit({ type: "reasoning-delta", content: message.reasoning });
      message = consumeChatTitleFromMessage(message, titleState, emit);
      let toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
      // Model-facing names are preserved in the transcript/activity; each internal
      // consumer (execution, effect, approval, recovery, activity labels) translates
      // to the canonical name itself via toCanonicalName.
      let controllerDecision = null;
      let controllerDecisionPayload = null;
      let controllerCompletionCandidate = "";
      let controllerReportedBlocked = false;
      let progressCandidateValidationCodes = [];
      if (controllerEnabled) {
        controllerDecisionSequence += 1;
        const normalized = agentDecisionController.normalizeDecisionAttempt(
          message,
          toolDefinitions,
          loopOptions.agentStateSession.getState(),
          {
            decisionId: `${loopOptions.requestId || "agent"}:decision:${controllerDecisionSequence}`,
            replacesDecisionId: controllerRepairDecision?.decisionId || "",
            hasClarificationChannel: typeof loopOptions.requestClarification === "function"
          }
        );
        controllerDecision = normalized.decision;
        controllerDecisionPayload = normalized.decision.payload;
        const progressStateBeforeDecision = loopOptions.agentStateSession.getState();
        const progressCandidate = await describeProgressCandidate(
          controllerDecision,
          normalized.sanitizedToolCall,
          progressStateBeforeDecision,
          progressEvaluator
        );
        if (progressCandidate) {
          Object.assign(controllerDecision, {
            actionSignature: progressCandidate.actionSignature,
            strategySignature: progressCandidate.strategySignature,
            strategyClass: progressCandidate.strategyClass,
            targetScope: progressCandidate.targetScope,
            conceptTokens: progressCandidate.conceptTokens
          });
          progressCandidateValidationCodes = candidateProgressValidationCodes(progressStateBeforeDecision, progressCandidate);
          if (progressStateBeforeDecision.progress?.mode === "shadow" && progressCandidateValidationCodes.length) {
            const loopWouldReplan = progressCandidateValidationCodes.some((code) =>
              ["repeated_stalled_strategy", "action_oscillation", "strategy_oscillation"].includes(code));
            emit(progressEvent(null, progressStateBeforeDecision, loopWouldReplan ? "would_replan" : "would_reject", {
              reasonCode: progressCandidateValidationCodes[0],
              shadow: true
            }));
          } else {
            normalized.validationCodes.push(...progressCandidateValidationCodes);
          }
          normalized.validationCodes.push(...await validateAmbiguousReplan(
            controllerDecision,
            progressStateBeforeDecision,
            progressCandidate,
            progressEvaluator
          ));
          normalized.validationCodes = [...new Set(normalized.validationCodes)];
          controllerDecision.runtimeReasonCodes = [...normalized.validationCodes];
        }
        transitionControllerDecision(loopOptions.agentStateSession, "decision_proposed", { decision: controllerDecision }, emit);
        if (normalized.validationCodes.length) {
          controllerDecision = transitionControllerDecision(loopOptions.agentStateSession, "decision_rejected", {
            decisionId: controllerDecision.decisionId,
            runtimeReasonCodes: normalized.validationCodes
          }, emit);
          const progressState = loopOptions.agentStateSession.getState().progress;
          const blockedProposalCodes = progressCandidateValidationCodes.filter((code) =>
            ["repeated_blocked_action", "repeated_blocked_strategy"].includes(code));
          const proposalLoopCodes = progressCandidateValidationCodes.filter((code) =>
            ["repeated_stalled_strategy", "action_oscillation", "strategy_oscillation"].includes(code));
          blockedProgressProposalCount = blockedProposalCodes.length ? blockedProgressProposalCount + 1 : 0;
          if (progressState?.mode === "enforce"
            && progressState.replanRequired !== true
            && (proposalLoopCodes.length || blockedProgressProposalCount >= 2)) {
            loopOptions.agentStateSession.applyControllerEvent("replan_required", {
              decisionId: controllerDecision.decisionId,
              reasonCode: proposalLoopCodes.length ? "proposal_loop_detected" : "blocked_proposal_repeated",
              actionSignature: controllerDecision.actionSignature,
              strategySignature: controllerDecision.strategySignature
            });
            const replanState = loopOptions.agentStateSession.getState().progress;
            emit({
              type: "agent-replan",
              decisionId: controllerDecision.decisionId,
              strategyRevision: replanState.strategyRevision,
              replanAttemptCount: replanState.replanAttemptCount,
              status: "required",
              reasonCodes: [...proposalLoopCodes, ...blockedProposalCodes]
            });
            blockedProgressProposalCount = 0;
            controllerRepairDecision = null;
            continue;
          }
          if (controllerRepairDecision && progressState?.mode === "enforce" && progressState.replanRequired === true) {
            loopOptions.agentStateSession.applyControllerEvent("replan_attempted", { decisionId: controllerDecision.decisionId, accepted: false });
            const afterAttempt = loopOptions.agentStateSession.getState().progress;
            emit({
              type: "agent-replan",
              decisionId: controllerDecision.decisionId,
              strategyRevision: afterAttempt.strategyRevision,
              replanAttemptCount: afterAttempt.replanAttemptCount,
              status: "rejected",
              reasonCodes: normalized.validationCodes
            });
            controllerRepairDecision = null;
            if (afterAttempt.replanAttemptCount >= afterAttempt.budgets.maxStrategyReplans) {
              loopOptions.agentStateSession.applyControllerEvent("progress_budget_exhausted", { decisionId: controllerDecision.decisionId });
              loopOptions.agentStateSession.setControllerTerminationReason("no-progress-budget-exhausted");
              return finishRun("The Agent could not produce a materially different valid strategy within the replan budget.", {
                status: "budget_exhausted",
                reasonCodes: ["no_progress_budget_exhausted"]
              });
            }
            continue;
          }
          if (controllerRepairDecision) {
            loopOptions.agentStateSession.setControllerTerminationReason("controller-invalid-decision");
            return finishRun(agentDecisionController.createControllerBlockedContent(normalized.validationCodes), {
              status: "blocked",
              reasonCodes: ["controller_invalid_decision", ...normalized.validationCodes]
            });
          }
          controllerRepairDecision = controllerDecision;
          continue;
        }
        blockedProgressProposalCount = 0;
        if (progressStateBeforeDecision.progress?.mode === "enforce"
          && progressStateBeforeDecision.progress.replanRequired === true
          && controllerDecision.type === agentDecisionController.DECISION_TYPES.TOOL_CALL) {
          loopOptions.agentStateSession.applyControllerEvent("replan_attempted", { decisionId: controllerDecision.decisionId });
          loopOptions.agentStateSession.applyControllerEvent("strategy_revised", { decisionId: controllerDecision.decisionId });
          emit({
            type: "agent-replan",
            decisionId: controllerDecision.decisionId,
            strategyRevision: controllerDecision.strategyRevision,
            replanAttemptCount: loopOptions.agentStateSession.getState().progress.replanAttemptCount,
            status: "accepted"
          });
        }
        transitionControllerDecision(loopOptions.agentStateSession, "decision_accepted", { decisionId: controllerDecision.decisionId }, emit);
        controllerDecision = getControllerDecision(loopOptions.agentStateSession, controllerDecision.decisionId);
        controllerRepairDecision = null;

        if (controllerDecision.type === agentDecisionController.DECISION_TYPES.REQUEST_USER_INPUT) {
          const authorize = createControllerExecutionAuthorizer(loopOptions.agentStateSession, controllerDecision, emit, runtime, loopOptions.signal);
          await authorize();
          const payload = controllerDecisionPayload || {};
          if (typeof loopOptions.requestClarification !== "function") {
            loopOptions.agentStateSession.setControllerTerminationReason("controller-clarification-unavailable");
            return finishRun("The task is blocked because required user input cannot be requested in this session.", {
              status: "blocked",
              reasonCodes: ["clarification_channel_unavailable"]
            });
          }
          const answer = String(await loopOptions.requestClarification({
            decisionId: controllerDecision.decisionId,
            ambiguityId: `controller-${controllerDecision.decisionId}`,
            question: payload.question,
            reason: payload.reason,
            answerType: payload.answerType,
            choices: Array.isArray(payload.choices) ? payload.choices : []
          }) || "").trim();
          if (answer && settings.intentContractsEnabled === true && loopOptions.intentContract) {
            const refreshed = await intentAnalysis.refreshContractFromUserContext({
              provider,
              settings,
              prompts: loopOptions.prompts,
              contract: loopOptions.intentContract,
              userContext: `Controller clarification:\nQuestion: ${payload.question}\nAnswer: ${answer}`,
              signal: loopOptions.signal
            });
            if (refreshed.contract && refreshed.validation.valid) {
              applyContractUpdate(loopOptions, messages, settings, emit, refreshed.contract, "controller-clarification", "refreshed");
            }
          }
          continue;
        }

        if (controllerDecision.type === agentDecisionController.DECISION_TYPES.PROPOSE_COMPLETION
          || controllerDecision.type === agentDecisionController.DECISION_TYPES.REPORT_BLOCKED) {
          const authorize = createControllerExecutionAuthorizer(loopOptions.agentStateSession, controllerDecision, emit, runtime, loopOptions.signal);
          await authorize();
          controllerReportedBlocked = controllerDecision.type === agentDecisionController.DECISION_TYPES.REPORT_BLOCKED;
          controllerCompletionCandidate = controllerReportedBlocked
            ? agentDecisionController.createReportedBlockerContent(controllerDecisionPayload)
            : String(controllerDecisionPayload?.content || "").trim();
          message = { ...message, content: controllerCompletionCandidate };
          toolCalls = [];
          if (controllerReportedBlocked) loopOptions.agentStateSession.setControllerTerminationReason("controller-reported-blocked");
          else loopOptions.agentStateSession.setControllerTerminationReason("controller-proposed-completion");
        } else {
          toolCalls = [normalized.sanitizedToolCall];
        }
      }
      // When the loop injects the forced discovery call, keep the model's own
      // content on the history message instead of discarding it — that text is
      // the model's plan and doubles as the first narration.
      if (!toolCalls.length && !usedTools && requireInitialDiscovery) {
        toolCalls = [createInitialDiscoveryToolCall(round, prompt)];
      }
      messages.push(createAssistantToolMessage(message, toolCalls));

      if (!toolCalls.length) {
        if (isTokenLimitFinishReason(message.finishReason)) {
          const context = { reason: "max_tokens", mode, phase: "tool planning", finishReason: message.finishReason };
          const continuation = await requestTaskContinuation(context, loopOptions);
          if (!continuation.approved) {
            const content = [String(message.content || "").trim(), continuation.content].filter(Boolean).join("\n\n");
            return finishRun(content, { status: "budget_exhausted", reasonCodes: ["max_tokens"] });
          }
          compactToolResultMessagesForContinuation(messages);
          messages.push(createContinuationMessage(context, continuation));
          continue taskPass;
        }
        // Evidence gate (controller-side tool-use enforcement): if the contract requires
        // inspection but no tool ran, reject this premature completion and steer the model
        // to inspect first. Handles providers (e.g. Gemini) that can't force tool calls.
        if (controllerEnabled && loopOptions.intentContract) {
          const evidence = evaluateCompletionEvidence({
            contract: loopOptions.intentContract,
            usedTools,
            reportedBlocked: controllerReportedBlocked,
            retriesUsed: evidenceGateRetries
          });
          if (evidence.blocked) {
            evidenceGateRetries += 1;
            emit({ type: "steering", reason: "completion-requires-evidence", action: "inspect-first", revision: evidenceGateRetries });
            messages.push({ role: "user", content: buildEvidenceSteeringMessage(loopOptions.intentContract) });
            continue taskPass;
          }
        }
        if (verifierCompletionEnabled && controllerReportedBlocked) {
          loopOptions.agentStateSession.applyControllerEvent("decision_executed", { decisionId: controllerDecision.decisionId });
          return finishRun(controllerCompletionCandidate, { status: "blocked", reasonCodes: ["controller_reported_blocked"] });
        }
        if (verifierCompletionEnabled || shouldAssessCompletion(settings, loopOptions.intentContract)) {
          const gate = controllerReportedBlocked
            ? { rerunPlanning: false, unresolved: [] }
            : await runPlanFinalizationGate(provider, settings, loopOptions, messages, emit, activityRun);
          if (gate.rerunPlanning) continue taskPass;
          addPlanAmbiguityContext(messages, gate.unresolved, loopOptions);
          const candidate = controllerCompletionCandidate
            || await generateHiddenCandidate(provider, messages, emit, { ...loopOptions, requestChatTitle: false });
          let verifierResult = null;
          let assessedCandidate = verifierCompletionEnabled
            ? null
            : await finalizeAssessedCandidate(provider, settings, mode, candidate, loopOptions, activityRun, emit);
          if (verifierCompletionEnabled) {
            await loopOptions.agentStateSession.checkpoint("verification_pending", {
              decisionId: controllerDecision?.decisionId || "", nextRuntimeStep: "verify_completion"
            });
            if (!controllerDecision || controllerDecision.type !== agentDecisionController.DECISION_TYPES.PROPOSE_COMPLETION) {
              return finishRun(candidate, { status: "failed", reasonCodes: ["invalid_completion_proposal"] });
            }
            verifierResult = await completionOrchestrator.runCompletionAttempt({
              decision: controllerDecision,
              candidate,
              contract: loopOptions.intentContract
            });
            await loopOptions.agentStateSession.checkpoint("decision_ready", {
              decisionId: controllerDecision.decisionId, nextRuntimeStep: "apply_verification_result"
            });
            if (verifierResult.action === "stop") {
              return finishRun(verifierResult.content, { status: verifierResult.outcome, reasonCodes: verifierResult.reasonCodes });
            }
            assessedCandidate = { content: candidate, assessment: verifierResult.assessment };
          }
          // Closed-loop steering: on an incomplete verdict, route by arbiter class and, when
          // the decision is to keep going, inject the steering feedback and run another bounded
          // agent pass instead of returning. Blocked and out-of-budget stop and report honestly.
          if (!controllerReportedBlocked && steeringEnabled && assessedCandidate.assessment?.overallStatus === "incomplete") {
            const decision = completionSteering.decideSteering({
              assessment: assessedCandidate.assessment,
              contract: loopOptions.intentContract,
              iteration: revisionIterations,
              maxRevisions,
              priorUnmetIds
            });
            if (decision.action !== "stop" && decision.feedback) {
              priorUnmetIds = new Set([...priorUnmetIds, ...completionSteering.unmetCriterionIds(assessedCandidate.assessment)]);
              revisionIterations += 1;
              steeringFinalReason = decision.reason;
              // Ambiguity / spec-gap: auto-ask one clarification and fold the answer into the
              // contract before the next pass. Falls back to feedback-only if unavailable.
              if (decision.action === "revise-contract") {
                await runSteeringClarification(provider, settings, loopOptions, messages, emit, decision, assessedCandidate.assessment);
              }
              const contractCriteria = loopOptions.intentContract?.acceptanceCriteria || [];
              emit({
                type: "steering",
                reason: decision.reason,
                action: decision.action,
                revision: revisionIterations,
                maxRevisions,
                unmet: (assessedCandidate.assessment?.criteria || [])
                  .filter((verdict) => verdict.status === "unmet")
                  .map((verdict) => {
                    const criterion = contractCriteria.find((entry) => entry.id === verdict.id);
                    return { id: verdict.id, statement: (criterion && (criterion.statement || criterion.description)) || verdict.id };
                  })
              });
              messages.push({ role: "user", content: decision.feedback });
              continue taskPass;
            }
            steeringFinalReason = decision.reason;
          }
          steeringConverged = assessedCandidate.assessment?.overallStatus === "complete";
          if (steeringConverged) steeringFinalReason = "converged";
          else if (!steeringFinalReason) steeringFinalReason = String(assessedCandidate.assessment?.overallStatus || "");
          if (verifierCompletionEnabled) {
            const status = steeringFinalReason === "blocked"
              ? "blocked"
              : (steeringFinalReason === "budget-exhausted" ? "budget_exhausted" : "failed");
            return finishRun(assessedCandidate.content, { status, reasonCodes: verifierResult?.reasonCodes || ["verification_unsatisfied"] });
          }
          return finishRun(assessedCandidate.content);
        }
        const content = controllerCompletionCandidate
          || (usedTools ? await streamFinalAnswer(provider, messages, emit, loopOptions) : String(message.content || "").trim());
        return finishRun(content);
      }
      // Tool calls follow, so this round's content is pre-tool narration, not
      // the final answer. Emit it after reasoning and before the tool events.
      emitNarration(narrationFilter, emit, message.content);
      usedTools = true;
      let approvalAmendmentOutcome = null;
      let terminalDecisionBlockOutcome = null;
      let currentDurableActionContext = null;
      const controllerExecutionAuthorizer = controllerDecision
        ? createControllerExecutionAuthorizer(loopOptions.agentStateSession, controllerDecision, emit, runtime, loopOptions.signal, {
            root,
            getActionContext: () => currentDurableActionContext
          })
        : null;

      for (let toolIndex = 0; toolIndex < toolCalls.length; toolIndex += 1) {
        const toolCall = toolCalls[toolIndex];
        runtime.throwIfAborted(loopOptions.signal);
        const name = toolCall.function?.name || toolCall.name || "";
        let args = {};
        try {
          args = parseToolArguments(toolCall.function?.arguments || toolCall.arguments || "{}");
        } catch (_error) {
          args = {};
        }
        const input = getToolInputSummary(toolCall);
        const toolSignature = createNonRetryableToolSignature(name, args, loopOptions.intentContract);
        const currentMutationControl = mode === "agent" && settings.intentContractsEnabled === true && loopOptions.intentContract
          ? evaluateMutationControl(name, args, loopOptions.intentContract)
          : { blocked: false };
        const intentBlockSignature = createIntentMutationBlockSignature(currentMutationControl);
        const decisionBlockSignature = createIntentDecisionBlockSignature(currentMutationControl);
        if (decisionBlockSignature && (loopOptions.intentDecisionBlockAttempts.get(decisionBlockSignature) || 0) >= 1) {
          if (controllerDecision) markControllerDecisionRejected(loopOptions.agentStateSession, controllerDecision, ["pre_execution_rejected"], emit);
          const result = createIntentBlockFailure(currentMutationControl, {
            repeatedWithoutExecution: true,
            terminalDecisionBlock: true
          });
          activityRun?.recordBlockedChange?.(name, args, result);
          activityRun?.recordToolEvidence?.({ toolCallId: toolCall.id, tool: name, args, result, summary: result.error.message });
          emit({ type: "tool-error", tool: name, input, error: result.error.message, structuredResult: result, activityId: toolCall.id });
          messages.push(createToolOutcomeHistoryMessage(toolCall, name, args, createToolResultContent(name, args, result), "failed"));
          appendDecisionBlockedToolOutcomes(toolCalls, toolIndex + 1, messages, emit, activityRun, currentMutationControl);
          terminalDecisionBlockOutcome = { control: currentMutationControl, result };
          break;
        }
        const priorFailure = (intentBlockSignature && loopOptions.intentMutationBlockResults.get(intentBlockSignature))
          || loopOptions.nonRetryableToolResults.get(toolSignature);
        if (priorFailure) {
          if (controllerDecision) markControllerDecisionRejected(loopOptions.agentStateSession, controllerDecision, ["non_retryable_repeat"], emit);
          const repeatedFailure = { ...priorFailure, executed: false, preExecution: true, repeatedWithoutExecution: true };
          const repeatedActivityId = toolCall.id || `${name}-${round}-${Date.now()}`;
          const repeatedStartedActivity = activityRun?.createStartedActivity(repeatedActivityId, name, args, input) || null;
          emit({
            type: "tool-error",
            tool: name,
            input,
            error: priorFailure.error?.message || priorFailure.errors?.[0]?.message || "This unchanged operation is non-retryable.",
            structuredResult: repeatedFailure,
            activityId: repeatedActivityId,
            activity: repeatedStartedActivity
              ? activityRun?.createFailedActivity(repeatedStartedActivity, args, priorFailure.error?.message || "This unchanged operation is non-retryable.", repeatedFailure)
              : null
          });
          messages.push(createToolOutcomeHistoryMessage(
            toolCall,
            name,
            args,
            createToolResultContent(name, args, repeatedFailure),
            "failed"
          ));
          continue;
        }
        // Intercept the read-only conflict report before normal tool dispatch: it never
        // executes a workspace action; the harness validates and applies the outcome.
        if (name === "report_intent_conflict") {
          if (controllerExecutionAuthorizer) await controllerExecutionAuthorizer();
          const outcome = await handleIntentConflictReport(args, provider, loopOptions, messages, settings, emit);
          recordToolReliability(loopOptions, outcome);
          activityRun?.recordToolEvidence?.({
            toolCallId: toolCall.id,
            tool: name,
            result: outcome,
            summary: outcome.status
          });
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: stringifyToolResult(outcome) });
          emit({ type: "tool", tool: name, input, summary: outcome.status });
          continue;
        }
        const activityId = toolCall.id || `${name}-${round}-${Date.now()}`;
        const startedActivity = activityRun?.createStartedActivity(activityId, name, args, input) || null;
        emit({ type: "tool", decisionId: controllerDecision?.decisionId || "", tool: name, input, summary: "running", activity: startedActivity });
        currentDurableActionContext = { activityId, name, args, decisionId: controllerDecision?.decisionId || "" };
        try {
          await activityRun?.captureBefore(name, args, loopOptions.signal);
          const result = await executeAgentTool(root, settings, mode, toolCall, {
            ...loopOptions,
            emit,
            activityId,
            controllerDecision,
            authorizeDecisionExecution: controllerExecutionAuthorizer
          });
          const summary = summarizeToolResult(name, result);
          if (result?.status === "failed") {
            recordToolReliability(loopOptions, result);
            const failure = result.error || result.errors?.[0] || { code: "tool-execution-failed", message: "The tool operation failed." };
            activityRun?.recordToolEvidence?.({ toolCallId: activityId, tool: name, result, summary });
            if (failure.retryable === false) loopOptions.nonRetryableToolResults.set(toolSignature, result);
            emit({
              type: "tool-error",
              tool: name,
              input,
              error: failure.message || failure.code,
              structuredResult: result,
              activity: startedActivity ? activityRun?.createFailedActivity(startedActivity, args, failure.message || failure.code, result) : null
            });
            messages.push(createToolOutcomeHistoryMessage(toolCall, name, args, createToolResultContent(name, args, result), "failed"));
            if (controllerEnabled) await loopOptions.agentStateSession.checkpoint("action_observed", { actionId: activityId, decisionId: controllerDecision?.decisionId || "", nextRuntimeStep: "choose_next_action" });
            continue;
          }
          const mutationDetails = await activityRun?.completeMutation(name, args, loopOptions.signal);
          const referenceChecks = correctionConsistency.createPostActionReferenceChecks(name, args, mutationDetails, loopOptions.intentContract);
          const stalePostState = referenceChecks.find((check) => check.supersededFound === true);
          if (stalePostState) {
            const verificationResult = {
              status: "failed",
              code: "post-mutation-stale-intent-reference",
              executed: true,
              preExecution: false,
              retryable: true,
              error: {
                code: "post-mutation-stale-intent-reference",
                message: `The action completed, but verified post-state still contains a resource reference superseded by ${stalePostState.amendmentId}. Submit a corrective proposal.`,
                retryable: true,
                amendmentId: stalePostState.amendmentId,
                fieldRef: stalePostState.fieldRef
              }
            };
            recordToolReliability(loopOptions, verificationResult);
            activityRun?.recordToolEvidence?.({ toolCallId: activityId, tool: name, args, result: verificationResult, summary: verificationResult.error.message, mutationDetails, referenceChecks });
            const failedActivity = startedActivity
              ? { ...activityRun.createFinishedActivity(startedActivity, args, result, summary, mutationDetails), status: "failed", resultSummary: verificationResult.error.message }
              : null;
            emit({ type: "tool-error", tool: name, input, error: verificationResult.error.message, structuredResult: verificationResult, activity: failedActivity });
            messages.push(createToolOutcomeHistoryMessage(toolCall, name, args, createToolResultContent(name, args, verificationResult), "failed"));
            if (controllerEnabled) await loopOptions.agentStateSession.checkpoint("action_observed", { actionId: activityId, decisionId: controllerDecision?.decisionId || "", nextRuntimeStep: "choose_next_action" });
            continue;
          }
          recordToolReliability(loopOptions, result);
          const finishedActivity = startedActivity ? activityRun.createFinishedActivity(startedActivity, args, result, summary, mutationDetails) : null;
          activityRun?.recordToolEvidence?.({ toolCallId: activityId, tool: name, args, result, summary: summarizeToolEvidence(name, result), mutationDetails, referenceChecks });
          emit({
            type: "tool",
            tool: name,
            input,
            summary,
            activity: result?.status === "partial" && finishedActivity ? { ...finishedActivity, status: "partial" } : finishedActivity
          });
          messages.push(createToolOutcomeHistoryMessage(toolCall, name, args, createToolResultContent(name, args, result)));
          if (controllerEnabled) await loopOptions.agentStateSession.checkpoint("action_observed", { actionId: activityId, decisionId: controllerDecision?.decisionId || "", nextRuntimeStep: "choose_next_action" });
          emitTaskProfileObservation(name, result);
          if (resolvedExperiment.intentRevision === true) recordSearchAndDetectAbsence(name, args, result, toolCall.id, loopOptions, messages, settings, emit);
          const fallbackToolCall = controllerEnabled ? null : createFileSearchFallbackToolCall(name, args, result, round);
          if (fallbackToolCall) {
            messages.push(createAssistantToolMessage({ content: "The previous file search returned no matches; trying a broader filename glob." }, [fallbackToolCall]));
            const fallbackName = fallbackToolCall.function.name;
            const fallbackArgs = parseToolArguments(fallbackToolCall.function.arguments);
            const fallbackInput = getToolInputSummary(fallbackToolCall);
            const fallbackActivityId = fallbackToolCall.id;
            const fallbackActivity = activityRun?.createStartedActivity(fallbackActivityId, fallbackName, fallbackArgs, fallbackInput) || null;
            emit({ type: "tool", tool: fallbackName, input: fallbackInput, summary: "running", activity: fallbackActivity });
            try {
              await activityRun?.captureBefore(fallbackName, fallbackArgs, loopOptions.signal);
              const fallbackResult = await executeAgentTool(root, settings, mode, fallbackToolCall, { ...loopOptions, emit, activityId: fallbackActivityId });
              recordToolReliability(loopOptions, fallbackResult);
              const fallbackSummary = summarizeToolResult(fallbackName, fallbackResult);
              const finishedFallbackActivity = fallbackActivity ? activityRun.createFinishedActivity(fallbackActivity, fallbackArgs, fallbackResult, fallbackSummary, null) : null;
              activityRun?.recordToolEvidence?.({
                toolCallId: fallbackActivityId,
                tool: fallbackName,
                result: fallbackResult,
                summary: fallbackSummary
              });
              emit({
                type: "tool",
                tool: fallbackName,
                input: fallbackInput,
                summary: fallbackSummary,
                activity: finishedFallbackActivity
              });
              messages.push(createToolOutcomeHistoryMessage(
                fallbackToolCall,
                fallbackName,
                fallbackArgs,
                createToolResultContent(fallbackName, fallbackArgs, fallbackResult)
              ));
              if (resolvedExperiment.intentRevision === true) recordSearchAndDetectAbsence(fallbackName, fallbackArgs, fallbackResult, fallbackToolCall.id, loopOptions, messages, settings, emit);
            } catch (fallbackError) {
              recordToolReliability(loopOptions, null, fallbackError);
              const fallbackErrorMessage = fallbackError?.message || String(fallbackError);
              activityRun?.recordToolEvidence?.({
                toolCallId: fallbackActivityId,
                tool: fallbackName,
                error: fallbackError,
                summary: fallbackErrorMessage
              });
              emit({
                type: "tool-error",
                tool: fallbackName,
                input: fallbackInput,
                error: fallbackErrorMessage,
                activity: fallbackActivity ? activityRun?.createFailedActivity(fallbackActivity, fallbackArgs, fallbackErrorMessage) : null
              });
              messages.push(createToolOutcomeHistoryMessage(
                fallbackToolCall,
                fallbackName,
                fallbackArgs,
                createToolErrorContent(fallbackError),
                "failed"
              ));
            }
          }
        } catch (error) {
          if (controllerDecision) {
            const currentDecision = getControllerDecision(loopOptions.agentStateSession, controllerDecision.decisionId);
            if (currentDecision?.status === "accepted" && error?.userInstructions) {
              transitionControllerDecision(loopOptions.agentStateSession, "decision_superseded", {
                decisionId: controllerDecision.decisionId,
                runtimeReasonCodes: ["stale_state_version"]
              }, emit);
            } else if (currentDecision?.status === "accepted") {
              const code = /^approval-/.test(String(error?.code || "")) ? "authorization_denied" : "pre_execution_rejected";
              markControllerDecisionRejected(loopOptions.agentStateSession, controllerDecision, [code], emit);
            }
          }
          recordToolReliability(loopOptions, null, error);
          const errorMessage = error?.message || String(error);
          const structuredFailure = createStructuredToolFailure(error);
          if (error?.retryable === false) {
            if (error.code === "intent-mutation-blocked" && intentBlockSignature) {
              loopOptions.intentMutationBlockResults.set(intentBlockSignature, structuredFailure);
              if (decisionBlockSignature) {
                loopOptions.intentDecisionBlockAttempts.set(
                  decisionBlockSignature,
                  (loopOptions.intentDecisionBlockAttempts.get(decisionBlockSignature) || 0) + 1
                );
              }
            }
            else loopOptions.nonRetryableToolResults.set(toolSignature, structuredFailure);
          }
          activityRun?.recordToolEvidence?.({ toolCallId: activityId, tool: name, args, error, summary: errorMessage });
          if (resolvedExperiment.intentRevision === true && intentConflict.SEARCH_TOOLS.has(name)) {
            recordSearchAndDetectAbsence(name, args, null, toolCall.id, loopOptions, messages, settings, emit, { failed: true, notFound: name === "read_file" && intentConflict.isNotFoundError(error) });
          }
          emit({
            type: "tool-error",
            tool: name,
            input,
            error: errorMessage,
            structuredResult: structuredFailure,
            activity: startedActivity ? activityRun?.createFailedActivity(startedActivity, args, errorMessage, structuredFailure) : null
          });
          messages.push(createToolOutcomeHistoryMessage(toolCall, name, args, createToolResultContent(name, args, structuredFailure), "failed"));
          if (controllerEnabled) await loopOptions.agentStateSession.checkpoint("action_observed", { actionId: activityId, decisionId: controllerDecision?.decisionId || "", nextRuntimeStep: "choose_next_action" });
          // Approval-instruction amendment: a rejection carrying user instructions is a
          // user-authoritative change to the contract. Refresh (or scope-block on
          // failure), re-inject, and continue -- the tool error above already told the
          // model the action was rejected.
          if (settings.intentContractsEnabled === true && loopOptions.intentContract && error?.userInstructions) {
            try {
              const amendment = await applyApprovalAmendment({
                provider, settings, prompts: loopOptions.prompts, contract: loopOptions.intentContract,
                instructions: error.userInstructions, toolName: name, args, toolCallId: toolCall.id, signal: loopOptions.signal
              });
              applyContractUpdate(loopOptions, messages, settings, emit, amendment.contract, "approval-instruction", "amended", {
                applied: amendment.applied,
                state: amendment.state,
                diagnostics: amendment.diagnostics
              });
              approvalAmendmentOutcome = amendment;
            } catch (amendmentError) {
              const amendmentId = `AM${(loopOptions.intentContract.amendments || []).length + 1}`;
              const diagnostics = [{ attempt: 1, stage: "provider", errorCodes: ["approval-amendment-unexpected-failure"] }];
              const blocked = applyScopedBlock(loopOptions.intentContract, {
                instructions: error.userInstructions,
                toolName: name,
                args,
                toolCallId: toolCall.id,
                amendmentId,
                diagnostics
              });
              approvalAmendmentOutcome = { contract: blocked, state: "blocked", applied: false, amendmentId, diagnostics };
              applyContractUpdate(loopOptions, messages, settings, emit, blocked, "approval-instruction-refresh-error", "amended", {
                applied: false,
                state: "blocked",
                diagnostics
              });
            }
            appendStaleApprovalToolOutcomes(toolCalls, toolIndex + 1, messages, emit, activityRun, approvalAmendmentOutcome.amendmentId);
            if (approvalAmendmentOutcome.applied) {
              const activeCorrections = correctionConsistency.listActiveReferenceReplacements(approvalAmendmentOutcome.contract);
              messages.push({
                role: "user",
                content: [
                  "Harness intent-amendment observation (authoritative control context; not user-authored or model-authored):",
                  JSON.stringify({
                    type: "intent-amendment-observation",
                    amendmentId: approvalAmendmentOutcome.amendmentId,
                    originalProposal: "permanently-denied",
                    activeCorrections
                  }),
                  "Replan from the amended contract. Rebuild every dependent action and submit corrected mutations through normal approval policy."
                ].join("\n")
              });
              messages.push({
                role: "system",
                content: "Replan from the updated contract. The rejected proposal is permanently stale, its approval did not transfer, and every corrected mutation must follow the normal approval policy."
              });
            }
            break;
          }
        }
      }
      if (controllerEnabled && controllerDecision?.type === agentDecisionController.DECISION_TYPES.TOOL_CALL && progressEvaluationEnabled) {
        if (loopOptions.agentStateSession.isCheckpointEnabled?.() === true) {
          await loopOptions.agentStateSession.checkpoint("verification_pending", { decisionId: controllerDecision.decisionId, nextRuntimeStep: "evaluate_progress" });
        }
        const progressOutcome = await assessControllerProgress({
          session: loopOptions.agentStateSession,
          evaluator: progressEvaluator,
          decisionId: controllerDecision.decisionId,
          requestId: loopOptions.requestId,
          emit
        });
        if (loopOptions.agentStateSession.isCheckpointEnabled?.() === true) {
          await loopOptions.agentStateSession.checkpoint("decision_ready", { decisionId: controllerDecision.decisionId, nextRuntimeStep: "apply_progress_control" });
        }
        if (progressOutcome.action === "terminate") {
          loopOptions.agentStateSession.setControllerTerminationReason("no-progress-budget-exhausted");
          return finishRun("The Agent stopped after repeated actions failed to make enough progress and the strategy-replan budget was exhausted.", {
            status: "budget_exhausted",
            reasonCodes: ["no_progress_budget_exhausted"]
          });
        }
      }
      if (terminalDecisionBlockOutcome) {
        const decisionId = terminalDecisionBlockOutcome.control?.decision?.id || "unknown";
        const blockerCandidate = `Mutation work stopped because unresolved decision ${decisionId} blocked more than one proposal. No repeated proposal was executed.`;
        const content = !verifierCompletionEnabled && shouldAssessCompletion(settings, loopOptions.intentContract)
          ? (await finalizeAssessedCandidate(provider, settings, mode, blockerCandidate, loopOptions, activityRun, emit)).content
          : blockerCandidate;
        return finishRun(content, { status: "blocked", reasonCodes: ["repeated_mutation_block"] });
      }
      if (approvalAmendmentOutcome?.state === "blocked") {
        const blockerCandidate = "The task could not continue because the approval instruction could not be validated after one bounded repair attempt. The instruction was preserved, and no corrected mutation was executed.";
        const content = !verifierCompletionEnabled && shouldAssessCompletion(settings, loopOptions.intentContract)
          ? (await finalizeAssessedCandidate(provider, settings, mode, blockerCandidate, loopOptions, activityRun, emit)).content
          : blockerCandidate;
        return finishRun(content, { status: "blocked", reasonCodes: ["approval_amendment_blocked"] });
      }
      if (approvalAmendmentOutcome?.state === "applied") continue;
    }

    const context = { reason: "max_actions", mode, phase: "tool actions", maxRounds };
    const continuation = await requestTaskContinuation(context, loopOptions);
    if (!continuation.approved) {
      const content = continuation.content || createTaskLimitFallbackContent(context);
      return finishRun(content, { status: "budget_exhausted", reasonCodes: ["max_actions"] });
    }
    messages.push(createContinuationMessage(context, continuation));
  }
}
module.exports = {
  getAgentToolDefinitions,
  runAgentToolLoop,
  // Exported (additive) so the Plan stateful controller can execute allowlisted
  // read-only tools without re-entering the full Agent loop. Does not change
  // Agent behavior.
  executeAgentTool,
  _test: { appendToolReliabilityNote, recordToolReliability, shouldAssessCompletion, summarizeToolEvidence, extractEvidenceContent }
};
