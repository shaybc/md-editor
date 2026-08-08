/** Observation thinning and structured context renewal for autonomous model calls. */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { estimateMessageTokens, estimateTokens, resolveContextLimits } = require("./token-budget");

const RECENT_TURN_GROUPS = 5;
const COLLAPSIBLE_RESULT_CHARACTERS = 4000;
const MAX_ACTIVE_FILES = 5;
const MAX_ACTIVE_FILE_CHARACTERS = 15000;
const MAX_ACTIVE_FILES_CHARACTERS = 150000;
const RENEWAL_FAILURE_LIMIT = 3;
const RENEWAL_COOLDOWN_MS = 5 * 60 * 1000;

class WindowSteward {
  constructor(request, provider, artifactVault, emit = () => {}) {
    this.request = request;
    this.provider = provider;
    this.artifactVault = artifactVault;
    this.emit = emit;
    this.reportedTokens = 0;
    this.activeFiles = [];
    this.consecutiveFailures = 0;
    this.nextRetryAt = 0;
    this.lastDigest = null;
    this.limits = resolveContextLimits(request);
  }

  /** Record provider-reported input usage for more accurate future budgeting. */
  recordUsage(usage = {}) {
    this.reportedTokens = Math.max(
      Number(usage.inputTokens) || 0,
      Number(usage.promptTokens) || 0,
      Number(usage.input_tokens) || 0,
      Number(usage.prompt_tokens) || 0
    );
  }

  /** Track one recently accessed workspace path for post-renewal re-anchoring. */
  recordFile(filePath) {
    const absolute = path.resolve(this.request.workspaceRoot || ".", String(filePath || ""));
    const root = path.resolve(this.request.workspaceRoot || ".");
    if (absolute !== root && !absolute.startsWith(root + path.sep)) return;
    this.activeFiles = [absolute, ...this.activeFiles.filter((candidate) => candidate !== absolute)].slice(0, MAX_ACTIVE_FILES);
  }

  /** Thin large historical observations and renew the window when its threshold is reached. */
  async prepare(messages, context, options = {}) {
    const beforeTokens = estimateContextTokens(messages, context, this.reportedTokens);
    const thinned = await this.thinObservations(messages);
    const afterThinningTokens = estimateContextTokens(messages, context);
    if (thinned.length) {
      this.emit({
        type: "context-thinned",
        artifacts: thinned,
        estimatedTokensBefore: beforeTokens,
        estimatedTokensAfter: afterThinningTokens
      });
    }
    const shouldRenew = options.force === true || this.exceedsLimit(messages, afterThinningTokens, context);
    if (!shouldRenew) return { renewed: false, thinned, beforeTokens, afterTokens: afterThinningTokens };
    const renewal = await this.renew(messages, context, { trigger: options.trigger || "threshold" });
    return { ...renewal, thinned, beforeTokens };
  }

