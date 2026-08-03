/**
 * Agent-facing API Client tools backed by the desktop API Client profile data.
 */

"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const PROFILE_DIR = ".md-editor";
const COLLECTIONS_PROFILE_FILE = "api-client/collections.json";
const RECENT_HISTORY_PROFILE_FILE = "api-client/recent-history.json";
const ENVIRONMENTS_PROFILE_FILE = "api-client/environments.json";
const MOCKS_PROFILE_FILE = "api-client/mocks.json";
const ROOT_ID = "root";
const REQUEST_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const SECRET_MASK = "[redacted]";
const SPEC_FILE_PATTERN = /\.(openapi|swagger)\.(json|ya?ml)$|(^|[\\/])(openapi|swagger)\.(json|ya?ml)$/i;
const SECRET_PATTERNS = [
  { name: "bearer-token", pattern: /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi },
  { name: "api-key-assignment", pattern: /\b(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}["']?/gi },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { name: "long-secret", pattern: /\b[A-Za-z0-9_+/=-]{32,}\b/g },
  { name: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi }
];

function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("AI Companion request cancelled.");
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || null));
}

function getProfileRoot(options = {}) {
  return path.resolve(String(options.profileRoot || path.join(os.homedir(), PROFILE_DIR)));
}

function getProfilePath(profileFile, options = {}) {
  return path.join(getProfileRoot(options), ...String(profileFile).split("/"));
}

async function readJsonProfile(profileFile, fallback, options = {}) {
  throwIfAborted(options.signal);
  try {
    return JSON.parse(await fs.readFile(getProfilePath(profileFile, options), "utf8"));
  } catch (_error) {
    return clone(fallback);
  }
}

async function writeJsonProfile(profileFile, value, options = {}) {
  throwIfAborted(options.signal);
  const filePath = getProfilePath(profileFile, options);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  return clone(value);
}

function createDefaultCollection() {
  return { version: 1, root: { id: ROOT_ID, type: "folder", name: "Saved Requests", children: [] } };
}

function createDefaultEnvironments() {
  return { version: 1, activeEnvironmentId: "", globals: [], environments: [] };
}

function createDefaultMocks() {
  return { version: 1, routes: [] };
}

function normalizeRequestNode(source = {}) {
  return {
    id: String(source.id || createId("request")),
    type: "request",
    name: String(source.name || "Untitled Request"),
    method: String(source.method || "GET").toUpperCase(),
    url: String(source.url || ""),
    paramsText: String(source.paramsText || ""),
    headersText: String(source.headersText || ""),
    bodyMode: ["none", "form-data", "raw"].includes(String(source.bodyMode || "").toLowerCase()) ? String(source.bodyMode).toLowerCase() : "raw",
    bodyText: String(source.bodyText || ""),
    formDataText: String(source.formDataText || "")
  };
}

function normalizeCollectionNode(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "request") return normalizeRequestNode(node);
  return {
    id: String(node.id || createId("folder")),
    type: "folder",
    name: String(node.name || "Folder"),
    children: (Array.isArray(node.children) ? node.children : []).map(normalizeCollectionNode).filter(Boolean)
  };
}

function normalizeCollectionDocument(document) {
  const normalized = createDefaultCollection();
  if (document?.root) normalized.root = normalizeCollectionNode(document.root) || normalized.root;
  normalized.root.id = ROOT_ID;
  normalized.root.type = "folder";
  return normalized;
}

function normalizeVariable(variable = {}) {
  return {
    id: String(variable.id || createId("variable")),
    key: String(variable.key || variable.name || ""),
    type: String(variable.type || "").toLowerCase() === "secret" ? "secret" : "default",
    initialValue: String(variable.initialValue ?? variable.value ?? ""),
    currentValue: String(variable.currentValue ?? ""),
    enabled: variable.enabled !== false
  };
}

function normalizeEnvironmentsDocument(document) {
  const normalized = createDefaultEnvironments();
  normalized.globals = (Array.isArray(document?.globals) ? document.globals : []).map(normalizeVariable).filter((item) => item.key);
  normalized.environments = (Array.isArray(document?.environments) ? document.environments : []).map((environment) => ({
    id: String(environment.id || createId("environment")),
    name: String(environment.name || "New Environment"),
    variables: (Array.isArray(environment.variables) ? environment.variables : []).map(normalizeVariable).filter((item) => item.key)
  }));
  normalized.activeEnvironmentId = normalized.environments.some((item) => item.id === document?.activeEnvironmentId) ? String(document.activeEnvironmentId) : "";
  return normalized;
}

