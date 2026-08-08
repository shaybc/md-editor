/** Retained MD-Editor tools exposed through the autonomous runtime boundary. */

"use strict";

const toolScopes = require("../../core/tool-scope-registry");
const editorReads = require("../../tools/editor-read-tools");
const gitTools = require("../../tools/git-panel-tools");
const apiTools = require("../../tools/api-client-agent-tools");
const conversionTools = require("../../tools/conversion-export-tools");
const graphTools = require("../../tools/graph-tools");
const executionTools = require("../../tools/structured-execution-tools");
const { authorizeTool } = require("./approval-gateway");

const API_HANDLERS = Object.freeze({
  api_asset_search: apiTools.apiAssetSearch,
  api_asset_get: apiTools.apiAssetGet,
  request_create: apiTools.requestCreate,
  request_update: apiTools.requestUpdate,
  request_send: apiTools.requestSend,
  request_history_get: apiTools.requestHistoryGet,
  response_analyze: apiTools.responseAnalyze,
  environment_get: apiTools.environmentGet,
  environment_update: apiTools.environmentUpdate,
  environment_resolve: apiTools.environmentResolve,
  mock_create: apiTools.mockCreate,
  mock_update: apiTools.mockUpdate,
  mock_call: apiTools.mockCall
});

const EXECUTION_HANDLERS = Object.freeze({
  compile_project: executionTools.compileProject,
  run_tests: executionTools.runTests,
  manage_dependencies: executionTools.managePackage
});

const PREFERENCE_TOOLS = new Set([
  "preferences_get", "preferences_search", "preferences_export",
  "preferences_update", "preferences_reset", "preferences_import"
]);

function definition(name) {
  const properties = name === "git_status"
    ? { maxFiles: { type: "integer", minimum: 1, maximum: 1000, description: "Maximum file details; aggregate counts remain complete." } }
    : {};
  return {
    type: "function",
    function: {
      name,
      description: toolScopes.describeTool(name) || `Use MD-Editor's ${toolScopes.humanizeTool(name)} capability.`,
      parameters: { type: "object", properties, additionalProperties: true }
    }
  };
}

/** Build the configured application-tool roster for one conversational mode. */
function getApplicationToolDefinitions(policy, settings = {}) {
  const names = toolScopes.resolveToolset({
    mode: policy.mode,
    enabledScopes: settings.toolScopes
  }).toolNames;
  return names
    .filter((name) => !["glob", "search_text", "read_file", "apply_edit", "write_file", "plan_list", "plan_read", "plan_create", "plan_update", "run_command"].includes(name))
    .map(definition);
}

async function authorizeIfRequired(name, args, context) {
  const approval = await authorizeTool(context.request, name, args, context.taskGrants);
  if (approval.approved) return null;
  return { denied: true, instructions: approval.instructions || "The user denied this action." };
}

/** Dispatch a retained application tool, returning undefined when it is not owned here. */
async function executeApplicationTool(name, args, context) {
  const request = context.request;
  const root = request.workspaceRoot;
  const options = { signal: request.signal };

  if (name === "get_link_context") {
    return editorReads.getLinkContext(root, args, { ...options, editorReadContext: request.editorReadContext });
  }
  if (gitTools.isGitPanelTool(name)) {
    if (gitTools.isGitPanelMutatingTool(name)) {
      const denied = await authorizeIfRequired(name, args, context);
      if (denied) return denied;
    }
    return gitTools.runGitPanelTool(root, name, args, { ...options, allowGitMutation: gitTools.isGitPanelMutatingTool(name) });
  }
  if (graphTools.isGraphTool(name)) {
    if (graphTools.isGraphActionTool(name)) {
      return graphTools.requestGraphAction(root, name, args, { ...options, requestAppAction: request.requestAppAction });
    }
    const handlers = {
      graph_get_state: graphTools.graphGetState,
      graph_search_nodes: graphTools.graphSearchNodes,
      graph_get_node_context: graphTools.graphGetNodeContext,
      graph_find_paths: graphTools.graphFindPaths
    };
    return handlers[name](root, args, { ...options, editorReadContext: request.editorReadContext });
  }
  if (conversionTools.isConversionExportTool(name)) {
    if (conversionTools.isConversionExportActionTool(name)) {
      const denied = await authorizeIfRequired(name, args, context);
      if (denied) return denied;
    }
    if (name === "read_conversion_report") return conversionTools.readConversionReport(root, args, options);
    return conversionTools.requestConversionExportAction(root, name, args, { ...options, requestAppAction: request.requestAppAction });
  }
  if (PREFERENCE_TOOLS.has(name)) {
    if (["preferences_update", "preferences_reset", "preferences_import"].includes(name)) {
      const denied = await authorizeIfRequired(name, args, context);
      if (denied) return denied;
    }
    if (typeof request.requestAppAction !== "function") throw new Error("Preference tools require the MD-Editor app action bridge.");
    return request.requestAppAction({ tool: name, args, targetPath: name, preview: { target: name } });
  }
  if (API_HANDLERS[name]) {
    return API_HANDLERS[name](root, args, { ...options, profileRoot: request.profileRoot });
  }
  if (EXECUTION_HANDLERS[name]) {
    const security = request.securityContext || {};
    return EXECUTION_HANDLERS[name](root, args, {
      ...options,
      policy: security.policy,
      policyError: security.policyError,
      auditLogger: security.auditLogger,
      requestId: request.requestId
    });
  }
  return undefined;
}

module.exports = { executeApplicationTool, getApplicationToolDefinitions };
