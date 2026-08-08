/** Git-summary mode for business-level change notes and a commit suggestion. */

"use strict";

const runtime = require("../../orchestration/shared/runtime-support");
const { loadAiCompanionPrompts } = require("../../config/prompts");
const { buildGitSummaryUserMessage } = require("./prompt");
const { parseGitSummaryResponse } = require("./response-parser");
const { runReadOnlySummaryLoop } = require("./read-only-summary-loop");

const GIT_SUMMARY_MAX_RESPONSE_TOKENS = 1800;

async function runGitSummaryMode(request, emit) {
  const settings = runtime.normalizeAiCompanionSettings(request.settings);
  if (!settings.enabled) throw new Error("AI Companion is disabled.");
  if (settings.gitSummaryEnabled === false) throw new Error("AI Companion git summaries are disabled.");
  if (!request.digest || typeof request.digest !== "object") throw new Error("Git changes digest is required.");

  const provider = runtime.createProvider(settings);
  const prompts = await loadAiCompanionPrompts({ profileRoot: request.profileRoot });
  const content = await runReadOnlySummaryLoop(
    provider,
    request,
    prompts.gitSummarySystem + "\n\n" + prompts.gitSummaryFinalAnswer,
    buildGitSummaryUserMessage(request.digest),
    emit,
    GIT_SUMMARY_MAX_RESPONSE_TOKENS
  );
  const summary = parseGitSummaryResponse(content);
  emit({ type: "content", content: String(content || "") });
  return { content: String(content || ""), summary };
}

module.exports = { runGitSummaryMode };
