/** Validate and execute autonomous tool calls through retained application services. */

"use strict";

const workspaceTools = require("../../tools/workspace-tools");
const { authorizeTool } = require("./approval-gateway");
const { loadExtension } = require("./extension-registry");
const { executeApplicationTool } = require("./application-tool-adapter");

function parseArguments(call) {
  const raw = call?.function?.arguments;
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch (_error) { throw new Error(`Invalid JSON arguments for ${call?.function?.name || "tool"}.`); }
}

/** Execute one validated tool call. */
async function executeTool(call, context) {
  const name = String(call?.function?.name || "");
  const args = parseArguments(call);
  if (name !== "capability_search") context.capabilities?.assertCallable?.(name);
  const root = context.request.workspaceRoot;
  const options = { signal: context.request.signal };
  if (name === "list_files") return workspaceTools.listFiles(root, { ...options, maxFiles: args.maxFiles });
  if (name === "glob_files") return workspaceTools.globFiles(root, args.pattern, { ...options, maxFiles: args.maxFiles });
  if (name === "search_text") return workspaceTools.searchGrep(root, args.pattern, { ...options, maxMatches: args.maxMatches });
  if (name === "read_file") {
    context.windowSteward?.recordFile?.(args.path);
    return workspaceTools.readFile(root, args.path, { ...options, startLine: args.startLine, endLine: args.endLine });
  }
  if (["apply_edit", "write_file", "run_command"].includes(name)) {
    if (name === "run_command" && context.request.securityContext?.policy?.shell?.mode !== "sandbox-shell") {
      await context.request.securityContext?.auditLogger?.record({
        timestamp: new Date().toISOString(), requestId: context.request.requestId, workspace: root,
        tool: name, requestedCommand: String(args.command || ""), decision: "deny",
        reason: "Free-form commands are disabled by the effective security policy."
      });
      const error = new Error("Free-form commands are disabled by the effective AI security policy.");
      error.code = "FREE_FORM_COMMAND_NOT_PERMITTED";
      error.retryable = false;
      error.doNotRetry = true;
      throw error;
    }
    const autoRunCommand = name === "run_command" && context.request.settings?.agentAutoRunCommands === true;
    const approval = autoRunCommand
      ? { approved: true, automatic: true }
      : await authorizeTool(context.request, name, args, context.taskGrants);
    if (!approval.approved) return { denied: true, instructions: approval.instructions || "The user denied this action." };
    if (name === "apply_edit") {
      context.windowSteward?.recordFile?.(args.path);
      return workspaceTools.applyEdit(root, args.path, args.search, args.replacement, { ...options, allowWrites: true });
    }
    if (name === "write_file") {
      context.windowSteward?.recordFile?.(args.path);
      return workspaceTools.writeFile(root, args.path, args.content, { ...options, allowWrites: true });
    }
    await context.request.securityContext?.auditLogger?.record({
      timestamp: new Date().toISOString(), requestId: context.request.requestId, workspace: root,
      tool: name, requestedCommand: String(args.command || ""), decision: "requested"
    });
    try {
      const result = await workspaceTools.runCommand(root, args.command, { ...options, allowCommands: true, timeoutMs: args.timeoutMs });
      await context.request.securityContext?.auditLogger?.record({
        timestamp: new Date().toISOString(), requestId: context.request.requestId, workspace: root,
        tool: name, requestedCommand: String(args.command || ""), decision: result.success === false ? "executed-failure" : "executed-success"
      });
      return result;
    } catch (error) {
      await context.request.securityContext?.auditLogger?.record({
        timestamp: new Date().toISOString(), requestId: context.request.requestId, workspace: root,
        tool: name, requestedCommand: String(args.command || ""), decision: "execution-error", error: error?.message || String(error)
      });
      throw error;
    }
  }
  if (name === "discover_extensions") {
    const entries = [...context.extensions, ...context.fabric.snapshot().entries];
    return args.kind ? entries.filter((entry) => entry.kind === args.kind) : entries;
  }
  if (name === "capability_search") return context.capabilities.search(args.query, { maxResults: args.maxResults });
  if (name === "load_extension") {
    const extension = context.fabric.entries.has(args.id)
      ? await context.fabric.activate(args.id)
      : await loadExtension(context.extensions, args.id);
    context.loadedExtensions.add(args.id);
    context.loadedExtensionBodies?.set?.(args.id, extension);
    return extension;
  }
  if (name === "continuity_search") return context.continuity.search(args.query, { maxResults: args.maxResults, includeContent: true });
  if (name === "artifact_read") return context.artifactVault.read(args.id, args);
  if (name === "context_observation_list") return context.observationLedger.list(context.messages, { currentRound: context.currentRound, maxResults: args.maxResults });
  if (name === "context_release") return context.observationLedger.release(args.ids, context.messages, { currentRound: context.currentRound, reason: args.reason, initiator: "model" });
  if (["plan_list", "plan_read", "plan_create", "plan_update"].includes(name)) return context.planRepository.execute(name, args);
  if (name === "mcp_search_offerings") return context.mcp.searchOfferings(args.serverId, args.query);
  if (name === "mcp_read_resource") return context.mcp.readResource(args.serverId, args.uri);
  if (name === "mcp_get_prompt") return context.mcp.getPrompt(args.serverId, args.name, args.arguments);
  if (name === "work_create") return context.work.create(args);
  if (name === "work_get") return context.work.get(args.id);
  if (name === "work_list") return context.work.list();
  if (name === "work_update") return context.work.update(args.id, args);
  if (name === "worker_launch") return context.workers.launch(args);
  if (name === "worker_list") return context.workers.list();
  if (name === "worker_message") return context.workers.message(args.id, args.message, args.summary);
  if (name === "worker_wait") return context.workers.wait(args.id, args);
  if (name === "worker_stop") return context.workers.stop(args.id);
  if (name.startsWith("mcp__")) return context.capabilities.invoke(name, args);
  const applicationResult = await executeApplicationTool(name, args, context);
  if (applicationResult !== undefined) return applicationResult;
  throw new Error(`Unknown or unavailable tool: ${name}`);
}

module.exports = { executeTool, parseArguments };
