/** Executes lifecycle actions through existing provider, approval, worker, and security boundaries. */

"use strict";

const dns = require("node:dns/promises");
const net = require("node:net");
const path = require("node:path");
const { createProvider } = require("../../shared/provider-factory");
const { StructuredExecutionBroker } = require("../../../security/structured-execution-broker");
const { authorizeTool } = require("../approval-gateway");
const { combineHookDecisions } = require("./hook-decision-aggregator");
const { matchesLifecycleHook } = require("./hook-matcher");

class LifecycleActionRegistry {
  constructor(request, emit = () => {}) { this.request = request; this.emit = emit; this.context = null; this.callbacks = new Map(); }

  /** Attach run services after autonomous composition is complete. */
  setContext(context) {
    this.context = context;
    for (const [id, callback] of Object.entries(context?.services?.hookCallbacks || {})) this.registerCallback(id, callback);
  }

  /** Register one trusted in-process callback. */
  registerCallback(id, callback) { if (typeof callback !== "function") throw new Error("Lifecycle callbacks must be functions."); this.callbacks.set(String(id), callback); }

  /** Execute one normalized lifecycle action. */
  async execute(action, event, payload, hook, execution = {}) {
    if (!matchesLifecycleHook(action.when, { ...payload, previous: payload.previousResults?.at?.(-1) })) return { skipped: true };
    try {
      const result = await this.executeCore(action, event, payload, hook, execution);
      const followUps = await this.executeBranch(action.onSuccess, event, { ...payload, previousResult: result }, hook, execution);
      return combineHookDecisions([result, ...followUps]);
    } catch (error) {
      if (execution.signal?.aborted) throw error;
      if (!action.onFailure?.length) throw error;
      const followUps = await this.executeBranch(action.onFailure, event, { ...payload, error: error?.message || String(error) }, hook, execution);
      return combineHookDecisions(followUps);
    }
  }

  async executeCore(action, event, payload, hook, execution) {
    if (action.type === "context") return { additionalContext: interpolate(action.content, event, payload) };
    if (action.type === "notify-user") return { notification: { level: action.level, message: interpolate(action.message, event, payload) } };
    if (action.type === "command") return this.executeCommand(action, event, payload, hook, execution.signal);
    if (action.type === "model-check") return this.executeModel(action, event, payload, hook, execution.signal);
    if (action.type === "delegated-run") return this.executeWorker(action, event, payload, hook, execution.signal);
    if (action.type === "web-request") return this.executeWebRequest(action, event, payload, hook, execution.signal);
    if (action.type === "application-callback") return this.executeCallback(action, event, payload, hook, execution.signal);
    throw new Error(`Unsupported lifecycle action: ${action.type}`);
  }

  async executeBranch(actions, event, payload, hook, execution) {
    const results = [];
    for (const action of actions || []) results.push(await this.execute(action, event, { ...payload, previousResults: results }, hook, execution));
    return results;
  }

  async authorize(hook, action, details = {}) {
    const tool = {
      command: "lifecycle_hook_command",
      "web-request": "lifecycle_hook_http",
      "delegated-run": "lifecycle_hook_worker",
      "model-check": "lifecycle_hook_model",
      "application-callback": "lifecycle_hook_callback"
    }[action.type] || "extension_hook_run";
    this.emit({ type: "hook-waiting-approval", hookId: hook.id, event: details.event, actionType: action.type, actionIndex: action.actionIndex });
    const approval = await authorizeTool(this.request, tool, {
      hookId: `${hook.id}#${action.actionIndex ?? 0}:${String(hook.source.fingerprint || "current").slice(0, 16)}`, actionType: action.type,
      approvalReason: action.approvalReason || `Run configured ${action.type} lifecycle action.`,
      ...details
    }, this.context?.taskGrants || [], { ...(this.request.authorizationControls || {}), skipLifecycleHooks: true });
    if (!approval.approved) throw Object.assign(new Error(`Execution of lifecycle hook '${hook.id}' was denied.`), { code: "LIFECYCLE_ACTION_DENIED", doNotRetry: true });
    return approval;
  }

  async executeCommand(action, event, payload, hook, signal) {
    await this.authorize(hook, action, { executable: action.executable, event });
    const broker = new StructuredExecutionBroker();
    const workspaceRoot = this.request.workspaceRoot;
    const cwd = path.resolve(workspaceRoot, action.cwd || ".");
    if (!inside(workspaceRoot, cwd)) throw new Error("Lifecycle command working directory must remain inside the workspace.");
    const result = await broker.execute({ workspaceRoot, cwd, executable: action.executable, args: action.args.map((value) => interpolate(value, event, payload)), environment: action.environment }, this.request.securityContext?.policy, { signal });
    await this.audit(hook, action, result.success ? "executed-success" : "executed-failure");
    if (!result.success) throw new Error(result.stderr || `Lifecycle command exited with code ${result.exitCode}.`);
    return parseActionOutput(result.stdout);
  }

  async executeModel(action, event, payload, hook, signal) {
    await this.authorize(hook, action, { event });
    const access = this.context?.routeSession?.accessForPurpose?.("quick", { routeId: action.routeId, requiredDataScopes: ["workspace"], reason: "lifecycle model action" });
    const provider = action.model
      ? createProvider({ ...this.request.settings, model: action.model })
      : (access?.provider || this.context?.activeProvider);
    if (!provider) throw new Error("No provider is available for the lifecycle model action.");
    const response = await provider.completeMessage([{ role: "user", content: interpolate(action.prompt, event, payload) }], { temperature: 0, maxTokens: action.maxTokens, signal });
    return parseActionOutput(response?.content);
  }

