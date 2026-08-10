/** Validate and execute autonomous tool calls through retained application services. */

"use strict";

const workspaceTools = require("../../tools/workspace-tools");
const { authorizeTool } = require("./approval-gateway");
const { loadExtension } = require("./extension-registry");
const { executeApplicationTool } = require("./application-tool-adapter");
const { CommandImpactInspector, digestCommand, normalizeCommand, redactCommand } = require("../../security/command-impact/command-impact-inspector");
const { publicCommandImpact } = require("../../security/command-impact/command-impact-view");

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
  const root = context.request.workspaceRoot;
  if (name === "run_command" && context.request.securityContext?.policy?.shell?.mode !== "sandbox-shell") {
    await context.request.securityContext?.auditLogger?.record({
      timestamp: new Date().toISOString(), requestId: context.request.requestId, workspace: root,
      tool: name, requestedCommand: redactCommand(args.command).slice(0, 4000), decision: "deny",
      reason: "Free-form commands are disabled by the effective security policy."
    });
    const error = new Error("Free-form commands are disabled by the effective AI security policy.");
    error.code = "FREE_FORM_COMMAND_NOT_PERMITTED";
    error.retryable = false;
    error.doNotRetry = true;
    throw error;
  }
  if (name !== "capability_search") context.capabilities?.assertCallable?.(name);
  if (name !== "skill_invoke") context.skillInvocation?.assertToolAllowed?.(name);
  const options = { signal: context.request.signal };
  if (name === "list_files") {
    const limit = Math.max(1, Math.min(Number(args.maxFiles) || 80, 2000));
    const files = await workspaceTools.listFiles(root, { ...options, discovery: true, maxFiles: limit + 1 });
    return {
      files: files.slice(0, limit),
      returned: Math.min(files.length, limit),
      limit,
      truncated: files.length > limit,
      omittedDirectories: [".cache", ".downloads", ".git", ".gradle", ".idea", ".vscode", "build", "coverage", "dist", "node_modules", "out", "target", "vendor"]
    };
  }
  if (name === "glob_files") return workspaceTools.globFiles(root, args.pattern, { ...options, maxFiles: args.maxFiles });
  if (name === "find_documentation") return workspaceTools.findDocumentation(root, args.query, { ...options, maxResults: args.maxResults });
  if (name === "search_text") return workspaceTools.searchGrep(root, args.pattern, { ...options, maxMatches: args.maxMatches });
  if (name === "read_file") {
    const target = context.pathAuthority.resolveFilePath(args.path);
    context.windowSteward?.recordFile?.(target.resolvedPath);
    const result = await workspaceTools.readFile(target.root, target.relativePath, { ...options, startLine: args.startLine, endLine: args.endLine });
    return { ...result, path: target.external ? target.resolvedPath : result.path, resolvedPath: target.resolvedPath };
  }
  if (["apply_edit", "write_file", "run_command"].includes(name)) {
    const target = name === "run_command" ? context.pathAuthority.resolveCommandDirectory(args.cwd) : context.pathAuthority.resolveFilePath(args.path);
    const commandRoot = name === "run_command" ? target.resolvedPath : root;
    const approvalArgs = target.external ? { ...args, ...(name === "run_command" ? { cwd: target.resolvedPath } : { path: target.resolvedPath }) } : args;
    const commandAnalysis = name === "run_command"
      ? await (context.commandImpactInspector || new CommandImpactInspector()).inspect({
        command: args.command,
        workspaceRoot: root,
        workingDirectory: commandRoot,
        platform: process.platform,
        configuredShell: process.env.ComSpec
      })
      : null;
    const approval = await authorizeTool(context.request, name, approvalArgs, context.taskGrants, {
      permissionPolicy: context.permissionPolicy,
      denialLedger: context.denialLedger,
      riskAdvisor: context.riskAdvisor,
      commandAnalysis,
      autoRunCommands: context.request.settings?.agentAutoRunCommands === true
    });
    if (!approval.approved) return { denied: true, resolvedPath: target.resolvedPath, doNotRetry: approval.doNotRetry === true, denialFingerprint: approval.denialFingerprint, instructions: approval.instructions || "The user denied this action." };
    if (name === "apply_edit") {
      context.windowSteward?.recordFile?.(target.resolvedPath);
      let result;
      try { result = await workspaceTools.applyEdit(target.root, target.relativePath, args.search, args.replacement, { ...options, allowWrites: true }); }
      catch (error) { error.resolvedPath = target.resolvedPath; throw error; }
      return { ...result, path: target.external ? target.resolvedPath : result.path, resolvedPath: target.resolvedPath };
    }
    if (name === "write_file") {
      context.windowSteward?.recordFile?.(target.resolvedPath);
      let result;
      try { result = await workspaceTools.writeFile(target.root, target.relativePath, args.content, { ...options, allowWrites: true }); }
      catch (error) { error.resolvedPath = target.resolvedPath; throw error; }
      return { ...result, path: target.external ? target.resolvedPath : result.path, resolvedPath: target.resolvedPath };
    }
    if (digestCommand(normalizeCommand(args.command)) !== commandAnalysis.commandDigest) {
      const error = new Error("The command changed after authorization and must be analyzed again.");
      error.code = "COMMAND_AUTHORIZATION_MISMATCH";
      error.retryable = false;
      error.doNotRetry = true;
      throw error;
    }
    const commandImpact = publicCommandImpact(commandAnalysis);
    await context.request.securityContext?.auditLogger?.record({
      timestamp: new Date().toISOString(), requestId: context.request.requestId, workspace: root,
      tool: name, requestedCommand: commandAnalysis.preview, commandImpact, approvalSource: approval.approvalSource || "unknown", automatic: approval.automatic === true, decision: "requested"
    });
    try {
      const result = await workspaceTools.runCommand(commandRoot, args.command, { ...options, allowCommands: true, timeoutMs: args.timeoutMs, environment: args.environment, expectedCommandDigest: commandAnalysis.commandDigest });
      await context.request.securityContext?.auditLogger?.record({
        timestamp: new Date().toISOString(), requestId: context.request.requestId, workspace: root,
        tool: name, requestedCommand: commandAnalysis.preview, commandImpact, approvalSource: approval.approvalSource || "unknown", automatic: approval.automatic === true, decision: result.success === false ? "executed-failure" : "executed-success"
      });
      return result;
    } catch (error) {
      await context.request.securityContext?.auditLogger?.record({
        timestamp: new Date().toISOString(), requestId: context.request.requestId, workspace: root,
        tool: name, requestedCommand: commandAnalysis.preview, commandImpact, approvalSource: approval.approvalSource || "unknown", automatic: approval.automatic === true, decision: "execution-error", error: error?.message || String(error)
      });
      throw error;
    }
  }
  if (name === "discover_extensions") {
    const entries = [...context.extensions, ...context.fabric.snapshot().entries.filter((entry) => entry.kind !== "agent")];
    return args.kind ? entries.filter((entry) => entry.kind === args.kind) : entries;
  }
  if (name === "capability_search") return context.capabilities.search(args.query, { maxResults: args.maxResults });
  if (name === "skill_invoke") return context.skillInvocation.invoke(args.name, args.arguments, { trigger: "model", context });
  if (name === "request_user_choice") {
    const result = await context.interactionGate.requestChoice(args, { toolCallId: call.id });
    if (!result?.declined) context.pathAuthority?.addUserText(result?.answers);
    return result;
  }
  if (name === "internet_search") return context.internetResearch.search(args);
  if (name === "page_retrieve") return context.internetResearch.retrieve(args);
  if (name === "schedule_create") return context.scheduler.create(args);
  if (name === "schedule_list") return context.scheduler.list();
  if (name === "schedule_cancel") return context.scheduler.cancel(args.id);
  if (name === "notebook_inspect") {
    context.windowSteward?.recordFile?.(args.path);
    return context.notebooks.inspect(args);
  }
  if (name === "notebook_cell_edit") {
    const approval = await authorizeTool(context.request, name, args, context.taskGrants, {
      permissionPolicy: context.permissionPolicy,
      denialLedger: context.denialLedger,
      riskAdvisor: context.riskAdvisor
    });
    if (!approval.approved) return { denied: true, doNotRetry: approval.doNotRetry === true, denialFingerprint: approval.denialFingerprint, instructions: approval.instructions || "The notebook edit was denied." };
    context.windowSteward?.recordFile?.(args.path);
    return context.notebooks.edit(args);
  }
  if (name === "workspace_structure") return context.workspaceAtlas.build(args);
  if (name === "load_extension") {
    const extensionMetadata = context.fabric.entries.get(args.id) || context.extensions.find((entry) => entry.id === args.id);
    if (extensionMetadata?.kind === "skill") {
      const error = new Error("Workflow skills must be activated through skill_invoke.");
      error.code = "SKILL_INVOCATION_REQUIRED";
      error.retryable = false;
      error.doNotRetry = true;
      throw error;
    }
    const extension = context.agentCatalog?.owns?.(args.id)
      ? await context.agentCatalog.activate(args.id)
      : (context.fabric.entries.has(args.id)
        ? await context.fabric.activate(args.id)
        : await loadExtension(context.extensions, args.id));
    context.loadedExtensions.add(args.id);
    context.loadedExtensionBodies?.set?.(args.id, extension);
    return extension;
  }
  if (name === "continuity_search") return context.continuity.search(args.query, { maxResults: args.maxResults, includeContent: true });
  if (name === "memory_search") {
    const allowedScopes = allowedMemoryScopes(context);
    if (args.scope && !allowedScopes.includes(args.scope)) throw memoryRouteDenied(args.scope);
    const results = args.scope
      ? await context.memoryRepository.search(args.query, { scope: args.scope, maxResults: args.maxResults })
      : (await Promise.all(allowedScopes.map((scope) => context.memoryRepository.search(args.query, { scope, maxResults: args.maxResults })))).flat().slice(0, Math.max(1, Math.min(Number(args.maxResults) || 8, 30)));
    return results;
  }
  if (name === "memory_read") {
    const topic = await context.memoryRepository.read(args.id, args.scope);
    if (!allowedMemoryScopes(context).includes(topic.scope)) throw memoryRouteDenied(topic.scope);
    if (!context.routeDataScopes.includes(topic.scope === "personal" ? "personalMemory" : "teamMemory")) context.routeDataScopes.push(topic.scope === "personal" ? "personalMemory" : "teamMemory");
    return topic;
  }
  if (name === "memory_propose") return context.memoryProposals.propose(args, "create");
  if (name === "memory_update") return context.memoryProposals.propose(args, "update");
  if (name === "memory_forget") return context.memoryProposals.propose(args, "forget");
  if (name === "route_list") return context.routeSession.list({ purpose: args.purpose });
  if (name === "route_inspect") return context.routeSession.inspect(args.id);
  if (name === "route_select") {
    context.activeProvider = context.routeSession.select(args.id, { reason: args.reason || "model selection", requiredDataScopes: context.routeDataScopes });
    context.windowSteward.limits = context.routeSession.limits();
    return { selected: true, route: context.routeSession.inspect(args.id) };
  }
  if (name === "artifact_read") return context.artifactVault.read(args.id, args);
  if (name === "context_observation_list") return context.observationLedger.list(context.messages, { currentRound: context.currentRound, maxResults: args.maxResults });
  if (name === "context_release") return context.observationLedger.release(args.ids, context.messages, { currentRound: context.currentRound, reason: args.reason, initiator: "model" });
  if (["plan_list", "plan_read", "plan_create", "plan_update"].includes(name)) return context.planRepository.execute(name, args);
  if (name === "mcp_search_offerings") {
    const offerings = await context.mcp.searchOfferings(args.serverId, args.query);
    context.skillCatalog?.registerExternalPrompts?.(args.serverId, offerings.prompts, context.mcp);
    return offerings;
  }
  if (name === "mcp_read_resource") return context.mcp.readResource(args.serverId, args.uri);
  if (name === "mcp_get_prompt") return context.mcp.getPrompt(args.serverId, args.name, args.arguments);
  if (name === "work_create") {
    const item = await context.work.create(args);
    await context.hooks?.run("work-created", { item });
    return item;
  }
  if (name === "work_get") return context.work.get(args.id);
  if (name === "work_list") return context.work.list();
  if (name === "work_update") {
    if (args.status === "completed") {
      const decision = await context.hooks?.run("work-completing", { item: context.work.get(args.id), input: args });
      if (decision?.continue === false) {
        const error = new Error(decision.stopReason || "Lifecycle automation stopped work-item completion.");
        error.code = "WORK_COMPLETION_STOPPED";
        error.retryable = false;
        error.doNotRetry = true;
        throw error;
      }
    }
    const item = await context.work.update(args.id, args);
    await context.hooks?.run("work-updated", { item });
    if (item?.status === "completed") await context.hooks?.run("work-completed", { item });
    return item;
  }
  if (name === "worker_launch") return context.workers.launch(args);
  if (name === "worker_list") return context.workers.list();
  if (name === "worker_message") return context.workers.message(args.id, args.message, args.summary);
  if (name === "worker_wait") return context.workers.wait(args.id, args);
  if (name === "worker_stop") return context.workers.stop(args.id);
  if (name.startsWith("mcp__")) return context.capabilities.invoke(name, args);
  if (context.capabilities?.registration?.(name)?.executionOwner === "run-extension") return context.capabilities.invoke(name, args, context);
  if (context.capabilities?.registration?.(name)?.executionOwner === "persistent-extension") return context.extensionToolDispatcher.execute(context.capabilities.registration(name), args, context);
  const applicationResult = await executeApplicationTool(name, args, context);
  if (applicationResult !== undefined) return applicationResult;
  throw new Error(`Unknown or unavailable tool: ${name}`);
}

module.exports = { executeTool, parseArguments };

function allowedMemoryScopes(context) {
  const scopes = context.routeSession?.active?.route?.dataScopes || {};
  return [...(scopes.personalMemory === true ? ["personal"] : []), ...(scopes.teamMemory === true ? ["team"] : [])];
}

function memoryRouteDenied(scope) {
  const error = new Error(`The active provider route is not authorized to receive ${scope} memory.`);
  error.code = "ROUTE_DATA_SCOPE_DENIED";
  error.retryable = false;
  error.doNotRetry = true;
  return error;
}
