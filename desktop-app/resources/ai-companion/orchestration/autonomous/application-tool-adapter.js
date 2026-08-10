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
  const parameters = name === "compile_project"
    ? { type: "object", properties: {}, additionalProperties: false }
    : { type: "object", properties, additionalProperties: true };
  return {
    type: "function",
    function: {
      name,
      description: toolScopes.describeTool(name) || `Use MD-Editor's ${toolScopes.humanizeTool(name)} capability.`,
      parameters
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

/** Build deferred-capability registrations while preserving the existing definition API. */
function getApplicationToolRegistrations(policy, settings = {}) {
  return getApplicationToolDefinitions(policy, settings).map((toolDefinition) => {
    const name = toolDefinition.function.name;
    return {
      definition: toolDefinition,
      source: "application",
      domain: applicationDomain(name),
      description: toolDefinition.function.description,
      searchHint: toolScopes.humanizeTool(name),
      permissionScope: String(toolScopes.scopeForTool(name) || ""),
      rulePaths: applicationRulePaths(name),
      executionOwner: "application"
    };
  });
}

function applicationRulePaths(name) {
  if (name === "get_link_context") return { arguments: ["path"], results: ["document.path", "backlinks[].path", "graphMatches[].path"] };
  if (name === "graph_search_nodes") return { arguments: ["path"], results: ["results[].path", "results[].file.path"] };
  if (name === "graph_get_node_context") return {
    arguments: ["path"],
    results: ["node.path", "node.file.path", "incoming[].node.path", "incoming[].node.file.path", "outgoing[].node.path", "outgoing[].node.file.path", "localGraph.nodes[].path", "localGraph.nodes[].file.path"]
  };
  if (name === "graph_find_paths") return {
    arguments: ["from", "to"],
    results: ["from.path", "from.file.path", "to.path", "to.file.path", "paths[].nodes[].path", "paths[].nodes[].file.path"]
  };
  if (name === "read_conversion_report") return { arguments: ["path", "destinationRoot"], results: ["root", "jsonPath", "markdownPath"] };
  return undefined;
}

function applicationDomain(name) {
  if (name.startsWith("git_")) return "git";
  if (["api_asset_search", "api_asset_get", "request_create", "request_update", "request_send", "request_history_get", "response_analyze", "environment_get", "environment_update", "environment_resolve", "mock_create", "mock_update", "mock_call"].includes(name)) return "api-client";
  if (name.startsWith("graph_") || name === "get_link_context") return "graph";
  if (name.startsWith("preferences_")) return "preferences";
  if (["compile_project", "run_tests", "manage_dependencies"].includes(name)) return "execution";
  if (/conversion|export/.test(name)) return "conversion";
  return "application";
}

async function authorizeIfRequired(name, args, context) {
  const approval = await authorizeTool(context.request, name, args, context.taskGrants);
  if (approval.approved) return null;
  return { denied: true, doNotRetry: approval.doNotRetry === true, denialFingerprint: approval.denialFingerprint, instructions: approval.instructions || "The user denied this action." };
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
      requestAppAction: request.requestAppAction,
      policy: security.policy,
      policyError: security.policyError,
      auditLogger: security.auditLogger,
      requestId: request.requestId
    });
  }
  return undefined;
}

module.exports = { executeApplicationTool, getApplicationToolDefinitions, getApplicationToolRegistrations };
