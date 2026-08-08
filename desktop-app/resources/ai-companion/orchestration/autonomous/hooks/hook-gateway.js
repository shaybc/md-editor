/** Executes declarative lifecycle hooks through retained security boundaries. */

"use strict";

const path = require("node:path");
const { StructuredExecutionBroker } = require("../../../security/structured-execution-broker");
const { authorizeTool } = require("../approval-gateway");

const PRE_EVENTS = new Set(["run-start", "before-model", "before-tool", "before-compaction"]);
const SUPPORTED_EVENTS = new Set([...PRE_EVENTS, "run-finish", "after-model", "after-tool", "tool-failure", "after-compaction"]);

class HookGateway {
  constructor(request, entries, emit = () => {}) {
    this.request = request;
    this.emit = emit;
    this.taskGrants = [];
    this.running = false;
    this.hooks = (entries || []).map(normalizeHook);
  }

  register(entries) {
    const normalized = Array.from(entries || [], normalizeHook);
    this.hooks.push(...normalized);
  }

  replacePrefix(prefix, entries) {
    const normalized = Array.from(entries || [], normalizeHook);
    this.hooks = this.hooks.filter((hook) => !hook.id.startsWith(prefix));
    this.hooks.push(...normalized);
  }

  /** Run matching hooks in declaration order and return bounded injected context. */
  async run(event, payload = {}) {
    if (!SUPPORTED_EVENTS.has(event) || this.running) return { additionalContext: [] };
    const matched = this.hooks.filter((hook) => hook.event === event && matchesHook(hook, payload));
    const additionalContext = [];
    this.running = true;
    try {
      for (const hook of matched) {
        this.emit({ type: "hook-started", hookId: hook.id, event });
        try {
          const result = hook.action.type === "context" ? { additionalContext: hook.action.content } : await this.runCommand(hook, payload);
          if (result?.decision === "deny") throw Object.assign(new Error(result.message || `Hook '${hook.id}' denied the action.`), { code: "EXTENSION_HOOK_DENIED" });
          if (result?.additionalContext) additionalContext.push(String(result.additionalContext).slice(0, 12000));
          this.emit({ type: "hook-completed", hookId: hook.id, event });
        } catch (error) {
          this.emit({ type: "hook-failed", hookId: hook.id, event, error: error?.message || String(error), failClosed: PRE_EVENTS.has(event) });
          if (PRE_EVENTS.has(event)) throw error;
        }
      }
    } finally {
      this.running = false;
    }
    return { additionalContext };
  }

  async runCommand(hook, payload) {
    const approval = await authorizeTool(this.request, "extension_hook_run", { hookId: hook.id }, this.taskGrants);
    if (!approval.approved) throw new Error(`Execution of hook '${hook.id}' was denied.`);
    const broker = new StructuredExecutionBroker();
    const action = hook.action;
    const result = await broker.execute({
      workspaceRoot: this.request.workspaceRoot,
      cwd: path.resolve(this.request.workspaceRoot, action.cwd || "."),
      executable: action.executable,
      args: action.args.map((value) => interpolate(value, payload)),
      environment: action.environment
    }, this.request.securityContext?.policy, { signal: this.request.signal });
    await this.request.securityContext?.auditLogger?.record({ timestamp: new Date().toISOString(), requestId: this.request.requestId, workspace: this.request.workspaceRoot, tool: "extension_hook_run", hookId: hook.id, decision: result.success ? "executed-success" : "executed-failure" });
    if (!result.success) throw new Error(result.stderr || `Hook '${hook.id}' exited with code ${result.exitCode}.`);
    try { return JSON.parse(result.stdout || "{}"); } catch (_error) { return { additionalContext: result.stdout }; }
  }
}

function normalizeHook(entry) {
  const source = entry?.metadata || entry || {};
  const id = String(source.id || entry?.id || "").trim();
  const event = String(source.event || "").trim();
  if (!id || !SUPPORTED_EVENTS.has(event)) throw new Error("Hook definitions require an id and supported event.");
  const action = source.action || {};
  if (action.type === "context") return { id, event, matcher: source.matcher || {}, action: { type: "context", content: String(action.content || "") } };
  if (action.type !== "command" || !String(action.executable || "").trim()) throw new Error(`Hook '${id}' requires a context or command action.`);
  return { id, event, matcher: source.matcher || {}, action: { type: "command", executable: String(action.executable), args: Array.isArray(action.args) ? action.args.map(String) : [], cwd: String(action.cwd || ""), environment: action.environment || {} } };
}

function matchesHook(hook, payload) {
  const toolPattern = String(hook.matcher?.tool || "").trim();
  if (!toolPattern) return true;
  const expression = new RegExp(`^${toolPattern.split("*").map(escapeRegex).join(".*")}$`, "i");
  return expression.test(String(payload.tool || payload.call?.function?.name || ""));
}

function escapeRegex(value) { return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&"); }
function interpolate(value, payload) {
  return String(value).replace(/\$\{tool\}/g, String(payload.tool || payload.call?.function?.name || ""));
}

module.exports = { HookGateway, PRE_EVENTS, SUPPORTED_EVENTS, matchesHook, normalizeHook };
