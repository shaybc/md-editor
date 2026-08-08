/** Core tools exposed lazily to the autonomous runtime. */

"use strict";

const toolScopes = require("../../core/tool-scope-registry");
const { getApplicationToolDefinitions, getApplicationToolRegistrations } = require("./application-tool-adapter");

function text(description) { return { type: "string", description }; }
function integer(description) { return { type: "integer", description }; }
function tool(name, description, properties, required = []) {
  return { type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } };
}

const DEFINITIONS = Object.freeze([
  tool("list_files", "List files in the workspace.", { maxFiles: integer("Maximum files to return") }),
  tool("glob_files", "Find workspace files matching a glob.", { pattern: text("Glob pattern") }, ["pattern"]),
  tool("search_text", "Search workspace text.", { pattern: text("Text to search") }, ["pattern"]),
  tool("read_file", "Read a workspace file with line numbers.", { path: text("Workspace-relative path"), startLine: integer("First line"), endLine: integer("Last line") }, ["path"]),
  tool("apply_edit", "Replace exact text in a workspace file.", { path: text("Workspace-relative path"), search: text("Exact existing text"), replacement: text("Replacement text"), approvalReason: text("Why this change is needed") }, ["path", "search", "replacement"]),
  tool("write_file", "Create or replace a workspace file.", { path: text("Workspace-relative path"), content: text("Complete file content"), approvalReason: text("Why this change is needed") }, ["path", "content"]),
  tool("run_command", "Run a command in the workspace.", { command: text("Command to run"), timeoutMs: integer("Timeout in milliseconds"), approvalReason: text("Why execution is needed") }, ["command"]),
  tool("discover_extensions", "List available rules, skills, agents, plugins, hooks, MCP servers, and deferred tools.", { kind: text("Optional extension kind") }),
  tool("capability_search", "Search and activate secondary tool schemas. Use select:tool_name for exact selection, comma-separated names for multiple tools, or task keywords for ranked discovery.", { query: text("Exact selection or capability keywords"), maxResults: integer("Maximum metadata results") }, ["query"]),
  tool("load_extension", "Load one discovered rule, skill, or agent definition.", { id: text("Discovered extension id") }, ["id"]),
  tool("continuity_search", "Search bounded historical run summaries from this exact workspace.", { query: text("Relevant topic, path, or prior outcome"), maxResults: integer("Maximum summaries to return") }, ["query"]),
  tool("artifact_read", "Read a bounded range from a stored observation artifact.", { id: text("Artifact id"), offset: integer("Starting character offset"), length: integer("Maximum characters to return") }, ["id"]),
  tool("context_observation_list", "List bounded metadata for active tool observations and show which older observations may be released.", { maxResults: integer("Maximum observations to return") }),
  tool("context_release", "Release selected older tool observations from active context while retaining their artifact references.", { ids: { type: "array", items: text("Observation id") }, reason: text("Short reason the observations are no longer needed") }, ["ids"]),
  tool("plan_list", "List saved implementation plans from the local plan repository.", { status: text("Optional plan status"), query: text("Optional title, path, or body search"), workspaceRoot: text("Optional workspace filter"), maxResults: integer("Maximum plans to return") }),
  tool("plan_read", "Read one saved implementation plan.", { id: text("Plan id"), path: text("Plan repository path") }),
  tool("plan_create", "Save a new implementation plan. Include the complete Markdown plan body.", { title: text("Plan title"), body: text("Complete Markdown plan body"), status: text("Plan status"), milestones: { type: "array", items: { type: "object" } } }, ["body"]),
  tool("plan_update", "Update an existing saved plan while retaining its identity. Include the complete revised Markdown body when revising content.", { id: text("Plan id"), path: text("Plan repository path"), title: text("Updated title"), body: text("Complete revised Markdown plan body"), status: text("Plan status"), archived: { type: "boolean" }, milestones: { type: "array", items: { type: "object" } } }),
  tool("mcp_search_offerings", "Search one enabled external server's resource and prompt metadata.", { serverId: text("External server id"), query: text("Search text") }, ["serverId"]),
  tool("mcp_read_resource", "Read one selected external resource.", { serverId: text("External server id"), uri: text("Resource URI") }, ["serverId", "uri"]),
  tool("mcp_get_prompt", "Load one selected external prompt.", { serverId: text("External server id"), name: text("Prompt name"), arguments: { type: "object", description: "Prompt arguments" } }, ["serverId", "name"]),
  tool("work_create", "Create an optional model-controlled work item for a complex task.", { subject: text("Brief work title"), description: text("Required outcome"), activeForm: text("Present-continuous progress label"), metadata: { type: "object" } }, ["subject", "description"]),
  tool("work_get", "Read one work item.", { id: text("Work item id") }, ["id"]),
  tool("work_list", "List work items in stable order.", {}),
  tool("work_update", "Update, complete, assign, link, or delete a work item.", { id: text("Work item id"), subject: text("New title"), description: text("New description"), activeForm: text("Progress label"), owner: text("Worker id"), status: text("pending, in_progress, completed, or deleted"), addBlocks: { type: "array", items: text("Work item id") }, addBlockedBy: { type: "array", items: text("Work item id") }, metadata: { type: "object" } }, ["id"]),
  tool("worker_launch", "Launch isolated delegated work synchronously or in the background.", { description: text("Short worker description"), prompt: text("Self-contained delegated task"), agentId: text("Optional discovered agent definition id"), background: { type: "boolean" }, isolation: { type: "string", enum: ["shared", "worktree"] } }, ["description", "prompt"]),
  tool("worker_list", "List delegated workers and current states.", {}),
  tool("worker_message", "Send guidance to a worker, resuming a completed worker when needed.", { id: text("Worker id"), summary: text("Short message summary"), message: text("Message content") }, ["id", "message"]),
  tool("worker_wait", "Wait for a worker or return its current snapshot.", { id: text("Worker id"), block: { type: "boolean" }, timeoutMs: integer("Maximum wait, capped at 30000 ms") }, ["id"]),
  tool("worker_stop", "Stop one queued or running worker.", { id: text("Worker id") }, ["id"])
]);

