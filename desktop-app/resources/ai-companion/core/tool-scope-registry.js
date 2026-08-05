/**
 * Tool scope registry + resolver.
 *
 * Single source of truth for which tools belong to which scope, and for resolving
 * the concrete tool set exposed on a given request. Keeps the model's callable
 * list small: an always-on read-only core, a mode-governed edit scope, and
 * per-domain read/write scopes gated by a user allow-list (Settings -> AI).
 *
 * Tool names are canonical end-to-end (no aliasing): the same name is used in the
 * definitions the model sees, in execution, effect lookup, approval, recovery, and
 * activity. toModelName/toCanonicalName are identity passthroughs retained only so
 * callers need not change if a future rename layer is reintroduced.
 *
 * Pure module: no IO, no provider calls, no side effects. Dual-exported for
 * headless (require) and browser (window) use.
 */
(function(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MarkdownViewerAiCompanionToolScopes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  /**
   * No active renames: tool names are canonical everywhere. These maps are empty,
   * so toModelName/toCanonicalName are identity. Kept as an extension point.
   */
  const RENAMES = Object.freeze({});
  const REVERSE_RENAMES = Object.freeze({});

  /** internal name -> model name (for building definitions). */
  function toModelName(name) { return Object.prototype.hasOwnProperty.call(RENAMES, name) ? RENAMES[name] : name; }
  /** model name -> internal/canonical name (for execution, effect lookup, etc.). */
  function toCanonicalName(name) { return Object.prototype.hasOwnProperty.call(REVERSE_RENAMES, name) ? REVERSE_RENAMES[name] : name; }

  /** Always-on, read-only core. Present in every mode; never gated. */
  const CORE_READ = Object.freeze(["read_file", "glob", "search_text"]);

  /** File-editing tools. Governed by mode/edit-capability, not the user matrix. */
  const EDIT = Object.freeze(["apply_edit", "write_file"]);

  /**
   * Per-domain scopes, each split read/write (execution is write/execute only).
   * These are the scopes the Settings -> AI matrix toggles.
   */
  const DOMAIN_SCOPES = Object.freeze({
    "git.read": Object.freeze(["git_status", "git_diff", "git_branches"]),
    "git.write": Object.freeze([
      "git_stage", "git_unstage", "git_commit", "git_fetch",
      "git_pull", "git_push", "git_branch_create", "git_branch_switch"
    ]),
    "plan.read": Object.freeze(["plan_list", "plan_read"]),
    "plan.write": Object.freeze(["plan_create", "plan_update"]),
    "apiclient.read": Object.freeze([
      "api_asset_search", "api_asset_get", "request_history_get", "response_analyze",
      "environment_get", "environment_resolve", "mock_call"
    ]),
    "apiclient.write": Object.freeze([
      "request_create", "request_update", "request_send", "environment_update",
      "mock_create", "mock_update"
    ]),
    "graph.read": Object.freeze([
      "graph_get_state", "graph_search_nodes", "graph_get_node_context", "graph_find_paths",
      "get_link_context"
    ]),
    "graph.write": Object.freeze([
      "graph_apply_filter", "graph_focus_nodes", "graph_show_local", "graph_clear_focus"
    ]),
    "settings.read": Object.freeze(["preferences_get", "preferences_search", "preferences_export"]),
    "settings.write": Object.freeze(["preferences_update", "preferences_reset", "preferences_import"]),
    "conversion.read": Object.freeze([
      "get_conversion_export_state", "get_code_conversion_status", "read_conversion_report"
    ]),
    "conversion.write": Object.freeze([
      "export_active_document", "export_active_folder_graph", "start_code_conversion"
    ]),
    "execution": Object.freeze(["run_command", "run_tests", "compile_project", "manage_dependencies"])
  });

  /**
   * Tools removed from the model roster entirely (context-snapshot readers, live
   * cursor/selection writers, and niche/maintenance tools). Dropped whenever
   * scoping is applied, regardless of scope membership.
   */
  const REMOVED_TOOLS = Object.freeze(new Set([
    "get_workspace_state", "get_recent_activity", "read_active_document", "read_open_tabs",
    "get_document_structure", "git_pr_notes", "secret_redact", "plan_rebuild_index",
    "create_document_tab", "insert_at_cursor", "replace_selection", "replace_document_range",
    "extract_selection_to_note", "open_file_in_tab",
    // Merged away by the consolidation: folded into a kept tool, so dropped from the
    // roster. list_files -> glob; search_vault -> search_text (grep); changes_digest ->
    // git_status; restore_dependencies -> manage_dependencies; plan_update_status -> plan_update.
    "list_files", "search_vault", "git_changes_digest", "restore_dependencies", "plan_update_status"
  ]));

  /** Domains, in display order, with which halves exist (for the settings matrix). */
  const DOMAINS = Object.freeze([
    Object.freeze({ id: "git", label: "Git", read: "git.read", write: "git.write" }),
    Object.freeze({ id: "plan", label: "Plan", read: "plan.read", write: "plan.write" }),
    Object.freeze({ id: "apiclient", label: "API Client", read: "apiclient.read", write: "apiclient.write" }),
    Object.freeze({ id: "graph", label: "Graph", read: "graph.read", write: "graph.write" }),
    Object.freeze({ id: "settings", label: "Settings", read: "settings.read", write: "settings.write" }),
    Object.freeze({ id: "conversion", label: "Conversion", read: "conversion.read", write: "conversion.write" }),
    Object.freeze({ id: "execution", label: "Execution", read: null, write: "execution" })
  ]);

  /** Every user-toggleable scope id (domain read/write + execution). */
  const TOGGLEABLE_SCOPES = Object.freeze(Object.keys(DOMAIN_SCOPES));

  /** Scopes that read (never mutate) — default-on in the user allow-list. */
  const READ_SCOPES = Object.freeze(TOGGLEABLE_SCOPES.filter((id) => id.endsWith(".read")));
  /** Scopes that mutate/execute — default-off in the user allow-list. */
  const WRITE_SCOPES = Object.freeze(TOGGLEABLE_SCOPES.filter((id) => !id.endsWith(".read")));

  /**
   * Which scopes each mode may draw from, before the user allow-list is applied.
   * Plan is read-only (no edit, no write/execution). Chat is read-only Q&A.
   * Agent is full. `core.read` is always present regardless of these seeds.
   */
  const MODE_SEEDS = Object.freeze({
    plan: Object.freeze(["git.read", "plan.read", "apiclient.read", "graph.read", "settings.read", "conversion.read"]),
    chat: Object.freeze(["git.read", "plan.read", "graph.read", "settings.read", "conversion.read"]),
    agent: Object.freeze([...TOGGLEABLE_SCOPES]),
    "git-summary": Object.freeze(["git.read"])
  });

  /** Modes permitted to use the edit (file-write) scope. */
  const EDIT_CAPABLE_MODES = Object.freeze(new Set(["agent"]));

  /** Human-readable labels for each tool (for the Settings matrix). */
  const TOOL_LABELS = Object.freeze({
    // Core (always-on readers + mode-governed editors)
    glob: "Find files", search_text: "Search workspace", read_file: "Read file",
    apply_edit: "Apply edit", write_file: "Write file",
    git_status: "Status", git_diff: "Diff / comparison", git_branches: "Branches",
    git_stage: "Stage files", git_unstage: "Unstage files", git_commit: "Commit",
    git_fetch: "Fetch", git_pull: "Pull", git_push: "Push",
    git_branch_create: "Create branch", git_branch_switch: "Switch branch",
    plan_list: "List plans", plan_read: "Read plan", plan_create: "Create plan", plan_update: "Update plan",
    api_asset_search: "Search assets", api_asset_get: "Get asset", request_history_get: "Request history",
    response_analyze: "Analyze response", environment_get: "Get environment", environment_resolve: "Resolve variables",
    mock_call: "Call mock", request_create: "Create request", request_update: "Update request",
    request_send: "Send request", environment_update: "Update environment", mock_create: "Create mock", mock_update: "Update mock",
    graph_get_state: "Graph state", graph_search_nodes: "Search nodes", graph_get_node_context: "Node context",
    graph_find_paths: "Find paths", get_link_context: "Link context",
    graph_apply_filter: "Apply filter", graph_focus_nodes: "Focus nodes", graph_show_local: "Show local graph", graph_clear_focus: "Clear focus",
    preferences_get: "Get preferences", preferences_search: "Search preferences", preferences_export: "Export settings",
    preferences_update: "Update preferences", preferences_reset: "Reset preferences", preferences_import: "Import settings",
    get_conversion_export_state: "Export state", get_code_conversion_status: "Conversion status", read_conversion_report: "Conversion report",
    export_active_document: "Export document", export_active_folder_graph: "Export folder graph", start_code_conversion: "Start conversion",
    run_command: "Run command", run_tests: "Run tests", compile_project: "Compile project", manage_dependencies: "Manage dependencies"
  });

  function humanizeTool(name) {
    if (TOOL_LABELS[name]) return TOOL_LABELS[name];
    return String(name || "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }

  /** What each tool does and the ability it grants the agent (for tooltips). */
  const TOOL_DESCRIPTIONS = Object.freeze({
    glob: "Finds workspace files by glob pattern (e.g. **/*.md). Always available so the agent can locate files.",
    search_text: "Searches file contents across the workspace. Always available so the agent can find text.",
    read_file: "Reads a file slice by path, or the active document when no path is given. Always available so the agent can inspect content.",
    apply_edit: "Applies a targeted search/replace edit to a file. Available only in modes that can edit (governed by mode; requires approval).",
    write_file: "Creates or overwrites a file with full content. Available only in modes that can edit (governed by mode; requires approval).",
    git_status: "Reports changed, staged, and untracked files. Lets the agent see what was modified without running git itself.",
    git_diff: "Shows the line-level differences for a file (staged or unstaged). Lets the agent read exactly what changed.",
    git_branches: "Lists local branches, remote branches, and tags. Lets the agent understand the branch layout.",
    git_stage: "Stages specific files for commit (git add). Lets the agent prepare changes for a commit (requires approval).",
    git_unstage: "Removes files from the staging area. Lets the agent undo staging (requires approval).",
    git_commit: "Creates a commit from staged changes. Lets the agent record changes to history (requires approval).",
    git_fetch: "Fetches updates from remotes without merging. Lets the agent refresh remote state (requires approval).",
    git_pull: "Pulls and merges the current branch from its remote. Lets the agent update local code (requires approval).",
    git_push: "Pushes the current branch to its remote. Lets the agent publish commits (requires approval).",
    git_branch_create: "Creates and switches to a new local branch. Lets the agent start a new line of work (requires approval).",
    git_branch_switch: "Switches to another local or remote-tracking branch. Lets the agent change the working branch (requires approval).",
    plan_list: "Lists saved implementation plans. Lets the agent discover existing plans.",
    plan_read: "Reads a saved plan's contents. Lets the agent review a plan's details.",
    plan_create: "Saves a new implementation plan. Lets the agent record a plan for later.",
    plan_update: "Updates a saved plan's body, fields, or status. Lets the agent revise or progress a plan.",
    api_asset_search: "Searches saved API Client requests, folders, environments, and mocks. Lets the agent find API assets.",
    api_asset_get: "Fetches one API asset by id. Lets the agent read a specific request, environment, or mock.",
    request_history_get: "Reads recent, redacted API request history. Lets the agent review past calls.",
    response_analyze: "Analyzes an API response for likely cause and next step. Lets the agent interpret results.",
    environment_get: "Reads API Client environments with secrets masked. Lets the agent see variables safely.",
    environment_resolve: "Resolves {{variables}} in text or request fields. Lets the agent preview concrete values.",
    mock_call: "Calls a saved local mock route. Lets the agent exercise a mock without network access.",
    request_create: "Creates a saved API request. Lets the agent add a request (requires approval).",
    request_update: "Updates a saved API request. Lets the agent modify a request (requires approval).",
    request_send: "Sends a request using resolved environment variables. Lets the agent make a real network call (requires approval).",
    environment_update: "Updates environment variables. Lets the agent change API configuration (requires approval).",
    mock_create: "Creates a saved mock route. Lets the agent add a mock (requires approval).",
    mock_update: "Updates a saved mock route. Lets the agent modify a mock (requires approval).",
    graph_get_state: "Reads the current graph tabs, view, filters, and counts. Lets the agent understand the graph view.",
    graph_search_nodes: "Searches graph nodes by label, id, path, tag, or type. Lets the agent locate nodes.",
    graph_get_node_context: "Reads a node's links, tags, and local context. Lets the agent understand a node.",
    graph_find_paths: "Finds short directed paths between two nodes. Lets the agent trace connections.",
    get_link_context: "Reads a note's outgoing links, backlinks, and unresolved links. Lets the agent map relationships.",
    graph_apply_filter: "Applies safe filters to the visible graph. Lets the agent change what is shown (no file changes).",
    graph_focus_nodes: "Highlights and pans/zooms to matching nodes. Lets the agent direct the view.",
    graph_show_local: "Switches to a local graph around a node. Lets the agent focus a neighborhood.",
    graph_clear_focus: "Clears graph highlighting and local filters. Lets the agent reset the view.",
    preferences_get: "Reads md-editor preference values. Lets the agent inspect settings.",
    preferences_search: "Searches preference descriptors by name or category. Lets the agent find settings.",
    preferences_export: "Reads a bounded settings-export manifest. Lets the agent review exportable settings.",
    preferences_update: "Updates known preference keys. Lets the agent change settings (requires approval).",
    preferences_reset: "Resets preference keys to defaults. Lets the agent restore defaults (requires approval).",
    preferences_import: "Applies pasted settings JSON. Lets the agent import settings (requires approval).",
    get_conversion_export_state: "Reads conversion/export availability and active-document export state. Lets the agent see what can be exported.",
    get_code_conversion_status: "Reads the code converter's live status and progress. Lets the agent monitor conversion.",
    read_conversion_report: "Reads the missing-dependencies conversion report. Lets the agent review conversion gaps.",
    export_active_document: "Exports the active document to Markdown, HTML, or PDF. Lets the agent produce an export (requires approval).",
    export_active_folder_graph: "Exports the active folder to a portable graph archive. Lets the agent export a graph (requires approval).",
    start_code_conversion: "Starts the code-to-Markdown converter. Lets the agent run a conversion (requires approval).",
    run_command: "Requests a free-form shell command (normally policy-gated). Lets the agent run commands (requires approval).",
    run_tests: "Runs the project's tests. Lets the agent verify behavior.",
    compile_project: "Compiles or builds the project. Lets the agent check that it builds.",
    manage_dependencies: "Installs, updates, removes, downloads, or restores packages. Lets the agent manage dependencies (requires approval)."
  });

  function describeTool(name) { return TOOL_DESCRIPTIONS[name] || ""; }

  /** Every domain tool (across all scopes) — the user-toggleable set, per tool. */
  function allDomainTools() {
    return Object.values(DOMAIN_SCOPES).flat();
  }

  /** True for tools that default ON (they belong to a `.read` scope). */
  const READ_TOOLS = Object.freeze(new Set(READ_SCOPES.flatMap((id) => DOMAIN_SCOPES[id])));
  function toolDefaultsOn(name) { return READ_TOOLS.has(name); }

  /**
   * Default per-tool allow-list: read tools on, write/execution tools off.
   * Keyed by individual tool name (not scope). Core readers and edit tools are not
   * included here (always-on / mode-governed).
   */
  function defaultToolScopes() {
    const access = {};
    for (const name of allDomainTools()) access[name] = toolDefaultsOn(name);
    return access;
  }

  /** Coerce an arbitrary value into a valid per-tool allow-list. */
  function normalizeToolScopes(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const access = {};
    for (const name of allDomainTools()) {
      access[name] = toolDefaultsOn(name) ? source[name] !== false : source[name] === true;
    }
    return access;
  }

  /** Whether a single domain tool is enabled under the allow-list. */
  function isToolEnabled(toolName, enabled) {
    return normalizeToolScopes(enabled)[toolName] === true;
  }

  /**
   * Structured view for the Settings UI: each domain with its read and write tools
   * (name + label), so the UI can render a toggle per tool grouped under the domain.
   * @returns {Array<{id,label,read:Array<{name,label}>,write:Array<{name,label}>}>}
   */
  function getDomainToolGroups() {
    const toEntry = (name) => ({ name, label: humanizeTool(name), description: describeTool(name) });
    return DOMAINS.map((domain) => ({
      id: domain.id,
      label: domain.label,
      read: (domain.read ? DOMAIN_SCOPES[domain.read] : []).map(toEntry),
      write: (domain.write ? DOMAIN_SCOPES[domain.write] : []).map(toEntry)
    }));
  }

  /**
   * The always-on core group for display: read = core readers (never gated), write
   * = editing tools (governed by mode). Shown read-only in Settings so the user
   * knows they exist; they cannot be toggled.
   * @returns {{id,label,read:Array<{name,label,description}>,write:Array<{name,label,description}>}}
   */
  function getCoreToolGroup() {
    const toEntry = (name) => ({ name, label: humanizeTool(name), description: describeTool(name) });
    return { id: "core", label: "Core", read: CORE_READ.map(toEntry), write: EDIT.map(toEntry) };
  }

  /**
   * Resolve the concrete tool-name set for a request.
   *
   * @param {object} input
   * @param {string} input.mode - "plan" | "chat" | "agent" | "git-summary".
   * @param {object} [input.enabledScopes] - per-tool allow-list (toolScopes).
   * @param {string[]} [input.taskScopes] - optional narrower per-task scope subset;
   *   when given, only these scopes (intersected with the mode seeds) are eligible.
   * @returns {{ toolNames: string[], scopes: string[] }}
   */
  function resolveToolset(input = {}) {
    const mode = String(input.mode || "agent");
    const enabled = normalizeToolScopes(input.enabledScopes);
    const seeds = MODE_SEEDS[mode] || MODE_SEEDS.agent;
    const taskScopes = Array.isArray(input.taskScopes) && input.taskScopes.length
      ? new Set(input.taskScopes)
      : null;

    const activeScopes = ["core.read"];
    const toolNames = new Set(CORE_READ);

    if (EDIT_CAPABLE_MODES.has(mode) && (!taskScopes || taskScopes.has("edit"))) {
      activeScopes.push("edit");
      for (const name of EDIT) toolNames.add(name);
    }

    for (const scopeId of seeds) {
      if (taskScopes && !taskScopes.has(scopeId)) continue;
      let anyEnabled = false;
      for (const name of DOMAIN_SCOPES[scopeId]) {
        if (enabled[name] === true) { toolNames.add(name); anyEnabled = true; }
      }
      if (anyEnabled) activeScopes.push(scopeId);
    }

    return { toolNames: [...toolNames], scopes: activeScopes };
  }

  /** Reverse lookup: scope id for a tool name (or null). */
  function scopeForTool(toolName) {
    if (CORE_READ.includes(toolName)) return "core.read";
    if (EDIT.includes(toolName)) return "edit";
    for (const [scopeId, tools] of Object.entries(DOMAIN_SCOPES)) {
      if (tools.includes(toolName)) return scopeId;
    }
    return null;
  }

  /**
   * Filter a list of tool names to those exposed for a request.
   *
   * - Explicitly removed tools are always dropped.
   * - Domain tools are kept only when enabled per-tool and their scope is in reach
   *   for the mode (+ optional taskScopes).
   * - Core readers and edit tools follow the mode rules.
   * - Tools not mapped to any scope and not removed are kept (conservative).
   *
   * @param {string[]} toolNames
   * @param {object} context - { mode, enabledScopes, taskScopes }
   * @returns {string[]} the retained names, order preserved.
   */
  function filterToolNames(toolNames, context = {}) {
    const resolved = new Set(resolveToolset(context).toolNames);
    return (Array.isArray(toolNames) ? toolNames : []).filter((name) => {
      if (REMOVED_TOOLS.has(name)) return false;
      const scope = scopeForTool(name);
      if (scope === null) return true;
      return resolved.has(name);
    });
  }

  /** Every tool name the registry currently keeps (core + edit + domain scopes). */
  function listAllScopedTools() {
    return [...CORE_READ, ...EDIT, ...allDomainTools()];
  }

  return {
    CORE_READ,
    EDIT,
    DOMAIN_SCOPES,
    DOMAINS,
    REMOVED_TOOLS,
    RENAMES,
    REVERSE_RENAMES,
    TOOL_LABELS,
    toModelName,
    toCanonicalName,
    MODE_SEEDS,
    EDIT_CAPABLE_MODES,
    TOGGLEABLE_SCOPES,
    READ_SCOPES,
    WRITE_SCOPES,
    humanizeTool,
    allDomainTools,
    getDomainToolGroups,
    getCoreToolGroup,
    defaultToolScopes,
    normalizeToolScopes,
    isToolEnabled,
    resolveToolset,
    scopeForTool,
    filterToolNames,
    listAllScopedTools
  };
});
