/**
 * Git-summary mode: business-level change summary and commit message
 * suggestion for the Git panel.
 *
 * The request carries a pre-collected changes digest (diffs, unpushed
 * commits, untracked files). The model answers from the digest and may use
 * the read-only workspace tools (list/glob/grep/read) when a hunk is
 * ambiguous; write and command tools are never offered in this mode.
 */

"use strict";

const runtime = require("../../core/agent-runtime");
const { loadAiCompanionPrompts } = require("../../config/prompts");
const { GIT_SUMMARY_SYSTEM_PROMPT, buildGitSummaryUserMessage } = require("./prompt");
const { parseGitSummaryResponse } = require("./response-parser");

/** Token budget for responses: the JSON payload carries a full PR-notes summary. */
const GIT_SUMMARY_MAX_RESPONSE_TOKENS = 1800;

/** Longest wait honored for a provider-suggested rate-limit retry, in milliseconds. */
const MAX_RATE_LIMIT_RETRY_DELAY_MS = 20000;

function isRateLimitError(error) {
  return /rate limit|too many requests|\b429\b/i.test(error?.message || "");
}

/**
 * Extract the provider-suggested retry delay ("try again in 7.302s") from a
 * rate-limit error message. Returns milliseconds, with a small safety pad.
 */
function getRateLimitRetryDelayMs(error) {
  const match = String(error?.message || "").match(/try again in\s+(\d+(?:\.\d+)?)\s*s/i);
  const seconds = match ? Number(match[1]) : 5;
  return Math.min(Math.ceil((seconds + 0.5) * 1000), MAX_RATE_LIMIT_RETRY_DELAY_MS);
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener?.("abort", () => {
      clearTimeout(timer);
      reject(new Error("AI Companion request cancelled."));
    }, { once: true });
  });
}

/**
 * Run the git-summary mode.
 *
 * @param request - Bridge request: { workspaceRoot, settings, digest, signal }.
 * @param emit - Event emitter for start/tool/content events shown in the UI.
 * @returns { content, summary } where summary is the parsed
 *          { commitSubject, commitBody, summaryMarkdown, parsed } result.
 */
async function runGitSummaryMode(request, emit) {
  const settings = runtime.normalizeAiCompanionSettings(request.settings);
  if (!settings.enabled) throw new Error("AI Companion is disabled.");
  if (settings.gitSummaryEnabled === false) throw new Error("AI Companion git summaries are disabled.");
  if (!request.digest || typeof request.digest !== "object") throw new Error("Git changes digest is required.");

  const provider = runtime.createProvider(settings);
  const prompts = await loadAiCompanionPrompts({ profileRoot: request.profileRoot });
  const prompt = buildGitSummaryUserMessage(request.digest);
  const runLoop = () => runtime.runAgentToolLoop(provider, settings, request.workspaceRoot, prompt, "gitSummary", emit, runtime, {
    signal: request.signal,
    systemPrompt: prompts.gitSummarySystem,
    maxResponseTokens: GIT_SUMMARY_MAX_RESPONSE_TOKENS,
    finalAnswerPrompt: prompts.gitSummaryFinalAnswer,
    prompts
  });
  let content;
  try {
    content = await runLoop();
  } catch (error) {
    // Rate limits are transient and usually carry a suggested wait; retry once
    // after honoring it instead of surfacing a raw provider error.
    if (!isRateLimitError(error)) throw error;
    const waitMs = getRateLimitRetryDelayMs(error);
    emit({ type: "tool", tool: "rate-limit", input: "", summary: `waiting ${Math.round(waitMs / 1000)}s to retry` });
    await delay(waitMs, request.signal);
    runtime.throwIfAborted(request.signal);
    content = await runLoop();
  }
  const summary = parseGitSummaryResponse(content);
  emit({ type: "content", content: String(content || "") });
  return { content: String(content || ""), summary };
}

module.exports = {
  runGitSummaryMode
};
