/** Validation and availability policy for autonomous workflow skills. */

"use strict";

const MODES = new Set(["chat", "plan", "agent"]);
const EXECUTION_CONTEXTS = new Set(["inline", "worker"]);
const COMMAND_PATTERN = /^[a-z0-9][a-z0-9:_-]{1,79}$/;
const HOOK_EVENTS = new Set(["before-model", "before-tool", "before-compaction", "run-finish", "after-model", "after-tool", "tool-failure", "after-compaction"]);

class SkillDefinitionPolicy {
  /** Normalize one skill definition and report every invalid field. */
  static validate(source = {}) {
    const name = normalizeCommand(source.command || source.id);
    const allowedModes = normalizeList(source.allowedModes);
    const executionContext = String(source.executionContext || source.context || "inline").trim().toLowerCase();
    const value = {
      name,
      displayName: String(source.name || name).trim(),
      description: String(source.description || "").trim(),
      usage: String(source.usage || source.whenToUse || "").trim(),
      aliases: normalizeList(source.aliases).map(normalizeCommand).filter(Boolean),
      triggers: normalizeList(source.triggers),
      argumentHint: String(source.argumentHint || "").trim(),
      argumentNames: normalizeList(source.arguments),
      allowedModes,
      allowedTools: normalizeList(source.allowedTools),
      allowedCapabilities: normalizeList(source.allowedCapabilities || source.capabilityScopes),
      requiredTools: normalizeList(source.requiredTools),
      model: String(source.model || "").trim(),
      route: String(source.route || "").trim(),
      agent: String(source.agent || "").trim(),
      executionContext,
      userInvocable: source.userInvocable !== false,
      modelInvocable: source.modelInvocable !== false,
      paths: normalizeList(source.paths),
      exclude: normalizeList(source.exclude),
      hooks: source.hooks && typeof source.hooks === "object" ? source.hooks : null
    };
    const errors = [];
    if (!value.name) errors.push("Skill id or command must be a valid lowercase command name.");
    if (!value.displayName) errors.push("Skill name is required.");
    if (!value.description) errors.push("Skill description is required.");
    for (const mode of allowedModes) if (!MODES.has(mode)) errors.push(`Unsupported skill mode: ${mode}.`);
    if (!EXECUTION_CONTEXTS.has(executionContext)) errors.push(`Unsupported skill execution context: ${executionContext}.`);
    if (value.aliases.includes(value.name)) errors.push("A skill alias cannot repeat its canonical name.");
    if (value.paths.some((pattern) => pathIsUnsafe(pattern)) || value.exclude.some((pattern) => pathIsUnsafe(pattern))) errors.push("Skill path patterns must remain workspace-relative.");
    for (const tool of [...value.allowedTools, ...value.requiredTools]) if (!/^[a-zA-Z0-9_:.-]+$/.test(tool)) errors.push(`Invalid skill tool name: ${tool}.`);
    if (source.permissions || source.approvalGrants || source.securityPolicy) errors.push("Skill definitions cannot declare permissions, approval grants, or security policy.");
    errors.push(...validateHooks(value.hooks));
    return { valid: errors.length === 0, errors, value };
  }

  /** Determine whether a validated skill may be advertised or invoked now. */
  static availability(definition, options = {}) {
    const mode = String(options.mode || "chat");
    if (definition.allowedModes.length && !definition.allowedModes.includes(mode)) return { available: false, reason: `Not available in ${mode} mode.` };
    if (options.user === true && !definition.userInvocable) return { available: false, reason: "Not available for direct user invocation." };
    if (options.model === true && !definition.modelInvocable) return { available: false, reason: "Not available for model invocation." };
    if (options.trusted === false) return { available: false, reason: "The skill source is not trusted." };
    const tools = options.toolNames instanceof Set ? options.toolNames : null;
    const missing = tools ? definition.requiredTools.filter((name) => !tools.has(name)) : [];
    if (missing.length) return { available: false, reason: `Required tools are unavailable: ${missing.join(", ")}.` };
    if (definition.model && options.modelNames instanceof Set && !options.modelNames.has(definition.model)) return { available: false, reason: `Configured model is unavailable: ${definition.model}.` };
    return { available: true };
  }
}

function normalizeCommand(value) {
  const name = String(value || "").trim().toLowerCase();
  return COMMAND_PATTERN.test(name) ? name : "";
}

function normalizeList(value) {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]).map((entry) => String(entry || "").trim()).filter(Boolean);
}

function pathIsUnsafe(value) {
  const normalized = String(value || "").replace(/\\/g, "/");
  return normalized.startsWith("/") || /^[a-z]:\//i.test(normalized) || normalized.split("/").includes("..");
}

function validateHooks(hooks) {
  if (!hooks) return [];
  const values = Array.isArray(hooks) ? hooks : (hooks.event ? [hooks] : Object.entries(hooks).map(([event, action]) => ({ event, action })));
  const errors = [];
  for (const hook of values) {
    if (!HOOK_EVENTS.has(String(hook?.event || ""))) { errors.push(`Unsupported skill hook event: ${hook?.event || "missing"}.`); continue; }
    const action = hook?.action || {};
    if (!["context", "command"].includes(action.type)) errors.push("Skill hooks require a context or command action.");
    if (action.type === "command" && !String(action.executable || "").trim()) errors.push("Skill command hooks require an executable.");
  }
  return errors;
}

module.exports = { COMMAND_PATTERN, HOOK_EVENTS, SkillDefinitionPolicy, normalizeCommand, normalizeList, pathIsUnsafe, validateHooks };
