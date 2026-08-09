/** Validation policy for persistent extension tool descriptors. */

"use strict";

const TOOL_NAME = /^[a-z][a-z0-9_]{1,63}$/;
const ADAPTERS = new Set(["application-action", "command", "web-request", "external-tool", "workflow"]);
const MODES = new Set(["chat", "plan", "agent"]);

/** Validate and normalize one persistent tool descriptor without executing it. */
function normalizeExtensionTool(entry) {
  const source = entry?.metadata || entry || {};
  const name = String(source.name || source.id || "").trim().toLowerCase();
  const description = String(source.description || "").trim();
  const inputSchema = normalizeInputSchema(source.inputSchema || source.parameters);
  const adapter = normalizeAdapter(source.adapter);
  if (!TOOL_NAME.test(name)) throw new Error("Extension tools require a lowercase snake-case name between 2 and 64 characters.");
  if (!description) throw new Error(`Extension tool '${name}' requires a description.`);
  return {
    id: name, name,
    displayName: String(source.displayName || name.replace(/_/g, " ")).trim(),
    description,
    searchHint: String(source.searchHint || "").trim(),
    domain: String(source.domain || "extension").trim(),
    inputSchema,
    adapter,
    allowedModes: normalizeModes(source.allowedModes),
    requiredCapability: String(source.requiredCapability || "").trim(),
    permissionScope: String(source.permissionScope || "").trim(),
    alwaysLoad: source.alwaysLoad === true,
    timeoutMs: bounded(source.timeoutMs, 100, 300000, 30000),
    maxOutputBytes: bounded(source.maxOutputBytes, 1024, 10485760, 262144),
    rulePaths: normalizeRulePaths(source.rulePaths)
  };
}

function normalizeAdapter(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const type = String(source.type || "").trim();
  if (!ADAPTERS.has(type)) throw new Error(`Extension tool adapter '${type || "missing"}' is unsupported.`);
  const target = String(source.target || source.actionId || source.tool || source.skill || "").trim();
  if (!target && type !== "command" && type !== "web-request") throw new Error(`Extension tool adapter '${type}' requires a target.`);
  if (type === "command") {
    const executable = String(source.executable || "").trim();
    if (!executable) throw new Error("Command adapters require an executable.");
    const environment = stringMap(source.environment);
    rejectEmbeddedSecrets(environment, "command environment");
    return { type, executable, args: list(source.args), cwd: String(source.cwd || "").trim(), environment };
  }
  if (type === "web-request") {
    const url = String(source.url || "").trim();
    if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(url)) throw new Error("Web-request adapters require HTTPS, except for local development addresses.");
    const headers = stringMap(source.headers);
    rejectEmbeddedSecrets(headers, "web request headers");
    return { type, url, method: String(source.method || "POST").toUpperCase(), headers };
  }
  return { type, target };
}

function normalizeInputSchema(value) {
  const schema = value && typeof value === "object" && !Array.isArray(value) ? value : { type: "object", properties: {}, additionalProperties: false };
  if (schema.type && schema.type !== "object") throw new Error("Extension tool input schemas must describe an object.");
  if (JSON.stringify(schema).length > 64000) throw new Error("Extension tool input schema exceeds the 64,000-character limit.");
  return { type: "object", properties: {}, additionalProperties: false, ...schema };
}

function normalizeModes(value) { const modes = list(value).filter((mode) => MODES.has(mode)); return modes.length ? modes : ["chat", "plan", "agent"]; }
function normalizeRulePaths(value) { const source = value && typeof value === "object" ? value : {}; return { arguments: list(source.arguments), results: list(source.results) }; }
function list(value) { return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : []; }
function stringMap(value) { return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [String(key), String(item)])) : {}; }
function rejectEmbeddedSecrets(value, label) { for (const [key, item] of Object.entries(value)) if (/authorization|token|secret|api.?key|password/i.test(key) && !/^credential:[a-zA-Z0-9._-]+$/.test(item)) throw new Error(`Sensitive ${label} values must use a credential:<id> reference.`); }
function bounded(value, minimum, maximum, fallback) { const number = Math.floor(Number(value)); return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback; }

module.exports = { ADAPTERS, TOOL_NAME, normalizeExtensionTool };
