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
  tool("list_files", "Return a bounded workspace file overview with truncation metadata. Generated and vendor directories are omitted; use glob_files for a specific path.", { maxFiles: integer("Maximum files to return") }),
  tool("glob_files", "Find workspace files matching a glob.", { pattern: text("Glob pattern") }, ["pattern"]),
  tool("find_documentation", "Find likely workspace README, help, docs, guide, manual, or wiki files without broadly listing the repository.", { query: text("Documentation topic or location being sought"), maxResults: integer("Maximum results, up to 50") }, ["query"]),
  tool("search_text", "Search workspace text.", { pattern: text("Text to search") }, ["pattern"]),
  tool("read_file", "Read a file from the opened folder or an external location explicitly supplied by the user.", { path: text("Opened-folder-relative, user-supplied absolute, or known-folder path"), startLine: integer("First line"), endLine: integer("Last line") }, ["path"]),
  tool("apply_edit", "Replace exact text in a file from the opened folder or an external location explicitly supplied by the user.", { path: text("Opened-folder-relative, user-supplied absolute, or known-folder path"), search: text("Exact existing text"), replacement: text("Replacement text"), approvalReason: text("Why this change is needed") }, ["path", "search", "replacement"]),
  tool("write_file", "Create or replace a file in the opened folder or an external location explicitly supplied by the user.", { path: text("Opened-folder-relative, user-supplied absolute, or known-folder path"), content: text("Complete file content"), approvalReason: text("Why this change is needed") }, ["path", "content"]),
  tool("run_command", "Run a command in an opened folder or a working directory explicitly supplied by the user.", { command: text("Command to run"), cwd: text("Opened-folder-relative, user-supplied absolute, or known-folder working directory"), timeoutMs: integer("Timeout in milliseconds"), approvalReason: text("Why execution is needed") }, ["command"]),
  tool("discover_extensions", "List available rules, skills, agents, plugins, hooks, MCP servers, and deferred tools.", { kind: text("Optional extension kind") }),
  tool("capability_search", "Search and activate secondary tool schemas. Use select:tool_name for exact selection, comma-separated names for multiple tools, or task keywords for ranked discovery.", { query: text("Exact selection or capability keywords"), maxResults: integer("Maximum metadata results") }, ["query"]),
  tool("load_extension", "Load one discovered non-skill extension. Workflow skills must be activated through skill_invoke.", { id: text("Discovered extension id") }, ["id"]),
  tool("skill_invoke", "Activate one advertised workflow skill by its exact name. The runtime loads its instructions only after this call.", { name: text("Exact advertised workflow name"), arguments: { description: "Optional workflow arguments", oneOf: [{ type: "string" }, { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } }] } }, ["name"]),
  tool("request_user_choice", "Pause the foreground run and ask the user for a decision that cannot be resolved from available context.", {
    reason: text("One short sentence explaining why this decision is required"),
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          header: text("Short imperative decision title, ideally 2-5 words"),
          question: text("Brief direct question, one line when possible"),
          multiSelect: { type: "boolean" },
          allowFreeText: { type: "boolean" },
          options: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                label: text("Short option label"),
                description: text("Brief effect or tradeoff, one short sentence")
              },
              required: ["label", "description"]
            }
          }
        },
        required: ["question", "options"]
      }
    }
  }, ["questions"]),
  tool("internet_search", "Search current public internet sources and return titles, snippets, and URLs.", { query: text("Search query"), allowedDomains: { type: "array", items: text("Allowed domain") }, blockedDomains: { type: "array", items: text("Blocked domain") }, maxResults: integer("Maximum results, up to 20") }, ["query"]),
  tool("page_retrieve", "Retrieve one public page as bounded Markdown after domain approval and network safety checks.", { url: text("Public HTTP or HTTPS URL"), objective: text("Optional extraction objective"), reason: text("Why this source is needed"), maxBytes: integer("Maximum response bytes"), timeoutMs: integer("Timeout in milliseconds") }, ["url"]),
  tool("schedule_create", "Create a future or recurring autonomous task for this workspace.", { prompt: text("Task to run"), delayMinutes: integer("Minutes before the first run"), intervalMinutes: integer("Minutes between recurring runs"), expression: text("Optional five-field local-time calendar expression"), recurring: { type: "boolean" }, approximate: { type: "boolean", description: "Allow deterministic bounded timing jitter for an interval recurrence" }, durable: { type: "boolean" }, expiresInDays: integer("Expiration in days, capped at 30") }, ["prompt"]),
  tool("schedule_list", "List autonomous task schedules for this workspace.", {}),
  tool("schedule_cancel", "Cancel one autonomous task schedule.", { id: text("Schedule id") }, ["id"]),
  tool("notebook_inspect", "Inspect bounded cells and metadata from a workspace notebook before editing it.", { path: text("Workspace-relative .ipynb path"), startCell: integer("First cell index"), maxCells: integer("Maximum cells") }, ["path"]),
  tool("notebook_cell_edit", "Insert, replace, or delete one inspected notebook cell.", { path: text("Workspace-relative .ipynb path"), mode: { type: "string", enum: ["insert", "replace", "delete"] }, cellId: text("Stable cell id"), cellIndex: integer("Cell index when no id is available"), cellType: { type: "string", enum: ["code", "markdown"] }, source: text("Complete new cell source"), approvalReason: text("Why this notebook edit is needed") }, ["path", "mode"]),
  tool("workspace_structure", "Build a ranked structural view of workspace files and declarations.", { maxTokens: integer("Token budget from 256 to 16384"), focusPaths: { type: "array", items: text("Path to boost") }, focusSymbols: { type: "array", items: text("Symbol to boost") } }),
  tool("continuity_search", "Search bounded historical run summaries from this exact workspace.", { query: text("Relevant topic, path, or prior outcome"), maxResults: integer("Maximum summaries to return") }, ["query"]),
  tool("memory_search", "Search confirmed memory metadata.", { query: text("Topic"), scope: text("personal or team"), maxResults: integer("Maximum topics") }, ["query"]),
  tool("memory_read", "Read one confirmed curated memory topic.", { id: text("Memory topic id"), scope: text("personal or team") }, ["id"]),
  tool("memory_propose", "Propose durable memory for user confirmation.", { scope: text("personal or team"), type: text("Topic type"), title: text("Topic title"), summary: text("Reusable summary"), content: text("Complete memory body"), tags: { type: "array", items: text("Topic tag") } }, ["scope", "type", "title", "content"]),
  tool("memory_update", "Propose a revision while retaining topic identity.", { id: text("Existing topic id"), scope: text("personal or team"), type: text("Topic type"), title: text("Updated title"), summary: text("Updated summary"), content: text("Complete revised body"), tags: { type: "array", items: text("Updated tag") } }, ["id", "scope", "content"]),
  tool("memory_forget", "Request confirmation to remove one curated memory topic.", { id: text("Memory topic id"), scope: text("personal or team") }, ["id"]),
  tool("route_list", "List configured credential-free provider routes.", { purpose: text("Optional route purpose") }),
  tool("route_inspect", "Inspect one configured provider route.", { id: text("Route id") }, ["id"]),
  tool("route_select", "Select an authorized route for subsequent model calls.", { id: text("Route id"), reason: text("Why this route fits") }, ["id"]),
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
  tool("worker_launch", "Launch isolated delegated work synchronously or in the background.", { description: text("Short worker description"), prompt: text("Self-contained delegated task"), agentId: text("Optional discovered agent definition id"), routeId: text("Optional configured provider route"), background: { type: "boolean" }, isolation: { type: "string", enum: ["shared", "worktree"] } }, ["description", "prompt"]),
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
    if (!policy.allowSkillInvocation && name === "skill_invoke") return false;
    if (!policy.allowScheduling && name.startsWith("schedule_")) return false;
    if (!policy.allowUserInteraction && name === "request_user_choice") return false;
    if (!policy.allowInternetSearch && name === "internet_search") return false;
    if (!policy.allowPageRetrieval && name === "page_retrieve") return false;
    if (!policy.allowNotebookReads && name === "notebook_inspect") return false;
    if (!policy.allowNotebookWrites && name === "notebook_cell_edit") return false;
    if (!policy.allowWorkspaceStructure && name === "workspace_structure") return false;
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
  if (["read_file", "apply_edit", "write_file", "notebook_inspect", "notebook_cell_edit"].includes(name)) return { arguments: ["path"], results: ["path"] };
  if (name === "search_text") return { results: ["[].path"] };
  if (name === "find_documentation") return { results: ["results[].path"] };
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
  if (name.startsWith("memory_")) return "memory";
  if (name.startsWith("route_")) return "routing";
  if (name.startsWith("plan_")) return "plans";
  if (name.startsWith("work_")) return "work";
  if (name.startsWith("worker_")) return "workers";
  if (name === "skill_invoke") return "skills";
  if (name.startsWith("schedule_")) return "scheduling";
  if (name === "request_user_choice") return "interaction";
  if (["internet_search", "page_retrieve"].includes(name)) return "internet";
  if (name.startsWith("notebook_")) return "notebooks";
  if (name === "workspace_structure") return "structure";
  if (name.startsWith("context_") || name === "artifact_read" || name === "continuity_search") return "context";
  if (name.startsWith("mcp_")) return "external";
  if (["discover_extensions", "load_extension", "capability_search"].includes(name)) return "extensions";
  return "workspace";
}

module.exports = { getKnownToolNames, getToolDefinitions, getToolRegistrations };
