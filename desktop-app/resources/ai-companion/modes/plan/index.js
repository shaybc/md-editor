/**
 * Plan mode for read-only workspace research and reviewable implementation plans.
 */

"use strict";

const runtime = require("../../core/agent-runtime");
const { DEFAULT_AI_COMPANION_PROMPTS, loadAiCompanionPrompts } = require("../../config/prompts");
const { extractProposedPlanBody } = require("../../core/plan-finalization");
const planRepositoryTools = require("../../tools/plan-repository-tools");
const { getAgentToolDefinitions, executeAgentTool } = require("../../core/agent-tool-loop");
const { resolveModePolicy } = require("../../core/companion-mode-policy");
const { buildPlanContext } = require("../../core/plan-context-policy");
const { createPlanControlToolDefinitions, derivePlanAllowedToolNames } = require("../../core/plan-decision-contract");
const { runPlanStatefulController } = require("../../core/plan-stateful-controller");
const planCapabilityMap = require("../../core/plan-capability-map");

const PLAN_MODE_SYSTEM_PROMPT = DEFAULT_AI_COMPANION_PROMPTS.planSystem;
const PLAN_MODE_FINAL_ANSWER_PROMPT = DEFAULT_AI_COMPANION_PROMPTS.planFinalAnswer;

function extractProposedPlanContent(content) {
  return extractProposedPlanBody(content);
}

function derivePlanTitleFromPrompt(prompt) {
  const cleaned = String(prompt || "")
    .replace(/\s+/g, " ")
    .replace(/^(?:please\s+)?(?:plan|create|add|build|implement|fix|update|change)\s+/i, "")
    .trim();
  return cleaned ? cleaned.slice(0, 72).trim() : "Untitled plan";
}

function extractPlanTitle(content, fallback = "Untitled plan") {
  const planText = extractProposedPlanContent(content);
  const heading = planText.split(/\r?\n/).map((line) => line.match(/^#\s+(.+)$/)?.[1]?.trim()).find(Boolean);
  return (heading || fallback).replace(/^Plan:\s*/i, "").trim() || fallback;
}

function extractPlanMilestones(content) {
  const planText = extractProposedPlanContent(content);
  const milestones = [];
  const seen = new Set();
  for (const line of planText.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*]|\d+[.)])?\s*(?:\[[ xX]\]\s*)?(M\d+)\s*[:.)-]\s*(.+?)\s*$/i);
    if (!match) continue;
    const id = match[1].toUpperCase();
    if (seen.has(id)) continue;
    seen.add(id);
    milestones.push({ id, title: match[2].trim(), status: "pending" });
  }
  return milestones;
}
/**
 * Map a provider tool call to a typed Plan decision the controller understands.
 */
function mapToolCallToPlanDecision(toolCall) {
  const name = toolCall?.function?.name || toolCall?.name || "";
  let args = {};
  try { args = JSON.parse(toolCall?.function?.arguments || toolCall?.arguments || "{}"); } catch (_error) { args = {}; }
  if (name === "plan_propose_completion") return { type: "propose_plan_completion", artifact: args.artifact };
  if (name === "plan_request_user_input") return { type: "request_user_input", question: args.question };
  if (name === "plan_revise_strategy") return { type: "revise_plan_strategy", abandonedApproach: args.abandonedApproach, revisedApproach: args.revisedApproach };
  if (name === "plan_report_blocked") return { type: "report_blocked", blockerType: args.blockerType, description: args.description };
  return { type: "tool_call", toolName: name, args };
}

/**
 * Run Plan mode through the shared stateful controller under a read-only policy.
 * Fails closed before the first provider request; never falls back to the legacy
 * path once started.
 */
