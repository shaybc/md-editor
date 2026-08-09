/** Validation and normalization for lifecycle automation definitions. */

"use strict";

const { lifecycleEventPolicy, normalizeLifecycleEvent } = require("./lifecycle-event-catalog");

const ACTION_TYPES = new Set(["context", "command", "model-check", "delegated-run", "web-request", "application-callback", "notify-user"]);
const ACTION_ALIASES = Object.freeze({ prompt: "model-check", agent: "delegated-run", http: "web-request", callback: "application-callback" });

/** Normalize one hook and reject unsupported or unsafe structure. */
function normalizeHookDefinition(entry, source = {}) {
  const value = entry?.metadata || entry || {};
  const id = String(value.id || entry?.id || "").trim();
  const event = normalizeLifecycleEvent(value.event);
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(id)) throw new Error("Hook definitions require a valid id.");
  if (!lifecycleEventPolicy(event)) throw new Error(`Hook '${id}' uses an unsupported event: ${event || "missing"}.`);
  const rawActions = Array.isArray(value.actions) ? value.actions : [value.action].filter(Boolean);
  if (!rawActions.length) throw new Error(`Hook '${id}' requires at least one action.`);
  const sourceId = String(source.id || entry?.id || id);
  const definitionId = source.namespace
    ? `${source.namespace}:${id}`
    : (source.id && sourceId !== id ? `${sourceId}:${id}` : id);
  return {
    id: definitionId,
    localId: id,
    event,
    enabled: value.enabled !== false,
    matcher: normalizeMatcher(value.matcher),
    actions: rawActions.map((action, index) => normalizeAction(action, `${id}#${index + 1}`)),
    timeoutMs: boundedInteger(value.timeoutMs ?? seconds(value.timeout), 100, 300000, 30000),
    cooldownMs: boundedInteger(value.cooldownMs, 0, 3600000, 0),
    dedupWindowMs: boundedInteger(value.dedupWindowMs, 0, 3600000, 1000),
    maxDepth: boundedInteger(value.maxDepth, 1, 10, 2),
    once: value.once === true,
    background: value.background === true || value.async === true,
    wakeOnFailure: value.wakeOnFailure === true || value.asyncRewake === true,
    onError: ["continue", "block", "stop-run"].includes(value.onError) ? value.onError : lifecycleEventPolicy(event).onError,
    priority: boundedInteger(value.priority, -1000, 1000, 0),
    source: { scope: String(source.scope || entry?.scope || "runtime"), id: sourceId, trusted: source.trusted === true, fingerprint: String(source.fingerprint || "") }
  };
}

function normalizeAction(action, label, depth = 0) {
  if (depth > 3) throw new Error(`Hook action '${label}' exceeds the branch depth limit.`);
  const source = action && typeof action === "object" ? action : {};
  const type = ACTION_ALIASES[source.type] || String(source.type || "");
  if (!ACTION_TYPES.has(type)) throw new Error(`Hook action '${label}' has unsupported type: ${type || "missing"}.`);
  const common = {
    when: normalizeMatcher(source.when),
    onSuccess: normalizeBranch(source.onSuccess, `${label}.onSuccess`, depth),
    onFailure: normalizeBranch(source.onFailure, `${label}.onFailure`, depth)
  };
  if (type === "context") return { type, content: String(source.content || "").slice(0, 12000), ...common };
  if (type === "notify-user") return { type, level: ["info", "warning", "error"].includes(source.level) ? source.level : "info", message: String(source.message || source.content || "").slice(0, 4000), ...common };
  if (type === "command") {
    const executable = String(source.executable || source.command || "").trim();
    if (!executable) throw new Error(`Hook command '${label}' requires an executable.`);
    return { type, executable, args: Array.isArray(source.args) ? source.args.map(String) : [], cwd: String(source.cwd || ""), environment: normalizeStringMap(source.environment), approvalReason: String(source.approvalReason || "Run configured lifecycle command."), ...common };
  }
  if (type === "model-check") {
    const prompt = String(source.prompt || "").trim();
    if (!prompt) throw new Error(`Hook model action '${label}' requires a prompt.`);
    return { type, prompt, model: String(source.model || ""), routeId: String(source.routeId || ""), maxTokens: boundedInteger(source.maxTokens, 64, 8000, 1200), ...common };
  }
  if (type === "delegated-run") {
    const prompt = String(source.prompt || "").trim();
    if (!prompt) throw new Error(`Hook delegated action '${label}' requires a prompt.`);
    return { type, prompt, agentId: String(source.agentId || ""), model: String(source.model || ""), routeId: String(source.routeId || ""), allowedTools: Array.isArray(source.allowedTools) ? source.allowedTools.map(String) : [], background: source.background === true, ...common };
  }
  if (type === "web-request") {
    const url = String(source.url || "").trim();
    if (!url) throw new Error(`Hook web action '${label}' requires a URL.`);
    return { type, url, headers: normalizeStringMap(source.headers), allowedEnvironment: Array.isArray(source.allowedEnvironment || source.allowedEnvVars) ? (source.allowedEnvironment || source.allowedEnvVars).map(String) : [], allowHttp: source.allowHttp === true, ...common };
  }
  const callbackId = String(source.callbackId || source.name || "").trim();
  if (!callbackId) throw new Error(`Hook callback action '${label}' requires a callback id.`);
  return { type, callbackId, ...common };
}

function normalizeBranch(value, label, depth) {
  if (value == null) return [];
  const actions = Array.isArray(value) ? value : [value];
  return actions.map((action, index) => normalizeAction(action, `${label}#${index + 1}`, depth + 1));
}

function normalizeMatcher(value) {
  if (typeof value === "string") return { tool: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { tool: value.tool, mode: value.mode, status: value.status, error: value.error, path: value.path, fields: value.fields && typeof value.fields === "object" ? value.fields : {} };
}

function normalizeStringMap(value) { return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [String(key), String(item)])) : {}; }
function seconds(value) { return value == null ? undefined : Number(value) * 1000; }
function boundedInteger(value, minimum, maximum, fallback) { const number = Math.floor(Number(value)); return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback; }

module.exports = { ACTION_TYPES, normalizeAction, normalizeHookDefinition };