  async executeWorker(action, event, payload, hook, signal) {
    await this.authorize(hook, action, { event });
    if (!this.context?.workers) throw new Error("Delegated lifecycle actions are unavailable in this execution boundary.");
    const worker = await this.context.workers.launch({ description: `Lifecycle action for ${event}`, prompt: interpolate(action.prompt, event, payload), agentId: action.agentId || undefined, model: action.model || undefined, routeId: action.routeId || undefined, allowedTools: action.allowedTools, background: true });
    if (action.background) return { worker };
    const stop = () => this.context.workers.stop(worker.id).catch(() => {});
    signal?.addEventListener?.("abort", stop, { once: true });
    try {
      const result = await this.context.workers.wait(worker.id, { block: true, timeoutMs: 0 });
      return { additionalContext: result.result ? `Delegated lifecycle result: ${result.result}` : "", worker: result };
    } finally { signal?.removeEventListener?.("abort", stop); }
  }

  async executeWebRequest(action, event, payload, hook, signal) {
    await this.authorize(hook, action, { url: action.url, event });
    const url = await safeUrl(interpolate(action.url, event, payload), { allowHttp: action.allowHttp === true });
    const fetcher = this.context?.services?.fetch || globalThis.fetch;
    if (typeof fetcher !== "function") throw new Error("No HTTP transport is available for lifecycle web requests.");
    const headers = Object.fromEntries(Object.entries(action.headers).map(([key, value]) => [key, interpolate(expandAllowedEnvironment(value, action.allowedEnvironment), event, payload)]));
    const response = await fetcher(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(redactSecrets(boundedPayload({ event, ...payload }))), redirect: "error", signal });
    const text = await readBoundedResponse(response, 256000);
    await this.audit(hook, action, response.ok ? "executed-success" : "executed-failure");
    if (!response.ok) throw new Error(`Lifecycle web request failed with status ${response.status}.`);
    return parseActionOutput(text);
  }

  async executeCallback(action, event, payload, hook, signal) {
    if (hook.source.trusted !== true) throw new Error("Application callbacks require a trusted hook source.");
    await this.authorize(hook, action, { callbackId: action.callbackId, event });
    const callback = this.callbacks.get(action.callbackId);
    if (!callback) throw new Error(`Unknown lifecycle callback: ${action.callbackId}`);
    return await callback(Object.freeze({ event, payload: boundedPayload(payload) }), { signal });
  }

  async audit(hook, action, decision) { await this.request.securityContext?.auditLogger?.record({ timestamp: new Date().toISOString(), requestId: this.request.requestId, workspace: this.request.workspaceRoot, tool: "extension_hook_run", hookId: hook.id, actionType: action.type, decision }); }
}

function parseActionOutput(value) {
  const text = String(value || "").trim();
  if (!text) return {};
  try { const parsed = JSON.parse(text); return parsed && typeof parsed === "object" ? parsed : { additionalContext: text }; }
  catch (_error) { return { additionalContext: text.slice(0, 12000) }; }
}

function interpolate(value, event, payload) {
  const eventJson = JSON.stringify(boundedPayload({ event, ...payload }));
  return String(value || "").replace(/\$EVENT_JSON|\$ARGUMENTS/g, eventJson).replace(/\$\{event\}/g, event).replace(/\$\{tool\}/g, String(payload.tool || payload.call?.function?.name || "")).replace(/\$\{path\}/g, String(payload.path || "")).replace(/\$\{error\}/g, String(payload.error || payload.reason || ""));
}

async function safeUrl(value, options = {}) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Lifecycle web requests require HTTP or HTTPS.");
  if (url.protocol === "http:" && options.allowHttp !== true) throw new Error("Lifecycle web requests require HTTPS unless allowHttp is explicitly enabled.");
  if (["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())) throw new Error("Lifecycle web requests cannot target localhost.");
  const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length && net.isIP(url.hostname)) addresses.push({ address: url.hostname });
  if (!addresses.length) throw new Error("Lifecycle web request host could not be resolved safely.");
  if (addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Lifecycle web requests cannot target private network addresses.");
  return url.toString();
}

function isPrivateAddress(address) { return /^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|::ffff:(?:127\.|10\.|192\.168\.)|fc|fd|fe80)/i.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address); }
function expandAllowedEnvironment(value, allowed) { return String(value).replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g, (_match, name) => allowed.includes(name) ? String(process.env[name] || "") : ""); }
function boundedPayload(value) { try { return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "string" ? item.slice(0, 12000) : item)); } catch (_error) { return { value: String(value) }; } }
function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /(?:api.?key|token|secret|password|authorization|cookie)/i.test(key) ? "[redacted]" : redactSecrets(item)]));
}
async function readBoundedResponse(response, maximumBytes) {
  const declared = Number(response.headers?.get?.("content-length") || 0);
  if (declared > maximumBytes) throw new Error(`Lifecycle web response exceeds ${maximumBytes} bytes.`);
  if (!response.body?.getReader) {
    const text = String(await response.text());
    if (Buffer.byteLength(text, "utf8") > maximumBytes) throw new Error(`Lifecycle web response exceeds ${maximumBytes} bytes.`);
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) { await reader.cancel(); throw new Error(`Lifecycle web response exceeds ${maximumBytes} bytes.`); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, size).toString("utf8");
}
function inside(root, candidate) { const relative = path.relative(path.resolve(root), path.resolve(candidate)); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }

module.exports = { LifecycleActionRegistry, expandAllowedEnvironment, interpolate, isPrivateAddress, parseActionOutput, readBoundedResponse, redactSecrets, safeUrl };