function redactText(value) {
  let redacted = String(value ?? "");
  const findings = [];
  for (const rule of SECRET_PATTERNS) {
    redacted = redacted.replace(rule.pattern, (match) => {
      findings.push({ type: rule.name, length: match.length });
      return SECRET_MASK;
    });
  }
  return { redacted, findings };
}

function redactValue(value) {
  if (typeof value === "string") return redactText(value).redacted;
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /secret|token|password|api[-_]?key/i.test(key) ? SECRET_MASK : redactValue(item)]));
}

function maskVariable(variable) {
  const shouldMask = variable.type === "secret" || /secret|token|password|api[-_]?key/i.test(variable.key);
  return { ...variable, initialValue: shouldMask ? SECRET_MASK : redactText(variable.initialValue).redacted, currentValue: shouldMask ? SECRET_MASK : redactText(variable.currentValue).redacted };
}

function findNodeById(folder, nodeId, parent = null) {
  if (!folder || !nodeId) return null;
  if (folder.id === nodeId) return { node: folder, parent };
  for (const child of folder.children || []) {
    if (child.id === nodeId) return { node: child, parent: folder };
    if (child.type === "folder") {
      const match = findNodeById(child, nodeId, child);
      if (match) return match;
    }
  }
  return null;
}

function resolveFolderParent(collection, parentId) {
  if (!parentId) return { node: collection.root };
  const normalizedId = String(parentId).startsWith("folder:") ? String(parentId).slice("folder:".length) : String(parentId);
  const match = findNodeById(collection.root, normalizedId);
  if (!match?.node || match.node.type !== "folder") throw new Error("Saved request folder was not found.");
  return match;
}

function collectCollectionAssets(folder, assets = [], lineage = []) {
  if (!folder) return assets;
  assets.push({ id: `folder:${folder.id}`, type: "folder", name: folder.name, path: lineage.concat(folder.name).join("/") });
  for (const child of folder.children || []) {
    if (child.type === "request") {
      assets.push({ id: `request:${child.id}`, type: "request", name: child.name, method: child.method, url: redactText(child.url).redacted, path: lineage.concat(folder.name, child.name).join("/") });
    } else {
      collectCollectionAssets(child, assets, lineage.concat(folder.name));
    }
  }
  return assets;
}

function createVariableMap(document, environmentId) {
  const map = new Map();
  const addVariables = (variables) => (variables || []).forEach((variable) => {
    if (variable.enabled === false || !variable.key) return;
    map.set(variable.key, String(variable.currentValue || variable.initialValue || ""));
  });
  addVariables(document.globals);
  const selectedId = environmentId || document.activeEnvironmentId;
  addVariables(document.environments.find((environment) => environment.id === selectedId)?.variables);
  return map;
}

function resolveTextVariables(text, variables, missing) {
  return String(text || "").replace(/{{\s*([^{}]+?)\s*}}/g, (match, name) => {
    const key = String(name || "").trim();
    if (!variables.has(key) || variables.get(key) === "") {
      missing.add(key);
      return match;
    }
    return variables.get(key);
  });
}

function parseHeadersText(headersText) {
  const headers = {};
  String(headersText || "").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex <= 0) throw new Error(`Invalid header line: ${trimmed}`);
    headers[trimmed.slice(0, separatorIndex).trim()] = trimmed.slice(separatorIndex + 1).trim();
  });
  return headers;
}

function requestToPayload(request, environments, environmentId) {
  const variables = createVariableMap(environments, environmentId);
  const missing = new Set();
  const resolved = {
    ...normalizeRequestNode(request),
    url: resolveTextVariables(request.url, variables, missing),
    paramsText: resolveTextVariables(request.paramsText, variables, missing),
    headersText: resolveTextVariables(request.headersText, variables, missing),
    bodyText: resolveTextVariables(request.bodyText, variables, missing),
    formDataText: resolveTextVariables(request.formDataText, variables, missing)
  };
  if (missing.size) throw new Error(`Unresolved variable: ${Array.from(missing).join(", ")}`);
  return {
    method: resolved.method,
    url: resolved.url,
    headers: parseHeadersText(resolved.headersText),
    bodyMode: resolved.bodyMode,
    body: resolved.bodyMode === "raw" ? resolved.bodyText : "",
    timeoutMs: 60000
  };
}