async function runPlanStatefulMode(request, emit, settings, prompt, prompts, provider) {
  const policy = resolveModePolicy("plan", settings);
  if (!policy.controllerEligible || policy.allowsMutation) {
    throw new Error("Plan stateful controller is not correctly configured (expected read-only controller policy).");
  }
  const workspaceRoot = request.workspaceRoot;
  const gitReadOptions = { planGitReadToolsEnabled: settings.planGitReadToolsEnabled === true };
  const planTools = getAgentToolDefinitions("plan", gitReadOptions);
  const controlTools = createPlanControlToolDefinitions();
  const providerTools = [...planTools, ...controlTools];
  const allowedToolNames = derivePlanAllowedToolNames(gitReadOptions);

  const deps = {
    allowedToolNames,
    emit,
    async requestDecision(projection) {
      const context = buildPlanContext({
        planProjection: projection,
        systemPrompt: prompts.planSystem,
        intentContract: request.savedIntentContract || null,
        activeFile: request.activeFile,
        editorReadContext: request.editorReadContext,
        attachments: request.attachments,
        requestId: request.requestId
      });
      const message = await provider.completeMessage(context.messages, {
        temperature: 0.2,
        signal: request.signal,
        tools: providerTools,
        toolChoice: "required"
      });
      const toolCall = Array.isArray(message?.toolCalls) ? message.toolCalls[0] : null;
      if (!toolCall) return { type: "report_blocked", blockerType: "external_failure", description: "No decision returned." };
      return mapToolCallToPlanDecision(toolCall);
    },
    async executeReadOnlyTool(toolName, args) {
      const toolCall = { id: `plan-${toolName}-${Date.now()}`, function: { name: toolName, arguments: JSON.stringify(args || {}) } };
      const result = await executeAgentTool(workspaceRoot, settings, "plan", toolCall, { signal: request.signal });
      return {
        tool: toolName,
        args,
        result,
        evidenceEntry: {
          summary: typeof result === "string" ? result : (result?.summary || `${toolName} result`),
          files: Array.isArray(result?.files) ? result.files : [],
          id: toolCall.id
        }
      };
    },
    requestClarification: typeof request.requestClarification === "function"
      ? async (question) => request.requestClarification({ question })
      : undefined,
    async savePlan(body, projection) {
      const saved = await planRepositoryTools.planCreate(workspaceRoot, {
        title: extractPlanTitle(body, derivePlanTitleFromPrompt(prompt)),
        body,
        status: "planned",
        workspaceRoot,
        sourceChatId: request.sourceChatId,
        sourceTaskId: request.sourceTaskId,
        milestones: extractPlanMilestones(body)
      }, { signal: request.signal, profileRoot: request.profileRoot });
      return saved?.plan?.id || saved?.plan?.path || "plan-saved";
    }
  };

  const result = await runPlanStatefulController({
    prompt,
    intentContract: request.savedIntentContract || null,
    runId: String(request.runId || request.taskId || request.requestId || ""),
    activeFile: request.activeFile,
    clarifications: []
  }, deps);

  emit({ type: "content", content: result.content });
  return { content: result.content, plan: result.projection?.plan?.savedPlanRef ? { id: result.projection.plan.savedPlanRef } : null };
}

