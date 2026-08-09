/** Executes persistent extension tools through bounded runtime-owned adapters. */

"use strict";

const { readBundle } = require("./bundle-discovery");
const { authorizeTool } = require("../approval-gateway");

class ExtensionToolDispatcher {
  constructor(options = {}) {
    this.fabric = options.fabric;
    this.applicationActions = options.applicationActions;
    this.emit = typeof options.emit === "function" ? options.emit : () => {};
  }

  /** Revalidate provenance, authorize the action, and dispatch one adapter. */
  async execute(registration, args, context) {
    await this.assertCurrent(registration, context);
    this.emit({ type: "extension-tool-started", tool: registration.name, extensionId: registration.extensionId, summary: `Extension tool ${registration.name} started.` });
    try {
      const result = await withTimeout(this.dispatch(registration, args || {}, context), registration.timeoutMs, context.request.signal);
      const bounded = await boundResult(result, registration, context);
      this.emit({ type: "extension-tool-completed", tool: registration.name, extensionId: registration.extensionId, summary: `Extension tool ${registration.name} completed.` });
      return bounded;
    } catch (error) {
      this.emit({ type: "extension-tool-failed", tool: registration.name, extensionId: registration.extensionId, error: error?.message || String(error), summary: `Extension tool ${registration.name} failed.` });
      throw error;
    }
  }

  async dispatch(registration, args, context) {
    const adapter = registration.adapter || {};
    if (adapter.type === "extension-command") return context.extensionCommands.invoke(context.extensionCommands.resolve(adapter.target), String(args.arguments || ""), context);
    if (adapter.type === "workflow") return context.skillInvocation.invoke(adapter.target, JSON.stringify(args), { trigger: "extension-tool", context });
    if (adapter.type === "external-tool") { await context.capabilities.search(`select:${adapter.target}`); return context.capabilities.invoke(adapter.target, args, context); }
    if (adapter.type === "application-action") {
      if (this.applicationActions.describe(adapter.target)) {
        await authorizeIfRequired(registration, args, context);
        return this.applicationActions.invoke(adapter.target, args, context);
      }
      const target = context.capabilities.registration(adapter.target);
      if (target?.executionOwner !== "application") throw unavailable(`MD-Editor action '${adapter.target}' is not registered.`);
      await context.capabilities.search(`select:${adapter.target}`);
      return context.executeExtensionDelegate({ id: `extension-${registration.name}`, type: "function", function: { name: adapter.target, arguments: JSON.stringify(args) } }, context);
    }
    if (adapter.type === "command") {
      const command = commandLine(adapter, args);
      const environment = await resolveCredentialMap(adapter.environment, context.request);
      return context.executeExtensionDelegate({ id: `extension-${registration.name}`, type: "function", function: { name: "run_command", arguments: JSON.stringify({ command, cwd: adapter.cwd, environment, timeoutMs: registration.timeoutMs }) } }, context);
    }
    if (adapter.type === "web-request") {
      await authorizeIfRequired(registration, args, context);
      const fetcher = context.services?.fetch || globalThis.fetch;
      if (typeof fetcher !== "function") throw new Error("No network transport is available for this extension tool.");
      const headers = await resolveCredentialMap(adapter.headers, context.request);
      const request = { method: adapter.method, headers, signal: context.request.signal };
      let url = adapter.url;
      if (["GET", "HEAD"].includes(adapter.method)) url += `${url.includes("?") ? "&" : "?"}${new URLSearchParams(flatten(args))}`;
      else { request.headers = { "content-type": "application/json", ...headers }; request.body = JSON.stringify(args); }
      const response = await fetcher(url, request);
      const text = await response.text();
      if (!response.ok) throw new Error(`Extension web request failed with HTTP ${response.status}.`);
      return { status: response.status, contentType: response.headers?.get?.("content-type") || "", body: text };
    }
    throw new Error(`Unsupported persistent extension adapter: ${adapter.type || "missing"}.`);
  }