function loadBridge() {
  const candidates = [
    path.resolve(__dirname, "../../bridges/api-client-bridge/api-client-bridge.cjs")
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  throw new Error("API Client request bridge is unavailable.");
}

async function loadCollection(options) {
  return normalizeCollectionDocument(await readJsonProfile(COLLECTIONS_PROFILE_FILE, createDefaultCollection(), options));
}

async function saveCollection(collection, options) {
  return writeJsonProfile(COLLECTIONS_PROFILE_FILE, normalizeCollectionDocument(collection), options);
}

async function loadEnvironments(options) {
  return normalizeEnvironmentsDocument(await readJsonProfile(ENVIRONMENTS_PROFILE_FILE, createDefaultEnvironments(), options));
}

async function saveEnvironments(environments, options) {
  return writeJsonProfile(ENVIRONMENTS_PROFILE_FILE, normalizeEnvironmentsDocument(environments), options);
}

async function loadMocks(options) {
  const document = await readJsonProfile(MOCKS_PROFILE_FILE, createDefaultMocks(), options);
  return { version: 1, routes: (Array.isArray(document?.routes) ? document.routes : []).map((route) => ({ ...route, id: String(route.id || createId("mock")) })) };
}

async function findSpecFiles(root, options = {}) {
  const results = [];
  async function walk(directory) {
    if (results.length >= 40) return;
    throwIfAborted(options.signal);
    let entries = [];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (_error) {
      return;
    }
    for (const entry of entries) {
      if ([".git", "node_modules", "target", "build", "dist"].includes(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolutePath);
      else if (entry.isFile() && SPEC_FILE_PATTERN.test(entry.name)) results.push(absolutePath);
    }
  }
  if (root) await walk(path.resolve(root));
  return results.map((filePath) => ({ id: `spec:${path.relative(root, filePath).replace(/\\/g, "/")}`, type: "spec", name: path.basename(filePath), path: path.relative(root, filePath).replace(/\\/g, "/") }));
}

function filterAssets(assets, query, type) {
  const needle = String(query || "").trim().toLowerCase();
  const expectedType = String(type || "").trim().toLowerCase();
  return assets.filter((asset) => {
    if (expectedType && asset.type !== expectedType) return false;
    if (!needle) return true;
    return JSON.stringify(asset).toLowerCase().includes(needle);
  });
}

/**
 * Search saved API Client assets and lightweight API spec files.
 */
async function apiAssetSearch(root, args = {}, options = {}) {
  const collection = await loadCollection(options);
  const environments = await loadEnvironments(options);
  const mocks = await loadMocks(options);
  const assets = collectCollectionAssets(collection.root)
    .concat(environments.environments.map((environment) => ({ id: `environment:${environment.id}`, type: "environment", name: environment.name, variableCount: environment.variables.length })))
    .concat(mocks.routes.map((route) => ({ id: `mock:${route.id}`, type: "mock", name: route.name || route.path || route.url, method: route.method, path: route.path || route.url })))
    .concat(await findSpecFiles(root, options));
  const matches = filterAssets(assets, args.query, args.type).slice(0, Math.max(1, Math.min(Number(args.maxResults || 20), 100)));
  return { assetCount: matches.length, assets: matches };
}

/**
 * Fetch one saved API Client asset by agent asset id.
 */
async function apiAssetGet(root, args = {}, options = {}) {
  const id = String(args.id || "");
  if (id.startsWith("request:") || id.startsWith("folder:")) {
    const collection = await loadCollection(options);
    const match = findNodeById(collection.root, id.split(":").slice(1).join(":"));
    if (!match) throw new Error("API asset was not found.");
    return redactValue(match.node);
  }
  if (id.startsWith("environment:")) {
    const environments = await loadEnvironments(options);
    const environment = environments.environments.find((item) => item.id === id.slice("environment:".length));
    if (!environment) throw new Error("Environment was not found.");
    return { ...environment, variables: environment.variables.map(maskVariable) };
  }
  if (id.startsWith("spec:")) {
    const filePath = path.resolve(root, id.slice("spec:".length));
    const content = await fs.readFile(filePath, "utf8");
    return { id, type: "spec", path: path.relative(root, filePath).replace(/\\/g, "/"), content: redactText(content.slice(0, Number(args.maxChars || 12000))).redacted };
  }
  if (id.startsWith("mock:")) {
    const mocks = await loadMocks(options);
    const route = mocks.routes.find((item) => item.id === id.slice("mock:".length));
    if (!route) throw new Error("Mock route was not found.");
    return redactValue(route);
  }
  throw new Error("Unsupported API asset id.");
}

/**
 * Create a saved API Client request.
 */
async function requestCreate(_root, args = {}, options = {}) {
  const collection = await loadCollection(options);
  const parentMatch = resolveFolderParent(collection, args.parentId);
  const request = normalizeRequestNode(args.request || args);
  if (!REQUEST_METHODS.has(request.method)) throw new Error(`Unsupported method: ${request.method}`);
  parentMatch.node.children.push(request);
  await saveCollection(collection, options);
  return { changed: true, request: redactValue(request) };
}

/**
 * Update a saved API Client request.
 */
async function requestUpdate(_root, args = {}, options = {}) {
  const collection = await loadCollection(options);
  const requestId = String(args.requestId || args.id || "");
  const match = findNodeById(collection.root, requestId);
  if (!match?.node || match.node.type !== "request") throw new Error("Saved request was not found.");
  Object.assign(match.node, normalizeRequestNode({ ...match.node, ...(args.patch || args.request || {}) }), { id: requestId, type: "request" });
  await saveCollection(collection, options);
  return { changed: true, request: redactValue(match.node) };
}

/**
 * Send a saved or inline API Client request through the existing request bridge.
 */
async function requestSend(_root, args = {}, options = {}) {
  const collection = await loadCollection(options);
  const environments = await loadEnvironments(options);
  const request = args.request || findNodeById(collection.root, String(args.requestId || ""))?.node;
  if (!request) throw new Error("Request is required.");
  const result = await loadBridge().sendRequest(requestToPayload(request, environments, args.environmentId));
  const history = await readJsonProfile(RECENT_HISTORY_PROFILE_FILE, { version: 1, entries: [] }, options);
  const entries = Array.isArray(history?.entries) ? history.entries : [];
  entries.unshift({ request: normalizeRequestNode(request), result: redactValue(result), error: result.ok === false ? result.error : null });
  await writeJsonProfile(RECENT_HISTORY_PROFILE_FILE, { version: 1, entries: entries.slice(0, 50) }, options);
  return redactValue(result);
}

/**
 * Read compact, redacted recent request history.
 */
async function requestHistoryGet(_root, args = {}, options = {}) {
  const history = await readJsonProfile(RECENT_HISTORY_PROFILE_FILE, { version: 1, entries: [] }, options);
  const maxEntries = Math.max(1, Math.min(Number(args.maxEntries || 10), 50));
  return { entries: redactValue((Array.isArray(history.entries) ? history.entries : []).slice(0, maxEntries)) };
}

/**
 * Explain common API response outcomes without calling another model.
 */
async function responseAnalyze(_root, args = {}, options = {}) {
  const response = args.response || (await requestHistoryGet("", { maxEntries: 1 }, options)).entries?.[0]?.result?.response || {};
  const status = Number(response.statusCode || response.status || 0);
  const category = status >= 500 ? "server_error" : status >= 400 ? "client_error" : status >= 300 ? "redirect" : status >= 200 ? "success" : "network_or_missing_response";
  const recommendation = category === "client_error" ? "Check URL, auth, headers, request body, and environment variables."
    : category === "server_error" ? "Check server logs, retry behavior, upstream dependencies, and payload shape."
      : category === "redirect" ? "Verify the resolved URL and whether redirects are expected."
        : category === "success" ? "Response succeeded; validate body shape and required fields next."
          : "No HTTP status was available; inspect network errors, DNS, TLS, or timeout settings.";
  return { status, category, evidence: redactValue(response), recommendation };
}

/**
 * Read environments with secret values masked.
 */
async function environmentGet(_root, args = {}, options = {}) {
  const environments = await loadEnvironments(options);
  if (args.environmentId) {
    const environment = environments.environments.find((item) => item.id === args.environmentId);
    if (!environment) throw new Error("Environment was not found.");
    return { ...environment, variables: environment.variables.map(maskVariable) };
  }
  return { ...environments, globals: environments.globals.map(maskVariable), environments: environments.environments.map((environment) => ({ ...environment, variables: environment.variables.map(maskVariable) })) };
}

/**
 * Update globals or one environment's variables.
 */
async function environmentUpdate(_root, args = {}, options = {}) {
  const environments = await loadEnvironments(options);
  const variables = (Array.isArray(args.variables) ? args.variables : []).map(normalizeVariable);
  if (args.scope === "globals") {
    environments.globals = variables;
  } else {
    const environment = environments.environments.find((item) => item.id === args.environmentId);
    if (!environment) throw new Error("Environment was not found.");
    environment.variables = variables;
  }
  await saveEnvironments(environments, options);
  return { changed: true, environments: await environmentGet("", {}, options) };
}

/**
 * Resolve variables for text or request fields and return only redacted output.
 */
async function environmentResolve(_root, args = {}, options = {}) {
  const environments = await loadEnvironments(options);
  const variables = createVariableMap(environments, args.environmentId);
  const missing = new Set();
  const source = args.request || { text: args.text || "" };
  const resolved = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, typeof value === "string" ? resolveTextVariables(value, variables, missing) : value]));
  return { resolved: redactValue(resolved), missingVariables: Array.from(missing) };
}

