/** Invocation lifecycle, argument expansion, and capability narrowing for skills. */

"use strict";

const MAX_INVOCATION_DEPTH = 3;
const ALWAYS_AVAILABLE_DURING_SKILL = new Set([
  "skill_invoke", "capability_search", "context_observation_list", "context_release", "artifact_read", "continuity_search"
]);

class SkillInvocationSession {
  constructor(catalog, emit = () => {}) {
    this.catalog = catalog;
    this.emit = typeof emit === "function" ? emit : () => {};
    this.records = [];
    this.activeNames = new Set();
  }

  /** Activate one exact workflow and prepare its independently authored instructions. */
  async invoke(name, args = "", options = {}) {
    const key = String(name || "").trim().toLowerCase().replace(/^\//, "");
    if (this.activeNames.has(key)) {
      const error = new Error(`Workflow '${key}' is already active.`);
      error.code = "SKILL_ALREADY_ACTIVE";
      throw error;
    }
    if (this.records.length >= MAX_INVOCATION_DEPTH) {
      const error = new Error(`Workflow nesting exceeds the limit of ${MAX_INVOCATION_DEPTH}.`);
      error.code = "SKILL_DEPTH_LIMIT";
      throw error;
    }
    let active;
    try {
      const candidate = this.catalog.resolve(key, { user: options.user, model: options.user !== true });
      const inject = options.inject !== false && candidate?.definition?.executionContext !== "worker";
      active = await this.catalog.invoke(key, { trigger: options.trigger, user: options.user, model: options.user !== true, inject, arguments: args });
    } catch (error) {
      this.emit({ type: "skill-invocation-failed", name: key, error: error?.message || String(error), summary: `Workflow ${key} could not be activated.` });
      throw error;
    }
    const expandedBody = expandArguments(active.body, args, active.definition.argumentNames);
    active.body = expandedBody;
    const record = {
      name: active.definition.name,
      args: normalizeInvocationArguments(args),
      trigger: options.trigger || "model",
      allowedTools: active.definition.allowedTools.slice(),
      allowedCapabilities: active.definition.allowedCapabilities.slice(),
      model: active.definition.model,
      route: active.definition.route,
      agent: active.definition.agent,
      executionContext: active.definition.executionContext,
      source: active.source,
      contentFingerprint: active.contentFingerprint
    };
    try {
      if (active.definition.hooks && !options.context?.hooks?.register) throw new Error("The current execution boundary cannot register workflow hooks.");
      if (active.definition.hooks) options.context.hooks.register(skillHooks(record.name, active.definition.hooks));
      if (record.executionContext === "inline" && record.model && options.context?.selectSkillModel) options.context.selectSkillModel(record.model);
      if (record.executionContext === "inline" && record.route && options.context?.selectSkillRoute) options.context.selectSkillRoute(record.route);
      if (record.executionContext === "worker" && !options.deferWorker && options.context?.workers) {
        const worker = await options.context.workers.launch({ description: active.definition.displayName, prompt: expandedBody, agentId: record.agent || undefined, model: record.model || undefined, routeId: record.route || undefined, background: false });
        this.records.push(record);
        this.activeNames.add(record.name);
        this.emit({ type: "skill-invocation-completed", name: record.name, executionContext: "worker", summary: `Workflow ${record.name} completed in a worker.` });
        return { name: record.name, activated: true, executionContext: "worker", worker };
      }
    } catch (error) {
      this.catalog.invoked.delete(record.name);
      this.catalog.pendingInstructions = this.catalog.pendingInstructions.filter((entry) => entry.definition.name !== record.name);
      this.emit({ type: "skill-invocation-failed", name: record.name, error: error?.message || String(error), summary: `Workflow ${record.name} activation failed.` });
      throw error;
    }
    this.records.push(record);
    this.activeNames.add(record.name);
    this.emit({ type: "skill-invocation-completed", name: record.name, executionContext: "inline", allowedTools: record.allowedTools, summary: `Workflow ${record.name} instructions loaded.` });
    return { name: record.name, activated: true, executionContext: "inline", allowedTools: record.allowedTools, model: record.model || undefined, marker: `workflow:${record.name}` };
  }

  /** Ensure an invoked workflow cannot broaden the parent tool set. */
  assertToolAllowed(name) {
    const scopes = this.records.filter((record) => record.allowedTools.length || record.allowedCapabilities?.length);
    if (!scopes.length || ALWAYS_AVAILABLE_DURING_SKILL.has(name)) return;
    const domain = this.catalog.capabilities?.registration?.(name)?.domain || "";
    if (scopes.every((record) => record.allowedTools.includes(name) || record.allowedCapabilities?.includes(domain))) return;
    const error = new Error(`Tool '${name}' is outside the active workflow scope.`);
    error.code = "SKILL_TOOL_NOT_ALLOWED";
    error.retryable = false;
    error.doNotRetry = true;
    throw error;
  }

  snapshot() { return { version: 1, records: this.records.map((record) => ({ ...record, allowedTools: record.allowedTools.slice(), allowedCapabilities: (record.allowedCapabilities || []).slice() })) }; }

  reconcile(context = {}) {
    const retained = [];
    for (const record of this.records) {
      const active = this.catalog.invoked.get(record.name);
      if (!active) {
        this.activeNames.delete(record.name);
        this.emit({ type: "skill-unavailable", name: record.name, summary: `Active workflow ${record.name} is no longer available.` });
        continue;
      }
      if (active.definition.hooks && !context.hooks?.replacePrefix) {
        this.activeNames.delete(record.name);
        this.emit({ type: "skill-unavailable", name: record.name, summary: `Active workflow ${record.name} requires an unavailable hook gateway.` });
        continue;
      }
      record.allowedTools = active.definition.allowedTools.slice();
      record.allowedCapabilities = active.definition.allowedCapabilities.slice();
      record.model = active.definition.model;
      record.route = active.definition.route;
      record.agent = active.definition.agent;
      const prefix = `skill:${record.name}:`;
      if (context.hooks?.replacePrefix) context.hooks.replacePrefix(prefix, active.definition.hooks ? skillHooks(record.name, active.definition.hooks) : []);
      retained.push(record);
    }
    this.records = retained;
    const model = retained.slice().reverse().find((record) => record.executionContext === "inline" && record.model)?.model;
    const route = retained.slice().reverse().find((record) => record.executionContext === "inline" && record.route)?.route;
    if (context.selectSkillModel) context.selectSkillModel(model || "");
    if (context.selectSkillRoute) context.selectSkillRoute(route || "");
  }

  async restore(snapshot = {}, context = {}) {
    for (const record of Array.isArray(snapshot.records) ? snapshot.records : []) {
      try {
        const active = this.catalog.invoked.get(record.name);
        if (!active) await this.invoke(record.name, record.args, { trigger: "restart-recovery" });
        else {
          if (active.definition.hooks && !context.hooks?.register) throw new Error("The current recovery boundary cannot register workflow hooks.");
          if (active.definition.hooks && context.hooks?.register) context.hooks.register(skillHooks(record.name, active.definition.hooks));
          this.records.push({ ...record, allowedTools: Array.isArray(record.allowedTools) ? record.allowedTools.slice() : active.definition.allowedTools.slice(), allowedCapabilities: Array.isArray(record.allowedCapabilities) ? record.allowedCapabilities.slice() : active.definition.allowedCapabilities.slice() });
          this.activeNames.add(record.name);
        }
      }
      catch (error) {
        this.catalog.invoked.delete(record.name);
        this.catalog.pendingInstructions = this.catalog.pendingInstructions.filter((entry) => entry.definition.name !== record.name);
        this.emit({ type: "skill-unavailable", name: record.name, reason: error?.message || String(error), summary: `Saved workflow ${record.name} could not be restored.` });
      }
    }
  }
}

function skillHooks(name, hooks) {
  const values = Array.isArray(hooks) ? hooks : (hooks.event ? [hooks] : Object.entries(hooks).map(([event, action]) => ({ event, action })));
  return values.map((hook, index) => ({ ...hook, id: `skill:${name}:${hook.id || index + 1}` }));
}

function expandArguments(body, rawArgs, argumentNames = []) {
  const named = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs : parseNamedArguments(rawArgs);
  const serialized = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs || {});
  let result = String(body || "").replaceAll("{{arguments}}", serialized);
  for (const name of argumentNames) result = result.replaceAll(`{{${name}}}`, named[name] || "");
  return result;
}

function normalizeInvocationArguments(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return JSON.parse(JSON.stringify(value));
  return String(value || "");
}

function parseNamedArguments(rawArgs) {
  const result = {};
  const expression = /--([a-zA-Z0-9_-]+)(?:=|\s+)("[^"]*"|'[^']*'|[^\s]+)/g;
  for (const match of String(rawArgs || "").matchAll(expression)) result[match[1]] = match[2].replace(/^("|')|("|')$/g, "");
  return result;
}

module.exports = { ALWAYS_AVAILABLE_DURING_SKILL, MAX_INVOCATION_DEPTH, SkillInvocationSession, expandArguments, normalizeInvocationArguments, parseNamedArguments, skillHooks };