  async assertCurrent(registration, context) {
    if (!registration.allowedModes?.includes(context.policy.mode)) throw unavailable(`Tool '${registration.name}' is unavailable in ${context.policy.mode} mode.`);
    const bundle = this.fabric.bundles.find((candidate) => candidate.id === registration.extensionId && candidate.enabled && candidate.trusted);
    if (!bundle) throw unavailable(`Extension '${registration.extensionId}' is no longer enabled and trusted.`);
    const current = await readBundle(bundle.root, { scope: bundle.scope, trustedByDefault: bundle.trustedByDefault });
    if (current.digest !== registration.extensionDigest) throw unavailable(`Extension '${registration.extensionId}' changed after tool activation. Search for the tool again.`);
  }
}

async function authorizeIfRequired(registration, args, context) {
  const approval = await authorizeTool(context.request, "extension_tool_invoke", { extensionTool: registration.name, extensionId: registration.extensionId, requiredCapability: registration.requiredCapability, arguments: args }, context.taskGrants, { permissionPolicy: context.permissionPolicy, denialLedger: context.denialLedger, riskAdvisor: context.riskAdvisor });
  if (!approval.approved) { const error = new Error(approval.instructions || "The user denied this extension action."); error.code = "EXTENSION_TOOL_DENIED"; error.doNotRetry = approval.doNotRetry === true; throw error; }
}

function commandLine(adapter, args) { return [adapter.executable, ...adapter.args.map((value) => interpolate(value, args))].map(quoteToken).join(" "); }
function interpolate(template, args) { return String(template).replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_match, key) => scalar(pathValue(args, key))); }
function pathValue(value, key) { return key.split(".").reduce((current, part) => current && current[part], value); }
function scalar(value) { if (["string", "number", "boolean"].includes(typeof value)) return String(value); throw new Error("Command template arguments must resolve to scalar values."); }
function quoteToken(value) { const text = String(value); return process.platform === "win32" ? `"${text.replace(/"/g, '""')}"` : `'${text.replace(/'/g, `'"'"'`)}'`; }
function flatten(value) { return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => ["string", "number", "boolean"].includes(typeof item)).map(([key, item]) => [key, String(item)])); }

async function resolveCredentialMap(headers, request) {
  const output = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const match = String(value).match(/^credential:(.+)$/);
    if (!match) { output[key] = value; continue; }
    if (typeof request.resolveCredential !== "function") throw new Error(`Credential '${match[1]}' cannot be resolved.`);
    output[key] = await request.resolveCredential(match[1]);
  }
  return output;
}

async function boundResult(result, registration, context) {
  const serialized = typeof result === "string" ? result : JSON.stringify(result);
  if (Buffer.byteLength(serialized) <= registration.maxOutputBytes) return result;
  const artifact = await context.artifactVault.store(serialized, { tool: registration.name, purpose: "extension-tool-output" });
  return { truncated: true, preview: serialized.slice(0, 4000), artifact: context.artifactVault.reference(artifact) };
}

function withTimeout(promise, timeoutMs, signal) {
  if (signal?.aborted) return Promise.reject(Object.assign(new Error("Extension tool cancelled."), { name: "AbortError" }));
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Extension tool exceeded its ${timeoutMs} ms timeout.`)), timeoutMs); });
  let onAbort;
  const cancelled = new Promise((_, reject) => { onAbort = () => reject(Object.assign(new Error("Extension tool cancelled."), { name: "AbortError" })); signal?.addEventListener?.("abort", onAbort, { once: true }); });
  return Promise.race([promise, timeout, cancelled]).finally(() => { clearTimeout(timer); signal?.removeEventListener?.("abort", onAbort); });
}
function unavailable(message) { const error = new Error(message); error.code = "EXTENSION_TOOL_UNAVAILABLE"; error.doNotRetry = true; return error; }

module.exports = { ExtensionToolDispatcher };