  /** Replace older turns with a structured digest and freshly loaded authoritative anchors. */
  async renew(messages, context, options = {}) {
    const now = Date.now();
    if (this.consecutiveFailures >= RENEWAL_FAILURE_LIMIT && now < this.nextRetryAt) {
      const warning = {
        reason: "renewal-cooldown",
        retryAt: new Date(this.nextRetryAt).toISOString(),
        consecutiveFailures: this.consecutiveFailures
      };
      this.emit({ type: "recovery-warning", ...warning });
        return { renewed: false, warning, afterTokens: estimateContextTokens(messages, context) };
    }
    const beforeTokens = estimateContextTokens(messages, context, this.reportedTokens);
    const boundary = recentBoundary(messages, RECENT_TURN_GROUPS);
    if (boundary <= 1 && options.force !== true) return { renewed: false, afterTokens: beforeTokens };
    const older = sanitizeForDigest(messages.slice(1, boundary));
    try {
      await context.hooks?.run("before-compaction", { trigger: options.trigger || "threshold", estimatedTokens: beforeTokens });
      await context.continuity?.flush?.();
      const response = await this.provider.completeMessage([{
        role: "user",
        content: buildDigestPrompt(older, context)
      }], {
        temperature: 0.1,
        maxTokens: Math.min(12000, this.limits.maxOutputTokens || 12000),
        signal: this.request.signal
      });
      const digest = parseDigest(response?.content, context);
      const recent = messages.slice(boundary);
      const anchors = await context.buildRenewalAnchors(digest, await this.activeFileAnchors());
      messages.splice(0, messages.length, ...anchors, ...recent);
      this.lastDigest = digest;
      this.consecutiveFailures = 0;
      this.nextRetryAt = 0;
      this.reportedTokens = 0;
      const afterTokens = estimateContextTokens(messages, context);
      const result = {
        renewed: true,
        trigger: options.trigger || "threshold",
        estimatedTokensBefore: beforeTokens,
        estimatedTokensAfter: afterTokens,
        preservedTurns: countTurnGroups(recent),
        artifactCount: this.artifactVault.snapshot().length,
        digest
      };
      this.emit({ type: "compaction", ...result });
      await context.hooks?.run("after-compaction", { summary: result });
      return { ...result, afterTokens };
    } catch (error) {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= RENEWAL_FAILURE_LIMIT) this.nextRetryAt = Date.now() + RENEWAL_COOLDOWN_MS;
      const warning = {
        reason: "renewal-failed",
        error: error?.message || String(error),
        consecutiveFailures: this.consecutiveFailures,
        retryAt: this.nextRetryAt ? new Date(this.nextRetryAt).toISOString() : ""
      };
      this.emit({ type: "recovery-warning", ...warning });
      return { renewed: false, warning, afterTokens: estimateContextTokens(messages, context) };
    }
  }

  /** Return serializable renewal state for restart recovery. */
  snapshot() {
    return {
      limits: this.limits,
      reportedTokens: this.reportedTokens,
      activeFiles: this.activeFiles.slice(),
      consecutiveFailures: this.consecutiveFailures,
      nextRetryAt: this.nextRetryAt,
      lastDigest: this.lastDigest
    };
  }

  /** Restore safe, non-authority-bearing renewal state. */
  restore(snapshot = {}) {
    this.activeFiles = Array.isArray(snapshot.activeFiles) ? snapshot.activeFiles.slice(0, MAX_ACTIVE_FILES) : [];
    this.consecutiveFailures = Math.max(0, Number(snapshot.consecutiveFailures) || 0);
    this.nextRetryAt = Math.max(0, Number(snapshot.nextRetryAt) || 0);
    this.lastDigest = snapshot.lastDigest || null;
  }

  exceedsLimit(messages, estimatedTokens, context = {}) {
    if (this.limits.known) return estimatedTokens >= this.limits.renewalThreshold;
    const characters = messages.reduce((total, message) => total + String(message?.content || "").length + JSON.stringify(message?.tool_calls || []).length, 0)
      + JSON.stringify(context.currentToolDefinitions || []).length;
    return characters > this.limits.characterLimit;
  }

  async thinObservations(messages) {
    const boundary = recentBoundary(messages, RECENT_TURN_GROUPS);
    const toolNames = mapToolNames(messages);
    const latestErrors = new Map();
    for (let index = 0; index < boundary; index++) {
      const content = String(messages[index]?.content || "");
      if (messages[index]?.role === "tool" && isActiveError(content)) latestErrors.set(normalizeError(content), index);
    }
    const stored = [];
    for (let index = 0; index < boundary; index++) {
      const message = messages[index];
      if (message?.role !== "tool") continue;
      const content = String(message.content || "");
      const isLatestError = isActiveError(content) && latestErrors.get(normalizeError(content)) === index;
      if (content.length <= COLLAPSIBLE_RESULT_CHARACTERS || isLatestError || /^\[Observation stored as artifact-/.test(content)) continue;
      const entry = await this.artifactVault.store(content, {
        callId: message.tool_call_id,
        tool: toolNames.get(message.tool_call_id) || "tool"
      });
      message.content = this.artifactVault.reference(entry);
      stored.push(entry);
    }
    return stored;
  }

  async activeFileAnchors() {
    const anchors = [];
    let totalCharacters = 0;
    for (const filePath of this.activeFiles) {
      if (totalCharacters >= MAX_ACTIVE_FILES_CHARACTERS) break;
      try {
        const content = await fs.readFile(filePath, "utf8");
        const excerpt = content.slice(0, Math.min(MAX_ACTIVE_FILE_CHARACTERS, MAX_ACTIVE_FILES_CHARACTERS - totalCharacters));
        totalCharacters += excerpt.length;
        anchors.push({ path: filePath, excerpt, truncated: excerpt.length < content.length });
      } catch (_error) {
        anchors.push({ path: filePath, unavailable: true });
      }
    }
    return anchors;
  }
}