/**
 * Redact secrets and PII from text or structured values.
 */
async function secretRedact(_root, args = {}) {
  const source = typeof args.value === "undefined" ? args.text : args.value;
  if (typeof source === "string") return redactText(source);
  return { redacted: redactValue(source), findings: [] };
}

/**
 * Create a lightweight saved mock route.
 */
async function mockCreate(_root, args = {}, options = {}) {
  const mocks = await loadMocks(options);
  const route = { id: createId("mock"), name: String(args.name || "Mock Route"), method: String(args.method || "GET").toUpperCase(), path: String(args.path || args.url || "/"), statusCode: Number(args.statusCode || 200), headers: args.headers || { "content-type": "application/json" }, body: String(args.body ?? "{}"), createdAt: new Date().toISOString() };
  mocks.routes.unshift(route);
  await writeJsonProfile(MOCKS_PROFILE_FILE, mocks, options);
  return { changed: true, mock: redactValue(route) };
}

/**
 * Update one lightweight saved mock route.
 */
async function mockUpdate(_root, args = {}, options = {}) {
  const mocks = await loadMocks(options);
  const route = mocks.routes.find((item) => item.id === args.mockId || item.id === args.id);
  if (!route) throw new Error("Mock route was not found.");
  Object.assign(route, args.patch || {});
  await writeJsonProfile(MOCKS_PROFILE_FILE, mocks, options);
  return { changed: true, mock: redactValue(route) };
}

/**
 * Call a lightweight saved mock route by id or method/path match.
 */
async function mockCall(_root, args = {}, options = {}) {
  const mocks = await loadMocks(options);
  const method = String(args.method || "GET").toUpperCase();
  const route = mocks.routes.find((item) => item.id === args.mockId || item.id === args.id)
    || mocks.routes.find((item) => String(item.method || "GET").toUpperCase() === method && String(item.path || item.url || "") === String(args.path || args.url || ""));
  if (!route) throw new Error("Mock route was not found.");
  return { ok: true, elapsedMs: 0, response: redactValue({ statusCode: route.statusCode || 200, statusMessage: "Mock", headers: route.headers || {}, body: route.body || "" }) };
}

module.exports = {
  apiAssetGet,
  apiAssetSearch,
  environmentGet,
  environmentResolve,
  environmentUpdate,
  mockCall,
  mockCreate,
  mockUpdate,
  requestCreate,
  requestHistoryGet,
  requestSend,
  requestUpdate,
  responseAnalyze,
  secretRedact,
  _test: { getProfilePath, redactText, redactValue }
};