async function runPlanMode(request, emit) {
  const settings = runtime.normalizeAiCompanionSettings(request.settings);
  if (!settings.enabled) throw new Error("AI Companion plan mode is disabled.");
  const prompt = String(request.prompt || "");
  runtime.throwIfAborted(request.signal);
  // M8: opt-in, default-off stateful Plan controller. When disabled, the exact
  // legacy path below runs unchanged.
  if (settings.planStatefulControllerEnabled === true) {
    const provider = runtime.createProvider(settings);
    const prompts = await loadAiCompanionPrompts({ profileRoot: request.profileRoot });
    return runPlanStatefulMode(request, emit, settings, prompt, prompts, provider);
  }
  const provider = runtime.createProvider(settings);
  const prompts = await loadAiCompanionPrompts({ profileRoot: request.profileRoot });

  // Fix 2 (flag-gated) — capability gate. If the task needs data no read-only
  // Plan tool can produce, stop or ask the user instead of inventing it. The
  // available toolset reflects the Fix 3 flag, so the two fixes compose.
  let effectivePrompt = prompt;
  const planToolNames = getAgentToolDefinitions("plan", { planGitReadToolsEnabled: settings.planGitReadToolsEnabled === true })
    .map((definition) => definition?.function?.name).filter(Boolean);
  const capabilityGate = settings.planCapabilityGateEnabled === true
    ? planCapabilityMap.evaluatePlanCapabilityGate({
        prompt,
        availableToolNames: planToolNames,
        canAsk: typeof request.requestClarification === "function"
      })
    : { action: "proceed", unreachable: [], question: null, reason: "" };
  if (capabilityGate.action === "block") {
    const message = `# Cannot create this plan\n\n${capabilityGate.reason}\n\nWhat I would need: ${capabilityGate.unreachable.map((entry) => entry.description).join("; ")}. No plan was saved.`;
    emit({ type: "content", content: message });
    return { content: message, plan: null, blocked: true, unreachable: capabilityGate.unreachable };
  }
  if (capabilityGate.action === "ask") {
    const answer = await request.requestClarification(capabilityGate.question);
    const decision = planCapabilityMap.interpretCapabilityAnswer(typeof answer === "string" ? answer : (answer && answer.answer));
    if (!decision.proceed) {
      const message = `# Plan cancelled\n\nI stopped because the required data (${capabilityGate.unreachable.map((entry) => entry.description).join("; ")}) is not available in Plan mode and you chose not to supply it. No plan was saved.`;
      emit({ type: "content", content: message });
      return { content: message, plan: null, blocked: true };
    }
    effectivePrompt = decision.fromFilesOnly
      ? `${prompt}\n\n[User direction: the git/uncommitted-change data cannot be read directly. Plan only from the working-tree files you can read, and explicitly record that git state was not inspected as a blocking assumption. Do not invent commit or diff details.]`
      : `${prompt}\n\n[User-supplied data to use as the source of truth (Plan mode could not read it directly):\n${decision.suppliedData}\n]`;
  }

  // Fix 1 — capture the completion verdict so the plan is saved only when the
  // run is actually successful. The verdict is emitted as a completion-assessment
  // event; wrap emit to observe it without changing the loop's return contract.
  let completionStatus = null;
  const captureEmit = (event) => {
    if (event && event.type === "completion-assessment") {
      completionStatus = event.assessment?.overallStatus || completionStatus;
    }
    return emit(event);
  };

  const response = await runtime.runAgentToolLoop(provider, settings, request.workspaceRoot, effectivePrompt, "plan", captureEmit, runtime, {
    signal: request.signal,
    activeFile: request.activeFile,
    attachments: request.attachments,
    conversationHistory: request.conversationHistory,
    resumeIntentContext: request.resumeIntentContext,
    requestId: request.requestId,
    chatId: request.chatId,
    turnIndex: request.turnIndex,
    executionKind: request.executionKind,
    executionGeneration: request.executionGeneration,
    savedIntentContract: request.savedIntentContract,
    savedIntentContractMeta: request.savedIntentContractMeta,
    priorIntentContract: request.priorIntentContract,
    priorIntentContractMeta: request.priorIntentContractMeta,
    requestApproval: request.requestApproval,
    requestClarification: request.requestClarification,
    requestChatTitle: request.requestChatTitle === true,
    systemPrompt: prompts.planSystem,
    finalAnswerPrompt: prompts.planFinalAnswer,
    prompts
  });

  // Fix 1 (flag-gated) — a plan is a claim about the workspace: only persist it
  // when the run is verified successful. When a completion assessment ran and did
  // not reach "complete", do not save. When no assessment ran (intent contracts
  // off), legacy behavior is preserved (no verdict to gate on). When the flag is
  // off, the legacy always-save behavior applies.
  const succeeded = settings.planRequireSuccessToSaveEnabled !== true
    || completionStatus === null
    || completionStatus === "complete";
  emit({ type: "content", content: response });
  if (!succeeded) {
    return { content: response, plan: null, completionStatus: completionStatus || "incomplete" };
  }

  const planContent = extractProposedPlanContent(response);
  const savedPlan = await planRepositoryTools.planCreate(request.workspaceRoot, {
    title: extractPlanTitle(planContent, derivePlanTitleFromPrompt(prompt)),
    body: planContent,
    status: "planned",
    workspaceRoot: request.workspaceRoot,
    sourceChatId: request.sourceChatId,
    sourceTaskId: request.sourceTaskId,
    milestones: extractPlanMilestones(planContent)
  }, { signal: request.signal, profileRoot: request.profileRoot });
  return { content: response, plan: savedPlan.plan, completionStatus: completionStatus || "complete" };
}

module.exports = {
  PLAN_MODE_FINAL_ANSWER_PROMPT,
  PLAN_MODE_SYSTEM_PROMPT,
  runPlanMode
};