function getToolDefinitions(policy, settings = {}) {
  const core = DEFINITIONS.filter((entry) => {
    const name = entry.function.name;
    if (!policy.allowWrites && ["apply_edit", "write_file"].includes(name)) return false;
    if (!policy.allowCommands && name === "run_command") return false;
    if (!policy.allowDelegation && name.startsWith("worker_")) return false;
    if (!policy.allowPlanReads && ["plan_list", "plan_read"].includes(name)) return false;
    if (!policy.allowPlanWrites && ["plan_create", "plan_update"].includes(name)) return false;
    return true;
  });
  return [...core, ...getApplicationToolDefinitions(policy, settings)];
}

/** Return tool schemas with independent runtime metadata for unified deferral. */
function getToolRegistrations(policy, settings = {}) {
  const definitions = getToolDefinitions(policy, settings);
  const application = new Map(getApplicationToolRegistrations(policy, settings).map((entry) => [entry.definition.function.name, entry]));
  return definitions.map((definition) => {
    const name = definition.function.name;
    if (application.has(name)) return application.get(name);
    return {
      definition,
      source: "runtime",
      domain: runtimeDomain(name),
      description: definition.function.description,
      searchHint: name.replace(/_/g, " "),
      rulePaths: runtimeRulePaths(name),
      executionOwner: "runtime"
    };
  });
}

function runtimeRulePaths(name) {
  if (["read_file", "apply_edit", "write_file"].includes(name)) return { arguments: ["path"], results: ["path"] };
  if (name === "search_text") return { results: ["[].path"] };
  return undefined;
}

/** Return canonical names known to the runtime, including names prohibited for this request. */
function getKnownToolNames() {
  return Array.from(new Set([
    ...DEFINITIONS.map((definition) => definition.function.name),
    ...toolScopes.listAllScopedTools()
  ]));
}

function runtimeDomain(name) {
  if (name.startsWith("plan_")) return "plans";
  if (name.startsWith("work_")) return "work";
  if (name.startsWith("worker_")) return "workers";
  if (name.startsWith("context_") || name === "artifact_read" || name === "continuity_search") return "context";
  if (name.startsWith("mcp_")) return "external";
  if (["discover_extensions", "load_extension", "capability_search"].includes(name)) return "extensions";
  return "workspace";
}

module.exports = { getKnownToolNames, getToolDefinitions, getToolRegistrations };
