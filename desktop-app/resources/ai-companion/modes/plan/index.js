/**
 * Plan mode for read-only workspace research and reviewable implementation plans.
 */

"use strict";

const runtime = require("../../core/agent-runtime");
const { DEFAULT_AI_COMPANION_PROMPTS, loadAiCompanionPrompts } = require("../../config/prompts");
const { extractProposedPlanBody } = require("../../core/plan-finalization");
const planRepositoryTools = require("../../tools/plan-repository-tools");

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
async function runPlanMode(request, emit) {
  const settings = runtime.normalizeAiCompanionSettings(request.settings);
  if (!settings.enabled) throw new Error("AI Companion plan mode is disabled.");
  const prompt = String(request.prompt || "");
  runtime.throwIfAborted(request.signal);
  const provider = runtime.createProvider(settings);
  const prompts = await loadAiCompanionPrompts({ profileRoot: request.profileRoot });
  const response = await runtime.runAgentToolLoop(provider, settings, request.workspaceRoot, prompt, "plan", emit, runtime, {
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
  emit({ type: "content", content: response });
  return { content: response, plan: savedPlan.plan };
}

module.exports = {
  PLAN_MODE_FINAL_ANSWER_PROMPT,
  PLAN_MODE_SYSTEM_PROMPT,
  runPlanMode
};