function recentBoundary(messages, turnCount) {
  let seen = 0;
  for (let index = messages.length - 1; index >= 1; index--) {
    if (messages[index]?.role === "assistant") {
      seen += 1;
      if (seen >= turnCount) return preserveToolPairBoundary(messages, index);
    }
  }
  return Math.min(1, messages.length);
}

function preserveToolPairBoundary(messages, boundary) {
  const resultIds = new Set(messages.slice(boundary).filter((message) => message.role === "tool").map((message) => message.tool_call_id));
  if (!resultIds.size) return boundary;
  for (let index = boundary - 1; index >= 1; index--) {
    const calls = messages[index]?.tool_calls || [];
    if (calls.some((call) => resultIds.has(call.id))) boundary = index;
  }
  return boundary;
}

function mapToolNames(messages) {
  const names = new Map();
  for (const message of messages) for (const call of message?.tool_calls || []) names.set(call.id, call.function?.name || "tool");
  return names;
}

function isActiveError(content) { return /\b(error|failed|failure|denied|rejected|cancelled|unknown outcome)\b/i.test(content); }
function countTurnGroups(messages) { return messages.filter((message) => message.role === "assistant").length; }
function normalizeError(content) { return String(content).replace(/\d+/g, "#").slice(0, 1000); }
function sanitizeForDigest(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: String(message.content || "").replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, "[embedded media removed]").slice(0, 16000),
    tool_calls: message.tool_calls
  })).slice(-120);
}

function buildDigestPrompt(messages, context) {
  return [
    "Create a structured execution digest from the historical transcript. Return one JSON object and no surrounding prose.",
    "Do not invent completion, verification, file changes, or tool outcomes. Preserve user corrections and uncertainty exactly.",
    "Required keys: userObjective, constraints, decisions, rejectedApproaches, filesAndArtifacts, completedWork, verifiedResults, currentState, problemsAndCorrections, activeWork, workers, remainingActions, unresolvedQuestions, keyResults.",
    `Current work ledger: ${JSON.stringify(context.work?.snapshot?.() || [])}`,
    `Current workers: ${JSON.stringify(context.workers?.snapshot?.() || [])}`,
    `Historical transcript: ${JSON.stringify(messages)}`
  ].join("\n\n");
}

function parseDigest(content, context) {
  const text = String(content || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch (_error) { /* Preserve unstructured output as uncertain current state. */ }
  return {
    userObjective: String(context.request.prompt || ""),
    currentState: text,
    activeWork: context.work?.snapshot?.() || [],
    workers: context.workers?.snapshot?.() || [],
    remainingActions: [],
    unresolvedQuestions: []
  };
}

function isContextOverflowError(error) {
  const message = `${error?.code || ""} ${error?.message || error || ""}`;
  return /prompt.?too.?long|context.{0,20}(length|window|limit|exceed)|maximum context|too many tokens|\b413\b/i.test(message);
}

function estimateContextTokens(messages, context, reportedTokens = 0) {
  return Math.max(
    estimateMessageTokens(messages, reportedTokens),
    estimateMessageTokens(messages) + estimateTokens(context?.currentToolDefinitions || [])
  );
}

module.exports = {
  COLLAPSIBLE_RESULT_CHARACTERS,
  RECENT_TURN_GROUPS,
  RENEWAL_COOLDOWN_MS,
  RENEWAL_FAILURE_LIMIT,
  WindowSteward,
  estimateContextTokens,
  isContextOverflowError,
  recentBoundary
};
